/* ============================================================
   CUSTOMERVIEW.JS — Tela de Gestão de Clientes & CRM
   ------------------------------------------------------------
   Renderiza a aba "Clientes":
   - Cards de indicadores gerais (total, aniversários, VIPs, inativos)
   - Painel de Ação Rápida de Aniversariantes com CTA para WhatsApp
   - Tabela de clientes com busca instantânea e filtros rápidos
   - Ações de editar e excluir clientes
   ============================================================ */

import * as storage from './storage.js';
import * as service from './customerService.js';
import * as customerForm from './customerForm.js';
import { formatCurrency, formatDate } from '../utils/money.js';
import { showToast } from './toast.js';

let changeListener = null;
let currentSearch = '';
let currentFilter = 'todos'; // 'todos' | 'aniversariantes' | 'vips' | 'inativos'

/** Registra listener para notificar o app sobre mudanças. */
export function setChangeListener(listener) {
  changeListener = listener;
}

function notifyChange() {
  if (typeof changeListener === 'function') {
    changeListener();
  }
}

/** Cria um botão de ícone padronizado do app Punk Bolos. */
function createIconBtn(icon, label, onClick, modifier = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn${modifier ? ` ${modifier}` : ''}`;
  btn.textContent = icon;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return btn;
}

/** Renderiza os cards de métricas no topo da tela. */
function renderStats(metrics) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal('cust-stat-total', metrics.totalClientes);
  setVal('cust-stat-aniversarios', metrics.aniversariantesProximos);
  setVal('cust-stat-vips', metrics.totalVips);
  setVal('cust-stat-inativos', metrics.totalInativos);
  setVal('cust-stat-ltv', formatCurrency(metrics.ticketMedioLtv));
}

/** Renderiza a seção de aniversariantes próximos com botão WhatsApp. */
function renderAniversariantes(aniversariantes) {
  const container = document.getElementById('customerBirthdaysContainer');
  const section = document.getElementById('customerBirthdaysSection');
  if (!container || !section) return;

  if (aniversariantes.length === 0) {
    section.hidden = true;
    container.innerHTML = '';
    return;
  }

  section.hidden = false;
  container.innerHTML = '';

  aniversariantes.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'customer-birthday-card';

    let badgeText = '';
    let badgeClass = 'birthday-badge';
    if (c.diasRestantes === 0) {
      badgeText = 'Hoje! 🎂';
      badgeClass += ' birthday-badge-today';
    } else if (c.diasRestantes === 1) {
      badgeText = 'Amanhã! 🎉';
      badgeClass += ' birthday-badge-soon';
    } else {
      badgeText = `Em ${c.diasRestantes} dias`;
    }

    const niverFormatado = service.formatarDataAniversario(c.dataNascimento);
    const msg = service.gerarMensagemAniversario(c, c.ultimoSabor);
    const waLink = service.formatarWhatsappLink(c.contato, msg);

    card.innerHTML = `
      <div class="birthday-card-header">
        <div class="birthday-card-info">
          <strong class="birthday-name">${escapeHtml(c.nome)}</strong>
          <span class="birthday-date">📅 ${niverFormatado}</span>
        </div>
        <span class="${badgeClass}">${badgeText}</span>
      </div>
      <div class="birthday-card-body">
        ${
          c.ultimoSabor
            ? `<span class="birthday-flavor">🍰 Último bolo: <strong>${escapeHtml(c.ultimoSabor)}</strong></span>`
            : `<span class="birthday-flavor">🍰 Nenhum bolo registrado ainda</span>`
        }
      </div>
      <div class="birthday-card-actions">
        ${
          waLink
            ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn-whatsapp" title="Enviar sugestão no WhatsApp">
                <span class="whatsapp-icon">💬</span> Sugerir Bolo no WhatsApp
              </a>`
            : `<span class="text-muted text-sm">Sem WhatsApp cadastrado</span>`
        }
      </div>
    `;

    container.appendChild(card);
  });
}

