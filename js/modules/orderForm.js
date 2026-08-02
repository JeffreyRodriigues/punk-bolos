/* ============================================================
   ORDERFORM.JS — Modal de cadastro/edição de pedido
   ------------------------------------------------------------
   Responsável por:
   - abrir/fechar o modal (novo ou edição)
   - gerenciar as LINHAS de ITEM: cada linha escolhe um produto
     do catálogo (sem digitação) + quantidade
   - recalcular o Valor Total automaticamente (soma das linhas)
   - validar e salvar (criar ou atualizar) via storage
   - notificar o restante do app (onChange) após cada mudança
   - oferecer atalho para cadastrar produtos que não existem
   ============================================================ */

import * as storage from './storage.js?v=12';
import * as order from './order.js?v=12';
import * as product from './product.js?v=12';
import { formatCurrency } from '../utils/money.js?v=12';

/* ---------- Elementos do DOM (resolvidos uma única vez) ---------- */
const modal = document.getElementById('orderModal');
const form = document.getElementById('orderForm');
const titleEl = document.getElementById('orderModalTitle');
const itemsContainer = document.getElementById('itemsContainer');
const totalEl = document.getElementById('field-valor-total');
const addItemBtn = document.getElementById('addItemBtn');
const itemsErrorHint = document.getElementById('items-error-hint');
const noProductsEl = document.getElementById('itemsNoProducts');
const createProductBtn = document.getElementById('btnCreateProduct');

/** Callback disparado após criar/atualizar (setado por app.js). */
let onChange = () => {};

/** Callback disparado ao pedir para criar produto (setado por app.js). */
let onCreateProduct = () => {};

/**
 * Registra o callback de notificação de mudanças.
 * @param {Function} cb - Função chamada após salvar um pedido.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/**
 * Registra o callback de "criar produto" (navega até a view Produtos).
 * @param {Function} cb - Função chamada ao clicar no atalho.
 */
export function setCreateProductHandler(cb) {
  onCreateProduct = cb;
}

/* ---------- Linhas de item (produto do catálogo) ---------- */

/**
 * Cria uma linha de item com seleção em cascata:
 * Tipo de produto → Sabor (produtos do catálogo daquele tipo) → Quantidade.
 * Nada é digitado — título e valor vêm do catálogo.
 * @param {Object} [item] - Dados iniciais do item (ao editar).
 * @returns {HTMLElement} Linha criada.
 */
function createItemRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'item-row';

  const tipoSelect = document.createElement('select');
  tipoSelect.className = 'item-tipo';
  tipoSelect.setAttribute('aria-label', 'Tipo de produto');
  order.PRODUCT_TYPES.forEach((type) => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    tipoSelect.appendChild(opt);
  });
  tipoSelect.value = item.tipoProduto || 'Fatia';

  const saborSelect = document.createElement('select');
  saborSelect.className = 'item-sabor';
  saborSelect.setAttribute('aria-label', 'Sabor / produto');

  /**
   * Popula o seletor de sabor com os produtos do catálogo do tipo
   * escolhido, preservando a seleção atual quando ainda válida.
   */
  function buildSaborOptions() {
    const tipo = tipoSelect.value;
    const previous = saborSelect.value;
    const products = product.getProducts().filter((p) => p.tipoProduto === tipo);

    saborSelect.innerHTML = '';
    if (products.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = `— nenhum produto de "${tipo}" no catálogo —`;
      saborSelect.appendChild(opt);
      return;
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Escolha o sabor —';
    saborSelect.appendChild(placeholder);

    [...products]
      .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)))
      .forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const size = p.tipoProduto === 'Bolo Inteiro' && p.tamanho ? ` (${p.tamanho})` : '';
        opt.textContent = `${p.titulo}${size} — ${formatCurrency(p.valor)}`;
        saborSelect.appendChild(opt);
      });

    if (previous && [...saborSelect.options].some((o) => o.value === previous)) {
      saborSelect.value = previous;
    }
  }
  buildSaborOptions();

  const qtdInput = document.createElement('input');
  qtdInput.type = 'number';
  qtdInput.className = 'item-qtd';
  qtdInput.min = '1';
  qtdInput.step = '1';
  qtdInput.title = 'Quantidade';
  qtdInput.value = item.quantidade != null ? item.quantidade : 1;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'item-remove';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remover item';
  removeBtn.setAttribute('aria-label', 'Remover item');
  removeBtn.addEventListener('click', () => {
    row.remove();
    recalcTotal();
  });

  // Ao editar: reconhece o produto que originou o item
  if (item.tipoProduto) {
    const match = product.matchProduct(item);
    if (match) {
      saborSelect.value = match.id;
    }
  }

  // Recalculo ao editar a linha
  tipoSelect.addEventListener('change', () => {
    buildSaborOptions();
    recalcTotal();
  });
  saborSelect.addEventListener('change', recalcTotal);
  qtdInput.addEventListener('input', recalcTotal);

  row.append(tipoSelect, saborSelect, qtdInput, removeBtn);
  return row;
}

