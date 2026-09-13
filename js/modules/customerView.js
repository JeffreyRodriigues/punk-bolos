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
import * as orderForm from './orderForm.js';
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

/** Abre o modal de perfil e histórico detalhado (Timeline) do cliente. */
export function abrirHistoricoCliente(customer) {
  if (!customer) return;
  const fullCustomer = storage.getCustomerById(customer.id) || customer;
  const orders = storage.getAll();
  const hist = service.obterHistoricoCliente(fullCustomer.nome, orders);

  const modal = document.getElementById('modalCustomerHistory');
  if (!modal) return;

  // Cabeçalho
  const titleEl = document.getElementById('custHistTitle');
  const badgesEl = document.getElementById('custHistBadges');
  if (titleEl) titleEl.textContent = fullCustomer.nome;

  if (badgesEl) {
    let badgesHtml = '';
    const metricas = service.clientesComMetricas([fullCustomer], orders)[0];
    if (metricas?.isVIP) badgesHtml += '<span class="badge badge-vip">👑 VIP</span> ';
    if (metricas?.isInativo) badgesHtml += '<span class="badge badge-inativo">💤 Inativo</span> ';
    if (metricas?.diasParaAniversario !== null && metricas?.diasParaAniversario <= 15) {
      badgesHtml += `<span class="badge badge-niver">🎂 Níver (${metricas.diasParaAniversario}d)</span> `;
    }
    badgesEl.innerHTML = badgesHtml;
  }

  // Cartão de Perfil (Contato & Endereço)
  const phoneEl = document.getElementById('custHistPhone');
  const waBtn = document.getElementById('custHistWaBtn');
  const niverEl = document.getElementById('custHistNiver');
  const enderecoEl = document.getElementById('custHistEndereco');
  const obsEl = document.getElementById('custHistObs');

  if (phoneEl) phoneEl.textContent = fullCustomer.contato || '—';
  if (waBtn) {
    const waLink = service.formatarWhatsappLink(fullCustomer.contato, `Olá ${fullCustomer.nome}! Tudo bem?`);
    if (waLink) {
      waBtn.href = waLink;
      waBtn.style.display = 'inline-flex';
    } else {
      waBtn.style.display = 'none';
    }
  }

  if (niverEl) niverEl.textContent = service.formatarDataAniversario(fullCustomer.dataNascimento);
  if (enderecoEl) enderecoEl.textContent = fullCustomer.endereco || '—';
  if (obsEl) obsEl.textContent = fullCustomer.observacoes || 'Nenhuma preferência cadastrada';

  // Cards de Métricas
  const ltvEl = document.getElementById('custStatLtv');
  const pedidosEl = document.getElementById('custStatPedidos');
  const ticketEl = document.getElementById('custStatTicket');
  const favoritoEl = document.getElementById('custStatFavorito');

  if (ltvEl) ltvEl.textContent = formatCurrency(hist.totalGasto);
  if (pedidosEl) pedidosEl.textContent = hist.totalPedidos;
  if (ticketEl) ticketEl.textContent = formatCurrency(hist.ticketMedio);
  if (favoritoEl) favoritoEl.textContent = hist.saborFavorito || '—';

  // Lista de Timeline
  const timelineEl = document.getElementById('custHistTimeline');
  const emptyEl = document.getElementById('custHistEmpty');

  if (timelineEl) {
    timelineEl.innerHTML = '';
    if (hist.pedidos.length === 0) {
      if (emptyEl) emptyEl.hidden = false;
    } else {
      if (emptyEl) emptyEl.hidden = true;
      hist.pedidos.forEach((p) => {
        const card = document.createElement('div');
        const statusClass = `status-${(p.status || 'Pendente').replace(/\s+/g, '-')}`;
        card.className = `cust-timeline-card ${statusClass}`;

        const itensHtml = (Array.isArray(p.itens) ? p.itens : []).map((item) => {
          const qtd = item.quantidade || 1;
          const tipo = item.tipoProduto || 'Produto';
          const tam = item.tamanho ? ` (${item.tamanho})` : '';
          const sabor = item.sabor ? ` - ${item.sabor}` : '';
          const totalItem = (Number(item.quantidade) || 1) * (Number(item.valorUnitario) || 0);
          const valorStr = item.cortesia ? 'Cortesia' : formatCurrency(totalItem);
          return `<li class="timeline-item-row">
            <span class="timeline-item-desc">• ${qtd}x ${escapeHtml(tipo)}${escapeHtml(tam)}${escapeHtml(sabor)}</span>
            <span class="timeline-item-price">${valorStr}</span>
          </li>`;
        }).join('');

        card.innerHTML = `
          <div class="timeline-card-header">
            <div class="timeline-card-meta">
              <strong class="timeline-order-num">Pedido #${p.numero}</strong>
              <span class="timeline-order-date">📅 ${formatDate(p.data)}</span>
            </div>
            <span class="badge ${(p.status || 'Pendente').replace(/\s+/g, '-')}">${escapeHtml(p.status || 'Pendente')}</span>
          </div>
          <ul class="timeline-items-list">
            ${itensHtml || '<li class="timeline-item-row"><span class="timeline-item-desc">• Pedido especial</span></li>'}
          </ul>
          <div class="timeline-card-footer">
            <span class="timeline-card-total">Total: ${formatCurrency(p.valorTotal)}</span>
            <div class="timeline-card-tags">
              ${p.entrega ? `<span>🛵 ${escapeHtml(p.entrega)}</span>` : ''}
              ${p.pagamento ? `<span>💳 ${escapeHtml(p.pagamento)}</span>` : ''}
            </div>
          </div>
        `;

        timelineEl.appendChild(card);
      });
    }
  }

  // Ações nos botões do modal
  const btnNewOrder = document.getElementById('btnNewOrderForCustomer');
  if (btnNewOrder) {
    btnNewOrder.onclick = () => {
      fecharHistoricoCliente();
      orderForm.openNew({ cliente: fullCustomer.nome, contato: fullCustomer.contato });
    };
  }

  const btnEdit = document.getElementById('btnEditFromHistory');
  if (btnEdit) {
    btnEdit.onclick = () => {
      fecharHistoricoCliente();
      customerForm.openEdit(fullCustomer);
    };
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

/** Fecha o modal de histórico do cliente. */
export function fecharHistoricoCliente() {
  const modal = document.getElementById('modalCustomerHistory');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
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
          <strong class="birthday-name" style="cursor:pointer;" title="Ver histórico">${escapeHtml(c.nome)}</strong>
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

    const nameBtn = card.querySelector('.birthday-name');
    if (nameBtn) {
      nameBtn.addEventListener('click', () => abrirHistoricoCliente(c));
    }

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
          <strong class="customer-nome" style="cursor:pointer;" title="Clique para ver o histórico completo">${escapeHtml(c.nome)}</strong>
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

    // Clique no nome abre o histórico
    const nomeEl = tr.querySelector('.customer-nome');
    if (nomeEl) {
      nomeEl.addEventListener('click', () => abrirHistoricoCliente(c));
    }

    // Adiciona botões de ação padronizados
    const actionsWrap = tr.querySelector('.customer-actions-wrap');
    if (actionsWrap) {
      actionsWrap.append(
        createIconBtn('📜', 'Ver histórico de pedidos', () => abrirHistoricoCliente(c)),
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

  const modalHist = document.getElementById('modalCustomerHistory');
  if (modalHist) {
    modalHist.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', fecharHistoricoCliente);
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalHist && modalHist.classList.contains('open')) {
      fecharHistoricoCliente();
    }
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