/** Renderiza a tabela de clientes com busca e filtros aplicados. */
function renderTable(clientesEnriquecidos) {
  const tbody = document.getElementById('customersTableBody');
  const emptyState = document.getElementById('customersEmptyState');
  if (!tbody) return;

  tbody.innerHTML = '';

  // 1. Filtragem por busca
  const query = currentSearch.trim().toLowerCase();
  let filtrados = clientesEnriquecidos.filter((c) => {
    if (!query) return true;
    const nome = String(c.nome || '').toLowerCase();
    const contato = String(c.contato || '').toLowerCase();
    const endereco = String(c.endereco || '').toLowerCase();
    const obs = String(c.observacoes || '').toLowerCase();
    return nome.includes(query) || contato.includes(query) || endereco.includes(query) || obs.includes(query);
  });

  // 2. Filtragem por pílula de status
  if (currentFilter === 'aniversariantes') {
    filtrados = filtrados.filter((c) => c.diasParaAniversario !== null && c.diasParaAniversario >= 0 && c.diasParaAniversario <= 30);
  } else if (currentFilter === 'vips') {
    filtrados = filtrados.filter((c) => c.isVIP);
  } else if (currentFilter === 'inativos') {
    filtrados = filtrados.filter((c) => c.isInativo);
  }

  if (filtrados.length === 0) {
    if (emptyState) emptyState.hidden = false;
    return;
  }
  if (emptyState) emptyState.hidden = true;

  // Ordena por nome alfabético
  filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  filtrados.forEach((c) => {
    const tr = document.createElement('tr');
    tr.className = 'customer-row';

    const waLink = service.formatarWhatsappLink(c.contato, `Olá ${c.nome}! Tudo bem?`);
    const niverFormatado = service.formatarDataAniversario(c.dataNascimento);

    let badges = '';
    if (c.isVIP) badges += '<span class="badge badge-vip">👑 VIP</span> ';
    if (c.isInativo) badges += '<span class="badge badge-inativo">💤 Inativo</span> ';
    if (c.diasParaAniversario !== null && c.diasParaAniversario <= 15) {
      badges += `<span class="badge badge-niver">🎂 Níver (${c.diasParaAniversario}d)</span> `;
    }

    tr.innerHTML = `
      <td class="customer-col-nome">
        <div class="customer-nome-wrap">
          <strong class="customer-nome">${escapeHtml(c.nome)}</strong>
          ${badges ? `<div class="customer-badges">${badges}</div>` : ''}
          ${c.endereco ? `<span class="customer-endereco text-muted">📍 ${escapeHtml(c.endereco)}</span>` : ''}
          ${c.observacoes ? `<span class="customer-obs text-muted">📝 ${escapeHtml(c.observacoes)}</span>` : ''}
        </div>
      </td>
      <td class="customer-col-contato">
        ${
          c.contato
            ? `<div class="customer-contato-wrap">
                <span class="customer-phone">${escapeHtml(c.contato)}</span>
                ${
                  waLink
                    ? `<a href="${waLink}" target="_blank" rel="noopener" class="btn-icon-wa" title="Conversar no WhatsApp">💬</a>`
                    : ''
                }
              </div>`
            : '<span class="text-muted">—</span>'
        }
      </td>
      <td class="customer-col-niver">
        ${niverFormatado !== '—' ? `<span class="customer-niver-date">🎂 ${niverFormatado}</span>` : '<span class="text-muted">—</span>'}
      </td>
      <td class="customer-col-pedidos">
        <div class="customer-pedidos-stat">
          <strong class="customer-pedidos-count">${c.totalPedidos} ${c.totalPedidos === 1 ? 'pedido' : 'pedidos'}</strong>
          <span class="customer-ltv-val">${formatCurrency(c.totalGasto)}</span>
        </div>
      </td>
      <td class="customer-col-ultimo">
        ${
          c.ultimoPedidoData
            ? `<div class="customer-ultimo-wrap">
                <span class="customer-ultimo-data">${formatDate(c.ultimoPedidoData)}</span>
                ${c.diasSemComprar !== null ? `<span class="customer-dias-atras text-muted">${c.diasSemComprar}d atrás</span>` : ''}
              </div>`
            : '<span class="text-muted">Sem pedidos</span>'
        }
      </td>
      <td class="customer-col-actions text-right">
        <div class="customer-actions-wrap"></div>
      </td>
    `;

    // Adiciona botões de ação padronizados
    const actionsWrap = tr.querySelector('.customer-actions-wrap');
    if (actionsWrap) {
      actionsWrap.append(
        createIconBtn('✏️', 'Editar cliente', () => {
          const fullCustomer = storage.getCustomerById(c.id);
          if (fullCustomer) customerForm.openEdit(fullCustomer);
        }),
        createIconBtn('🗑️', 'Excluir cliente', () => {
          if (confirm(`Tem certeza que deseja excluir o cliente "${c.nome}"?`)) {
            storage.deleteCustomer(c.id);
            showToast('Cliente excluído com sucesso.');
            render();
            notifyChange();
          }
        }, 'danger')
      );
    }

    tbody.appendChild(tr);
  });
}

/** Renderiza a tela completa de Clientes & CRM. */
export function render() {
  const customers = storage.getAllCustomers();
  const orders = storage.getAll();

  const metrics = service.metricasClientes(customers, orders);
  const aniversariantes = service.aniversariantesProximos(customers, orders, 15);
  const enriquecidos = service.clientesComMetricas(customers, orders);

  renderStats(metrics);
  renderAniversariantes(aniversariantes);
  renderTable(enriquecidos);
}

/** Inicializa os controles e busca da tela de clientes. */
export function init() {
  const btnNew = document.getElementById('btnNewCustomer');
  if (btnNew) {
    btnNew.addEventListener('click', () => customerForm.openNew());
  }

  const searchInput = document.getElementById('customerSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      const customers = storage.getAllCustomers();
      const orders = storage.getAll();
      const enriquecidos = service.clientesComMetricas(customers, orders);
      renderTable(enriquecidos);
    });
  }

  const filterPills = document.querySelectorAll('.customer-filter-pill');
  filterPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      filterPills.forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter || 'todos';
      const customers = storage.getAllCustomers();
      const orders = storage.getAll();
      const enriquecidos = service.clientesComMetricas(customers, orders);
      renderTable(enriquecidos);
    });
  });

  customerForm.setChangeListener(() => {
    render();
    notifyChange();
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
