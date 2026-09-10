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
    if (o.pagamento === 'Cortesia') return;
    const itens = Array.isArray(o.itens) ? o.itens : [];
    if (itens.length > 0) {
      itens.forEach((item) => {
        if (!item.cortesia) total += Number(item.quantidade) || 0;
      });
    } else {
      total += Number(o.quantidade) || 0;
    }
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
 * Lucro bruto no período: receita − custo dos produtos vendidos
 * (calculado a partir das receitas cadastradas na aba Precificação).
 * @param {Array<Object>} orders - Pedidos.
 * @param {Array<Object>} [precificacoes] - Receitas de precificação.
 * @param {Array<Object>} [products] - Catálogo de produtos.
 * @returns {{ receita: number, custo: number, lucro: number, margem: number }}
 */
export function lucroBruto(orders, precificacoes = [], products = []) {
  const receita = revenue(orders);
  const recByProd = new Map((precificacoes || []).map((r) => [String(r.produtoId || ''), r]));

  let custoTotal = 0;
  activeOrders(orders).forEach((o) => {
    if (o.pagamento === 'Cortesia') return;
    const itens = Array.isArray(o.itens) ? o.itens : [];
    itens.forEach((item) => {
      if (item.cortesia) return;
      const prodId = resolveItemProductId(item, products);
      const r = recByProd.get(prodId);
      const custoUnit = r ? Number(r.custoPorUnidade) || 0 : 0;
      custoTotal += (Number(item.quantidade) || 0) * custoUnit;
    });
  });

  const custo = round2(custoTotal);
  const lucro = round2(receita - custo);
  const margem = receita > 0 ? round2((lucro / receita) * 100) : 0;

  return {
    receita: round2(receita),
    custo,
    lucro,
    margem,
  };
}

/**
 * Identifica o ID do produto para um item de pedido.
 */
function resolveItemProductId(item, products = []) {
  if (item && item.produtoId) return String(item.produtoId);
  const sabor = String(item && item.sabor ? item.sabor : '').trim().toLowerCase();
  const match = (products || []).find((p) =>
    p.tipoProduto === item.tipoProduto &&
    (p.tamanho || '') === (item.tamanho || '') &&
    Number(p.valor) === Number(item.valorUnitario) &&
    (!sabor || String(p.titulo || '').trim().toLowerCase() === sabor)
  ) || (products || []).find((p) =>
    p.tipoProduto === item.tipoProduto &&
    (p.tamanho || '') === (item.tamanho || '') &&
    Number(p.valor) === Number(item.valorUnitario)
  );
  return match ? String(match.id) : '';
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

/**
 * Soma a quantidade de itens em pedidos não cancelados com pagamento Cortesia.
 * @param {Array<Object>} orders - Pedidos.
 * @returns {number} Total de itens cortesia.
 */
export function countCortesia(orders) {
  return activeOrders(orders).reduce((total, o) => {
    const qtd = (Array.isArray(o.itens) ? o.itens : []).reduce((s, item) => {
      const isCortesiaItem = item.cortesia || o.pagamento === 'Cortesia';
      return s + (isCortesiaItem ? (Number(item.quantidade) || 0) : 0);
    }, 0);
    return total + qtd;
  }, 0);
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
  forEachItem(orders, (item, o) => {
    if (item.cortesia || o.pagamento === 'Cortesia') return;
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
  forEachItem(orders, (item, o) => {
    if (item.cortesia || o.pagamento === 'Cortesia') return;
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
  forEachItem(orders, (item, o) => {
    if (item.cortesia || o.pagamento === 'Cortesia') return;
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
  forEachItem(orders, (item, o) => {
    if (item.cortesia || o.pagamento === 'Cortesia') return;
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
    (Array.isArray(o.itens) ? o.itens : []).forEach((item) => cb(item, o));
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

/* ---------- Filtro e agregações por tipo de produto ---------- */

/**
 * Projeta os pedidos mantendo apenas os itens do tipo informado.
 * O valorTotal é recalculado a partir dos itens filtrados.
 * Pedidos sem nenhum item do tipo são excluídos.
 * @param {Array<Object>} orders - Pedidos.
 * @param {string} type - Tipo de produto ('Fatia' | 'Punkitos' | 'Bolo Inteiro').
 * @returns {Array<Object>} Pedidos projetados para o tipo.
 */
export function filterByType(orders, type) {
  if (!type || type === 'all') return orders || [];
  return (orders || [])
    .map((o) => {
      const isCortesiaOrder = o.pagamento === 'Cortesia';
      const itens = (Array.isArray(o.itens) ? o.itens : []).filter(
        (item) => item.tipoProduto === type
      );
      if (itens.length === 0) return null;
      const valorTotal = isCortesiaOrder
        ? 0
        : round2(
            itens.reduce(
              (s, item) =>
                s + (item.cortesia ? 0 : (Number(item.quantidade) || 0) * (Number(item.valorUnitario) || 0)),
              0
            )
          );
      return { ...o, itens, valorTotal };
    })
    .filter(Boolean);
}

/**
 * Retorna um resumo compacto por tipo de produto: quantidade vendida,
 * receita e sabor mais vendido do período.
 * @param {Array<Object>} orders - Pedidos (já filtrados por período se necessário).
 * @returns {Object} Mapa tipo -> { quantidade, receita, topSabor }.
 */
export function summaryByType(orders) {
  const tipos = ['Fatia', 'Punkitos', 'Bolo Inteiro'];
  const result = {};
  tipos.forEach((tipo) => {
    const filtered = filterByType(activeOrders(orders), tipo);
    const flavors = quantityByFlavor(filtered);
    const top = Object.entries(flavors).sort((a, b) => b[1] - a[1])[0];
    result[tipo] = {
      quantidade: totalQuantitySold(filtered),
      receita: revenue(filtered),
      topSabor: top ? top[0] : '—',
    };
  });
  return result;
}

/**
 * Rankings de sabores separados por tipo de produto.
 * @param {Array<Object>} orders - Pedidos do período.
 * @param {number} [limit=5] - Quantidade de itens por ranking.
 * @returns {Object} Mapa tipo -> Array<{ sabor, quantidade }>.
 */
export function rankingsByType(orders, limit = 5) {
  const tipos = ['Fatia', 'Punkitos', 'Bolo Inteiro'];
  const result = {};
  tipos.forEach((tipo) => {
    const filtered = filterByType(activeOrders(orders), tipo);
    result[tipo] = rankingSabores(filtered, limit);
  });
  return result;
}
