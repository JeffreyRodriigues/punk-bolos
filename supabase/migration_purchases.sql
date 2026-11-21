-- ============================================================
-- PUNK BOLOS — Migração: Tabela de Compras em Lote (Purchases)
-- ------------------------------------------------------------
-- Aplicar no SQL Editor do Supabase (Dashboard → SQL Editor).
-- Cria a tabela public.purchases e suas políticas de segurança (RLS).
-- ============================================================

create table if not exists public.purchases (
  id              text primary key,
  codigo          text not null,
  data            date not null,
  fornecedor      text not null default '',
  forma_pagamento text not null default 'PIX',
  observacoes     text not null default '',
  itens           jsonb not null default '[]'::jsonb,
  valor_total     numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists purchases_codigo_idx on public.purchases (codigo);
create index if not exists purchases_data_idx on public.purchases (data desc);

-- Segurança (RLS): apenas administradores autenticados podem ler e escrever
alter table public.purchases enable row level security;

do $$
begin
  create policy "purchases_select_auth" on public.purchases
    for select to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "purchases_insert_auth" on public.purchases
    for insert to authenticated with check (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "purchases_update_auth" on public.purchases
    for update to authenticated using (true);
exception when duplicate_object then null;
end $$;

do $$
begin
  create policy "purchases_delete_auth" on public.purchases
    for delete to authenticated using (true);
exception when duplicate_object then null;
end $$;
