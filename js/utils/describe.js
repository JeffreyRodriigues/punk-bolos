/* ============================================================
   DESCRIBE.JS — Formatação pura de textos de apresentação
   ------------------------------------------------------------
   Regras de exibição sem DOM: descrição de itens de pedido e
   chave de ordenação normalizada. Usado por orderList.js e
   estoqueView.js. Testável em Node (node:test).
   ============================================================ */

/**
 * Formata a lista de itens de um pedido para exibição.
 * O campo "sabor" guarda o título do produto do catálogo.
 * Ex.: "2× Fatia de chocolate · 1× Bolo M Red Velvet"
 * @param {Object} order - Pedido.
 * @returns {string} Descrição dos itens ("—" quando vazio).
 */
export function describeItens(order) {
  const items = Array.isArray(order && order.itens) ? order.itens : [];
  if (items.length === 0) {
    return '—';
  }
  return items
    .map((item) => {
      const qty = Number(item.quantidade) || 0;
      const type = item.tipoProduto || 'Fatia';
      const label = item.sabor || type;
      const cortesia = item.cortesia ? ' (Cortesia)' : '';
      return `${qty}× ${label}${cortesia}`;
    })
    .join(' · ');
}

/**
 * Chave de ordenação normalizada (ignora caixa e acentos).
 * @param {string} text - Texto.
 * @returns {string} Texto normalizado para comparação.
 */
export function sortKey(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Escolhe o tipo de produto padrão para uma nova linha de item:
 * o primeiro tipo do catálogo que possuir produtos. Evita abrir em
 * "Fatia" quando só existem bolos, por exemplo.
 * @param {Array<Object>} products - Produtos do catálogo.
 * @param {Array<string>} productTypes - Tipos válidos (order.PRODUCT_TYPES).
 * @returns {string} Tipo de produto.
 */
export function defaultItemType(products, productTypes) {
  const available = new Set((products || []).map((p) => p.tipoProduto));
  return (productTypes || []).find((t) => available.has(t)) || 'Fatia';
}
