# Punk Bolos — Como o Sistema Funciona

Documento-resumo do sistema de gestão da confeitaria **Punk Bolos**: pedidos, catálogo de produtos, controle de estoque (produção) e dashboard — incluindo todas as regras impostas.

> **Stack:** HTML5 + CSS3 + JavaScript (ES6+, módulos) — **sem frameworks ou dependências de runtime**.
> **Persistência:** LocalStorage (modo offline) → Supabase (nuvem, sincronizada).
> **Deploy:** Render (servidor Node estático mínimo, `server.js`).

---

## 1. Visão geral

| Tela | Função |
|---|---|
| **Login** | Acesso com e-mail e senha (Supabase Auth). Cadastro dos 3 administradores feito no painel do Supabase. |
| **Dashboard** | Resumo do período: receita, pedidos, quantidades por produto, ticket médio, rankings, faturamento diário. |
| **Produtos** | Catálogo: cadastro, edição, exclusão e valores dos produtos vendidos. |
| **Produção** | Registro de produção por produto + saldo de estoque (produzido/reservado/vendido/disponível) + histórico. |
| **Pedidos** | Lista de pedidos com busca, filtros e ações (editar, duplicar, concluir, cancelar, excluir). |

Todas as telas (exceto login) são controladas por um **filtro por período de datas** compartilhado.

Há também as abas **Inventário** (insumos, com histórico de compras) e **Bases** (componentes reutilizáveis como massas/recheios) e **Precificação** (custo por unidade dos produtos a partir de insumos e bases). Detalhes de regras e cálculo em `docs/PRECIFICACAO.md`; as bases são regra pura em `js/modules/base.js`.

---

## 2. Arquitetura

```
index.html / login.html / reset-password.html   # páginas
css/        # themes (tema claro/escuro), styles, responsive, login
js/
  ├── app.js                    # ponto de entrada (SPA): navegação e integração
  ├── config.js                 # config Supabase (chave injetada pelo servidor)
  └── modules/                  # regras e telas
      ├── order.js              # modelo do pedido + regras de negócio
      ├── product.js            # regras do catálogo de produtos
      ├── estoque.js            # regras de estoque (bode) — DERIVADO
      ├── dashboardService.js   # cálculo dos indicadores (puro, sem DOM)
      ├── orderForm.js          # modal de cadastro/edição de pedido
      ├── orderList.js          # lista de pedidos
      ├── estoqueView.js        # tela de Produção
      ├── importExport.js       # importar/exportar CSV (planilhas)
      ├── storage.js            # camada de dados (cache + persistência)
      ├── supabase.js           # cliente REST do Supabase (auth + dados)
      ├── auth.js               # autenticação
      ├── dateFilter.js         # filtro por período
      ├── dashboard.js          # render do dashboard
      ├── toast.js              # notificações
      └── ...
  └── utils/                    # money, theme, dateRange, describe
test/                            # testes unitários (node --test): 124/124
supabase/                        # schema.sql + migration_estoque.sql
tools/build-css.js                # inl< CSS no HTML (performance)
server.js                        # servidor estático local (Node puro)
```

**Padrão:** módulos de regras de negócio são **funções puras** (sem DOM); a interface consome esses dados. Isso torna as regras testáveis (Node test) e reutilizáveis.

---

## 3. Modelo de dados

### Pedido
```js
{
  id, numero, data, cliente, contato,
  itens: [
    { produtoId, tipoProduto, tamanho, sabor, quantidade, valorUnitario }
  ],
  quantidade,      // soma das quantidades dos itens
  valorTotal,      // soma de (quantidade × valorUnitario)
  status, pagamento, entrega, observacoes,
  consomeEstoque  // true p/ pedidos criados no app; false p/ importados/históricos
}
```

### Produto (catálogo)
```js
{
  id, titulo, tipoProduto, tamanho (só Bolo Inteiro),
  valor, detalhes, controlaEstoque
}
```

### Produção (log de estoque)
```js
{ id, produtoId, quantidade, data, observacao }
```

---

## 4. Regras de negócio principais

### 4.1 Pedidos
- **Numeração:** começa em **1001**; o próximo número nunca repete (`nextOrderNumber` = maior + 1).
- **Validação obrigatória:** data, cliente, pelo menos 1 item com produto válido (tipo conhecido), quantidade > 0, valor ≥ 0.
- **Valor total:** soma de `quantidade × valorUnitario` dos itens.
- **Cortesia:** se a forma de pagamento for **Cortesia**, `valorTotal` = **R$ 0,00**.
- **Status (fluxo):** `Pendente → Em Produção → Embalado → Concluído`, ou **Cancelado** (não entra em receita/contagens).
- **Tamanho:** somente válido/exigido para **Bolo Inteiro** (tabela de tamanhos: Mini, PP, P, M, G, GG, Bento Cake, Coração).
- **Duplicar:** novo id/número e status **sempre reiniciado para "Pendente"**.

### 4.2 Estoque (produção)
O estoque é um modelo **DERIVADO** (sem contador que dessincroniza):

```
disponível = produzido − reservado − vendido
```

- **produzido(p):** soma das quantidades do log de produções do produto.
- **reservado(p):** soma dos itens de pedidos **em andamento** (Pendente, Em Produção, Embalado) que **consomem estoque**.
- **vendido(p):** soma dos itens de pedidos **Concluídos** que consomem estoque.

**Ciclo de estoque de um pedido:**
```
Pend/Em Produção/Embalado → RESERVA
Concluído                  → vira VENDA
Cancelado                  → libera para Disponível
```

