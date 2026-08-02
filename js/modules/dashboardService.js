/* ============================================================
   DASHBOARDSERVICE.JS — Regras de negócio dos indicadores
   ------------------------------------------------------------
   Camada pura de cálculo do dashboard (sem DOM, sem Chart.js).
   A interface (dashboard.js) apenas consome estes dados.

   Regras de negócio:
   - Pedidos CANCELADOS não entram em receita, contagens,
     quantidade vendida nem ticket médio.
   - A distribuição POR STATUS inclui cancelados (é um retrato
     do fluxo atual, não receita).
   - Lucro bruto já está preparado para receber custos futuros:
     hoje o custo é 0, então lucro = receita (margem 100%).
   ============================================================ */

/** Tipos de produto conhecidos (para ordenação estável). */
export const PRODUCT_ORDER = ['Fatia', 'Punkitos', 'Bolo Inteiro'];

/** Status exibidos na distribuição por status. */
export const STATUS_ORDER = [
  'Pendente',
  'Em Produção',
  'Embalado',
  'Concluído',
  'Cancelado',
];

/* ---------- Filtro por faixa de datas ---------- */

/**
 * Filtra pedidos pela faixa de datas (comparação ISO "YYYY-MM-DD").
 * @param {Array<Object>} orders - Pedidos.
 * @param {{ from: string, to: string }} range - Faixa (vazia = sem limite).
 * @returns {Array<Object>} Pedidos dentro do período.
 */
