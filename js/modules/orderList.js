/* ============================================================
   ORDERLIST.JS — Lista de pedidos (cards + busca + filtros)
   ------------------------------------------------------------
   Responsável por:
   - renderizar os pedidos como cards
   - pesquisa instantânea por cliente/número
   - filtros por cliente, produto e status
   - ações dos cards: Editar, Excluir, Duplicar, Concluir, Cancelar
   - estado vazio quando não há resultados
   ============================================================ */

import * as storage from './storage.js?v=12';
import * as order from './order.js?v=13';
import * as dateFilter from './dateFilter.js?v=12';
import { showToast } from './toast.js?v=12';
import { formatCurrency, formatDate } from '../utils/money.js?v=12';

/* ---------- Elementos do DOM ---------- */
const listEl = document.getElementById('orderList');
const emptyState = document.getElementById('emptyState');
const countEl = document.getElementById('orderCount');
const searchInput = document.getElementById('orderSearch');
const filterCliente = document.getElementById('filter-cliente');
const filterProduto = document.getElementById('filter-produto');
const filterStatus = document.getElementById('filter-status');

/** Callback de ação (setado por app.js): editar / concluir / cancelar */
let onAction = { edit: () => {}, complete: () => {}, cancel: () => {} };

/**
 * Registra os callbacks de ações disparadas pelos cards.
 * @param {Object} handlers - { edit, complete, cancel }
 */
export function setActionHandlers(handlers) {
  onAction = { ...onAction, ...handlers };
}

/**
 * Retorna a lista de pedidos que atende aos filtros e à busca atuais.
 * @returns {Array<Object>} Pedidos filtrados (mais recentes primeiro).
 */
function getFilteredOrders() {
  const query = searchInput.value.trim().toLowerCase();
  const cliente = filterCliente.value;
  const produto = filterProduto.value;
  const status = filterStatus.value;

  return dateFilter
    .applyFilter(order.getOrders())
    .filter((o) => {
      // Busca instantânea: casa com cliente ou número do pedido
      if (query) {
        const matchesName = (o.cliente || '').toLowerCase().includes(query);
        const matchesNumber = String(o.numero || '').includes(query);
        if (!matchesName && !matchesNumber) return false;
      }
      if (cliente && o.cliente !== cliente) return false;
      if (produto) {
        const matchesProduct = (Array.isArray(o.itens) ? o.itens : []).some(
          (item) => item.tipoProduto === produto
        );
        if (!matchesProduct) return false;
      }
      if (status && o.status !== status) return false;
      return true;
    })
    .sort((a, b) => b.numero - a.numero); // mais recente no topo
}

/**
 * Atualiza a lista de clientes do filtro (com base nos pedidos reais).
 * Mantém a seleção atual se o valor ainda existir.
 */
function updateClienteFilter() {
  const current = filterCliente.value;
  const clientes = [...new Set(order.getOrders().map((o) => o.cliente))].sort();
  filterCliente.innerHTML = '<option value="">Cliente: Todos</option>';
  clientes.forEach((c) => {
    if (!c) return;
    const opt = document.createElement('option');
    opt.value = c;
    opt.textContent = c;
    filterCliente.appendChild(opt);
  });
  if (clientes.includes(current)) {
    filterCliente.value = current;
  }
}

/**
 * Renderiza os cards de pedidos e atualiza o contador.
 */
export function render() {
  updateClienteFilter();

  const filtered = getFilteredOrders();
  countEl.textContent = filtered.length;

  listEl.innerHTML = '';
  filtered.forEach((o) => listEl.appendChild(createCard(o)));

  emptyState.hidden = filtered.length > 0;
}

/**
 * Formata a lista de itens de um pedido para exibição.
 * O campo "sabor" guarda o título do produto do catálogo.
 * Ex.: "2× Fatia de chocolate · 1× Bolo M Red Velvet"
 * @param {Object} o - Pedido.
 * @returns {string} Descrição dos itens.
 */
