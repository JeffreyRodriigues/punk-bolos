/* ============================================================
   PRODUCTFORM.JS — Modal de cadastro/edição de produto
   ------------------------------------------------------------
   Campos: Título, Tipo de produto, Valor e Detalhes.
   - abrir/fechar o modal (novo ou edição)
   - validar e salvar via storage
   - notificar o restante do app (onChange) após cada mudança
   ============================================================ */

import * as storage from './storage.js';
import * as product from './product.js';
import { showToast } from './toast.js';

/* ---------- Elementos do DOM (resolvidos uma única vez) ---------- */
const modal = document.getElementById('productModal');
const form = document.getElementById('productForm');
const titleEl = document.getElementById('productModalTitle');
const tamanhoWrap = document.getElementById('field-tamanho-wrap');

/** Callback disparado após salvar/excluir (setado por app.js). */
let onChange = () => {};

/**
 * Registra o callback de notificação de mudanças.
 * @param {Function} cb - Função chamada após salvar/excluir.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/* ---------- Visibilidade do tamanho ---------- */

/**
 * Tamanho só é exibido para "Bolo Inteiro".
 */
function updateTamanhoVisibility() {
  const isCake =
    document.getElementById('field-tipo-produto').value === 'Bolo Inteiro';
  tamanhoWrap.hidden = !isCake;
}

/* ---------- Abertura / fechamento ---------- */

/**
 * Abre o modal para criar um novo produto.
 */
export function openNew() {
  form.reset();
  clearErrors();
  document.getElementById('field-id').value = '';
  document.getElementById('field-tipo-produto').value = 'Fatia';
  document.getElementById('field-tamanho-produto').value = 'P';
  updateTamanhoVisibility();

  titleEl.textContent = 'Novo produto';
  openModal();
}

/**
 * Abre o modal para editar um produto existente.
 * @param {Object} productToEdit - Produto a ser editado.
 */
export function openEdit(productToEdit) {
  form.reset();
  clearErrors();

  document.getElementById('field-id').value = productToEdit.id || '';
  document.getElementById('field-titulo').value = productToEdit.titulo || '';
  document.getElementById('field-tipo-produto').value = productToEdit.tipoProduto || 'Fatia';
  document.getElementById('field-tamanho-produto').value = productToEdit.tamanho || 'P';
  document.getElementById('field-valor').value = productToEdit.valor != null ? productToEdit.valor : '';
  document.getElementById('field-detalhes').value = productToEdit.detalhes || '';
  updateTamanhoVisibility();

  titleEl.textContent = 'Editar produto';
  openModal();
}

/**
 * Fecha o modal (via botão, backdrop ou tecla Esc).
 */
export function closeModal() {
  modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

/**
 * Abre o modal e impede o scroll do fundo.
 */
function openModal() {
  modal.classList.add('open');
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('field-titulo').focus(), 250);
}

/* ---------- Validação ---------- */

/**
 * Limpa mensagens de erro e a classe "invalid" dos campos.
 */
function clearErrors() {
  form.querySelectorAll('.invalid').forEach((field) => field.classList.remove('invalid'));
  form.querySelectorAll('.error-hint').forEach((hint) => { hint.textContent = ''; });
}

/**
 * Aplica as mensagens de erro retornadas pela validação.
 * @param {Object} errors - Mapa campo -> mensagem.
 */
function showErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    const control = document.getElementById(`field-${field}`);
    const wrap = control ? control.closest('.form-field') : null;
    if (wrap) {
      wrap.classList.add('invalid');
      const hint = wrap.querySelector('.error-hint');
      if (hint) {
        hint.textContent = message;
      }
    }
  });
}

/* ---------- Submit ---------- */

/**
 * Lê os valores do formulário para um objeto de dados.
 * @returns {Object} Dados brutos do formulário.
 */
function readFormData() {
  return {
    id: document.getElementById('field-id').value,
    titulo: document.getElementById('field-titulo').value,
    tipoProduto: document.getElementById('field-tipo-produto').value,
    tamanho: document.getElementById('field-tamanho-produto').value,
    valor: document.getElementById('field-valor').value,
    detalhes: document.getElementById('field-detalhes').value,
  };
}

/**
 * Salva o produto (cria se não tem id, atualiza se tem).
 * @returns {boolean} true se salvou com sucesso.
 */
function handleSubmit(event) {
  event.preventDefault();

  const data = readFormData();
  const validation = product.validateProduct(data);

  if (!validation.valid) {
    showErrors(validation.errors);
    return false;
  }

  const products = product.getProducts();
  const index = products.findIndex((p) => p.id === data.id);

  if (index !== -1) {
    // EDIÇÃO: atualiza mantendo id
    products[index] = product.createProduct({ ...data, id: data.id });
  } else {
    // CRIAÇÃO: novo produto
    products.push(product.createProduct(data));
  }

  storage.saveProducts(products);
  closeModal();
  showToast('Produto salvo!');
  onChange();
  return true;
}

/* ---------- Eventos ---------- */

// Tamanho só para Bolo Inteiro
document.getElementById('field-tipo-produto').addEventListener('change', updateTamanhoVisibility);

// Submit do formulário
form.addEventListener('submit', handleSubmit);

// Fechar ao clicar no backdrop ou no botão ✕
modal.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closeModal);
});

// Fechar com a tecla Esc
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.classList.contains('open')) {
    closeModal();
  }
});
