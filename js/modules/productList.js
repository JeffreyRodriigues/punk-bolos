/* ============================================================
   PRODUCTLIST.JS — Lista de produtos (view Produtos)
   ------------------------------------------------------------
   Renderiza os cards do catálogo com preço e ações de
   editar/excluir. Delega a criação/edição ao productForm e a
   exclusão ao próprio módulo (com confirmação).
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as estoque from './estoque.js?v=1';
import { formatCurrency } from '../utils/money.js?v=12';
import { showToast } from './toast.js?v=12';

const listEl = document.getElementById('productList');
const emptyEl = document.getElementById('productEmpty');
const countEl = document.getElementById('productCount');
const filterEl = document.getElementById('productTypeFilter');

filterEl?.addEventListener('change', render);

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
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome)))
    .forEach((p) => listEl.appendChild(createCard(p)));
}

/**
 * Cria o card de um produto.
 * @param {Object} p - Produto.
 * @returns {HTMLElement} Card.
 */
function createCard(p) {  const card = document.createElement('article');
  card.className = 'product-card';

  const info = document.createElement('div');
  info.className = 'product-info';

  const type = document.createElement('span');
  type.className = 'product-type';
  type.textContent = p.tipoProduto || 'Sem tipo';

  const name = document.createElement('div');
  name.className = 'product-name';
  name.textContent = p.titulo || 'Produto sem título';

  const desc = document.createElement('div');
  desc.className = 'product-desc';
  const size = p.tipoProduto === 'Bolo Inteiro' && p.tamanho ? p.tamanho : '';
  const parts = [size, p.detalhes].filter(Boolean);
  if (parts.length > 0) {
    desc.textContent = parts.join(' · ');
  }

  info.append(type, name, desc);

  const price = document.createElement('div');
  price.className = 'product-price';
  price.textContent = formatCurrency(p.valor);

  // Estoque: badge colorido apenas para produtos com controle ativo
  if (p.controlaEstoque) {
    const disp = estoque.disponivel(p);
    const stock = document.createElement('span');
    stock.className = `stock-badge stock-${estoque.stockStatus(disp)}`;
    stock.textContent = disp <= 0 ? 'Sem estoque' : `Estoque: ${disp}`;
    info.appendChild(stock);
  }

  const actions = document.createElement('div');
  actions.className = 'product-actions';
  actions.append(
    createIconBtn('✏️', 'Editar produto', () => onEdit(p)),
    createIconBtn('🗑️', 'Excluir produto', () => remove(p), 'danger')
  );

  const footer = document.createElement('div');
  footer.className = 'product-footer';
  footer.append(price, actions);

  card.append(info, footer);
  return card;
}

/**
 * Cria um botão de ícone para as ações do card.
 * @param {string} icon - Emoji do botão.
 * @param {string} label - Aria-label (acessibilidade).
 * @param {Function} onClick - Handler de clique.
 * @param {string} [modifier] - Modificador opcional de cor ("danger").
 * @returns {HTMLElement} Botão.
 */
function createIconBtn(icon, label, onClick, modifier = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn${modifier ? ` ${modifier}` : ''}`;
  btn.textContent = icon;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Exclui um produto com confirmação e notifica o app.
 * @param {Object} p - Produto a excluir.
 */
function remove(p) {
  const confirmed = window.confirm(`Excluir o produto "${p.titulo}"?`);
  if (!confirmed) return;

  const products = storage.getAllProducts();
  storage.saveProducts(products.filter((item) => item.id !== p.id));
  showToast('Produto excluído!');
  render();
  onChange();
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
