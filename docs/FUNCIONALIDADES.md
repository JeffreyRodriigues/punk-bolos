# Punk Bolos — Funcionalidades do Sistema

Sistema web para gerenciamento de pedidos da confeitaria **Punk Bolos**.

> **Stack:** HTML5 + CSS3 + JavaScript (ES6+, módulos) — **sem frameworks**.
> **Persistência:** LocalStorage (não precisa de servidor).
> **Responsivo:** funciona em celular, tablet e computador.

---

## 1. Visão geral

O sistema organiza o trabalho da confeitaria em duas telas principais, trocadas por abas:

| Tela | Descrição |
|---|---|
| **Início** | Dashboard com resumo das vendas (receita, pedidos, quantidades por produto, ticket médio). |
| **Pedidos** | Lista de pedidos com busca, filtros e ações (editar, duplicar, excluir, concluir, cancelar). |

Ambas as telas são controladas por um **filtro por período de datas** compartilhado.

---

## 2. Arquitetura e estrutura de arquivos

```
Punk Bolos/
├── index.html                 # Estrutura única (SPA): header, navegação, telas, modal, toasts
├── css/
│   ├── themes.css             # Variáveis de cor dos temas claro/escuro
│   ├── styles.css             # Estilos gerais
│   └── responsive.css         # Ajustes por tamanho de tela
├── js/
│   ├── app.js                 # Ponto de entrada: navegação, FAB, ações de status, integração
│   └── modules/
│       ├── order.js           # Modelo do pedido + regras de negócio (validação, totais)
│       ├── storage.js         # Camada de dados (LocalStorage + migração de formatos antigos)
│       ├── orderForm.js       # Modal de cadastro/edição de pedido (itens dinâmicos)
│       ├── orderList.js       # Lista de pedidos (cards, busca, filtros, ações)
│       ├── dashboard.js       # Cálculo e exibição das estatísticas da tela Início
│       ├── dateFilter.js      # Filtro por período (presets + faixa De/Até)
│       └── toast.js           # Notificações (toasts)
│   └── utils/
│       ├── money.js           # Formatação de valores (BRL) e datas
│       └── theme.js           # Alternância/leitura do tema claro/escuro
└── docs/                      # Documentação (este diretório)
```

---

## 3. Modelo de dados

### Pedido

```js
{
  id: "t<timestamp>-<random>",  // gerado automaticamente
  numero: 1001,                  // sequencial, nunca repete (começa em 1001)
  data: "2026-08-01",            // YYYY-MM-DD
  cliente: "Maria Silva",
  contato: "(00) 00000-0000",
  itens: [ /* ver abaixo */ ],
  quantidade: 6,                 // agregado: soma das quantidades dos itens
  valorTotal: 103.50,            // agregado: soma de (quantidade × valorUnitario)
  status: "Pendente",            // ver fluxo de status
  pagamento: "PIX",              // PIX | Dinheiro | Crédito | Débito
  entrega: "Retirada",           // Retirada | Entrega Própria | Uber Cliente
  observacoes: "..."
}
```

### Item do pedido (produto)

Cada item é **um produto** com sabor, quantidade e valor próprios — um pedido pode misturar produtos:

```js
{
  tipoProduto: "Punkitos",     // Fatia | Punkitos | Bolo Inteiro
  tamanho: "G",                // PP | P | M | G | GG (apenas para "Bolo Inteiro")
  sabor: "Chocolate",
  quantidade: 2,
  valorUnitario: 5.00
}
```

Exemplo de pedido misto:

```
2× Punkitos (Chocolate) · 1× Bolo Inteiro G (Cenoura) · 3× Fatia (Red Velvet)
```

---

## 4. Regras de negócio

