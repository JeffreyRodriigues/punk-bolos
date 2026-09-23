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

import * as storage from './storage.js';
import * as inventory from './inventory.js';
import * as base from './base.js';
import { openExcelImportModal } from './excelModal.js';
import { showToast } from './toast.js';
import { formatCurrency, formatPrecise } from '../utils/money.js';
import { formatDate } from '../utils/money.js';
import { sortKey } from '../utils/describe.js';

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

/** Filtro de categoria ativo ('todos' | 'ingredientes' | 'bases' | 'baixo'). */
let currentCategoryFilter = 'todos';

/**
 * Garante que todos os insumos e bases tenham códigos PINXXXX e PBAXXXX persistidos.
 */
function ensureCodigos() {
  let insumos = storage.getAllInsumos().slice();
  let changedInsumos = false;
  let nextInNum = 1;
  insumos.forEach((item) => {
    if (item && item.codigo) {
      const m = String(item.codigo).match(/^PIN(\d+)$/i);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val >= nextInNum) nextInNum = val + 1;
      }
    }
  });
  insumos.forEach((item) => {
    if (!item.codigo) {
      item.codigo = `PIN${String(nextInNum++).padStart(4, '0')}`;
      changedInsumos = true;
    }
  });
  if (changedInsumos) storage.saveInsumos(insumos);

  let bases = base.getBases().slice();
  let changedBases = false;
  let nextBaNum = 1;
  bases.forEach((item) => {
    if (item && item.codigo) {
      const m = String(item.codigo).match(/^PBA(\d+)$/i);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val >= nextBaNum) nextBaNum = val + 1;
      }
    }
  });
  bases.forEach((item) => {
    if (!item.codigo) {
      item.codigo = `PBA${String(nextBaNum++).padStart(4, '0')}`;
      changedBases = true;
    }
  });
  if (changedBases) storage.saveBases(bases);
}

/**
 * Verifica se um item está com estoque baixo ou zerado.
 * @param {Object} item - Insumo ou base.
 * @returns {boolean}
 */
function isEstoqueBaixo(item) {
  const atual = Number(item.estoqueAtual) || 0;
  const min = item.estoqueMinimo != null && item.estoqueMinimo !== '' ? Number(item.estoqueMinimo) : null;
  if (atual <= 0) return true;
  if (min != null && min > 0 && atual <= min) return true;
  return false;
}

/**
 * Renderiza o selo visual de status do estoque.
 * @param {Object} item - Insumo ou base.
 * @returns {HTMLElement} Badge.
 */
function renderStockBadge(item) {
  const atual = Number(item.estoqueAtual) || 0;
  const min = item.estoqueMinimo != null && item.estoqueMinimo !== '' ? Number(item.estoqueMinimo) : null;
  const badge = document.createElement('span');
  if (atual <= 0) {
    badge.className = 'badge badge-danger';
    badge.textContent = '🔴 Zerado';
  } else if (min != null && min > 0 && atual <= min) {
    badge.className = 'badge badge-warning';
    badge.textContent = '🟡 Baixo';
  } else {
    badge.className = 'badge badge-success';
    badge.textContent = '🟢 Normal';
  }
  return badge;
}

/* ============================================================
   LISTA DE INSUMOS
   ============================================================ */

/**
 * Renderiza a lista de insumos na tela de Inventário.
 */
