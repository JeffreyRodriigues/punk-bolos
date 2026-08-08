# Punk Bolos — Melhorias Implementadas

Registro das correções, evoluções e melhorias aplicadas ao sistema ao longo do desenvolvimento.

---

## Correções de bugs

### 1. Modal não abria ao clicar no botão "＋"
- **Problema:** em qualquer navegador, o modal de novo pedido não abria.
- **Causa raiz:** `saborInput.list = 'lista-sabores'` tentava atribuir valor à propriedade read-only `.list` de `HTMLInputElement`, lançando `TypeError`. Só aparecia no navegador real; testes com DOM simulado em Node não detectavam.
- **Correção:** usar `saborInput.setAttribute('list', 'lista-sabores')`. A partir daí os testes passaram a incluir **navegador headless** (Chrome).

### 2. Títulos dos cards do dashboard sumiam
- **Problema:** ao renderizar, o texto era escrito no card inteiro, apagando lendas.
- **Correção:** `setStat` grava apenas no `.stat-value`, preservando ícone e `.stat-label`.

### 3. Duplicar pedido mantinha o status original
- **Problema:** pedidos duplicados herdavam o status do original (ex.: "Concluído").
- **Correção:** `duplicateOrder` **sempre reinicia o status para "Pendente"**.

### 4. Variável CSS usada mas nunca definida
- **Problema:** `--color-on-primary` era referenciada em `styles.css` mas não existia em `themes.css`.
- **Correção:** definida nos dois temas (claro e escuro).

### 5. Produto em edição resolvido pelo produto errado
- **Problema:** ao editar um pedido, itens com mesmo preço eram casados com o produto errado do catálogo.
- **Correção:** resolução prioriza o **`produtoId`** (novo formato) e usa o **título** para desempatar no casador por tipo+tamanho+valor (`product.matchProduct`).

### 6. Estoque parando no seletor ao editar
- **Problema:** ao editar um pedido, o selo de produto do item podia sumir da listagem (por ter 0 de disponível).
- **Correção:** ao editar, o produto do item atual é **sempre** incluído no seletor (`requiredId`), descontando a própria reserva (`excludeOrderId`).

---

## Evoluções de funcionalidade

### 7. Múltiplos produtos por pedido
- **Antes:** um único tipo de produto por pedido e lista de sabores.
- **Agora:** cada **item** é um produto completo `{ tipoProduto, tamanho, sabor, quantidade, valorUnitario }`; um pedido pode misturar ex.: `2× Punkitos (Chocolate) · 1× Bolo Inteiro G (Cenoura) · 3× Fatia (Red Velvet)`.

### 8. Migração automática de pedidos/produtos antigos
- `storage.migrateOrder` converte pedidos em formatos legados (sem `itens` ou itens sem `tipoProduto`); `migrateProduct` converte o formato antigo (`nome/preco`) para o atual (`titulo/valor`).

### 9. Catálogo de produtos (novo)
- Tela **Produtos**: cadastro, edição, exclusão e busca; cada produto tem tipo, tamanho (Bolo Inteiro), título (sabor), valor e detalhes.
- O **valor do pedido vem do catálogo** — nada de digitar preço na hora de escolher sabor.
- Bloqueio de **duplicados** (mesmo tipo + título, tamanho para bolo).

### 10. Filtro por período de datas (compartilhado)
- Barra de período: presets **Hoje / 7 dias / Este mês / Tudo** + faixa **De/Até**.
- Filtra **simultaneamente** dashboard e lista de pedidos; estado persistido.

### 11. Dashboard completo (Punk Bolos 2.0)
- Novo módulo puro `dashboardService.js` (indicadores + agregações + rankings).
- Cards: receita, pedidos, quantidade vendida, ticket médio, lucro bruto e distribuição por status.
- Faturamento por dia e rankings de sabores/produtos com gráficos (Chart.js).

### 12. Autenticação (Supabase Auth)
- Login/logout com e-mail/senha, recuperação de senha via e-mail (PKCE).
- Sessão válida exigida; token expirado redireciona ao login automaticamente.
- Apenas os **3 administradores** (cadastrados no painel do Supabase) acessam o sistema.

