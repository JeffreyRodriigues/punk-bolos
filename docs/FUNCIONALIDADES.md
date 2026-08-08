# Punk Bolos — Funcionalidades do Sistema

Sistema web para gerenciamento de pedidos, catálogo e estoque da confeitaria **Punk Bolos**.

> **Stack:** HTML5 + CSS3 + JavaScript (ES6+, módulos) — **sem frameworks**.
> **Persistência:** LocalStorage (offline) **ou** Supabase na nuvem (sincronizado).
> **Autenticação:** login com e-mail/senha (Supabase Auth) — somente admins.
> **Responsivo:** funciona em celular, tablet e computador.

---

## 1. Visão geral

O sistema organiza o trabalho da confeitaria em abas trocadas pela navegação:

| Tela | Descrição |
|---|---|
| **Dashboard** | Resumo das vendas: receita, pedidos, quantidades por produto, ticket médio, lucro bruto, rankings e faturamento diário. |
| **Produtos** | Catálogo de produtos (título, tipo, tamanho, valor e detalhes). |
| **Produção** | Registro de produção por produto + saldo de estoque (produzido/reservado/vendido/disponível) + histórico. |
| **Pedidos** | Lista de pedidos com busca, filtros e ações (editar, duplicar, excluir, concluir, cancelar). |

Nas telas Dashboard e Pedidos, um **filtro por período de datas** compartilhado controla o que é exibido.

---

## 2. Arquitetura e estrutura de arquivos

```
Punk Bolos/
├── index.html / login.html / reset-password.html  # páginas
├── css/                     # themes.css, styles.css, responsive.css, login.css
├── js/
│   ├── app.js               # Ponto de entrada: navegação, abas, integração
│   ├── config.js            # Config Supabase (chave injetada pelo servidor)
│   └── modules/
│       ├── auth.js          # Autenticação (login/logout/recuperação)
│       ├── supabase.js      # Cliente REST do Supabase (sem dependências)
│       ├── storage.js       # Camada de dados (cache + LocalStorage + sync)
│       ├── order.js         # Modelo do pedido + regras de negócio
│       ├── product.js       # Regras do catálogo de produtos
│       ├── estoque.js       # Regras de estoque (modelo derivado)
│       ├── orderForm.js     # Modal de cadastro/edição de pedido
│       ├── orderList.js     # Lista de pedidos (cards, busca, filtros, ações)
│       ├── estoqueView.js   # Tela de Produção (saldo + histórico)
│       ├── productForm.js   # Modal de cadastro/edição de produto
│       ├── productList.js   # Lista de produtos
│       ├── dashboard.js     # Render do dashboard (integra Chart.js)
│       ├── dashboardService.js # Cálculo puro dos indicadores
│       ├── dateFilter.js    # Filtro por período (presets + De/Até)
│       ├── importExport.js  # Importar/exportar CSV de pedidos
│       └── toast.js         # Notificações
│   └── utils/               # money, theme, dateRange, describe
├── supabase/
│   ├── schema.sql           # Tabelas + RLS (banco novo)
│   └── migration_estoque.sql# Migração incremental (banco existente)
├── test/                    # Testes unitários (node --test) — 124/124
├── tools/build-css.js       # Inline do CSS no HTML (performance)
└── server.js                # Servidor estático (Node puro) + injeção de env
```

**Padrão:** módulos de regras de negócio (`order.js`, `estoque.js`, `dashboardService.js`) são funções **puras** (sem DOM); a camada de UI apenas consome esses dados.

---

## 3. Modelo de dados

### Pedido

```js
{
  id: "t<timestamp>-<random>",    // gerado automaticamente
  numero: 1001,                   // sequencial, nunca repete (começa em 1001)
  data: "2026-08-01",             // YYYY-MM-DD
  cliente: "Maria Silva",
  contato: "(00) 00000-0000",
  itens: [ /* ver abaixo */ ],
  quantidade: 6,                  // soma das quantidades dos itens
  valorTotal: 103.50,             // soma de (quantidade × valorUnitario)
  status: "Pendente",             // ver fluxo de status
  pagamento: "PIX",               // PIX | Dinheiro | Crédito | Débito | Cortesia
  entrega: "Retirada",            // Retirada | Entrega Própria | Uber Cliente
  observacoes: "...",
  consomeEstoque: true            // false para importações/históricos
}
```

### Item do pedido (produto)

Cada item é **um produto do catálogo**, com tipo, tamanho, sabor, quantidade e valor próprios — um pedido pode misturar produtos:

```js
{
  produtoId: "p123-abc",      // id do produto no catálogo
  tipoProduto: "Punkitos",     // Fatia | Punkitos | Bolo Inteiro
  tamanho: "",                 // PP | P | M | G | GG (só para "Bolo Inteiro")
  sabor: "Chocolate",          // título do produto
  quantidade: 2,
  valorUnitario: 5.00
}
```

