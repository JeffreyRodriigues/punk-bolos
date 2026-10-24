/* ============================================================
   PURCHASESVIEW.JS — Interface da tela de Compras (Entrada de Notas)
   ------------------------------------------------------------
   Responsável por:
   - renderizar lista de compras em lote com busca e filtros
   - paginação eficiente (10 compras por página)
   - resumo financeiro de compras (total do mês, contagem, média)
   - modal dinâmico de Nova Compra (adiciona múltiplos insumos na mesma nota)
   - cálculo automático de total da compra e custo unitário por item
   - aplicação automática no inventário e precificação
   - modal de visualização detalhada de compra
   - exclusão de compra com confirmação e reversão automática no inventário
   ============================================================ */

import * as storage from './storage.js';
import * as purchases from './purchases.js';
import * as receiptParser from './receiptParser.js';
import { formatCurrency, formatDate } from '../utils/money.js';
import { showToast } from './toast.js';

/* ---------- Constantes & Estado ---------- */
const PURCHASES_PER_PAGE = 10;
let purchasesCurrentPage = 1;
let currentSearch = '';
let currentPaymentFilter = '';
let newPurchaseDraftItems = [];
let deletingPurchase = null;
let onChangeListener = null;

// Estado do modal de importação de nota (IA / XML)
let currentImportMode = 'foto'; // 'foto' | 'xml'
let selectedFotoBase64 = null;
let selectedFotoName = '';
let selectedXmlContent = null;
let selectedXmlName = '';
let isProcessingNota = false;

export function setChangeListener(fn) {
  onChangeListener = fn;
}

/* ---------- Funções Utilitárias ---------- */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTrim(n) {
  const num = Number(n) || 0;
  return String(Math.round(num * 1000) / 1000);
}

/**
 * Renderiza a view completa de compras.
 */
export function render() {
  const allPurchases = storage.getAllPurchases();
  renderSummaryStats(allPurchases);
  renderTable(allPurchases);
}

/**
 * Renderiza os cards de estatísticas no topo da tela de Compras.
 */
function renderSummaryStats(allPurchases) {
  const statTotalMes = document.getElementById('purchasesStatTotalMes');
  const statCount = document.getElementById('purchasesStatCount');
  const statTotalItens = document.getElementById('purchasesStatTotalItens');

  const now = new Date();
  const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let totalMes = 0;
  let totalItensContados = 0;

  allPurchases.forEach((p) => {
    if (p.data && p.data.startsWith(currentMonthPrefix)) {
      totalMes += Number(p.valorTotal) || 0;
    }
    if (Array.isArray(p.itens)) {
      totalItensContados += p.itens.length;
    }
  });

  if (statTotalMes) statTotalMes.textContent = formatCurrency(totalMes);
  if (statCount) statCount.textContent = allPurchases.length;
  if (statTotalItens) statTotalItens.textContent = totalItensContados;
}

/**
 * Renderiza a tabela de compras com busca, filtros e paginação.
 */