export function filterByRange(orders, range) {
  const from = (range && range.from) || '';
  const to = (range && range.to) || '';
  if (!from && !to) {
    return orders || [];
  }
  return (orders || []).filter((order) => {
    const d = order.data || '';
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

/* ---------- Pedidos válidos (não cancelados) ---------- */

/**
 * Informa se o pedido foi cancelado.
 * @param {Object} order - Pedido.
 * @returns {boolean} true se cancelado.
 */
export function isCancelled(order) {
  return order.status === 'Cancelado';
}

/**
 * Retorna apenas pedidos não cancelados (base da receita).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Array<Object>} Pedidos ativos.
 */
export function activeOrders(orders) {
  return (orders || []).filter((order) => !isCancelled(order));
}

/* ---------- Indicadores principais ---------- */

/**
 * Receita no período: soma dos valorTotal (sem cancelados).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {number}
 */
export function revenue(orders) {
  return round2(
    activeOrders(orders).reduce((sum, o) => sum + (Number(o.valorTotal) || 0), 0)
  );
}

/**
 * Quantidade de pedidos no período (sem cancelados).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {number}
 */
export function orderCount(orders) {
  return activeOrders(orders).length;
}

/**
 * Quantidade total vendida: soma das quantidades dos itens
 * (sem cancelados).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {number}
 */
export function totalQuantitySold(orders) {
  let total = 0;
  activeOrders(orders).forEach((o) => {
    total += Number(o.quantidade) || 0;
  });
  return total;
}

/**
 * Ticket médio: receita ÷ pedidos não cancelados.
 * @param {Array<Object>} orders - Pedidos.
 * @returns {number}
 */
export function ticketMedio(orders) {
  const active = activeOrders(orders);
  const count = active.length;
  return count > 0 ? round2(revenue(active) / count) : 0;
}

/**
 * Lucro bruto no período. Preparado para cálculo futuro:
 * quando houver custos cadastrados, subtrair aqui.
 * Hoje: custo = 0 → lucro = receita.
 * @param {Array<Object>} orders - Pedidos.
 * @returns {{ receita: number, custo: number, lucro: number }}
 */
export function lucroBruto(orders) {
  const receita = revenue(orders);
  const custo = 0; // FUTURO: somar custo por produto/item quando existir
  return {
    receita: round2(receita),
    custo: round2(custo),
    lucro: round2(receita - custo),
  };
}

/**
 * Quantidade de pedidos por status (todos os status, inclusive
 * cancelados — é o retrato do fluxo).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Object} Mapa status -> quantidade de pedidos.
 */
export function countByStatus(orders) {
  const counts = {};
  STATUS_ORDER.forEach((s) => {
    counts[s] = 0;
  });
  (orders || []).forEach((o) => {
    if (Object.prototype.hasOwnProperty.call(counts, o.status)) {
      counts[o.status] += 1;
    }
  });
  return counts;
}

/* ---------- Agregações por data / produto / sabor ---------- */

/**
 * Faturamento por dia (soma dos valorTotal, sem cancelados).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Array<{ date: string, value: number }>} Ordenado por data.
 */
export function dailyRevenue(orders) {
  const map = {};
  activeOrders(orders).forEach((o) => {
    const d = o.data || '';
    if (!d) return;
    map[d] = (map[d] || 0) + (Number(o.valorTotal) || 0);
  });
  return Object.keys(map)
    .sort()
    .map((date) => ({ date, value: round2(map[date]) }));
}

/**
 * Receita por tipo de produto (soma qtd × valor dos itens).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Object} Mapa tipo -> receita.
 */
export function revenueByProduct(orders) {
  const map = {};
  forEachItem(orders, (item) => {
    const type = item.tipoProduto || 'Fatia';
    map[type] = (map[type] || 0) + (Number(item.quantidade) || 0) * (Number(item.valorUnitario) || 0);
  });
  return roundMap(map);
}

/**
 * Quantidade por tipo de produto (soma das quantidades dos itens).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Object} Mapa tipo -> quantidade.
 */
export function quantityByProduct(orders) {
  const map = {};
  forEachItem(orders, (item) => {
    const type = item.tipoProduto || 'Fatia';
    map[type] = (map[type] || 0) + (Number(item.quantidade) || 0);
  });
  return map;
}

/**
 * Quantidade por sabor (soma das quantidades dos itens).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Object} Mapa sabor -> quantidade.
 */
export function quantityByFlavor(orders) {
  const map = {};
  forEachItem(orders, (item) => {
    const sabor = (item.sabor || '').trim();
    if (!sabor) return;
    map[sabor] = (map[sabor] || 0) + (Number(item.quantidade) || 0);
  });
  return map;
}

/**
 * Receita por sabor (soma qtd × valor dos itens).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Object} Mapa sabor -> receita.
 */
export function revenueByFlavor(orders) {
  const map = {};
  forEachItem(orders, (item) => {
    const sabor = (item.sabor || '').trim();
    if (!sabor) return;
    map[sabor] = (map[sabor] || 0) + (Number(item.quantidade) || 0) * (Number(item.valorUnitario) || 0);
  });
  return roundMap(map);
}

/* ---------- Rankings ---------- */

/**
 * Ranking de sabores por quantidade vendida.
 * @param {Array<Object>} orders - Pedidos.
 * @param {number} [limit=5] - Quantos itens retornar.
 * @returns {Array<{ sabor: string, quantidade: number }>}
 */
export function rankingSabores(orders, limit = 5) {
  return toRanking(quantityByFlavor(orders), 'sabor', limit);
}

/**
 * Ranking de produtos por quantidade vendida.
 * @param {Array<Object>} orders - Pedidos.
 * @param {number} [limit=3] - Quantos itens retornar.
 * @returns {Array<{ produto: string, quantidade: number }>}
 */
export function rankingProdutos(orders, limit = 3) {
  return toRanking(quantityByProduct(orders), 'produto', limit);
}

/* ---------- Helpers internos ---------- */

/**
 * Percorre os itens dos pedidos não cancelados.
 */
function forEachItem(orders, cb) {
  activeOrders(orders).forEach((o) => {
    (Array.isArray(o.itens) ? o.itens : []).forEach(cb);
  });
}

/**
 * Converte um mapa em ranking ordenado (decrescente).
 */
function toRanking(map, keyName, limit) {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, quantidade]) => ({ [keyName]: name, quantidade }));
}

/**
 * Arredonda para 2 casas decimais.
 */
function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Arredonda todos os valores de um mapa.
 */
function roundMap(map) {
  Object.keys(map).forEach((k) => {
    map[k] = round2(map[k]);
  });
  return map;
}
