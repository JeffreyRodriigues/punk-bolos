-- ============================================================
-- PUNK BOLOS — Migração: controle de estoque (incremental)
-- ------------------------------------------------------------
-- Aplicar no SQL Editor do Supabase (dev e, depois, produção).
-- Como o schema original já existe nesses bancos, esta migração
-- é ADITIVA e idempotente (pode rodar mais de uma vez):
--   - novas colunas em orders/products
--   - nova tabela productions (log de produção)
--   - políticas RLS da nova tabela
-- ============================================================

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

alter table public.productions enable row level security;

do $$
begin
  create policy "productions_select_auth" on public.productions
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "productions_insert_auth" on public.productions
    for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "productions_update_auth" on public.productions
    for update to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "productions_delete_auth" on public.productions
    for delete to authenticated using (true);
exception when duplicate_object then null;
end $$;
