/* ============================================================
   EXCELMODAL.JS — Controlador do Modal "Colar do Excel"
   ------------------------------------------------------------
   Gerencia a interface de importação via cópia e colagem do Excel:
   - Captura os dados colados
   - Valida e cruza com os insumos do Inventário
   - Exibe tabela de conferência (Existente / Preço Diferente / Nome Parecido / Novo)
   - Permite escolher ações por linha antes de confirmar
   - Cria novos insumos / atualiza compras conforme a escolha
   - Retorna as linhas prontas para a tela de Precificação ou Base
   ============================================================ */

import * as storage from './storage.js';
import * as inventory from './inventory.js';
import {
  parseExcelText,
  matchParsedRowsWithInventory,
  STATUS_TYPES,
} from './excelImporter.js';
import { formatCurrency } from '../utils/money.js';
import { showToast } from './toast.js';

/** Callback a ser executado quando o usuário confirmar a importação */
let onConfirmCallback = null;

/** Estado das linhas processadas no modal atual */
let currentMatchedRows = [];

/**
 * Abre o modal de importação do Excel.
 * @param {Function} onConfirm - Callback que recebe as linhas { refId, tipo, quantidade }
 */
export function openExcelImportModal(onConfirm) {
  onConfirmCallback = onConfirm;
  currentMatchedRows = [];

  const modal = document.getElementById('modalImportExcel');
  if (!modal) return;

  const textarea = document.getElementById('excelPasteArea');
  const previewSection = document.getElementById('excelPreviewSection');
  const confirmBtn = document.getElementById('btnConfirmExcelImport');
  const aviso = document.getElementById('excelImportAviso');

  if (textarea) textarea.value = '';
  if (previewSection) previewSection.hidden = true;
  if (confirmBtn) confirmBtn.disabled = true;
  if (aviso) {
    aviso.hidden = true;
    aviso.textContent = '';
  }

  modal.classList.add('open');
  document.body.classList.add('modal-open');
  if (textarea) textarea.focus();
}

/**
 * Fecha o modal de importação do Excel.
 */
export function closeExcelImportModal() {
  const modal = document.getElementById('modalImportExcel');
  if (modal) modal.classList.remove('open');
  document.body.classList.remove('modal-open');
  onConfirmCallback = null;
  currentMatchedRows = [];
}

/**
 * Processa o texto digitado/colado e renderiza a tabela de conferência.
 */
function handleTextChange() {
  const textarea = document.getElementById('excelPasteArea');
  const previewSection = document.getElementById('excelPreviewSection');
  const previewBody = document.getElementById('excelPreviewBody');
  const confirmBtn = document.getElementById('btnConfirmExcelImport');
  const aviso = document.getElementById('excelImportAviso');

  if (!textarea || !previewSection || !previewBody || !confirmBtn) return;

  const rawText = textarea.value;
  const parsed = parseExcelText(rawText);

  if (parsed.length === 0) {
    previewSection.hidden = true;
    previewBody.innerHTML = '';
    confirmBtn.disabled = true;
    if (aviso) {
      if (rawText.trim().length > 0) {
        aviso.hidden = false;
        aviso.textContent = 'Nenhum ingrediente válido detectado. Certifique-se de copiar as colunas corretas.';
      } else {
        aviso.hidden = true;
      }
    }
    return;
  }

  if (aviso) aviso.hidden = true;

  const existingInsumos = storage.getAllInsumos();
  currentMatchedRows = matchParsedRowsWithInventory(parsed, existingInsumos);

  renderPreviewTable(currentMatchedRows, existingInsumos);
  previewSection.hidden = false;

  const hasValidRows = currentMatchedRows.some((r) => r.status !== STATUS_TYPES.INVALID);
  confirmBtn.disabled = !hasValidRows;
}

/**
 * Renderiza as linhas de pré-visualização no corpo da tabela.
 * @param {Array<Object>} rows - Linhas analisadas
 * @param {Array<Object>} existingInsumos - Insumos cadastrados
 */
