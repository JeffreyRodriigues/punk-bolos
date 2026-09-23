# Punk Bolos — Especificação: Inventário + Precificação

Documento funcional e técnico para o **cadastro de insumos (Inventário)** e **precificação de produtos** (cálculo do custo por unidade, rendimento e importador do Excel).

> **Status:** Implementado e em Produção (cobertura 100% via testes unitários em `node:test`).
> **Stack:** HTML5 + CSS3 + JS ES6+ (módulos puros, sem frameworks).

---

## 1. Visão geral

Duas abas principais trabalhando de forma integrada:

| Aba | Função |
|---|---|
| **Inventário** | Cadastro de insumos e bases com **códigos de identificação únicos** (`PIN0001`, `PBA0001`), controle de **estoque físico** (`estoqueAtual`, `estoqueMinimo`), histórico de compras e semáforo de status (🟢 Normal, 🟡 Baixo, 🔴 Zerado). |
| **Precificação** | Montagem da receita por produto (insumos + bases). O sistema calcula o **custo por unidade** com margem e multiplicador, oferece **importador direto do Excel** (colar 4 colunas) e exibe o preço sugerido. |

---

## 2. Modelo de dados

### 1. Insumo (Inventário)

```js
{
  id: "i<timestamp>-<rand>",
  codigo: "PIN0001",      // Código sequencial único sem hífen (PIN0001, PIN0002...)
  nome: "Farinha de trigo",
  unidade: "g",           // g | ml | unidade (unidades diretas para facilidade de pesagem)
  descricao: "",
  estoqueAtual: 5000,     // Quantidade física disponível em estoque
  estoqueMinimo: 1000,    // Ponto de alerta para reposição de estoque
  compras: [              // Histórico de compras (a mais recente vira a referência de custo)
    { id, data, custoTotal, quantidadeCompra }
  ]
}
```

Regras:
- **Código sequencial PIN:** gerado automaticamente (`nextInsumoCodigo`). Itens legados recebem o código no carregamento via `ensureCodigos()`.
- **Preço total + quantidade:** você informa quanto pagou (ex.: R$ 35,00) e a quantidade comprada (ex.: 5000 g). O sistema calcula o custo unitário. Ao registrar uma compra, o `estoqueAtual` é incrementado automaticamente.
- **Unidades:** `g`, `ml` e `unidade` são unidades nativas da receita.
- **Alerta de Estoque:** 
  - 🟢 **Normal:** `estoqueAtual > estoqueMinimo`
  - 🟡 **Baixo:** `estoqueAtual <= estoqueMinimo`
  - 🔴 **Zerado:** `estoqueAtual <= 0`

### 2. Base (componente reutilizável)

Bloco de insumos com quantidade, que pode ser usado como **item de receita** (ex.: "Massa de bolo", "Recheio de brigadeiro"):

```js
{
  id: "b<timestamp>-<rand>",
  codigo: "PBA0001",           // Código sequencial único (PBA0001, PBA0002...)
  nome: "Massa de bolo",
  descricao: "",
  rendimento: 1000,            // Quantidade produzida pela base
  rendimentoUnidade: "g",      // Unidade do rendimento (g | ml | unidade)
  estoqueAtual: 2,             // Quantidade física em estoque
  estoqueMinimo: 1,            // Alerta de reposição
  componentes: [               // Insumos que compõem a base
    { insumoId: "i55-xyz", quantidade: 500 }
  ]
}
```

### 3. Receita de precificação (por produto)

```js
{
  id: "prc<timestamp>-<rand>",
  produtoId: "p123-abc",          // 1 receita por produto (sem duplicatas)
  itens: [                         // Insumos OU bases utilizados
    { insumoId: "i55-xyz", quantidade: 250 },
    { baseId: "b12-abc", quantidade: 1 }
  ],
  margem: 25,                      // % — custos incalculáveis (gás, energia)
  multiplicador: 3,                // Lucro + mão de obra
  rendimento: 10,                  // Quantidade de unidades produzidas
  embalagem: 1.00,                 // Custo de embalagem por unidade (fora do multiplicador)
  custoAdicional: "",              // Custo extra por unidade (fora do multiplicador)
  custoAdicionalObs: "",           // Observação do custo adicional
  // Snapshot (resultado calculado):
  dataCalculo: "2026-08-08",
  custoIngredientes: 9.03,         // Σ insumos + bases
  custoPorUnidade: 4.39            // Resultado final armazenado
}
```