export function render() {
  ensureCodigos();

  const listEl = document.getElementById('insumoList');
  const countEl = document.getElementById('inventarioCount');
  const emptyEl = document.getElementById('insumoEmpty');
  if (!listEl) return;

  const termo = (document.getElementById('insumoSearch') || {}).value || '';
  const normalizado = termo.trim().toLowerCase();

  const allInsumos = storage.getAllInsumos().map((i) => ({ kind: 'insumo', data: i }));
  const allBases = base.getBases().map((b) => ({ kind: 'base', data: b }));
  const allItens = [...allInsumos, ...allBases];

  // Atualiza os contadores das pílulas
  const totalCount = allItens.length;
  const ingCount = allInsumos.length;
  const baseCount = allBases.length;
  const baixoCount = allItens.filter((it) => isEstoqueBaixo(it.data)).length;

  const pillTodos = document.getElementById('invPillTodos');
  const pillIng = document.getElementById('invPillIngredientes');
  const pillBas = document.getElementById('invPillBases');
  const pillBai = document.getElementById('invPillBaixo');

  if (pillTodos) pillTodos.textContent = totalCount;
  if (pillIng) pillIng.textContent = ingCount;
  if (pillBas) pillBas.textContent = baseCount;
  if (pillBai) pillBai.textContent = baixoCount;

  // Filtragem por busca (nome, código ou descrição)
  const matchesSearch = (item) => {
    if (!normalizado) return true;
    const nome = (item.data.nome || '').toLowerCase();
    const codigo = (item.data.codigo || '').toLowerCase();
    const desc = (item.data.descricao || '').toLowerCase();
    return nome.includes(normalizado) || codigo.includes(normalizado) || desc.includes(normalizado);
  };

  // Filtragem por categoria
  const matchesCategory = (item) => {
    if (currentCategoryFilter === 'ingredientes') return item.kind === 'insumo';
    if (currentCategoryFilter === 'bases') return item.kind === 'base';
    if (currentCategoryFilter === 'baixo') return isEstoqueBaixo(item.data);
    return true;
  };

  const itens = allItens
    .filter((it) => matchesSearch(it) && matchesCategory(it))
    .sort((a, b) =>
      sortKey(a.data.codigo || a.data.nome || '').localeCompare(sortKey(b.data.codigo || b.data.nome || ''))
    );

  if (countEl) countEl.textContent = itens.length;

  if (emptyEl) {
    const msg = emptyEl.querySelector('p');
    if (msg) {
      if (normalizado) {
        msg.innerHTML = `Nenhum item encontrado para "<strong>${termo}</strong>".`;
      } else if (currentCategoryFilter === 'baixo') {
        msg.innerHTML = 'Nenhum item com estoque baixo no momento. Tudo abastecido! 🟢';
      } else {
        msg.innerHTML = 'Nenhum insumo ou base cadastrado ainda.<br>Cadastre o primeiro clicando em <strong>＋ Novo insumo</strong>.';
      }
    }
    emptyEl.hidden = itens.length !== 0;
  }

  listEl.className = 'inv-list';
  listEl.innerHTML = '';

  if (itens.length === 0) return;

  const table = document.createElement('table');
  table.className = 'inv-table data-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th scope="col" style="width: 95px;">Código</th>
      <th scope="col" style="width: 115px;">Categoria</th>
      <th scope="col">Nome do Insumo / Base</th>
      <th scope="col" class="inv-num">Custo Ref.</th>
      <th scope="col">Última Compra</th>
      <th scope="col" class="inv-num">Estoque Atual</th>
      <th scope="col" style="width: 105px;">Status</th>
      <th scope="col" class="inv-actions-col">Ações</th>
    </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  itens.forEach((item) => {
    tbody.appendChild(item.kind === 'base' ? renderBaseRow(item.data) : renderRow(item.data));
  });
  table.appendChild(tbody);

  listEl.appendChild(table);
}

/**
 * Formata um número eliminando decimais desnecessários (.00).
 * @param {number|string} n - Número.
 * @returns {string}
 */
function formatTrim(n) {
  const num = Number(n) || 0;
  return String(Math.round(num * 1000) / 1000);
}

/**
 * Monta uma linha da tabela de insumos (resumo da última compra).
 * @param {Object} insumo - Insumo do catálogo.
 * @returns {HTMLElement} Linha <tr>.
 */
