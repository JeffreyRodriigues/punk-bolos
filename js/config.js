/* ============================================================
   CONFIG.JS — Configuração do Supabase (banco de dados na nuvem)
   ------------------------------------------------------------
   Segurança: este arquivo NÃO contém a chave de acesso. Os valores
   reais são injetados pelo servidor (server.js) a partir de
   variáveis de ambiente:

   - Local: crie um arquivo `.env` na raiz do projeto com:
       SUPABASE_URL=https://seu-projeto.supabase.co
       SUPABASE_ANON_KEY=sua_anon_key
     (o arquivo .env é ignorado pelo git)
   - Produção (Render): painel do Render → seu serviço →
     Environment → New variable: SUPABASE_URL e SUPABASE_ANON_KEY.

   Sem as variáveis, a chave fica vazia e o app exibe "configuração
   ausente". A anon key do Supabase é pública por design (a proteção
   real vem do RLS do banco), mas assim ela não fica versionada.
   ============================================================ */

export const CONFIG = {
  supabaseUrl: 'https://xzkcbygjxvcevoqblneo.supabase.co',
  supabaseAnonKey: '',
};