### Produto (catálogo)

```js
{
  id: "p123-abc",
  titulo: "Chocolate",           // sabor/título exibido
  tipoProduto: "Fatia",          // Fatia | Punkitos | Bolo Inteiro
  tamanho: "",                    // só para Bolo Inteiro (Mini, PP, P, M, G, GG, Bento Cake, Coração)
  valor: 5.00,
  detalhes: "...",
  controlaEstoque: false
}
```

### Produção (log de estoque)

```js
{
  id: "pr<timestamp>-<random>",
  produtoId: "p123-abc",
  quantidade: 10,
  data: "2026-08-01",
  observacao: "..."
}
```

---

## 4. Regras de negócio

### 4.1 Pedidos
- **Numeração:** pedidos numerados a partir de **1001**; o próximo número nunca repete.
- **Cancelados:** não entram na receita, nas contagens, na quantidade vendida nem no ticket médio.
- **Ticket médio:** `receita ÷ quantidade de pedidos não cancelados`.
- **Duplicar pedido:** novo id/número e status **sempre reiniciado para "Pendente"**.
- **Tamanho:** só é obrigatório/válido para "Bolo Inteiro".
- **Validação do pedido:** data, cliente, pelo menos um item com produto válido; em cada item, tipo obrigatório, quantidade > 0 e valor ≥ 0.
- **Valor total:** soma de `quantidade × valorUnitario` de todos os itens.
- **Cortesia:** a forma de pagamento **Cortesia** zera o valor total do pedido (R$ 0,00).
- **Venda exige estoque:** na criação e edição de pedidos não cancelados, todos os itens precisam ter **produção** suficiente (ver §4.3); só é liberado se `disponível ≥ quantidade`.

### 4.2 Fluxo de status e consumo de estoque

```
Pendente → Em Produção → Embalado → Concluído
    └──────────────────────────────→ Cancelado (não conta nas estatísticas)
```

- **Pendente / Em Produção / Embalado:** reserva o estoque (não pode ser revendido).
- **Concluído:** a reserva vira **venda** (abate o estoque).
- **Cancelado:** libera o estoque de volta ao **disponível**.

### 4.3 Estoque (modelo derivado)

> `disponível(p) = produzido(p) − reservado(p) − vendido(p)`

- **produzido:** soma do log de produções do produto.
- **reservado:** itens de pedidos em andamento (Pendente/Em Produção/Embalado) com `consomeEstoque = true`.
- **vendido:** itens de pedidos **Concluídos** com `consomeEstoque = true`.

Regras imposas:
- **A produção é obrigatória para vender**: produto sem produção registrada (ou com produção insuficiente) é bloqueado com mensagem clara.
- **Pedidos importados/históricos** têm `consomeEstoque = false` e **não** abatem estoque.
- No seletor do formulário, **só aparecem produtos com disponibilidade** (`disponível > 0`); ao editar um pedido, os produtos dos itens existentes sempre aparecem.
- Badges de saldo: `empty` (≤ 0), `low` (≤ 5), `ok`.

### 4.4 Produtos
- **Tipo válido:** Fatia, Punkitos ou Bolo Inteiro.
- **Validação:** título obrigatório, tipo obrigatório, valor ≥ 0 e, para Bolo Inteiro, tamanho obrigatório.
- **Duplicados bloqueados:** mesmo tipo e título (e tamanho em Bolo Inteiro), ignorando caixa/espaços; permite o mesmo sabor em tamanhos diferentes.
- O **valor do pedido vem do catálogo** (não é digitado ao escolher o sabor).

### 4.5 Dashboard (indicadores)
- Pedidos validos = **não cancelados**.
- **Receita:** soma dos `valorTotal` (Cortesia conta como R$ 0).
- **Quantidade de pedidos:** contagem de não cancelados.
- **Quantidade por produto/sabor:** somadas **por item**.
- **Ticket médio:** receita ÷ pedidos não cancelados.
- **Lucro bruto:** preparado para custos futuros (hoje custo = 0 → lucro = receita).
- **Rankings:** top 5 sabores e top 3 produtos por quantidade.

### 4.6 Filtro por período (compartilhado)

Uma barra abaixo da navegação filtra **simultaneamente** o dashboard e a lista de pedidos:

- **Presets:** Hoje · 7 dias · Este mês · Tudo.
- **Faixa livre:** campos **De** e **Até** (type="date").
- O preset ativo fica destacado; a seleção é **persistida** (`punkbolos.config`).

### 4.7 Planilha (CSV)

