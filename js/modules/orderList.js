/* ============================================================
   ORDERLIST.JS — Lista de pedidos (cards + paginação + impressão + busca + filtros)
   ------------------------------------------------------------
   Responsável por:
   - renderizar os pedidos em modo Grade ou Lista Detalhada
   - paginação eficiente e responsiva (10 pedidos por página)
   - alternador de visualização com persistência no navegador
   - impressão individual de comanda/recibo do pedido
   - impressão em lote de todos os pedidos filtrados na tela
   - exibição detalhada de itens, observações, entrega e pagamento
   - pesquisa instantânea por cliente/número
   - filtros por cliente, produto e status
   - ações dos cards com botões em texto: Concluir, Editar, Duplicar, Imprimir, Cancelar, Excluir
   - estado vazio quando não há resultados
   ============================================================ */

import * as storage from './storage.js';
import * as order from './order.js';
import * as dateFilter from './dateFilter.js';
import { showToast } from './toast.js';
import { formatCurrency, formatDate } from '../utils/money.js';
import { formatarWhatsappLink, gerarMensagemPedido } from './customerService.js';

/* ---------- Constantes & Estado de Paginação ---------- */
const ITEMS_PER_PAGE = 10;
let currentPage = 1;

/* ---------- Elementos do DOM ---------- */
const listEl = document.getElementById('orderList');
const emptyState = document.getElementById('emptyState');
const countEl = document.getElementById('orderCount');
const searchInput = document.getElementById('orderSearch');
const filterCliente = document.getElementById('filter-cliente');
const filterProduto = document.getElementById('filter-produto');
const filterStatus = document.getElementById('filter-status');

const btnViewGrid = document.getElementById('btnOrderViewGrid');
const btnViewList = document.getElementById('btnOrderViewList');
const btnImprimirPedidos = document.getElementById('btnImprimirPedidos');
const btnImprimirCozinha = document.getElementById('btnImprimirCozinha');

const paginationNav = document.getElementById('orderPagination');
const btnPrevPage = document.getElementById('btnOrderPrevPage');
const btnNextPage = document.getElementById('btnOrderNextPage');
const paginationInfo = document.getElementById('orderPaginationInfo');
const printContainer = document.getElementById('printContainer');

const VIEW_STORAGE_KEY = 'punk_order_view_mode';
let currentViewMode = localStorage.getItem(VIEW_STORAGE_KEY) || 'grid';

/** Callback de ação (setado por app.js): editar / concluir / cancelar */
let onAction = { edit: () => {}, complete: () => {}, cancel: () => {} };
let onChange = () => {};

/**
 * Registra o callback de notificação de mudanças (ex.: exclusão/duplicação).
 * @param {Function} cb - Função chamada após alterar a lista de pedidos.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/**
 * Registra os callbacks de ações disparadas pelos cards.
 * @param {Object} handlers - { edit, complete, cancel }
 */
export function setActionHandlers(handlers) {
  onAction = { ...onAction, ...handlers };
}

/**
 * Aplica o modo de visualização (grade ou lista).
 * @param {string} mode - 'grid' ou 'list'.
 */
function setViewMode(mode) {
  currentViewMode = mode === 'list' ? 'list' : 'grid';
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, currentViewMode);
  } catch (_) {}

  if (listEl) {
    listEl.classList.remove('view-grid', 'view-list');
    listEl.classList.add(`view-${currentViewMode}`);
  }

  if (btnViewGrid && btnViewList) {
    btnViewGrid.classList.toggle('active', currentViewMode === 'grid');
    btnViewList.classList.toggle('active', currentViewMode === 'list');
  }
}

/**
 * Retorna a lista de pedidos que atende aos filtros e à busca atuais.
 * @returns {Array<Object>} Pedidos filtrados (mais recentes primeiro).
 */
