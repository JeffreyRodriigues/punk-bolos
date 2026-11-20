/* ============================================================
   SHOPPINGLIST.JS — Lista de Compras Automática para Atacadista
   ------------------------------------------------------------
   Consolida insumos com estoque abaixo do mínimo ou zerados,
   calculando a sugestão de reposição com base no histórico
   de embalagens e compras.
   Ações disponíveis:
   - Visualização em tabela com contadores de alerta
   - Copiar lista formatada para envio no WhatsApp
   - Imprimir lista física de conferência / prancheta
   ============================================================ */

import * as storage from './storage.js';
import { formatDate } from '../utils/money.js';
import { showToast } from './toast.js';

/**
 * Remove casas decimais redundantes de números.
 * @param {number|string} n - Valor a formatar.
 * @returns {string} Número limpo.
 */
function formatTrim(n) {
  const num = Number(n) || 0;
  return String(Math.round(num * 1000) / 1000);
}

/**
 * Retorna os insumos que precisam de reposição (zerados ou abaixo do mínimo).
 * @returns {Array<Object>} Lista de insumos com dados de reposição calculados.
 */
export function getItemsToRestock() {
  const allInsumos = storage.getAllInsumos() || [];
  const items = [];

  allInsumos.forEach((insumo) => {
    const atual = Number(insumo.estoqueAtual) || 0;
    const min = insumo.estoqueMinimo != null && insumo.estoqueMinimo !== '' ? Number(insumo.estoqueMinimo) : null;

    const isZerado = atual <= 0;
    const isBaixo = min != null && min > 0 && atual <= min;

    if (!isZerado && !isBaixo) return;

    // Obtém histórico de compra para deduzir tamanho padrão de embalagem
    const compras = Array.isArray(insumo.compras) ? insumo.compras : [];
    const ultimaCompra = compras.length > 0 ? compras[compras.length - 1] : null;
    const pctQtd = ultimaCompra && Number(ultimaCompra.quantidadeCompra) > 0
      ? Number(ultimaCompra.quantidadeCompra)
      : null;

    let sugeridoQtd = 0;
    let sugeridoTexto = '';

    if (min != null && min > 0) {
      // Reposição inteligente: meta de 2x o estoque mínimo de segurança
      sugeridoQtd = Math.max(min * 2 - atual, min);
    } else if (pctQtd) {
      sugeridoQtd = pctQtd;
    } else {
      sugeridoQtd = 1;
    }

    if (pctQtd && pctQtd > 0 && sugeridoQtd >= pctQtd) {
      const pacotes = Math.max(1, Math.ceil(sugeridoQtd / pctQtd));
      sugeridoTexto = `${formatTrim(sugeridoQtd)} ${insumo.unidade || 'un'} (${pacotes} pct/un)`;
    } else {
      sugeridoTexto = `${formatTrim(sugeridoQtd)} ${insumo.unidade || 'un'}`;
    }

    items.push({
      id: insumo.id,
      codigo: insumo.codigo || '—',
      nome: insumo.nome || 'Insumo sem nome',
      unidade: insumo.unidade || 'un',
      descricao: insumo.descricao || '',
      estoqueAtual: atual,
      estoqueMinimo: min,
      sugeridoQtd,
      sugeridoTexto,
      status: isZerado ? 'zerado' : 'baixo',
    });
  });

  // Ordena: itens zerados primeiro, depois ordem alfabética de nome
  items.sort((a, b) => {
    if (a.status === 'zerado' && b.status !== 'zerado') return -1;
    if (a.status !== 'zerado' && b.status === 'zerado') return 1;
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  return items;
}

/**
 * Renderiza o conteúdo do modal de Lista de Compras.
 */
export function renderShoppingList() {
  const tbody = document.getElementById('listaComprasTableBody');
  const emptyEl = document.getElementById('listaComprasEmpty');
  const badgeCount = document.getElementById('listaComprasBadgeCount');
  const badgeZerados = document.getElementById('listaComprasBadgeZerados');

  const items = getItemsToRestock();
  const zeradosCount = items.filter((i) => i.status === 'zerado').length;

  if (badgeCount) {
    badgeCount.textContent = `${items.length} item(ns) para repor`;
  }
  if (badgeZerados) {
    badgeZerados.textContent = `${zeradosCount} zerado(s)`;
    badgeZerados.style.display = zeradosCount > 0 ? 'inline-block' : 'none';
  }

  if (emptyEl) {
    emptyEl.hidden = items.length > 0;
  }

  if (!tbody) return;
  tbody.innerHTML = '';

  items.forEach((item) => {
    const tr = document.createElement('tr');
    if (item.status === 'zerado') {
      tr.classList.add('estoque-row-alerta');
    }

    // Código
    const tdCodigo = document.createElement('td');
    tdCodigo.style.fontWeight = '600';
    tdCodigo.style.fontSize = '0.85rem';
    tdCodigo.textContent = item.codigo;

    // Nome
    const tdNome = document.createElement('td');
    tdNome.innerHTML = `<strong>${item.nome}</strong>${item.descricao ? `<br><small style="color:var(--color-text-muted);">${item.descricao}</small>` : ''}`;

    // Estoque Atual
    const tdAtual = document.createElement('td');
    tdAtual.style.textAlign = 'right';
    tdAtual.style.fontWeight = 'bold';
    tdAtual.style.color = item.status === 'zerado' ? 'var(--color-danger)' : 'var(--color-warning)';
    tdAtual.textContent = `${formatTrim(item.estoqueAtual)} ${item.unidade}`;

    // Estoque Mínimo
    const tdMin = document.createElement('td');
    tdMin.style.textAlign = 'right';
    tdMin.style.color = 'var(--color-text-muted)';
    tdMin.textContent = item.estoqueMinimo != null ? `${formatTrim(item.estoqueMinimo)} ${item.unidade}` : '—';

    // Sugerido Comprar
    const tdSugerido = document.createElement('td');
    tdSugerido.style.textAlign = 'right';
    tdSugerido.style.fontWeight = '700';
    tdSugerido.style.color = 'var(--color-primary)';
    tdSugerido.textContent = item.sugeridoTexto;

    // Status Badge
    const tdStatus = document.createElement('td');
    tdStatus.style.textAlign = 'center';
    const badge = document.createElement('span');
    badge.className = item.status === 'zerado' ? 'badge badge-danger' : 'badge badge-warning';
    badge.textContent = item.status === 'zerado' ? 'Zerado' : 'Baixo';
    tdStatus.appendChild(badge);

    tr.append(tdCodigo, tdNome, tdAtual, tdMin, tdSugerido, tdStatus);
    tbody.appendChild(tr);
  });
}

/**
 * Abre o modal de Lista de Compras.
 */
export function openShoppingListModal() {
  const modal = document.getElementById('modalListaCompras');
  if (!modal) return;
  renderShoppingList();
  modal.classList.add('open');
  document.body.classList.add('modal-open');
}

/**
 * Fecha o modal de Lista de Compras.
 */
export function closeShoppingListModal() {
  const modal = document.getElementById('modalListaCompras');
  if (modal) {
    modal.classList.remove('open');
  }
  document.body.classList.remove('modal-open');
}

/**
 * Formata e copia o texto da lista para a área de transferência para envio no WhatsApp.
 */
export function copyToWhatsApp() {
  const items = getItemsToRestock();
  if (items.length === 0) {
    showToast('Nenhum insumo precisa de reposição no momento.', 'info');
    return;
  }

  const now = new Date();
  const dateStr = formatDate(now.toISOString().slice(0, 10));
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const zerados = items.filter((i) => i.status === 'zerado');
  const baixos = items.filter((i) => i.status !== 'zerado');

  const lines = [
    '*PUNK BOLOS - LISTA DE COMPRAS & REPOSICAO*',
    `Data: ${dateStr} as ${timeStr}`,
    `Total de itens para compra: ${items.length}`,
    '',
  ];

  if (zerados.length > 0) {
    lines.push('*ITENS ZERADOS (URGENTE):*');
    zerados.forEach((item) => {
      lines.push(`- [${item.codigo}] ${item.nome} | Atual: ${formatTrim(item.estoqueAtual)} ${item.unidade} | Sugerido: ${item.sugeridoTexto}`);
    });
    lines.push('');
  }

  if (baixos.length > 0) {
    lines.push('*ITENS COM ESTOQUE BAIXO:*');
    baixos.forEach((item) => {
      const minStr = item.estoqueMinimo != null ? ` (Min: ${formatTrim(item.estoqueMinimo)} ${item.unidade})` : '';
      lines.push(`- [${item.codigo}] ${item.nome} | Atual: ${formatTrim(item.estoqueAtual)} ${item.unidade}${minStr} | Sugerido: ${item.sugeridoTexto}`);
    });
    lines.push('');
  }

  lines.push('_Gerado automaticamente pelo Sistema Punk Bolos_');

  const textToCopy = lines.join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('Lista de compras copiada para o WhatsApp!', 'success');
    }).catch(() => {
      fallbackCopyText(textToCopy);
    });
  } else {
    fallbackCopyText(textToCopy);
  }
}