function renderTable(allPurchases) {
  const tbody = document.getElementById('purchasesTableBody');
  const emptyState = document.getElementById('purchasesEmptyState');
  const paginationNav = document.getElementById('purchasesPagination');
  const btnPrev = document.getElementById('btnPurchasePrevPage');
  const btnNext = document.getElementById('btnPurchaseNextPage');
  const pageInfo = document.getElementById('purchasesPaginationInfo');
  const countBadge = document.getElementById('purchasesCount');

  if (!tbody) return;

  tbody.innerHTML = '';

  const filtrados = purchases.filterPurchases(allPurchases, {
    query: currentSearch,
    formaPagamento: currentPaymentFilter,
  });

  if (countBadge) countBadge.textContent = filtrados.length;

  if (filtrados.length === 0) {
    if (emptyState) emptyState.hidden = false;
    if (paginationNav) paginationNav.hidden = true;
    return;
  }
  if (emptyState) emptyState.hidden = true;

  // Paginação
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PURCHASES_PER_PAGE));
  if (purchasesCurrentPage > totalPages) purchasesCurrentPage = totalPages;
  if (purchasesCurrentPage < 1) purchasesCurrentPage = 1;

  if (paginationNav) {
    if (filtrados.length <= PURCHASES_PER_PAGE) {
      paginationNav.hidden = true;
    } else {
      paginationNav.hidden = false;
      if (pageInfo) pageInfo.textContent = `Página ${purchasesCurrentPage} de ${totalPages} (${filtrados.length} compras)`;
      if (btnPrev) btnPrev.disabled = purchasesCurrentPage <= 1;
      if (btnNext) btnNext.disabled = purchasesCurrentPage >= totalPages;
    }
  }

  const startIdx = (purchasesCurrentPage - 1) * PURCHASES_PER_PAGE;
  const pageItems = filtrados.slice(startIdx, startIdx + PURCHASES_PER_PAGE);

  pageItems.forEach((compra) => {
    const tr = document.createElement('tr');
    tr.className = 'customer-row';

    // Resumo dos primeiros itens
    const itens = Array.isArray(compra.itens) ? compra.itens : [];
    const resumoItens = itens.slice(0, 2).map((it) => {
      const q = formatTrim(it.quantidade);
      const und = it.unidade === 'unidade' ? 'un' : it.unidade;
      return `${q}${und} ${it.insumoNome}`;
    }).join(', ');
    const restante = itens.length - 2;
    const itensTexto = itens.length === 0
      ? 'Nenhum item'
      : `${resumoItens}${restante > 0 ? ` (+${restante} ${restante === 1 ? 'outro' : 'outros'})` : ''}`;

    tr.innerHTML = `
      <td>
        <span class="code-badge">${escapeHtml(compra.codigo || '—')}</span>
      </td>
      <td>
        <div class="inv-cell-main">${formatDate(compra.data)}</div>
      </td>
      <td>
        <strong class="inv-nome">${escapeHtml(compra.fornecedor || 'Diversos / Não informado')}</strong>
        ${compra.observacoes ? `<div class="inv-cell-sub" style="font-style:italic;">${escapeHtml(compra.observacoes)}</div>` : ''}
      </td>
      <td>
        <span class="badge payment-badge">${escapeHtml(compra.formaPagamento || 'PIX')}</span>
      </td>
      <td>
        <div style="font-size:0.86rem; color:var(--color-text); max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(itens.map((i) => `${formatTrim(i.quantidade)} ${i.unidade} ${i.insumoNome} (${formatCurrency(i.custoTotal)})`).join('\n'))}">
          <span style="font-weight:700; color:var(--color-primary);">${itens.length} ${itens.length === 1 ? 'item' : 'itens'}:</span> ${escapeHtml(itensTexto)}
        </div>
      </td>
      <td class="inv-num">
        <strong style="color:var(--color-primary); font-size:1rem;">${formatCurrency(compra.valorTotal)}</strong>
      </td>
      <td class="inv-actions">
        <button type="button" class="btn-card-action btn-ver-detalhes" title="Ver detalhes desta compra">Ver Itens</button>
        <button type="button" class="btn-card-action action-danger btn-excluir-compra" title="Excluir compra e reverter estoque">Excluir</button>
      </td>
    `;

    tr.querySelector('.btn-ver-detalhes').addEventListener('click', () => abrirDetalhesCompra(compra));
    tr.querySelector('.btn-excluir-compra').addEventListener('click', () => abrirModalExcluir(compra));

    tbody.appendChild(tr);
  });
}

/* ============================================================
   MODAL — NOVA COMPRA (Entrada em Lote)
   ============================================================ */

/**
 * Abre o modal para registrar uma nova compra em lote.
 */