function renderRow(insumo) {
  const nCompras = Array.isArray(insumo.compras) ? insumo.compras.length : 0;
  const ultima = inventory.ultimaCompra(insumo);

  const tr = document.createElement('tr');

  // Código
  const tdCod = document.createElement('td');
  const codBadge = document.createElement('span');
  codBadge.className = 'code-badge';
  codBadge.textContent = insumo.codigo || '—';
  tdCod.appendChild(codBadge);

  // Categoria
  const tdCat = document.createElement('td');
  const catBadge = document.createElement('span');
  catBadge.className = 'product-type inv-cat-ingrediente';
  catBadge.textContent = 'Ingrediente';
  tdCat.appendChild(catBadge);

  // Nome + Descrição
  const tdNome = document.createElement('td');
  tdNome.className = 'inv-nome';
  const nomeStrong = document.createElement('strong');
  nomeStrong.textContent = insumo.nome || 'Sem nome';
  tdNome.appendChild(nomeStrong);
  if (insumo.descricao) {
    const descSub = document.createElement('div');
    descSub.className = 'inv-cell-sub';
    descSub.textContent = insumo.descricao;
    tdNome.appendChild(descSub);
  }

  // Custo Ref
  const tdPreco = document.createElement('td');
  tdPreco.className = 'inv-num';
  if (nCompras > 0 && ultima) {
    const custoSub = inventory.custoPorSubunidade(insumo);
    const sub = inventory.subunidade(insumo);
    if (sub === 'g') {
      tdPreco.textContent = `${formatCurrency(custoSub * 1000)} / kg`;
    } else if (sub === 'ml') {
      tdPreco.textContent = `${formatCurrency(custoSub * 1000)} / L`;
    } else {
      tdPreco.textContent = `${formatCurrency(custoSub)} / un`;
    }
  } else {
    tdPreco.textContent = '—';
  }

  // Última Compra
  const tdData = document.createElement('td');
  if (nCompras > 0 && ultima) {
    const dataMain = document.createElement('div');
    dataMain.className = 'inv-cell-main';
    dataMain.textContent = formatDate(ultima.data);
    const dataSub = document.createElement('div');
    dataSub.className = 'inv-cell-sub';
    const und = insumo.unidade === 'unidade' ? 'un' : insumo.unidade;
    dataSub.textContent = `${formatCurrency(Number(ultima.custoTotal) || 0)} (${formatTrim(ultima.quantidadeCompra)} ${und})`;
    tdData.append(dataMain, dataSub);
  } else {
    tdData.textContent = 'Sem compras';
  }

  // Estoque Atual
  const tdEstoque = document.createElement('td');
  tdEstoque.className = 'inv-num';
  const und = insumo.unidade === 'unidade' ? 'un' : insumo.unidade;
  const estoqueMain = document.createElement('strong');
  estoqueMain.textContent = `${formatTrim(insumo.estoqueAtual || 0)} ${und}`;
  tdEstoque.appendChild(estoqueMain);
  if (insumo.estoqueMinimo != null && Number(insumo.estoqueMinimo) > 0) {
    const minSub = document.createElement('div');
    minSub.className = 'inv-cell-sub';
    minSub.textContent = `Mín: ${formatTrim(insumo.estoqueMinimo)} ${und}`;
    tdEstoque.appendChild(minSub);
  }

  // Status
  const tdStatus = document.createElement('td');
  tdStatus.appendChild(renderStockBadge(insumo));

  // Ações
  const tdAcoes = document.createElement('td');
  tdAcoes.className = 'inv-actions';
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

  tdAcoes.append(btnEdit, btnDel);

  tr.append(tdCod, tdCat, tdNome, tdPreco, tdData, tdEstoque, tdStatus, tdAcoes);
  return tr;
}

/**
 * Monta o detalhe expansível de uma base: lista de componentes
 * (insumo, quantidade na unidade dele e custo individual).
 * @param {Object} b - Base.
 * @param {Array<Object>} insumos - Lista de insumos.
 * @returns {HTMLElement} Container com a lista de componentes.
 */
function renderBaseComponents(b, insumos) {
  const byId = new Map(insumos.map((i) => [i.id, i]));
  const wrap = document.createElement('div');
  wrap.className = 'inv-base-components';

  const title = document.createElement('p');
  title.className = 'inv-base-components-title';
  title.textContent = `Componentes (${b.componentes.length}):`;
  wrap.appendChild(title);

  const ul = document.createElement('ul');
  b.componentes.forEach((c) => {
    const ins = byId.get(c.insumoId);
    const qtd = Number(c.quantidade) || 0;
    const custo = ins ? inventory.custoItem(ins, qtd) : 0;
    const un = ins ? (ins.unidade === 'unidade' ? 'un' : ins.unidade) : '';
    const li = document.createElement('li');
    li.textContent = `${ins ? ins.nome : 'Insumo removido'} — ${qtd} ${un} · ${formatCurrency(custo)}`;
    ul.appendChild(li);
  });
  wrap.appendChild(ul);
  return wrap;
}

/**
 * Monta uma linha da tabela para uma base (resumo do custo total e
 * por unidade de rendimento) com linha de detalhe expansível.
 * @param {Object} b - Base.
 * @returns {DocumentFragment} Fragmento com a linha e o detalhe.
 */