function renderPreviewTable(rows, existingInsumos) {
  const previewBody = document.getElementById('excelPreviewBody');
  if (!previewBody) return;

  previewBody.innerHTML = '';

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.className = `excel-row excel-row-${row.status}`;

    // Coluna 1: Status badge
    const tdStatus = document.createElement('td');
    let badgeClass = 'badge-secondary';
    let badgeText = 'Inválido';

    if (row.status === STATUS_TYPES.EXACT_MATCH_SAME_PRICE) {
      badgeClass = 'badge-success';
      badgeText = '🟢 Existente';
    } else if (row.status === STATUS_TYPES.EXACT_MATCH_DIFF_PRICE) {
      badgeClass = 'badge-warning';
      badgeText = '🟡 Preço Dif.';
    } else if (row.status === STATUS_TYPES.SIMILAR_NAME) {
      badgeClass = 'badge-orange';
      badgeText = '🟠 Nome Parecido';
    } else if (row.status === STATUS_TYPES.NEW_INSUMO) {
      badgeClass = 'badge-info';
      badgeText = '🔵 Novo Insumo';
    }

    tdStatus.innerHTML = `<span class="badge ${badgeClass}">${badgeText}</span>`;

    // Coluna 2: Nome na Planilha
    const tdNome = document.createElement('td');
    tdNome.innerHTML = `<strong>${escapeHtml(row.rawNome)}</strong>`;

    // Coluna 3: Ação / Mapeamento
    const tdAcao = document.createElement('td');
    if (row.status === STATUS_TYPES.EXACT_MATCH_SAME_PRICE) {
      tdAcao.innerHTML = `<span class="text-muted">Usa cadastro: <strong>${escapeHtml(row.insumoMatch.nome)}</strong></span>`;
    } else if (row.status === STATUS_TYPES.EXACT_MATCH_DIFF_PRICE) {
      const precoPlanilha = row.custoEmbalagem > 0 ? formatCurrency(row.custoEmbalagem) : 'R$ 0,00';
      const precoAtual = formatCurrency(row.precoAtual);

      const div = document.createElement('div');
      div.className = 'excel-action-options';
      div.innerHTML = `
        <label class="excel-radio-label">
          <input type="radio" name="acao_diff_${index}" value="keep_existing_price" checked>
          <span>Manter preço do inventário (${precoAtual} / ${row.qtdAtual}g)</span>
        </label>
        <label class="excel-radio-label">
          <input type="radio" name="acao_diff_${index}" value="update_price">
          <span>Atualizar inventário para ${precoPlanilha} / ${row.qtdEmbalagem}g</span>
        </label>
      `;

      div.querySelectorAll('input').forEach((input) => {
        input.addEventListener('change', (e) => {
          row.acao = e.target.value;
        });
      });

      tdAcao.appendChild(div);
    } else if (row.status === STATUS_TYPES.SIMILAR_NAME) {
      const div = document.createElement('div');
      div.className = 'excel-action-options';
      const precoAtual = formatCurrency(row.precoAtual);

      div.innerHTML = `
        <div style="font-weight: 600; color: var(--color-warn); margin-bottom: 4px;">
          ⚠️ Parece com: "${escapeHtml(row.insumoMatch.nome)}" (${Math.round((row.similarityScore || 0.7) * 100)}% similar)
        </div>
        <label class="excel-radio-label">
          <input type="radio" name="acao_sim_${index}" value="use_similar" checked>
          <span>Usar insumo cadastrado: <strong>${escapeHtml(row.insumoMatch.nome)}</strong> (${precoAtual})</span>
        </label>
        <label class="excel-radio-label">
          <input type="radio" name="acao_sim_${index}" value="create_new">
          <span>Cadastrar como NOVO insumo: <strong>${escapeHtml(row.rawNome)}</strong></span>
        </label>
      `;

      div.querySelectorAll('input').forEach((input) => {
        input.addEventListener('change', (e) => {
          row.acao = e.target.value;
        });
      });

      tdAcao.appendChild(div);
    } else if (row.status === STATUS_TYPES.NEW_INSUMO) {
      const div = document.createElement('div');
      div.className = 'excel-new-item-action';
      div.innerHTML = `
        <span>Será cadastrado como <strong>${escapeHtml(row.rawNome)}</strong> (${row.unidade || 'g'})</span>
      `;
      tdAcao.appendChild(div);
    } else {
      tdAcao.innerHTML = `<span class="text-danger">${escapeHtml(row.mensagem || 'Inválido')}</span>`;
    }

    // Coluna 4: Quantidade Utilizada
    const tdQtd = document.createElement('td');
    tdQtd.textContent = `${row.qtdUtilizada} g`;

    // Coluna 5: Custo / Embalagem
    const tdPreco = document.createElement('td');
    if (row.custoEmbalagem > 0) {
      tdPreco.textContent = `${formatCurrency(row.custoEmbalagem)} / ${row.qtdEmbalagem}g`;
    } else {
      tdPreco.textContent = '—';
    }

    tr.append(tdStatus, tdNome, tdAcao, tdQtd, tdPreco);
    previewBody.appendChild(tr);
  });
}

