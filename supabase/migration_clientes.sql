-- ============================================================
-- PUNK BOLOS — Migração: Gestão de Clientes & CRM (incremental)
-- ------------------------------------------------------------
-- Aplicar no SQL Editor do Supabase (dev e, depois, produção).
-- Migração ADITIVA e idempotente:
--   - nova tabela customers (catálogo de clientes, contato, aniversário e preferências)
--   - políticas RLS para usuários autenticados
-- ============================================================

/* ---------- Tabela: customers (clientes) ---------- */

create table if not exists public.customers (
  id              text primary key,
  nome            text not null,
  contato         text not null default '',
  data_nascimento date,
  endereco        text not null default '',
  observacoes     text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists customers_nome_idx on public.customers (nome);
create index if not exists customers_data_nascimento_idx on public.customers (data_nascimento);

/* ---------- Row Level Security ---------- */

alter table public.customers enable row level security;

do $$
begin
  create policy "customers_select_auth" on public.customers
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "customers_insert_auth" on public.customers
    for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "customers_update_auth" on public.customers
    for update to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "customers_delete_auth" on public.customers
    for delete to authenticated using (true);
exception when duplicate_object then null;
end $$;