function renderBaseRow(b) {
  const insumos = storage.getAllInsumos();
  const custoTotal = base.custoBase(b, insumos);
  const custoUn = base.custoPorUnidadeBase(b, insumos);

  const tr = document.createElement('tr');
  tr.className = 'inv-base-row';

  // Código
  const tdCod = document.createElement('td');
  const codBadge = document.createElement('span');
  codBadge.className = 'code-badge';
  codBadge.textContent = b.codigo || '—';
  tdCod.appendChild(codBadge);

  // Categoria
  const tdCat = document.createElement('td');
  const catBadge = document.createElement('span');
  catBadge.className = 'product-type inv-cat-base';
  catBadge.textContent = 'Base';
  tdCat.appendChild(catBadge);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'inv-toggle';
  toggle.textContent = '▸';
  toggle.title = 'Ver componentes';
  toggle.setAttribute('aria-label', 'Ver componentes da base');
  tdCat.appendChild(toggle);

  // Nome
  const tdNome = document.createElement('td');
  tdNome.className = 'inv-nome';
  const nomeStrong = document.createElement('strong');
  nomeStrong.textContent = b.nome || 'Sem nome';
  tdNome.appendChild(nomeStrong);
  if (b.descricao) {
    const descSub = document.createElement('div');
    descSub.className = 'inv-cell-sub';
    descSub.textContent = b.descricao;
    tdNome.appendChild(descSub);
  }

  // Custo Ref
  const tdPreco = document.createElement('td');
  tdPreco.className = 'inv-num';
  const main = document.createElement('div');
  main.className = 'inv-cell-main';
  const rendUn = b.rendimentoUnidade === 'unidade' ? 'un' : (b.rendimentoUnidade || 'un');
  main.textContent = `${formatCurrency(custoUn)} / ${rendUn}`;
  tdPreco.appendChild(main);

  // Última Compra (Calculado)
  const tdData = document.createElement('td');
  const dataMain = document.createElement('div');
  dataMain.className = 'inv-cell-main';
  dataMain.textContent = 'Receita de Base';
  const dataSub = document.createElement('div');
  dataSub.className = 'inv-cell-sub';
  dataSub.textContent = `Total: ${formatCurrency(custoTotal)} (${b.componentes.length} itens)`;
  tdData.append(dataMain, dataSub);

  // Estoque Atual
  const tdEstoque = document.createElement('td');
  tdEstoque.className = 'inv-num';
  const estoqueMain = document.createElement('strong');
  estoqueMain.textContent = `${formatTrim(b.estoqueAtual || 0)} ${rendUn}`;
  tdEstoque.appendChild(estoqueMain);
  if (b.estoqueMinimo != null && Number(b.estoqueMinimo) > 0) {
    const minSub = document.createElement('div');
    minSub.className = 'inv-cell-sub';
    minSub.textContent = `Mín: ${formatTrim(b.estoqueMinimo)} ${rendUn}`;
    tdEstoque.appendChild(minSub);
  }

  // Status
  const tdStatus = document.createElement('td');
  tdStatus.appendChild(renderStockBadge(b));

  // Ações
  const tdAcoes = document.createElement('td');
  tdAcoes.className = 'inv-actions';
  const btnEdit = document.createElement('button');
  btnEdit.type = 'button';
  btnEdit.className = 'icon-btn';
  btnEdit.textContent = '✏️';
  btnEdit.title = `Editar ${b.nome || 'base'}`;
  btnEdit.setAttribute('aria-label', 'Editar base');
  btnEdit.addEventListener('click', () => openEditBase(b));
  const btnDel = document.createElement('button');
  btnDel.type = 'button';
  btnDel.className = 'icon-btn danger';
  btnDel.textContent = '🗑️';
  btnDel.title = `Excluir ${b.nome || 'base'}`;
  btnDel.setAttribute('aria-label', 'Excluir base');
  btnDel.addEventListener('click', () => removeBase(b));
  tdAcoes.append(btnEdit, btnDel);

  tr.append(tdCod, tdCat, tdNome, tdPreco, tdData, tdEstoque, tdStatus, tdAcoes);

  const detailTr = document.createElement('tr');
  detailTr.className = 'inv-base-detail';
  detailTr.hidden = true;
  const detailTd = document.createElement('td');
  detailTd.colSpan = 8;
  detailTd.appendChild(renderBaseComponents(b, insumos));
  detailTr.appendChild(detailTd);

  const frag = document.createDocumentFragment();
  frag.appendChild(tr);
  frag.appendChild(detailTr);

  toggle.addEventListener('click', () => {
    detailTr.hidden = !detailTr.hidden;
    toggle.textContent = detailTr.hidden ? '▸' : '▾';
  });

  return frag;
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
  const estAtualEl = document.getElementById('insumoFieldEstoqueAtual');
  const estMinEl = document.getElementById('insumoFieldEstoqueMinimo');

  if (nomeEl) nomeEl.value = insumo ? (insumo.nome || '') : '';
  if (unidadeEl) unidadeEl.value = insumo ? (insumo.unidade || 'unidade') : 'g';
  if (descEl) descEl.value = insumo ? (insumo.descricao || '') : '';
  if (estAtualEl) estAtualEl.value = insumo && insumo.estoqueAtual != null ? insumo.estoqueAtual : '';
  if (estMinEl) estMinEl.value = insumo && insumo.estoqueMinimo != null ? insumo.estoqueMinimo : '';

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
    custoVigente.replaceChildren();
    const ultima = inventory.ultimaCompra({ compras: comprasDraft });
    const sub = editing ? inventory.subunidade(editing) : 'un';
    if (!ultima) {
      const span = document.createElement('span');
      span.textContent = `Custo por 1 ${sub}: —`;
      custoVigente.appendChild(span);
    } else {
      const d = custoDisplay({ ...editing, compras: comprasDraft });
      const main = document.createElement('span');
      main.textContent = d.principal;
      custoVigente.appendChild(main);
      if (d.sub) {
        const subEl = document.createElement('span');
        subEl.className = 'insumo-custo-sub';
        subEl.textContent = d.sub;
        custoVigente.appendChild(subEl);
      }
    }
  }
}

