/* ============================================================
   DASHBOARD.JS — Tela inicial (cards + gráficos + rankings)
   ------------------------------------------------------------
   Camada de INTERFACE do dashboard. Toda a regra de negócio
   (cálculos) fica em dashboardService.js. Este módulo:
   - renderiza os cards de resumo
   - desenha os gráficos (Chart.js) do período filtrado
   - renderiza os rankings de sabores e produtos
   - aplica as cores da identidade da Punk Bolos e se adapta ao tema

   Todos os indicadores respondem ao filtro de período
   (dateFilter): a cada mudança, dateFilter notifica e render() é
   chamado novamente.
   ============================================================ */

import * as storage from './storage.js';
import * as order from './order.js';
import * as product from './product.js';
import * as estoque from './estoque.js';
import * as dateFilter from './dateFilter.js';
import * as service from './dashboardService.js';
import { formatCurrency, formatDate } from '../utils/money.js';

/** Paleta da identidade Punk Bolos (rosa + complementos). */
const PALETTE = [
  '#e91e63', '#f06292', '#c2185b', '#ad1457', '#ff8a80',
  '#f8bbd0', '#f59e0b', '#7e57c2', '#26a69a', '#42a5f5',
];

/** Cores semânticas por status (mesmas do app). */
const STATUS_COLORS = {
  'Pendente': '#f59e0b',
  'Em Produção': '#e91e63',
  'Embalado': '#2563eb',
  'Concluído': '#16a34a',
  'Cancelado': '#dc2626',
};

/** Instâncias dos gráficos (para destruir antes de recriar). */
const charts = {};

/**
 * Tipo de produto ativo no filtro de abas do dashboard.
 * 'all' = visão geral; demais valores = tipo específico.
 */
let activeType = 'all';

/* ---------- Helpers de tema ---------- */

/**
 * Cores de texto/grade conforme o tema ativo (claro/escuro).
 * @returns {Object} Tema de cores para os gráficos.
 */
function chartTheme() {
  const dark = document.documentElement.classList.contains('dark');
  const fontFamily =
    getComputedStyle(document.documentElement).getPropertyValue('--font-family').trim() ||
    'Segoe UI, system-ui, sans-serif';
  return {
    dark,
    text: dark ? '#9aa0b4' : '#6b7280',
    grid: dark ? '#32364a' : '#e3e6ee',
    surface: dark ? '#1e2030' : '#ffffff',
    fontFamily,
  };
}

/**
 * Aplica os padrões globais do Chart.js para o tema atual.
 * @param {Object} theme - Tema calculado.
 */
function applyChartDefaults(theme) {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color = theme.text;
  Chart.defaults.borderColor = theme.grid;
  Chart.defaults.font.family = theme.fontFamily;
  Chart.defaults.animation.duration = 700;
  Chart.defaults.animation.easing = 'easeOutQuart';
}

/* ---------- Gerenciamento de gráficos ---------- */

/**
 * Destroi um gráfico existente (evita vazamentos/sobreposição).
 * @param {string} key - Identificador interno.
 */
function destroyChart(key) {
  if (charts[key]) {
    charts[key].destroy();
    delete charts[key];
  }
}

/**
 * Cria ou atualiza um gráfico de forma inteligente, evitando destruir o canvas
 * e vazamentos de memória quando a instância existente for reaproveitável.
 * @param {string} key - Identificador interno.
 * @param {string} canvasId - Id do canvas no HTML.
 * @param {Object} config - Configuração do Chart.js.
 */
function createChart(key, canvasId, config) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const existing = charts[key];
  if (
    existing &&
    existing.canvas === canvas &&
    existing.canvas.isConnected &&
    existing.config &&
    existing.config.type === config.type
  ) {
    existing.data = config.data;
    if (config.options) {
      existing.options = config.options;
    }
    existing.update();
    return;
  }

  destroyChart(key);
  charts[key] = new Chart(canvas.getContext('2d'), config);
}

