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

import * as order from './order.js?v=16';
import * as dateFilter from './dateFilter.js?v=13';
import * as service from './dashboardService.js?v=13';
import { formatCurrency, formatDate } from '../utils/money.js?v=12';

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
 * Cria um gráfico, destruindo o anterior do mesmo identificador.
 * @param {string} key - Identificador interno.
 * @param {string} canvasId - Id do canvas no HTML.
 * @param {Object} config - Configuração do Chart.js.
 */
function createChart(key, canvasId, config) {
  if (typeof Chart === 'undefined') return;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
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
 * Renderiza os cards de resumo a partir dos pedidos filtrados.
 * @param {Array<Object>} orders - Pedidos do período.
 */
function renderStats(orders) {
  const byStatus = service.countByStatus(orders);
  const byProduct = service.quantityByProduct(orders);

  setStat('stat-receita', formatCurrency(service.revenue(orders)));
  setStat('stat-pedidos', service.orderCount(orders));
  setStat('stat-pendentes', byStatus['Pendente'] || 0);
  setStat('stat-embalados', byStatus['Embalado'] || 0);
  setStat('stat-concluidos', byStatus['Concluído'] || 0);
  setStat('stat-fatias', byProduct['Fatia'] || 0);
  setStat('stat-bolos', byProduct['Bolo Inteiro'] || 0);
  setStat('stat-punkitos', byProduct['Punkitos'] || 0);
  setStat('stat-quantidade', service.totalQuantitySold(orders));
  setStat('stat-lucro', formatCurrency(service.lucroBruto(orders).lucro));
  setStat('stat-ticket', formatCurrency(service.ticketMedio(orders)));
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
  fillRanking('ranking-produtos', service.rankingProdutos(orders, 3), 'un');
}

/* ---------- Abas de tipo de produto (Ideia 1) ---------- */

const TYPE_TABS = [
  { value: 'all',          label: 'Geral',    icon: '📊' },
  { value: 'Fatia',        label: 'Fatias',   icon: '🍰' },
  { value: 'Punkitos',     label: 'Punkitos', icon: '🧁' },
  { value: 'Bolo Inteiro', label: 'Bolos',    icon: '🎂' },
];

/**
 * Renderiza as abas de filtro por tipo no topo do dashboard.
 */
function renderTypeTabs() {
  const container = document.getElementById('dash-type-tabs');
  if (!container) return;
  container.innerHTML = '';
  TYPE_TABS.forEach(({ value, label, icon }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `dash-type-tab${activeType === value ? ' active' : ''}`;
    btn.dataset.type = value;
    btn.innerHTML = `<span class="dash-type-tab-icon">${icon}</span> ${label}`;
    btn.addEventListener('click', () => {
      activeType = value;
      render();
    });
    container.appendChild(btn);
  });
}

/* ---------- Cards de resumo por tipo (Ideia 2) ---------- */

const TYPE_CONFIG = {
  'Fatia':        { icon: '🍰', label: 'Fatias',   color: 'type-fatia' },
  'Punkitos':     { icon: '🧁', label: 'Punkitos', color: 'type-punkitos' },
  'Bolo Inteiro': { icon: '🎂', label: 'Bolos',    color: 'type-bolo' },
};

/**
 * Renderiza os 3 cards de resumo rápido por tipo (sempre visíveis).
 * @param {Array<Object>} orders - Pedidos do período (sem filtro de tipo).
 */
function renderTypeSummaryCards(orders) {
  const container = document.getElementById('type-summary-grid');
  if (!container) return;
  const summary = service.summaryByType(orders);
  container.innerHTML = '';
  Object.entries(summary).forEach(([tipo, data]) => {
    const cfg = TYPE_CONFIG[tipo] || { icon: '📦', label: tipo, color: '' };
    const card = document.createElement('div');
    card.className = `type-summary-card ${cfg.color}`;
    card.innerHTML = `
      <div class="type-summary-header">
        <span class="type-summary-icon">${cfg.icon}</span>
        <span class="type-summary-label">${cfg.label}</span>
      </div>
      <div class="type-summary-qty">${data.quantidade} <span>un</span></div>
      <div class="type-summary-revenue">${formatCurrency(data.receita)}</div>
      <div class="type-summary-top">⭐ ${data.topSabor}</div>
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
 * Renderiza os 3 rankings de sabores, um por tipo.
 * @param {Array<Object>} orders - Pedidos do período.
 */
function renderTypeRankings(orders) {
  const byType = service.rankingsByType(orders, 5);
  fillTypeRanking('ranking-fatias',    byType['Fatia']);
  fillTypeRanking('ranking-punkitos',  byType['Punkitos']);
  fillTypeRanking('ranking-bolos',     byType['Bolo Inteiro']);
}

/* ---------- Render principal ---------- */

/**
 * Renderiza o dashboard completo para o período filtrado.
 */
export function render() {
  const all = order.getOrders();
  const periodFiltered = service.filterByRange(all, dateFilter.getRange());
  // Aplica o filtro de tipo quando uma aba específica está ativa
  const orders = service.filterByType(periodFiltered, activeType === 'all' ? null : activeType);
  const hasData = periodFiltered.length > 0;

  const emptyEl = document.getElementById('charts-empty');
  if (emptyEl) {
    emptyEl.hidden = hasData;
  }

  renderTypeTabs();
  renderStats(orders);

  const theme = chartTheme();
  applyChartDefaults(theme);
  renderDailyRevenue(orders, theme);
  renderProductChart(orders, theme);
  renderFlavorChart(orders, theme);
  renderStatusChart(orders, theme);
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
