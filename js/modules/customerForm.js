/* ============================================================
   CUSTOMERFORM.JS — Modal de criação e edição de cliente
   ------------------------------------------------------------
   Gerencia o modal #modalCustomer:
   - Validações (nome obrigatório)
   - Máscara / formatação de telefone
   - Inserção / atualização via storage.saveCustomer
   - Notifica ouvintes após salvar/excluir
   ============================================================ */

import * as storage from './storage.js';
import { showToast } from './toast.js';

let changeListener = null;
let currentCustomerId = null;

/** Gera ID único para novos clientes. */
function generateId() {
  return `cli_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Registra listener notificado após salvar/excluir cliente. */
export function setChangeListener(listener) {
  changeListener = listener;
}

function notifyChange() {
  if (typeof changeListener === 'function') {
    changeListener();
  }
}

/**
 * Abre o modal para cadastrar um novo cliente.
 * @param {Object} [prefill] - Dados pré-preenchidos (ex: nome vindo de um pedido).
 */
export function openNew(prefill = {}) {
  currentCustomerId = null;
  const modal = document.getElementById('modalCustomer');
  const title = document.getElementById('modalCustomerTitle');
  const form = document.getElementById('formCustomer');

  if (!modal || !form) return;

  if (title) title.textContent = 'Novo Cliente';
  form.reset();

  const nomeEl = document.getElementById('customerNome');
  const contatoEl = document.getElementById('customerContato');
  const niverEl = document.getElementById('customerNascimento');
  const enderecoEl = document.getElementById('customerEndereco');
  const obsEl = document.getElementById('customerObservacoes');

  if (nomeEl) nomeEl.value = prefill.nome || '';
  if (contatoEl) contatoEl.value = prefill.contato || '';
  if (niverEl) niverEl.value = prefill.dataNascimento || '';
  if (enderecoEl) enderecoEl.value = prefill.endereco || '';
  if (obsEl) obsEl.value = prefill.observacoes || '';

  modal.classList.add('active');
  if (nomeEl) nomeEl.focus();
}

/**
 * Abre o modal para editar um cliente existente.
 * @param {Object} customer - Objeto do cliente.
 */
export function openEdit(customer) {
  if (!customer) return;
  currentCustomerId = customer.id;

  const modal = document.getElementById('modalCustomer');
  const title = document.getElementById('modalCustomerTitle');
  const form = document.getElementById('formCustomer');

  if (!modal || !form) return;

  if (title) title.textContent = 'Editar Cliente';
  form.reset();

  const nomeEl = document.getElementById('customerNome');
  const contatoEl = document.getElementById('customerContato');
  const niverEl = document.getElementById('customerNascimento');
  const enderecoEl = document.getElementById('customerEndereco');
  const obsEl = document.getElementById('customerObservacoes');

  if (nomeEl) nomeEl.value = customer.nome || '';
  if (contatoEl) contatoEl.value = customer.contato || '';
  if (niverEl) niverEl.value = customer.dataNascimento || '';
  if (enderecoEl) enderecoEl.value = customer.endereco || '';
  if (obsEl) obsEl.value = customer.observacoes || '';

  modal.classList.add('active');
  if (nomeEl) nomeEl.focus();
}

/** Fecha o modal de cliente. */
export function close() {
  const modal = document.getElementById('modalCustomer');
  if (modal) modal.classList.remove('active');
  currentCustomerId = null;
}

/** Salva o cliente a partir dos campos do formulário. */
function handleSave(e) {
  if (e) e.preventDefault();

  const nomeEl = document.getElementById('customerNome');
  const contatoEl = document.getElementById('customerContato');
  const niverEl = document.getElementById('customerNascimento');
  const enderecoEl = document.getElementById('customerEndereco');
  const obsEl = document.getElementById('customerObservacoes');

  const nome = (nomeEl ? nomeEl.value : '').trim();
  if (!nome) {
    showToast('Informe o nome do cliente.', 'error');
    if (nomeEl) nomeEl.focus();
    return;
  }

  const contato = (contatoEl ? contatoEl.value : '').trim();
  const dataNascimento = (niverEl ? niverEl.value : '').trim();
  const endereco = (enderecoEl ? enderecoEl.value : '').trim();
  const observacoes = (obsEl ? obsEl.value : '').trim();

  const customer = {
    id: currentCustomerId || generateId(),
    nome,
    contato,
    dataNascimento,
    endereco,
    observacoes,
  };

  storage.saveCustomer(customer);
  showToast(currentCustomerId ? 'Cliente atualizado com sucesso!' : 'Cliente cadastrado com sucesso!');
  close();
  notifyChange();
}

/** Inicializa os event listeners do formulário e botões de fechar. */
export function init() {
  const form = document.getElementById('formCustomer');
  if (form) {
    form.addEventListener('submit', handleSave);
  }

  const cancelBtn = document.getElementById('btnCancelCustomer');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', close);
  }

  const closeBtn = document.getElementById('btnCloseModalCustomer');
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }

  const modal = document.getElementById('modalCustomer');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) close();
    });
  }
}