export function openNewPurchaseModal() {
  const modal = document.getElementById('compraModal');
  if (!modal) return;

  const dataEl = document.getElementById('compraFieldData');
  const fornEl = document.getElementById('compraFieldFornecedor');
  const formaEl = document.getElementById('compraFieldFormaPagamento');
  const obsEl = document.getElementById('compraFieldObs');
  const avisoEl = document.getElementById('compraFormAviso');

  if (dataEl) dataEl.value = new Date().toISOString().slice(0, 10);
  if (fornEl) fornEl.value = '';
  if (formaEl) formaEl.value = 'PIX';
  if (obsEl) obsEl.value = '';
  if (avisoEl) {
    avisoEl.hidden = true;
    avisoEl.textContent = '';
  }

  // Inicia com 1 linha vazia
  newPurchaseDraftItems = [{ insumoId: '', quantidade: '', custoTotal: '' }];
  renderDraftItems();

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

/**
 * Fecha o modal de nova compra.
 */
export function closeNewPurchaseModal() {
  const modal = document.getElementById('compraModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  newPurchaseDraftItems = [];
}

/**
 * Renderiza as linhas de itens dentro do modal de Nova Compra.
 */
function renderDraftItems() {
  const container = document.getElementById('compraItensContainer');
  const totalDisplay = document.getElementById('compraTotalCalculado');
  if (!container) return;

  container.innerHTML = '';
  const insumos = storage.getAllInsumos();

  newPurchaseDraftItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'compra-item-row';
    row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; background: var(--color-surface-alt); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);';

    // 1. Seletor de Insumo
    const selWrap = document.createElement('div');
    selWrap.style.cssText = 'flex: 2 1 200px; min-width: 180px;';

    if (item.descricaoImportada) {
      const hint = document.createElement('div');
      hint.style.cssText = 'font-size: 0.76rem; color: var(--color-primary); font-weight: 700; margin-bottom: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      hint.title = item.descricaoImportada;
      hint.textContent = `📋 Cupom: "${item.descricaoImportada}"`;
      selWrap.appendChild(hint);
    }

    const select = document.createElement('select');
    select.className = 'filter';
    select.style.cssText = 'width: 100%; font-size: 0.9rem; padding: 6px 8px;';
    select.innerHTML = '<option value="">-- Selecione o Insumo --</option>';

    insumos.forEach((ins) => {
      const opt = document.createElement('option');
      opt.value = ins.id;
      const cod = ins.codigo ? `[${ins.codigo}] ` : '';
      const und = ins.unidade === 'unidade' ? 'un' : ins.unidade;
      opt.textContent = `${cod}${ins.nome} (${und})`;
      if (ins.id === item.insumoId) opt.selected = true;
      select.appendChild(opt);
    });

    selWrap.appendChild(select);

    // 2. Quantidade
    const qtdWrap = document.createElement('div');
    qtdWrap.style.cssText = 'flex: 1 1 100px; min-width: 90px;';
    const qtdInput = document.createElement('input');
    qtdInput.type = 'number';
    qtdInput.placeholder = 'Qtd';
    qtdInput.min = '0';
    qtdInput.step = '0.001';
    qtdInput.className = 'filter';
    qtdInput.style.cssText = 'width: 100%; font-size: 0.9rem; padding: 6px 8px;';
    qtdInput.value = item.quantidade !== '' ? item.quantidade : '';
    qtdWrap.appendChild(qtdInput);

    // 3. Unidade badge
    const undBadge = document.createElement('span');
    undBadge.style.cssText = 'font-size: 0.8rem; font-weight: 700; color: var(--color-text-muted); min-width: 28px; text-align: center;';
    const selectedInsumo = insumos.find((i) => i.id === item.insumoId);
    undBadge.textContent = selectedInsumo ? (selectedInsumo.unidade === 'unidade' ? 'un' : selectedInsumo.unidade) : '—';

    // 4. Preço Total Pago no item (R$)
    const custoWrap = document.createElement('div');
    custoWrap.style.cssText = 'flex: 1 1 110px; min-width: 100px;';
    const custoInput = document.createElement('input');
    custoInput.type = 'number';
    custoInput.placeholder = 'Valor (R$)';
    custoInput.min = '0';
    custoInput.step = '0.01';
    custoInput.className = 'filter';
    custoInput.style.cssText = 'width: 100%; font-size: 0.9rem; padding: 6px 8px; font-weight: 700;';
    custoInput.value = item.custoTotal !== '' ? item.custoTotal : '';
    custoWrap.appendChild(custoInput);

    // 5. Custo unitário preview
    const unitPreview = document.createElement('div');
    unitPreview.style.cssText = 'font-size: 0.78rem; color: var(--color-primary); font-weight: 600; min-width: 110px; text-align: right;';
    const calcUnit = purchases.calculateItemUnitCost(item.custoTotal, item.quantidade);
    if (calcUnit > 0 && selectedInsumo) {
      const und = selectedInsumo.unidade === 'unidade' ? 'un' : selectedInsumo.unidade;
      unitPreview.textContent = `${formatCurrency(calcUnit)} / ${und}`;
    } else {
      unitPreview.textContent = '—';
    }

    // 6. Botão Remover linha
    const btnRemove = document.createElement('button');
    btnRemove.type = 'button';
    btnRemove.className = 'item-remove';
    btnRemove.textContent = '✕';
    btnRemove.title = 'Remover este insumo';
    btnRemove.style.cssText = 'cursor: pointer; padding: 4px 8px; font-size: 0.9rem;';
    btnRemove.addEventListener('click', () => {
      newPurchaseDraftItems.splice(index, 1);
      if (newPurchaseDraftItems.length === 0) {
        newPurchaseDraftItems.push({ insumoId: '', quantidade: '', custoTotal: '' });
      }
      renderDraftItems();
    });

    // Listeners para atualizar dados em tempo real
    select.addEventListener('change', () => {
      item.insumoId = select.value;
      const ins = insumos.find((i) => i.id === select.value);
      if (ins) {
        item.insumoNome = ins.nome;
        item.unidade = ins.unidade;
      }
      renderDraftItems();
    });

    qtdInput.addEventListener('input', () => {
      item.quantidade = qtdInput.value;
      recalculateDraftTotal();
    });

    custoInput.addEventListener('input', () => {
      item.custoTotal = custoInput.value;
      recalculateDraftTotal();
    });

    row.append(selWrap, qtdWrap, undBadge, custoWrap, unitPreview, btnRemove);
    container.appendChild(row);
  });

  recalculateDraftTotal();
}