- **Exportar:** gera `.csv` compatível com Excel (separador `;`, BOM UTF-8), uma linha por item.
- **Importar:** lê o CSV ou a planilha de vendas; detecta a linha de cabeçalho automaticamente, normaliza rótulos/enums (ex.: "Bolo" → "Bolo Inteiro", "gratis" → "Cortesia"), casa produtos com o catálogo (cria os que faltam), agrupa linhas pelo número da planilha e aplica a numeração do sistema. Suporta **dry-run** (pré-visualização sem gravar). Importados **não consomem estoque**.

### 4.8 Autenticação e acesso

- Login com **e-mail/senha** (Supabase Auth); usuário must ser criado no Supabase (os 3 admins).
- Sem sessão válida: redireciona para `login.html`.
- **Recuperação de senha** via e-mail (link leva a `reset-password.html`, fluxo PKCE).
- **RLS:** as tabelas só permitem leitura/escrita de usuários autenticados.
- A **chave do Supabase** vem de variáveis de ambiente (`.env` local / env vars no Render); o servidor a injeta em `js/config.js` (aperto público via anon key).

---

## 5. Cadastro / edição de pedido (modal)

Aberto pelo botão flutuante **"＋"** (novo) ou pelo botão **✏️** de um card (edição).

Campos:

| Campo | Detalhe |
|---|---|
| Data | Pré-preenchida com o dia atual. |
| Número do pedido | Gerado automaticamente (somente leitura). |
| Nome do cliente | Obrigatório. |
| Contato | Opcional. |
| Itens (linhas dinâmicas, cascata) | Cada linha: **Tipo** → **Sabor** (do catálogo) → **Qtd** → preço unitário (auto) → saldo de estoque → botão ✕. |
| Status | Ver fluxo acima. |
| Forma de pagamento | PIX / Dinheiro / Crédito / Débito / **Cortesia** (zera o total). |
| Entrega | Retirada / Entrega Própria / Uber Cliente. |
| Observações | Texto livre. |

- O **Valor Total** é recalculado automaticamente a cada edição.
- O campo de sabor lista **apenas os produtos disponíveis para venda** (com valor do catálogo).
- Se o produto não existir, há um atalho **"＋ Criar produto"** que leva ao cadastro no catálogo e **restaura o rascunho** do pedido ao voltar.
- Ao editar, o produto do item é resolvido por `produtoId` (com fallback casador por tipo+tamanho+valor+título).

---

## 6. Lista de pedidos (tela Pedidos)

- Cards com número, data, cliente, itens, valor e status.
- **Busca instantânea** por cliente ou número.
- **Filtros:** cliente, produto (casa com qualquer item) e status.
- **Ações por card:** Concluir (✅), Cancelar (🚫), Editar (✏️), Duplicar (⧉), Excluir (🗑️, com confirmação).
- Botões de concluir/cancelar aparecem conforme o status (ex.: não oferece "Concluir" para cancelados).

---

## 7. Tela de Produção (estoque)

- **Formulário:** Tipo → Produto → Data → Quantidade → Observação.
- **Saldo por produto:** colunas `produzido / reservado / vendido / disponível` com badge colorido (Zerado/baixo/ok) e botão "＋ Produzir" direto na linha.
- **Histórico:** últimas 20 produções (mais recentes primeiro), com exclusão com confirmação.

---

## 8. Temas e aparência

- **Modo claro/escuro** alternado pelo botão 🌙/☀️ no cabeçalho; preferência salva em `config`.
- Visual baseado em **variáveis CSS** (`themes.css`) e **CSS inline** no HTML (build por `tools/build-css.js`).
- Layout responsivo: grades 3 → 2 → 1 colunas.

---

## 9. Persistência e sincronização

| Fonte | Quando | Chaves |
|---|---|---|
| LocalStorage (cache) | sempre | `punkbolos.pedidos`, `punkbolos.produtos`, `punkbolos.producao` |
| Nuvem (Supabase) | quando conectado | tabelas `orders`, `products`, `productions` |
| Config | sempre | `punkbolos.config` (tema, período) |
| Sessão | sempre | `punkbolos.session` |

- **Modo online:** as escritas são aplicadas no cache na hora (UI imediata) e traduzidas para o banco **diferencial** (só insere/atualiza/exclui o que mudou). Backup local sempre acontece; em falha de rede, os dados são **reconciliados** no próximo `init()`.
- **Migração** de formatos antigos de pedidos e produtos acontece automaticamente ao carregar.

---

## 10. Deployment

- Local: `node server.js` → http://localhost:3000.
- Produção (Render): deploy pela branch `main`, com `SUPABASE_URL` e `SUPABASE_ANON_KEY` definidas, e migrações aplicadas no SQL Editor do Supabase.
- Testes: `npm test` (124/124).