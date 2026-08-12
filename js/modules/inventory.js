/* ============================================================
   INVENTORY.JS — Regras de negócio do Inventário (insumos)
   ------------------------------------------------------------
   Centraliza:
   - criação de insumo (id único, normalização)
   - histórico de compras (data + custo total + quantidade)
   - custo unitário derivado (custoTotal ÷ quantidadeCompra)
   - conversão de unidade: kg → g · L → ml · unidade → un
   - custo por subunidade (base para a precificação)
   - validação de insumo e de compra
   - busca por duplicado (mesmo nome + unidade)

   Estrutura do insumo:
   {
     id, nome, unidade (kg|L|unidade), descricao,
     compras: [ { id, data, custoTotal, quantidadeCompra } ]
   }
   A precificação (pricing.js) usa a ÚLTIMA compra como custo
   vigente. Unidades: "kg" vira grama na receita (×1000),
   "L" vira ml (×1000) e "unidade" permanece igual.
   ============================================================ */

import * as storage from './storage.js?v=13';

/** Unidades aceitas no cadastro do insumo. */
export const INSUMO_UNITS = ['kg', 'L', 'unidade'];

/** Subunidades usadas na receita (conversão por família). */
export const RECIPE_UNITS = {
  kg: 'g',
  L: 'ml',
  unidade: 'un',
};