/**
 * Escapa strings para inserção segura no HTML.
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Confirma a importação, cria/atualiza os insumos necessários e retorna as linhas.
 */
function handleConfirm() {
  if (!onConfirmCallback || currentMatchedRows.length === 0) {
    closeExcelImportModal();
    return;
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const rowsToInsert = [];
    const allInsumos = storage.getAllInsumos().slice();
    let newInsumosCreated = 0;
    let pricesUpdated = 0;

    for (const row of currentMatchedRows) {
      if (row.status === STATUS_TYPES.INVALID) continue;

      let targetInsumoId = row.insumoId;

      const isCreatingNew =
        row.status === STATUS_TYPES.NEW_INSUMO ||
        (row.status === STATUS_TYPES.SIMILAR_NAME && row.acao === 'create_new');

      if (isCreatingNew) {
        // Cria o novo insumo no inventário
        const novoInsumo = inventory.createInsumo({
          nome: row.rawNome,
          unidade: row.unidade || 'g',
          descricao: 'Cadastrado via importação de planilha',
          compras: [
            {
              data: today,
              custoTotal: row.custoEmbalagem > 0 ? row.custoEmbalagem : 0.01,
              quantidadeCompra: row.qtdEmbalagem > 0 ? row.qtdEmbalagem : 1000,
            },
          ],
        });

        allInsumos.push(novoInsumo);
        targetInsumoId = novoInsumo.id;
        newInsumosCreated++;
      } else if (row.status === STATUS_TYPES.SIMILAR_NAME && row.acao === 'use_similar') {
        targetInsumoId = row.insumoMatch ? row.insumoMatch.id : row.insumoId;
      } else if (row.status === STATUS_TYPES.EXACT_MATCH_DIFF_PRICE && row.acao === 'update_price') {
        // Atualiza o preço cadastrando uma nova compra no insumo existente
        const idx = allInsumos.findIndex((i) => i.id === row.insumoId);
        if (idx >= 0) {
          const ins = allInsumos[idx];
          const novaCompra = {
            data: today,
            custoTotal: row.custoEmbalagem,
            quantidadeCompra: row.qtdEmbalagem > 0 ? row.qtdEmbalagem : 1000,
          };
          const compras = Array.isArray(ins.compras) ? [...ins.compras] : [];
          compras.push(novaCompra);
          allInsumos[idx] = inventory.createInsumo({
            ...ins,
            compras,
          });
          pricesUpdated++;
        }
      }

      if (targetInsumoId) {
        rowsToInsert.push({
          refId: targetInsumoId,
          tipo: 'insumo',
          quantidade: row.qtdUtilizada,
        });
      }
    }

    // Salva todos os insumos criados/atualizados no banco/storage
    if (newInsumosCreated > 0 || pricesUpdated > 0) {
      storage.saveInsumos(allInsumos);
    }

    // Executa callback passando as linhas convertidas para a receita ou base
    const cb = onConfirmCallback;
    closeExcelImportModal();

    if (typeof cb === 'function') {
      cb(rowsToInsert);
    }

    let msg = `${rowsToInsert.length} ingrediente(s) inserido(s) na receita!`;
    if (newInsumosCreated > 0) {
      msg += ` (${newInsumosCreated} novo(s) no Inventário)`;
    }
    showToast(msg, 'success');
  } catch (err) {
    console.error('Erro ao confirmar importação do Excel:', err);
    showToast(`Erro ao importar: ${err.message}`, 'error');
  }
}

/**
 * Inicializa os ouvintes de evento do modal do Excel.
 */
export function initExcelModal() {
  const textarea = document.getElementById('excelPasteArea');
  if (textarea) {
    textarea.addEventListener('input', handleTextChange);
    textarea.addEventListener('paste', () => {
      setTimeout(handleTextChange, 50);
    });
  }

  const confirmBtn = document.getElementById('btnConfirmExcelImport');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', handleConfirm);
  }

  const modal = document.getElementById('modalImportExcel');
  if (modal) {
    modal.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', closeExcelImportModal);
    });
  }
}
