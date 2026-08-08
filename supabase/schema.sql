-- ============================================================
-- PUNK BOLOS — Schema do Supabase (PostgreSQL)
-- ------------------------------------------------------------
-- Executar no SQL Editor do Supabase (Dashboard → SQL Editor).
-- Cria as tabelas de pedidos e produtos + regras de segurança
-- (RLS): somente usuários autenticados (os 3 administradores)
-- conseguem ler e escrever.
-- ============================================================

-- ---------- Tabela: pedidos ----------
create table if not exists public.orders (
  id          text primary key,
  numero      bigint not null,
  data        date,
  cliente     text not null,
  contato     text not null default '',
  itens       jsonb not null default '[]'::jsonb,
  quantidade  bigint not null default 0,
  valor_total numeric not null default 0,
  status      text not null default 'Pendente',
  pagamento   text not null default 'PIX',
  entrega     text not null default 'Retirada',
  observacoes text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists orders_numero_idx on public.orders (numero desc);

-- ---------- Tabela: produtos (catálogo) ----------
create table if not exists public.products (
  id          text primary key,
  titulo      text not null,
  tipo_produto text not null default 'Fatia',
  tamanho     text not null default '',
  valor       numeric not null default 0,
  detalhes    text not null default '',
  controla_estoque boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Controle de estoque: "consome_estoque" marca os pedidos criados DEPOIS
-- da ativação do recurso (pedidos históricos/importados ficam false e não
-- abatem o estoque). "productions" guarda o log de produção por produto.
alter table public.orders add column if not exists consome_estoque boolean not null default false;
alter table public.products add column if not exists controla_estoque boolean not null default false;

create table if not exists public.productions (
  id          text primary key,
  produto_id  text not null,
  quantidade  bigint not null default 0,
  data        date not null,
  observacao  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists productions_produto_idx on public.productions (produto_id);
create index if not exists productions_data_idx on public.productions (data);

-- ---------- Segurança (Row Level Security) ----------
alter table public.orders       enable row level security;
alter table public.products     enable row level security;
alter table public.productions  enable row level security;

create policy "orders_select_auth" on public.orders
  for select to authenticated using (true);

create policy "orders_insert_auth" on public.orders
  for insert to authenticated with check (true);

create policy "orders_update_auth" on public.orders
  for update to authenticated using (true);

create policy "orders_delete_auth" on public.orders
  for delete to authenticated using (true);

create policy "products_select_auth" on public.products
  for select to authenticated using (true);

create policy "products_insert_auth" on public.products
  for insert to authenticated with check (true);

create policy "products_update_auth" on public.products
  for update to authenticated using (true);

create policy "products_delete_auth" on public.products
  for delete to authenticated using (true);

create policy "productions_select_auth" on public.productions
  for select to authenticated using (true);

create policy "productions_insert_auth" on public.productions
  for insert to authenticated with check (true);

create policy "productions_update_auth" on public.productions
  for update to authenticated using (true);

create policy "productions_delete_auth" on public.productions
  for delete to authenticated using (true);
