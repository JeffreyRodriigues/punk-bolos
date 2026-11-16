/* ============================================================
   PRICINGVIEW.JS — Tela de Precificação Profissional (SENAC / Sebrae)
   ------------------------------------------------------------
   - Seletor de produto do catálogo
   - Ficha técnica (insumos + bases com custo em tempo real)
   - Fatores profissionais: tempo de preparo (MOD), lucro líquido,
     rendimento, embalagem e custos adicionais
   - Modal de Parâmetros de Custo Globais (despesas fixas, folha CLT, taxas)
   - DRE Unitário ao vivo via Markup Divisor
   - Matriz Geral de Rentabilidade de todo o catálogo (recolhível)
   ============================================================ */

import * as storage from './storage.js';
import * as product from './product.js';
import * as pricing from './pricing.js';
import * as base from './base.js';
import * as inventory from './inventory.js';
import * as costSettings from './costSettings.js';
import { openExcelImportModal } from './excelModal.js';
import { showToast } from './toast.js';
import { formatCurrency } from '../utils/money.js';
import { sortKey } from '../utils/describe.js';

/** Callback disparado após salvar/alterar precificação (setado por app.js). */
let onChange = () => {};

/**
 * Registra o callback de notificação de mudanças.
 * @param {Function} cb
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/** Produto selecionado no momento. */
let currentProdutoId = '';

/** Tipo de produto selecionado no filtro ('' = todos). */
let currentTipoFilter = '';

/** Receita em edição (null = nova precificação para o produto). */
let editingReceita = null;

/** Flag se o formulário está em modo de edição ou somente leitura. */
let isEditing = false;

/** Snapshot do formulário para permitir cancelar alterações. */
let originalSnapshot = null;

/** Rascunho das linhas de bases da receita (sub-receitas). */
let baseRows = [];

/** Rascunho das linhas de ingredientes da receita (insumos de estoque). */
let ingredienteRows = [];

/** Estado de busca e filtros da Matriz de Rentabilidade */
let precSearchTerm = '';
let precFilterCategory = 'todos';

/**
 * Gera um id único para uma receita.
 * @returns {string}
 */
function generateId() {
  return `prc${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Exibe (ou oculta) o aviso do formulário.
 * @param {string} message
 * @param {boolean} [ok]
 */
function showAviso(message, ok = false) {
  const aviso = document.getElementById('precAviso');
  if (!aviso) return;
  aviso.textContent = message;
  aviso.hidden = !message;
  aviso.classList.toggle('estoque-aviso-ok', ok);
}

/**
 * Seleciona um produto na ficha técnica e rola até ela.
 * @param {string} id
 */
export function selectProduto(id) {
  currentProdutoId = id;
  const prod = product.getProducts().find((p) => p.id === id);
  if (prod) {
    const filtro = document.getElementById('precTipoFilter');
    if (filtro && filtro.value && filtro.value !== prod.tipoProduto) {
      filtro.value = '';
      populateProdutoSelect();
    }
  }
  const select = document.getElementById('precificacaoProduto');
  if (select) select.value = id;
  loadProduto(id);
  const formCard = document.getElementById('precificacaoForm');
  if (formCard) formCard.scrollIntoView({ behavior: 'smooth' });
}

/**
 * Retorna apenas os produtos aptos para precificação (exclui Adicional e Decoração).
 * @returns {Array<Object>}
 */
export function getPrecificavelProducts() {
  return product
    .getProducts()
    .filter((p) => p.tipoProduto !== 'Adicional' && p.tipoProduto !== 'Decoração');
}

/**
 * Renderiza a Matriz Geral de Rentabilidade / Resumo de Custos.
 */
export function renderOverviewTable() {
  const tbody = document.getElementById('precOverviewBody');
  if (!tbody) return;

  const allProducts = getPrecificavelProducts();
  const receitas = storage.getAllPrecificacoes();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();
  const costRates = costSettings.getCostSettings();

  let countPrecificados = 0;
  let countPendentes = 0;
  let countDesatualizados = 0;

  const dataList = allProducts.map((p) => {
    const rec = pricing.getReceita(receitas, p.id);
    let cmv = 0;
    let custoTotal = 0;
    let status = 'pendente';
    let precoSugerido = 0;
    let precoMinimo = 0;
    let lucroReal = 0;
    let margemReal = 0;

    if (rec) {
      const calc = pricing.calcular(rec, insumos, bases, costRates);
      cmv = calc.custoRealUnitario || 0;
      custoTotal = calc.custoUnitarioTotal || 0;
      precoSugerido = calc.precoSugerido || 0;
      precoMinimo = calc.precoMinimo || 0;
      
      const precoVenda = Number(p.valor) || 0;
      const deducoesValor = (precoVenda * (calc.taxasDeducoesPct / 100));
      lucroReal = precoVenda > 0 ? (precoVenda - custoTotal - deducoesValor) : 0;
      margemReal = precoVenda > 0 ? (lucroReal / precoVenda) * 100 : 0;

      const desatualizada = pricing.isDesatualizada(rec, insumos, bases);
      if (desatualizada) {
        status = 'desatualizado';
        countDesatualizados++;
      } else {
        status = 'precificado';
        countPrecificados++;
      }
    } else {
      countPendentes++;
    }

    const precoVenda = Number(p.valor) || 0;

    return {
      product: p,
      receita: rec,
      cmv,
      custoTotal,
      precoVenda,
      precoSugerido,
      precoMinimo,
      lucroReal,
      margemReal,
      status,
    };
  });

  // Atualiza contadores
  const pillTodos = document.getElementById('precPillTodos');
  const pillPrec = document.getElementById('precPillPrecificados');
  const pillPend = document.getElementById('precPillPendentes');
  const pillDesat = document.getElementById('precPillDesatualizados');

  if (pillTodos) pillTodos.textContent = allProducts.length;
  if (pillPrec) pillPrec.textContent = countPrecificados;
  if (pillPend) pillPend.textContent = countPendentes;
  if (pillDesat) pillDesat.textContent = countDesatualizados;

  // Filtragem
  let filtered = dataList;
  if (precFilterCategory === 'precificados') {
    filtered = filtered.filter((d) => d.status === 'precificado');
  } else if (precFilterCategory === 'pendentes') {
    filtered = filtered.filter((d) => d.status === 'pendente');
  } else if (precFilterCategory === 'desatualizados') {
    filtered = filtered.filter((d) => d.status === 'desatualizado');
  }

  if (precSearchTerm.trim()) {
    const term = sortKey(precSearchTerm.trim().toLowerCase());
    filtered = filtered.filter((d) => {
      const name = sortKey((d.product.titulo || '').toLowerCase());
      const tipo = sortKey((d.product.tipoProduto || '').toLowerCase());
      return name.includes(term) || tipo.includes(term);
    });
  }

  tbody.innerHTML = '';
  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="8" style="text-align: center; padding: 24px; color: var(--color-text-muted);">Nenhum produto encontrado nos critérios selecionados.</td>`;
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach((d) => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';

    const p = d.product;
    const tam = p.tipoProduto === 'Bolo Inteiro' && p.tamanho ? ` (${p.tamanho})` : '';

    let statusBadge = '';
    if (d.status === 'precificado') {
      statusBadge = '<span class="badge" style="background: var(--color-ok-soft); color: var(--color-ok);">Precificado</span>';
    } else if (d.status === 'desatualizado') {
      statusBadge = '<span class="badge" style="background: var(--color-warn-soft); color: var(--color-warn);">Desatualizado</span>';
    } else {
      statusBadge = '<span class="badge" style="background: var(--color-surface-alt); color: var(--color-text-muted); border: 1px solid var(--color-border);">Sem Ficha</span>';
    }

    const margemColor = d.margemReal >= 20 
      ? 'color: var(--color-ok);' 
      : d.margemReal > 0 
        ? 'color: var(--color-warn);' 
        : 'color: var(--color-danger);';

    tr.innerHTML = `
      <td class="estoque-name"><strong>${p.titulo || 'Produto'}</strong>${tam}</td>
      <td><span class="product-type">${p.tipoProduto || '—'}</span></td>
      <td>${d.cmv > 0 ? formatCurrency(d.cmv) : '<span class="text-muted">—</span>'}</td>
      <td><strong>${formatCurrency(d.precoVenda)}</strong></td>
      <td>${d.receita ? `<span style="${d.lucroReal >= 0 ? 'color: var(--color-ok); font-weight: 600;' : 'color: var(--color-danger); font-weight: 600;'}">${formatCurrency(d.lucroReal)}</span>` : '<span class="text-muted">—</span>'}</td>
      <td>${d.receita ? `<strong style="${margemColor}">${d.margemReal.toFixed(1)}%</strong>` : '<span class="text-muted">—</span>'}</td>
      <td>${statusBadge}</td>
      <td style="text-align: right;">
        <button type="button" class="btn btn-ghost btn-sm" style="padding: 4px 10px; font-size: 0.8rem; font-weight: 700;">
          ${d.receita ? 'Editar Ficha' : 'Precificar'}
        </button>
      </td>
    `;

    tr.addEventListener('click', () => selectProduto(p.id));
    tbody.appendChild(tr);
  });
}

