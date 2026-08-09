# Punk Bolos — Especificação: Inventário + Precificação

Documento de especificação funcional para a evolução do sistema com **cadastro de insumos (Inventário)** e **precificação de produtos** (cálculo do custo por unidade). Serve como base de implementação (seguindo padrão TDD do projeto).

> **Status:** especificação aprovada — aguardando implementação.
> **Stack:** mesmas do sistema (HTML5 + CSS3 + JS ES6+, sem frameworks; regras puras + TDD).

---

## 1. Visão geral

Duas novas abas, trabalhando em conjunto:

| Aba | Função |
|---|---|
| **Inventário** | Cadastro dos insumos (farinha, açúcar, leite, fermento, etc.) com **unidade de medida** e **histórico de compras** (data + preço total + quantidade). |
| **Precificação** | Para cada produto do catálogo: montar a **receita** (insumos + quantidades). O sistema calcula o **custo por unidade** com margem e multiplicador, e exibe o preço como **sugestão** (o valor de venda continua sendo cadastrado à mão). |

---

## 2. Modelo de dados

### 1. Insumo (Inventário)

```js
{
  id: "i<timestamp>-<rand>",
  nome: "Farinha de trigo",
  unidade: "kg",          // kg | g | L | mL | un  (família de conversão)
  descricao: "",
  compras: [               // histórico de compras (a última vira referência)
    { id, data, custoTotal, quantidadeCompra }
  ]
}
```

Regras:
- **Preço total + quantidade** (a primeira opção escolhida): você informa quanto pagou (ex.: R$ 35,00) e a quantidade comprada (ex.: 5 kg). O sistema **calcula o custo unitário** (35 ÷ 5 = R$ 7,00/kg) — e não faz diferença por Kg preenchido à mão.
- **Unidade de medida** declarada por insumo (kg, L, unidade). A receita usa a unidade da família:
  - `kg` → receita em **g** (converte ×1000)
  - `L` → receita em **ml** (converte ×1000)
  - `unidade` → receita em **un** (sem conversão)
- O **último custo unitário** (última compra) é a referência usada na precificação.

### 2. Receita de precificação (por produto)

```js
{
  id: "prc<timestamp>-<rand>",
  produtoId: "p123-abc",          // 1 receita por produto (sem dupla)
  itens: [                         // insumos utilizados
    { insumoId: "i55-xyz", quantidade: 250 /* na unidade do insumo (g/ml/un) */ }
  ],
  margem: 25,                      // % — custos incalculáveis (gás, energia)
  multiplicador: 3,                // lucro + mão de obra
  rendimento: 10,                  // quantidade de unidades produzidas
  embalagem: 1.00,                 // custo de embalagem por unidade (0 se sem)
  custoAdicional: "",              // custo extra por unidade (vazio = sem)
  custoAdicionalObs: "",           // observação do custo adicional
  // Snapshot (resultado calculado):
  dataCalculo: "2026-08-08",
  custoIngredientes: 9.03,         // Σ insumos
  custoPorUnidade: 4.39            // resultado final armazenado
}
```

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
- A receita é um **snapshot**: guarda `dataCalculo`, `custoIngredientes` e `custoPorUnidade` no momento do cálculo. **Mudanças futuras** no preço do inventário **não alteram** receitas já calculadas — o produto "vira" desatualizado até o usuário **recalcular manualmente**.
- **Valor de venda sempre à mão**: a precificação **só sugere** logo valor ("usar este preço no catálogo" copia para o campo de valor do produto, sem sobreescrever sozinho). Não há escrita automática no `valor` do catálogo.
- Campos personalizáveis na receita: `margem` (default 25%), `multiplicador` (default 3), `rendimento` (default 10), `embalagem` (default 1,00), `custoAdicional` + `observacaoAdicional`.
- Bloqueio de venda **sem estoque** (regra atual) permanece inalterado — precificação é cálculo independente.

---

## 7. Arquitetura (seguindo o padrão existente)

```
js/modules/inventory.js      # regras puras: CRUD insumo, histórico, custo unitário
js/modules/pricing.js        # regras puras: receita, cálculo por unidade (fórmula acima)
js/modules/inventoryView.js  # tela Inventário (lista insumos + modal compras/edição)
js/modules/pricingView.js    # tela Precificação (seletor de produto + linhas de insumos)
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