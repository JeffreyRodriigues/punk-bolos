# Punk Bolos — Melhorias Implementadas

Registro das correções, evoluções e melhorias aplicadas ao sistema ao longo do desenvolvimento.

---

## Correções de bugs

### 1. Modal não abria ao clicar no botão "＋"
- **Problema:** em qualquer navegador, o modal de novo pedido não abria.
- **Causa raiz:** a linha `saborInput.list = 'lista-sabores'` tentava atribuir valor à propriedade `.list` de `HTMLInputElement`, que é **somente leitura** (getter-only). Isso lançava `TypeError: Cannot set property list of #<HTMLInputElement> which has only a getter` na criação da primeira linha de item, travando a abertura do modal.
- **Correção:** usar `saborInput.setAttribute('list', 'lista-sabores')` (vínculo correto com o `<datalist>`).
- **Observação:** o bug só aparecia no navegador real; os testes com DOM simulado em Node não detectavam. A partir daí os testes passaram a incluir **navegador headless** (Chrome).

### 2. Títulos dos cards do dashboard sumiam
- **Problema:** ao renderizar, o texto era escrito no card inteiro, apagando os títulos ("Receita", "Pedidos", etc.).
- **Correção:** `setStat` agora grava **apenas** no elemento `.stat-value`, preservando ícone e `.stat-label`.

### 3. Duplicar pedido mantinha o status original
- **Problema:** pedidos duplicados herdavam o status do original (ex.: "Concluído").
- **Correção:** `duplicateOrder` **sempre reinicia o status para "Pendente"**.

### 4. Variável CSS usada mas nunca definida
- **Problema:** `--color-on-primary` era referenciada em `styles.css` mas não existia em `themes.css`.
- **Correção:** definida nos dois temas (claro e escuro).

---

## Evoluções de funcionalidade

### 5. Múltiplos produtos por pedido
- **Antes:** o pedido tinha **um único tipo de produto** (Fatia / Punkitos / Bolo Inteiro) e uma lista de sabores.
- **Agora:** cada **item** do pedido é um produto completo: `{ tipoProduto, tamanho, sabor, quantidade, valorUnitario }`.
- Um único pedido pode misturar, ex.: `2× Punkitos (Chocolate) · 1× Bolo Inteiro G (Cenoura) · 3× Fatia (Red Velvet)`.
- O campo **Tamanho** ficou por item (aparece só para "Bolo Inteiro").
- Impacto em todos os módulos: `order.js` (validação/totais), `orderForm.js` (linhas com selects), `orderList.js` (descrição e filtro por item), `dashboard.js` (quantidades por tipo somadas por item) e `index.html`/CSS.

### 6. Migração automática de pedidos antigos
- Pedidos salvos em formatos anteriores são convertidos ao carregar (`storage.migrateOrder`):
  - **Formato intermediário:** itens sem `tipoProduto` — cada item herda o tipo/tamanho do pedido.
  - **Formato antigo:** pedido sem `itens` (sabor/quantidade/valor diretos) — vira um item com o tipo do pedido.

### 7. Filtro por período de datas (compartilhado)
- Nova barra de período abaixo da navegação: presets **Hoje / 7 dias / Este mês / Tudo** + faixa livre **De/Até**.
- Filtra **simultaneamente** o dashboard (receita, contagens, quantidades por produto, ticket) e a lista de pedidos.
- Estado persistido em `punkbolos.config` (`periodo`) e destaque do preset ativo.
- Novo módulo: `js/modules/dateFilter.js`.

---

## Qualidade e manutenção

### 8. Cache-busting
- Versão `?v=2` → `?v=3` → `?v=4` nos links de CSS/JS do `index.html` para evitar que o navegador use arquivos antigos em cache.

### 9. Testes automatizados
- **Testes unitários (Node):**
  - Modelo e regras (`order.js`): normalização, totais, validação, `quantityByType` — **22/22 OK**.
  - Filtro por período (`dateFilter.js`): presets, faixa manual, persistência — **11/11 OK**.
  - Integração (`app.js` + módulos com DOM simulado): inicialização, FAB, abertura do modal, linhas de item — **7/7 OK**.
- **Testes E2E em navegador real (Chrome headless):**
  - Fluxo completo: criar pedido misto, salvar, card com descrição, dashboard com quantidades por tipo, filtros por produto.
  - Filtro por período em ambas as telas (sem filtro 3 → 7 dias 2 → hoje 1 → faixa manual 1 → tudo 3).

### 10. Detecção de erros que só ocorrem no navegador
- Passou a usar **navegador headless** nos testes, capturando `TypeError` de propriedades read-only do DOM (como o bug do `.list`) que mocks de Node não reproduzem.
