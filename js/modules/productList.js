/* ============================================================
   PRODUCTLIST.JS — Lista de produtos (view Produtos)
   ------------------------------------------------------------
   Renderiza o catálogo de produtos nos modos Grade e Tabela,
   com micro-KPIs analíticos, faixa financeira com margem real,
   ações de editar/precificar/excluir e filtros por categoria.
   ============================================================ */

import * as storage from './storage.js';
import * as product from './product.js';
import * as estoque from './estoque.js';
import * as pricing from './pricing.js';
import * as base from './base.js';
import * as costSettings from './costSettings.js';
import { formatCurrency } from '../utils/money.js';
import { showToast } from './toast.js';

const listEl = document.getElementById('productList');
const emptyEl = document.getElementById('productEmpty');
const countEl = document.getElementById('productCount');
const searchEl = document.getElementById('productSearch');
const categoryFiltersEl = document.getElementById('productCategoryFilters');

const paginationNav = document.getElementById('productPagination');
const pageInfo = document.getElementById('productPaginationInfo');
const prevBtn = document.getElementById('btnProductPrevPage');
const nextBtn = document.getElementById('btnProductNextPage');

/* Indicadores analíticos do cardápio */
const prodStatTotalEl = document.getElementById('prodStatTotal');
const prodStatSemEstoqueEl = document.getElementById('prodStatSemEstoque');
const prodStatSemFichaEl = document.getElementById('prodStatSemFicha');
const prodStatPrecoMedioEl = document.getElementById('prodStatPrecoMedio');

/* Alternadores de modo de visualização */
const btnViewGrid = document.getElementById('btnProductViewGrid');
const btnViewList = document.getElementById('btnProductViewList');

const VIEW_MODE_KEY = 'punkbolos.products.viewMode';
let currentViewMode = 'grid';
try {
  const saved = localStorage.getItem(VIEW_MODE_KEY);
  if (saved === 'list' || saved === 'grid') {
    currentViewMode = saved;
  }
} catch {
  // Ignora restrições de localStorage
}

/* Modal de exclusão customizado */
const deleteModal = document.getElementById('productDeleteModal');
const deleteDescEl = document.getElementById('productDeleteModalDesc');
const confirmDeleteBtn = document.getElementById('btnConfirmProductDelete');
let pendingDeleteProduct = null;

/* Estado de paginação e filtros */
let currentPage = 1;
const PAGE_SIZE = 12;
let selectedCategory = '';
let searchQuery = '';

/** Configuração das categorias conhecidas */
const KNOWN_CATEGORIES = [
  { key: '',              label: 'Todos' },
  { key: 'Fatia',        label: 'Fatias' },
  { key: 'Punkitos',     label: 'Punkitos' },
  { key: 'Bolo Inteiro', label: 'Bolos' },
  { key: 'Bolo Naked',   label: 'Naked' },
  { key: 'Docinho',      label: 'Docinhos' },
  { key: 'Decoração',    label: 'Decoração' },
  { key: 'Adicional',    label: 'Adicionais' },
];

// Eventos de fechamento do modal de exclusão
deleteModal?.querySelectorAll('[data-close-delete-modal]').forEach((el) => {
  el.addEventListener('click', closeDeleteModal);
});

// Fechar modal de exclusão com a tecla Esc
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && deleteModal?.classList.contains('open')) {
    closeDeleteModal();
  }
});

// Confirmação da exclusão
confirmDeleteBtn?.addEventListener('click', async () => {
  if (!pendingDeleteProduct) return;
  const p = pendingDeleteProduct;
  closeDeleteModal();

  try {
    await storage.deleteProduct(p.id);
    showToast('Produto excluído com sucesso!');
    render();
    onChange();
  } catch (err) {
    showToast(`Erro ao excluir produto: ${err && err.message ? err.message : 'Falha na conexão'}`, 'error');
  }
});

function openDeleteModal(p) {
  pendingDeleteProduct = p;
  if (deleteDescEl) {
    deleteDescEl.innerHTML = `Tem certeza de que deseja excluir o produto <strong>"${escapeHtml(p.titulo || 'Sem título')}"</strong>?<br><br><span style="color: var(--color-text-muted); font-size: 0.88rem;">Esta ação removerá o produto do catálogo e não pode ser desfeita.</span>`;
  }
  if (deleteModal) {
    deleteModal.classList.add('open');
    document.body.classList.add('modal-open');
  }
}

function closeDeleteModal() {
  pendingDeleteProduct = null;
  if (deleteModal) {
    deleteModal.classList.remove('open');
    document.body.classList.remove('modal-open');
  }
}