/**
 * Método de cópia de fallback caso a Clipboard API não esteja disponível.
 * @param {string} text - Texto a ser copiado.
 */
function fallbackCopyText(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const ok = document.execCommand('copy');
    if (ok) {
      showToast('Lista de compras copiada para o WhatsApp!', 'success');
    } else {
      showToast('Nao foi possivel copiar a lista automaticamente.', 'error');
    }
  } catch (_) {
    showToast('Nao foi possivel copiar a lista.', 'error');
  }
  document.body.removeChild(textArea);
}

/**
 * Prepara e aciona a impressão da lista de compras em formato de prancheta/conferência.
 */
export function printShoppingList() {
  const items = getItemsToRestock();
  if (items.length === 0) {
    showToast('Nenhum insumo precisa de reposição no momento.', 'info');
    return;
  }

  const printContainer = document.getElementById('printContainer');
  if (!printContainer) return;

  const now = new Date();
  const dateStr = formatDate(now.toISOString().slice(0, 10));
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const rowsHtml = items.map((item) => `
    <tr>
      <td style="text-align: center; width: 35px; font-size: 16px;">[ ]</td>
      <td style="font-weight: bold; width: 80px;">${item.codigo}</td>
      <td>
        <strong>${item.nome}</strong>
        ${item.descricao ? `<br><small style="color: #555;">${item.descricao}</small>` : ''}
      </td>
      <td style="text-align: right; width: 95px; ${item.status === 'zerado' ? 'font-weight: bold; color: #b91c1c;' : ''}">
        ${formatTrim(item.estoqueAtual)} ${item.unidade}
      </td>
      <td style="text-align: right; width: 95px; color: #555;">
        ${item.estoqueMinimo != null ? `${formatTrim(item.estoqueMinimo)} ${item.unidade}` : '—'}
      </td>
      <td style="text-align: right; width: 140px; font-weight: bold;">
        ${item.sugeridoTexto}
      </td>
      <td style="width: 100px; border-bottom: 1px solid #999;">&nbsp;</td>
    </tr>
  `).join('');

  printContainer.innerHTML = `
    <div class="print-shopping-list" style="padding: 12px; font-family: 'Segoe UI', Arial, sans-serif; color: #000;">
      <div style="border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h2 style="margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 0.5px;">Punk Bolos — Lista de Reposição & Compras</h2>
          <span style="font-size: 12px; color: #444;">Atacadista / Fornecedores</span>
        </div>
        <div style="text-align: right; font-size: 12px;">
          <div><strong>Data:</strong> ${dateStr} às ${timeStr}</div>
          <div><strong>Total:</strong> ${items.length} item(ns)</div>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 16px;">
        <thead>
          <tr style="background-color: #f3f4f6; border-bottom: 2px solid #333;">
            <th style="padding: 6px; border: 1px solid #ccc; text-align: center;">Ok</th>
            <th style="padding: 6px; border: 1px solid #ccc; text-align: left;">Código</th>
            <th style="padding: 6px; border: 1px solid #ccc; text-align: left;">Insumo / Ingrediente</th>
            <th style="padding: 6px; border: 1px solid #ccc; text-align: right;">Estoque Atual</th>
            <th style="padding: 6px; border: 1px solid #ccc; text-align: right;">Estoque Mínimo</th>
            <th style="padding: 6px; border: 1px solid #ccc; text-align: right;">Sugerido Comprar</th>
            <th style="padding: 6px; border: 1px solid #ccc; text-align: center;">Comprado (Qtd/Valor)</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div style="margin-top: 24px; padding-top: 10px; border-top: 1px dashed #666; display: flex; justify-content: space-between; font-size: 11px; color: #555;">
        <span>Conferência de Compras — Assinatura do Responsável: ___________________________</span>
        <span>Sistema Punk Bolos</span>
      </div>
    </div>
  `;

  window.print();
}