- **Numeração:** pedidos numerados a partir de **1001**; o próximo número nunca repete.
- **Cancelados:** pedidos cancelados **não entram** na receita nem nas contagens do dashboard.
- **Ticket médio:** `receita ÷ quantidade de pedidos não cancelados`.
- **Duplicar pedido:** cria novo pedido com novo id/número e **sempre reinicia o status para "Pendente"**.
- **Tamanho:** só é obrigatório/válido para "Bolo Inteiro".
- **Validação do item:** tipo de produto obrigatório, sabor obrigatório, quantidade > 0 e valor ≥ 0.
- **Valor total:** soma de `quantidade × valorUnitario` de todos os itens do pedido.
- **Quantidades por produto (dashboard):** somadas **por item**, independentemente do pedido.

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
| Itens (linhas dinâmicas) | Cada linha: **Tipo** · **Tamanho** (só Bolo Inteiro) · **Sabor** · **Qtd** · **Valor unit.** · botão ✕. |
| Status | Ver fluxo abaixo. |
| Forma de pagamento | PIX / Dinheiro / Crédito / Débito. |
| Entrega | Retirada / Entrega Própria / Uber Cliente. |
| Observações | Texto livre. |

- O botão **"＋ Adicionar item"** cria uma nova linha de produto.
- O campo **Tamanho** aparece automaticamente quando o tipo é "Bolo Inteiro".
- O **Valor Total** é recalculado a cada edição.
- O campo de sabor sugere sabores (datalist): Chocolate, Churros, Brigadeiro, Red Velvet, Baunilha, Cenoura, Morango.

### Fluxo de status

```
Pendente → Em Produção → Embalado → Concluído
    └──────────────────────────────→ Cancelado (não conta nas estatísticas)
```

---

## 6. Lista de pedidos (tela Pedidos)

- Cards com número, data, cliente, itens, valor e status.
- **Busca instantânea** por cliente ou número.
- **Filtros:** cliente, produto (casa com qualquer item do pedido) e status.
- **Ações por card:** Concluir (✅), Cancelar (🚫), Editar (✏️), Duplicar (⧉), Excluir (🗑️, com confirmação).
- Botões de concluir/cancelar aparecem conforme o status (ex.: não oferece "Concluir" para cancelados).

---

## 7. Dashboard (tela Início)

Cards de resumo (valores por **período filtrado**):

| Card | Descrição |
|---|---|
| 💰 Receita | Soma dos `valorTotal` dos pedidos (exceto cancelados). |
| 🧾 Quantidade de Pedidos | Total de pedidos não cancelados. |
| ⏳ Pedidos Pendentes | Contagem. |
| 📦 Pedidos Embalados | Contagem. |
| ✅ Pedidos Concluídos | Contagem. |
| 🍰 Quantidade de Fatias | Soma das quantidades dos itens tipo "Fatia". |
| 🎂 Quantidade de Bolos | Soma das quantidades dos itens tipo "Bolo Inteiro". |
| 🧁 Quantidade de Punkitos | Soma das quantidades dos itens tipo "Punkitos". |
| 📈 Ticket Médio | Receita ÷ pedidos não cancelados. |

---

## 8. Filtro por período (compartilhado)

Uma barra abaixo da navegação filtra **simultaneamente** o dashboard e a lista de pedidos:

- **Presets:** Hoje · 7 dias · Este mês · Tudo.
- **Faixa livre:** campos **De** e **Até** (type="date").
- O preset ativo fica destacado; a seleção é **persistida** entre sessões (`punkbolos.config`).
- Pedidos fora do período ficam ocultos em ambas as telas.

---

## 9. Temas e aparência

- **Modo claro/escuro** alternado pelo botão 🌙/☀️ no cabeçalho.
- Preferência salva em `punkbolos.config`.
- Todo o visual usa variáveis CSS (`themes.css`).
- Layout responsivo: 3 colunas (desktop) → 2 (tablet) → 1 (celular) na lista; dashboard adaptado.

---

## 10. Persistência (LocalStorage)

| Chave | Conteúdo |
|---|---|
| `punkbolos.pedidos` | Array de pedidos em JSON. |
| `punkbolos.config` | Configurações: `theme`, `periodo`. |

Pedidos salvos em **formatos antigos** são migrados automaticamente ao carregar (ver `MELHORIAS.md`).
