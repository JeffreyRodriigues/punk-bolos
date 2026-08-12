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
import * as base from './base.js?v=1';
import { showToast } from './toast.js?v=12';
import { formatCurrency, formatPrecise } from '../utils/money.js?v=12';
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
    .map((i) => ({ kind: 'insumo', data: i }));

  const bases = base
    .getBases()
    .filter((b) => !normalizado || (b.nome || '').toLowerCase().includes(normalizado))
    .map((b) => ({ kind: 'base', data: b }));

  const itens = [...insumos, ...bases].sort((a, b) =>
    sortKey(a.data.nome || '').localeCompare(sortKey(b.data.nome || ''))
  );

  if (countEl) countEl.textContent = itens.length;

  if (emptyEl) {
    const msg = emptyEl.querySelector('p');
    if (msg) {
      msg.innerHTML = normalizado
        ? `Nenhum item encontrado para "<strong>${termo}</strong>".`
        : 'Nenhum insumo ou base cadastrado ainda.<br>Cadastre o primeiro clicando em <strong>＋ Novo insumo</strong> ou <strong>＋ Nova base</strong>.';
    }
    emptyEl.hidden = itens.length !== 0;
  }

  listEl.className = 'inv-list';
  listEl.innerHTML = '';

  if (itens.length === 0) return;

  const table = document.createElement('table');
  table.className = 'inv-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th scope="col">Categoria</th>
      <th scope="col">Data da compra</th>
      <th scope="col">Ingrediente</th>
      <th scope="col">Unidade</th>
      <th scope="col">Descrição</th>
      <th scope="col" class="inv-num">Preço</th>
      <th scope="col" class="inv-num">Quantidade</th>
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
 * Monta as duas linhas de custo exibidas no card de inventário:
 * - principal: preço "de balcão" em L (para ml) ou kg (para g), 2 casas;
 * - sub: preço por 1 ml / 1 g, 4 casas (menor, abaixo do principal).
 * Para unidade, só há a linha principal.
 * @param {Object} insumo - Insumo.
 * @returns {{ principal: string, sub: ?string }}
 */
function custoDisplay(insumo) {
  const sub = inventory.subunidade(insumo); // 'g' | 'ml' | 'un'
  const custoSub = inventory.custoPorSubunidade(insumo);
  if (sub === 'ml') {
    return { principal: `${formatCurrency(custoSub * 1000)} / L`, sub: `${formatPrecise(custoSub)} / ml` };
  }
  if (sub === 'g') {
    return { principal: `${formatCurrency(custoSub * 1000)} / kg`, sub: `${formatPrecise(custoSub)} / g` };
  }
  return { principal: `${formatCurrency(custoSub)} / unidade`, sub: null };
}

/**
 * Formata a quantidade de uma compra para exibição em kg/L com o
 * detalhe em gramas/ml (o dado é salvo em g/ml).
 * @param {Object} insumo - Insumo (define a unidade).
 * @param {Object} compra - Compra com quantidadeCompra.
 * @returns {{ main: string, sub: (?string) }}
 */