---

## 3. Importador do Excel (Colar 4 Colunas)

O app possui importador em modal (`js/modules/excelModal.js` e `js/modules/excelImporter.js`):
1. **4 Colunas aceitas:** `Ingrediente` | `Custo Embalagem` | `Gramas Embalagem` | `Gramas Utilizadas`.
2. **Reconhecimento Inteligente:**
   - Detecta e casa com insumos existentes (por nome exato ou similaridade).
   - Compara o preço da planilha com a última compra no sistema.
   - Permite criar novos insumos automaticamente com a primeira compra preenchida.
   - Permite atualizar o preço de compra do insumo caso tenha variado.

- **Custo total da base** = soma do custo de cada componente (mesma regra de custo de insumo: `custoItem(componente, última compra)`).
- **Custo por unidade de rendimento** = custo total ÷ rendimento.
- Na precificação, a `quantidade` de uma base é informada na **unidade de rendimento** dela; o custo proporcional do item = custo total × (quantidade ÷ rendimento).

---

## 3. Cálculo — fórmula definitiva

```
1.  custoUnitárioInsumo  = custoTotalCompra ÷ quantidadeCompra
2.  custoSubira           = custoUnitário ÷ 1000       (se kg→g ou L→ml; senão igual)
3.  custoItemIngrediente  = quantidadeUsada × custoPorSubunidade
4.  custoIngredientes     = Σ custoItemIngredienteIl
5.  comMargem             = custoIngredientes × (1 + margem/100)      [default 25%]
6.  comMultiplicador      = comMargem × multiplicador                 [default 3]
7.  porUnidade            = comMultiplicador ÷ rendimento             [default 10]
8.  custoPorUnidadeFinal  = porUnidade + embalagem + custoAdicional   [por unidade]
```

**Ordem obrigatória:** a margem de 25% é somada **sobre o custo dos ingredientes** e o multiplicador (×3) incide **depois** da adição da margem. Custos adicionais (embalagem e custo personalizado) entram **fora** do multiplicador, somados ao final por unidade.

**Arredondamento:** **todos** os valores com **2 casas decimais** (no final de cada etapa).

### Exemplo real (aprovado)

| Ingrediente | Qtd | Custo inventário | Custo receita |
|---|---|---|---|
| Farinha | 250 g | R$ 7,00/kg | 2,23 |
| Açúcar | 150 g | R$ 6,00/kg | 0,90 |
| Chocolate em pó | 50 g | R$ 12,00/300g | 2,00 |
| Leite | 200 ml | R$ 4,50/L | 0,90 |
| Fermento | 5 g | R$ 3,00/15g | 1,00 |
| Ovos | 100 g | R$ 12,00/dúzia (100g≈) | 2,00 |

```
custoIngredientes   = 2,23+0,90+2,00+0,90+1,00+2,00  =  9,03
× margem 25%        = 9,03 × 1,25                     =  11,29
× multiplicador 3   = 11,29 × 3                       =  33,87
÷ rendimento 10     = 33,87 ÷ 10                      =   3,39
+ embalagem 1,00    = 3,39 + 1,00                     =   4,39  ← preço sugerido/unit.
```

(Demonstração que o usuário validou: “Ficou exatamente como eu gostaria”.)

---

## 4. Regras de negócio

### Inventário
- **Custo simples**: informa **preço total + quantidade comprada**; sistema calcula o custo unitário.
- **Histórico de compras**: cada compra guarda `data`, `preço total`, `quantidade`. A precificação usa sempre o **último custo unitário**.
- **Unidade**: famílias — `kg`, `L`, `unidade`. Receita usa a caravana (`g`, `ml`, `un`).
- Validação: `nome` obrigatório; `custoTotal > 0`; `quantidadeCompra > 0`; data obrigatória.
- **Nunca excluir** com referência em receita (ou bloco com aviso).

