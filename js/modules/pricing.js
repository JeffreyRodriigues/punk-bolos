/* ============================================================
   PRICING.JS — Regras de precificação profissional (SENAC / Sebrae)
   ------------------------------------------------------------
   Calcula o custo por unidade de um produto e o preço de venda
   profissional a partir da sua ficha técnica:
   - Insumos + Quebra Técnica de Cocção / Manipulação
   - Mão de Obra Direta (Tempo x Custo do Minuto)
   - Custos Fixos e Operacionais Rateados (Luz, Gás, Aluguel)
   - Embalagens e Descartáveis
   - Formação de Preço via Markup Divisor (Deduções + Lucro Líquido)
   ============================================================ */

import * as inventory from './inventory.js';
import * as base from './base.js';
import * as costSettings from './costSettings.js';

/** Valores padrão de uma receita. */
export const PRICING_DEFAULTS = {
  margem: 25,
  multiplicador: 3,
  rendimento: 10,
  embalagem: 1,
  custoAdicional: 0,
  tempoPreparoMinutos: 30,
  lucroLiquidoDesejado: 25,
  metodoPrecificacao: 'markup_divisor',
};

/**
 * Arredonda para 2 casas decimais (padrão global de valores monetários).
 * @param {number} value - Valor a arredondar.
 * @returns {number} Valor com 2 casas.
 */
export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Converte o custo adicional em número válido.
 * @param {string|number} value - Valor bruto.
 * @returns {number}
 */
function custoAdicionalNum(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza e cria uma receita no formato padrão.
 * @param {Object} [data] - Dados crus da receita.
 * @returns {Object} Receita normalizada.
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
    tempoPreparoMinutos: data.tempoPreparoMinutos != null ? Number(data.tempoPreparoMinutos) : PRICING_DEFAULTS.tempoPreparoMinutos,
    lucroLiquidoDesejado: data.lucroLiquidoDesejado != null ? Number(data.lucroLiquidoDesejado) : PRICING_DEFAULTS.lucroLiquidoDesejado,
    metodoPrecificacao: data.metodoPrecificacao || PRICING_DEFAULTS.metodoPrecificacao,
    dataCalculo: data.dataCalculo || new Date().toISOString().slice(0, 10),
    custoIngredientes: data.custoIngredientes != null ? Number(data.custoIngredientes) : 0,
    custoRealUnitario: data.custoRealUnitario != null ? Number(data.custoRealUnitario) : 0,
    custoPorUnidade: data.custoPorUnidade != null ? Number(data.custoPorUnidade) : 0,
    precoMinimo: data.precoMinimo != null ? Number(data.precoMinimo) : 0,
    lucroLiquidoValor: data.lucroLiquidoValor != null ? Number(data.lucroLiquidoValor) : 0,
  };
}

/**
 * Custo dos ingredientes da receita (Σ de cada insumo e base).
 * @param {Object} receita - Receita com itens [{ insumoId|baseId, quantidade }].
 * @param {Array<Object>} insumos - Lista de insumos.
 * @param {Array<Object>} [bases] - Lista de bases.
 * @returns {number} Custo total dos ingredientes brutos.
 */
export function custoIngredientes(receita, insumos = [], bases = []) {
  const insById = new Map((insumos || []).map((i) => [i.id, i]));
  const baseById = new Map((bases || []).map((b) => [b.id, b]));
  const total = (receita.itens || []).reduce((sum, item) => {
    if (item.baseId && baseById.has(item.baseId)) {
      const b = baseById.get(item.baseId);
      return sum + base.custoBaseItem(b, insumos, Number(item.quantidade) || 0);
    }
    const insumo = insById.get(item.insumoId);
    if (!insumo) return sum;
    return sum + inventory.custoItem(insumo, Number(item.quantidade) || 0);
  }, 0);
  return round2(total);
}

/**
 * Custo de um único item (insumo ou base).
 * @param {Object} item - Item { insumoId|baseId, quantidade }.
 * @param {Array<Object>} insumos - Lista de insumos.
 * @param {Array<Object>} [bases] - Lista de bases.
 * @returns {number} Custo do item em R$.
 */
export function custoItem(item, insumos = [], bases = []) {
  if (item.baseId) {
    const b = (bases || []).find((x) => x.id === item.baseId);
    if (!b) return 0;
    return base.custoBaseItem(b, insumos, Number(item.quantidade) || 0);
  }
  const ins = (insumos || []).find((x) => x.id === item.insumoId);
  if (!ins) return 0;
  return inventory.custoItem(ins, Number(item.quantidade) || 0);
}

