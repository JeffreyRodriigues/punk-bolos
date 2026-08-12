/* ============================================================
   PRICING.JS — Regras de precificação (cálculo de custo por unidade)
   ------------------------------------------------------------
   Calcula o custo por unidade de um produto a partir da sua
   receita (insumos + fatores). Fórmula (docs/PRECIFICACAO.md):

     1. custoUnitárioInsumo = custoTotalCompra ÷ quantidadeCompra
     2. custoSubunidade      = custoUnitário ÷ 1000 (kg→g / L→ml; senão =)
     3. custoItem            = quantidadeUsada × custoPorSubunidade
     4. custoIngredientes    = Σ custoItem
     5. comMargem            = custoIngredientes × (1 + margem/100)
     6. comMultiplicador     = comMargem × multiplicador
     7. porUnidade           = comMultiplicador ÷ rendimento
     8. custoPorUnidadeFinal = porUnidade + embalagem + custoAdicional

   Ordem obrigatória: margem soma SOBRE os ingredientes, multiplicador
   incide DEPOIS da margem; embalagem e custo adicional entram FORA do
   multiplicador (somados por unidade no final).
   ARREDONDAMENTO: 2 casas em TODAS as etapas.
   ============================================================ */

import * as inventory from './inventory.js?v=2';

/** Valores padrão de uma receita (definidos na spec). */
export const PRICING_DEFAULTS = {
  margem: 25,
  multiplicador: 3,
  rendimento: 10,
  embalagem: 1,
  custoAdicional: 0,
};

/**
 * Arredonda para 2 casas decimais (padrão global de valores).
 * @param {number} value - Valor a arredondar.
 * @returns {number} Valor com 2 casas.
 */
export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Converte o custo adicional (pode vir "" do formulário) em número.
 * @param {string|number} value - Valor bruto.
 * @returns {number} Número (0 se vazio/inválido).
 */