/* ---------- Cards de resumo ---------- */

/**
 * Atualiza o valor de um card, preservando ícone e título.
 * @param {string} id - Id do card.
 * @param {string|number} text - Valor a exibir.
 */
function setStat(id, text) {
  const valueEl = document.querySelector(`#${id} .stat-value`);
  if (valueEl) {
    valueEl.textContent = text;
  }
}

/**
 * Atualiza o subtítulo/detalhe de um card (ex: Margem e CMV no lucro).
 * @param {string} id - Id do card.
 * @param {string} text - Texto complementar.
 */
function setStatSub(id, text) {
  let subEl = document.querySelector(`#${id} .stat-sub`);
  if (!subEl && text) {
    const card = document.getElementById(id);
    if (card) {
      subEl = document.createElement('span');
      subEl.className = 'stat-sub';
      card.appendChild(subEl);
    }
  }
  if (subEl) {
    subEl.textContent = text;
    subEl.hidden = !text;
  }
}

/**
 * Renderiza os cards de resumo a partir dos pedidos filtrados.
 * @param {Array<Object>} orders - Pedidos do período.
 */
function renderStats(orders) {
  const byStatus = service.countByStatus(orders);
  const byProduct = service.quantityByProduct(orders);
  const precificacoes = storage.getAllPrecificacoes();
  const products = storage.getAllProducts();
  const lucroInfo = service.lucroBruto(orders, precificacoes, products);

  setStat('stat-receita', formatCurrency(service.revenue(orders)));
  setStat('stat-pedidos', service.orderCount(orders));
  setStat('stat-pendentes', byStatus['Pendente'] || 0);
  setStat('stat-embalados', byStatus['Embalado'] || 0);
  setStat('stat-concluidos', byStatus['Concluído'] || 0);
  setStat('stat-fatias', byProduct['Fatia'] || 0);
  setStat('stat-bolos', byProduct['Bolo Inteiro'] || 0);
  setStat('stat-punkitos', byProduct['Punkitos'] || 0);
  setStat('stat-quantidade', service.totalQuantitySold(orders));
  setStat('stat-lucro', formatCurrency(lucroInfo.lucro));
  const margemTxt = Number.isFinite(lucroInfo.margem) ? lucroInfo.margem.toFixed(1) : '0.0';
  const cmvPctTxt = lucroInfo.cmvPct != null && Number.isFinite(lucroInfo.cmvPct) ? `${lucroInfo.cmvPct.toFixed(1)}%` : '';
  setStatSub(
    'stat-lucro',
    lucroInfo.custo > 0 ? `Margem: ${margemTxt}% · CMV: ${cmvPctTxt} (${formatCurrency(lucroInfo.custo)})` : ''
  );
  setStat('stat-ticket', formatCurrency(service.ticketMedio(orders)));
  setStat('stat-cortesia', service.countCortesia(orders));
}

/* ---------- Gráficos ---------- */

/**
 * Gráfico de faturamento diário (barras com gradiente da marca).
 */
function renderDailyRevenue(orders, theme) {
  const daily = service.dailyRevenue(orders);
  createChart('faturamento', 'chart-faturamento', {
    type: 'bar',
    data: {
      labels: daily.map((d) => formatDate(d.date)),
      datasets: [
        {
          label: 'Faturamento',
          data: daily.map((d) => d.value),
          backgroundColor: (context) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return PALETTE[0];
            const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
            gradient.addColorStop(0, theme.dark ? '#ff2d78' : '#e91e63');
            gradient.addColorStop(1, theme.dark ? '#5c1230' : '#f8bbd0');
            return gradient;
          },
          hoverBackgroundColor: theme.dark ? '#ff5c95' : '#c2185b',
          borderRadius: 6,
          maxBarThickness: 40,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx) => formatCurrency(ctx.parsed.y) },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
        },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => `R$ ${value}` },
        },
      },
    },
  });
}

/**
 * Gráfico de vendas por produto (rosca, por receita).
 */