/**
 * Cálculo completo e profissional de precificação segundo o modelo SENAC/Sebrae.
 * @param {Object} receita - Ficha técnica do produto.
 * @param {Array<Object>} insumos - Catálogo de insumos com compras.
 * @param {Array<Object>} [bases] - Bases compostas.
 * @param {Object} [customCostSettings] - Parâmetros globais de custo (opcional).
 * @returns {Object} DRE unitário e preço sugerido de venda.
 */
export function calcular(receita, insumos = [], bases = [], customCostSettings = null) {
  const rates = customCostSettings || costSettings.getCostSettings();
  const ci = custoIngredientes(receita, insumos, bases);
  const rendimento = Number(receita.rendimento) > 0 ? Number(receita.rendimento) : 1;
  const embalagem = Number(receita.embalagem) || 0;
  const custoAdic = custoAdicionalNum(receita.custoAdicional);

  // 1. Custo Insumos com Margem de Quebra/Perda Técnica (evaporação, manipulação)
  const quebraPct = Number(rates.quebraInsumosPct || 0);
  const custoIngredientesComQuebra = round2(ci * (1 + quebraPct / 100));

  // 2. Mão de Obra Direta e Custos Fixos do Lote
  const tempoMin = Number(receita.tempoPreparoMinutos || 0);
  const custoMinutoMOD = Number(rates.custoMinutoMaoDeObra || 0);
  const custoMinutoFixo = Number(rates.custoMinutoFixo || 0);

  const custoMaoDeObraLote = round2(tempoMin * custoMinutoMOD);
  const custoFixoLote = round2(tempoMin * custoMinutoFixo);

  // 3. Custos Unitários de Produção
  const custoIngredientesUnitario = round2(custoIngredientesComQuebra / rendimento);
  const custoRealUnitario = round2(custoIngredientesUnitario + embalagem + custoAdic); // CMV Direto Unitário
  const custoMaoDeObraUnitario = round2(custoMaoDeObraLote / rendimento);
  const custoFixoUnitario = round2(custoFixoLote / rendimento);

  // Custo Integral Unitário (Direto + Indireto + Mão de Obra + Embalagem)
  const custoUnitarioTotal = round2(custoRealUnitario + custoMaoDeObraUnitario + custoFixoUnitario);

  // 4. Formação de Preço via Markup Divisor (Padrão Oficial SENAC / Sebrae)
  const taxasDeducoesPct = Number(rates.deducoesVendaPct || 0);
  const lucroPct = receita.lucroLiquidoDesejado != null 
    ? Number(receita.lucroLiquidoDesejado) 
    : Number(rates.lucroLiquidoPadraoPct || 25);

  const totalDeducoesELucro = taxasDeducoesPct + lucroPct;
  const divisor = Math.max(0.05, (100 - totalDeducoesELucro) / 100);
  const precoSugerido = round2(custoUnitarioTotal / divisor);

  // 5. Preço Mínimo de Venda (Ponto de Equilíbrio / Margem Zero de Lucro)
  const divisorMinimo = Math.max(0.05, (100 - taxasDeducoesPct) / 100);
  const precoMinimo = round2(custoUnitarioTotal / divisorMinimo);

  // 6. Lucro Líquido Real em R$ por unidade vendida
  const deducoesValor = round2(precoSugerido * (taxasDeducoesPct / 100));
  const lucroLiquidoValor = round2(precoSugerido - custoUnitarioTotal - deducoesValor);
  const margemLucroRealPct = precoSugerido > 0 ? round2((lucroLiquidoValor / precoSugerido) * 100) : 0;

  // 7. Compatibilidade Legada (Fórmula antiga baseada em multiplicador)
  const margemLegada = Number(receita.margem) || 0;
  const multiplicadorLegado = Number(receita.multiplicador) || 1;
  const comMargem = round2(ci * (1 + margemLegada / 100));
  const comMultiplicador = round2(comMargem * multiplicadorLegado);
  const porUnidade = round2(comMultiplicador / rendimento);
  const precoLegado = round2(porUnidade + embalagem + custoAdic);

  return {
    // Valores principais SENAC / Sebrae
    custoIngredientes: ci,
    custoIngredientesComQuebra,
    custoIngredientesUnitario,
    custoMaoDeObraLote,
    custoMaoDeObraUnitario,
    custoFixoLote,
    custoFixoUnitario,
    custoRealUnitario,       // CMV Unitário
    custoUnitarioTotal,      // Custo Base Total Unitário
    taxasDeducoesPct,        // % Impostos + Cartão
    lucroLiquidoPct: lucroPct,
    precoMinimo,             // Preço no Ponto de Equilíbrio
    precoSugerido,           // Preço Recomendado com Lucro Real
    custoPorUnidade: precoSugerido,
    lucroLiquidoValor,       // R$ que fica no caixa
    margemLucroRealPct,

    // Campos de compatibilidade
    comMargem,
    comMultiplicador,
    porUnidade,
    precoLegado
  };
}

