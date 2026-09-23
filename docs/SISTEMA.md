# Punk Bolos — Como o Sistema Funciona

Documento-resumo do sistema de gestão da confeitaria **Punk Bolos**: pedidos, catálogo de produtos, controle de estoque (produção), CRM de clientes, inventário de insumos/bases, precificação e cardápio digital público.

> **Stack:** HTML5 + CSS3 + JavaScript (ES6+, módulos) — **sem frameworks ou dependências de runtime**.
> **Persistência:** LocalStorage (modo offline) → Supabase (nuvem, sincronizada em tempo real).
> **Deploy:** Render (servidor Node estático mínimo, `server.js`).
> **Cobertura de Testes:** 224 testes unitários automatizados (`npm test`).

---

## 1. Visão geral

### Painel Administrativo (`index.html`)

| Tela / Aba | Função |
|---|---|
| **Login** | Acesso com e-mail e senha (Supabase Auth). Cadastro dos administradores feito no painel do Supabase. |
| **Dashboard** | Resumo do período: receita, pedidos, quantidades por produto, ticket médio, rankings, faturamento diário. |
| **Produtos** | Catálogo: cadastro, edição, exclusão e valores dos produtos vendidos. |
| **Produção** | Registro de produção por produto + saldo de estoque derivado (produzido/reservado/vendido/disponível) + histórico. |
| **Pedidos** | Lista de pedidos com busca, filtros e ações (editar, duplicar, concluir, cancelar, excluir). |
| **Clientes** | CRM com busca, filtros rápidos (VIP, Recorrentes, Inativos, Aniversariantes), histórico de compras, fidelidade e busca de CEP via ViaCEP. |
| **Inventário** | Gestão de insumos e bases com **IDs sequenciais** (`PIN0001`, `PBA0001`), controle de **estoque físico**, alerta de reposição e histórico de compras. |
| **Precificação** | Montagem da receita de cada produto, cálculo do custo unitário, margem, multiplicador e **importador direto do Excel**. |

### Cardápio Digital Público (`cardapio.html`)
Página independente para clientes externos (link da bio/WhatsApp):
- Catálogo de produtos com fotos/preços.
- Pronta entrega (Fatias/Punkitos com trava de estoque) e sob encomenda (Bolos Inteiros).
- Sacola flutuante, checkout com escolha de entrega ou retirada e integração com WhatsApp.
- Login do cliente por WhatsApp, cartão fidelidade digital (10 selos) e repetição de pedidos.

---

## 2. Arquitetura

```
Punk Bolos/
├── index.html                   # Painel administrativo (SPA)
├── cardapio.html                # Cardápio digital público para clientes
├── login.html                   # Página de login dos administradores
├── reset-password.html          # Recuperação de senha
├── css/
│   ├── themes.css               # Variáveis de temas (Dark / Light)
│   ├── styles.css               # Estilos do painel admin
│   ├── responsive.css           # Regras mobile-first do admin
│   ├── cardapio.css             # Estilos dedicados do cardápio público
│   └── login.css                # Estilos da tela de login
├── js/
│   ├── app.js                   # Ponto de entrada do painel admin
│   ├── cardapio.js              # Ponto de entrada do cardápio público
│   ├── config.js                # Configuração do Supabase injetada pelo servidor
│   └── modules/                 # Regras de negócio puras e views
│       ├── auth.js              # Autenticação (login, logout, sessão)
│       ├── base.js              # Regras de bases (receitas de insumos)
│       ├── customerForm.js      # Modal de cadastro/edição de cliente
│       ├── customerService.js   # Regras de clientes, fidelidade e ViaCEP
│       ├── customerView.js      # Tela de Clientes (tabela, badges, filtros)
│       ├── dashboard.js         # Render do dashboard e gráficos
│       ├── dashboardService.js  # Cálculo de métricas e indicadores
│       ├── dateFilter.js        # Filtro de datas (Hoje, 7 dias, Mês, Custom)
│       ├── estoque.js           # Regras do estoque derivado de bolos
│       ├── estoqueView.js       # Tela de Produção
│       ├── excelImporter.js     # Parser e validador de colunas do Excel
│       ├── excelModal.js        # Modal de importação e preview do Excel
│       ├── importExport.js      # Importação e exportação de CSV
│       ├── inventory.js         # Regras de insumos e compras
│       ├── inventoryView.js     # Tela de Inventário (tabela 8 cols, PIN/PBA)
│       ├── menuService.js       # Regras do cardápio, sacola e checkout
│       ├── order.js             # Modelo do pedido e regras de negócio
│       ├── orderForm.js         # Modal de cadastro e edição de pedidos
│       ├── orderList.js         # Lista de pedidos (cards e ações)
│       ├── pricing.js           # Regras de cálculo da precificação
│       ├── pricingView.js       # Tela de Precificação (grid e fatores)
│       ├── product.js           # Regras do catálogo de produtos
│       ├── productForm.js       # Modal de produtos
│       ├── productList.js       # Lista de produtos
│       ├── storage.js           # Camada de dados (cache local + sync)
│       ├── supabase.js          # Cliente REST do Supabase
│       └── toast.js             # Notificações visuais
│   └── utils/                   # Utilitários (money, theme, dateRange, describe)
├── test/                        # 224 Testes unitários (node:test)
├── supabase/                    # Scripts SQL (schema, cardapio, clientes, rls)
├── tools/build-css.js           # Compila CSS inline nas páginas HTML
└── server.js                    # Servidor estático Node.js para dev e produção
```

---

## 3. Modelos de Dados Principais

### Insumo (`PINXXXX`)
```js
{
  id: "i-timestamp-rand",
  codigo: "PIN0001",           // Código sequencial único sem hífen
  nome: "Farinha de trigo",
  unidade: "g",                // g | ml | unidade
  descricao: "",
  estoqueAtual: 5000,          // Saldo físico atual
  estoqueMinimo: 1000,         // Ponto de alerta para reposição
  compras: [
    { id: "c1", data: "2026-09-01", custoTotal: 35.00, quantidadeCompra: 5000 }
  ]
}
```

### Base (`PBAXXXX`)
```js
{
  id: "b-timestamp-rand",
  codigo: "PBA0001",           // Código sequencial único
  nome: "Massa Branca Híbrida",
  descricao: "",
  rendimento: 1,
  rendimentoUnidade: "unidade",// g | ml | unidade
  estoqueAtual: 4,
  estoqueMinimo: 2,
  componentes: [
    { insumoId: "i-farinha", quantidade: 300 }
  ]
}
```

### Cliente (CRM & Fidelidade)
```js
{
  id: "c-timestamp-rand",
  nome: "Maria Silva",
  whatsapp: "11999999999",
  aniversario: "15/04",
  endereco: {
    cep: "01310-100",
    logradouro: "Av. Paulista",
    numero: "1000",
    complemento: "Apto 42",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    uf: "SP"
  },
  fidelidade: {
    selos: 3,                  // Pontos acumulados (0 a 9)
    recompensas: 1             // Recompensas resgatáveis a cada 10 selos
  }
}
```

---

## 4. Comandos e Manutenção

- `node server.js` — Servidor local na porta `3000`.
- `node tools/build-css.js` — Compila o CSS inline dentro de `index.html`, `cardapio.html` e `login.html`. **Obrigatório após qualquer alteração em arquivos `.css`**.
- `npm test` — Executa toda a suíte de 224 testes unitários automatizados.