### 13. Nuvem / sincronização (Supabase)
- `storage.js` vira camada unificada: cache em memória + LocalStorage + Supabase.
- Escritas **diferenciais** (insere/atualiza/exclui só o que mudou); backup local sempre; **reconciliação** offline→online no `init()`; migração inicial automática dos dados antigos do LocalStorage para a nuvem.

### 14. Controle de estoque (produção)
- Novo módulo `estoque.js` + tela **Produção** (`estoqueView.js`).
- Modelo **derivado**: `disponível = produzido − reservado − vendido` — sem contador que dessincroniza.
- **Produção obrigatória para vender**: sem produção suficiente, o pedido é bloqueado (criar ou editar) com mensagem clara; cancelado libera o estoque.
- Seletor de itens mostra **somente produtos disponíveis**; histórico de produção com exclusão; badges de saldo.
- Migração SQL `supabase/migration_estoque.sql` (colunas + tabela `productions` + RLS).

### 15. Planilha (CSV) de pedidos
- **Exportar** CSV compatível com Excel (separador `;`, BOM UTF-8), uma linha por item.
- **Importar** com detecção automática do cabeçalho, normalização de rótulos/enums (ex.: "Bolo"→"Bolo Inteiro", "Uber pelo cliente" → "Uber Cliente", "gratis" → "Cortesia"), **criação automática de produtos** no catálogo e **dry-run** de pré-visualização.
- Importados recebem `consomeEstoque = false` (não afetam o estoque).

### 16. Forma de pagamento Cortesia
- Novo método **Cortesia** zera o `valorTotal` do pedido (pedido grátis) em `order.orderTotalValue` e no modal (`recalcTotal`). Reconhece alias "grátis/gratuito" na importação.

### 17. Menu de navegação reorganizado
- Aba "Início" renomeada para **Dashboard** e a ordem ajustada para: **Dashboard, Produtos, Produção, Pedidos**.

---

## Segurança

- **Chave do Supabase fora do código versionado**: valores reais são injetados pelo `server.js` em `js/config.js` a partir de `.env` (local) ou env vars (Render); a `anon key` do Supabase é pública por design, com proteção via **RLS** do banco.
- **RLS** em `orders`, `products` e `productions`: somente usuários autenticados leem/escrevem.

---

## Performance

### 18. Otimização de inicial (mobile)
- **Logo otimizado:** `logo.png` 493 KB → **29 KB** (180×160) + `logo.webp` 3.5 KB usado via `<picture>` com `fetchpriority="high"` e dimensões explícitas; original preservado em `docs/logo-original-1179x1047.png`.
- **Fonte Quicksand assíncrona:** `@import` removido; `<link>` com `preconnect`, `media="print" onload` e `display=optional` — sem render-blocking.
- **CSS inline no HTML** via `tools/build-css.js` (marcadores `CSS_INLINE:START/END`) — elimina o bloqueio de renderização do CSS externo.
- **Cache inteligente no servidor:** HTML sem cache; arquivos `?v=NN` imutáveis por 1 ano em produção (bump de versão forçando atualização); módulos ES6 revalidam via **ETag** (304).
- **Compressão gzip/brotli** em produção.
- Resultado (Lighthouse mobile local): **94**, LCP ~2.5s, FCP ~2.4s, TBT ~29ms, **CLS 0.000**.

---

## Qualidade e manutenção

### 19. Testes automatizados (TDD)
- Suite com **node:test** (124/124 verdes): `order`, `product`, `estoque`, `dashboard`, `dateRange`, `describe`, `money`, `importExport`, helpers de storage mock.
- Regras de negócio em **funções puras** (sem DOM) para testes determinísticos; testes de integração com **navegador headless** (Chrome) para flagship de erros DOM read-only.

### 20. Servidor padrão da planilha
- `server.js`: servidor estático **Node puro** (sem dependências) com MIME, cache, ETag, compressão, proteção contra path traversal e injeção de env no `js/config.js`. Substitui o `npx serve`.

---

> **Nota:** o histórico antigo destes documentos fica preservado no git (versões anteriores da branch `main`).