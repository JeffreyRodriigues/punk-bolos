/* ============================================================
   PRICINGVIEW.JS — Tela de Precificação (receita por produto)
   ------------------------------------------------------------
   - Seletor de produto do catálogo
   - Linhas de insumo (seletor + quantidade na subunidade g/ml/un)
   - Fatores: margem, multiplicador, rendimento, embalagem, custo extra
   - Preview ao vivo do custo por unidade (pricing.calcular)
   - Aviso de "desatualizada" quando o insumo muda de preço
   - "Usar este preço no catálogo" copia o valor sugerido para o
     produto (escrita manual, nunca automática)
   As regras de cálculo ficam em pricing.js (módulo de negócio).
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as product from './product.js?v=17';
import * as pricing from './pricing.js?v=1';
import * as base from './base.js?v=1';
import * as inventory from './inventory.js?v=2';
import { showToast } from './toast.js?v=12';
import { formatCurrency } from '../utils/money.js?v=12';
import { sortKey } from '../utils/describe.js?v=1';

/** Callback disparado após salvar/alterar precificação (setado por app.js). */
let onChange = () => {};

/**
 * Registra o callback de notificação de mudanças.
 * @param {Function} cb - Função chamada após alterar precificações.
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

/** Rascunho das linhas de insumo do formulário. */
let insumoRows = [];

/**
 * Gera um id único para uma receita.
 * @returns {string} Id no formato "prc<timestamp>-<aleatório>".
 */