### Precificação
- **1 receita por produto** (bloqueia dupla).
- Produto do catálogo **sem receita**: aparece com status **"Sem precificação"** + convite "＋ Criar precificação".
- **Itens podem ser insumos ou bases**: o seletor lista ambos; cada linha mostra o **custo proporcional ao vivo** e um **cabeçalho igual à tela de Bases** (*Ingrediente · Quantidade utilizada · Custo e gramas da embalagem · Quanto custou*). O custo de uma base leva em conta todos os seus componentes.
- A receita é um **snapshot**: guarda `dataCalculo`, `custoIngredientes` e `custoPorUnidade` no momento do cálculo. **Mudanças futuras** no preço do inventário — inclusive em insumos que compõem uma **base** usada na receita — **não alteram** receitas já calculadas; a precificação "vira" desatualizada até o usuário **recalcular manualmente**.
- **Valor de venda sempre à mão**: a precificação **só sugere** o valor ("usar este preço no catálogo" copia para o campo de valor do produto, sem sobreescrever sozinho). Não há escrita automática no `valor` do catálogo.
- Campos personalizáveis na receita: `margem` (default 25%), `multiplicador` (default 3), `rendimento` (default 10), `embalagem` (default 1,00), `custoAdicional` + `observacaoAdicional`.
- Bloqueio de venda **sem estoque** (regra atual) permanece inalterado — precificação é cálculo independente.

---

## 7. Arquitetura (seguindo o padrão existente)

```
js/modules/inventory.js      # regras puras: CRUD insumo, histórico, custo unitário
js/modules/pricing.js        # regras puras: receita, cálculo por unidade (fórmula acima), custoItem
js/modules/base.js           # regras puras: bases reutilizáveis (custoBase, custoBaseItem)
js/modules/inventoryView.js  # tela Inventário (lista insumos + modal compras/edição + aba Bases)
js/modules/pricingView.js    # tela Precificação (seletor de produto + linhas de insumos/bases, custo por linha)
```

- `storage.js`: caches `insumos` e `precificacoes` + getters/setters e **diff** (mesmo padrão de `productions`).
- `supabase.js`: `listInsumos/insertInsumo/updateInsumo/deleteInsumo`, idem para `precificacoes`.
- `supabase/migration_precificacao.sql`: tabelas `insumos`, `insumo_compras`, `precificacoes` (+ RLS idempotente).
- `index.html`: duas abas novas (`data-view-target="inventario"` e `data-view-target="precificacao"`).
- `app.js`: importar módulos, `navigate()`, listeners, re-render global.
- Testes: `test/inventory.test.js` + `test/pricing.test.js` (node:test, puras).

---

## 8. Roadmap de implementação (ordem TDD)

1. **`inventory.js` pura** + testes (regras/CRUD/custo unitário/histórico).
2. **`inventoryView.js`** (tela Inventário) + storage/supabase/migration.
3. **`pricing.js` pura** + testes (cálculo completo, arredondamento 2 casas, snapshot).
4. **`pricingView.js`** (tela precificação: seleção de produto, linhas de insumo, preview) + storage/supabase.
5. **Integração** `app.js`/`index.html` (abas, listeners, re-render) + teste E2E manual.

> **Fora de escopo (fase 2, planejar depois):** lucro real no dashboard (`receita − custo × vendidos`) e ideias complementares do usuário para o Dashboard.

---

## 9. Decisões pendentes / confirmadas

| # | Ponto | Decisão |
|---|---|---|
| 1 | Multiplicador "3" | Personalizável por receita (default 3). |
| 2 | Unidades | Simples: informar unidade de medida (kg/L/un → receita g/ml/un). Sem conversão de densidade entre líquidos. |
| 3 | Custos adicionais | Fora do multiplicador (igual à embalagem), somados ao final por unidade. Campo `custoAdicional` + obs. |
| 4 | Arredondamento | **2 casas decimais** em **todas** as etapas. |
| 5 | Snapshot | Receita imutável até recalcular manual; mostra "desatualizada" quando insumos mudam. |
| 6 | Valor de venda | Sempre manual; precificação só sugere (botão "usar este preço"). |
| 7 | Dashboard lucro | Depois (fase 2), fora desta etapa. |
| 8 | Sem recebe exacta | Mostra "sem precificação" com convite. 1 receita por produto. |
| 9 | Custo no inventário | Preço total + quantidade (sistema divide). |