function renderProductChart(orders, theme) {
  const byProduct = service.revenueByProduct(orders);
  const labels = Object.keys(byProduct);
  const values = labels.map((label) => byProduct[label]);

  createChart('produtos', 'chart-produtos', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderColor: theme.surface,
          borderWidth: 2,
          hoverOffset: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: { label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}` },
        },
      },
    },
  });
}

/**
 * Gráfico de vendas por sabor (barras horizontais, por quantidade).
 */
function renderFlavorChart(orders, theme) {
  const entries = Object.entries(service.quantityByFlavor(orders))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const labels = entries.map(([sabor]) => sabor);
  const values = entries.map(([, qtd]) => qtd);

  createChart('sabores', 'chart-sabores', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Unidades',
          data: values,
          backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]),
          borderRadius: 6,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 } },
        y: { grid: { display: false } },
      },
    },
  });
}

/**
 * Gráfico de quantidade de pedidos por status (inclui cancelados).
 */
function renderStatusChart(orders, theme) {
  const counts = service.countByStatus(orders);
  const labels = service.STATUS_ORDER;
  const values = labels.map((status) => counts[status] || 0);

  createChart('status', 'chart-status', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Pedidos',
          data: values,
          backgroundColor: labels.map((status) => STATUS_COLORS[status] || PALETTE[0]),
          borderRadius: 6,
          maxBarThickness: 36,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });
}

/** Cores para os meios de pagamento. */
const PAYMENT_COLORS = {
  'PIX': '#10b981',      // Esmeralda / Verde
  'Crédito': '#8b5cf6',  // Roxo
  'Débito': '#3b82f6',   // Azul
  'Dinheiro': '#f59e0b', // Âmbar / Laranja
};

/**
 * Gráfico de faturamento por meio de pagamento (Donut / Rosca).
 */
function renderPaymentChart(orders, theme) {
  const byPayment = service.revenueByPaymentMethod(orders);
  const labels = Object.keys(byPayment).filter((k) => byPayment[k] > 0);
  const values = labels.map((k) => byPayment[k]);

  if (values.length === 0) {
    createChart('pagamentos', 'chart-pagamentos', {
      type: 'doughnut',
      data: {
        labels: ['Sem dados'],
        datasets: [{ data: [1], backgroundColor: [theme.dark ? '#32364a' : '#e3e6ee'] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return;
  }

  createChart('pagamentos', 'chart-pagamentos', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((k) => PAYMENT_COLORS[k] || PALETTE[0]),
          borderColor: theme.surface,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
    },
  });
}

/** Cores para os canais de entrega. */
const DELIVERY_COLORS = {
  'Retirada': '#0ea5e9',        // Azul Celeste
  'Entrega Própria': '#10b981', // Verde Esmeralda
  'Uber Cliente': '#f59e0b',    // Âmbar / Laranja
};

/**
 * Gráfico de pedidos e faturamento por canal de entrega (Donut / Rosca).
 */
function renderDeliveryChart(orders, theme) {
  const summary = service.summaryByDeliveryMethod(orders);
  const labels = Object.keys(summary).filter((k) => summary[k].count > 0);
  const values = labels.map((k) => summary[k].count);
  const totalCount = values.reduce((a, b) => a + b, 0);

  if (totalCount === 0) {
    createChart('entrega', 'chart-entrega', {
      type: 'doughnut',
      data: {
        labels: ['Sem dados'],
        datasets: [{ data: [1], backgroundColor: [theme.dark ? '#32364a' : '#e3e6ee'] }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
    return;
  }

  createChart('entrega', 'chart-entrega', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data: values,
          backgroundColor: labels.map((k) => DELIVERY_COLORS[k] || PALETTE[0]),
          borderColor: theme.surface,
          borderWidth: 2,
          hoverOffset: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const method = ctx.label;
              const info = summary[method] || { count: 0, revenue: 0 };
              const pct = totalCount > 0 ? ((info.count / totalCount) * 100).toFixed(1) : '0.0';
              return ` ${info.count} pedidos (${pct}%) · ${formatCurrency(info.revenue)}`;
            },
          },
        },
      },
    },
  });
}

/* ---------- Rankings ---------- */

/**
 * Cria um item de ranking (posição + nome + quantidade + barra).
 */
function rankItem(position, name, qtyText, percent) {
  const row = document.createElement('div');
  row.className = 'rank-item';

  const meta = document.createElement('div');
  meta.className = 'rank-meta';

  const posEl = document.createElement('span');
  posEl.className = 'rank-pos';
  posEl.textContent = position;

  const nameEl = document.createElement('span');
  nameEl.className = 'rank-name';
  nameEl.textContent = name;

  const qtyEl = document.createElement('span');
  qtyEl.className = 'rank-qty';
  qtyEl.textContent = qtyText;

  meta.append(posEl, nameEl, qtyEl);

  const bar = document.createElement('div');
  bar.className = 'rank-bar';
  const fill = document.createElement('div');
  fill.className = 'rank-bar-fill';
  fill.style.width = `${Math.max(2, percent)}%`;
  bar.appendChild(fill);

  row.append(meta, bar);
  return row;
}

/**
 * Preenche uma lista de ranking com os dados informados.
 */
function fillRanking(containerId, data, unitLabel) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (data.length === 0) {
    container.innerHTML = '<p class="rank-empty">Sem dados no período.</p>';
    return;
  }
  const max = data[0].quantidade || 1;
  data.forEach((item, index) => {
    container.appendChild(
      rankItem(index + 1, item.sabor || item.produto, `${item.quantidade} ${unitLabel}`, (item.quantidade / max) * 100)
    );
  });
}

/**
 * Renderiza os rankings de sabores e produtos.
 */
function renderRankings(orders) {
  fillRanking('ranking-sabores', service.rankingSabores(orders, 5), 'un');
}

/* ---------- Abas de tipo de produto (Ideia 1) ---------- */

const TYPE_TABS = [
  { value: 'all',          label: 'Geral' },
  { value: 'Fatia',        label: 'Fatias' },
  { value: 'Punkitos',     label: 'Punkitos' },
  { value: 'Bolo Inteiro', label: 'Bolos' },
  { value: 'Docinho',      label: 'Docinhos' },
];

/**
 * Renderiza as abas de filtro por tipo no topo do dashboard.
 */
function renderTypeTabs() {
  const container = document.getElementById('dash-type-tabs');
  if (!container) return;
  container.innerHTML = '';
  TYPE_TABS.forEach(({ value, label }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dash-type-tab${activeType === value ? ' active' : ''}`;
    btn.dataset.type = value;
    btn.textContent = label;
    btn.addEventListener('click', () => {
      activeType = value;
      render();
    });
    container.appendChild(btn);
  });
}

