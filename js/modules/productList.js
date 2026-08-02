/* ============================================================
   PRODUCTLIST.JS — Lista de produtos (view Produtos)
   ------------------------------------------------------------
   Renderiza os cards do catálogo com preço e ações de
   editar/excluir. Delega a criação/edição ao productForm e a
   exclusão ao próprio módulo (com confirmação).
   ============================================================ */

import * as storage from './storage.js';
import { formatCurrency } from '../utils/money.js';
import { showToast } from './toast.js';

const listEl = document.getElementById('productList');
const emptyEl = document.getElementById('productEmpty');
const countEl = document.getElementById('productCount');

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
 * Renderiza a lista de produtos na view.
 */
export function render() {
  const products = storage.getAllProducts();

  if (countEl) {
    countEl.textContent = products.length;
  }
  if (emptyEl) {
    emptyEl.hidden = products.length > 0;
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
function createCard(p) {
  const card = document.createElement('article');
  card.className = 'product-card';

  const info = document.createElement('div');
  info.className = 'product-info';

  const name = document.createElement('div');
  name.className = 'product-name';
  name.textContent = p.titulo || 'Produto sem título';

  const desc = document.createElement('div');
  desc.className = 'product-desc';
  const size = p.tipoProduto === 'Bolo Inteiro' && p.tamanho ? ` ${p.tamanho}` : '';
  desc.textContent = `${p.tipoProduto}${size}${p.detalhes ? ` · ${p.detalhes}` : ''}`;

  info.append(name, desc);

  const price = document.createElement('div');
  price.className = 'product-price';
  price.textContent = formatCurrency(p.valor);

  const actions = document.createElement('div');
  actions.className = 'product-actions';
  actions.append(
    createIconBtn('✏️', 'Editar produto', () => onEdit(p)),
    createIconBtn('🗑️', 'Excluir produto', () => remove(p), 'danger')
  );

  card.append(info, price, actions);
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