/**
 * Tipo padrão para uma nova linha de item: o primeiro tipo do catálogo
 * que possuir produtos. Evita abrir a linha em "Fatia" quando só existem
 * bolos, por exemplo, deixando o seletor de sabor vazio.
 * @returns {string} Tipo de produto.
 */
function defaultItemType() {
  const available = new Set(product.getProducts().map((p) => p.tipoProduto));
  return order.PRODUCT_TYPES.find((t) => available.has(t)) || 'Fatia';
}

/**
 * Adiciona uma linha de item ao formulário.
 * @param {Object} [item] - Dados iniciais do item.
 */
function addItemRow(item = {}) {
  itemsContainer.appendChild(createItemRow(item));
  recalcTotal();
}

/**
 * Lê todas as linhas de item como objetos, resolvendo o produto
 * do catálogo. Linhas sem produto escolhido são ignoradas.
 * @returns {Array<Object>} Itens do formulário.
 */
function readItems() {
  const products = product.getProducts();
  const byId = new Map(products.map((p) => [p.id, p]));
  return [...itemsContainer.querySelectorAll('.item-row')]
    .map((row) => {
      const saborSelect = row.querySelector('.item-sabor');
      const qtdInput = row.querySelector('.item-qtd');
      const produtoId = saborSelect ? saborSelect.value : '';
      const chosen = produtoId ? byId.get(produtoId) : null;
      if (!chosen) return null;
      return {
        tipoProduto: chosen.tipoProduto,
        tamanho: chosen.tipoProduto === 'Bolo Inteiro' ? (chosen.tamanho || '') : '',
        sabor: chosen.titulo,
        quantidade: qtdInput ? qtdInput.value : 1,
        valorUnitario: chosen.valor,
      };
    })
    .filter(Boolean);
}

/* ---------- Abertura / fechamento ---------- */

/**
 * Atualiza o aviso de catálogo vazio. O atalho de criação fica
 * sempre visível (o produto procurado pode não estar cadastrado).
 */
function updateCatalogStatus() {
  const hasProducts = product.getProducts().length > 0;
  if (noProductsEl) {
    noProductsEl.hidden = hasProducts;
  }
}

/**
 * Abre o modal para criar um novo pedido.
 */