function formatQuantidade(insumo, compra) {
  const qtd = Number(compra && compra.quantidadeCompra) || 0;
  if (insumo.unidade === 'g') return { main: `${qtd} g`, sub: null };
  if (insumo.unidade === 'ml') return { main: `${qtd} ml`, sub: null };
  return { main: `${qtd} un`, sub: null };
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

  const tdCat = document.createElement('td');
  const catBadge = document.createElement('span');
  catBadge.className = 'product-type inv-cat-ingrediente';
  catBadge.textContent = 'Ingrediente';
  tdCat.appendChild(catBadge);

  const tdData = document.createElement('td');
  tdData.textContent = ultima ? formatDate(ultima.data) : '—';

  const tdNome = document.createElement('td');
  tdNome.className = 'inv-nome';
  tdNome.textContent = insumo.nome || 'Sem nome';

  const tdUnidade = document.createElement('td');
  const unBadge = document.createElement('span');
  unBadge.className = 'product-type';
  unBadge.textContent = insumo.unidade || 'unidade';
  tdUnidade.appendChild(unBadge);

  const tdDesc = document.createElement('td');
  tdDesc.className = 'inv-desc';
  tdDesc.textContent = insumo.descricao || '';

  const tdPreco = document.createElement('td');
  tdPreco.className = 'inv-num';
  if (nCompras > 0 && ultima) {
    const custoSub = inventory.custoPorSubunidade(insumo);
    const sub = inventory.subunidade(insumo);
    const principal = formatCurrency(Number(ultima.custoTotal) || 0);
    let detalhe = null;
    if (sub === 'g') {
      detalhe = `${formatCurrency(custoSub * 1000)} / kg`;
    } else if (sub === 'ml') {
      detalhe = `${formatCurrency(custoSub * 1000)} / L`;
    } else {
      detalhe = `${formatCurrency(custoSub)} / unidade`;
    }
    const main = document.createElement('div');
    main.className = 'inv-cell-main';
    main.textContent = principal;
    tdPreco.appendChild(main);
    if (detalhe) {
      const subEl = document.createElement('div');
      subEl.className = 'inv-cell-sub';
      subEl.textContent = detalhe;
      tdPreco.appendChild(subEl);
    }
  } else {
    tdPreco.textContent = 'sem compras';
  }

  const tdQtd = document.createElement('td');
  tdQtd.className = 'inv-num';
  if (nCompras > 0 && ultima) {
    const q = formatQuantidade(insumo, ultima);
    const main = document.createElement('div');
    main.className = 'inv-cell-main';
    main.textContent = q.main;
    tdQtd.appendChild(main);
    if (q.sub) {
      const sub = document.createElement('div');
      sub.className = 'inv-cell-sub';
      sub.textContent = q.sub;
      tdQtd.appendChild(sub);
    }
  } else {
    tdQtd.textContent = '—';
  }

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

  tr.append(tdCat, tdData, tdNome, tdUnidade, tdDesc, tdPreco, tdQtd, tdAcoes);
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
    const un = ins ? ins.unidade : '';
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

  const tdData = document.createElement('td');
  tdData.textContent = '—';

  const tdNome = document.createElement('td');
  tdNome.className = 'inv-nome';
  tdNome.textContent = b.nome || 'Sem nome';

  const tdUnidade = document.createElement('td');
  const unBadge = document.createElement('span');
  unBadge.className = 'product-type';
  unBadge.textContent = b.rendimentoUnidade || 'un';
  tdUnidade.appendChild(unBadge);

  const tdDesc = document.createElement('td');
  tdDesc.className = 'inv-desc';
  tdDesc.textContent = b.descricao || '';

  const tdPreco = document.createElement('td');
  tdPreco.className = 'inv-num';
  const main = document.createElement('div');
  main.className = 'inv-cell-main';
  main.textContent = formatCurrency(custoTotal);
  tdPreco.appendChild(main);

  const tdQtd = document.createElement('td');
  tdQtd.className = 'inv-num';
  const qtdMain = document.createElement('div');
  qtdMain.className = 'inv-cell-main';
  qtdMain.textContent = `${b.rendimento} ${b.rendimentoUnidade || 'un'}`;
  tdQtd.appendChild(qtdMain);

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

  tr.append(tdCat, tdData, tdNome, tdUnidade, tdDesc, tdPreco, tdQtd, tdAcoes);

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

  if (nomeEl) nomeEl.value = insumo ? (insumo.nome || '') : '';
  if (unidadeEl) unidadeEl.value = insumo ? (insumo.unidade || 'unidade') : 'g';
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

  if (nomeEl) nomeEl.value = b ? (b.nome || '') : '';
  if (rendEl) rendEl.value = b ? (b.rendimento || '') : '';
  if (rendUnEl) rendUnEl.value = b ? (b.rendimentoUnidade || 'unidade') : 'unidade';
  if (descEl) descEl.value = b ? (b.descricao || '') : '';

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
  unitEl.textContent = ins ? ins.unidade : '';
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
      opt.textContent = `${i.nome} (${i.unidade})`;
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
        const und = compra.unidade || (ins && ins.unidade) || 'unidade';
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

  const componentes = componentesDraft
    .filter((c) => c.insumoId)
    .map((c) => ({ insumoId: c.insumoId, quantidade: Number(c.quantidade) || 0 }));

  const data = {
    nome: nomeEl ? String(nomeEl.value).trim() : '',
    descricao: descEl ? String(descEl.value).trim() : '',
    rendimento: rendEl ? Number(rendEl.value) : NaN,
    rendimentoUnidade: rendUnEl ? rendUnEl.value : 'un',
    componentes,
  };

  const b = editingBase ? { ...data, id: editingBase.id } : base.createBase(data);

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
