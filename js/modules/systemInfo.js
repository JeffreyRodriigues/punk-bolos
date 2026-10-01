/* ============================================================
   SYSTEMINFO.JS — Modal de Novidades e Versão do Sistema
   ------------------------------------------------------------
   Gerencia a abertura e fechamento do modal com o resumo de
   funcionalidades e melhorias do sistema (v2.4.0), bem como
   o badge/indicador de novidades não lidas.
   ============================================================ */

const CURRENT_VERSION = '2.4.0';
const STORAGE_KEY = 'punk_seen_version';

let modalEl = null;
let btnEl = null;
let dotEl = null;

export function init() {
  modalEl = document.getElementById('modalSystemInfo');
  btnEl = document.getElementById('btnSystemInfo');
  dotEl = document.getElementById('versionDot');

  if (!modalEl || !btnEl) return;

  // Verifica se o usuário já visualizou as novidades da versão atual
  const seenVersion = localStorage.getItem(STORAGE_KEY);
  if (seenVersion !== CURRENT_VERSION && dotEl) {
    dotEl.classList.add('has-unread');
  }

  // Abrir modal ao clicar no botão da versão
  btnEl.addEventListener('click', openModal);

  // Fechar modal ao clicar em botões/elementos com data-close-modal
  modalEl.querySelectorAll('[data-close-modal]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });

  // Fechar ao pressionar a tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalEl.classList.contains('open')) {
      closeModal();
    }
  });
}

export function openModal() {
  if (!modalEl) return;
  modalEl.classList.add('open');

  // Marca a versão como visualizada
  localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
  if (dotEl) {
    dotEl.classList.remove('has-unread');
  }
}

export function closeModal() {
  if (!modalEl) return;
  modalEl.classList.remove('open');
}
