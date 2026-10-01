/* ============================================================
   PRODUCTLIST.JS — Lista de produtos (view Produtos)
   ------------------------------------------------------------
   Renderiza os cards do catálogo com preço e ações de
   editar/excluir. Delega a criação/edição ao productForm e a
   exclusão ao próprio módulo (com confirmação).
   ============================================================ */

import * as storage from './storage.js';
import * as estoque from './estoque.js';
import { formatCurrency } from '../utils/money.js';
import { showToast } from './toast.js';

const listEl = document.getElementById('productList');
const emptyEl = document.getElementById('productEmpty');
const countEl = document.getElementById('productCount');
const filterEl = document.getElementById('productTypeFilter');

/* Modal de exclusão customizado */
const deleteModal = document.getElementById('productDeleteModal');
const deleteDescEl = document.getElementById('productDeleteModalDesc');
const confirmDeleteBtn = document.getElementById('btnConfirmProductDelete');
let pendingDeleteProduct = null;

filterEl?.addEventListener('change', render);

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
 * Registra o callback de notificação de mudanças (exclusão).
 * @param {Function} cb - Função chamada após excluir um produto.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/**
 * Renderiza a lista de produtos na view (com filtro por tipo).
 */
export function render() {
  const all = storage.getAllProducts();
  const types = [...new Set(all.map((p) => String(p.tipoProduto || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  if (filterEl) {
    const current = filterEl.value;
    filterEl.innerHTML = `<option value="">Todos os tipos</option>` +
      types.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    if (current && types.includes(current)) {
      filterEl.value = current;
    }
  }

  const selected = filterEl ? filterEl.value : '';
  const products = selected
    ? all.filter((p) => String(p.tipoProduto || '').trim() === selected)
    : all;

  if (countEl) {
    countEl.textContent = products.length;
  }
  if (emptyEl) {
    emptyEl.hidden = products.length > 0;
    const msgEl = emptyEl.querySelector('p');
    if (msgEl) {
      msgEl.textContent = all.length === 0
        ? 'Nenhum produto cadastrado ainda.'
        : 'Nenhum produto deste tipo.';
    }
  }
  if (!listEl) {
    return;
  }

  listEl.innerHTML = '';
  [...products]
    .sort((a, b) => String(a.titulo || a.nome || '').localeCompare(String(b.titulo || b.nome || '')))
    .forEach((p) => listEl.appendChild(createCard(p)));
}

/**
 * Cria o card de um produto com visualização profissional e padronizada.
 * @param {Object} p - Produto.
 * @returns {HTMLElement} Card.
 */
function createCard(p) {
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

  /* Rodapé do Card: Preço + Ações textuais */
  const footer = document.createElement('div');
  footer.className = 'product-footer';

  const priceWrap = document.createElement('div');
  priceWrap.className = 'product-price-wrap';

  const priceLabel = document.createElement('span');
  priceLabel.className = 'product-price-label';
  priceLabel.textContent = 'Preço';

  const price = document.createElement('span');
  price.className = 'product-price';
  price.textContent = formatCurrency(p.valor);

  priceWrap.append(priceLabel, price);

  const actions = document.createElement('div');
  actions.className = 'product-actions';
  actions.append(
    createTextActionBtn('Editar', () => onEdit(p)),
    createTextActionBtn('Excluir', () => openDeleteModal(p), 'action-danger')
  );

  footer.append(priceWrap, actions);

  card.append(header, body, footer);
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
