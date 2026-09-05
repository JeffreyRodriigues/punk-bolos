/* ============================================================
   DATERANGE.JS — Lógica pura de faixas de datas (presets)
   ------------------------------------------------------------
   Cálculos de presets sem DOM: "hoje", "ontem", "7dias",
   "30dias", "mes", "mespassado". A UI (dateFilter.js) apenas
   consome estas funções. Aceitam `now` injetável para testes.
   ============================================================ */

/** Data ISO local (YYYY-MM-DD) a partir de uma Date. */
export function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Data de hoje no formato ISO local. */
export function todayISO(now = new Date()) {
  return toISO(now);
}

/**
 * Calcula a faixa de um preset rápido.
 * @param {string} name - Nome do preset.
 * @param {Date} [now] - Data de referência (default: agora).
 * @returns {{ from: string, to: string }}
 */
export function presetRange(name, now = new Date()) {
  const today = todayISO(now);
  switch (name) {
    case 'hoje':
      return { from: today, to: today };
    case 'ontem': {
      const from = new Date(now);
      from.setDate(from.getDate() - 1);
      const yesterday = toISO(from);
      return { from: yesterday, to: yesterday };
    }
    case '7dias': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: toISO(from), to: today };
    }
    case '30dias': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: toISO(from), to: today };
    }
    case 'mes': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISO(from), to: today };
    }
    case 'mespassado': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toISO(first), to: toISO(last) };
    }
    default:
      // "tudo" (ou nome desconhecido): faixa vazia
      return { from: '', to: '' };
  }
}

/**
 * Filtra pedidos por faixa de datas (comparação ISO).
 * @param {Array<Object>} orders - Pedidos (campo "data" ISO).
 * @param {{ from: string, to: string }} range - Faixa (vazia = sem filtro).
 * @returns {Array<Object>} Pedidos dentro do período.
 */
export function filterByRange(orders, range) {
  const from = (range && range.from) || '';
  const to = (range && range.to) || '';
  if (!from && !to) {
    return orders;
  }
  return (orders || []).filter((order) => {
    const d = order.data || '';
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
