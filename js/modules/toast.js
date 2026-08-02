/* ============================================================
   TOAST.JS — Notificações leves (toasts)
   ------------------------------------------------------------
   Exibe mensagens temporárias no rodapé da tela.
   Usado por app.js e orderList.js (que hoje possui lógica
   própria de toast — aqui fica a versão reutilizável).
   ============================================================ */

const CONTAINER_ID = 'toastContainer';
const DURATION_MS = 2500;

/**
 * Exibe um toast na tela.
 * @param {string} message - Mensagem a exibir.
 * @param {string} [type] - "success" | "error" (padrão "success").
 */
export function showToast(message, type = 'success') {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  // Anima a entrada no próximo frame
  requestAnimationFrame(() => toast.classList.add('show'));

  // Remove após o tempo definido
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, DURATION_MS);
}