function getFilteredOrders() {
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
  const cliente = filterCliente ? filterCliente.value : '';
  const produto = filterProduto ? filterProduto.value : '';
  const status = filterStatus ? filterStatus.value : '';

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
  if (!filterCliente) return;
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

function updatePendingBadge() {
  const badge = document.getElementById('pendingOrdersBadge');
  if (!badge) return;
  const orders = storage.getAll();
  const pendingCount = orders.filter((o) => o.status === 'Pendente').length;
  if (pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.hidden = false;
    badge.removeAttribute('hidden');
  } else {
    badge.hidden = true;
    badge.setAttribute('hidden', '');
  }
}

/**
 * Renderiza os cards de pedidos com paginação e atualiza os contadores.
 */
export function render() {
  updateClienteFilter();
  setViewMode(currentViewMode);
  updatePendingBadge();

  const filtered = getFilteredOrders();
  const totalItems = filtered.length;

  if (countEl) {
    countEl.textContent = totalItems;
  }

  // Cálculo de páginas
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  if (currentPage > totalPages) {
    currentPage = totalPages;
  }
  if (currentPage < 1) {
    currentPage = 1;
  }

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageOrders = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (listEl) {
    listEl.innerHTML = '';
    pageOrders.forEach((o) => listEl.appendChild(createCard(o)));
  }

  if (emptyState) {
    emptyState.hidden = totalItems > 0;
  }

  // Atualiza controles de paginação
  if (paginationNav) {
    if (totalItems <= ITEMS_PER_PAGE) {
      paginationNav.hidden = true;
      paginationNav.setAttribute('hidden', '');
    } else {
      paginationNav.hidden = false;
      paginationNav.removeAttribute('hidden');

      if (paginationInfo) {
        paginationInfo.textContent = `Página ${currentPage} de ${totalPages} (${totalItems} pedidos)`;
      }

      if (btnPrevPage) {
        btnPrevPage.disabled = currentPage <= 1;
      }
      if (btnNextPage) {
        btnNextPage.disabled = currentPage >= totalPages;
      }
    }
  }
}

/**
 * Cria o card de um pedido com visualização detalhada.
 * @param {Object} o - Pedido.
 * @returns {HTMLElement} Elemento do card.
 */
function createCard(o) {
  const card = document.createElement('article');
  card.className = 'order-card';

  /* Cabeçalho: número, data e badges */
  const header = document.createElement('div');
  header.className = 'order-card-header';

  const headerLeft = document.createElement('div');
  headerLeft.className = 'order-header-left';

  const number = document.createElement('span');
  number.className = 'order-number';
  number.textContent = `#${o.numero}`;

  const date = document.createElement('span');
  date.className = 'order-date';
  date.textContent = formatDate(o.data);

  headerLeft.append(number, date);

  const headerBadges = document.createElement('div');
  headerBadges.className = 'order-header-badges';

  const statusBadge = document.createElement('span');
  statusBadge.className = `badge ${String(o.status || 'Pendente').replace(/\s+/g, '-')}`;
  statusBadge.textContent = o.status || 'Pendente';
  headerBadges.appendChild(statusBadge);

  if (o.pagamento) {
    const payBadge = document.createElement('span');
    payBadge.className = 'badge payment-badge';
    payBadge.textContent = o.pagamento;
    headerBadges.appendChild(payBadge);
  }

  const itens = Array.isArray(o.itens) ? o.itens : [];
  const hasCortesia = itens.some((item) => item.cortesia);
  if (hasCortesia) {
    const cortesiaBadge = document.createElement('span');
    cortesiaBadge.className = 'badge cortesia-badge';
    cortesiaBadge.textContent = 'Cortesia';
    headerBadges.appendChild(cortesiaBadge);
  }

  // Botão Imprimir destacado e separado no cabeçalho do card
  const btnPrintCard = document.createElement('button');
  btnPrintCard.type = 'button';
  btnPrintCard.className = 'btn-card-print';
  btnPrintCard.textContent = 'Imprimir';
  btnPrintCard.title = `Imprimir comanda do pedido #${o.numero}`;
  btnPrintCard.addEventListener('click', (e) => {
    e.stopPropagation();
    printOrders([o]);
  });
  headerBadges.appendChild(btnPrintCard);

  header.append(headerLeft, headerBadges);

  /* Cliente e WhatsApp */
  const customerRow = document.createElement('div');
  customerRow.className = 'order-customer-row';

  const customerName = document.createElement('span');
  customerName.className = 'order-customer-name';
  customerName.textContent = o.cliente || 'Cliente não identificado';
  customerRow.appendChild(customerName);

  if (o.contato) {
    const msg = gerarMensagemPedido(o);
    const waLink = formatarWhatsappLink(o.contato, msg);
    if (waLink) {
      const waBtn = document.createElement('a');
      waBtn.href = waLink;
      waBtn.target = '_blank';
      waBtn.rel = 'noopener';
      waBtn.className = 'btn-order-wa';
      waBtn.title = `Conversar com ${o.cliente || 'Cliente'} no WhatsApp`;
      waBtn.textContent = 'WhatsApp';
      customerRow.appendChild(waBtn);
    }
  }

  /* Entrega / Retirada (sem duplicação de rótulo) */
  let deliveryEl = null;
  if (o.entrega) {
    deliveryEl = document.createElement('div');
    deliveryEl.className = 'order-delivery-box';
    const isRetirada = o.entrega === 'Retirada';
    const delBadge = document.createElement('span');
    delBadge.className = 'order-delivery-badge';
    delBadge.textContent = isRetirada ? 'Retirada' : (o.entrega.startsWith('Entrega') ? 'Entrega' : o.entrega);
    deliveryEl.appendChild(delBadge);

    if (!isRetirada && o.entrega !== 'Entrega') {
      const cleanAddress = o.entrega.replace(/^Entrega\s*\((.*)\)$/i, '$1').replace(/^Entrega\s*:\s*/i, '');
      if (cleanAddress && cleanAddress !== 'Retirada' && cleanAddress !== 'Entrega Própria' && cleanAddress !== 'Uber Cliente') {
        const delText = document.createElement('span');
        delText.textContent = cleanAddress;
        deliveryEl.appendChild(delText);
      }
    }
  }

  /* Itens do Pedido (discriminados) */
  const itemsContainer = document.createElement('div');
  itemsContainer.className = 'order-items-container';

  const itemsHeader = document.createElement('div');
  itemsHeader.className = 'order-items-header';
  const totalItemsCount = itens.reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
  itemsHeader.textContent = `Itens (${totalItemsCount})`;
  itemsContainer.appendChild(itemsHeader);

  itens.forEach((item) => {
    const itemRow = document.createElement('div');
    itemRow.className = 'order-item-entry';

    const itemInfo = document.createElement('div');
    const itemTitle = document.createElement('div');
    itemTitle.className = 'order-item-title';
    const size = item.tamanho ? ` (${item.tamanho})` : '';
    itemTitle.textContent = `${item.quantidade}× ${item.tipoProduto || ''} ${item.sabor || ''}${size}`.trim();

    itemInfo.appendChild(itemTitle);
    itemRow.appendChild(itemInfo);

    const itemPrice = document.createElement('div');
    itemPrice.className = 'order-item-price';
    if (item.cortesia) {
      itemPrice.textContent = 'Cortesia';
    } else {
      const subtotal = (Number(item.valorUnitario) || 0) * (Number(item.quantidade) || 0);
      itemPrice.textContent = formatCurrency(subtotal);
    }
    itemRow.appendChild(itemPrice);

    itemsContainer.appendChild(itemRow);
  });

  /* Observações & Personalizações */
  let obsEl = null;
  if (o.observacoes && String(o.observacoes).trim()) {
    obsEl = document.createElement('div');
    obsEl.className = 'order-obs-box';

    const obsTitle = document.createElement('div');
    obsTitle.className = 'order-obs-title';
    obsTitle.textContent = 'Observações / Personalização';

    const obsText = document.createElement('div');
    obsText.textContent = o.observacoes.trim();

    obsEl.append(obsTitle, obsText);
  }

  /* Rodapé: Total + Ações */
  const footer = document.createElement('div');
  footer.className = 'order-card-footer';

  const totalWrap = document.createElement('div');
  totalWrap.className = 'order-total-wrap';

  const totalLabel = document.createElement('span');
  totalLabel.className = 'order-total-label';
  totalLabel.textContent = 'Valor Total';

  const value = document.createElement('span');
  value.className = 'order-value';
  value.textContent = formatCurrency(o.valorTotal);

  totalWrap.append(totalLabel, value);

  /* Ações com botões em texto */
  const actions = document.createElement('div');
  actions.className = 'order-card-actions';

  // Botão Concluir (quando não estiver Concluído ou Cancelado)
  if (o.status !== 'Concluído' && o.status !== 'Cancelado') {
    actions.appendChild(
      createTextActionBtn('Concluir', () => onAction.complete(o), 'action-ok')
    );
  }

  actions.appendChild(createTextActionBtn('Editar', () => onAction.edit(o)));
  actions.appendChild(createTextActionBtn('Duplicar', () => duplicate(o)));

  if (o.status !== 'Cancelado') {
    actions.appendChild(
      createTextActionBtn('Cancelar', () => onAction.cancel(o), 'action-danger')
    );
  }

  actions.appendChild(
    createTextActionBtn('Excluir', () => remove(o), 'action-danger')
  );

  footer.append(totalWrap, actions);

  // Montagem final do card
  card.append(header, customerRow);
  if (deliveryEl) {
    card.appendChild(deliveryEl);
  }
  card.appendChild(itemsContainer);
  if (obsEl) {
    card.appendChild(obsEl);
  }
  card.appendChild(footer);

  return card;
}

/**
 * Cria um botão de ação com rótulo em texto puro.
 * @param {string} label - Rótulo do botão.
 * @param {Function} onClick - Handler de clique.
 * @param {string} [variant] - 'action-ok' ou 'action-danger'.
 * @returns {HTMLButtonElement} Botão criado.
 */
function createTextActionBtn(label, onClick, variant = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn-card-action ${variant}`.trim();
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Imprime um ou múltiplos pedidos formatados para comanda/recibo.
 * @param {Array<Object>} ordersList - Lista de pedidos a serem impressos.
 */
export function printOrders(ordersList = []) {
  if (!printContainer) return;
  if (!Array.isArray(ordersList) || ordersList.length === 0) {
    showToast('Nenhum pedido selecionado para impressão.', 'warn');
    return;
  }

  const htmlTickets = ordersList
    .map((o) => {
      const itens = Array.isArray(o.itens) ? o.itens : [];
      const itemsRows = itens
        .map((it) => {
          const size = it.tamanho ? ` (${it.tamanho})` : '';
          const price = it.cortesia
            ? 'Cortesia'
            : formatCurrency((Number(it.valorUnitario) || 0) * (Number(it.quantidade) || 0));
          return `
            <tr>
              <td class="print-td-qtd">${it.quantidade}×</td>
              <td class="print-td-desc"><strong>${it.tipoProduto || ''}</strong> ${it.sabor || ''}${size}</td>
              <td class="print-td-val">${price}</td>
            </tr>
          `;
        })
        .join('');

      const obsBlock =
        o.observacoes && String(o.observacoes).trim()
          ? `<div class="print-ticket-obs"><strong>Observações / Personalização:</strong><p>${String(
              o.observacoes
            ).trim()}</p></div>`
          : '';

      const entregaBlock = o.entrega ? `<div><strong>Entrega:</strong> ${o.entrega}</div>` : '';

      return `
        <div class="print-ticket">
          <div class="print-ticket-header">
            <div class="print-ticket-brand">PUNK BOLOS</div>
            <div class="print-ticket-order-num">PEDIDO #${o.numero}</div>
            <div class="print-ticket-date">Data: ${formatDate(o.data)} | Status: ${o.status || 'Pendente'}</div>
          </div>

          <div class="print-ticket-customer">
            <div><strong>Cliente:</strong> ${o.cliente || '—'}</div>
            ${o.contato ? `<div><strong>Contato:</strong> ${o.contato}</div>` : ''}
            ${entregaBlock}
          </div>

          <div class="print-ticket-items">
            <div class="print-items-title">ITENS DO PEDIDO</div>
            <table class="print-table">
              <tbody>
                ${itemsRows}
              </tbody>
            </table>
          </div>

          ${obsBlock}

          <div class="print-ticket-footer">
            <div><strong>Pagamento:</strong> ${o.pagamento || 'PIX'}</div>
            <div class="print-ticket-total">TOTAL: ${formatCurrency(o.valorTotal)}</div>
          </div>
        </div>
      `;
    })
    .join('');

  printContainer.innerHTML = htmlTickets;
  window.print();
}

/**
 * Imprime o Resumo Consolidado de Cozinha (total por produto/sabor e observações).
 * @param {Array<Object>} ordersList - Lista de pedidos a consolidar.
 */
export function printKitchenSummary(ordersList = []) {
  if (!printContainer) return;
  if (!Array.isArray(ordersList) || ordersList.length === 0) {
    showToast('Nenhum pedido filtrado para imprimir.', 'warn');
    return;
  }

  // Filtra apenas pedidos não cancelados
  const activeOrders = ordersList.filter((o) => o.status !== 'Cancelado');
  if (activeOrders.length === 0) {
    showToast('Nenhum pedido ativo para consolidar na cozinha.', 'warn');
    return;
  }

  // Agrega itens por chave única (tipoProduto, tamanho, sabor)
  const itemsMap = new Map();
  let totalItens = 0;
  const observacoes = [];

  activeOrders.forEach((o) => {
    const orderNum = o.numero ? `#${o.numero}` : 'Pedido';
    const clientName = o.cliente || 'Cliente';

    // Observações do pedido
    if (o.observacoes && String(o.observacoes).trim()) {
      observacoes.push({
        origem: `${orderNum} (${clientName})`,
        texto: String(o.observacoes).trim(),
      });
    }

    const items = Array.isArray(o.itens) ? o.itens : [];
    items.forEach((it) => {
      const tipo = it.tipoProduto || 'Outro';
      const sabor = it.sabor || it.titulo || 'Padrão';
      const tamanho = it.tamanho || '';
      const qtd = Number(it.quantidade) || 1;
      totalItens += qtd;

      const key = `${tipo}__${tamanho}__${sabor}`;
      if (!itemsMap.has(key)) {
        itemsMap.set(key, {
          tipo,
          sabor,
          tamanho,
          quantidade: 0,
        });
      }
      itemsMap.get(key).quantidade += qtd;
    });
  });

  // Converte para array e ordena por tipo e quantidade descrescente
  const aggregatedItems = [...itemsMap.values()].sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo.localeCompare(b.tipo);
    return b.quantidade - a.quantidade;
  });

  const range = dateFilter.getRange();
  const periodoTxt = range.from || range.to
    ? `Período: ${formatDate(range.from) || 'início'} até ${formatDate(range.to) || 'hoje'}`
    : `Data de Emissão: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const rowsHtml = aggregatedItems
    .map((it) => {
      const tamStr = it.tamanho ? ` <span style="font-size:0.85em; opacity:0.85;">(${it.tamanho})</span>` : '';
      return `
        <tr>
          <td style="padding: 6px 8px; border-bottom: 1px solid #ddd; font-weight: 700;">${it.sabor}${tamStr}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #ddd; text-transform: uppercase; font-size: 0.8em;">${it.tipo}</td>
          <td style="padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: right; font-size: 1.1em; font-weight: 800;">${it.quantidade} un</td>
        </tr>
      `;
    })
    .join('');

  const obsHtml = observacoes.length > 0
    ? `
      <div style="margin-top: 14px; padding-top: 10px; border-top: 2px dashed #333;">
        <div style="font-weight: 800; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 6px;">Observações e Personalizações</div>
        <ul style="margin: 0; padding-left: 16px; font-size: 0.85rem; line-height: 1.4;">
          ${observacoes.map((ob) => `<li><strong>${ob.origem}:</strong> ${ob.texto}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  const html = `
    <div class="print-ticket" style="font-family: monospace, sans-serif; max-width: 480px; margin: 0 auto; padding: 12px; border: 1px solid #000; background: #fff; color: #000;">
      <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px;">
        <h2 style="margin: 0 0 4px; font-size: 1.15rem; font-weight: 900; text-transform: uppercase;">PUNK BOLOS — RESUMO DE COZINHA</h2>
        <div style="font-size: 0.8rem; font-weight: 600;">${periodoTxt}</div>
        <div style="font-size: 0.85rem; margin-top: 4px; font-weight: 700;">${activeOrders.length} Pedidos Ativos · ${totalItens} Unidades no Total</div>
      </div>

      <div style="font-weight: 800; font-size: 0.85rem; text-transform: uppercase; margin-bottom: 6px;">ITENS CONSOLIDADOS A PREPARAR</div>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem;">
        <thead>
          <tr style="border-bottom: 1.5px solid #000; text-align: left; font-size: 0.75rem; text-transform: uppercase;">
            <th style="padding: 4px 8px;">Produto / Sabor</th>
            <th style="padding: 4px 8px;">Tipo</th>
            <th style="padding: 4px 8px; text-align: right;">Qtd</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      ${obsHtml}

      <div style="text-align: center; margin-top: 14px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 0.75rem; color: #555;">
        Gerado pelo Sistema Punk Bolos
      </div>
    </div>
  `;

  printContainer.innerHTML = html;
  window.print();
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
  onChange();
  showToast(`Pedido #${o.numero} duplicado como #${newNumber}`);
}

/**
 * Exclui um pedido com confirmação.
 * @param {Object} o - Pedido a excluir.
 */
async function remove(o) {
  const confirmed = window.confirm(`Excluir o pedido #${o.numero} (${o.cliente})?`);
  if (!confirmed) return;

  try {
    await storage.deleteOrder(o.id);
    render();
    onChange();
    showToast(`Pedido #${o.numero} excluído`);
  } catch (err) {
    showToast(`Erro ao excluir pedido: ${err && err.message ? err.message : 'Falha na conexão'}`, 'error');
  }
}

/* ---------- Eventos ---------- */
const resetAndRender = () => {
  currentPage = 1;
  render();
};

if (searchInput) {
  searchInput.addEventListener('input', resetAndRender);
}

if (filterCliente) {
  filterCliente.addEventListener('change', resetAndRender);
}

if (filterProduto) {
  filterProduto.addEventListener('change', resetAndRender);
}

if (filterStatus) {
  filterStatus.addEventListener('change', resetAndRender);
}

if (btnViewGrid) {
  btnViewGrid.addEventListener('click', () => {
    setViewMode('grid');
  });
}

if (btnViewList) {
  btnViewList.addEventListener('click', () => {
    setViewMode('list');
  });
}

if (btnPrevPage) {
  btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

if (btnNextPage) {
  btnNextPage.addEventListener('click', () => {
    currentPage++;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

if (btnImprimirPedidos) {
  btnImprimirPedidos.addEventListener('click', () => {
    const list = getFilteredOrders();
    if (!list || list.length === 0) {
      showToast('Nenhum pedido filtrado para imprimir.', 'warn');
      return;
    }
    printOrders(list);
  });
}

if (btnImprimirCozinha) {
  btnImprimirCozinha.addEventListener('click', () => {
    const list = getFilteredOrders();
    if (!list || list.length === 0) {
      showToast('Nenhum pedido filtrado para consolidar.', 'warn');
      return;
    }
    printKitchenSummary(list);
  });
}

