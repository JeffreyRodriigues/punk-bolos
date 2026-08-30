# AGENTS.md

Este repositório é a aplicação web **Punk Bolos** (planejador de produção + app de
pedidos), hospedada no Render com backend Supabase. Veja `docs/` para detalhes
(`GUIA_RAPIDO.md`, `PRECIFICACAO.md`, `SUPABASE_SETUP.md`).

## Regra obrigatória antes de qualquer mudança

**NUNCA altere, crie ou remova arquivos do projeto (código, CSS, HTML, config, dados)
sem antes perguntar e receber confirmação explícita do usuário.**

Mesmo quando o usuário pede uma funcionalidade, confirme o escopo/abordagem antes de
executar. A única exceção é a manutenção deste próprio `AGENTS.md` quando o usuário
solicita a regra.

**Funcionalidades existentes são intocáveis por padrão.** Nunca altere algo que já
funciona (fluxo, lógica, comportamento de UI) a menos que o usuário solicite
explicitamente. Quando solicitado, pergunte o motivo da mudança e, se houver uma
abordagem melhor, apresente-a como sugestão antes de executar o que foi pedido.

**Deploy (git push) exige confirmação prévia.** Antes de executar `git push`, informe
ao usuário quais arquivos serão enviados e a mensagem do commit, e aguarde aprovação
explícita. Nunca faça push sem essa confirmação.

## Comandos essenciais

- `node tools/build-css.js` — compila `css/themes.css` + `css/styles.css` +
  `css/responsive.css` para dentro do `<style>` inline em `index.html` e `login.html`
  (o app usa CSS inline, não arquivos externos). Sempre rode após editar qualquer CSS.
- `git add -A; git commit -m "..."; git push` — deploy automático no Render após push.

## Convenções

- Código em PT-BR (comentários curtos, apenas quando pedido).
- Cache-buster `?v=` nas tags `<script>` de `js/app.js` e imports — incrementar ao
  mudar JS para forçar refetch no celular (hard refresh também resolve).
- Mobile: telas ≤768px ocultam as abas Inventário e Precificação (classe
  `nav-tab--mobile-hidden`); desktop mostra todas as 6 abas.
- Não introduzir bibliotecas externas sem consultar o usuário.