/* ============================================================
   RENDER PRINCIPAL
   ============================================================ */

/**
 * Renderiza a tela de Precificação (seletor de produto + formulário + matriz geral).
 */
export function render() {
  populateTipoFilter();
  populateProdutoSelect();
  renderOverviewTable();
  const emptyEl = document.getElementById('precificacaoEmpty');
  const overviewEl = document.getElementById('precOverviewPanel');
  const formEl = document.getElementById('precificacaoForm');

  if (getPrecificavelProducts().length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    if (overviewEl) overviewEl.hidden = true;
    if (formEl) formEl.hidden = true;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  if (overviewEl) overviewEl.hidden = false;
  if (formEl) formEl.hidden = false;

  const select = document.getElementById('precificacaoProduto');
  loadProduto(select ? select.value : currentProdutoId);
}

/**
 * Preenche o filtro de tipo de produto.
 */
function populateTipoFilter() {
  const filtro = document.getElementById('precTipoFilter');
  if (!filtro) return;
  const tipos = [...new Set(getPrecificavelProducts().map((p) => p.tipoProduto).filter(Boolean))].sort();
  const anterior = filtro.value;
  filtro.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'Todos os tipos';
  filtro.appendChild(all);
  tipos.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    filtro.appendChild(opt);
  });
  if (tipos.includes(anterior)) filtro.value = anterior;
  currentTipoFilter = filtro.value;
}

/**
 * Preenche o seletor de produtos do catálogo.
 */
function populateProdutoSelect() {
  const select = document.getElementById('precificacaoProduto');
  if (!select) return;
  const filtro = document.getElementById('precTipoFilter');
  const tipo = filtro ? filtro.value : '';

  const produtos = [...getPrecificavelProducts()]
    .filter((p) => !tipo || p.tipoProduto === tipo)
    .sort((a, b) =>
      (sortKey(a.titulo || '') + sortKey(a.tamanho || '')).localeCompare(
        sortKey(b.titulo || '') + sortKey(b.tamanho || '')
      )
    );

  select.innerHTML = '';
  produtos.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    const tam = p.tipoProduto === 'Bolo Inteiro' && p.tamanho ? ` ${p.tamanho}` : '';
    opt.textContent = `${p.titulo || 'Produto'} (${p.tipoProduto || '—'}${tam})`;
    select.appendChild(opt);
  });

  if (produtos.length === 0) {
    currentProdutoId = '';
    select.value = '';
    return;
  }

  const mantem = produtos.some((p) => p.id === currentProdutoId);
  const escolhido = mantem ? currentProdutoId : produtos[0].id;
  select.value = escolhido;
  currentProdutoId = escolhido;
}

/**
 * Salva snapshot do formulário.
 */
function saveSnapshot() {
  originalSnapshot = {
    tempoPreparo: (document.getElementById('precTempoPreparo') || {}).value,
    lucroLiquido: (document.getElementById('precLucroLiquido') || {}).value,
    precoAlvo: (document.getElementById('precPrecoAlvo') || {}).value,
    rendimento: (document.getElementById('precRendimento') || {}).value,
    embalagem: (document.getElementById('precEmbalagem') || {}).value,
    custoAdicional: (document.getElementById('precCustoAdicional') || {}).value,
    custoAdicionalObs: (document.getElementById('precCustoAdicionalObs') || {}).value,
    baseRows: JSON.parse(JSON.stringify(baseRows)),
    ingredienteRows: JSON.parse(JSON.stringify(ingredienteRows)),
  };
}

/**
 * Restaura snapshot do formulário.
 */
function restoreSnapshot() {
  if (!originalSnapshot) return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };
  setVal('precTempoPreparo', originalSnapshot.tempoPreparo);
  setVal('precLucroLiquido', originalSnapshot.lucroLiquido);
  setVal('precPrecoAlvo', originalSnapshot.precoAlvo);
  setVal('precRendimento', originalSnapshot.rendimento);
  setVal('precEmbalagem', originalSnapshot.embalagem);
  setVal('precCustoAdicional', originalSnapshot.custoAdicional);
  setVal('precCustoAdicionalObs', originalSnapshot.custoAdicionalObs);
  baseRows = JSON.parse(JSON.stringify(originalSnapshot.baseRows || []));
  ingredienteRows = JSON.parse(JSON.stringify(originalSnapshot.ingredienteRows || []));
}

/**
 * Atualiza a interface gráfica conforme o modo de edição.
 */
function updateModeUI() {
  const formEl = document.getElementById('precificacaoForm');
  const btnEdit = document.getElementById('btnEditPrecificacao');
  const editingButtons = document.getElementById('precEditingButtons');
  const editActions = document.getElementById('precEditActions');
  const baseActions = document.getElementById('precBaseActions');
  const ingredienteActions = document.getElementById('precIngredienteActions');
  const badgeStatus = document.getElementById('precificacaoStatusBadge');

  if (formEl) {
    formEl.classList.toggle('prec-readonly', !isEditing);
  }

  const factorInputs = ['precTempoPreparo', 'precLucroLiquido', 'precPrecoAlvo', 'precRendimento', 'precEmbalagem', 'precCustoAdicional', 'precCustoAdicionalObs'];
  factorInputs.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !isEditing;
  });

  if (btnEdit) btnEdit.style.display = isEditing ? 'none' : 'block';
  if (editingButtons) editingButtons.style.display = isEditing ? 'flex' : 'none';
  if (editActions) editActions.style.display = isEditing ? 'flex' : 'none';
  if (baseActions) baseActions.style.display = isEditing ? 'flex' : 'none';
  if (ingredienteActions) ingredienteActions.style.display = isEditing ? 'flex' : 'none';

  if (badgeStatus) {
    if (!editingReceita) {
      badgeStatus.className = 'badge badge-secondary';
      badgeStatus.textContent = 'Não precificado';
    } else {
      const insumos = storage.getAllInsumos();
      const bases = base.getBases();
      const desatualizada = pricing.isDesatualizada(editingReceita, insumos, bases);
      if (desatualizada) {
        badgeStatus.className = 'badge badge-warning';
        badgeStatus.textContent = 'Custo alterado';
      } else {
        badgeStatus.className = 'badge badge-success';
        badgeStatus.textContent = 'Precificado';
      }
    }
  }
}

/**
 * Define o botão de categoria ativo e atualiza o input oculto.
 * @param {string} cat - 'premium' | 'basico' | 'comissionado' | 'subreceita' | 'personalizado'
 */
export function setActiveCategoriaPill(cat) {
  const container = document.getElementById('precCategoriaPills');
  if (!container) return;
  const buttons = container.querySelectorAll('.prec-cat-btn');
  buttons.forEach((b) => {
    b.classList.toggle('active', b.dataset.categoria === cat);
  });
  const catInput = document.getElementById('precCategoriaLinha');
  if (catInput) catInput.value = cat;
}

