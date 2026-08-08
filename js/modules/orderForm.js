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

import * as storage from './storage.js?v=13';
import * as order from './order.js?v=16';
import * as product from './product.js?v=16';
import * as estoque from './estoque.js?v=4';
import { formatCurrency } from '../utils/money.js?v=12';
import { defaultItemType } from '../utils/describe.js?v=1';

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

/** Rascunho do pedido preservado ao ir criar um produto no catálogo. */
let pendingDraft = null;

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
 * Descobre o produto do catálogo que originou um item (em edição).
 * Prioriza saborId (formato novo); senão casa por tipo+tamanho+valor.
 * @param {Object} item - Item do pedido.
 * @returns {string} Id do produto (ou "" quando não resolve).
 */
function resolveItemProductId(item) {
  if (!item || typeof item !== 'object') return '';
  if (item.saborId) {
    const byId = product.getProducts().find((p) => p.id === item.saborId);
    if (byId) return byId.id;
  }
  if (item.tipoProduto) {
    const match = product.matchProduct(item);
    if (match) return match.id;
  }
  return '';
}

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

  // Produto que originou o item em edição (sempre exibido, mesmo sem estoque).
  const edittingProductId = resolveItemProductId(item);

  /**
   * Popula o seletor de sabor com os produtos do catálogo do tipo
   * escolhido, preservando a seleção atual quando ainda válida.
   * Só mostra produtos com DISPONIBILIDADE para venda (disponível > 0),
   * já que não é possível vender sem produção. Ao editar um pedido, o
   * produto do item atual é sempre incluído (mesmo sem o item segue
   * fazendo parte do pedido).
   */
  function buildSaborOptions() {
    const tipo = tipoSelect.value;
    const previous = saborSelect.value;
    const editingId = document.getElementById('field-id').value;
    const catalogByType = product.getProducts().filter((p) => p.tipoProduto === tipo);
    const products = estoque.produtosDisponiveis(catalogByType, {
      excludeOrderId: editingId,
      requiredId: edittingProductId || '',
    });

    saborSelect.innerHTML = '';
    if (products.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = catalogByType.length > 0
        ? `— nenhum produto de "${tipo}" disponível agora —`
        : `— nenhum produto de "${tipo}" no catálogo —`;
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

  const priceEl = document.createElement('span');
  priceEl.className = 'item-price';
  priceEl.setAttribute('aria-label', 'Preço unitário');

  const stockEl = document.createElement('span');
  stockEl.className = 'item-stock';
  stockEl.hidden = true;

  /**
   * Mostra o preço unitário do produto selecionado e o saldo disponível
   * (avisa se a quantidade digitada excede o estoque). Como a produção
   * é obrigatória, o estoque é exibido para qualquer produto.
   */
  function updateItemInfo() {
    const chosen = product.getProducts().find((p) => p.id === saborSelect.value);
    priceEl.textContent = chosen ? formatCurrency(chosen.valor) : '';

    if (chosen) {
      const disp = estoque.disponivel(chosen);
      const produzido = estoque.totalProduzido(chosen.id);
      const reservado = estoque.totalReservado(chosen.id);
      stockEl.hidden = false;
      if (produzido <= 0) {
        stockEl.textContent = 'Sem produção registrada';
      } else if (reservado > 0) {
        stockEl.textContent = `Disponível: ${disp} (${reservado} reservado)`;
      } else {
        stockEl.textContent = `Estoque: ${disp}`;
      }
      stockEl.className = `item-stock stock-${estoque.stockStatus(disp)}`;
      const qtd = Number(qtdInput.value) || 0;
      if (qtd > disp) {
        stockEl.classList.add('stock-warning');
      } else {
        stockEl.classList.remove('stock-warning');
      }
    } else {
      stockEl.hidden = true;
    }
  }

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
  if (item.saborId && [...saborSelect.options].some((o) => o.value === item.saborId)) {
    saborSelect.value = item.saborId;
  } else if (item.tipoProduto) {
    const match = product.matchProduct(item);
    if (match) {
      saborSelect.value = match.id;
    }
  }

  // Exibe o preço após restaurar a seleção (senão some ao reabrir o pedido)
  updateItemInfo();

  // Recalculo ao editar a linha
  tipoSelect.addEventListener('change', () => {
    buildSaborOptions();
    updateItemInfo();
    recalcTotal();
  });
  saborSelect.addEventListener('change', () => {
    updateItemInfo();
    recalcTotal();
  });
  qtdInput.addEventListener('input', () => {
    updateItemInfo();
    recalcTotal();
  });

  row.append(tipoSelect, saborSelect, qtdInput, priceEl, stockEl, removeBtn);
  return row;
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
        produtoId: chosen.id,
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
  pendingDraft = null;
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

  // Reinicia com uma linha de item vazia (no primeiro tipo que tiver
  // produtos com disponibilidade para venda)
  itemsContainer.innerHTML = '';
  const disponiveis = estoque.produtosDisponiveis(product.getProducts());
  addItemRow({ tipoProduto: defaultItemType(disponiveis.length > 0 ? disponiveis : product.getProducts(), order.PRODUCT_TYPES) });
  totalEl.textContent = formatCurrency(0);

  titleEl.textContent = 'Novo Pedido';
  openModal();
}

/**
 * Abre o modal para editar um pedido existente.
 * @param {Object} orderToEdit - Pedido a ser editado.
 */
export function openEdit(orderToEdit) {
  pendingDraft = null;
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

/* ---------- Rascunho ao criar produto no catálogo ---------- */

/**
 * Salva os valores atuais do formulário (incluindo linhas de item)
 * para restaurar o pedido após cadastrar um produto no catálogo.
 */
function saveDraft() {
  const rows = [...itemsContainer.querySelectorAll('.item-row')].map((row) => ({
    tipo: row.querySelector('.item-tipo').value,
    saborId: row.querySelector('.item-sabor').value,
    qtd: row.querySelector('.item-qtd').value,
  }));
  pendingDraft = {
    id: document.getElementById('field-id').value,
    numero: document.getElementById('field-numero').value,
    data: document.getElementById('field-data').value,
    cliente: document.getElementById('field-cliente').value,
    contato: document.getElementById('field-contato').value,
    status: document.getElementById('field-status').value,
    pagamento: document.getElementById('field-pagamento').value,
    entrega: document.getElementById('field-entrega').value,
    observacoes: document.getElementById('field-observacoes').value,
    rows,
  };
}

/**
 * Prepara a saída para o cadastro de produto: guarda o rascunho e fecha.
 * Chamado pelo app.js quando o usuário usa o atalho do modal de pedido.
 */
export function prepareLeave() {
  saveDraft();
  closeModal();
}

/**
 * Reabre o modal de pedido com o rascunho preservado, se houver.
 * @returns {boolean} true se restaurou um pedido pendente.
 */
export function restorePending() {
  if (!pendingDraft) return false;
  const d = pendingDraft;
  pendingDraft = null;

  form.reset();
  clearErrors();
  updateCatalogStatus();

  document.getElementById('field-id').value = d.id || '';
  document.getElementById('field-numero').value = d.numero || '';
  document.getElementById('field-data').value = d.data || '';
  document.getElementById('field-cliente').value = d.cliente || '';
  document.getElementById('field-contato').value = d.contato || '';
  document.getElementById('field-status').value = d.status || 'Pendente';
  document.getElementById('field-pagamento').value = d.pagamento || 'PIX';
  document.getElementById('field-entrega').value = d.entrega || 'Retirada';
  document.getElementById('field-observacoes').value = d.observacoes || '';

  itemsContainer.innerHTML = '';
  if (d.rows.length === 0) {
    addItemRow({ tipoProduto: defaultItemType(product.getProducts(), order.PRODUCT_TYPES) });
  } else {
    d.rows.forEach((row) => addItemRow({ tipoProduto: row.tipo, saborId: row.saborId, quantidade: row.qtd }));
  }

  titleEl.textContent = d.id ? 'Editar Pedido' : 'Novo Pedido';
  openModal();
  return true;
}

/* ---------- Cálculo do total ---------- */

/**
 * Recalcula e exibe o Valor Total somando todas as linhas de item.
 * Pedidos com pagamento CORTESIA ficam com valor R$ 0,00.
 */
function recalcTotal() {
  const pagamento = document.getElementById('field-pagamento').value;
  totalEl.textContent = formatCurrency(order.orderTotalValue(readItems(), pagamento));
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

  // Produção obrigatória: bloqueia na criação/salvamento (exceto pedidos
  // cancelados) com mensagem explícita quando falta produção.
  // O abate em si ocorre ao CONCLUIR o pedido.
  if (data.status !== 'Cancelado') {
    const id = document.getElementById('field-id').value;
    const stockErrors = estoque.validateItens(data.itens, { excludeOrderId: id });
    if (stockErrors.length > 0) {
      const detail = stockErrors.map((e) => estoque.describeErro(e)).join('; ');
      showErrors({ itens: `Produto sem produção para a venda: ${detail}` });
      showToast('Para vender, o produto precisa ter sido produzido.', 'error');
      return false;
    }
  }

  const orders = order.getOrders();
  const id = document.getElementById('field-id').value;

  if (id) {
    // EDIÇÃO: atualiza o pedido existente mantendo id e número.
    // Preserva o flag consomeEstoque (pedidos históricos/importados
    // continuam sem abater estoque ao serem apenas editados).
    const index = orders.findIndex((o) => o.id === id);
    if (index !== -1) {
      orders[index] = {
        ...order.createOrder(data, orders[index].numero),
        id,
        consomeEstoque: orders[index].consomeEstoque !== false,
      };
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
addItemBtn.addEventListener('click', () => addItemRow({ tipoProduto: defaultItemType(product.getProducts(), order.PRODUCT_TYPES) }));

// Forma de pagamento: CORTESIA zera o valor total do pedido
document.getElementById('field-pagamento').addEventListener('change', () => {
  recalcTotal();
});

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