/**
 * Recalcula e devolve uma NOVA receita com os campos de snapshot atualizados.
 * @param {Object} receita
 * @param {Array<Object>} insumos
 * @param {Array<Object>} [bases]
 * @param {Object} [customCostSettings]
 * @returns {Object}
 */
export function recalcular(receita, insumos = [], bases = [], customCostSettings = null) {
  const c = calcular(receita, insumos, bases, customCostSettings);
  return {
    ...receita,
    custoIngredientes: c.custoIngredientes,
    custoRealUnitario: c.custoRealUnitario,
    custoPorUnidade: c.precoSugerido,
    precoMinimo: c.precoMinimo,
    lucroLiquidoValor: c.lucroLiquidoValor,
    dataCalculo: new Date().toISOString().slice(0, 10),
  };
}

/**
 * Indica se a receita está desatualizada em relação ao inventário atual.
 * @param {Object} receita
 * @param {Array<Object>} insumos
 * @param {Array<Object>} [bases]
 * @returns {boolean}
 */
export function isDesatualizada(receita, insumos = [], bases = []) {
  const atual = custoIngredientes(receita, insumos, bases);
  return round2(atual) !== round2(Number(receita.custoIngredientes) || 0);
}

/**
 * Valida os campos da receita.
 * @param {Object} receita
 * @param {Array<Object>} insumos
 * @param {Array<Object>} [bases]
 * @returns {string|null}
 */
export function validateReceita(receita, insumos = [], bases = []) {
  if (!receita) return 'Receita inválida.';
  if (!receita.produtoId) return 'Selecione o produto da receita.';

  const itens = Array.isArray(receita.itens) ? receita.itens : [];
  if (itens.length === 0) return 'Adicione ao menos um insumo ou base à receita.';

  const inById = new Map((insumos || []).map((i) => [i.id, i]));
  const baseById = new Map((bases || []).map((b) => [b.id, b]));
  for (const item of itens) {
    const isBase = Boolean(item.baseId);
    const ref = isBase ? baseById.get(item.baseId) : inById.get(item.insumoId);
    if (!ref) {
      return isBase
        ? 'Base da receita não encontrada.'
        : 'Insumo da receita não encontrado no inventário.';
    }
    const qtd = Number(item.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      return 'Quantidade deve ser maior que zero.';
    }
  }

  if (receita.rendimento != null && (!Number.isFinite(Number(receita.rendimento)) || Number(receita.rendimento) <= 0)) {
    return 'Rendimento deve ser maior que zero.';
  }
  if (receita.embalagem != null && (!Number.isFinite(Number(receita.embalagem)) || Number(receita.embalagem) < 0)) {
    return 'Embalagem inválida (use 0 ou positivo).';
  }
  if (receita.custoAdicional != null && (!Number.isFinite(Number(receita.custoAdicional)) || Number(receita.custoAdicional) < 0)) {
    return 'Custo adicional inválido (use 0 ou positivo).';
  }
  if (receita.tempoPreparoMinutos != null && (!Number.isFinite(Number(receita.tempoPreparoMinutos)) || Number(receita.tempoPreparoMinutos) < 0)) {
    return 'Tempo de preparo inválido.';
  }
  if (receita.lucroLiquidoDesejado != null && (!Number.isFinite(Number(receita.lucroLiquidoDesejado)) || Number(receita.lucroLiquidoDesejado) < 0 || Number(receita.lucroLiquidoDesejado) >= 90)) {
    return 'Margem de lucro líquido deve ser entre 0% e 89%.';
  }
  return null;
}

/**
 * Busca receita duplicada (mesmo produto, id diferente).
 * @param {Object} receita
 * @param {Array<Object>} receitas
 * @returns {Object|null}
 */
export function findDuplicate(receita, receitas = []) {
  return (receitas || []).find(
    (r) => r.produtoId === receita.produtoId && r.id !== receita.id
  ) || null;
}

/**
 * Retorna a receita de um produto.
 * @param {Array<Object>} receitas
 * @param {string} produtoId
 * @returns {Object|null}
 */
export function getReceita(receitas = [], produtoId) {
  return (receitas || []).find((r) => r.produtoId === produtoId) || null;
}