/**
 * Carrega o produto selecionado.
 * @param {string} produtoId
 */
function loadProduto(produtoId) {
  currentProdutoId = produtoId || '';
  const receita = pricing.getReceita(storage.getAllPrecificacoes(), currentProdutoId);
  editingReceita = receita || null;
  isEditing = !editingReceita;

  const tempoPreparo = document.getElementById('precTempoPreparo');
  const lucroLiquido = document.getElementById('precLucroLiquido');
  const precoAlvo = document.getElementById('precPrecoAlvo');
  const rend = document.getElementById('precRendimento');
  const emb = document.getElementById('precEmbalagem');
  const custoAdic = document.getElementById('precCustoAdicional');
  const obs = document.getElementById('precCustoAdicionalObs');

  const baseData = receita || {};
  const globalRates = costSettings.getCostSettings();

  if (tempoPreparo) tempoPreparo.value = baseData.tempoPreparoMinutos != null ? baseData.tempoPreparoMinutos : pricing.PRICING_DEFAULTS.tempoPreparoMinutos;
  if (lucroLiquido) lucroLiquido.value = baseData.lucroLiquidoDesejado != null ? baseData.lucroLiquidoDesejado : (globalRates.lucroLiquidoPadraoPct || 25);
  if (precoAlvo) precoAlvo.value = baseData.precoAlvo != null && baseData.precoAlvo !== '' ? baseData.precoAlvo : '';
  if (rend) rend.value = baseData.rendimento != null ? baseData.rendimento : pricing.PRICING_DEFAULTS.rendimento;
  if (emb) emb.value = baseData.embalagem != null ? baseData.embalagem : pricing.PRICING_DEFAULTS.embalagem;
  if (custoAdic) custoAdic.value = baseData.custoAdicional != null ? baseData.custoAdicional : pricing.PRICING_DEFAULTS.custoAdicional;
  if (obs) obs.value = baseData.custoAdicionalObs || '';

  const cat = baseData.categoriaLinha || 'personalizado';
  setActiveCategoriaPill(cat);

  const itens = (baseData.itens || []).filter((i) => !i || !i._meta);
  baseRows = itens
    .filter((i) => i.baseId)
    .map((i) => ({
      refId: i.baseId,
      tipo: 'base',
      quantidade: i.quantidade,
    }));
  ingredienteRows = itens
    .filter((i) => !i.baseId && i.insumoId)
    .map((i) => ({
      refId: i.insumoId,
      tipo: 'insumo',
      quantidade: i.quantidade,
    }));
  if (ingredienteRows.length === 0) {
    ingredienteRows.push({ refId: '', tipo: 'insumo', quantidade: '' });
  }

  saveSnapshot();
  showAviso('');
  updateModeUI();
  renderAllRows();
  updatePreview();
}

/* ============================================================
   LINHAS DE BASES E INGREDIENTES
   ============================================================ */

/**
 * Renderiza as linhas de bases (sub-receitas) do formulário.
 */
function renderBaseRows() {
  const wrap = document.getElementById('precBasesList');
  if (!wrap) return;

  wrap.innerHTML = '';
  const insumos = storage.getAllInsumos();
  const bases = [...base.getBases()].sort((a, b) =>
    sortKey(a.nome || '').localeCompare(sortKey(b.nome || ''))
  );
  const baseById = new Map(bases.map((b) => [b.id, b]));

  if (bases.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'estoque-history-empty';
    aviso.style.margin = '4px 0';
    aviso.textContent = 'Nenhuma base cadastrada. Cadastre na aba Inventário (Bases).';
    wrap.appendChild(aviso);
    updateInsumosSummary();
    return;
  }

  if (baseRows.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'estoque-history-empty';
    aviso.style.fontSize = '0.85rem';
    aviso.style.padding = '8px 0';
    aviso.style.margin = '0';
    aviso.textContent = isEditing
      ? 'Nenhuma base ou sub-receita vinculada. Clique em "＋ Adicionar Base" ou "Colar Bases do Excel" se esta receita utiliza massas ou recheios prontos.'
      : 'Nenhuma base utilizada nesta receita.';
    wrap.appendChild(aviso);
    updateInsumosSummary();
    return;
  }

  wrap.classList.add('base-componentes');

  const head = document.createElement('div');
  head.className = 'base-componentes-head';
  head.innerHTML =
    '<span class="base-col-ing">Base / Sub-Receita</span>' +
    '<span class="base-col-uso">Qtd utilizada</span>' +
    '<span class="base-col-preco">Custo do lote da base</span>' +
    '<span class="base-col-custo">Quanto custou</span>' +
    '<span class="base-col-act"></span>';
  wrap.appendChild(head);

  const trimNum = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000);

  baseRows.forEach((row, index) => {
    const linha = document.createElement('div');
    linha.className = 'item-row base-componente-row';

    const sel = document.createElement('select');
    sel.className = 'base-componente-select item-tipo';
    sel.setAttribute('aria-label', 'Base ou Sub-Receita');
    sel.setAttribute('data-label', 'Base');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Selecionar Base —';
    sel.appendChild(placeholder);

    bases.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      const bUnd = b.rendimentoUnidade === 'unidade' ? 'un' : (b.rendimentoUnidade || 'un');
      opt.textContent = `${b.nome} (${trimNum(b.rendimento)} ${bUnd})`;
      sel.appendChild(opt);
    });
    sel.value = row.refId || '';
    sel.disabled = !isEditing;

    const qtd = document.createElement('input');
    qtd.type = 'number';
    qtd.className = 'base-componente-qtd item-qtd';
    qtd.min = '0';
    qtd.step = '0.001';
    qtd.placeholder = 'Qtd';
    qtd.value = row.quantidade != null ? row.quantidade : '';
    qtd.setAttribute('aria-label', 'Quantidade utilizada');
    qtd.disabled = !isEditing;

    const unitEl = document.createElement('span');
    unitEl.className = 'base-componente-unit';

    const precoEl = document.createElement('span');
    precoEl.className = 'base-componente-preco';
    precoEl.title = 'Custo total de produção da base e seu rendimento';
    precoEl.setAttribute('data-label', 'Custo da base');

    const costEl = document.createElement('span');
    costEl.className = 'base-componente-cost';
    costEl.title = 'Custo proporcional desta base no produto';
    costEl.setAttribute('data-label', 'Quanto custou');

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-remove';
    del.textContent = '✕';
    del.title = 'Remover base';
    del.setAttribute('aria-label', 'Remover base');
    del.disabled = !isEditing;
    if (!isEditing) {
      del.style.visibility = 'hidden';
    }

    const uso = document.createElement('div');
    uso.className = 'base-componente-uso';
    uso.setAttribute('data-label', 'Quantidade utilizada');
    uso.append(qtd, unitEl);

    function atualizarLinha() {
      baseRows[index].refId = sel.value;
      baseRows[index].tipo = 'base';

      const b = baseById.get(sel.value);
      if (b) {
        const bUnd = b.rendimentoUnidade === 'unidade' ? 'un' : (b.rendimentoUnidade || 'un');
        unitEl.textContent = bUnd;
        const custoTotal = base.custoBase(b, insumos);
        const rend = Number(b.rendimento) || 0;
        if (custoTotal > 0 && rend > 0) {
          precoEl.textContent = `${formatCurrency(custoTotal)} / ${trimNum(rend)} ${bUnd}`;
          precoEl.style.color = '';
        } else if (custoTotal === 0) {
          precoEl.textContent = 'Base sem custo (R$ 0)';
          precoEl.style.color = 'var(--color-warn)';
        } else {
          precoEl.textContent = formatCurrency(custoTotal);
          precoEl.style.color = '';
        }
      } else {
        unitEl.textContent = '';
        precoEl.textContent = '—';
        precoEl.style.color = '';
      }

      const item = {
        baseId: sel.value,
        insumoId: '',
        quantidade: Number(qtd.value) || 0,
      };
      const custo = sel.value ? pricing.custoItem(item, insumos, bases) : 0;
      const isZeroComQtd = sel.value && Number(qtd.value) > 0 && custo === 0;
      if (isZeroComQtd) {
        costEl.textContent = 'R$ 0,00 (!)';
        costEl.style.color = 'var(--color-warn)';
        costEl.title = 'Base com quantidade informada mas custo zero no inventário';
      } else {
        costEl.textContent = sel.value ? formatCurrency(custo) : '—';
        costEl.style.color = '';
        costEl.title = 'Custo proporcional desta base';
      }
      updatePreview();
    }

    sel.addEventListener('change', atualizarLinha);
    qtd.addEventListener('input', () => {
      baseRows[index].quantidade = qtd.value;
      atualizarLinha();
    });
    del.addEventListener('click', () => {
      baseRows.splice(index, 1);
      renderBaseRows();
      updatePreview();
    });

    linha.append(sel, uso, precoEl, costEl, del);
    wrap.appendChild(linha);

    atualizarLinha();
  });

  updateInsumosSummary();
}