/**
 * Recalcula o total do rascunho de compra e atualiza a interface.
 */
function recalculateDraftTotal() {
  const totalDisplay = document.getElementById('compraTotalCalculado');
  const total = purchases.calculatePurchaseTotal(newPurchaseDraftItems);
  const totalQtdItens = newPurchaseDraftItems.filter((i) => i.insumoId && Number(i.custoTotal) > 0).length;

  if (totalDisplay) {
    totalDisplay.textContent = `Total da Compra: ${formatCurrency(total)} (${totalQtdItens} ${totalQtdItens === 1 ? 'item' : 'itens'})`;
  }
}

/**
 * Salva a nova compra registrada no modal.
 */
async function salvarNovaCompra() {
  const dataEl = document.getElementById('compraFieldData');
  const fornEl = document.getElementById('compraFieldFornecedor');
  const formaEl = document.getElementById('compraFieldFormaPagamento');
  const obsEl = document.getElementById('compraFieldObs');
  const avisoEl = document.getElementById('compraFormAviso');

  const insumos = storage.getAllInsumos();
  const allPurchases = storage.getAllPurchases();

  // Mapeia insumoNome e unidade reais
  const itensFormatados = newPurchaseDraftItems
    .filter((it) => it.insumoId)
    .map((it) => {
      const ins = insumos.find((i) => i.id === it.insumoId);
      return {
        insumoId: it.insumoId,
        insumoNome: ins ? ins.nome : (it.insumoNome || 'Insumo'),
        unidade: ins ? ins.unidade : (it.unidade || 'unidade'),
        quantidade: Number(it.quantidade) || 0,
        custoTotal: Number(it.custoTotal) || 0,
      };
    });

  const rawData = {
    data: dataEl ? dataEl.value : '',
    fornecedor: fornEl ? fornEl.value : '',
    formaPagamento: formaEl ? formaEl.value : 'PIX',
    observacoes: obsEl ? obsEl.value : '',
    itens: itensFormatados,
  };

  const validacao = purchases.validatePurchase(rawData);
  if (!validacao.valid) {
    const firstErr = Object.values(validacao.errors)[0] || 'Verifique os dados da compra.';
    if (avisoEl) {
      avisoEl.hidden = false;
      avisoEl.textContent = firstErr;
    }
    return;
  }

  // Cria a compra normalizada
  const novaCompra = purchases.createPurchase(rawData, allPurchases);

  // Aplica estoque e histórico no inventário
  const insumosAtualizados = purchases.applyPurchaseToInventory(novaCompra, insumos);

  // Salva compras e insumos
  const novasCompras = [novaCompra, ...allPurchases];
  storage.savePurchases(novasCompras);
  storage.saveInsumos(insumosAtualizados);

  closeNewPurchaseModal();
  render();
  if (typeof onChangeListener === 'function') onChangeListener();

  showToast(`Compra ${novaCompra.codigo} registrada com sucesso! Estoque atualizado.`);
}

/* ============================================================
   MODAL — DETALHES DA COMPRA
   ============================================================ */

/**
 * Abre modal com o espelho detalhado da compra e itens.
 */
