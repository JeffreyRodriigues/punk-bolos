/* ============================================================
   INVENTORYVIEW.JS — Tela de Inventário (insumos + compras)
   ------------------------------------------------------------
   - Lista de insumos (nome, unidade, custo unitário vigente, nº de compras)
   - Modal para cadastrar/editar insumo (nome, unidade, descrição)
   - Histórico de compras dentro do modal (data + preço total + quantidade);
     o sistema calcula o custo unitário (preço total ÷ quantidade)
   - Validação e persistência via storage (offline + nuvem)
   As regras de cálculo ficam em inventory.js (módulo de negócio).
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as inventory from './inventory.js?v=2';
import { showToast } from './toast.js?v=12';
import { formatCurrency } from '../utils/money.js?v=12';
import { formatDate } from '../utils/money.js?v=12';
import { sortKey } from '../utils/describe.js?v=1';

/** Callback disparado após criar/editar/excluir insumo (setado por app.js). */
let onChange = () => {};

/**
 * Registra o callback de notificação de mudanças.
 * @param {Function} cb - Função chamada após alterar insumos.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/** Insumo em edição (null = novo insumo). */
let editing = null;

/** Rascunho das compras do insumo aberto no modal. */
let comprasDraft = [];

/**
 * Gera um id único para um insumo.
 * @returns {string} Id no formato "i<timestamp>-<aleatório>".
 */