/** Handlers definidos por app.js (edição abre o form). */
let onEdit = () => {};
let onPricing = () => {};

/** Callback disparado após excluir (setado por app.js). */
let onChange = () => {};

/**
 * Registra o callback de edição (usado para abrir o form).
 * @param {Function} cb - Função chamada ao clicar em "Editar".
 */
export function setEditHandler(cb) {
  onEdit = cb;
}

/**
 * Registra o callback de precificação (usado para abrir a ficha técnica).
 * @param {Function} cb - Função chamada ao clicar em "Precificar".
 */
export function setPricingHandler(cb) {
  onPricing = cb;
}

/**
 * Registra o callback de notificação de mudanças (exclusão).
 * @param {Function} cb - Função chamada após excluir um produto.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/**
 * Atualiza o estado visual ativo dos botões de alternância Grade/Tabela.
 */
function updateViewToggleButtons() {
  if (btnViewGrid) btnViewGrid.classList.toggle('active', currentViewMode === 'grid');
  if (btnViewList) btnViewList.classList.toggle('active', currentViewMode === 'list');
}

btnViewGrid?.addEventListener('click', () => {
  if (currentViewMode !== 'grid') {
    currentViewMode = 'grid';
    try { localStorage.setItem(VIEW_MODE_KEY, 'grid'); } catch {}
    updateViewToggleButtons();
    render();
  }
});

btnViewList?.addEventListener('click', () => {
  if (currentViewMode !== 'list') {
    currentViewMode = 'list';
    try { localStorage.setItem(VIEW_MODE_KEY, 'list'); } catch {}
    updateViewToggleButtons();
    render();
  }
});

/**
 * Calcula dados financeiros de um produto (preço, custo unitário e margem real).
 * @param {Object} p - Produto.
 * @param {Array<Object>} receitas - Lista de receitas salvas.
 * @param {Array<Object>} insumos - Insumos cadastrados.
 * @param {Array<Object>} bases - Bases cadastradas.
 * @param {Object} rates - Configurações de custos.
 * @returns {Object} Dados calculados.
 */
function getProductFinancials(p, receitas, insumos, bases, rates) {
  const precoVenda = Number(p.valor) || 0;
  const isPrecificavel = p.tipoProduto !== 'Adicional' && p.tipoProduto !== 'Decoração';

  if (!isPrecificavel) {
    return {
      isPrecificavel: false,
      hasFicha: false,
      precoVenda,
      custoUnit: null,
      margemPct: null,
    };
  }

  const rec = pricing.getReceita(receitas, p.id);
  if (!rec) {
    return {
      isPrecificavel: true,
      hasFicha: false,
      precoVenda,
      custoUnit: null,
      margemPct: null,
    };
  }

  const c = pricing.calcular(rec, insumos, bases, rates);
  const custoUnit = c.custoUnitarioTotal || 0;
  const margemPct = precoVenda > 0 ? ((precoVenda - custoUnit) / precoVenda) * 100 : 0;

  return {
    isPrecificavel: true,
    hasFicha: true,
    precoVenda,
    custoUnit,
    margemPct,
  };
}

/**
 * Renderiza o elemento de badge de margem real.
 * @param {Object} fin - Objeto retornado por getProductFinancials.
 * @returns {HTMLElement} Elemento span com o badge.
 */
function renderMarginBadge(fin) {
  const badge = document.createElement('span');
  badge.className = 'product-margin-badge';

  if (!fin.isPrecificavel) {
    badge.classList.add('product-margin-badge--none');
    badge.textContent = 'Livre';
    badge.title = 'Item adicional ou decoração sem ficha técnica';
    return badge;
  }

  if (!fin.hasFicha) {
    badge.classList.add('product-margin-badge--none');
    badge.textContent = 'Sem ficha';
    badge.title = 'Produto ainda não precificado na aba Precificação';
    return badge;
  }

  const pct = fin.margemPct;
  const pctStr = `${pct.toFixed(1).replace('.', ',')}%`;

  if (pct >= 50) {
    badge.classList.add('product-margin-badge--ok');
    badge.textContent = pctStr;
    badge.title = `Margem saudável: ${pctStr}`;
  } else if (pct >= 30) {
    badge.classList.add('product-margin-badge--warn');
    badge.textContent = pctStr;
    badge.title = `Margem moderada: ${pctStr}`;
  } else {
    badge.classList.add('product-margin-badge--low');
    badge.textContent = pctStr;
    badge.title = `Margem baixa ou negativa: ${pctStr}`;
  }

  return badge;
}

