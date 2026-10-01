/* ============================================================
   ESTOQUEVIEW.JS — Tela de Produção (produção + saldo)
   ------------------------------------------------------------
   - Modal para registrar produção (produto + data + quantidade)
   - Painel de Métricas / KPIs (Produzido, Reservado, Disponível, Zerados)
   - Tabela de estoque atual por produto (produzido/vendido/disponível)
   - Barra de busca e filtros rápidos por categoria
   - Histórico de produções com paginação e modal de exclusão
   As regras de cálculo ficam em estoque.js (módulo de negócio).
   ============================================================ */

import * as storage from './storage.js';
import * as product from './product.js';
import * as order from './order.js';
import * as estoque from './estoque.js';
import * as dateFilter from './dateFilter.js';
import { showToast } from './toast.js';
import { formatDate } from '../utils/money.js';
import { sortKey } from '../utils/describe.js';

/** Callback disparado após registrar/excluir produção (setado por app.js). */
let onChange = () => {};

/**
 * Registra o callback de notificação de mudanças.
 * @param {Function} cb - Função chamada após alterar produções.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/** Estado de busca e filtros */
let searchTerm = '';
let selectedCategory = '';
let historyPage = 1;
const HISTORY_PAGE_SIZE = 10;
let productionToDelete = null;

/**
 * Gera um id único para uma produção.
 * @returns {string} Id no formato "pr<timestamp>-<aleatório>".
 */
