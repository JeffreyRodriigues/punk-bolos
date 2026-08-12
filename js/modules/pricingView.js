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

  // Mantém a seleção atual se ainda existir; senão seleciona o primeiro
  const select = document.getElementById('precificacaoProduto');
  if (select && !currentProdutoId) {
    currentProdutoId = product.getProducts()[0].id;
    select.value = currentProdutoId;
  }
  loadProduto(currentProdutoId);
}

/**
 * Preenche o seletor de produtos do catálogo.
 */
function populateProdutoSelect() {
  const select = document.getElementById('precificacaoProduto');
  if (!select) return;
  const anterior = select.value || currentProdutoId;
  const produtos = [...product.getProducts()].sort((a, b) =>
    sortKey(a.titulo || '').localeCompare(sortKey(b.titulo || ''))
  );

  select.innerHTML = '';
  produtos.forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.titulo || 'Produto';
    select.appendChild(opt);
  });
  if (anterior) select.value = anterior;
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

  insumoRows = (base.itens || []).map((i) => ({ insumoId: i.insumoId, quantidade: i.quantidade }));
  if (insumoRows.length === 0) {
    insumoRows.push({ insumoId: '', quantidade: '' });
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

  if (insumos.length === 0) {
    const aviso = document.createElement('p');
    aviso.className = 'estoque-history-empty';
    aviso.textContent = 'Nenhum insumo cadastrado. Cadastre insumos na aba Inventário.';
    wrap.appendChild(aviso);
    return;
  }

  insumoRows.forEach((row, index) => {
    const linha = document.createElement('div');
    linha.className = 'item-row prec-insumo-row';

    const sel = document.createElement('select');
    sel.className = 'prec-insumo-select item-tipo';
    sel.setAttribute('aria-label', 'Insumo');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— Insumo —';
    sel.appendChild(placeholder);
    insumos.forEach((i) => {
      const opt = document.createElement('option');
      opt.value = i.id;
      opt.textContent = `${i.nome} (${i.unidade})`;
      sel.appendChild(opt);
    });
    sel.value = row.insumoId || '';
    sel.addEventListener('change', () => {
      insumoRows[index].insumoId = sel.value;
      updatePreview();
    });

    const qtd = document.createElement('input');
    qtd.type = 'number';
    qtd.className = 'prec-insumo-qtd item-qtd';
    qtd.min = '0';
    qtd.step = '0.001';
    qtd.placeholder = 'Qtd (g/ml/un)';
    qtd.value = row.quantidade != null ? row.quantidade : '';
    qtd.setAttribute('aria-label', 'Quantidade do insumo');
    qtd.addEventListener('input', () => {
      insumoRows[index].quantidade = qtd.value;
      updatePreview();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'item-remove';
    del.textContent = '✕';
    del.title = 'Remover insumo';
    del.setAttribute('aria-label', 'Remover insumo');
    del.addEventListener('click', () => {
      insumoRows.splice(index, 1);
      if (insumoRows.length === 0) insumoRows.push({ insumoId: '', quantidade: '' });
      renderInsumoRows();
      updatePreview();
    });

    linha.append(sel, qtd, del);
    wrap.appendChild(linha);
  });
}

/**
 * Adiciona uma linha de insumo em branco ao formulário.
 */
function addInsumoRow() {
  insumoRows.push({ insumoId: '', quantidade: '' });
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
  const c = pricing.calcular(receita, insumos);

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
    const desatualizada = editingReceita && pricing.isDesatualizada(editingReceita, insumos);
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
      .filter((r) => r.insumoId)
      .map((r) => ({ insumoId: r.insumoId, quantidade: Number(r.quantidade) || 0 })),
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

  const erro = pricing.validateReceita(receita, insumos);
  if (erro) {
    showAviso(erro);
    return false;
  }

  const duplicado = pricing.findDuplicate(receita, storage.getAllPrecificacoes());
  if (duplicado && duplicado.id !== receita.id) {
    showAviso('Já existe uma precificação para este produto.');
    return false;
  }

  const calculada = pricing.recalcular(receita, insumos);
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
  const c = pricing.calcular(receita, insumos);
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