/**
 * Atualiza os 4 cards de micro-KPIs do topo da tela de produtos.
 * @param {Array<Object>} allProducts - Todos os produtos cadastrados.
 * @param {Array<Object>} receitas - Receitas salvas de precificação.
 */
function updateProductStats(allProducts, receitas) {
  const total = allProducts.length;
  let semEstoque = 0;
  let semFicha = 0;
  let somaPreco = 0;

  allProducts.forEach((p) => {
    const disp = estoque.disponivel(p);
    if (disp <= 0) {
      semEstoque++;
    }
    const isPrecificavel = p.tipoProduto !== 'Adicional' && p.tipoProduto !== 'Decoração';
    if (isPrecificavel) {
      const rec = pricing.getReceita(receitas, p.id);
      if (!rec) {
        semFicha++;
      }
    }
    somaPreco += Number(p.valor) || 0;
  });

  const precoMedio = total > 0 ? somaPreco / total : 0;

  if (prodStatTotalEl) prodStatTotalEl.textContent = total;
  if (prodStatSemEstoqueEl) prodStatSemEstoqueEl.textContent = semEstoque;
  if (prodStatSemFichaEl) prodStatSemFichaEl.textContent = semFicha;
  if (prodStatPrecoMedioEl) prodStatPrecoMedioEl.textContent = formatCurrency(precoMedio);
}

/**
 * Renderiza as pílulas de filtro por categoria com suas respectivas contagens.
 * @param {Array<Object>} allProducts - Todos os produtos do catálogo.
 */
function renderCategoryPills(allProducts) {
  if (!categoryFiltersEl) return;

  const counts = { '': allProducts.length };
  allProducts.forEach((p) => {
    const t = String(p.tipoProduto || '').trim();
    if (t) {
      counts[t] = (counts[t] || 0) + 1;
    }
  });

  const extraCategories = Object.keys(counts)
    .filter((k) => k !== '' && !KNOWN_CATEGORIES.some((c) => c.key === k))
    .map((k) => ({ key: k, label: k }));

  const categoriesToShow = [...KNOWN_CATEGORIES, ...extraCategories];

  categoryFiltersEl.innerHTML = '';
  categoriesToShow.forEach((cat) => {
    const count = counts[cat.key] || 0;
    if (cat.key !== '' && count === 0) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `customer-filter-pill product-filter-pill ${selectedCategory === cat.key ? 'active' : ''}`.trim();
    btn.dataset.filter = cat.key;
    btn.innerHTML = `${escapeHtml(cat.label)} <span class="count-badge" style="font-size:0.75rem; padding: 2px 6px;">${count}</span>`;

    btn.addEventListener('click', () => {
      selectedCategory = cat.key;
      currentPage = 1;
      render();
    });

    categoryFiltersEl.appendChild(btn);
  });
}

/**
 * Renderiza a lista de produtos na view (com filtros, busca e paginação de 12 itens).
 */
export function render() {
  updateViewToggleButtons();

  const all = storage.getAllProducts();
  const receitas = storage.getAllPrecificacoes();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();
  const rates = costSettings.getCostSettings();

  updateProductStats(all, receitas);
  renderCategoryPills(all);

  const filtered = product.filterProducts(all, selectedCategory, searchQuery);

  const sorted = [...filtered].sort((a, b) =>
    String(a.titulo || a.nome || '').localeCompare(String(b.titulo || b.nome || ''))
  );

  const { pageItems, totalPages, currentPage: validPage, totalItems } = product.paginateItems(sorted, currentPage, PAGE_SIZE);
  currentPage = validPage;

  if (countEl) {
    countEl.textContent = all.length;
  }

  if (emptyEl) {
    const hasItems = pageItems.length > 0;
    emptyEl.hidden = hasItems;
    const msgEl = emptyEl.querySelector('p');
    if (msgEl) {
      if (all.length === 0) {
        msgEl.textContent = 'Nenhum produto cadastrado ainda.';
      } else if (searchQuery) {
        msgEl.textContent = `Nenhum produto encontrado para "${searchQuery}".`;
      } else if (selectedCategory) {
        msgEl.textContent = `Nenhum produto cadastrado na categoria "${selectedCategory}".`;
      } else {
        msgEl.textContent = 'Nenhum produto nesta página.';
      }
    }
  }

  if (paginationNav) {
    paginationNav.hidden = totalPages <= 1 || totalItems === 0;
  }
  if (pageInfo) {
    pageInfo.textContent = `Página ${currentPage} de ${totalPages} (${totalItems} ${totalItems === 1 ? 'produto' : 'produtos'})`;
  }
  if (prevBtn) {
    prevBtn.disabled = currentPage <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = currentPage >= totalPages;
  }

  if (!listEl) {
    return;
  }

  listEl.innerHTML = '';

  if (pageItems.length === 0) {
    return;
  }

  const getFin = (p) => getProductFinancials(p, receitas, insumos, bases, rates);

  if (currentViewMode === 'list') {
    listEl.className = 'product-list-view';
    listEl.appendChild(createTable(pageItems, getFin));
  } else {
    listEl.className = 'product-grid';
    pageItems.forEach((p) => listEl.appendChild(createCard(p, getFin(p))));
  }
}

