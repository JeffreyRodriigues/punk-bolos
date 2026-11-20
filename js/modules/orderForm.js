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

import * as storage from './storage.js';
import * as order from './order.js';
import * as product from './product.js';
import * as estoque from './estoque.js';
import * as customerService from './customerService.js';
import { formatCurrency } from '../utils/money.js';
import { defaultItemType } from '../utils/describe.js';
import { showToast } from './toast.js';

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
 * Prioriza produtoId (novo formato); senão saborId (transição);
 * por último casa por tipo+tamanho+valor (pedidos legados/importados).
 * @param {Object} item - Item do pedido.
 * @returns {string} Id do produto (ou "" quando não resolve).
 */
function resolveItemProductId(item) {
  if (!item || typeof item !== 'object') return '';
  const inferredType = product.inferProductType(item);
  const isCake = inferredType === 'Bolo Inteiro' || inferredType === 'Bolo Naked';
  const cleanTam = String(item.tamanho || '').trim().replace(/^Bolo\s+/i, '').replace(/\s*\(.*$/, '').trim();
  const normalizedItem = { ...item, tipoProduto: inferredType, tamanho: cleanTam };

  if (normalizedItem.produtoId) {
    const byId = product.getProducts().find((p) => p.id === normalizedItem.produtoId);
    if (byId && byId.tipoProduto === inferredType) {
      if (!isCake || (byId.tamanho === cleanTam || !cleanTam)) {
        return byId.id;
      }
    }
  }
  if (normalizedItem.saborId) {
    const byId = product.getProducts().find((p) => p.id === normalizedItem.saborId);
    if (byId && byId.tipoProduto === inferredType) {
      return byId.id;
    }
  }
  const match = product.matchProduct(normalizedItem);
  if (match && match.tipoProduto === inferredType) {
    if (!isCake || match.tamanho === cleanTam || !cleanTam) {
      return match.id;
    }
  }

  // Se o item tem dados de produto mas não existe no catálogo com o tipo e tamanho corretos, cria automaticamente
  if (normalizedItem.sabor || normalizedItem.titulo || normalizedItem.tipoProduto) {
    const created = product.ensureProduct(normalizedItem);
    if (created && created.id) return created.id;
  }
  return '';
}

/**
 * Cria uma linha de item com seleção em cascata moderna:
 * Tipo de produto → Sabor (produtos do catálogo daquele tipo) → Quantidade com stepper.
 * Nada é digitado — título e valor vêm do catálogo.
 * @param {Object} [item] - Dados iniciais do item (ao editar).
 * @returns {HTMLElement} Linha criada.
 */
function createItemRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'item-row item-card-modern';

  const inferredType = product.inferProductType(item);
  const normalizedItem = { ...item, tipoProduto: inferredType };

  // Produto que originou o item em edição (sempre exibido, mesmo sem estoque).
  const edittingProductId = resolveItemProductId(normalizedItem);
  const resolvedProd = product.getProducts().find((p) => p.id === edittingProductId);

  // 1. Linha superior: Seletores e Ação Remover
  const topRow = document.createElement('div');
  topRow.className = 'item-row-top';

  const pickersWrap = document.createElement('div');
  pickersWrap.className = 'item-product-pickers';

  const tipoSelect = document.createElement('select');
  tipoSelect.className = 'item-tipo';
  tipoSelect.setAttribute('aria-label', 'Tipo de produto');
  order.PRODUCT_TYPES.forEach((type) => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    tipoSelect.appendChild(opt);
  });
  tipoSelect.value = resolvedProd ? resolvedProd.tipoProduto : inferredType;

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
    placeholder.textContent = '— Escolha o sabor / produto —';
    saborSelect.appendChild(placeholder);

    [...products]
      .sort((a, b) => String(a.titulo).localeCompare(String(b.titulo)))
      .forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const isCake = p.tipoProduto === 'Bolo Inteiro' || p.tipoProduto === 'Bolo Naked';
        const size = isCake && p.tamanho ? ` (${p.tamanho})` : '';
        opt.textContent = `${p.titulo}${size} — ${formatCurrency(p.valor)}`;
        saborSelect.appendChild(opt);
      });

    if (previous && [...saborSelect.options].some((o) => o.value === previous)) {
      saborSelect.value = previous;
    }
  }
  buildSaborOptions();

  pickersWrap.append(tipoSelect, saborSelect);

  const topActions = document.createElement('div');
  topActions.className = 'item-top-actions';

  const stockEl = document.createElement('span');
  stockEl.className = 'item-stock';
  stockEl.hidden = true;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'item-remove';
  removeBtn.textContent = '✕';
  removeBtn.title = 'Remover produto';
  removeBtn.setAttribute('aria-label', 'Remover produto');
  removeBtn.addEventListener('click', () => {
    row.remove();
    recalcTotal();
  });

  topActions.append(stockEl, removeBtn);
  topRow.append(pickersWrap, topActions);

  // 2. Linha inferior: Stepper de quantidade, Preço Unitário, Subtotal e Cortesia
  const bottomRow = document.createElement('div');
  bottomRow.className = 'item-row-bottom';

  const stepperWrap = document.createElement('div');
  stepperWrap.className = 'item-stepper';

  const btnMinus = document.createElement('button');
  btnMinus.type = 'button';
  btnMinus.className = 'btn-stepper btn-stepper-minus';
  btnMinus.textContent = '-';
  btnMinus.title = 'Diminuir quantidade';
  btnMinus.setAttribute('aria-label', 'Diminuir quantidade');

  const qtdInput = document.createElement('input');
  qtdInput.type = 'number';
  qtdInput.className = 'item-qtd';
  qtdInput.min = '1';
  qtdInput.step = '1';
  qtdInput.title = 'Quantidade';
  qtdInput.value = item.quantidade != null ? item.quantidade : 1;

  const btnPlus = document.createElement('button');
  btnPlus.type = 'button';
  btnPlus.className = 'btn-stepper btn-stepper-plus';
  btnPlus.textContent = '+';
  btnPlus.title = 'Aumentar quantidade';
  btnPlus.setAttribute('aria-label', 'Aumentar quantidade');

  btnMinus.addEventListener('click', () => {
    let q = Math.max(1, (parseInt(qtdInput.value, 10) || 1) - 1);
    qtdInput.value = q;
    updateItemInfo();
    recalcTotal();
  });

  btnPlus.addEventListener('click', () => {
    let q = (parseInt(qtdInput.value, 10) || 1) + 1;
    qtdInput.value = q;
    updateItemInfo();
    recalcTotal();
  });

  stepperWrap.append(btnMinus, qtdInput, btnPlus);

  const priceBox = document.createElement('div');
  priceBox.className = 'item-price-box';

  const priceEl = document.createElement('span');
  priceEl.className = 'item-price';
  priceEl.setAttribute('aria-label', 'Preço unitário');

  const subtotalEl = document.createElement('strong');
  subtotalEl.className = 'item-subtotal-val';
  subtotalEl.setAttribute('aria-label', 'Subtotal do item');

  priceBox.append(priceEl, subtotalEl);

  const cortesiaLabel = document.createElement('label');
  cortesiaLabel.className = 'item-cortesia-label';
  cortesiaLabel.title = 'Item cortesia (gratuito)';
  const cortesiaCheckbox = document.createElement('input');
  cortesiaCheckbox.type = 'checkbox';
  cortesiaCheckbox.className = 'item-cortesia';
  cortesiaCheckbox.checked = item.cortesia || false;
  if (item.cortesia) row.classList.add('item-cortesia-checked');
  cortesiaCheckbox.addEventListener('change', () => {
    row.classList.toggle('item-cortesia-checked', cortesiaCheckbox.checked);
    updateItemInfo();
    recalcTotal();
  });
  const cortesiaText = document.createElement('span');
  cortesiaText.textContent = 'Cortesia';
  cortesiaLabel.append(cortesiaCheckbox, cortesiaText);

  bottomRow.append(stepperWrap, priceBox, cortesiaLabel);

  /**
   * Mostra o preço unitário do produto selecionado, subtotal e o saldo disponível
   */
  function updateItemInfo() {
    const chosen = product.getProducts().find((p) => p.id === saborSelect.value);
    const qtd = Math.max(1, parseInt(qtdInput.value, 10) || 1);
    const unitVal = chosen ? Number(chosen.valor) || 0 : 0;
    const isCortesia = cortesiaCheckbox.checked;

    priceEl.textContent = chosen ? `${formatCurrency(unitVal)} un` : '';
    subtotalEl.textContent = chosen ? (isCortesia ? 'Grátis (Cortesia)' : formatCurrency(unitVal * qtd)) : 'R$ 0,00';

    if (chosen) {
      const disp = estoque.disponivel(chosen);
      const produzido = estoque.totalProduzido(chosen.id);
      const reservado = estoque.totalReservado(chosen.id);
      stockEl.hidden = false;
      if (produzido <= 0) {
        stockEl.textContent = estoque.isSobEncomenda(chosen) ? 'Sob Encomenda' : 'Sem produção';
      } else if (reservado > 0) {
        stockEl.textContent = `Disp: ${disp} (${reservado} res)`;
      } else {
        stockEl.textContent = `Estoque: ${disp}`;
      }
      stockEl.className = `item-stock stock-${estoque.stockStatus(disp)}`;
      if (qtd > disp && !estoque.isSobEncomenda(chosen)) {
        stockEl.classList.add('stock-warning');
      } else {
        stockEl.classList.remove('stock-warning');
      }
    } else {
      stockEl.hidden = true;
    }
  }

  // Ao editar: reconhece o produto que originou o item
  const resolvedId = resolveItemProductId(item);
  if (resolvedId && [...saborSelect.options].some((o) => o.value === resolvedId)) {
    saborSelect.value = resolvedId;
  }

  // Exibe o preço e subtotal após restaurar a seleção
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

  row.append(topRow, bottomRow);
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
      const cortesiaCheckbox = row.querySelector('.item-cortesia');
      const produtoId = saborSelect ? saborSelect.value : '';
      const chosen = produtoId ? byId.get(produtoId) : null;
      if (!chosen) return null;
      const isCake = chosen.tipoProduto === 'Bolo Inteiro' || chosen.tipoProduto === 'Bolo Naked';
      return {
        produtoId: chosen.id,
        tipoProduto: chosen.tipoProduto,
        tamanho: isCake ? (chosen.tamanho || '') : '',
        sabor: chosen.titulo,
        quantidade: qtdInput ? qtdInput.value : 1,
        valorUnitario: chosen.valor,
        cortesia: !!cortesiaCheckbox.checked,
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

/** Atualiza o datalist de clientes para sugestão no campo de cliente. */
export function updateCustomersDatalist() {
  const datalist = document.getElementById('customersDatalist');
  if (!datalist) return;
  datalist.innerHTML = '';
  const customers = storage.getAllCustomers();
  customers.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.nome;
    if (c.contato) {
      opt.label = c.contato;
    }
    datalist.appendChild(opt);
  });
}

