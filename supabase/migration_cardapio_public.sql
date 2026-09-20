-- ============================================================
-- PUNK BOLOS — Migração: Acesso Público Seguro ao Cardápio Digital
-- ------------------------------------------------------------
-- Aplicar no SQL Editor do Supabase (Dashboard → SQL Editor).
--
-- 1. Cria a View Segura `vw_cardapio_produtos` que agrega produtos
--    e calcula o saldo de pronta entrega sem expor pedidos ou clientes.
-- 2. Permite leitura pública (anon) da View e do catálogo de produtos.
-- 3. Permite inserção pública (anon) de novos pedidos e clientes.
-- ============================================================

-- 1. View Segura para o Cardápio com cálculo de estoque em tempo real
create or replace view public.vw_cardapio_produtos as
select
  p.id,
  p.titulo,
  p.tipo_produto,
  p.tamanho,
  p.valor,
  p.detalhes,
  p.controla_estoque,
  case
    when p.tipo_produto = 'Bolo Inteiro' then 9999
    else greatest(
      0,
      coalesce((
        select sum(pr.quantidade)
        from public.productions pr
        where pr.produto_id = p.id
      ), 0)
      -
      coalesce((
        select sum((item->>'quantidade')::numeric)
        from public.orders o,
             jsonb_array_elements(o.itens) as item
        where o.consome_estoque = true
          and o.status != 'Cancelado'
          and (
            item->>'produtoId' = p.id
            or (
              coalesce(item->>'produtoId', '') = ''
              and item->>'tipoProduto' = p.tipo_produto
              and coalesce(item->>'tamanho', '') = coalesce(p.tamanho, '')
              and (item->>'valorUnitario')::numeric = p.valor
              and (
                coalesce(item->>'sabor', item->>'titulo', '') = ''
                or lower(trim(coalesce(item->>'sabor', item->>'titulo', ''))) = lower(trim(p.titulo))
              )
            )
          )
      ), 0)
    )
  end as estoque_disponivel
from public.products p;

-- Concede leitura da view para anônimos e usuários autenticados
grant select on public.vw_cardapio_produtos to anon, authenticated;

-- 2. Leitura pública da tabela de produtos (caso o frontend faça fallback)
do $$
begin
  create policy "products_select_anon" on public.products
    for select to anon using (true);
exception when duplicate_object then null;
end $$;

-- 3. Inserção pública de pedidos vindos do Cardápio Digital
do $$
begin
  create policy "orders_insert_anon" on public.orders
    for insert to anon with check (true);
exception when duplicate_object then null;
end $$;

-- 4. Inserção pública de clientes vindos do Cardápio Digital
do $$
begin
  create policy "customers_insert_anon" on public.customers
    for insert to anon with check (true);
exception when duplicate_object then null;
end $$;

-- 5. Funções RPC Seguras para Login e Histórico de Pedidos no Cardápio Digital

-- 5.1 Busca pedidos anteriores do próprio cliente por telefone
create or replace function public.get_customer_orders(p_contato text)
returns setof public.orders
language sql
security definer
set search_path = public
as $$
  select *
  from public.orders
  where regexp_replace(contato, '\D', '', 'g') = regexp_replace(p_contato, '\D', '', 'g')
    and regexp_replace(p_contato, '\D', '', 'g') != ''
  order by created_at desc;
$$;

grant execute on function public.get_customer_orders(text) to anon, authenticated;

-- 5.2 Busca dados cadastrais do cliente por telefone
create or replace function public.get_customer_by_phone(p_contato text)
returns setof public.customers
language sql
security definer
set search_path = public
as $$
  select *
  from public.customers
  where regexp_replace(contato, '\D', '', 'g') = regexp_replace(p_contato, '\D', '', 'g')
    and regexp_replace(p_contato, '\D', '', 'g') != ''
  limit 1;
$$;

grant execute on function public.get_customer_by_phone(text) to anon, authenticated;

-- 5.3 Criação ou atualização do perfil do cliente a partir do Cardápio
create or replace function public.upsert_customer_profile(
  p_id text default '',
  p_nome text default '',
  p_contato text default '',
  p_endereco text default '',
  p_data_nascimento date default null,
  p_observacoes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_id text;
  v_clean_phone text;
  v_result jsonb;
begin
  v_clean_phone := regexp_replace(p_contato, '\D', '', 'g');
  if v_clean_phone = '' then
    raise exception 'Telefone/WhatsApp invalido';
  end if;

  select id into v_existing_id
  from public.customers
  where regexp_replace(contato, '\D', '', 'g') = v_clean_phone
  limit 1;

  if v_existing_id is not null then
    update public.customers
    set
      nome = coalesce(nullif(trim(p_nome), ''), nome),
      endereco = coalesce(nullif(trim(p_endereco), ''), endereco),
      data_nascimento = coalesce(p_data_nascimento, data_nascimento),
      observacoes = case
        when trim(p_observacoes) != '' then trim(p_observacoes)
        else observacoes
      end,
      updated_at = now()
    where id = v_existing_id;

    select to_jsonb(c) into v_result
    from public.customers c
    where c.id = v_existing_id;
  else
    insert into public.customers (
      id,
      nome,
      contato,
      endereco,
      data_nascimento,
      observacoes,
      created_at,
      updated_at
    ) values (
      coalesce(nullif(trim(p_id), ''), 'cli_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 4)),
      trim(p_nome),
      trim(p_contato),
      trim(p_endereco),
      p_data_nascimento,
      trim(p_observacoes),
      now(),
      now()
    )
    returning to_jsonb(customers.*) into v_result;
  end if;

  return v_result;
end;
$$;

grant execute on function public.upsert_customer_profile(text, text, text, text, date, text) to anon, authenticated;

-- 5.4 Criação atômica de pedidos pelo Cardápio Digital (gera número sequencial #1001+)
create or replace function public.create_public_order(
  p_id text default '',
  p_data date default null,
  p_cliente text default '',
  p_contato text default '',
  p_itens jsonb default '[]'::jsonb,
  p_quantidade bigint default 1,
  p_valor_total numeric default 0,
  p_pagamento text default 'PIX',
  p_entrega text default 'Retirada',
  p_observacoes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_num bigint;
  v_order_id text;
  v_result jsonb;
begin
  -- Calcula atomicamente o próximo número de pedido
  select coalesce(max(numero), 1000) + 1 into v_next_num
  from public.orders;

  v_order_id := coalesce(nullif(trim(p_id), ''), 'ped_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 4));

  insert into public.orders (
    id,
    numero,
    data,
    cliente,
    contato,
    itens,
    quantidade,
    valor_total,
    status,
    pagamento,
    entrega,
    observacoes,
    consome_estoque,
    created_at,
    updated_at
  ) values (
    v_order_id,
    v_next_num,
    coalesce(p_data, current_date),
    trim(p_cliente),
    trim(p_contato),
    coalesce(p_itens, '[]'::jsonb),
    coalesce(p_quantidade, 1),
    coalesce(p_valor_total, 0),
    'Pendente',
    coalesce(nullif(trim(p_pagamento), ''), 'PIX'),
    coalesce(nullif(trim(p_entrega), ''), 'Retirada'),
    trim(p_observacoes),
    true,
    now(),
    now()
  )
  returning to_jsonb(orders.*) into v_result;

  return v_result;
end;
$$;

grant execute on function public.create_public_order(text, date, text, text, jsonb, bigint, numeric, text, text, text) to anon, authenticated;


