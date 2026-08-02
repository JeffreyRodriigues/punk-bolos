/* ============================================================
   DATEFILTER.JS — Filtro por período de datas (compartilhado)
   ------------------------------------------------------------
   Usado pelo dashboard (Início) e pela lista de pedidos.
   - presets rápidos: Hoje, Ontem, 7 dias, 30 dias, Este mês, Mês passado, Personalizado, Todos
   - faixa livre: De / Até (input type="date")
   - estado persistido em "punkbolos.config" (campo "periodo")
   - qualquer mudança notifica os assinantes (dashboard/lista)
   ============================================================ */

import * as storage from './storage.js?v=12';

/* ---------- Elementos do DOM ---------- */
const inicioEl = document.getElementById('filter-inicio');
const fimEl = document.getElementById('filter-fim');
const presetButtons = document.querySelectorAll('[data-preset]');

/** Estado atual da faixa selecionada. */
let range = { from: '', to: '' };

/** Assinantes notificados a cada mudança de período. */
const subscribers = [];

/**
 * Data de hoje no formato ISO (YYYY-MM-DD), no fuso local.
 * @returns {string} Ex.: "2026-08-01".
 */
function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Converte uma Date para ISO local (YYYY-MM-DD).
 * @param {Date} date - Data.
 * @returns {string} Data ISO local.
 */
function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Calcula a faixa de cada preset rápido.
 * @param {string} name - Nome do preset.
 * @returns {{ from: string, to: string }}
 */
function presetRange(name) {
  const today = todayISO();
  const now = new Date();
  switch (name) {
    case 'hoje':
      return { from: today, to: today };
    case 'ontem': {
      const from = new Date(now);
      from.setDate(from.getDate() - 1);
      const yesterday = toISO(from);
      return { from: yesterday, to: yesterday };
    }
    case '7dias': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      return { from: toISO(from), to: today };
    }
    case '30dias': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      return { from: toISO(from), to: today };
    }
    case 'mes': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: toISO(from), to: today };
    }
    case 'mespassado': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toISO(first), to: toISO(last) };
    }
    case 'personalizado':
      // Faixa livre: reflete o que está nos campos De/Até
      return { from: inicioEl.value || '', to: fimEl.value || '' };
    default:
      // "tudo": faixa vazia
      return { from: '', to: '' };
  }
}

/**
 * Atualiza o estado e sincroniza a interface (inputs + presets ativos).
 * @param {string} from - Data inicial (YYYY-MM-DD) ou vazia.
 * @param {string} to - Data final (YYYY-MM-DD) ou vazia.
 */
function setRange(from, to) {
  range = { from: from || '', to: to || '' };
  inicioEl.value = range.from;
  fimEl.value = range.to;
  storage.saveConfig({ periodo: range });
  syncPresetActive();
  emit();
}

/**
 * Marca o botão do preset cuja faixa coincide com a seleção atual.
 * O botão "Personalizado" fica ativo quando a faixa não corresponde
 * a nenhum preset nomeado (ex.: datas escolhidas manualmente).
 */
function syncPresetActive() {
  let matched = false;
  presetButtons.forEach((btn) => {
    if (btn.dataset.preset === 'personalizado') {
      btn.classList.remove('active');
      return;
    }
    const preset = presetRange(btn.dataset.preset);
    const isActive = preset.from === range.from && preset.to === range.to;
    btn.classList.toggle('active', isActive);
    if (isActive) {
      matched = true;
    }
  });

  const customBtn = [...presetButtons].find((btn) => btn.dataset.preset === 'personalizado');
  if (customBtn) {
    const isCustom = !matched && (range.from !== '' || range.to !== '');
    customBtn.classList.toggle('active', isCustom);
  }
}

/**
 * Notifica todos os assinantes.
 */
function emit() {
  subscribers.forEach((cb) => cb(range));
}

/**
 * Inicializa o filtro: carrega período salvo e liga os eventos.
 * Deve ser chamado uma vez pelo app.js.
 */
export function init() {
  const saved = (storage.loadConfig() || {}).periodo || {};
  range = {
    from: saved.from || '',
    to: saved.to || '',
  };
  inicioEl.value = range.from;
  fimEl.value = range.to;

  inicioEl.addEventListener('change', () => setRange(inicioEl.value, fimEl.value));
  fimEl.addEventListener('change', () => setRange(inicioEl.value, fimEl.value));

  presetButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.preset === 'personalizado') {
        // Abre a escolha livre colocando o foco no campo "De"
        inicioEl.focus();
        return;
      }
      const p = presetRange(btn.dataset.preset);
      setRange(p.from, p.to);
    });
  });

  syncPresetActive();
}

/**
 * Retorna a faixa de datas selecionada.
 * @returns {{ from: string, to: string }}
 */
export function getRange() {
  return { ...range };
}

/**
 * Registra um callback chamado quando o período muda.
 * @param {Function} cb - Recebe o novo range ({ from, to }).
 */
export function subscribe(cb) {
  subscribers.push(cb);
}

/**
 * Filtra uma lista de pedidos pela faixa de datas selecionada.
 * Sem faixa definida, devolve a lista intacta.
 * @param {Array<Object>} orders - Pedidos (campo "data" ISO).
 * @returns {Array<Object>} Pedidos dentro do período.
 */
export function applyFilter(orders) {
  if (!range.from && !range.to) {
    return orders;
  }
  return (orders || []).filter((order) => {
    const d = order.data || '';
    if (range.from && d < range.from) return false;
    if (range.to && d > range.to) return false;
    return true;
  });
}