export function openNew() {
  form.reset();
  clearErrors();
  updateCatalogStatus();

  const orders = order.getOrders();
  const nextNumber = order.nextOrderNumber(orders);

  document.getElementById('field-id').value = '';
  document.getElementById('field-numero').value = nextNumber;
  document.getElementById('field-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('field-status').value = 'Pendente';
  document.getElementById('field-pagamento').value = 'PIX';
  document.getElementById('field-entrega').value = 'Retirada';

  // Reinicia com uma linha de item vazia (no tipo que tem produtos)
  itemsContainer.innerHTML = '';
  addItemRow({ tipoProduto: defaultItemType() });
  totalEl.textContent = formatCurrency(0);

  titleEl.textContent = 'Novo Pedido';
  openModal();
}

/**
 * Abre o modal para editar um pedido existente.
 * @param {Object} orderToEdit - Pedido a ser editado.
 */
export function openEdit(orderToEdit) {
  form.reset();
  clearErrors();
  updateCatalogStatus();

  document.getElementById('field-id').value = orderToEdit.id;
  document.getElementById('field-numero').value = orderToEdit.numero;
  document.getElementById('field-data').value = orderToEdit.data || '';
  document.getElementById('field-cliente').value = orderToEdit.cliente || '';
  document.getElementById('field-contato').value = orderToEdit.contato || '';
  document.getElementById('field-status').value = orderToEdit.status || 'Pendente';
  document.getElementById('field-pagamento').value = orderToEdit.pagamento || 'PIX';
  document.getElementById('field-entrega').value = orderToEdit.entrega || 'Retirada';
  document.getElementById('field-observacoes').value = orderToEdit.observacoes || '';

  // Preenche as linhas de item a partir do pedido
  const items = Array.isArray(orderToEdit.itens) ? orderToEdit.itens : [];
  itemsContainer.innerHTML = '';
  if (items.length === 0) {
    addItemRow();
  } else {
    items.forEach((item) => addItemRow(item));
  }

  titleEl.textContent = 'Editar Pedido';
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
  // Foca o primeiro campo para digitação rápida
  setTimeout(() => document.getElementById('field-cliente').focus(), 250);
}

/* ---------- Cálculo do total ---------- */

/**
 * Recalcula e exibe o Valor Total somando todas as linhas de item.
 */
function recalcTotal() {
  totalEl.textContent = formatCurrency(order.totalValue(readItems()));
}

/* ---------- Validação ---------- */

/**
 * Limpa as mensagens de erro e a classe "invalid" dos campos.
 */
function clearErrors() {
  form.querySelectorAll('.invalid').forEach((field) => field.classList.remove('invalid'));
  itemsErrorHint.textContent = '';
}

/**
 * Aplica as mensagens de erro retornadas pela validação.
 * @param {Object} errors - Mapa campo -> mensagem.
 */
function showErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    if (field === 'itens') {
      // Erro da seção de itens
      itemsErrorHint.textContent = message;
      itemsContainer.classList.add('invalid');
      return;
    }
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
    data: document.getElementById('field-data').value,
    cliente: document.getElementById('field-cliente').value,
    contato: document.getElementById('field-contato').value,
    itens: readItems(),
    status: document.getElementById('field-status').value,
    pagamento: document.getElementById('field-pagamento').value,
    entrega: document.getElementById('field-entrega').value,
    observacoes: document.getElementById('field-observacoes').value,
  };
}

/**
 * Salva o pedido (cria se não tem id, atualiza se tem).
 * Valida antes de persistir; notifica o app via onChange.
 * @returns {boolean} true se salvou com sucesso.
 */
function handleSubmit(event) {
  event.preventDefault();

  const data = readFormData();
  const validation = order.validateOrder(data);

  if (!validation.valid) {
    showErrors(validation.errors);
    return false;
  }

  const orders = order.getOrders();
  const id = document.getElementById('field-id').value;

  if (id) {
    // EDIÇÃO: atualiza o pedido existente mantendo id e número
    const index = orders.findIndex((o) => o.id === id);
    if (index !== -1) {
      orders[index] = { ...order.createOrder(data, orders[index].numero), id };
    }
  } else {
    // CRIAÇÃO: novo pedido com próximo número
    const numero = order.nextOrderNumber(orders);
    orders.push(order.createOrder(data, numero));
  }

  storage.save(orders);
  closeModal();
  onChange();
  return true;
}

/* ---------- Eventos ---------- */

// Botão "Adicionar item"
addItemBtn.addEventListener('click', () => addItemRow({ tipoProduto: defaultItemType() }));

// Atalho para cadastrar produto que não está no catálogo
// (wrapper: captura o callback atual, não o valor no momento do bind)
if (createProductBtn) {
  createProductBtn.addEventListener('click', () => onCreateProduct());
}

// Submit do formulário
form.addEventListener('submit', handleSubmit);

// Fechar ao clicar no backdrop ou no botão ✕
modal.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closeModal);
});

// Fechar com a tecla Esc (não interfere em campos digitáveis)
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && modal.classList.contains('open')) {
    closeModal();
  }
});
