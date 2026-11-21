-- ============================================================
-- PUNK BOLOS — Migração: Sincronização em Tempo Real (Realtime)
-- ------------------------------------------------------------
-- Aplicar no SQL Editor do Supabase (Dashboard → SQL Editor).
--
-- 1. Inclui a tabela `orders` na publicação `supabase_realtime`
--    para que inserções, atualizações e exclusões sejam
--    transmitidas via WebSocket para o painel em tempo real.
-- 2. Define REPLICA IDENTITY FULL para que updates e deletes
--    contenham todos os dados anteriores do pedido.
-- ============================================================

-- 1. Habilita a tabela orders na publicação do Supabase Realtime
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

-- 2. Define réplica completa para entregar o registro antigo em updates/deletes
alter table public.orders replica identity full;
