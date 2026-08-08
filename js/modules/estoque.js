/* ============================================================
   ESTOQUE.JS — Controle de estoque (regras de negócio)
   ------------------------------------------------------------
   Modelo DERIVADO (sem contador que dessincroniza):
     disponível(p) = produzido(p) − vendido(p)

   - produzido(p): soma das quantidades do log de produções.
   - vendido(p):   soma dos itens de pedidos que CONSOMEM estoque
     (consomeEstoque = true) e já foram CONCLUÍDOS. Pedidos
     importados/históricos não abatem (consomeEstoque = false).
   - Produtos sem "controlaEstoque" são ilimitados (Infinity).

   Pedidos Pendente/Em Produção/Embalado NÃO reservam: só contam
   ao concluir. Por isso a validação acontece na criação E também
   ao concluir (updateStatus "Concluído").
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as product from './product.js?v=16';

/**
 * Resolve o produto do catálogo correspondente a um item de pedido.
 * Prioriza o produtoId (novo formato); senão casa por tipo+tamanho+valor.
 * @param {Object} item - Item de pedido.
 * @returns {Object|undefined} Produto do catálogo (ou undefined).
 */
export function resolveProduct(item) {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  if (item.produtoId) {
    const byId = product.getProducts().find((p) => p.id === item.produtoId);
    if (byId) return byId;
  }
  return product.matchProduct(item);
}

/**
 * Total de unidades produzidas de um produto.
 * @param {string} produtoId - Id do produto.
 * @returns {number} Soma das quantidades produzidas.
 */
export function totalProduzido(produtoId) {
  return storage
    .getAllProductions()
    .filter((pr) => pr.produtoId === produtoId)
    .reduce((sum, pr) => sum + (Number(pr.quantidade) || 0), 0);
}

/**
 * Total de unidades vendidas (pedidos Concluídos que consomem estoque).
 * @param {string} produtoId - Id do produto.
 * @param {string} [excludeOrderId] - Id de pedido a ignorar (o que está sendo editado).
 * @returns {number} Soma das quantidades vendidas.
 */
export function totalVendido(produtoId, excludeOrderId = '') {
  let total = 0;
  storage.getAll().forEach((o) => {
    if (o.id === excludeOrderId) return;
    if (!o.consomeEstoque || o.status !== 'Concluído') return;
    (Array.isArray(o.itens) ? o.itens : []).forEach((item) => {
      const p = resolveProduct(item);
      if (p && p.id === produtoId) {
        total += Number(item.quantidade) || 0;
      }
    });
  });
  return total;
}

/**
 * Estoque disponível de um produto.
 * @param {Object} produto - Produto do catálogo.
 * @param {string} [excludeOrderId] - Id de pedido a ignorar no cálculo de vendidos.
 * @returns {number} Unidades disponíveis (Infinity se sem controle).
 */
export function disponivel(produto, excludeOrderId = '') {
  if (!produto || !produto.controlaEstoque) {
    return Infinity;
  }
  return totalProduzido(produto.id) - totalVendido(produto.id, excludeOrderId);
}

/**
 * Disponibilidade por item de pedido (para exibição no formulário).
 * @param {Object} item - Item de pedido.
 * @returns {{ produto: (Object|undefined), disponivel: number }} Info do item.
 */
export function disponivelPorItem(item) {
  const produto = resolveProduct(item);
  return { produto, disponivel: disponivel(produto) };
}

/**
 * Valida uma lista de itens contra o estoque disponível.
 * @param {Array<Object>} itens - Itens de um pedido.
 * @param {{ excludeOrderId?: string }} [options] - Id do pedido sendo editado
 *   (para não contar o próprio consumo atual contra o novo pedido).
 * @returns {Array<Object>} Erros: [{ produto, item, disponivel }].
 */
export function validateItens(itens, options = {}) {
  const excludeOrderId = options.excludeOrderId || '';
  const errors = [];
  (itens || []).forEach((item) => {
    const produto = resolveProduct(item);
    if (!produto || !produto.controlaEstoque) {
      return;
    }
    const qtd = Number(item.quantidade) || 0;
    const disp = disponivel(produto, excludeOrderId);
    if (qtd > disp) {
      errors.push({ produto, item, disponivel: disp });
    }
  });
  return errors;
}

/**
 * Nome legível de um produto (com tamanho em Bolo Inteiro).
 * @param {Object} produto - Produto do catálogo.
 * @returns {string} Ex.: "Fatia de chocolate" ou "Bolo M Red Velvet".
 */
export function nomeProduto(produto) {
  if (!produto) return '';
  const base = produto.titulo || 'Produto';
  if (produto.tipoProduto === 'Bolo Inteiro' && produto.tamanho) {
    return `${base} (${produto.tamanho})`;
  }
  return `${base} (${produto.tipoProduto || 'Fatia'})`;
}

/**
 * Classifica o nível do estoque para exibição (badge colorido).
 * @param {number} disponivel - Unidades disponíveis.
 * @returns {string} "empty" | "low" | "ok".
 */
export function stockStatus(disponivel) {
  if (disponivel <= 0) return 'empty';
  if (disponivel <= 5) return 'low';
  return 'ok';
}
