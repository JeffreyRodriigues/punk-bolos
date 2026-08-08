/* ============================================================
   DATEFILTER.JS — Filtro por período de datas (compartilhado)
   ------------------------------------------------------------
   Usado pelo dashboard (Início) e pela lista de pedidos.
   - presets rápidos: Hoje, Ontem, 7 dias, 30 dias, Este mês, Mês passado, Personalizado, Todos
   - faixa livre: De / Até (input type="date")
   - estado persistido em "punkbolos.config" (campo "periodo")
   - qualquer mudança notifica os assinantes (dashboard/lista)

   A lógica pura (cálculo dos presets e filtro por faixa) vive em
   js/utils/dateRange.js (testável sem DOM); aqui fica só o binding.
   ============================================================ */

import * as storage from './storage.js?v=13';
import { presetRange as computePresetRange, filterByRange as pureFilter } from '../utils/dateRange.js';

/* ---------- Elementos do DOM ---------- */
const inicioEl = document.getElementById('filter-inicio');
const fimEl = document.getElementById('filter-fim');
const presetButtons = document.querySelectorAll('[data-preset]');

/** Estado atual da faixa selecionada. */
let range = { from: '', to: '' };

/** Assinantes notificados a cada mudança de período. */
const subscribers = [];

/** Calcula a faixa de cada preset (delega para o módulo puro). */
function presetRange(name) {
  if (name === 'personalizado') {
    // Faixa livre: reflete o que está nos campos De/Até
    return { from: inicioEl.value || '', to: fimEl.value || '' };
  }
  return computePresetRange(name);
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
  return pureFilter(orders, range);
}