function generateId() {
  return `i${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Exibe (ou oculta) o aviso do formulário do modal.
 * @param {string} message - Mensagem (vazia oculta).
 * @param {boolean} [ok] - true usa estilo de sucesso.
 */
function showAviso(message, ok = false) {
  const aviso = document.getElementById('insumoFormAviso');
  if (!aviso) return;
  aviso.textContent = message;
  aviso.hidden = !message;
  aviso.classList.toggle('estoque-aviso-ok', ok);
}

/* ============================================================
   LISTA DE INSUMOS
   ============================================================ */

/**
 * Renderiza a lista de insumos na tela de Inventário.
 */
export function render() {
  const listEl = document.getElementById('insumoList');
  const countEl = document.getElementById('inventarioCount');
  const emptyEl = document.getElementById('insumoEmpty');
  if (!listEl) return;

  const termo = (document.getElementById('insumoSearch') || {}).value || '';
  const normalizado = termo.trim().toLowerCase();

  const insumos = storage
    .getAllInsumos()
    .filter((i) => !normalizado || (i.nome || '').toLowerCase().includes(normalizado))
    .sort((a, b) => sortKey(a.nome || '').localeCompare(sortKey(b.nome || '')));

  if (countEl) countEl.textContent = insumos.length;

  listEl.innerHTML = '';

  const vazio = insumos.length === 0;
  if (emptyEl) {
    const msg = emptyEl.querySelector('p');
    if (msg) {
      msg.innerHTML = normalizado
        ? `Nenhum insumo encontrado para "<strong>${termo}</strong>".`
        : 'Nenhum insumo cadastrado ainda.<br>Cadastre o primeiro clicando em <strong>＋ Novo insumo</strong>.';
    }
    emptyEl.hidden = !vazio;
  }
  if (vazio) return;

  insumos.forEach((insumo) => {
    listEl.appendChild(renderCard(insumo));
  });
}

/**
 * Monta o card de um insumo.
 * @param {Object} insumo - Insumo do catálogo.
 * @returns {HTMLElement} Card do insumo.
 */
function renderCard(insumo) {
  const custo = inventory.custoUnitarioVigente(insumo, inventory.ultimaCompra(insumo));
  const nCompras = Array.isArray(insumo.compras) ? insumo.compras.length : 0;
  const ultima = inventory.ultimaCompra(insumo);

  const card = document.createElement('div');
  card.className = 'product-card';

  const info = document.createElement('div');
  info.className = 'product-info';

  const type = document.createElement('span');
  type.className = 'product-type';
  type.textContent = insumo.unidade || 'unidade';

  const name = document.createElement('div');
  name.className = 'product-name';
  name.textContent = insumo.nome || 'Sem nome';

  info.append(type, name);

  if (insumo.descricao) {
    const desc = document.createElement('div');
    desc.className = 'product-desc';
    desc.textContent = insumo.descricao;
    info.appendChild(desc);
  }

  const custoEl = document.createElement('div');
  custoEl.className = 'product-price';
  custoEl.textContent = nCompras > 0
    ? `${formatCurrency(custo)} / ${insumo.unidade || 'un'}`
    : 'sem compras';
  info.appendChild(custoEl);

  const meta = document.createElement('div');
  meta.className = 'product-desc';
  meta.textContent = nCompras === 0
    ? 'Nenhuma compra registrada'
    : `${nCompras} compra(s)${ultima ? ` · última ${formatDate(ultima.data)}` : ''}`;
  info.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'product-actions';

  const btnEdit = document.createElement('button');
  btnEdit.type = 'button';
  btnEdit.className = 'icon-btn';
  btnEdit.textContent = '✏️';
  btnEdit.title = `Editar ${insumo.nome || 'insumo'}`;
  btnEdit.setAttribute('aria-label', 'Editar insumo');
  btnEdit.addEventListener('click', () => openEdit(insumo));

  const btnDel = document.createElement('button');
  btnDel.type = 'button';
  btnDel.className = 'icon-btn danger';
  btnDel.textContent = '🗑️';
  btnDel.title = `Excluir ${insumo.nome || 'insumo'}`;
  btnDel.setAttribute('aria-label', 'Excluir insumo');
  btnDel.addEventListener('click', () => removeInsumo(insumo));

  actions.append(btnEdit, btnDel);

  const footer = document.createElement('div');
  footer.className = 'product-footer';
  footer.append(info, actions);

  card.appendChild(footer);
  return card;
}

/* ============================================================
   MODAL — cadastro/edição de insumo + compras
   ============================================================ */

/**
 * Abre o modal para um novo insumo.
 */
export function openNew() {
  openModal(null);
}

/**
 * Abre o modal para editar um insumo existente.
 * @param {Object} insumo - Insumo a editar.
 */
export function openEdit(insumo) {
  openModal(insumo);
}

/**
 * Preenche e exibe o modal de insumo.
 * @param {Object|null} insumo - Insumo a editar (null = novo).
 */
function openModal(insumo) {
  const modal = document.getElementById('insumoModal');
  if (!modal) return;

  editing = insumo || null;
  comprasDraft = insumo && Array.isArray(insumo.compras)
    ? insumo.compras.map((c) => ({ ...c }))
    : [];

  const titleEl = document.getElementById('insumoModalTitle');
  if (titleEl) titleEl.textContent = insumo ? `Editar ${insumo.nome || 'insumo'}` : 'Novo insumo';

  const nomeEl = document.getElementById('insumoFieldNome');
  const unidadeEl = document.getElementById('insumoFieldUnidade');
  const descEl = document.getElementById('insumoFieldDescricao');

  if (nomeEl) nomeEl.value = insumo ? (insumo.nome || '') : '';
  if (unidadeEl) unidadeEl.value = insumo ? (insumo.unidade || 'unidade') : 'kg';
  if (descEl) descEl.value = insumo ? (insumo.descricao || '') : '';

  const dataEl = document.getElementById('insumoCompraData');
  if (dataEl && !dataEl.value) dataEl.value = new Date().toISOString().slice(0, 10);
  const custoEl = document.getElementById('insumoCompraCusto');
  if (custoEl) custoEl.value = '';
  const qtdEl = document.getElementById('insumoCompraQtd');
  if (qtdEl) qtdEl.value = '';

  showAviso('');
  renderCompras();

  modal.classList.add('open');
  document.body.classList.add('modal-open');
  if (nomeEl) nomeEl.focus();
}

/**
 * Fecha o modal de insumo.
 */
function closeModal() {
  const modal = document.getElementById('insumoModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  editing = null;
  comprasDraft = [];
}

/**
 * Renderiza a lista de compras dentro do modal e o custo unitário vigente.
 */
function renderCompras() {
  const wrap = document.getElementById('insumoCompras');
  if (!wrap) return;

  wrap.innerHTML = '';

  if (comprasDraft.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'estoque-history-empty';
    empty.textContent = 'Nenhuma compra registrada ainda.';
    wrap.appendChild(empty);
  } else {
    const ul = document.createElement('ul');
    ul.className = 'estoque-history';
    comprasDraft
      .slice()
      .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
      .forEach((compra) => {
        const custoUnit = inventory.custoUnitario(compra);
        const li = document.createElement('li');
        li.className = 'estoque-history-item';

        const info = document.createElement('div');
        info.className = 'estoque-history-info';

        const title = document.createElement('strong');
        title.textContent = `${formatCurrency(Number(compra.custoTotal) || 0)} por ${Number(compra.quantidadeCompra) || 0} ${editing ? editing.unidade : 'un'} → ${formatCurrency(custoUnit)}/${editing ? editing.unidade : 'un'}`;

        const meta = document.createElement('span');
        meta.className = 'estoque-history-meta';
        meta.textContent = formatDate(compra.data);

        info.append(title, meta);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn danger';
        del.textContent = '🗑️';
        del.title = 'Remover compra';
        del.setAttribute('aria-label', 'Remover compra');
        del.addEventListener('click', () => removeCompra(compra.id));

        li.append(info, del);
        ul.appendChild(li);
      });
    wrap.appendChild(ul);
  }

  const custoVigente = document.getElementById('insumoCustoVigente');
  if (custoVigente) {
    const ultima = inventory.ultimaCompra({ compras: comprasDraft });
    custoVigente.textContent = ultima
      ? `Custo unitário vigente: ${formatCurrency(inventory.custoUnitario(ultima))} / ${editing ? editing.unidade : 'un'}`
      : 'Custo unitário vigente: —';
  }
}

/**
 * Adiciona uma compra ao rascunho do modal (validando os campos).
 * @returns {boolean} true se adicionou.
 */
function addCompra() {
  const dataEl = document.getElementById('insumoCompraData');
  const custoEl = document.getElementById('insumoCompraCusto');
  const qtdEl = document.getElementById('insumoCompraQtd');

  const data = dataEl ? dataEl.value : '';
  const custoTotal = custoEl ? Number(custoEl.value) : NaN;
  const quantidadeCompra = qtdEl ? Number(qtdEl.value) : NaN;

  const compra = { id: generateId(), data, custoTotal, quantidadeCompra };
  const validacao = inventory.validateCompra(compra);
  if (!validacao.valid) {
    const msg = Object.values(validacao.errors)[0] || 'Verifique os dados da compra.';
    showAviso(msg);
    return false;
  }

  comprasDraft.push(compra);
  if (custoEl) custoEl.value = '';
  if (qtdEl) qtdEl.value = '';
  if (dataEl && !dataEl.value) dataEl.value = new Date().toISOString().slice(0, 10);
  showAviso('');
  renderCompras();
  return true;
}

/**
 * Captura uma compra digitada nos campos do modal mas ainda não
 * adicionada à lista, para não perdê-la ao salvar o insumo.
 * Só inclui se data + preço + quantidade estiverem preenchidos e válidos.
 */
function flushCompraPendente() {
  const dataEl = document.getElementById('insumoCompraData');
  const custoEl = document.getElementById('insumoCompraCusto');
  const qtdEl = document.getElementById('insumoCompraQtd');
  const data = dataEl ? dataEl.value : '';
  const custo = custoEl ? Number(custoEl.value) : NaN;
  const qtd = qtdEl ? Number(qtdEl.value) : NaN;
  if (!data || !(custo > 0) || !(qtd > 0)) return;
  const compra = { id: generateId(), data, custoTotal: custo, quantidadeCompra: qtd };
  if (inventory.validateCompra(compra).valid) {
    comprasDraft.push(compra);
  }
}

/**
 * Remove uma compra do rascunho pelo id.
 * @param {string} id - Id da compra.
 */
function removeCompra(id) {
  comprasDraft = comprasDraft.filter((c) => c.id !== id);
  renderCompras();
}

/**
 * Salva o insumo (cria ou atualiza) após validar.
 * @returns {boolean} true se salvou.
 */
function saveInsumo() {
  const nomeEl = document.getElementById('insumoFieldNome');
  const unidadeEl = document.getElementById('insumoFieldUnidade');
  const descEl = document.getElementById('insumoFieldDescricao');

  // Captura uma compra digitada mas ainda não adicionada à lista
  flushCompraPendente();

  const nome = nomeEl ? String(nomeEl.value).trim() : '';
  const unidade = unidadeEl ? unidadeEl.value : 'unidade';
  const descricao = descEl ? String(descEl.value).trim() : '';

  const base = { nome, unidade, descricao, compras: comprasDraft };
  const insumo = editing ? { ...base, id: editing.id } : inventory.createInsumo(base);

  const validacao = inventory.validateInsumo(insumo);
  if (!validacao.valid) {
    const msg = Object.values(validacao.errors)[0] || 'Verifique os dados do insumo.';
    showAviso(msg);
    return false;
  }

  const duplicado = inventory.findDuplicate(insumo, storage.getAllInsumos());
  if (duplicado && duplicado.id !== insumo.id) {
    showAviso(`Já existe um insumo com o nome "${insumo.nome}".`);
    return false;
  }

  const lista = storage.getAllInsumos().slice();
  const idx = lista.findIndex((i) => i.id === insumo.id);
  if (idx >= 0) lista[idx] = insumo;
  else lista.push(insumo);

  storage.saveInsumos(lista);

  showToast(editing ? 'Insumo atualizado!' : 'Insumo cadastrado!');
  closeModal();
  onChange();
  return true;
}

/**
 * Exclui um insumo com confirmação.
 * @param {Object} insumo - Insumo a excluir.
 */
function removeInsumo(insumo) {
  const confirmado = window.confirm(`Excluir o insumo "${insumo.nome || ''}"?`);
  if (!confirmado) return;

  const lista = storage.getAllInsumos().filter((i) => i.id !== insumo.id);
  storage.saveInsumos(lista);
  showToast('Insumo excluído.');
  onChange();
}

/* ============================================================
   EVENTOS
   ============================================================ */

const addBtn = document.getElementById('btnAddInsumo');
if (addBtn) addBtn.addEventListener('click', () => openNew());

const searchEl = document.getElementById('insumoSearch');
if (searchEl) searchEl.addEventListener('input', () => render());

const saveBtn = document.getElementById('btnSaveInsumo');
if (saveBtn) saveBtn.addEventListener('click', () => saveInsumo());

const cancelBtn = document.getElementById('btnCancelInsumo');
if (cancelBtn) cancelBtn.addEventListener('click', () => closeModal());

const addCompraBtn = document.getElementById('btnAddCompra');
if (addCompraBtn) addCompraBtn.addEventListener('click', () => addCompra());

const insumoForm = document.getElementById('insumoForm');
if (insumoForm) insumoForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveInsumo();
});

const insumoModal = document.getElementById('insumoModal');
if (insumoModal) {
  insumoModal.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => closeModal());
  });
}