/** Gera um id único no formato "i<timestamp>-<aleatório>". */
function generateId() {
  return `i${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Arredonda para 2 casas decimais (padrão global de valores). */
export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Normaliza e cria um insumo no formato padrão.
 * @param {Object} data - Dados crus do formulário.
 * @returns {Object} Insumo normalizado (compras vazias por padrão).
 */
export function createInsumo(data = {}) {
  const unidade = INSUMO_UNITS.includes(data.unidade) ? data.unidade : 'unidade';
  const compras = Array.isArray(data.compras)
    ? data.compras.map((c) => ({
        id: typeof c.id === 'string' && c.id ? c.id : generateId(),
        data: String(c.data || '').trim(),
        custoTotal: Number(c.custoTotal) || 0,
        quantidadeCompra: Number(c.quantidadeCompra) || 0,
      }))
    : [];
  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId(),
    nome: String(data.nome || '').trim(),
    unidade,
    descricao: String(data.descricao || '').trim(),
    compras,
  };
}

/**
 * Valida os campos de um insumo.
 * @param {Object} data - Dados brutos.
 * @returns {{ valid: boolean, errors: Object }} Resultado.
 */
export function validateInsumo(data = {}) {
  const errors = {};

  if (!data.nome || !String(data.nome).trim()) {
    errors.nome = 'Informe o nome do insumo.';
  }
  if (!INSUMO_UNITS.includes(data.unidade)) {
    errors.unidade = 'Selecione a unidade de medida.';
  }

  // Valida as compras existentes (custo total > 0 e quantidade > 0)
  const compras = Array.isArray(data.compras) ? data.compras : [];
  if (compras.length > 0) {
    for (let i = 0; i < compras.length; i++) {
      const compra = compras[i] || {};
      if (!compra.data) {
        errors[`compras.${i}.data`] = 'Informe a data da compra.';
      }
      if (Number(compra.custoTotal) <= 0) {
        errors[`compras.${i}.custoTotal`] = 'Informe o custo total (maior que zero).';
      }
      if (Number(compra.quantidadeCompra) <= 0) {
        errors[`compras.${i}.quantidadeCompra`] = 'Informe a quantidade comprada (maior que zero).';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Valida os campos de uma compra isolada.
 * @param {Object} compra - { data, custoTotal, quantidadeCompra }.
 * @returns {{ valid: boolean, errors: Object }} Resultado.
 */
export function validateCompra(compra = {}) {
  const errors = {};

  if (!compra.data) {
    errors.data = 'Informe a data da compra.';
  }
  if (!(Number(compra.custoTotal) > 0)) {
    errors.custoTotal = 'Informe o custo total (maior que zero).';
  }
  if (!(Number(compra.quantidadeCompra) > 0)) {
    errors.quantidadeCompra = 'Informe a quantidade comprada (maior que zero).';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Custo unitário de uma compra: custoTotal ÷ quantidadeCompra.
 * @param {Object} compra - Compra do insumo.
 * @returns {number} Custo por unidade base (0 quando inválida).
 */
export function custoUnitario(compra) {
  const total = Number(compra && compra.custoTotal) || 0;
  const qtd = Number(compra && compra.quantidadeCompra) || 0;
  if (total <= 0 || qtd <= 0) {
    return 0;
  }
  return round2(total / qtd);
}

/**
 * Última compra do insumo (referência de custo vigente).
 * Considerada a de data mais recente; empates pelo id.
 * @param {Object} insumo - Insumo.
 * @returns {Object|undefined} Compra mais recente (ou undefined).
 */
export function ultimaCompra(insumo) {
  const compras = Array.isArray(insumo && insumo.compras) ? insumo.compras : [];
  if (compras.length === 0) {
    return undefined;
  }
  return [...compras].sort((a, b) =>
    String(b.data || '').localeCompare(String(a.data || '')) ||
    String(b.id || '').localeCompare(String(a.id || ''))
  )[0];
}

/**
 * Custo unitário vigente do insumo (da última compra).
 * @param {Object} insumo - Insumo.
 * @returns {number} Custo por unidade base (0 sem compra).
 */
export function custoUnitarioVigente(insumo) {
  return custoUnitario(ultimaCompra(insumo));
}

/**
 * Subunidade de receita do insumo (unidade declarada → receita).
 * @param {Object} insumo - Insumo.
 * @returns {string} "g" | "ml" | "un".
 */
export function subunidade(insumo) {
  return RECIPE_UNITS[(insumo && insumo.unidade) || 'unidade'] || 'un';
}

/**
 * Fator de conversão para a subunidade (kg/L → 1000, unidade → 1).
 * @param {Object} insumo - Insumo.
 * @returns {number} Fator multiplicador.
 */
export function fatorConversao(insumo) {
  const unidade = (insumo && insumo.unidade) || 'unidade';
  return unidade === 'unidade' ? 1 : 1000;
}

/**
 * Custo por subunidade da receita (base da precificação):
 *   kg → custo por grama = custoUnitario ÷ 1000
 *   L  → custo por ml    = custoUnitario ÷ 1000
 *   unidade → custo por unidade base
 * SEM arredondar: é um fator de conversão (per-grama/per-ml). O
 * arredondamento a 2 casas ocorre nos valores em R$ (ex.: custoItem).
 * @param {Object} insumo - Insumo.
 * @returns {number} Custo por subunidade (0 sem compra).
 */
export function custoPorSubunidade(insumo) {
  return custoUnitarioVigente(insumo) / fatorConversao(insumo);
}

/**
 * Custo de um item de receita: quantidade (na subunidade) × custo por
 * subunidade. Agora sempre arredondado para 2 casas.
 * @param {Object} insumo - Insumo.
 * @param {number} quantidade - Quantidade usada na receita (g/ml/un).
 * @returns {number} Custo do ingrediente nesta receita.
 */
export function custoItem(insumo, quantidade) {
  return round2((Number(quantidade) || 0) * custoPorSubunidade(insumo));
}

/**
 * Procura um insumo duplicado: mesmo nome e mesma unidade,
 * ignorando caixa e espaços.
 * @param {Array<Object>} list - Lista de insumos.
 * @param {Object} data - { nome, unidade }.
 * @param {string} [excludeId] - Id a ignorar (o próprio em edição).
 * @returns {Object|undefined} Insumo existente que duplica.
 */
export function findDuplicate(list = [], data = {}, excludeId = '') {
  const nome = String(data.nome || '').trim().toLowerCase();
  const unidade = String(data.unidade || '').trim().toLowerCase();
  if (!nome) return undefined;
  return list.find((i) =>
    i.id !== excludeId &&
    String(i.nome || '').trim().toLowerCase() === nome &&
    String(i.unidade || '').trim().toLowerCase() === unidade
  );
}

/**
 * Lê todos os insumos (da camada de dados).
 * @returns {Array<Object>} Lista de insumos.
 */
export function getInsumos() {
  return storage.getAllInsumos();
}