function custoAdicionalNum(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza e cria uma receita no formato padrão.
 * @param {Object} [data] - Dados crus da receita.
 * @returns {Object} Receita normalizada (sem custos calculados).
 */
export function createReceita(data = {}) {
  return {
    id: typeof data.id === 'string' && data.id ? data.id : `prc${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    produtoId: String(data.produtoId || ''),
    itens: Array.isArray(data.itens) ? data.itens.map((i) => ({ ...i })) : [],
    margem: data.margem != null ? Number(data.margem) : PRICING_DEFAULTS.margem,
    multiplicador: data.multiplicador != null ? Number(data.multiplicador) : PRICING_DEFAULTS.multiplicador,
    rendimento: data.rendimento != null ? Number(data.rendimento) : PRICING_DEFAULTS.rendimento,
    embalagem: data.embalagem != null ? Number(data.embalagem) : PRICING_DEFAULTS.embalagem,
    custoAdicional: data.custoAdicional != null ? Number(data.custoAdicional) : PRICING_DEFAULTS.custoAdicional,
    custoAdicionalObs: String(data.custoAdicionalObs || ''),
    dataCalculo: data.dataCalculo || new Date().toISOString().slice(0, 10),
    custoIngredientes: data.custoIngredientes != null ? Number(data.custoIngredientes) : 0,
    custoPorUnidade: data.custoPorUnidade != null ? Number(data.custoPorUnidade) : 0,
  };
}

/**
 * Custo dos ingredientes da receita (Σ de cada item, arredondado a 2
 * casas). Cada item usa inventory.custoItem (já arredondado por item).
 * @param {Object} receita - Receita com itens [{ insumoId, quantidade }].
 * @param {Array<Object>} insumos - Lista de insumos (com compras).
 * @returns {number} Custo total dos ingredientes.
 */
export function custoIngredientes(receita, insumos = []) {
  const byId = new Map((insumos || []).map((i) => [i.id, i]));
  const total = (receita.itens || []).reduce((sum, item) => {
    const insumo = byId.get(item.insumoId);
    if (!insumo) return sum;
    return sum + inventory.custoItem(insumo, Number(item.quantidade) || 0);
  }, 0);
  return round2(total);
}

/**
 * Cálculo completo do custo por unidade, seguindo a fórmula e o
 * arredondamento de 2 casas em cada etapa.
 * @param {Object} receita - Receita (fatores + itens).
 * @param {Array<Object>} insumos - Lista de insumos (com compras).
 * @returns {{ custoIngredientes: number, comMargem: number, comMultiplicador: number, porUnidade: number, custoPorUnidade: number }}
 */
export function calcular(receita, insumos = []) {
  const ci = custoIngredientes(receita, insumos);
  const margem = Number(receita.margem) || 0;
  const multiplicador = Number(receita.multiplicador) || 1;
  const rendimento = Number(receita.rendimento) || 1;
  const embalagem = Number(receita.embalagem) || 0;
  const custoAdic = custoAdicionalNum(receita.custoAdicional);

  const comMargem = round2(ci * (1 + margem / 100));
  const comMultiplicador = round2(comMargem * multiplicador);
  const porUnidade = round2(comMultiplicador / rendimento);
  const custoPorUnidade = round2(porUnidade + embalagem + custoAdic);

  return { custoIngredientes: ci, comMargem, comMultiplicador, porUnidade, custoPorUnidade };
}

/**
 * Recalcula e devolve uma NOVA receita com os campos de snapshot
 * (custoIngredientes, custoPorUnidade, dataCalculo) atualizados.
 * @param {Object} receita - Receita a recalcular.
 * @param {Array<Object>} insumos - Lista de insumos.
 * @returns {Object} Receita com snapshot atualizado.
 */
export function recalcular(receita, insumos = []) {
  const c = calcular(receita, insumos);
  return {
    ...receita,
    custoIngredientes: c.custoIngredientes,
    custoPorUnidade: c.custoPorUnidade,
    dataCalculo: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Indica se a receita está desatualizada em relação ao inventário
 * atual (algum insumo mudou de preço ou foi removido).
 * @param {Object} receita - Receita (com snapshot custoIngredientes).
 * @param {Array<Object>} insumos - Lista atual de insumos.
 * @returns {boolean} true se o custo atual diverge do armazenado.
 */
export function isDesatualizada(receita, insumos = []) {
  const atual = custoIngredientes(receita, insumos);
  return round2(atual) !== round2(Number(receita.custoIngredientes) || 0);
}

/**
 * Valida os campos de uma receita.
 * @param {Object} receita - Receita a validar.
 * @param {Array<Object>} insumos - Lista de insumos (para checar existência).
 * @returns {string|null} Mensagem de erro ou null se válida.
 */
export function validateReceita(receita, insumos = []) {
  if (!receita) return 'Receita inválida.';
  if (!receita.produtoId) return 'Selecione o produto da receita.';

  const itens = Array.isArray(receita.itens) ? receita.itens : [];
  if (itens.length === 0) return 'Adicione ao menos um insumo à receita.';

  const byId = new Map((insumos || []).map((i) => [i.id, i]));
  for (const item of itens) {
    if (!item.insumoId || !byId.has(item.insumoId)) {
      return 'Insumo da receita não encontrado no inventário.';
    }
    const qtd = Number(item.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      return 'Quantidade de insumo deve ser maior que zero.';
    }
  }

  if (!Number.isFinite(Number(receita.margem)) || Number(receita.margem) < 0) {
    return 'Margem inválida (use 0 ou positivo).';
  }
  if (!Number.isFinite(Number(receita.multiplicador)) || Number(receita.multiplicador) <= 0) {
    return 'Multiplicador deve ser maior que zero.';
  }
  if (!Number.isFinite(Number(receita.rendimento)) || Number(receita.rendimento) <= 0) {
    return 'Rendimento deve ser maior que zero.';
  }
  if (!Number.isFinite(Number(receita.embalagem)) || Number(receita.embalagem) < 0) {
    return 'Embalagem inválida (use 0 ou positivo).';
  }
  if (!Number.isFinite(Number(receita.custoAdicional)) || Number(receita.custoAdicional) < 0) {
    return 'Custo adicional inválido (use 0 ou positivo).';
  }
  return null;
}

/**
 * Busca receita duplicada (mesmo produto, id diferente).
 * @param {Object} receita - Receita em edição.
 * @param {Array<Object>} receitas - Lista de receitas.
 * @returns {Object|null} Receita existente que duplica (ou null).
 */
export function findDuplicate(receita, receitas = []) {
  return (receitas || []).find(
    (r) => r.produtoId === receita.produtoId && r.id !== receita.id
  ) || null;
}

/**
 * Retorna a receita de um produto (1 receita por produto).
 * @param {Array<Object>} receitas - Lista de receitas.
 * @param {string} produtoId - Id do produto.
 * @returns {Object|null} Receita do produto (ou null).
 */
export function getReceita(receitas = [], produtoId) {
  return (receitas || []).find((r) => r.produtoId === produtoId) || null;
}