function describeItens(o) {
  const items = Array.isArray(o.itens) ? o.itens : [];
  if (items.length === 0) {
    return '—';
  }
  return items
    .map((item) => {
      const qty = Number(item.quantidade) || 0;
      const type = item.tipoProduto || 'Fatia';
      const label = item.sabor || type;
      return `${qty}× ${label}`;
    })
    .join(' · ');
}

/**
 * Cria o card de um pedido.
 * @param {Object} o - Pedido.
 * @returns {HTMLElement} Elemento do card.
 */
function createCard(o) {
  const card = document.createElement('article');
  card.className = 'order-card';

  /* Cabeçalho: número + data */
  const header = document.createElement('div');
  header.className = 'order-card-header';

  const number = document.createElement('span');
  number.className = 'order-number';
  number.textContent = `#${o.numero}`;

  const date = document.createElement('span');
  date.className = 'order-date';
  date.textContent = formatDate(o.data);

  header.append(number, date);

  /* Cliente */
  const customer = document.createElement('div');
  customer.className = 'order-customer';
  customer.textContent = o.cliente || '—';

  /* Detalhes: itens (tipo + tamanho + sabor + quantidade) */
  const detail = document.createElement('div');
  detail.className = 'order-detail';

  const itemsLine = document.createElement('span');
  itemsLine.textContent = describeItens(o);

  detail.append(itemsLine);

  /* Valor + status */
  const footer = document.createElement('div');
  footer.className = 'order-card-header';

  const value = document.createElement('span');
  value.className = 'order-value';
  value.textContent = formatCurrency(o.valorTotal);

  const badge = document.createElement('span');
  badge.className = `badge ${o.status.replace(/\s+/g, '-')}`;
  badge.textContent = o.status;

  footer.append(value, badge);

  /* Ações */
  const actions = document.createElement('div');
  actions.className = 'order-card-actions';

  actions.append(
    createIconBtn('✏️', 'Editar', () => onAction.edit(o)),
    createIconBtn('⧉', 'Duplicar', () => duplicate(o)),
    createIconBtn('🗑️', 'Excluir', () => remove(o), 'danger'),
  );

  // Botões contextuais por status
  if (o.status !== 'Concluído' && o.status !== 'Cancelado') {
    actions.insertBefore(
      createIconBtn('✅', 'Concluir', () => onAction.complete(o), 'ok'),
      actions.firstChild,
    );
  }
  if (o.status !== 'Cancelado') {
    actions.appendChild(createIconBtn('🚫', 'Cancelar', () => onAction.cancel(o), 'danger'));
  }

  card.append(header, customer, detail, footer, actions);
  return card;
}

/**
 * Cria um botão de ícone com tooltip (title).
 * @param {string} icon - Emoji/ícone do botão.
 * @param {string} label - Texto de acessibilidade/tooltip.
 * @param {Function} onClick - Handler de clique.
 * @param {string} [variant] - "danger" ou "ok" (estilos extras).
 * @returns {HTMLButtonElement} Botão criado.
 */
function createIconBtn(icon, label, onClick, variant = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn ${variant}`.trim();
  btn.textContent = icon;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Duplica um pedido (novo número, status Pendente) e re-renderiza.
 * @param {Object} o - Pedido a duplicar.
 */
function duplicate(o) {
  const orders = order.getOrders();
  const newNumber = order.nextOrderNumber(orders);
  orders.push(order.duplicateOrder(o, newNumber));
  storage.save(orders);
  render();
  showToast(`Pedido #${o.numero} duplicado como #${newNumber}`);
}

/**
 * Exclui um pedido com confirmação.
 * @param {Object} o - Pedido a excluir.
 */
function remove(o) {
  const confirmed = window.confirm(`Excluir o pedido #${o.numero} (${o.cliente})?`);
  if (!confirmed) return;

  const orders = order.getOrders().filter((item) => item.id !== o.id);
  storage.save(orders);
  render();
  showToast(`Pedido #${o.numero} excluído`);
}

/* ---------- Eventos ---------- */

// Pesquisa instantânea (digitação) + re-render
searchInput.addEventListener('input', render);

// Filtros
filterCliente.addEventListener('change', render);
filterProduto.addEventListener('change', render);
filterStatus.addEventListener('change', render);