**Regras impostas:**
- **A produção é OBRIGATÓRIA:** nenhum produto vende sem produção registrada (a venda sem estoque é bloqueada na criação e edição).
- Pedidos antigos/importados têm `consomeEstoque = false` → **não** abatem estoque (protege histórico).
- Ao editar um pedido, a própria reserva dele é desconsiderada (`excludeOrderId`) para não contar contra si.
- Produtos **sem estoque disponível não aparecem** no seletor de itens de um novo pedido (exceto ao editar um item já presente no pedido).
- Níveis de badge: `empty` (≤ 0), `low` (≤ 5), `ok`.

### 4.3 Produtos
- Tipos aceitos: **Fatia, Punkitos, Bolo Inteiro**.
- Validação: título obrigatório, tipo obrigatório, valor ≥ 0, tamanho obrigatório para Bolo Inteiro.
- **Duplicados impedidos:** mesmo tipo + título (e tamanho para Bolo Inteiro), ignorando caixa/espaços; permite o mesmo sabor em tamanhos diferentes.
- O valor do pedido vem **do catálogo**, não é digitado — ao selecionar o sabor, usa o valor cadastrado.

### 4.4 Dashboard
- **Cancelados não contam** em receita, contagens, quantidade vendida nem ticket médio (mas aparecem na distribuição por status).
- **Receita:** soma dos `valorTotal` não cancelados (Cortesia entra como R$ 0).
- **Ticket médio:** receita ÷ quantidade de pedidos não cancelados.
- **Rankings:** top 5 sabores e top 3 produtos por quantidade vendida.
- **Lucro bruto:** preparado para custos futuros; hoje custo = 0 → lucro = receita.

### 4.5 Persistência e sincronização (storage)
- **Leitura síncrona** em memória (cache); módulos continuam lendo de forma síncrona.
- **Offline (sem configuração Supabase):** tudo no LocalStorage (chaves `punkbolos.*`).
- **Online:** dados sincronizados com a nuvem. As escritas são **diferenciais** (só inser/atualiza/exclui o que mudou). Backup local SEMPRE acontece (sobrevive a falhas de rede e re-concilia no próximo `init()`).
- Migração automática de formatos antigos de pedidos e produtos.

### 4.6 Import/Export (CSV)
- **Exportar:** CSV separado por `;`, BOM UTF-8 (compatível Excel), uma linha por item.
- **Importar:** detecta a linha de cabeçalho automaticamente, normaliza rótulos (ex.: "Bolo" → "Bolo Inteiro", "gratis" → "Cortesia"), traduz enums, casa produtos com o catálogo (cria os que faltam), agrupa linhas pelo número da planilha, **baixa** de novo numeração do sistema e **marca como não consumidores de estoque** (histórico). Suporta modo **dry-run** (prévia).

---

## 5. Autenticação e segurança

- Login por **e-mail/senha** no Supabase Auth; sessão no LocalStorage (`punkbolos.session`).
- Token expirado (401) → limpa a sessão e redireciona ao login automaticamente.
- Recuperação de senha via e-mail (fluxo com PKCE em `reset-password.html`).
- **RLS (Row Level Security):** as tabelas `orders`, `products` e `productions` só aceitam operações de usuários **autenticados**. Políticas por tabela (select/insert/update/delete → `authenticated`).
- **Segredo do código:** a `anon key` NÃO fica no código versionado — `server.js` injeta a configuração no `/js/config.js` a partir de variáveis de ambiente (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) em `.env` (local) ou painel do Render (produção).

---

## 6. Performance (truques aplicados)

- Cache-busting com `?v=NN` nos CSS/JS; módulos ES6 sem `?v` revalidam via **ETag** (304).
- **CSS inline** no HTML (via `tools/build-css.js`) — elimina render-blocking.
- Fonte **Quicksand** carregada de forma assíncrona (`media="print" onload` + `display=optional`).
- Logo otimizado: PNG 29 KB (180×160) + WebP 3.5 KB usados com `<picture>` e `fetchpriority="high"`.
- Compressão **gzip/brotli** em produção; CLS ≈ 0.

---

## 7. Como rodar / testar

```bash
node server.js          # servidor local → http://localhost:3000
npm test                # 124/124 testes (node:test)
node tools/build-css.js # regenera o CSS inline se editar os .css
```

---

## 8. Deploy (Render)

1. Repositório conectado à branch `main` no Render.
2. Adicionar `SUPABASE_URL` e `SUPABASE_ANON_KEY` no painel do Render (Environment).
3. Aplicar `supabase/schema.sql` (novo banco) ou `migration_estoque.sql` (banco já existente) no SQL Editor do Supabase.
4. Criar os usuários admins em Any provider Auth → Users no Supabase.

---

## 9. Referências de arquivos de regras

| Regra / funcionalidade | Arquivo |
|---|---|
| Modelo do pedido, status, cortesia | `js/modules/order.js` |
| Catálogo / duplicados | `js/modules/product.js` |
| Estoque (produção) | `js/modules/estoque.js` |
| Indicadores do dashboard | `js/modules/dashboardService.js` |
| Importação/exportação | `js/modules/importExport.js` |
| Camada de dados + sync | `js/modules/storage.js` |
| Cliente Supabase | `js/modules/supabase.js` |
| Autenticação | `js/modules/auth.js` |
| Tabelas e RLS | `supabase/schema.sql`, `supabase/migration_estoque.sql` |