/**
 * Renderiza as linhas de ingredientes diretos do formulário.
 */
function renderIngredienteRows() {
  const wrap = document.getElementById('precInsumos');
  if (!wrap) return;

  wrap.innerHTML = '';
  const insumos = [...storage.getAllInsumos()].sort((a, b) =>
    sortKey(a.nome || '').localeCompare(sortKey(b.nome || ''))
  );
  const bases = base.getBases();

  if (insumos.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'estoque-history-empty';
    aviso.style.margin = '4px 0';
    aviso.textContent = 'Nenhum insumo cadastrado. Cadastre na aba Inventário.';
    wrap.appendChild(aviso);
    updateInsumosSummary();
    return;
  }

  if (ingredienteRows.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'estoque-history-empty';
    aviso.style.fontSize = '0.85rem';
    aviso.style.padding = '8px 0';
    aviso.style.margin = '0';
    aviso.textContent = isEditing
      ? 'Nenhum ingrediente direto cadastrado. Clique em "＋ Adicionar Ingrediente".'
      : 'Nenhum ingrediente direto nesta receita.';
    wrap.appendChild(aviso);
    updateInsumosSummary();
    return;
  }

  wrap.classList.add('base-componentes');

  const head = document.createElement('div');
  head.className = 'base-componentes-head';
  head.innerHTML =
    '<span class="base-col-ing">Ingrediente</span>' +
    '<span class="base-col-uso">Quantidade utilizada</span>' +
    '<span class="base-col-preco">Custo da embalagem</span>' +
    '<span class="base-col-custo">Quanto custou</span>' +
    '<span class="base-col-act"></span>';
  wrap.appendChild(head);

  const trimNum = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000);

  ingredienteRows.forEach((row, index) => {
    const linha = document.createElement('div');
    linha.className = 'item-row base-componente-row';

    const sel = document.createElement('select');
    sel.className = 'base-componente-select item-tipo';
    sel.setAttribute('aria-label', 'Ingrediente do estoque');
    sel.setAttribute('data-label', 'Ingrediente');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Selecionar Ingrediente —';
    sel.appendChild(placeholder);

    insumos.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.nome} (${i.unidade})`;
      sel.appendChild(opt);
    });
    sel.value = row.refId || '';
    sel.disabled = !isEditing;

    const qtd = document.createElement('input');
    qtd.type = 'number';
    qtd.className = 'base-componente-qtd item-qtd';
    qtd.min = '0';
    qtd.step = '0.001';
    qtd.placeholder = 'Qtd';
    qtd.value = row.quantidade != null ? row.quantidade : '';
    qtd.setAttribute('aria-label', 'Quantidade utilizada');
    qtd.disabled = !isEditing;

    const unitEl = document.createElement('span');
    unitEl.className = 'base-componente-unit';

    const precoEl = document.createElement('span');
    precoEl.className = 'base-componente-preco';
    precoEl.title = 'Preço do pacote e quantidade da embalagem (base de custo)';
    precoEl.setAttribute('data-label', 'Custo e gramas da embalagem');

    const costEl = document.createElement('span');
    costEl.className = 'base-componente-cost';
    costEl.title = 'Custo proporcional deste item';
    costEl.setAttribute('data-label', 'Quanto custou');

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-remove';
    del.textContent = '✕';
    del.title = 'Remover ingrediente';
    del.setAttribute('aria-label', 'Remover ingrediente');
    del.disabled = !isEditing;
    if (!isEditing) {
      del.style.visibility = 'hidden';
    }

    const uso = document.createElement('div');
    uso.className = 'base-componente-uso';
    uso.setAttribute('data-label', 'Quantidade utilizada');
    uso.append(qtd, unitEl);

    function atualizarLinha() {
      ingredienteRows[index].refId = sel.value;
      ingredienteRows[index].tipo = 'insumo';

      const ins = insumos.find((i) => i.id === sel.value);
      const insUnd = ins ? ins.unidade : '';
      unitEl.textContent = insUnd === 'unidade' ? 'un' : insUnd;
      const compra = ins ? inventory.ultimaCompra(ins) : null;
      if (compra && Number(compra.custoTotal) > 0) {
        const q = Number(compra.quantidadeCompra) || 0;
        const und = compra.unidade || (ins && ins.unidade) || 'un';
        precoEl.textContent = q > 0
          ? `${formatCurrency(Number(compra.custoTotal) || 0)} / ${trimNum(q)} ${und}`
          : formatCurrency(Number(compra.custoTotal) || 0);
        precoEl.style.color = '';
      } else if (sel.value) {
        precoEl.textContent = 'Sem compra (R$ 0)';
        precoEl.style.color = 'var(--color-warn)';
      } else {
        precoEl.textContent = '—';
        precoEl.style.color = '';
      }

      const item = {
        insumoId: sel.value,
        baseId: '',
        quantidade: Number(qtd.value) || 0,
      };
      const custo = sel.value ? pricing.custoItem(item, insumos, bases) : 0;
      const isZeroComQtd = sel.value && Number(qtd.value) > 0 && custo === 0;
      if (isZeroComQtd) {
        costEl.textContent = 'R$ 0,00 (!)';
        costEl.style.color = 'var(--color-warn)';
        costEl.title = 'Item com quantidade informada mas custo zero no inventário';
      } else {
        costEl.textContent = sel.value ? formatCurrency(custo) : '—';
        costEl.style.color = '';
        costEl.title = 'Custo proporcional deste item';
      }
      updatePreview();
    }

    sel.addEventListener('change', atualizarLinha);
    qtd.addEventListener('input', () => {
      ingredienteRows[index].quantidade = qtd.value;
      atualizarLinha();
    });
    del.addEventListener('click', () => {
      ingredienteRows.splice(index, 1);
      if (ingredienteRows.length === 0) ingredienteRows.push({ refId: '', tipo: 'insumo', quantidade: '' });
      renderIngredienteRows();
      updatePreview();
    });

    linha.append(sel, uso, precoEl, costEl, del);
    wrap.appendChild(linha);

    atualizarLinha();
  });

  updateInsumosSummary();
}

/**
 * Renderiza todos os blocos de ingredientes (Bases e Insumos).
 */
function renderAllRows() {
  renderBaseRows();
  renderIngredienteRows();
  updateInsumosSummary();
}

/**
 * Alias de compatibilidade para renderAllRows.
 */
function renderInsumoRows() {
  renderAllRows();
}

/**
 * Atualiza os subtotais de Bases, Ingredientes Diretos e o Resumo Consolidado de Matéria-Prima.
 */
function updateInsumosSummary() {
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();

  // 1. Bloco Bases
  const basesSummaryEl = document.getElementById('precBasesSummary');
  const basesCountEl = document.getElementById('precBasesCount');
  const basesCustoEl = document.getElementById('precBasesCusto');
  const validBases = baseRows.filter((r) => r.refId && Number(r.quantidade) > 0);
  let custoBases = 0;
  validBases.forEach((r) => {
    custoBases += pricing.custoItem({ baseId: r.refId, insumoId: '', quantidade: Number(r.quantidade) || 0 }, insumos, bases);
  });
  if (basesSummaryEl && basesCountEl && basesCustoEl) {
    if (validBases.length > 0) {
      basesSummaryEl.style.display = 'flex';
      basesCountEl.textContent = String(validBases.length);
      basesCustoEl.textContent = formatCurrency(custoBases);
    } else {
      basesSummaryEl.style.display = 'none';
    }
  }

  // 2. Bloco Ingredientes Diretos
  const ingSummaryEl = document.getElementById('precIngredientesSummary');
  const ingCountEl = document.getElementById('precIngredientesCount');
  const ingCustoEl = document.getElementById('precIngredientesCusto');
  const validIngs = ingredienteRows.filter((r) => r.refId && Number(r.quantidade) > 0);
  let custoIngs = 0;
  validIngs.forEach((r) => {
    custoIngs += pricing.custoItem({ insumoId: r.refId, baseId: '', quantidade: Number(r.quantidade) || 0 }, insumos, bases);
  });
  if (ingSummaryEl && ingCountEl && ingCustoEl) {
    if (validIngs.length > 0) {
      ingSummaryEl.style.display = 'flex';
      ingCountEl.textContent = String(validIngs.length);
      ingCustoEl.textContent = formatCurrency(custoIngs);
    } else {
      ingSummaryEl.style.display = 'none';
    }
  }

  // 3. Bloco Consolidado Matéria-Prima (Bases + Ingredientes)
  const summaryEl = document.getElementById('precInsumosSummary');
  const countEl = document.getElementById('precTotalItensCount');
  const loteCustoEl = document.getElementById('precInsumosLoteCusto');
  const unitCustoEl = document.getElementById('precInsumosUnitCusto');
  const totalItensCount = validBases.length + validIngs.length;
  const custoTotalLote = custoBases + custoIngs;

  if (summaryEl && countEl && loteCustoEl && unitCustoEl) {
    if (totalItensCount > 0) {
      summaryEl.style.display = 'flex';
      countEl.textContent = String(totalItensCount);
      loteCustoEl.textContent = formatCurrency(custoTotalLote);

      const receita = buildReceitaFromForm();
      const rendimento = Math.max(1, Number(receita.rendimento) || 1);
      const custoUnit = custoTotalLote / rendimento;
      unitCustoEl.textContent = formatCurrency(custoUnit);
    } else {
      summaryEl.style.display = 'none';
    }
  }
}

/**
 * Adiciona uma linha de base em branco ao formulário.
 */
function addBaseRow() {
  baseRows.push({ refId: '', tipo: 'base', quantidade: '' });
  renderBaseRows();
  updatePreview();
}

/**
 * Adiciona uma linha de ingrediente direto em branco ao formulário.
 */
function addInsumoRow() {
  ingredienteRows.push({ refId: '', tipo: 'insumo', quantidade: '' });
  renderIngredienteRows();
  updatePreview();
}

/* ============================================================
   PREVIEW AO VIVO — DRE UNITÁRIO (SENAC / Sebrae)
   ============================================================ */

/**
 * Atualiza o preview do DRE e preço sugerido a partir do formulário atual.
 */
function updatePreview() {
  const preview = document.getElementById('precPreview');
  const status = document.getElementById('precificacaoStatus');
  if (!preview) return;

  const receita = buildReceitaFromForm();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();
  const costRates = costSettings.getCostSettings();
  const c = pricing.calcular(receita, insumos, bases, costRates);

  preview.innerHTML = '';

  const embalagemUnit = Number(receita.embalagem || 0) + Number(receita.custoAdicional || 0);
  const deducoesValor = c.deducoesValor != null ? c.deducoesValor : (c.precoSugerido * (c.taxasDeducoesPct / 100));
  const rendimento = Math.max(1, Number(receita.rendimento) || 1);

  // 1. TOP CARDS DE DESTAQUE (KPIs VISUAIS)
  const kpiGrid = document.createElement('div');
  kpiGrid.className = 'prec-kpi-summary-grid';

  const markupTxt = c.multiplicadorMarkup ? `${c.multiplicadorMarkup.toFixed(2)}x` : '--';

  kpiGrid.innerHTML = `
    <div class="prec-kpi-card prec-kpi-card--primary">
      <span class="prec-kpi-label">Preço Sugerido</span>
      <strong class="prec-kpi-val">${formatCurrency(c.precoSugerido)} <small>/un</small></strong>
      <span class="prec-kpi-sub">Markup ${markupTxt}</span>
    </div>
    <div class="prec-kpi-card">
      <span class="prec-kpi-label">Custo Unitário Total</span>
      <strong class="prec-kpi-val">${formatCurrency(c.custoUnitarioTotal)} <small>/un</small></strong>
      <span class="prec-kpi-sub">Lote (${rendimento} un): ${formatCurrency(c.custoLoteTotal)}</span>
    </div>
    <div class="prec-kpi-card prec-kpi-card--lucro">
      <span class="prec-kpi-label">Lucro Líquido Real</span>
      <strong class="prec-kpi-val" style="color: ${c.lucroLiquidoValor >= 0 ? 'var(--color-ok)' : 'var(--color-danger)'};">
        ${formatCurrency(c.lucroLiquidoValor)} <small>/un</small>
      </strong>
      <span class="prec-kpi-sub">${c.margemLucroRealPct.toFixed(1)}% margem líquida</span>
    </div>
  `;
  preview.appendChild(kpiGrid);

  const precoAlvoEl = document.getElementById('precPrecoAlvo');
  if (precoAlvoEl && document.activeElement !== precoAlvoEl) {
    if (!precoAlvoEl.value) {
      precoAlvoEl.value = c.precoSugerido > 0 ? c.precoSugerido.toFixed(2) : '';
    }
  }

  // 2. BLOCO ESTRUTURADO: FORMAÇÃO DO CUSTO UNITÁRIO
  const secCustos = document.createElement('div');
  secCustos.className = 'prec-detail-section';
  secCustos.innerHTML = `
    <div class="prec-detail-section-title">Formação do Custo Unitário</div>
    <div class="prec-preview-row prec-preview-row-small">
      <span>Insumos da Receita (c/ 3% quebra)</span>
      <strong>${formatCurrency(c.custoIngredientesComQuebra / rendimento)} /un</strong>
    </div>
    <div class="prec-preview-row prec-preview-row-small">
      <span>Mão de Obra (${receita.tempoPreparoMinutos} min)</span>
      <strong>${formatCurrency(c.custoMaoDeObraLote / rendimento)} /un</strong>
    </div>
    <div class="prec-preview-row prec-preview-row-small">
      <span>Custos Fixos Rateados</span>
      <strong>${formatCurrency(c.custoFixoLote / rendimento)} /un</strong>
    </div>
    ${embalagemUnit > 0 ? `
    <div class="prec-preview-row prec-preview-row-small">
      <span>Embalagem & Adicionais</span>
      <strong>${formatCurrency(embalagemUnit)} /un</strong>
    </div>` : ''}
    <div class="prec-preview-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--color-border);">
      <span><strong>(=) Custo Unitário Total</strong></span>
      <strong>${formatCurrency(c.custoUnitarioTotal)} /un</strong>
    </div>
  `;
  preview.appendChild(secCustos);

  // 3. BLOCO ESTRUTURADO: MARGEM DE CONTRIBUIÇÃO (SEBRAE)
  let mcBadge = '';
  let mcColor = 'var(--color-text)';
  if (c.margemContribuicaoPct >= 50) {
    mcBadge = 'Excelente (> 50%)';
    mcColor = 'var(--color-ok)';
  } else if (c.margemContribuicaoPct >= 30) {
    mcBadge = 'Saudável (30% a 50%)';
    mcColor = 'var(--color-primary)';
  } else {
    mcBadge = 'Alerta (< 30%)';
    mcColor = 'var(--color-warn)';
  }

  const secSebrae = document.createElement('div');
  secSebrae.className = 'prec-detail-section';
  secSebrae.innerHTML = `
    <div class="prec-detail-section-title">
      <span>Margem de Contribuição (Sebrae)</span>
      <span class="badge" style="font-size: 0.72rem; color: ${mcColor};">${mcBadge}</span>
    </div>
    <div class="prec-preview-row prec-preview-row-small">
      <span>(-) Custos Variáveis (Insumos + Emb.)</span>
      <strong>- ${formatCurrency(c.custoRealUnitario)} /un</strong>
    </div>
    <div class="prec-preview-row prec-preview-row-small">
      <span>(-) Taxas & Deduções (${c.taxasDeducoesPct.toFixed(1)}%)</span>
      <strong>- ${formatCurrency(deducoesValor)} /un</strong>
    </div>
    <div class="prec-preview-row" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--color-border);">
      <span><strong>(=) Margem de Contribuição (MC)</strong></span>
      <strong style="color: ${mcColor};">${formatCurrency(c.margemContribuicaoValor)} /un (${c.margemContribuicaoPct.toFixed(1)}%)</strong>
    </div>
  `;
  preview.appendChild(secSebrae);

  // 4. BLOCO ESTRUTURADO: PONTO DE EQUILÍBRIO DO PRODUTO (PEF)
  if (c.pontoEquilibrioUnidadesMensal > 0) {
    const secPef = document.createElement('div');
    secPef.className = 'prec-detail-section';
    secPef.innerHTML = `
      <div class="prec-detail-section-title">Ponto de Equilíbrio do Produto</div>
      <div class="prec-preview-row">
        <span>Meta em Unidades</span>
        <strong style="color: var(--color-primary);">${c.pontoEquilibrioUnidadesMensal} un/mês <small style="color: var(--color-text-muted); font-weight: normal;">(${c.pontoEquilibrioUnidadesDiario} un/dia)</small></strong>
      </div>
      <div class="prec-preview-row prec-preview-row-small">
        <span>Meta em Faturamento</span>
        <strong>${formatCurrency(c.pontoEquilibrioFaturamentoMensal)} /mês</strong>
      </div>
    `;
    preview.appendChild(secPef);
  }

  // Atualiza também a faixa de subtotal na lista de insumos
  updateInsumosSummary();

  // Alerta caso haja ingrediente com quantidade informada mas custo zero no inventário
  const temInsumoZerado = (receita.itens || []).some((item) => {
    if (!item.quantidade || Number(item.quantidade) <= 0) return false;
    const custo = pricing.custoItem(item, insumos, bases);
    return custo === 0;
  });

  const avisoEl = document.getElementById('precAviso');
  if (temInsumoZerado) {
    showAviso('Atenção: Um ou mais ingredientes possuem quantidade informada mas custo R$ 0,00 no estoque (sem registro de compra no Inventário).');
  } else if (avisoEl && avisoEl.textContent.includes('custo R$ 0,00')) {
    showAviso('');
  }

  // Status: atualizada / desatualizada / sem precificação
  if (status) {
    const desatualizada = editingReceita && pricing.isDesatualizada(editingReceita, insumos, bases);
    if (!editingReceita) {
      status.textContent = 'Sem ficha técnica — monte os ingredientes e salve.';
      status.className = 'prec-status prec-status-warn';
    } else if (desatualizada) {
      status.textContent = 'Receita desatualizada (custo de insumo alterado). Salve para recalcular.';
      status.className = 'prec-status prec-status-warn';
    } else {
      status.textContent = 'Ficha técnica atualizada.';
      status.className = 'prec-status prec-status-ok';
    }
  }
}

/**
 * Constrói um objeto de receita a partir do formulário.
 * @returns {Object}
 */
function buildReceitaFromForm() {
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    const v = el ? Number(el.value) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };

  const precoAlvoEl = document.getElementById('precPrecoAlvo');
  const precoAlvoVal = precoAlvoEl && precoAlvoEl.value !== '' ? Number(precoAlvoEl.value) : null;
  const catInput = document.getElementById('precCategoriaLinha');
  const categoriaLinha = catInput ? catInput.value : 'personalizado';

  const baseItens = baseRows
    .filter((r) => r.refId)
    .map((r) => ({
      insumoId: '',
      baseId: r.refId,
      quantidade: Number(r.quantidade) || 0,
    }));

  const ingItens = ingredienteRows
    .filter((r) => r.refId)
    .map((r) => ({
      insumoId: r.refId,
      baseId: '',
      quantidade: Number(r.quantidade) || 0,
    }));

  return pricing.createReceita({
    id: editingReceita ? editingReceita.id : generateId(),
    produtoId: currentProdutoId,
    itens: [...baseItens, ...ingItens],
    tempoPreparoMinutos: num('precTempoPreparo', pricing.PRICING_DEFAULTS.tempoPreparoMinutos),
    categoriaLinha,
    lucroLiquidoDesejado: num('precLucroLiquido', pricing.PRICING_DEFAULTS.lucroLiquidoDesejado),
    precoAlvo: precoAlvoVal != null && Number.isFinite(precoAlvoVal) && precoAlvoVal > 0 ? precoAlvoVal : null,
    rendimento: num('precRendimento', pricing.PRICING_DEFAULTS.rendimento),
    embalagem: num('precEmbalagem', pricing.PRICING_DEFAULTS.embalagem),
    custoAdicional: num('precCustoAdicional', pricing.PRICING_DEFAULTS.custoAdicional),
    custoAdicionalObs: (document.getElementById('precCustoAdicionalObs') || {}).value || '',
    margem: num('precMargem', pricing.PRICING_DEFAULTS.margem),
    multiplicador: num('precMultiplicador', pricing.PRICING_DEFAULTS.multiplicador),
  });
}

/* ============================================================
   SALVAR FICHA TÉCNICA
   ============================================================ */

/**
 * Salva a precificação após validar.
 * @returns {boolean}
 */
function savePrecificacao() {
  const receita = buildReceitaFromForm();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();
  const costRates = costSettings.getCostSettings();

  const erro = pricing.validateReceita(receita, insumos, bases);
  if (erro) {
    showAviso(erro);
    return false;
  }

  const duplicado = pricing.findDuplicate(receita, storage.getAllPrecificacoes());
  if (duplicado && duplicado.id !== receita.id) {
    showAviso('Já existe uma ficha técnica para este produto.');
    return false;
  }

  const calculada = pricing.recalcular(receita, insumos, bases, costRates);
  const lista = storage.getAllPrecificacoes().slice();
  const idx = lista.findIndex((r) => r.id === calculada.id);
  if (idx >= 0) lista[idx] = calculada;
  else lista.push(calculada);

  storage.savePrecificacoes(lista);

  editingReceita = calculada;
  isEditing = false;
  saveSnapshot();
  updateModeUI();
  renderInsumoRows();
  renderOverviewTable();
  showToast('Ficha técnica salva com sucesso!');
  showAviso('', true);
  updatePreview();
  onChange();
  return true;
}



/* ============================================================
   MODAL DE PARÂMETROS DE CUSTO (SENAC / Sebrae)
   ============================================================ */

/**
 * Inicializa e vincula o modal de Parâmetros de Custos.
 */
function initCostSettingsModal() {
  const modal = document.getElementById('modalCostSettings');
  const btnOpen = document.getElementById('btnOpenCostSettings');
  const form = document.getElementById('costSettingsForm');
  if (!modal || !btnOpen || !form) return;

  const inputs = {
    aluguel: document.getElementById('costAluguel'),
    energia: document.getElementById('costEnergia'),
    gas: document.getElementById('costGas'),
    agua: document.getElementById('costAgua'),
    internet: document.getElementById('costInternet'),
    manutencao: document.getElementById('costManutencao'),
    contador: document.getElementById('costContador'),
    limpeza: document.getElementById('costLimpeza'),
    proLabore: document.getElementById('costProLabore'),
    salarioAjudantes: document.getElementById('costSalarioAjudantes'),
    tipoContrato: document.getElementById('costTipoContrato'),
    encargosPct: document.getElementById('costEncargosPct'),
    diasMes: document.getElementById('costDiasMes'),
    horasDia: document.getElementById('costHorasDia'),
    impostoPct: document.getElementById('costImpostoPct'),
    taxaCartaoPct: document.getElementById('costTaxaCartaoPct'),
    quebraPct: document.getElementById('costQuebraPct'),
    lucroPadraoPct: document.getElementById('costLucroPadraoPct'),
  };

  function updateEncargosFieldState() {
    const isFixo = inputs.tipoContrato?.value === 'fixo';
    if (inputs.encargosPct) {
      if (isFixo) {
        inputs.encargosPct.value = '0';
        inputs.encargosPct.readOnly = true;
        inputs.encargosPct.style.backgroundColor = 'var(--color-surface-alt)';
        inputs.encargosPct.style.cursor = 'not-allowed';
      } else {
        inputs.encargosPct.readOnly = false;
        inputs.encargosPct.style.backgroundColor = '';
        inputs.encargosPct.style.cursor = '';
        if (Number(inputs.encargosPct.value) === 0 || !inputs.encargosPct.value) {
          inputs.encargosPct.value = '34.24';
        }
      }
    }
  }

  function getFormValues() {
    const tipo = inputs.tipoContrato?.value || 'clt';
    const isFixo = tipo === 'fixo';
    let encargos = 0;
    if (!isFixo) {
      const rawEnc = inputs.encargosPct?.value;
      encargos = rawEnc !== '' && rawEnc !== null && !isNaN(Number(rawEnc)) ? Number(rawEnc) : 34.24;
    }

    return {
      aluguel: Number(inputs.aluguel?.value) || 0,
      energia: Number(inputs.energia?.value) || 0,
      gas: Number(inputs.gas?.value) || 0,
      agua: Number(inputs.agua?.value) || 0,
      internetSistemas: Number(inputs.internet?.value) || 0,
      manutencaoDepreciacao: Number(inputs.manutencao?.value) || 0,
      contadorOuMei: Number(inputs.contador?.value) || 0,
      produtosLimpeza: Number(inputs.limpeza?.value) || 0,
      proLaboreMensal: Number(inputs.proLabore?.value) || 0,
      salarioAjudantes: Number(inputs.salarioAjudantes?.value) || 0,
      tipoContratacao: tipo,
      encargosCltPct: encargos,
      diasTrabalhadosMes: Number(inputs.diasMes?.value) || 22,
      horasPorDia: Number(inputs.horasDia?.value) || 8,
      impostoVendaPct: Number(inputs.impostoPct?.value) || 0,
      taxaCartaoMediaPct: Number(inputs.taxaCartaoPct?.value) || 0,
      quebraInsumosPct: Number(inputs.quebraPct?.value) || 0,
      lucroLiquidoPadraoPct: Number(inputs.lucroPadraoPct?.value) || 25,
    };
  }

  function updateModalRatesSummary() {
    const current = getFormValues();
    const rates = costSettings.calculateCostRates(current);

    const elHora = document.getElementById('rateCustoHora');
    const elMin = document.getElementById('rateCustoMinuto');
    const elFixo = document.getElementById('rateCustoFixoHora');
    const elDed = document.getElementById('rateDeducoesPct');

    if (elHora) elHora.textContent = `${formatCurrency(rates.custoHoraMaoDeObra)} / h`;
    if (elMin) elMin.textContent = `${formatCurrency(rates.custoMinutoMaoDeObra)} / min`;
    if (elFixo) elFixo.textContent = `${formatCurrency(rates.custoHoraFixo)} / h`;
    if (elDed) elDed.textContent = `${rates.deducoesVendaPct.toFixed(1)}%`;
  }

  function openModal() {
    const current = costSettings.getCostSettings();
    if (inputs.aluguel) inputs.aluguel.value = current.aluguel ?? 0;
    if (inputs.energia) inputs.energia.value = current.energia ?? 160;
    if (inputs.gas) inputs.gas.value = current.gas ?? 130;
    if (inputs.agua) inputs.agua.value = current.agua ?? 70;
    if (inputs.internet) inputs.internet.value = current.internetSistemas ?? 90;
    if (inputs.manutencao) inputs.manutencao.value = current.manutencaoDepreciacao ?? 80;
    if (inputs.contador) inputs.contador.value = current.contadorOuMei ?? 75;
    if (inputs.limpeza) inputs.limpeza.value = current.produtosLimpeza ?? 60;
    if (inputs.proLabore) inputs.proLabore.value = current.proLaboreMensal ?? 3000;
    if (inputs.salarioAjudantes) inputs.salarioAjudantes.value = current.salarioAjudantes ?? 0;
    if (inputs.tipoContrato) inputs.tipoContrato.value = current.tipoContratacao || 'clt';
    if (inputs.encargosPct) inputs.encargosPct.value = current.tipoContratacao === 'fixo' ? 0 : (current.encargosCltPct ?? 34.24);
    if (inputs.diasMes) inputs.diasMes.value = current.diasTrabalhadosMes ?? 22;
    if (inputs.horasDia) inputs.horasDia.value = current.horasPorDia ?? 8;
    if (inputs.impostoPct) inputs.impostoPct.value = current.impostoVendaPct ?? 4.0;
    if (inputs.taxaCartaoPct) inputs.taxaCartaoPct.value = current.taxaCartaoMediaPct ?? 3.5;
    if (inputs.quebraPct) inputs.quebraPct.value = current.quebraInsumosPct ?? 3.0;
    if (inputs.lucroPadraoPct) inputs.lucroPadraoPct.value = current.lucroLiquidoPadraoPct ?? 25.0;

    updateEncargosFieldState();
    updateModalRatesSummary();
    modal.classList.add('open');
  }

  btnOpen.addEventListener('click', openModal);

  modal.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', () => modal.classList.remove('open'));
  });

  if (inputs.tipoContrato) {
    inputs.tipoContrato.addEventListener('change', () => {
      updateEncargosFieldState();
      updateModalRatesSummary();
    });
  }

  form.addEventListener('input', updateModalRatesSummary);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const values = getFormValues();
    costSettings.saveCostSettings(values);
    modal.classList.remove('open');
    showToast('Parâmetros de custos atualizados com sucesso!');
    updatePreview();
    renderOverviewTable();
    onChange();
  });
}

/* ============================================================
   EVENTOS
   ============================================================ */

const produtoSelect = document.getElementById('precificacaoProduto');
if (produtoSelect) produtoSelect.addEventListener('change', () => loadProduto(produtoSelect.value));

const tipoFilter = document.getElementById('precTipoFilter');
if (tipoFilter) tipoFilter.addEventListener('change', () => {
  populateProdutoSelect();
  const sel = document.getElementById('precificacaoProduto');
  loadProduto(sel ? sel.value : '');
});

const editBtn = document.getElementById('btnEditPrecificacao');
if (editBtn) {
  editBtn.addEventListener('click', () => {
    isEditing = true;
    saveSnapshot();
    updateModeUI();
    renderInsumoRows();
  });
}

const cancelBtn = document.getElementById('btnCancelEditPrec');
if (cancelBtn) {
  cancelBtn.addEventListener('click', () => {
    restoreSnapshot();
    isEditing = !editingReceita;
    updateModeUI();
    renderInsumoRows();
    updatePreview();
    showAviso('');
  });
}

const addBaseBtn = document.getElementById('btnAddPrecBase');
if (addBaseBtn) addBaseBtn.addEventListener('click', () => addBaseRow());

const clearBasesBtn = document.getElementById('btnClearPrecBases');
if (clearBasesBtn) {
  clearBasesBtn.addEventListener('click', () => {
    if (!isEditing) return;
    const temItens = baseRows.some((r) => r.refId || (r.quantidade && Number(r.quantidade) > 0));
    if (!temItens) {
      baseRows = [];
      renderBaseRows();
      updatePreview();
      return;
    }
    if (confirm('Tem certeza que deseja apagar todas as bases desta ficha técnica?')) {
      baseRows = [];
      renderBaseRows();
      updatePreview();
      showToast('Todas as bases foram removidas da ficha técnica.', 'info');
    }
  });
}

const addBtn = document.getElementById('btnAddPrecInsumo');
if (addBtn) addBtn.addEventListener('click', () => addInsumoRow());

const clearBtn = document.getElementById('btnClearPrecInsumos');
if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (!isEditing) return;
    const temItens = ingredienteRows.some((r) => r.refId || (r.quantidade && Number(r.quantidade) > 0));
    if (!temItens) {
      ingredienteRows = [{ refId: '', tipo: 'insumo', quantidade: '' }];
      renderIngredienteRows();
      updatePreview();
      return;
    }
    if (confirm('Tem certeza que deseja apagar todos os ingredientes diretos desta ficha técnica?')) {
      ingredienteRows = [{ refId: '', tipo: 'insumo', quantidade: '' }];
      renderIngredienteRows();
      updatePreview();
      showToast('Todos os ingredientes diretos foram removidos da ficha técnica.', 'info');
    }
  });
}

const pasteBaseExcelBtn = document.getElementById('btnPastePrecBaseExcel');
if (pasteBaseExcelBtn) {
  pasteBaseExcelBtn.addEventListener('click', () => {
    openExcelImportModal((importedRows) => {
      if (!Array.isArray(importedRows) || importedRows.length === 0) return;

      const importedBases = importedRows.filter((r) => r.tipo === 'base');
      const rowsToUse = importedBases.length > 0 ? importedBases : importedRows;

      baseRows = rowsToUse.map((r) => ({
        refId: r.refId,
        tipo: 'base',
        quantidade: r.quantidade,
      }));

      renderAllRows();
      updatePreview();
      showToast(`${rowsToUse.length} base(s) importada(s) com sucesso.`, 'success');
    });
  });
}

const pasteExcelBtn = document.getElementById('btnPastePrecExcel');
if (pasteExcelBtn) {
  pasteExcelBtn.addEventListener('click', () => {
    openExcelImportModal((importedRows) => {
      if (!Array.isArray(importedRows) || importedRows.length === 0) return;

      const importedBases = importedRows.filter((r) => r.tipo === 'base');
      const importedInsumos = importedRows.filter((r) => r.tipo !== 'base');

      if (importedInsumos.length > 0 && importedBases.length === 0) {
        // Colou apenas ingredientes: atualiza ingredientes preservando bases já presentes
        ingredienteRows = importedInsumos.map((r) => ({
          refId: r.refId,
          tipo: 'insumo',
          quantidade: r.quantidade,
        }));
      } else if (importedInsumos.length > 0 && importedBases.length > 0) {
        // Colou lista mista contendo ambos: distribui inteligentemente em cada bloco!
        baseRows = importedBases.map((r) => ({
          refId: r.refId,
          tipo: 'base',
          quantidade: r.quantidade,
        }));
        ingredienteRows = importedInsumos.map((r) => ({
          refId: r.refId,
          tipo: 'insumo',
          quantidade: r.quantidade,
        }));
      } else {
        // Fallback: se nada foi reconhecido como base, usa todos como ingredientes
        ingredienteRows = importedRows.map((r) => ({
          refId: r.refId,
          tipo: 'insumo',
          quantidade: r.quantidade,
        }));
      }

      renderAllRows();
      updatePreview();
      showToast(`${importedRows.length} ingrediente(s) importado(s) com sucesso.`, 'success');
    });
  });
}

const saveBtn = document.getElementById('btnSavePrecificacao');
if (saveBtn) saveBtn.addEventListener('click', () => savePrecificacao());

// Botão de expandir / recolher Matriz de Rentabilidade
const toggleOverviewBtn = document.getElementById('btnToggleOverview');
const overviewContent = document.getElementById('precOverviewContent');
if (toggleOverviewBtn && overviewContent) {
  toggleOverviewBtn.addEventListener('click', () => {
    const isHidden = overviewContent.hidden;
    overviewContent.hidden = !isHidden;
    toggleOverviewBtn.setAttribute('aria-expanded', String(!isHidden));
    toggleOverviewBtn.textContent = isHidden ? 'Recolher Matriz' : 'Expandir Matriz';
  });
}

// Pílulas de categoria de linha de produto (Passo 4 da Planilha)
const catPills = document.getElementById('precCategoriaPills');
if (catPills) {
  catPills.addEventListener('click', (e) => {
    const btn = e.target.closest('.prec-cat-btn');
    if (!btn) return;
    const cat = btn.dataset.categoria;
    setActiveCategoriaPill(cat);

    const lucroInput = document.getElementById('precLucroLiquido');
    const precoAlvoInput = document.getElementById('precPrecoAlvo');

    if (cat === 'premium') {
      if (lucroInput) lucroInput.value = 20;
      if (precoAlvoInput) precoAlvoInput.value = '';
    } else if (cat === 'basico') {
      if (lucroInput) lucroInput.value = 10;
      if (precoAlvoInput) precoAlvoInput.value = '';
    } else if (cat === 'comissionado') {
      if (lucroInput) lucroInput.value = 5;
      if (precoAlvoInput) precoAlvoInput.value = '';
    } else if (cat === 'subreceita') {
      if (lucroInput) lucroInput.value = 0;
      if (precoAlvoInput) precoAlvoInput.value = '';
    }
    showAviso('');
    updatePreview();
  });
}

['precTempoPreparo', 'precLucroLiquido', 'precRendimento', 'precEmbalagem', 'precCustoAdicional', 'precCustoAdicionalObs']
  .forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
      if (id === 'precLucroLiquido' && document.activeElement === el) {
        const precoAlvoEl = document.getElementById('precPrecoAlvo');
        if (precoAlvoEl) precoAlvoEl.value = '';
        const val = Number(el.value);
        if (val === 20) setActiveCategoriaPill('premium');
        else if (val === 10) setActiveCategoriaPill('basico');
        else if (val === 5) setActiveCategoriaPill('comissionado');
        else if (val === 0) setActiveCategoriaPill('subreceita');
        else setActiveCategoriaPill('personalizado');
      }
      updatePreview();
    });
  });

// Sincronização do Preço Alvo -> Margem Líquida Desejada
const precoAlvoInput = document.getElementById('precPrecoAlvo');
if (precoAlvoInput) {
  precoAlvoInput.addEventListener('input', () => {
    setActiveCategoriaPill('personalizado');
    const precoAlvoVal = Number(precoAlvoInput.value);
    if (precoAlvoVal > 0) {
      const receita = buildReceitaFromForm();
      const insumos = storage.getAllInsumos();
      const bases = base.getBases();
      const costRates = costSettings.getCostSettings();
      const c = pricing.calcular(receita, insumos, bases, costRates);

      const novaMargem = pricing.calcularMargemPorPrecoAlvo(c.custoUnitarioTotal, precoAlvoVal, c.taxasDeducoesPct);
      if (novaMargem != null) {
        const lucroInput = document.getElementById('precLucroLiquido');
        if (lucroInput) {
          lucroInput.value = novaMargem;
        }
        if (novaMargem < 0) {
          showAviso(`Atenção: Preço alvo de ${formatCurrency(precoAlvoVal)} fica abaixo do custo mínimo (${formatCurrency(c.precoMinimo)}). Margem líquida negativa (${novaMargem}%).`);
        } else {
          showAviso('');
        }
        updatePreview();
      }
    } else if (precoAlvoInput.value === '') {
      showAviso('');
      updatePreview();
    }
  });
}

// Busca na Matriz de Rentabilidade
const searchInput = document.getElementById('precSearch');
if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    precSearchTerm = e.target.value;
    renderOverviewTable();
  });
}

// Pílulas de filtro da Matriz de Rentabilidade
const filterPills = document.querySelectorAll('.prec-filter-pill');
filterPills.forEach((pill) => {
  pill.addEventListener('click', () => {
    filterPills.forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    precFilterCategory = pill.dataset.filter || 'todos';
    renderOverviewTable();
  });
});

// Inicializa modal de Parâmetros de Custos
initCostSettingsModal();
