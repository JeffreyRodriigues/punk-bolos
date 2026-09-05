/* ============================================================
   PRODUCT.JS — Regras de negócio do catálogo de produtos
   ------------------------------------------------------------
   Funções puras (sem DOM): criação, validação e consulta de
   produtos. Cada produto tem: título, tipo, valor e detalhes.
   O pedido usa o catálogo para escolher tipo → sabor (produto)
   sem digitar nada — o valor vem do cadastro.
   ============================================================ */

import * as storage from './storage.js?v=13';
import { PRODUCT_TYPES, CAKE_SIZES } from './order.js?v=17';

/**
 * Gera um id único para o produto.
 * @returns {string} Id no formato "p<timestamp>-<aleatório>".
 */
function generateId() {
  return `p${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normaliza os dados de um produto no formato padrão.
 * Tamanho só é mantido para Bolo Inteiro.
 * @param {Object} data - Dados brutos do formulário.
 * @returns {Object} Produto normalizado.
 */
export function createProduct(data = {}) {
  const tipoProduto = PRODUCT_TYPES.includes(data.tipoProduto) ? data.tipoProduto : 'Fatia';
  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId(),
    titulo: String(data.titulo || '').trim(),
    tipoProduto,
    tamanho: tipoProduto === 'Bolo Inteiro' ? String(data.tamanho || '').trim() : '',
    valor: Number(data.valor) || 0,
    detalhes: String(data.detalhes || '').trim(),
    controlaEstoque: Boolean(data.controlaEstoque),
  };
}

/**
 * Valida os dados de um produto.
 * @param {Object} data - Dados brutos do formulário.
 * @returns {{ valid: boolean, errors: Object }} Resultado da validação.
 */
export function validateProduct(data = {}) {
  const errors = {};

  if (!data.titulo || !String(data.titulo).trim()) {
    errors.titulo = 'Informe o título do produto.';
  }

  if (!PRODUCT_TYPES.includes(data.tipoProduto)) {
    errors['tipo-produto'] = 'Selecione o tipo do produto.';
  } else if (data.tipoProduto === 'Bolo Inteiro' && !CAKE_SIZES.includes(data.tamanho)) {
    errors['tamanho-produto'] = 'Selecione o tamanho.';
  }

  const valor = Number(data.valor);
  if (data.valor === '' || data.valor == null || Number.isNaN(valor) || valor < 0) {
    errors.valor = 'Informe um valor válido (≥ 0).';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Retorna todos os produtos cadastrados (da camada de dados).
 * @returns {Array<Object>} Lista de produtos.
 */
export function getProducts() {
  return storage.getAllProducts();
}

/**
 * Procura um produto duplicado: mesmo tipo e mesmo título, ignorando
 * caixa e espaços. Para "Bolo Inteiro" o tamanho também conta — permite
 * cadastrar o mesmo sabor em tamanhos diferentes.
 * @param {Object} data - Dados do produto (tipoProduto, titulo e tamanho).
 * @param {string} [excludeId] - Id a ignorar (o próprio produto em edição).
 * @returns {Object|undefined} Produto existente que duplica, ou undefined.
 */
export function findDuplicate(data = {}, excludeId = '') {
  const titulo = String(data.titulo || '').trim().toLowerCase();
  const tipo = String(data.tipoProduto || '').trim().toLowerCase();
  if (!titulo || !tipo) return undefined;

  const isCake = data.tipoProduto === 'Bolo Inteiro';
  const tamanho = isCake ? String(data.tamanho || '').trim().toLowerCase() : '';

  return getProducts().find((p) => {
    if (p.id === excludeId) return false;
    if (String(p.tipoProduto || '').trim().toLowerCase() !== tipo) return false;
    if (String(p.titulo || '').trim().toLowerCase() !== titulo) return false;
    if (isCake && String(p.tamanho || '').trim().toLowerCase() !== tamanho) return false;
    return true;
  });
}

/**
 * Busca o produto que corresponde a um item de pedido, para
 * auto-preenchimento ao editar. Casa pelo tipo + tamanho + valor unitário
 * e, quando o item guarda o título (sabor), usa-o para desempatar
 * produtos com o mesmo preço (evita resolver um item para o produto
 * errado só porque os tamanhos custam igual).
 * @param {Object} item - Item de pedido.
 * @returns {Object|undefined} Produto correspondente (ou undefined).
 */
export function matchProduct(item = {}) {
  const sabor = String(item.sabor || '').trim().toLowerCase();
  return getProducts().find((p) =>
    p.tipoProduto === item.tipoProduto &&
    (p.tamanho || '') === (item.tamanho || '') &&
    Number(p.valor) === Number(item.valorUnitario) &&
    (!sabor || String(p.titulo || '').trim().toLowerCase() === sabor)
  ) || getProducts().find((p) =>
    p.tipoProduto === item.tipoProduto &&
    (p.tamanho || '') === (item.tamanho || '') &&
    Number(p.valor) === Number(item.valorUnitario)
  );
}