/* ---------- Eventos de Busca e Paginação ---------- */
if (searchEl) {
  searchEl.addEventListener('input', (e) => {
    searchQuery = String(e.target.value || '').trim();
    currentPage = 1;
    render();
  });
}

if (prevBtn) {
  prevBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      render();
      listEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

if (nextBtn) {
  nextBtn.addEventListener('click', () => {
    currentPage++;
    render();
    listEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/**
 * Cria o card de um produto em modo grade.
 * @param {Object} p - Produto.
 * @param {Object} fin - Dados financeiros do produto.
 * @returns {HTMLElement} Card do produto.
 */
function createCard(p, fin) {
  const card = document.createElement('article');
  card.className = 'product-card';

  /* Cabeçalho do Card: Tipo do Produto + Badge de Estoque */
  const header = document.createElement('div');
  header.className = 'product-card-header';

  const type = document.createElement('span');
  type.className = 'product-type';
  type.textContent = p.tipoProduto || 'Sem tipo';

  const disp = estoque.disponivel(p);
  const stock = document.createElement('span');
  stock.className = `stock-badge stock-${estoque.stockStatus(disp)}`;
  stock.textContent = disp <= 0 ? 'Sem estoque' : `Estoque: ${disp}`;

  header.append(type, stock);

  /* Corpo do Card: Nome e Detalhes */
  const body = document.createElement('div');
  body.className = 'product-card-body';

  const name = document.createElement('h3');
  name.className = 'product-name';
  name.textContent = p.titulo || 'Produto sem título';

  const desc = document.createElement('p');
  desc.className = 'product-desc';
  const size = (p.tipoProduto === 'Bolo Inteiro' || p.tipoProduto === 'Bolo Naked') && p.tamanho ? p.tamanho : '';
  const parts = [size, p.detalhes].filter(Boolean);
  if (parts.length > 0) {
    desc.textContent = parts.join(' · ');
  } else {
    desc.textContent = 'Sem observações adicionais';
    desc.classList.add('product-desc--empty');
  }

  body.append(name, desc);

  /* Faixa Financeira: Venda, Custo Unit. e Margem Real */
  const finStrip = document.createElement('div');
  finStrip.className = 'product-financial-strip';

  const colPreco = document.createElement('div');
  colPreco.className = 'product-fin-col';
  const lblPreco = document.createElement('span');
  lblPreco.className = 'product-fin-label';
  lblPreco.textContent = 'Venda';
  const valPreco = document.createElement('span');
  valPreco.className = 'product-fin-value product-fin-value--price';
  valPreco.textContent = formatCurrency(fin.precoVenda);
  colPreco.append(lblPreco, valPreco);

  const colCusto = document.createElement('div');
  colCusto.className = 'product-fin-col';
  const lblCusto = document.createElement('span');
  lblCusto.className = 'product-fin-label';
  lblCusto.textContent = 'Custo Unit.';
  const valCusto = document.createElement('span');
  valCusto.className = 'product-fin-value';
  valCusto.textContent = fin.custoUnit !== null ? formatCurrency(fin.custoUnit) : '—';
  colCusto.append(lblCusto, valCusto);

  const colMargem = document.createElement('div');
  colMargem.className = 'product-fin-col';
  colMargem.style.alignItems = 'flex-end';
  const lblMargem = document.createElement('span');
  lblMargem.className = 'product-fin-label';
  lblMargem.textContent = 'Margem';
  colMargem.append(lblMargem, renderMarginBadge(fin));

  finStrip.append(colPreco, colCusto, colMargem);

  /* Rodapé do Card: Ações ergonômicas textuais */
  const footer = document.createElement('div');
  footer.className = 'product-footer';

  const actions = document.createElement('div');
  actions.className = 'product-actions';
  actions.append(
    createTextActionBtn('Editar', () => onEdit(p)),
    createTextActionBtn('Precificar', () => onPricing(p), 'action-info'),
    createTextActionBtn('Excluir', () => openDeleteModal(p), 'action-danger')
  );

  footer.append(actions);

  card.append(header, body, finStrip, footer);
  return card;
}

/**
 * Cria a tabela completa de produtos para o modo de exibição Lista / Tabela.
 * @param {Array<Object>} pageItems - Produtos da página atual.
 * @param {Function} getFin - Função para obter dados financeiros do produto.
 * @returns {HTMLElement} Container com a tabela responsiva.
 */
function createTable(pageItems, getFin) {
  const wrap = document.createElement('div');
  wrap.className = 'product-table-responsive';

  const table = document.createElement('table');
  table.className = 'product-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th scope="col" style="width: 110px;">Categoria</th>
      <th scope="col">Produto</th>
      <th scope="col" style="width: 120px;">Estoque</th>
      <th scope="col" class="num" style="width: 110px;">Preço Venda</th>
      <th scope="col" class="num" style="width: 110px;">Custo Unit.</th>
      <th scope="col" style="width: 100px; text-align: center;">Margem</th>
      <th scope="col" style="width: 200px; text-align: right;">Ações</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  pageItems.forEach((p) => {
    const fin = getFin(p);
    const disp = estoque.disponivel(p);
    const size = (p.tipoProduto === 'Bolo Inteiro' || p.tipoProduto === 'Bolo Naked') && p.tamanho ? p.tamanho : '';
    const parts = [size, p.detalhes].filter(Boolean);
    const subText = parts.length > 0 ? parts.join(' · ') : 'Sem detalhes adicionais';

    const tr = document.createElement('tr');

    // Categoria
    const tdCat = document.createElement('td');
    const badgeType = document.createElement('span');
    badgeType.className = 'product-type';
    badgeType.textContent = p.tipoProduto || 'Sem tipo';
    tdCat.appendChild(badgeType);

    // Produto
    const tdProd = document.createElement('td');
    const mainCell = document.createElement('div');
    mainCell.className = 'product-cell-main';
    const cellTitle = document.createElement('span');
    cellTitle.className = 'product-cell-title';
    cellTitle.textContent = p.titulo || 'Produto sem título';
    const cellSub = document.createElement('span');
    cellSub.className = 'product-cell-sub';
    cellSub.textContent = subText;
    mainCell.append(cellTitle, cellSub);
    tdProd.appendChild(mainCell);

    // Estoque
    const tdStock = document.createElement('td');
    const stockBadge = document.createElement('span');
    stockBadge.className = `stock-badge stock-${estoque.stockStatus(disp)}`;
    stockBadge.textContent = disp <= 0 ? 'Sem estoque' : `Estoque: ${disp}`;
    tdStock.appendChild(stockBadge);

    // Preço Venda
    const tdPreco = document.createElement('td');
    tdPreco.className = 'num';
    const strongPreco = document.createElement('strong');
    strongPreco.style.color = 'var(--color-primary)';
    strongPreco.textContent = formatCurrency(fin.precoVenda);
    tdPreco.appendChild(strongPreco);

    // Custo Unitário
    const tdCusto = document.createElement('td');
    tdCusto.className = 'num';
    tdCusto.textContent = fin.custoUnit !== null ? formatCurrency(fin.custoUnit) : '—';

    // Margem
    const tdMargem = document.createElement('td');
    tdMargem.style.textAlign = 'center';
    tdMargem.appendChild(renderMarginBadge(fin));

    // Ações
    const tdAcoes = document.createElement('td');
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'product-table-actions';
    actionsWrap.append(
      createTextActionBtn('Editar', () => onEdit(p)),
      createTextActionBtn('Precificar', () => onPricing(p), 'action-info'),
      createTextActionBtn('Excluir', () => openDeleteModal(p), 'action-danger')
    );
    tdAcoes.appendChild(actionsWrap);

    tr.append(tdCat, tdProd, tdStock, tdPreco, tdCusto, tdMargem, tdAcoes);
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/**
 * Cria um botão de ação com rótulo em texto puro.
 * @param {string} label - Rótulo do botão.
 * @param {Function} onClick - Handler de clique.
 * @param {string} [variant] - 'action-ok', 'action-info' ou 'action-danger'.
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
 * Escapa texto para uso seguro em HTML (títulos/tipos digitados pelo usuário).
 * @param {string} value - Texto a escapar.
 * @returns {string} Texto seguro.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