function generateId() {
  return `pr${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Exibe (ou oculta) o aviso do formulário de produção.
 * @param {string} message - Mensagem (vazia oculta).
 * @param {boolean} [ok] - true usa estilo de sucesso.
 */
function showAviso(message, ok = false) {
  const aviso = document.getElementById('estoqueFormAviso');
  if (!aviso) return;
  aviso.textContent = message;
  aviso.hidden = !message;
  aviso.classList.toggle('estoque-aviso-ok', ok);
}

/**
 * Abre o modal de registrar produção.
 * @param {string} [preselectedId] - Id do produto para pré-selecionar.
 */
export function openProducaoModal(preselectedId = '') {
  const modal = document.getElementById('producaoModal');
  if (!modal) return;

  const dataEl = document.getElementById('estoqueFormData');
  const qtdEl = document.getElementById('estoqueFormQtd');
  const obsEl = document.getElementById('estoqueFormObs');

  if (dataEl && !dataEl.value) {
    dataEl.value = new Date().toISOString().slice(0, 10);
  }
  if (qtdEl) qtdEl.value = '';
  if (obsEl) obsEl.value = '';
  showAviso('');

  if (preselectedId) {
    const prod = product.getProducts().find((p) => p.id === preselectedId);
    populateTipoSelect(prod ? prod.tipoProduto : '');
    populateProductSelect(preselectedId);
  } else {
    populateTipoSelect('');
    populateProductSelect('');
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');

  setTimeout(() => {
    if (preselectedId && qtdEl) {
      qtdEl.focus();
    } else {
      const tipoSelect = document.getElementById('estoqueFormTipo');
      if (tipoSelect) tipoSelect.focus();
    }
  }, 50);
}

/**
 * Fecha o modal de registrar produção.
 */
export function closeProducaoModal() {
  const modal = document.getElementById('producaoModal');
  if (modal) {
    modal.classList.remove('open');
  }
  document.body.classList.remove('modal-open');
  showAviso('');
}

/**
 * Abre o modal de confirmação de exclusão de produção.
 * @param {Object} pr - Objeto de produção a excluir.
 */
function openDeleteModal(pr) {
  productionToDelete = pr;
  const prod = product.getProducts().find((p) => p.id === pr.produtoId);
  const prodName = prod ? estoque.nomeProduto(prod) : 'produto';

  const desc = document.getElementById('producaoDeleteModalDesc');
  if (desc) {
    desc.textContent = `Tem certeza de que deseja excluir o registro de ${Number(pr.quantidade) || 0} unidade(s) de "${prodName}" produzidas em ${formatDate(pr.data)}?`;
  }

  const modal = document.getElementById('producaoDeleteModal');
  if (modal) {
    modal.classList.add('open');
    document.body.classList.add('modal-open');
  }
}

/**
 * Fecha o modal de confirmação de exclusão de produção.
 */
function closeDeleteModal() {
  productionToDelete = null;
  const modal = document.getElementById('producaoDeleteModal');
  if (modal) {
    modal.classList.remove('open');
  }
  document.body.classList.remove('modal-open');
}

/**
 * Preenche o seletor de TIPO de produto com os tipos que possuem ao
 * menos um produto no catálogo.
 * @param {string} selectedTipo - Tipo a preselecionar (se ainda existir).
 */
function populateTipoSelect(selectedTipo = '') {
  const tipoSelect = document.getElementById('estoqueFormTipo');
  if (!tipoSelect) return;

  const tipos = order.PRODUCT_TYPES.filter((t) => product.getProducts().some((p) => p.tipoProduto === t));

  tipoSelect.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Tipo de produto —';
  tipoSelect.appendChild(placeholder);

  tipos.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    tipoSelect.appendChild(opt);
  });

  if (selectedTipo && tipos.includes(selectedTipo)) {
    tipoSelect.value = selectedTipo;
  }
}

/**
 * Preenche o seletor de produto do formulário com os produtos do tipo
 * escolhido.
 * @param {string} selectedId - Id a preselecionar (se ainda existir).
 */
function populateProductSelect(selectedId = '') {
  const select = document.getElementById('estoqueFormProduto');
  const tipoSelect = document.getElementById('estoqueFormTipo');
  if (!select) return;

  const tipo = tipoSelect ? tipoSelect.value : '';
  const controlled = tipo
    ? product.getProducts().filter((p) => p.tipoProduto === tipo)
    : product.getProducts();
  select.innerHTML = '';

  if (controlled.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = tipo
      ? `— nenhum produto "${tipo}" no catálogo —`
      : '— nenhum produto cadastrado —';
    select.appendChild(opt);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Escolha o produto —';
  select.appendChild(placeholder);

  [...controlled]
    .sort((a, b) => sortKey(estoque.nomeProduto(a)).localeCompare(sortKey(estoque.nomeProduto(b))))
    .forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = estoque.nomeProduto(p);
      select.appendChild(opt);
    });

  if (selectedId && controlled.some((p) => p.id === selectedId)) {
    select.value = selectedId;
  }
}

/**
 * Atualiza os cards de KPI (Produzido, Reservado, Disponível, Zerados).
 */
function updateKpis() {
  const range = dateFilter.getRange();
  const hasRange = Boolean(range.from || range.to);
  const products = product.getProducts();

  let totalProduzido = 0;
  let totalReservado = 0;
  let totalDisponivel = 0;
  let totalZerados = 0;

  products.forEach((p) => {
    const prod = hasRange ? estoque.produzidoNoPeriodo(p.id, range) : estoque.totalProduzido(p.id);
    const res = estoque.totalReservado(p.id);
    const disp = estoque.disponivel(p);

    totalProduzido += prod;
    totalReservado += res;
    if (disp > 0) {
      totalDisponivel += disp;
    } else {
      totalZerados++;
    }
  });

  const kpiProd = document.getElementById('kpiProduzido');
  const kpiRes = document.getElementById('kpiReservado');
  const kpiDisp = document.getElementById('kpiDisponivel');
  const kpiZer = document.getElementById('kpiZerados');

  if (kpiProd) kpiProd.textContent = totalProduzido;
  if (kpiRes) kpiRes.textContent = totalReservado;
  if (kpiDisp) kpiDisp.textContent = totalDisponivel;
  if (kpiZer) kpiZer.textContent = totalZerados;
}

/**
 * Atualiza os contadores das pílulas de filtro por categoria.
 */
function updateFilterPills() {
  const products = product.getProducts();
  const pillTodos = document.getElementById('estoquePillTodos');
  const pillFatia = document.getElementById('estoquePillFatia');
  const pillPunkitos = document.getElementById('estoquePillPunkitos');
  const pillBolo = document.getElementById('estoquePillBolo');

  if (pillTodos) pillTodos.textContent = products.length;
  if (pillFatia) pillFatia.textContent = products.filter((p) => p.tipoProduto === 'Fatia').length;
  if (pillPunkitos) pillPunkitos.textContent = products.filter((p) => p.tipoProduto === 'Punkitos').length;
  if (pillBolo) {
    pillBolo.textContent = products.filter(
      (p) => p.tipoProduto === 'Bolo Inteiro' || p.tipoProduto === 'Bolo Naked'
    ).length;
  }
}

/**
 * Retorna os produtos a exibir no saldo, filtrados pela categoria
 * selecionada, termo de busca e pelo período de data ativo.
 * @returns {{ produtos: Array<object>, hasRange: boolean, totalGeral: number }}
 */
function getSaldoVisivel() {
  const range = dateFilter.getRange();
  const hasRange = Boolean(range.from || range.to);
  const allProducts = product.getProducts();

  let produtos = allProducts;

  if (selectedCategory) {
    if (selectedCategory === 'Bolo Inteiro') {
      produtos = produtos.filter(
        (p) => p.tipoProduto === 'Bolo Inteiro' || p.tipoProduto === 'Bolo Naked'
      );
    } else {
      produtos = produtos.filter((p) => p.tipoProduto === selectedCategory);
    }
  }

  if (searchTerm.trim()) {
    const term = sortKey(searchTerm.trim().toLowerCase());
    produtos = produtos.filter((p) => {
      const name = sortKey(estoque.nomeProduto(p).toLowerCase());
      const tipo = sortKey((p.tipoProduto || '').toLowerCase());
      return name.includes(term) || tipo.includes(term);
    });
  }

  if (hasRange) {
    produtos = produtos.filter(
      (p) => estoque.produzidoNoPeriodo(p.id, range) > 0 || estoque.vendidoNoPeriodo(p.id, range) > 0
    );
  }

  return { produtos, hasRange, totalGeral: allProducts.length };
}

/**
 * Renderiza a tabela de estoque atual (produzido/vendido/disponível).
 */
function renderTable() {
  const tbody = document.getElementById('estoqueTableBody');
  if (!tbody) return;

  const { produtos, hasRange } = getSaldoVisivel();
  const range = dateFilter.getRange();
  const lista = [...produtos].sort((a, b) => {
    const dispA = estoque.disponivel(a);
    const dispB = estoque.disponivel(b);
    return dispB - dispA;
  });

  tbody.innerHTML = '';
  lista.forEach((p) => {
    const produzido = hasRange ? estoque.produzidoNoPeriodo(p.id, range) : estoque.totalProduzido(p.id);
    const reservado = estoque.totalReservado(p.id);
    const vendido = hasRange ? estoque.vendidoNoPeriodo(p.id, range) : estoque.totalVendido(p.id);
    const disp = estoque.disponivel(p);

    const tr = document.createElement('tr');

    const name = document.createElement('td');
    name.className = 'estoque-name';
    name.dataset.label = 'Produto';
    name.textContent = estoque.nomeProduto(p);

    const produzidoTd = document.createElement('td');
    produzidoTd.dataset.label = 'Produzido';
    produzidoTd.textContent = produzido;

    const reservadoTd = document.createElement('td');
    reservadoTd.className = reservado > 0 ? 'estoque-reservado' : '';
    reservadoTd.dataset.label = 'Reservado';
    reservadoTd.textContent = reservado;

    const vendidoTd = document.createElement('td');
    vendidoTd.dataset.label = 'Vendido';
    vendidoTd.textContent = vendido;

    const dispTd = document.createElement('td');
    dispTd.dataset.label = 'Disponível';
    const badge = document.createElement('span');
    badge.className = `stock-badge stock-${estoque.stockStatus(disp)}`;
    badge.textContent = disp <= 0 ? 'Zerado' : disp;
    dispTd.appendChild(badge);

    const actionTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost estoque-produzir';
    btn.textContent = '＋ Produzir';
    btn.title = `Registrar produção de ${estoque.nomeProduto(p)}`;
    btn.addEventListener('click', () => openProducaoModal(p.id));
    actionTd.appendChild(btn);

    tr.append(name, produzidoTd, reservadoTd, vendidoTd, dispTd, actionTd);
    tbody.appendChild(tr);
  });
}

/**
 * Renderiza o histórico de produções (mais recentes primeiro),
 * respeitando o filtro de data ativo e a paginação.
 */
function renderHistory() {
  const historyEl = document.getElementById('estoqueHistory');
  const paginationEl = document.getElementById('estoquePagination');
  const prevBtn = document.getElementById('btnEstoquePrevPage');
  const nextBtn = document.getElementById('btnEstoqueNextPage');
  const pageInfo = document.getElementById('estoquePageInfo');
  if (!historyEl) return;

  const range = dateFilter.getRange();
  const hasRange = Boolean(range.from || range.to);

  let list = storage.getAllProductions();
  if (hasRange) {
    list = dateFilter.applyFilter(list);
  }

  historyEl.innerHTML = '';

  if (list.length === 0) {
    if (paginationEl) paginationEl.hidden = true;
    const li = document.createElement('li');
    li.className = 'estoque-history-empty';
    li.textContent = hasRange
      ? 'Nenhuma produção registrada no período selecionado.'
      : 'Nenhuma produção registrada ainda.';
    historyEl.appendChild(li);
    return;
  }

  const sorted = [...list].sort(
    (a, b) =>
      String(b.data || '').localeCompare(String(a.data || '')) ||
      String(b.id || '').localeCompare(String(a.id || ''))
  );

  const totalPages = Math.ceil(sorted.length / HISTORY_PAGE_SIZE) || 1;
  if (historyPage > totalPages) {
    historyPage = totalPages;
  }
  if (historyPage < 1) {
    historyPage = 1;
  }

  const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
  const pageItems = sorted.slice(start, start + HISTORY_PAGE_SIZE);

  const productsById = new Map(product.getProducts().map((p) => [p.id, p]));

  pageItems.forEach((pr) => {
    const prod = productsById.get(pr.produtoId);

    const li = document.createElement('li');
    li.className = 'estoque-history-item';

    const info = document.createElement('div');
    info.className = 'estoque-history-info';

    const title = document.createElement('strong');
    title.textContent = `+${Number(pr.quantidade) || 0} ${prod ? estoque.nomeProduto(prod) : 'produto removido'}`;

    const meta = document.createElement('span');
    meta.className = 'estoque-history-meta';
    meta.textContent = formatDate(pr.data) + (pr.observacao ? ` · ${pr.observacao}` : '');

    info.append(title, meta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn-card-action action-danger';
    del.textContent = 'Excluir';
    del.title = 'Excluir produção';
    del.setAttribute('aria-label', 'Excluir produção');
    del.addEventListener('click', () => openDeleteModal(pr));

    li.append(info, del);
    historyEl.appendChild(li);
  });

  // Atualiza a barra de paginação
  if (paginationEl) {
    paginationEl.hidden = totalPages <= 1;
    if (pageInfo) {
      pageInfo.textContent = `Página ${historyPage} de ${totalPages} (${sorted.length} produções)`;
    }
    if (prevBtn) {
      prevBtn.disabled = historyPage <= 1;
    }
    if (nextBtn) {
      nextBtn.disabled = historyPage >= totalPages;
    }
  }
}

/**
 * Lida com o envio do formulário de produção (valida e persiste).
 * @param {Event} event
 * @returns {boolean} true se registrou.
 */
function handleRegister(event) {
  event.preventDefault();

  const select = document.getElementById('estoqueFormProduto');
  const dataEl = document.getElementById('estoqueFormData');
  const qtdEl = document.getElementById('estoqueFormQtd');
  const obsEl = document.getElementById('estoqueFormObs');

  const produtoId = select ? select.value : '';
  const data = dataEl ? dataEl.value : '';
  const quantidade = Number(qtdEl ? qtdEl.value : NaN);

  if (!produtoId) {
    showAviso('Selecione um produto para registrar a produção.');
    return false;
  }
  if (!data) {
    showAviso('Informe a data da produção.');
    return false;
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    showAviso('Informe uma quantidade maior que zero.');
    return false;
  }

  const producoes = storage.getAllProductions();
  producoes.push({
    id: generateId(),
    produtoId,
    quantidade,
    data,
    observacao: obsEl ? String(obsEl.value).trim() : '',
  });
  storage.saveProductions(producoes);

  closeProducaoModal();
  showToast('Produção registrada!');
  historyPage = 1;
  onChange();
  updateSaldo();
  renderHistory();
  return true;
}

/**
 * Confirma e remove uma produção via modal.
 */
async function handleConfirmDelete() {
  if (!productionToDelete) return;
  const pr = productionToDelete;

  try {
    await storage.deleteProduction(pr.id);
    closeDeleteModal();
    showToast('Produção excluída.');
    renderHistory();
    updateSaldo();
    onChange();
  } catch (err) {
    showToast(`Erro ao excluir produção: ${err && err.message ? err.message : 'Falha na conexão'}`, 'error');
  }
}

/**
 * Atualiza contador, estado vazio e tabela conforme filtros e busca.
 */
function updateSaldo() {
  const { produtos, hasRange, totalGeral } = getSaldoVisivel();

  const countEl = document.getElementById('estoqueCount');
  if (countEl) countEl.textContent = produtos.length;

  const emptyEl = document.getElementById('estoqueEmpty');
  const tableWrap = document.getElementById('estoqueTableWrap');
  const vazio = produtos.length === 0;

  if (tableWrap) tableWrap.hidden = vazio;
  if (emptyEl) {
    const msg = emptyEl.querySelector('p');
    if (msg) {
      if (totalGeral === 0) {
        msg.innerHTML = `Nenhum produto cadastrado ainda.<br>Cadastre em <strong>Produtos</strong> para começar a registrar produção.`;
      } else if (searchTerm.trim()) {
        msg.innerHTML = `Nenhum produto encontrado para "<strong>${searchTerm.trim()}</strong>".`;
      } else if (vazio && hasRange) {
        msg.innerHTML = `Nenhuma produção ou venda registrada no período selecionado.<br>Altere o filtro de datas ou registre uma produção.`;
      } else if (selectedCategory) {
        msg.innerHTML = `Nenhum produto na categoria <strong>${selectedCategory}</strong>.`;
      } else {
        msg.innerHTML = `Nenhum produto cadastrado ainda.`;
      }
    }
    emptyEl.hidden = !vazio;
  }

  updateKpis();
  updateFilterPills();
  renderTable();
}

/**
 * Renderiza a tela de estoque completa.
 */
export function render() {
  updateSaldo();
  renderHistory();
}

/* ---------- Eventos ---------- */

// Botão de abertura do modal
const btnOpen = document.getElementById('btnOpenProducaoModal');
if (btnOpen) {
  btnOpen.addEventListener('click', () => openProducaoModal());
}

// Botões de fechar modal de produção
document.querySelectorAll('[data-close-producao-modal]').forEach((btn) => {
  btn.addEventListener('click', closeProducaoModal);
});

// Botões de fechar modal de exclusão
document.querySelectorAll('[data-close-producao-delete-modal]').forEach((btn) => {
  btn.addEventListener('click', closeDeleteModal);
});

// Botão de confirmar exclusão
const btnConfirmDelete = document.getElementById('btnConfirmProducaoDelete');
if (btnConfirmDelete) {
  btnConfirmDelete.addEventListener('click', handleConfirmDelete);
}

// Submissão do formulário de produção
const form = document.getElementById('estoqueForm');
if (form) {
  form.addEventListener('submit', handleRegister);
}

// Tipo → Produto no Modal
const tipoSelect = document.getElementById('estoqueFormTipo');
if (tipoSelect) {
  tipoSelect.addEventListener('change', () => {
    populateProductSelect();
  });
}

// Barra de busca do saldo
const searchInput = document.getElementById('estoqueSearch');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    updateSaldo();
  });
}

// Pílulas de filtro por categoria
const filterPills = document.querySelectorAll('.estoque-filter-pill');
filterPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    filterPills.forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    selectedCategory = pill.dataset.filter || '';
    updateSaldo();
  });
});

// Paginação do histórico
const prevBtn = document.getElementById('btnEstoquePrevPage');
if (prevBtn) {
  prevBtn.addEventListener('click', () => {
    if (historyPage > 1) {
      historyPage--;
      renderHistory();
    }
  });
}

const nextBtn = document.getElementById('btnEstoqueNextPage');
if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    historyPage++;
    renderHistory();
  });
}

// Fechamento de modal com a tecla Esc
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const prodModal = document.getElementById('producaoModal');
    if (prodModal && prodModal.classList.contains('open')) {
      closeProducaoModal();
    }
    const delModal = document.getElementById('producaoDeleteModal');
    if (delModal && delModal.classList.contains('open')) {
      closeDeleteModal();
    }
  }
});
