-- ============================================================
-- PUNK BOLOS — Migração: inventário + precificação (incremental)
-- ------------------------------------------------------------
-- Aplicar no SQL Editor do Supabase (dev e, depois, produção).
-- Migração ADITIVA e idempotente (pode rodar mais de uma vez):
--   - nova tabela insumos (catálogo de insumos + histórico de compras)
--   - nova tabela precificacoes (receita/custo por unidade por produto)
--   - políticas RLS das novas tabelas
--
-- Modelo de dados (espelha js/modules/inventory.js e pricing.js):
--   insumos.compras  -> JSONB (histórico de compras do insumo)
--   precificacoes.itens -> JSONB (insumos da receita)
-- ============================================================

/* ---------- Tabela: insumos (inventário) ---------- */

create table if not exists public.insumos (
  id          text primary key,
  nome        text not null,
  unidade     text not null default 'unidade',
  descricao   text not null default '',
  compras     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists insumos_nome_idx on public.insumos (nome);

/* ---------- Tabela: precificacoes (1 por produto) ---------- */

create table if not exists public.precificacoes (
  id                   text primary key,
  produto_id           text not null unique,
  itens                jsonb not null default '[]'::jsonb,
  margem               numeric not null default 25,
  multiplicador        numeric not null default 3,
  rendimento           numeric not null default 10,
  embalagem            numeric not null default 1,
  custo_adicional      numeric not null default 0,
  custo_adicional_obs  text not null default '',
  data_calculo         date,
  custo_ingredientes   numeric,
  custo_por_unidade    numeric,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists precificacoes_produto_idx on public.precificacoes (produto_id);

/* ---------- Row Level Security ---------- */

alter table public.insumos enable row level security;
alter table public.precificacoes enable row level security;

do $$
begin
  create policy "insumos_select_auth" on public.insumos
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "insumos_insert_auth" on public.insumos
    for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "insumos_update_auth" on public.insumos
    for update to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "insumos_delete_auth" on public.insumos
    for delete to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "precificacoes_select_auth" on public.precificacoes
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "precificacoes_insert_auth" on public.precificacoes
    for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "precificacoes_update_auth" on public.precificacoes
    for update to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "precificacoes_delete_auth" on public.precificacoes
    for delete to authenticated using (true);
exception when duplicate_object then null;
end $$;
