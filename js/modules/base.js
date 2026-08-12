/* ============================================================
   BASE.JS — Regras de negócio das Bases (receitas de insumos)
   ------------------------------------------------------------
   Uma "base" é um componente composto usado em bolos (ex.:
   "Bolo branco híbrido") formado por vários insumos com suas
   quantidades. O custo da base é a SOMA do custo de cada insumo
   (reutiliza inventory.custoItem). O rendimento diz quanto a base
   produz, permitindo o custo por unidade.

   Estrutura da base:
   {
     id, nome, descricao,
     rendimento, rendimentoUnidade ('un'|'g'|'kg'|'ml'|'L'),
     componentes: [ { insumoId, quantidade } ]
   }
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as inventory from './inventory.js?v=2';
import { round2 } from './inventory.js?v=2';

/** Unidades aceitas para o rendimento da base. */
export const BASE_REND_UNITS = ['g', 'ml', 'unidade'];

/** Gera um id único no formato "b<timestamp>-<aleatório>". */
function generateId() {
  return `b${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normaliza e cria uma base no formato padrão.
 * @param {Object} data - Dados crus do formulário.
 * @returns {Object} Base normalizada.
 */
export function createBase(data = {}) {
  const componentes = Array.isArray(data.componentes)
    ? data.componentes
        .filter((c) => c && c.insumoId)
        .map((c) => ({ insumoId: String(c.insumoId), quantidade: Number(c.quantidade) || 0 }))
    : [];
  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId(),
    nome: String(data.nome || '').trim(),
    descricao: String(data.descricao || '').trim(),
    rendimento: Number(data.rendimento) || 0,
    rendimentoUnidade: BASE_REND_UNITS.includes(data.rendimentoUnidade) ? data.rendimentoUnidade : 'un',
    componentes,
  };
}

/**
 * Valida os campos de uma base.
 * @param {Object} data - Dados brutos.
 * @returns {{ valid: boolean, errors: Object }} Resultado.
 */
export function validateBase(data = {}) {
  const errors = {};

  if (!data.nome || !String(data.nome).trim()) {
    errors.nome = 'Informe o nome da base.';
  }
  if (!(Number(data.rendimento) > 0)) {
    errors.rendimento = 'Informe o rendimento (maior que zero).';
  }

  const componentes = Array.isArray(data.componentes) ? data.componentes : [];
  if (componentes.length === 0) {
    errors.componentes = 'Adicione ao menos um insumo à base.';
  } else {
    for (const c of componentes) {
      if (!c.insumoId) {
        errors.componentes = 'Selecione o insumo de cada componente.';
        break;
      }
      if (!(Number(c.quantidade) > 0)) {
        errors.componentes = 'Quantidade de componente deve ser maior que zero.';
        break;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Custo total da base: soma do custo de cada insumo componente.
 * @param {Object} base - Base com componentes.
 * @param {Array<Object>} insumos - Lista de insumos (compras).
 * @returns {number} Custo total (R$).
 */
export function custoBase(base, insumos = []) {
  const byId = new Map((insumos || []).map((i) => [i.id, i]));
  const total = (base.componentes || []).reduce((sum, c) => {
    const insumo = byId.get(c.insumoId);
    if (!insumo) return sum;
    return sum + inventory.custoItem(insumo, Number(c.quantidade) || 0);
  }, 0);
  return round2(total);
}

/**
 * Custo de uma base usada em certa quantidade (na unidade do rendimento).
 * @param {Object} base - Base com componentes.
 * @param {Array<Object>} insumos - Lista de insumos (compras).
 * @param {number} quantidade - Quantidade usada (mesma unidade de rendimento).
 * @returns {number} Custo proporcional (R$).
 */
export function custoBaseItem(base, insumos = [], quantidade = 0) {
  const total = custoBase(base, insumos);
  const rend = Number(base.rendimento) || 1;
  return round2((total * (Number(quantidade) || 0)) / rend);
}

/**
 * Custo por unidade de rendimento da base.
 * @param {Object} base - Base.
 * @param {Array<Object>} insumos - Lista de insumos.
 * @returns {number} Custo por unidade de rendimento (R$).
 */
export function custoPorUnidadeBase(base, insumos = []) {
  const total = custoBase(base, insumos);
  const rend = Number(base.rendimento) || 1;
  return round2(total / rend);
}

/**
 * Procura uma base duplicada: mesmo nome (ignora caixa/espaços).
 * @param {Array<Object>} list - Lista de bases.
 * @param {Object} data - { nome }.
 * @param {string} [excludeId] - Id a ignorar.
 * @returns {Object|undefined} Base existente que duplica.
 */
export function findDuplicate(list = [], data = {}, excludeId = '') {
  const nome = String(data.nome || '').trim().toLowerCase();
  if (!nome) return undefined;
  return (list || []).find(
    (b) => b.id !== excludeId && String(b.nome || '').trim().toLowerCase() === nome
  ) || null;
}

/**
 * Lê todas as bases cadastradas.
 * @returns {Array<Object>} Lista de bases.
 */
export function getBases() {
  return storage.getAllBases();
}