/**
 * Atualiza o banner/dica de fidelidade no modal de pedido.
 * @param {string} clienteNome - Nome digitado do cliente.
 */
function updateLoyaltyHint(clienteNome) {
  const hintEl = document.getElementById('orderLoyaltyHint');
  if (!hintEl) return;

  const nomeTrim = String(clienteNome || '').trim();
  if (!nomeTrim) {
    hintEl.hidden = true;
    hintEl.innerHTML = '';
    return;
  }

  const allOrders = storage.getAll();
  const hist = customerService.obterHistoricoCliente(nomeTrim, allOrders);
  const fid = hist.fidelidade || customerService.calcularFidelidade(hist.totalPedidos);

  if (fid.temRecompensaDisponivel) {
    hintEl.hidden = false;
    hintEl.innerHTML = `<span><strong>Fidelidade Concluída:</strong> Este cliente acumulou ${fid.totalPedidos} pedidos e tem um brinde especial liberado para resgate!</span>`;
  } else if (fid.faltaApenasUm) {
    hintEl.hidden = false;
    hintEl.innerHTML = `<span><strong>Quase lá:</strong> Este será o 10º pedido do cliente! Ao concluir, ele completará o Cartão Fidelidade.</span>`;
  } else if (fid.selosPreenchidos > 0) {
    hintEl.hidden = false;
    hintEl.innerHTML = `<span><strong>Cartão Fidelidade:</strong> ${fid.selosPreenchidos}/10 pedidos acumulados.</span>`;
  } else {
    hintEl.hidden = true;
    hintEl.innerHTML = '';
  }
}