/* ---------- Cards de resumo por tipo (Ideia 2) ---------- */

const TYPE_CONFIG = {
  'Fatia':        { label: 'Fatias',   color: 'type-fatia' },
  'Punkitos':     { label: 'Punkitos', color: 'type-punkitos' },
  'Bolo Inteiro': { label: 'Bolos',    color: 'type-bolo' },
  'Docinho':      { label: 'Docinhos', color: 'type-docinho' },
};

/**
 * Renderiza os cards de resumo rápido por tipo (sempre visíveis).
 * @param {Array<Object>} orders - Pedidos do período (sem filtro de tipo).
 */
function renderTypeSummaryCards(orders) {
  const container = document.getElementById('type-summary-grid');
  if (!container) return;
  const summary = service.summaryByType(orders);
  container.innerHTML = '';
  Object.entries(summary).forEach(([tipo, data]) => {
    const cfg = TYPE_CONFIG[tipo] || { label: tipo, color: '' };
    const card = document.createElement('div');
    card.className = `type-summary-card ${cfg.color}`;
    card.innerHTML = `
      <div class="type-summary-header">
        <span class="type-summary-label">${cfg.label}</span>
      </div>
      <div class="type-summary-qty">${data.quantidade} <span>un</span></div>
      <div class="type-summary-revenue">${formatCurrency(data.receita)}</div>
      <div class="type-summary-top">Mais vendido: ${data.topSabor}</div>
    `;
    container.appendChild(card);
  });
}