function abrirDetalhesCompra(compra) {
  const modal = document.getElementById('compraDetalhesModal');
  if (!modal) return;

  const titleEl = document.getElementById('compraDetalhesTitulo');
  const metaEl = document.getElementById('compraDetalhesMeta');
  const tbodyEl = document.getElementById('compraDetalhesItensTbody');
  const totalEl = document.getElementById('compraDetalhesTotal');

  if (titleEl) titleEl.textContent = `Compra ${compra.codigo} — ${compra.fornecedor || 'Diversos'}`;

  if (metaEl) {
    metaEl.innerHTML = `
      <div><strong>Data da Compra:</strong> ${formatDate(compra.data)}</div>
      <div><strong>Forma de Pagamento:</strong> <span class="badge payment-badge">${escapeHtml(compra.formaPagamento)}</span></div>
      ${compra.observacoes ? `<div><strong>Observações:</strong> ${escapeHtml(compra.observacoes)}</div>` : ''}
    `;
  }

  if (tbodyEl) {
    tbodyEl.innerHTML = '';
    const itens = Array.isArray(compra.itens) ? compra.itens : [];
    itens.forEach((it) => {
      const tr = document.createElement('tr');
      const und = it.unidade === 'unidade' ? 'un' : it.unidade;
      tr.innerHTML = `
        <td><strong>${escapeHtml(it.insumoNome)}</strong></td>
        <td style="text-align:right;">${formatTrim(it.quantidade)} ${und}</td>
        <td style="text-align:right;">${formatCurrency(it.custoTotal)}</td>
        <td style="text-align:right; color:var(--color-primary); font-weight:600;">${formatCurrency(it.custoUnitario)} / ${und}</td>
      `;
      tbodyEl.appendChild(tr);
    });
  }

  if (totalEl) totalEl.textContent = `Total: ${formatCurrency(compra.valorTotal)}`;

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

/* ============================================================
   MODAL — EXCLUSÃO DE COMPRA COM REVERSÃO DE ESTOQUE
   ============================================================ */

function abrirModalExcluir(compra) {
  deletingPurchase = compra;
  const modal = document.getElementById('compraDeleteModal');
  const descEl = document.getElementById('compraDeleteModalDesc');
  if (!modal) return;

  if (descEl) {
    descEl.textContent = `Deseja realmente excluir a compra ${compra.codigo} (${compra.fornecedor || 'Sem fornecedor'}) no valor de ${formatCurrency(compra.valorTotal)}? A quantidade dos insumos comprados será revertida no estoque físico do inventário.`;
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

function fecharModalExcluir() {
  const modal = document.getElementById('compraDeleteModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  deletingPurchase = null;
}

function confirmarExclusaoCompra() {
  if (!deletingPurchase) return;

  const compra = deletingPurchase;
  const insumos = storage.getAllInsumos();

  // Reverte as quantidades no estoque e remove os registros de compras do insumo
  const insumosRevertidos = purchases.revertPurchaseFromInventory(compra, insumos);

  storage.deletePurchase(compra.id);
  storage.saveInsumos(insumosRevertidos);

  fecharModalExcluir();
  render();
  if (typeof onChangeListener === 'function') onChangeListener();

  showToast(`Compra ${compra.codigo} excluída e estoque físico revertido com sucesso.`);
}

/* ============================================================
   MODAL — IMPORTAÇÃO DE NOTA FISCAL (FOTO IA / XML)
   ============================================================ */

export function openImportNotaModal() {
  const modal = document.getElementById('importNotaModal');
  if (!modal) return;

  // Reseta estado
  selectedFotoBase64 = null;
  selectedFotoName = '';
  selectedXmlContent = null;
  selectedXmlName = '';
  isProcessingNota = false;

  // Carrega chave salva
  const apiKeyInput = document.getElementById('inputGeminiApiKey');
  if (apiKeyInput) {
    apiKeyInput.value = storage.getGeminiApiKey();
  }

  // Reseta prévias
  const placeholderFoto = document.getElementById('dropzoneFotoPlaceholder');
  const previewFoto = document.getElementById('dropzoneFotoPreview');
  const imgPreview = document.getElementById('imgNotaPreview');
  if (placeholderFoto) placeholderFoto.hidden = false;
  if (previewFoto) previewFoto.hidden = true;
  if (imgPreview) imgPreview.src = '';

  const placeholderXml = document.getElementById('dropzoneXmlPlaceholder');
  const selectedXml = document.getElementById('dropzoneXmlSelected');
  if (placeholderXml) placeholderXml.hidden = false;
  if (selectedXml) selectedXml.hidden = true;

  const statusEl = document.getElementById('importNotaStatus');
  if (statusEl) {
    statusEl.hidden = true;
    statusEl.innerHTML = '';
  }

  const btnProcessar = document.getElementById('btnProcessarNota');
  if (btnProcessar) btnProcessar.disabled = false;

  setImportMode('foto');

  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

export function closeImportNotaModal() {
  const modal = document.getElementById('importNotaModal');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
}

function setImportMode(mode) {
  currentImportMode = mode;
  const panelFoto = document.getElementById('panelModeFoto');
  const panelXml = document.getElementById('panelModeXml');
  const tabFoto = document.getElementById('tabModeFoto');
  const tabXml = document.getElementById('tabModeXml');

  if (mode === 'foto') {
    if (panelFoto) panelFoto.hidden = false;
    if (panelXml) panelXml.hidden = true;
    if (tabFoto) {
      tabFoto.className = 'btn btn-sm btn-primary';
    }
    if (tabXml) {
      tabXml.className = 'btn btn-sm btn-ghost';
    }
  } else {
    if (panelFoto) panelFoto.hidden = true;
    if (panelXml) panelXml.hidden = false;
    if (tabFoto) {
      tabFoto.className = 'btn btn-sm btn-ghost';
    }
    if (tabXml) {
      tabXml.className = 'btn btn-sm btn-primary';
    }
  }
}

function handleFotoSelected(file) {
  if (!file) return;
  selectedFotoName = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedFotoBase64 = e.target.result;
    const placeholder = document.getElementById('dropzoneFotoPlaceholder');
    const preview = document.getElementById('dropzoneFotoPreview');
    const imgPreview = document.getElementById('imgNotaPreview');
    const txtNome = document.getElementById('txtNomeFoto');

    if (placeholder) placeholder.hidden = true;
    if (preview) preview.hidden = false;
    if (imgPreview) imgPreview.src = selectedFotoBase64;
    if (txtNome) txtNome.textContent = file.name;

    const statusEl = document.getElementById('importNotaStatus');
    if (statusEl) statusEl.hidden = true;
  };
  reader.readAsDataURL(file);
}

function handleXmlSelected(file) {
  if (!file) return;
  selectedXmlName = file.name;
  const reader = new FileReader();
  reader.onload = (e) => {
    selectedXmlContent = e.target.result;
    const placeholder = document.getElementById('dropzoneXmlPlaceholder');
    const selected = document.getElementById('dropzoneXmlSelected');
    const txtNome = document.getElementById('txtNomeXml');

    if (placeholder) placeholder.hidden = true;
    if (selected) selected.hidden = false;
    if (txtNome) txtNome.textContent = file.name;

    const statusEl = document.getElementById('importNotaStatus');
    if (statusEl) statusEl.hidden = true;
  };
  reader.readAsText(file);
}

async function processarNota() {
  if (isProcessingNota) return;
  const statusEl = document.getElementById('importNotaStatus');
  const btnProcessar = document.getElementById('btnProcessarNota');

  const showStatus = (html, isError = false) => {
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.innerHTML = html;
    statusEl.style.backgroundColor = isError ? 'var(--color-danger-bg, #ffebee)' : 'var(--color-surface-alt)';
    statusEl.style.color = isError ? 'var(--color-danger, #d32f2f)' : 'var(--color-text)';
    statusEl.style.border = isError ? '1px solid var(--color-danger, #d32f2f)' : '1px solid var(--color-border)';
  };

  try {
    let parsedData = null;

    if (currentImportMode === 'foto') {
      if (!selectedFotoBase64) {
        showStatus('Por favor, tire uma foto ou selecione uma imagem do cupom antes de continuar.', true);
        return;
      }

      const apiKeyInput = document.getElementById('inputGeminiApiKey');
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : storage.getGeminiApiKey();

      if (!apiKey) {
        showStatus('Informe a sua Chave de API do Gemini para fazer a leitura com IA. É gratuita no Google AI Studio.', true);
        if (apiKeyInput) apiKeyInput.focus();
        return;
      }

      // Salva a chave no armazenamento local para conveniência futura
      storage.saveGeminiApiKey(apiKey);

      isProcessingNota = true;
      if (btnProcessar) btnProcessar.disabled = true;
      showStatus('<span class="import-nota-loading">1/2: Otimizando imagem para envio rápido...</span>');

      // Comprime e redimensiona a foto para ~300KB (em vez de 15MB)
      const compressed = await receiptParser.compressImageBase64(selectedFotoBase64, 1600, 0.82);

      const sizeMsg = compressed.originalSizeKb > 0
        ? ` (${compressed.compressedSizeKb} KB, reduzido de ${compressed.originalSizeKb} KB)`
        : '';
      showStatus(`<span class="import-nota-loading">2/2: Enviando cupom${sizeMsg} para a IA...</span>`);

      parsedData = await receiptParser.parseReceiptImageWithGemini(
        compressed.base64,
        apiKey,
        (msg) => showStatus(`<span class="import-nota-loading">${msg}</span>`)
      );
    } else {
      if (!selectedXmlContent) {
        showStatus('Por favor, selecione um arquivo .XML de nota fiscal antes de continuar.', true);
        return;
      }

      isProcessingNota = true;
      if (btnProcessar) btnProcessar.disabled = true;
      showStatus('<span class="import-nota-loading">Processando arquivo XML da nota...</span>');

      parsedData = receiptParser.parseReceiptXml(selectedXmlContent);
    }

    if (!parsedData || !Array.isArray(parsedData.itens) || parsedData.itens.length === 0) {
      throw new Error('Nenhum item de compra foi identificado nesta nota.');
    }

    // Sucesso! Fecha modal de importação e preenche o modal de compra
    closeImportNotaModal();
    preencherNovaCompraComDadosImportados(parsedData);
    showToast(`Nota lida com sucesso! ${parsedData.itens.length} itens identificados.`);

  } catch (err) {
    showStatus(`Falha na leitura: ${err.message}`, true);
  } finally {
    isProcessingNota = false;
    if (btnProcessar) btnProcessar.disabled = false;
  }
}

/**
 * Preenche o modal de Nova Compra (#compraModal) com os dados extraídos da nota.
 */
function preencherNovaCompraComDadosImportados(dados) {
  openNewPurchaseModal();

  const dataEl = document.getElementById('compraFieldData');
  const fornEl = document.getElementById('compraFieldFornecedor');
  const formaEl = document.getElementById('compraFieldFormaPagamento');
  const obsEl = document.getElementById('compraFieldObs');

  if (dataEl && dados.data) dataEl.value = dados.data;
  if (fornEl && dados.fornecedor) fornEl.value = dados.fornecedor;
  if (formaEl && dados.formaPagamento) formaEl.value = dados.formaPagamento;
  if (obsEl) obsEl.value = `Importado de nota fiscal (${dados.fornecedor || 'Mercado'})`;

  const insumos = storage.getAllInsumos();
  newPurchaseDraftItems = dados.itens.map((it) => {
    const matched = receiptParser.matchInsumo(it.descricao, insumos);
    return {
      insumoId: matched ? matched.id : '',
      quantidade: it.quantidade,
      custoTotal: it.custoTotal,
      descricaoImportada: it.descricao,
    };
  });

  renderDraftItems();
}

/* ============================================================
   INICIALIZAÇÃO DOS LISTENERS
   ============================================================ */
export function initPurchasesEvents() {
  const btnNovaCompra = document.getElementById('btnNovaCompra');
  if (btnNovaCompra) {
    btnNovaCompra.addEventListener('click', () => openNewPurchaseModal());
  }

  // Botão "📷 Ler Nota com IA"
  const btnImportarNota = document.getElementById('btnImportarNota');
  if (btnImportarNota) {
    btnImportarNota.addEventListener('click', () => openImportNotaModal());
  }

  // Modais de importação fecham
  document.querySelectorAll('[data-close-import-modal]').forEach((el) => {
    el.addEventListener('click', () => closeImportNotaModal());
  });

  // Alternar abas Foto / XML
  const tabFoto = document.getElementById('tabModeFoto');
  if (tabFoto) {
    tabFoto.addEventListener('click', () => setImportMode('foto'));
  }
  const tabXml = document.getElementById('tabModeXml');
  if (tabXml) {
    tabXml.addEventListener('click', () => setImportMode('xml'));
  }

  // Upload Foto
  const inputFoto = document.getElementById('inputNotaFoto');
  const dropzoneFoto = document.getElementById('dropzoneFoto');
  if (dropzoneFoto && inputFoto) {
    dropzoneFoto.addEventListener('click', () => inputFoto.click());
    dropzoneFoto.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneFoto.classList.add('dragover');
    });
    dropzoneFoto.addEventListener('dragleave', () => dropzoneFoto.classList.remove('dragover'));
    dropzoneFoto.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneFoto.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFotoSelected(e.dataTransfer.files[0]);
      }
    });
    inputFoto.addEventListener('change', () => {
      if (inputFoto.files && inputFoto.files[0]) {
        handleFotoSelected(inputFoto.files[0]);
      }
    });
  }

  const btnTrocarFoto = document.getElementById('btnTrocarFoto');
  if (btnTrocarFoto && inputFoto) {
    btnTrocarFoto.addEventListener('click', (e) => {
      e.stopPropagation();
      inputFoto.click();
    });
  }

  // Salvar Chave Gemini
  const btnSalvarKey = document.getElementById('btnSalvarGeminiKey');
  const inputKey = document.getElementById('inputGeminiApiKey');
  if (btnSalvarKey && inputKey) {
    btnSalvarKey.addEventListener('click', () => {
      storage.saveGeminiApiKey(inputKey.value);
      showToast('Chave de API do Gemini salva com sucesso!');
    });
  }

  // Upload XML
  const inputXml = document.getElementById('inputNotaXml');
  const dropzoneXml = document.getElementById('dropzoneXml');
  if (dropzoneXml && inputXml) {
    dropzoneXml.addEventListener('click', () => inputXml.click());
    dropzoneXml.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzoneXml.classList.add('dragover');
    });
    dropzoneXml.addEventListener('dragleave', () => dropzoneXml.classList.remove('dragover'));
    dropzoneXml.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzoneXml.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleXmlSelected(e.dataTransfer.files[0]);
      }
    });
    inputXml.addEventListener('change', () => {
      if (inputXml.files && inputXml.files[0]) {
        handleXmlSelected(inputXml.files[0]);
      }
    });
  }

  const btnTrocarXml = document.getElementById('btnTrocarXml');
  if (btnTrocarXml && inputXml) {
    btnTrocarXml.addEventListener('click', (e) => {
      e.stopPropagation();
      inputXml.click();
    });
  }

  // Botão Processar
  const btnProcessar = document.getElementById('btnProcessarNota');
  if (btnProcessar) {
    btnProcessar.addEventListener('click', () => processarNota());
  }

  const btnAddCompraItem = document.getElementById('btnAddCompraItem');
  if (btnAddCompraItem) {
    btnAddCompraItem.addEventListener('click', () => {
      newPurchaseDraftItems.push({ insumoId: '', quantidade: '', custoTotal: '' });
      renderDraftItems();
    });
  }

  const btnSaveCompra = document.getElementById('btnSaveCompra');
  if (btnSaveCompra) {
    btnSaveCompra.addEventListener('click', () => salvarNovaCompra());
  }

  const btnCancelCompra = document.getElementById('btnCancelCompra');
  if (btnCancelCompra) {
    btnCancelCompra.addEventListener('click', () => closeNewPurchaseModal());
  }

  // Fechar modal de detalhes
  const btnFecharDetalhes = document.getElementById('btnFecharCompraDetalhes');
  if (btnFecharDetalhes) {
    btnFecharDetalhes.addEventListener('click', () => {
      const modal = document.getElementById('compraDetalhesModal');
      if (modal) modal.classList.remove('open');
      document.body.classList.remove('modal-open');
    });
  }

  // Modais fecham com data-close-modal
  document.querySelectorAll('[data-close-compra-modal]').forEach((el) => {
    el.addEventListener('click', () => closeNewPurchaseModal());
  });

  document.querySelectorAll('[data-close-compra-detalhes]').forEach((el) => {
    el.addEventListener('click', () => {
      const modal = document.getElementById('compraDetalhesModal');
      if (modal) modal.classList.remove('open');
      document.body.classList.remove('modal-open');
    });
  });

  // Modal de Exclusão
  const btnConfirmDelete = document.getElementById('btnConfirmDeleteCompra');
  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', () => confirmarExclusaoCompra());
  }

  const btnCancelDelete = document.getElementById('btnCancelDeleteCompra');
  if (btnCancelDelete) {
    btnCancelDelete.addEventListener('click', () => fecharModalExcluir());
  }

  // Busca e Filtros
  const searchInput = document.getElementById('purchaseSearch');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      currentSearch = searchInput.value;
      purchasesCurrentPage = 1;
      render();
    });
  }

  const paymentFilter = document.getElementById('purchasePaymentFilter');
  if (paymentFilter) {
    paymentFilter.addEventListener('change', () => {
      currentPaymentFilter = paymentFilter.value;
      purchasesCurrentPage = 1;
      render();
    });
  }

  // Paginação
  const btnPrev = document.getElementById('btnPurchasePrevPage');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (purchasesCurrentPage > 1) {
        purchasesCurrentPage--;
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  const btnNext = document.getElementById('btnPurchaseNextPage');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      purchasesCurrentPage++;
      render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
}