function generateId() {
  return `prc${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Exibe (ou oculta) o aviso do formulário.
 * @param {string} message - Mensagem (vazia oculta).
 * @param {boolean} [ok] - true usa estilo de sucesso.
 */
function showAviso(message, ok = false) {
  const aviso = document.getElementById('precAviso');
  if (!aviso) return;
  aviso.textContent = message;
  aviso.hidden = !message;
  aviso.classList.toggle('estoque-aviso-ok', ok);
}

/* ============================================================
   RENDER PRINCIPAL
   ============================================================ */

/**
 * Renderiza a tela de Precificação (seletor de produto + formulário).
 */
export function render() {
  populateTipoFilter();
  populateProdutoSelect();
  const emptyEl = document.getElementById('precificacaoEmpty');
  const formEl = document.getElementById('precificacaoForm');

  if (product.getProducts().length === 0) {
    if (emptyEl) emptyEl.hidden = false;
    if (formEl) formEl.hidden = true;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  if (formEl) formEl.hidden = false;

  const select = document.getElementById('precificacaoProduto');
  loadProduto(select ? select.value : currentProdutoId);
}

/**
 * Preenche o filtro de tipo de produto (derivado do catálogo).
 */
function populateTipoFilter() {
  const filtro = document.getElementById('precTipoFilter');
  if (!filtro) return;
  const tipos = [...new Set(product.getProducts().map((p) => p.tipoProduto).filter(Boolean))].sort();
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
 * Preenche o seletor de produtos do catálogo, filtrando pelo tipo
 * escolhido e exibindo o tipo em cada opção (ex.: "Fatia de chocolate (Fatia)").
 */
function populateProdutoSelect() {
  const select = document.getElementById('precificacaoProduto');
  if (!select) return;
  const filtro = document.getElementById('precTipoFilter');
  const tipo = filtro ? filtro.value : '';

  const produtos = [...product.getProducts()]
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

  // Mantém a seleção atual se ainda estiver visível; senão escolhe a primeira
  const mantem = produtos.some((p) => p.id === currentProdutoId);
  const escolhido = mantem ? currentProdutoId : produtos[0].id;
  select.value = escolhido;
  currentProdutoId = escolhido;
}

/**
 * Carrega o produto selecionado, preenchendo o formulário com a
 * receita existente (ou em branco, com defaults).
 * @param {string} produtoId - Id do produto.
 */
function loadProduto(produtoId) {
  currentProdutoId = produtoId || '';
  const receita = pricing.getReceita(storage.getAllPrecificacoes(), currentProdutoId);
  editingReceita = receita || null;

  const margem = document.getElementById('precMargem');
  const mult = document.getElementById('precMultiplicador');
  const rend = document.getElementById('precRendimento');
  const emb = document.getElementById('precEmbalagem');
  const custoAdic = document.getElementById('precCustoAdicional');
  const obs = document.getElementById('precCustoAdicionalObs');

  const base = receita || {};
  if (margem) margem.value = base.margem != null ? base.margem : pricing.PRICING_DEFAULTS.margem;
  if (mult) mult.value = base.multiplicador != null ? base.multiplicador : pricing.PRICING_DEFAULTS.multiplicador;
  if (rend) rend.value = base.rendimento != null ? base.rendimento : pricing.PRICING_DEFAULTS.rendimento;
  if (emb) emb.value = base.embalagem != null ? base.embalagem : pricing.PRICING_DEFAULTS.embalagem;
  if (custoAdic) custoAdic.value = base.custoAdicional != null ? base.custoAdicional : pricing.PRICING_DEFAULTS.custoAdicional;
  if (obs) obs.value = base.custoAdicionalObs || '';

  insumoRows = (base.itens || []).map((i) => ({
    refId: i.baseId || i.insumoId || '',
    tipo: i.baseId ? 'base' : 'insumo',
    quantidade: i.quantidade,
  }));
  if (insumoRows.length === 0) {
    insumoRows.push({ refId: '', tipo: '', quantidade: '' });
  }

  showAviso('');
  renderInsumoRows();
  updatePreview();
}

/* ============================================================
   LINHAS DE INSUMO
   ============================================================ */

/**
 * Renderiza as linhas de insumo do formulário.
 */
function renderInsumoRows() {
  const wrap = document.getElementById('precInsumos');
  if (!wrap) return;

  wrap.innerHTML = '';
  const insumos = [...storage.getAllInsumos()].sort((a, b) =>
    sortKey(a.nome || '').localeCompare(sortKey(b.nome || ''))
  );
  const bases = [...base.getBases()].sort((a, b) =>
    sortKey(a.nome || '').localeCompare(sortKey(b.nome || ''))
  );
  const baseById = new Map(bases.map((b) => [b.id, b]));

  if (insumos.length === 0 && bases.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'estoque-history-empty';
    aviso.textContent = 'Nenhum insumo ou base cadastrado. Cadastre na aba Inventário ou Bases.';
    wrap.appendChild(aviso);
    return;
  }

  wrap.classList.add('base-componentes');

  const head = document.createElement('div');
  head.className = 'base-componentes-head';
  head.innerHTML =
    '<span class="base-col-ing">Ingrediente</span>' +
    '<span class="base-col-uso">Quantidade utilizada</span>' +
    '<span class="base-col-preco">Custo e gramas da embalagem</span>' +
    '<span class="base-col-custo">Quanto custou</span>' +
    '<span class="base-col-act"></span>';
  wrap.appendChild(head);

  insumoRows.forEach((row, index) => {
    const linha = document.createElement('div');
    linha.className = 'item-row base-componente-row';

    const sel = document.createElement('select');
    sel.className = 'base-componente-select item-tipo';
    sel.setAttribute('aria-label', 'Insumo ou base');
    sel.setAttribute('data-label', 'Ingrediente');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Insumo / Base —';
    sel.appendChild(placeholder);
    insumos.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.dataset.tipo = 'insumo';
      opt.textContent = `${i.nome} (${i.unidade})`;
      sel.appendChild(opt);
    });
    bases.forEach((b) => {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.dataset.tipo = 'base';
      opt.textContent = `${b.nome} (base)`;
      sel.appendChild(opt);
    });
    sel.value = row.refId || '';

    const qtd = document.createElement('input');
    qtd.type = 'number';
    qtd.className = 'base-componente-qtd item-qtd';
    qtd.min = '0';
    qtd.step = '0.001';
    qtd.placeholder = 'Qtd';
    qtd.value = row.quantidade != null ? row.quantidade : '';
    qtd.setAttribute('aria-label', 'Quantidade utilizada');

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
    del.title = 'Remover item';
    del.setAttribute('aria-label', 'Remover item');

    const uso = document.createElement('div');
    uso.className = 'base-componente-uso';
    uso.setAttribute('data-label', 'Quantidade utilizada');
    uso.append(qtd, unitEl);

    const trimNum = (n) => String(Math.round((Number(n) || 0) * 1000) / 1000);

    function atualizarLinha() {
      const opt = sel.selectedOptions[0];
      const tipo = opt ? opt.dataset.tipo : '';
      insumoRows[index].tipo = tipo;
      insumoRows[index].refId = sel.value;

      const item = {
        insumoId: tipo === 'insumo' ? sel.value : '',
        baseId: tipo === 'base' ? sel.value : '',
        quantidade: Number(qtd.value) || 0,
      };

      if (tipo === 'base') {
        const b = baseById.get(sel.value);
        unitEl.textContent = b ? b.rendimentoUnidade : '';
        if (b) {
          const custoTotal = base.custoBase(b, insumos);
          const rend = Number(b.rendimento) || 0;
          precoEl.textContent = rend > 0
            ? `${formatCurrency(custoTotal)} / ${trimNum(rend)} ${b.rendimentoUnidade || 'un'}`
            : formatCurrency(custoTotal);
        } else {
          precoEl.textContent = '—';
        }
      } else {
        const ins = insumos.find((i) => i.id === sel.value);
        unitEl.textContent = ins ? ins.unidade : '';
        const compra = ins ? inventory.ultimaCompra(ins) : null;
        if (compra && Number(compra.custoTotal) > 0) {
          const q = Number(compra.quantidadeCompra) || 0;
          const und = compra.unidade || (ins && ins.unidade) || 'unidade';
          precoEl.textContent = q > 0
            ? `${formatCurrency(Number(compra.custoTotal) || 0)} / ${trimNum(q)} ${und}`
            : formatCurrency(Number(compra.custoTotal) || 0);
        } else {
          precoEl.textContent = '—';
        }
      }

      const custo = pricing.custoItem(item, insumos, bases);
      costEl.textContent = tipo && sel.value ? formatCurrency(custo) : '—';
      updatePreview();
    }

    sel.addEventListener('change', atualizarLinha);
    qtd.addEventListener('input', () => {
      insumoRows[index].quantidade = qtd.value;
      atualizarLinha();
    });
    del.addEventListener('click', () => {
      insumoRows.splice(index, 1);
      if (insumoRows.length === 0) insumoRows.push({ refId: '', tipo: '', quantidade: '' });
      renderInsumoRows();
      updatePreview();
    });

    linha.append(sel, uso, precoEl, costEl, del);
    wrap.appendChild(linha);

    atualizarLinha();
  });
}

/**
 * Adiciona uma linha de insumo em branco ao formulário.
 */
function addInsumoRow() {
  insumoRows.push({ refId: '', tipo: '', quantidade: '' });
  renderInsumoRows();
  updatePreview();
}

/* ============================================================
   PREVIEW AO VIVO
   ============================================================ */

/**
 * Atualiza o preview do custo por unidade a partir do formulário atual.
 */
function updatePreview() {
  const preview = document.getElementById('precPreview');
  const status = document.getElementById('precificacaoStatus');
  if (!preview) return;

  const receita = buildReceitaFromForm();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();
  const c = pricing.calcular(receita, insumos, bases);

  preview.innerHTML = '';
  const add = (label, value, strong = false) => {
    const p = document.createElement('div');
    p.className = 'prec-preview-row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('strong');
    v.textContent = value;
    if (strong) v.className = 'prec-preview-final';
    p.append(l, v);
    preview.appendChild(p);
  };

  add('Custo dos ingredientes', formatCurrency(c.custoIngredientes));
  add(`+ Margem ${receita.margem}%`, formatCurrency(c.comMargem));
  add(`× Multiplicador ${receita.multiplicador}`, formatCurrency(c.comMultiplicador));
  add(`÷ Rendimento ${receita.rendimento}`, `${formatCurrency(c.porUnidade)} /un`);
  add('+ Embalagem + custo extra', `${formatCurrency(c.custoPorUnidade)} /un`, true);

  // Status: atualizada / desatualizada / sem precificação
  if (status) {
    const desatualizada = editingReceita && pricing.isDesatualizada(editingReceita, insumos, bases);
    if (!editingReceita) {
      status.textContent = 'Sem precificação — defina a receita e salve.';
      status.className = 'prec-status prec-status-warn';
    } else if (desatualizada) {
      status.textContent = '⚠ Receita desatualizada (preço de insumo mudou). Recalcula para atualizar.';
      status.className = 'prec-status prec-status-warn';
    } else {
      status.textContent = '✔ Precificação atualizada.';
      status.className = 'prec-status prec-status-ok';
    }
  }

  const usarBtn = document.getElementById('btnUsarPreco');
  if (usarBtn) {
    const podeUsar = Number(c.custoPorUnidade) > 0;
    usarBtn.disabled = !podeUsar;
  }
}

/**
 * Constrói um objeto de receita a partir do formulário (sem snapshot).
 * @returns {Object} Receita com os valores atuais do formulário.
 */
function buildReceitaFromForm() {
  const num = (id, fallback) => {
    const el = document.getElementById(id);
    const v = el ? Number(el.value) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };

  return pricing.createReceita({
    id: editingReceita ? editingReceita.id : generateId(),
    produtoId: currentProdutoId,
    itens: insumoRows
      .filter((r) => r.refId)
      .map((r) => ({
        insumoId: r.tipo === 'insumo' ? r.refId : '',
        baseId: r.tipo === 'base' ? r.refId : '',
        quantidade: Number(r.quantidade) || 0,
      })),
    margem: num('precMargem', pricing.PRICING_DEFAULTS.margem),
    multiplicador: num('precMultiplicador', pricing.PRICING_DEFAULTS.multiplicador),
    rendimento: num('precRendimento', pricing.PRICING_DEFAULTS.rendimento),
    embalagem: num('precEmbalagem', pricing.PRICING_DEFAULTS.embalagem),
    custoAdicional: num('precCustoAdicional', pricing.PRICING_DEFAULTS.custoAdicional),
    custoAdicionalObs: (document.getElementById('precCustoAdicionalObs') || {}).value || '',
  });
}

/* ============================================================
   SALVAR / USAR PREÇO
   ============================================================ */

/**
 * Salva a precificação (cria ou atualiza) após validar.
 * @returns {boolean} true se salvou.
 */
function savePrecificacao() {
  const receita = buildReceitaFromForm();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();

  const erro = pricing.validateReceita(receita, insumos, bases);
  if (erro) {
    showAviso(erro);
    return false;
  }

  const duplicado = pricing.findDuplicate(receita, storage.getAllPrecificacoes());
  if (duplicado && duplicado.id !== receita.id) {
    showAviso('Já existe uma precificação para este produto.');
    return false;
  }

  const calculada = pricing.recalcular(receita, insumos, bases);
  const lista = storage.getAllPrecificacoes().slice();
  const idx = lista.findIndex((r) => r.id === calculada.id);
  if (idx >= 0) lista[idx] = calculada;
  else lista.push(calculada);

  storage.savePrecificacoes(lista);

  editingReceita = calculada;
  showToast('Precificação salva!');
  showAviso('', true);
  updatePreview();
  onChange();
  return true;
}

/**
 * Copia o preço sugerido para o valor do produto no catálogo
 * (escrita manual, disparada pelo botão).
 */
function usarPreco() {
  if (!currentProdutoId) return;
  const receita = buildReceitaFromForm();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();
  const c = pricing.calcular(receita, insumos, bases);
  if (!(Number(c.custoPorUnidade) > 0)) {
    showAviso('Calcule um custo válido antes de usar o preço.');
    return;
  }

  const produtos = storage.getAllProducts();
  const idx = produtos.findIndex((p) => p.id === currentProdutoId);
  if (idx < 0) return;

  produtos[idx] = { ...produtos[idx], valor: Number(c.custoPorUnidade) };
  storage.saveProducts(produtos);
  showToast(`Preço de "${produtos[idx].titulo || 'produto'}" atualizado para ${formatCurrency(c.custoPorUnidade)}.`);
  onChange();
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

const addBtn = document.getElementById('btnAddPrecInsumo');
if (addBtn) addBtn.addEventListener('click', () => addInsumoRow());

const saveBtn = document.getElementById('btnSavePrecificacao');
if (saveBtn) saveBtn.addEventListener('click', () => savePrecificacao());

const usarBtn = document.getElementById('btnUsarPreco');
if (usarBtn) usarBtn.addEventListener('click', () => usarPreco());

['precMargem', 'precMultiplicador', 'precRendimento', 'precEmbalagem', 'precCustoAdicional', 'precCustoAdicionalObs']
  .forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => updatePreview());
  });