/**
 * Inicializa os event listeners do módulo de Lista de Compras.
 */
export function init() {
  // Gatilho na tela de Compras
  const btnCompras = document.getElementById('btnListaComprasCompras');
  if (btnCompras) {
    btnCompras.addEventListener('click', openShoppingListModal);
  }

  // Gatilho na tela de Inventário
  const btnInv = document.getElementById('btnListaComprasInv');
  if (btnInv) {
    btnInv.addEventListener('click', openShoppingListModal);
  }

  // Botão Copiar WhatsApp
  const btnWa = document.getElementById('btnCopiarListaComprasWhatsApp');
  if (btnWa) {
    btnWa.addEventListener('click', copyToWhatsApp);
  }

  // Botão Imprimir
  const btnPrint = document.getElementById('btnImprimirListaCompras');
  if (btnPrint) {
    btnPrint.addEventListener('click', printShoppingList);
  }

  // Fechamento de modal via botões data-close-modal dentro de modalListaCompras
  const modal = document.getElementById('modalListaCompras');
  if (modal) {
    modal.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', closeShoppingListModal);
    });
  }

  // Fechamento com a tecla Esc
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const m = document.getElementById('modalListaCompras');
      if (m && m.classList.contains('open')) {
        closeShoppingListModal();
      }
    }
  });
}