/* ---------- Rankings por tipo (Ideia 3) ---------- */

/**
 * Renderiza um bloco de ranking para um tipo específico.
 * @param {string} containerId - Id do container no HTML.
 * @param {Array} data - Dados do ranking.
 */
function fillTypeRanking(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  if (!data || data.length === 0) {
    container.innerHTML = '<p class="rank-empty">Sem dados no período.</p>';
    return;
  }
  const max = data[0].quantidade || 1;
  data.forEach((item, index) => {
    container.appendChild(
      rankItem(index + 1, item.sabor, `${item.quantidade} un`, (item.quantidade / max) * 100)
    );
  });
}

/**
 * Renderiza os rankings de sabores, um por tipo.
 * @param {Array<Object>} orders - Pedidos do período.
 */
function renderTypeRankings(orders) {
  const byType = service.rankingsByType(orders, 5);
  fillTypeRanking('ranking-fatias',    byType['Fatia']);
  fillTypeRanking('ranking-punkitos',  byType['Punkitos']);
  fillTypeRanking('ranking-bolos',     byType['Bolo Inteiro']);
  fillTypeRanking('ranking-docinhos',  byType['Docinho']);
}

/* ---------- Render principal ---------- */

/**
 * Vincula cliques rápidos dos cards da Visão do Dia às abas correspondentes.
 */
function initTodayPanelClicks() {
  const cardOrders = document.getElementById('dash-today-orders');
  if (cardOrders && !cardOrders.dataset.bound) {
    cardOrders.dataset.bound = 'true';
    cardOrders.addEventListener('click', () => {
      document.querySelector('.nav-tab[data-view-target="orders"], .nav-tab[data-tab="pedidos"]')?.click();
    });
  }

  const cardStock = document.getElementById('dash-today-stock');
  if (cardStock && !cardStock.dataset.bound) {
    cardStock.dataset.bound = 'true';
    cardStock.addEventListener('click', () => {
      document.querySelector('.nav-tab[data-view-target="estoque"], .nav-tab[data-tab="estoque"]')?.click();
    });
  }

  const cardAlerts = document.getElementById('dash-today-alerts');
  if (cardAlerts && !cardAlerts.dataset.bound) {
    cardAlerts.dataset.bound = 'true';
    cardAlerts.addEventListener('click', () => {
      document.querySelector('.nav-tab[data-view-target="inventario"], .nav-tab[data-tab="inventario"]')?.click();
      setTimeout(() => {
        const pillBaixo = document.querySelector('.inventory-filter-pill[data-filter="baixo"]');
        if (pillBaixo) pillBaixo.click();
      }, 50);
    });
  }
}

/**
 * Renderiza o painel operacional "Visão do Dia" (Ação Imediata da Cozinha).
 */