/**
 * Abre o modal para criar um novo pedido.
 * @param {Object} [prefill] - Dados pré-preenchidos (ex: cliente, contato).
 */
export function openNew(prefill = {}) {
  pendingDraft = null;
  form.reset();
  clearErrors();
  updateCatalogStatus();
  updateCustomersDatalist();

  const orders = order.getOrders();
  const nextNumber = order.nextOrderNumber(orders);

  document.getElementById('field-id').value = '';
  document.getElementById('field-numero').value = nextNumber;
  document.getElementById('field-data').value = new Date().toISOString().slice(0, 10);
  document.getElementById('field-status').value = 'Pendente';
  document.getElementById('field-pagamento').value = 'PIX';
  document.getElementById('field-entrega').value = 'Retirada';

  if (prefill.cliente) {
    document.getElementById('field-cliente').value = prefill.cliente;
  }
  if (prefill.contato) {
    document.getElementById('field-contato').value = prefill.contato;
  }

  updateLoyaltyHint(prefill.cliente || '');

  // Atualiza badge de número do pedido e sincroniza pílulas
  const numBadge = document.getElementById('field-numero-badge');
  if (numBadge) {
    numBadge.textContent = nextNumber ? `#${nextNumber}` : '';
  }
  syncAllPills();

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
  updateCustomersDatalist();

  document.getElementById('field-id').value = orderToEdit.id;
  document.getElementById('field-numero').value = orderToEdit.numero;
  document.getElementById('field-data').value = orderToEdit.data || '';
  document.getElementById('field-cliente').value = orderToEdit.cliente || '';
  document.getElementById('field-contato').value = orderToEdit.contato || '';
  document.getElementById('field-status').value = orderToEdit.status || 'Pendente';
  document.getElementById('field-pagamento').value = order.normalizePaymentMethod(orderToEdit.pagamento);
  document.getElementById('field-entrega').value = order.normalizeDeliveryMethod(orderToEdit.entrega);
  document.getElementById('field-observacoes').value = orderToEdit.observacoes || '';

  updateLoyaltyHint(orderToEdit.cliente || '');

  // Atualiza badge de número do pedido e sincroniza pílulas
  const numBadge = document.getElementById('field-numero-badge');
  if (numBadge) {
    numBadge.textContent = orderToEdit.numero ? `#${orderToEdit.numero}` : '';
  }
  syncAllPills();

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

  const numBadge = document.getElementById('field-numero-badge');
  if (numBadge) {
    numBadge.textContent = d.numero ? `#${d.numero}` : '';
  }
  syncAllPills();

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

  // Sincroniza cliente com a base de clientes se for novo ou se tiver contato
  if (data.cliente) {
    const nomeTrim = data.cliente.trim();
    const existingCustomer = storage.getAllCustomers().find(
      (c) => c.nome.trim().toLowerCase() === nomeTrim.toLowerCase()
    );
    if (!existingCustomer) {
      storage.saveCustomer({
        id: `cli_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        nome: nomeTrim,
        contato: (data.contato || '').trim(),
        dataNascimento: '',
        endereco: '',
        observacoes: '',
      });
    } else if (data.contato && !existingCustomer.contato) {
      storage.saveCustomer({
        ...existingCustomer,
        contato: data.contato.trim(),
      });
    }
  }

  storage.save(orders);
  closeModal();
  onChange();
  return true;
}

/* ---------- Eventos ---------- */

// Autopreenchimento do contato e dica de fidelidade ao selecionar/digitar cliente cadastrado
const clienteInput = document.getElementById('field-cliente');
if (clienteInput) {
  clienteInput.addEventListener('input', () => {
    const rawVal = clienteInput.value;
    const val = rawVal.trim().toLowerCase();
    updateLoyaltyHint(rawVal);
    if (!val) return;
    const match = storage.getAllCustomers().find((c) => c.nome.trim().toLowerCase() === val);
    if (match) {
      const contatoInput = document.getElementById('field-contato');
      if (contatoInput && match.contato && !contatoInput.value) {
        contatoInput.value = match.contato;
      }
    }
  });
}

// Botão "Adicionar item"
addItemBtn.addEventListener('click', () => addItemRow({ tipoProduto: defaultItemType(product.getProducts(), order.PRODUCT_TYPES) }));

// Forma de pagamento: CORTESIA zera o valor total do pedido
document.getElementById('field-pagamento').addEventListener('change', () => {
  recalcTotal();
});

/* ---------- Segmented Pills e Venda Rápida Balcão ---------- */

/**
 * Sincroniza o grupo visual de pílulas com o valor selecionado.
 */
function syncPillGroup(container, value) {
  if (!container) return;
  container.querySelectorAll('.segmented-pill').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.val === value);
  });
}

/**
 * Sincroniza todos os grupos de pílulas com os selects subjacentes.
 */
function syncAllPills() {
  const pagSelect = document.getElementById('field-pagamento');
  const entSelect = document.getElementById('field-entrega');
  const staSelect = document.getElementById('field-status');

  if (pagSelect) syncPillGroup(document.getElementById('pills-pagamento'), pagSelect.value);
  if (entSelect) syncPillGroup(document.getElementById('pills-entrega'), entSelect.value);
  if (staSelect) syncPillGroup(document.getElementById('pills-status'), staSelect.value);
}

/**
 * Configura um grupo de pílulas sincronizado com um <select>.
 */
function setupSegmentedPills(containerId, selectId, onSelectCallback = null) {
  const container = document.getElementById(containerId);
  const select = document.getElementById(selectId);
  if (!container || !select) return;

  container.addEventListener('click', (e) => {
    const pill = e.target.closest('.segmented-pill');
    if (!pill) return;
    const val = pill.dataset.val;
    if (val) {
      select.value = val;
      select.dispatchEvent(new Event('change'));
      syncPillGroup(container, val);
      if (typeof onSelectCallback === 'function') onSelectCallback(val);
    }
  });

  select.addEventListener('change', () => {
    syncPillGroup(container, select.value);
  });
}

setupSegmentedPills('pills-pagamento', 'field-pagamento', () => recalcTotal());
setupSegmentedPills('pills-entrega', 'field-entrega');
setupSegmentedPills('pills-status', 'field-status');

// Botão rápido "Balcão" no campo de cliente
const btnFillBalcao = document.getElementById('btnFillBalcao');
if (btnFillBalcao) {
  btnFillBalcao.addEventListener('click', () => {
    const clienteEl = document.getElementById('field-cliente');
    if (clienteEl) {
      clienteEl.value = 'Balcão';
      clienteEl.dispatchEvent(new Event('input'));
    }
  });
}

// Botão "Venda Rápida Balcão" no topo do modal
const btnQuickBalcao = document.getElementById('btnQuickBalcao');
if (btnQuickBalcao) {
  btnQuickBalcao.addEventListener('click', () => {
    const clienteEl = document.getElementById('field-cliente');
    const entregaEl = document.getElementById('field-entrega');
    const statusEl = document.getElementById('field-status');

    if (clienteEl) clienteEl.value = 'Balcão';
    if (entregaEl) {
      entregaEl.value = 'Retirada';
      entregaEl.dispatchEvent(new Event('change'));
    }
    if (statusEl) {
      statusEl.value = 'Concluído';
      statusEl.dispatchEvent(new Event('change'));
    }

    syncAllPills();
    updateLoyaltyHint('Balcão');
    showToast('Modo Balcão: Cliente Balcão, Retirada e Concluído.', 'info');

    // Foca no seletor de produto do primeiro item se existir
    const firstSabor = itemsContainer.querySelector('.item-sabor');
    if (firstSabor) firstSabor.focus();
  });
}

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