/**
 * Monta as duas linhas de custo exibidas no card de inventário.
 * @param {Object} insumo - Insumo.
 * @returns {{ principal: string, sub: ?string }}
 */
function custoDisplay(insumo) {
  const sub = inventory.subunidade(insumo);
  const custoSub = inventory.custoPorSubunidade(insumo);
  if (sub === 'ml') {
    return { principal: `${formatCurrency(custoSub * 1000)} / L`, sub: `${formatPrecise(custoSub)} / ml` };
  }
  if (sub === 'g') {
    return { principal: `${formatCurrency(custoSub * 1000)} / kg`, sub: `${formatPrecise(custoSub)} / g` };
  }
  return { principal: `${formatCurrency(custoSub)} / un`, sub: null };
}

/**
 * Adiciona uma compra ao rascunho do modal (validando os campos).
 * @returns {boolean} true se adicionou.
 */
function addCompra() {
  const dataEl = document.getElementById('insumoCompraData');
  const custoEl = document.getElementById('insumoCompraCusto');
  const qtdEl = document.getElementById('insumoCompraQtd');
  const estAtualEl = document.getElementById('insumoFieldEstoqueAtual');

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

  // Soma a quantidade comprada no estoque atual no formulário se o campo estiver aberto
  if (estAtualEl && Number(quantidadeCompra) > 0) {
    const cur = Number(estAtualEl.value) || 0;
    estAtualEl.value = Math.round((cur + quantidadeCompra) * 1000) / 1000;
  }

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
  const estAtualEl = document.getElementById('insumoFieldEstoqueAtual');

  const data = dataEl ? dataEl.value : '';
  const custo = custoEl ? Number(custoEl.value) : NaN;
  const qtd = qtdEl ? Number(qtdEl.value) : NaN;
  if (!data || !(custo > 0) || !(qtd > 0)) return;
  const compra = { id: generateId(), data, custoTotal: custo, quantidadeCompra: qtd };
  if (inventory.validateCompra(compra).valid) {
    comprasDraft.push(compra);
    if (estAtualEl && Number(qtd) > 0) {
      const cur = Number(estAtualEl.value) || 0;
      estAtualEl.value = Math.round((cur + qtd) * 1000) / 1000;
    }
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
  const estAtualEl = document.getElementById('insumoFieldEstoqueAtual');
  const estMinEl = document.getElementById('insumoFieldEstoqueMinimo');

  // Captura uma compra digitada mas ainda não adicionada à lista
  flushCompraPendente();

  const nome = nomeEl ? String(nomeEl.value).trim() : '';
  const unidade = unidadeEl ? unidadeEl.value : 'unidade';
  const descricao = descEl ? String(descEl.value).trim() : '';
  const estoqueAtual = estAtualEl && estAtualEl.value !== '' ? Number(estAtualEl.value) : 0;
  const estoqueMinimo = estMinEl && estMinEl.value !== '' ? Number(estMinEl.value) : null;

  const baseData = {
    nome,
    unidade,
    descricao,
    codigo: editing ? editing.codigo : '',
    estoqueAtual,
    estoqueMinimo,
    compras: comprasDraft,
  };
  const insumo = editing ? { ...baseData, id: editing.id } : inventory.createInsumo(baseData, storage.getAllInsumos());

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
  render();
  onChange();
  return true;
}

/**
 * Exclui um insumo com confirmação.
 * @param {Object} insumo - Insumo a excluir.
 */
async function removeInsumo(insumo) {
  const confirmado = window.confirm(`Excluir o insumo "${insumo.nome || ''}"?`);
  if (!confirmado) return;

  try {
    await storage.deleteInsumo(insumo.id);
    showToast('Insumo excluído.');
    render();
    onChange();
  } catch (err) {
    showToast(`Erro ao excluir insumo: ${err && err.message ? err.message : 'Falha na conexão'}`, 'error');
  }
}

/* ============================================================
   MODAL — cadastro/edição de BASE (receita de insumos)
   ============================================================ */

/** Base em edição (null = nova base). */
let editingBase = null;

/** Rascunho dos componentes da base aberta no modal. */
let componentesDraft = [];

/**
 * Exibe (ou oculta) o aviso do formulário do modal de base.
 * @param {string} message - Mensagem (vazia oculta).
 */
function showAvisoBase(message) {
  const aviso = document.getElementById('baseFormAviso');
  if (!aviso) return;
  aviso.textContent = message;
  aviso.hidden = !message;
  aviso.classList.remove('estoque-aviso-ok');
}

/** Abre o seletor de categoria (Ingrediente / Base). */
function openCategoriaChooser() {
  const modal = document.getElementById('categoriaModal');
  if (!modal) {
    openNew();
    return;
  }
  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

/** Fecha o seletor de categoria. */
function closeCategoriaChooser() {
  const modal = document.getElementById('categoriaModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

/** Abre o modal para uma nova base. */
export function openNewBase() {
  openModalBase(null);
}

/** Abre o modal para editar uma base existente. */
export function openEditBase(b) {
  openModalBase(b);
}

/**
 * Preenche e exibe o modal de base.
 * @param {Object|null} b - Base a editar (null = nova).
 */
function openModalBase(b) {
  const modal = document.getElementById('baseModal');
  if (!modal) return;

  editingBase = b || null;
  componentesDraft = b && Array.isArray(b.componentes) ? b.componentes.map((c) => ({ ...c })) : [];

  const titleEl = document.getElementById('baseModalTitle');
  if (titleEl) titleEl.textContent = b ? `Editar ${b.nome || 'base'}` : 'Nova base';

  const nomeEl = document.getElementById('baseFieldNome');
  const rendEl = document.getElementById('baseFieldRendimento');
  const rendUnEl = document.getElementById('baseFieldRendUnidade');
  const descEl = document.getElementById('baseFieldDescricao');
  const estAtualEl = document.getElementById('baseFieldEstoqueAtual');
  const estMinEl = document.getElementById('baseFieldEstoqueMinimo');

  if (nomeEl) nomeEl.value = b ? (b.nome || '') : '';
  if (rendEl) rendEl.value = b ? (b.rendimento || '') : '';
  if (rendUnEl) rendUnEl.value = b ? (b.rendimentoUnidade || 'unidade') : 'unidade';
  if (descEl) descEl.value = b ? (b.descricao || '') : '';
  if (estAtualEl) estAtualEl.value = b && b.estoqueAtual != null ? b.estoqueAtual : '';
  if (estMinEl) estMinEl.value = b && b.estoqueMinimo != null ? b.estoqueMinimo : '';

  showAvisoBase('');
  renderComponentes();

  modal.classList.add('open');
  document.body.classList.add('modal-open');
  if (nomeEl) nomeEl.focus();
}

/** Fecha o modal de base. */
function closeModalBase() {
  const modal = document.getElementById('baseModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  editingBase = null;
  componentesDraft = [];
}

/** Atualiza o rótulo de unidade de um componente conforme o insumo. */
function updateComponenteUnit(row, unitEl) {
  const ins = storage.getAllInsumos().find((i) => i.id === row.insumoId);
  const u = ins ? ins.unidade : '';
  unitEl.textContent = u === 'unidade' ? 'un' : u;
}

/** Atualiza a pré-visualização do custo total da base no modal. */
function updateBaseCostPreview() {
  const el = document.getElementById('baseCustoPreview');
  if (!el) return;

  const b = {
    id: null,
    componentes: componentesDraft
      .filter((c) => c.insumoId)
      .map((c) => ({ insumoId: c.insumoId, quantidade: Number(c.quantidade) || 0 })),
  };
  const custoTotal = base.custoBase(b, storage.getAllInsumos());

  const rendEl = document.getElementById('baseFieldRendimento');
  const rendUnEl = document.getElementById('baseFieldRendUnidade');
  const rendimento = rendEl ? Number(rendEl.value) : NaN;

  let html = `<strong>Custo total:</strong> ${formatCurrency(custoTotal)}`;
  if (rendimento > 0) {
    const custoUn = custoTotal / rendimento;
    html += ` <span class="base-custo-por">· ${formatCurrency(custoUn)} / ${rendUnEl ? rendUnEl.value : 'unidade'}</span>`;
  }
  el.innerHTML = html;
}

/** Renderiza as linhas de componentes do modal de base. */
function renderComponentes() {
  const wrap = document.getElementById('baseComponentes');
  if (!wrap) return;
  wrap.innerHTML = '';

  const sorted = [...storage.getAllInsumos()].sort((a, b) =>
    sortKey(a.nome || '').localeCompare(sortKey(b.nome || ''))
  );

  if (componentesDraft.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'estoque-history-empty';
    aviso.textContent = 'Nenhum componente adicionado.';
    wrap.appendChild(aviso);
    return;
  }

  const head = document.createElement('div');
  head.className = 'base-componentes-head';
  head.innerHTML =
    '<span class="base-col-ing">Ingrediente</span>' +
    '<span class="base-col-uso">Gramas utilizadas</span>' +
    '<span class="base-col-preco">Custo e gramas da embalagem</span>' +
    '<span class="base-col-custo">Quanto custou</span>' +
    '<span class="base-col-act"></span>';
  wrap.appendChild(head);

  componentesDraft.forEach((row, index) => {
    const linha = document.createElement('div');
    linha.className = 'item-row base-componente-row';

    const sel = document.createElement('select');
    sel.className = 'base-componente-select item-tipo';
    sel.setAttribute('aria-label', 'Insumo');
    sel.setAttribute('data-label', 'Ingrediente');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Insumo —';
    sel.appendChild(placeholder);
    sorted.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.nome} (${i.unidade === 'unidade' ? 'un' : i.unidade})`;
      sel.appendChild(opt);
    });
    sel.value = row.insumoId || '';

    const qtd = document.createElement('input');
    qtd.type = 'number';
    qtd.className = 'base-componente-qtd item-qtd';
    qtd.min = '0';
    qtd.step = '0.001';
    qtd.placeholder = 'Qtd';
    qtd.value = row.quantidade != null ? row.quantidade : '';
    qtd.setAttribute('aria-label', 'Quantidade do componente');

    const unitEl = document.createElement('span');
    unitEl.className = 'base-componente-unit';

    const precoEl = document.createElement('span');
    precoEl.className = 'base-componente-preco';
    precoEl.title = 'Preço do pacote e gramas da embalagem (última compra)';
    precoEl.setAttribute('data-label', 'Custo e gramas da embalagem');

    const costEl = document.createElement('span');
    costEl.className = 'base-componente-cost';
    costEl.title = 'Custo proporcional deste componente';
    costEl.setAttribute('data-label', 'Quanto custou');

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-remove';
    del.textContent = '✕';
    del.title = 'Remover componente';
    del.setAttribute('aria-label', 'Remover componente');

    const uso = document.createElement('div');
    uso.className = 'base-componente-uso';
    uso.setAttribute('data-label', 'Gramas utilizadas');
    uso.append(qtd, unitEl);

    function trimNum(n) {
      const r = Math.round((Number(n) || 0) * 1000) / 1000;
      return String(r);
    }

    function atualizarLinha() {
      componentesDraft[index].insumoId = sel.value;
      componentesDraft[index].quantidade = qtd.value === '' ? '' : (Number(qtd.value) || 0);
      updateComponenteUnit(row, unitEl);
      const ins = storage.getAllInsumos().find((i) => i.id === sel.value);
      const compra = ins ? inventory.ultimaCompra(ins) : null;
      const custo = ins ? inventory.custoItem(ins, Number(qtd.value) || 0) : 0;
      costEl.textContent = ins ? formatCurrency(custo) : '—';
      if (compra && Number(compra.custoTotal) > 0) {
        const q = Number(compra.quantidadeCompra) || 0;
        const und = compra.unidade || (ins && ins.unidade) || 'un';
        precoEl.textContent = q > 0
          ? `${formatCurrency(Number(compra.custoTotal) || 0)} / ${trimNum(q)} ${und}`
          : `${formatCurrency(Number(compra.custoTotal) || 0)}`;
      } else {
        precoEl.textContent = '—';
      }
      updateBaseCostPreview();
    }

    sel.addEventListener('change', atualizarLinha);
    qtd.addEventListener('input', atualizarLinha);
    del.addEventListener('click', () => {
      componentesDraft.splice(index, 1);
      renderComponentes();
      updateBaseCostPreview();
    });

    linha.append(sel, uso, precoEl, costEl, del);
    wrap.appendChild(linha);

    atualizarLinha();
  });
}

/** Adiciona uma linha de componente em branco ao rascunho. */
function addComponente() {
  componentesDraft.push({ insumoId: '', quantidade: '' });
  renderComponentes();
}

/**
 * Salva a base (cria ou atualiza) após validar.
 * @returns {boolean} true se salvou.
 */
function saveBase() {
  const nomeEl = document.getElementById('baseFieldNome');
  const rendEl = document.getElementById('baseFieldRendimento');
  const rendUnEl = document.getElementById('baseFieldRendUnidade');
  const descEl = document.getElementById('baseFieldDescricao');
  const estAtualEl = document.getElementById('baseFieldEstoqueAtual');
  const estMinEl = document.getElementById('baseFieldEstoqueMinimo');

  const componentes = componentesDraft
    .filter((c) => c.insumoId)
    .map((c) => ({ insumoId: c.insumoId, quantidade: Number(c.quantidade) || 0 }));

  const estoqueAtual = estAtualEl && estAtualEl.value !== '' ? Number(estAtualEl.value) : 0;
  const estoqueMinimo = estMinEl && estMinEl.value !== '' ? Number(estMinEl.value) : null;

  const data = {
    nome: nomeEl ? String(nomeEl.value).trim() : '',
    descricao: descEl ? String(descEl.value).trim() : '',
    rendimento: rendEl ? Number(rendEl.value) : NaN,
    rendimentoUnidade: rendUnEl ? rendUnEl.value : 'un',
    codigo: editingBase ? editingBase.codigo : '',
    estoqueAtual,
    estoqueMinimo,
    componentes,
  };

  const b = editingBase ? { ...data, id: editingBase.id } : base.createBase(data, base.getBases());

  const validacao = base.validateBase(b);
  if (!validacao.valid) {
    showAvisoBase(Object.values(validacao.errors)[0] || 'Verifique os dados da base.');
    return false;
  }

  const duplicado = base.findDuplicate(b, base.getBases());
  if (duplicado && duplicado.id !== b.id) {
    showAvisoBase(`Já existe uma base com o nome "${b.nome}".`);
    return false;
  }

  const lista = base.getBases().slice();
  const idx = lista.findIndex((x) => x.id === b.id);
  if (idx >= 0) lista[idx] = b;
  else lista.push(b);

  storage.saveBases(lista);
  showToast(editingBase ? 'Base atualizada!' : 'Base cadastrada!');
  closeModalBase();
  render();
  onChange();
  return true;
}

/**
 * Exclui uma base com confirmação.
 * @param {Object} b - Base a excluir.
 */
function removeBase(b) {
  const confirmado = window.confirm(`Excluir a base "${b.nome || ''}"?`);
  if (!confirmado) return;

  const lista = base.getBases().filter((x) => x.id !== b.id);
  storage.saveBases(lista);
  showToast('Base excluída.');
  render();
  onChange();
}

/* ============================================================
   EVENTOS
   ============================================================ */

const addBtn = document.getElementById('btnAddInsumo');
if (addBtn) addBtn.addEventListener('click', () => openCategoriaChooser());

const escolherIngrediente = document.getElementById('btnEscolherIngrediente');
if (escolherIngrediente) escolherIngrediente.addEventListener('click', () => { closeCategoriaChooser(); openNew(); });

const escolherBase = document.getElementById('btnEscolherBase');
if (escolherBase) escolherBase.addEventListener('click', () => { closeCategoriaChooser(); openNewBase(); });

const categoriaModal = document.getElementById('categoriaModal');
if (categoriaModal) {
  categoriaModal.querySelectorAll('[data-close-categoria]').forEach((el) => {
    el.addEventListener('click', () => closeCategoriaChooser());
  });
}

document.querySelectorAll('.inventory-filter-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.inventory-filter-pill').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategoryFilter = btn.dataset.filter || 'todos';
    render();
  });
});

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

const addCompBtn = document.getElementById('btnAddComponente');
if (addCompBtn) addCompBtn.addEventListener('click', () => addComponente());

const pasteBaseExcelBtn = document.getElementById('btnPasteBaseExcel');
if (pasteBaseExcelBtn) {
  pasteBaseExcelBtn.addEventListener('click', () => {
    openExcelImportModal((importedRows) => {
      if (!Array.isArray(importedRows) || importedRows.length === 0) return;

      if (componentesDraft.length === 1 && !componentesDraft[0].insumoId && !componentesDraft[0].quantidade) {
        componentesDraft = [];
      }

      importedRows.forEach((r) => {
        componentesDraft.push({
          insumoId: r.refId,
          quantidade: r.quantidade,
        });
      });

      renderComponentes();
      updateBaseCostPreview();
    });
  });
}

const rendPreviewEl = document.getElementById('baseFieldRendimento');
if (rendPreviewEl) rendPreviewEl.addEventListener('input', () => updateBaseCostPreview());

const saveBaseBtn = document.getElementById('btnSaveBase');
if (saveBaseBtn) saveBaseBtn.addEventListener('click', () => saveBase());

const baseForm = document.getElementById('baseForm');
if (baseForm) baseForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveBase();
});

const baseModal = document.getElementById('baseModal');
if (baseModal) {
  baseModal.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => closeModalBase());
  });
}