function renderTodayPanel() {
  const panel = document.getElementById('dash-today-panel');
  if (!panel) return;

  initTodayPanelClicks();

  const todayStr = new Date().toISOString().slice(0, 10);
  const dateEl = document.getElementById('dash-today-date');
  if (dateEl) {
    dateEl.textContent = formatDate(todayStr);
  }

  // 1. Encomendas de hoje
  const allOrders = order.getOrders();
  const todaySummary = service.todayOrdersSummary(allOrders, todayStr);
  const ordersValEl = document.getElementById('dash-today-orders-val');
  const ordersSubEl = document.getElementById('dash-today-orders-sub');
  if (ordersValEl) ordersValEl.textContent = todaySummary.total;
  if (ordersSubEl) {
    ordersSubEl.textContent = `${todaySummary.pendentes} pendentes · ${todaySummary.prontas} prontas`;
  }

  // 2. Pronta Entrega disponível
  const allProducts = storage.getAllProducts();
  const prontaSummary = service.prontaEntregaSummary(allProducts, (p) => estoque.disponivel(p));
  const stockValEl = document.getElementById('dash-today-stock-val');
  const stockSubEl = document.getElementById('dash-today-stock-sub');
  if (stockValEl) stockValEl.textContent = `${prontaSummary.totalUnidades} un`;
  if (stockSubEl) {
    stockSubEl.textContent = prontaSummary.totalProdutosComEstoque > 0
      ? `${prontaSummary.totalProdutosComEstoque} produtos com estoque`
      : 'Nenhum item pronto';
  }

  // 3. Alertas de Insumos (críticos / zerados)
  const allInsumos = storage.getAllInsumos();
  const lowStockSummary = service.lowStockInsumosSummary(allInsumos);
  const alertsValEl = document.getElementById('dash-today-alerts-val');
  const alertsSubEl = document.getElementById('dash-today-alerts-sub');
  if (alertsValEl) {
    alertsValEl.textContent = lowStockSummary.totalCriticos;
    alertsValEl.style.color = lowStockSummary.totalCriticos > 0 ? 'var(--color-danger)' : 'var(--color-ok)';
  }
  if (alertsSubEl) {
    if (lowStockSummary.totalCriticos === 0) {
      alertsSubEl.textContent = 'Estoque 100% abastecido';
      alertsSubEl.style.color = 'var(--color-text-muted)';
    } else {
      const parts = [];
      if (lowStockSummary.zerados > 0) parts.push(`${lowStockSummary.zerados} zerados`);
      if (lowStockSummary.baixos > 0) parts.push(`${lowStockSummary.baixos} baixos`);
      alertsSubEl.textContent = parts.join(' · ');
      alertsSubEl.style.color = 'var(--color-danger)';
    }
  }
}

/**
 * Renderiza o dashboard completo para o período filtrado.
 */
export function render() {
  const all = order.getOrders();
  const range = dateFilter.getRange();
  const periodFiltered = service.filterByRange(all, range);
  // Aplica o filtro de tipo quando uma aba específica está ativa
  const orders = service.filterByType(periodFiltered, activeType === 'all' ? null : activeType);
  const hasData = periodFiltered.length > 0;

  const emptyEl = document.getElementById('charts-empty');
  if (emptyEl) {
    emptyEl.hidden = hasData;
  }

  renderTypeTabs();
  renderTodayPanel();
  renderStats(orders);

  const theme = chartTheme();
  applyChartDefaults(theme);
  renderDailyRevenue(orders, theme);
  renderStatusChart(orders, theme);
  renderPaymentChart(orders, theme);
  renderDeliveryChart(orders, theme);
  renderRankings(orders);

  // Seções por tipo usam sempre os dados completos do período (sem filtro de aba)
  renderTypeSummaryCards(periodFiltered);
  renderTypeRankings(periodFiltered);
}

/**
 * Compatibilidade: agrega os mesmos indicadores do dashboard
 * (antes viviam neste módulo; hoje são calculados pelo
 * DashboardService).
 * @param {Array<Object>} orders - Pedidos.
 * @returns {Object} Estatísticas no formato legado.
 */
export function computeStats(orders) {
  const byStatus = service.countByStatus(orders);
  return {
    receita: service.revenue(orders),
    total: service.orderCount(orders),
    pendentes: byStatus['Pendente'],
    embalados: byStatus['Embalado'],
    concluidos: byStatus['Concluído'],
    fatias: service.quantityByProduct(orders)['Fatia'] || 0,
    bolos: service.quantityByProduct(orders)['Bolo Inteiro'] || 0,
    punkitos: service.quantityByProduct(orders)['Punkitos'] || 0,
    ticket: service.ticketMedio(orders),
  };
}
