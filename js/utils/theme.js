/* ============================================================
   THEME.JS — Controle do tema (Dark / Light)
   ------------------------------------------------------------
   Aplica o tema ao adicionar/remover a classe "dark" no <html>
   e persiste a preferência no LocalStorage via storage.saveConfig.
   Por padrão, segue a preferência do sistema operacional.
   ============================================================ */

import * as storage from '../modules/storage.js';

/** Classe CSS que ativa o tema escuro (definida em themes.css). */
const DARK_CLASS = 'dark';

/** Preferência do usuário (ou null = seguir o sistema). */
let currentTheme = null;

/**
 * Aplica um tema específico ("dark" | "light").
 * @param {string} theme - "dark" ou "light".
 */
export function setTheme(theme) {
  currentTheme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle(DARK_CLASS, currentTheme === 'dark');
  storage.saveConfig({ theme: currentTheme });
  updateToggleIcon(currentTheme);
}

/**
 * Alterna entre dark e light.
 * @returns {string} O novo tema ativo.
 */
export function toggleTheme() {
  const next = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/**
 * Inicializa o tema: lê a preferência salva; se não houver,
 * usa a preferência do sistema operacional.
 */
export function initTheme() {
  const saved = storage.loadConfig().theme;
  if (saved === 'dark' || saved === 'light') {
    setTheme(saved);
    return;
  }
  // Sem preferência salva: segue o sistema operacional
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(prefersDark ? 'dark' : 'light');
}

/**
 * Atualiza o ícone do botão de tema.
 * @param {string} theme - Tema ativo.
 */
function updateToggleIcon(theme) {
  const icon = document.querySelector('.theme-toggle-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}
