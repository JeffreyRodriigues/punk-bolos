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
