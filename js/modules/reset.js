/* ============================================================
   RESET.JS — Página de nova senha (reset-password.html)
   ------------------------------------------------------------
   O usuário chega aqui pelo link do e-mail de recuperação do
   Supabase. O token (ou código PKCE) vem no hash da URL:
     #access_token=...&type=recovery   (fluxo implícito)
     #code=...&type=recovery           (fluxo PKCE)
   Este módulo valida o token, salva a nova senha no Supabase
   e volta para o login.
   ============================================================ */

import * as auth from './auth.js?v=13';
import * as theme from '../utils/theme.js?v=13';

const resetSection = document.getElementById('resetSection');
const statusSection = document.getElementById('statusSection');
const resetForm = document.getElementById('resetForm');
const resetError = document.getElementById('reset-error');
const statusMessage = document.getElementById('status-message');

/** Mostra apenas a seção indicada. */
function showSection(section) {
  resetSection.hidden = section !== resetSection;
  statusSection.hidden = section !== statusSection;
}

/** Indica se a URL contém um token/código de recuperação válido. */
function hasValidToken() {
  const params = new URLSearchParams(location.hash.replace(/^#/, ''));
  return Boolean(params.get('code') || params.get('access_token'));
}

/** Exibe uma mensagem de status (sucesso ou link inválido). */
function showStatus(text) {
  statusMessage.textContent = text;
  showSection(statusSection);
}

/**
 * Valida e salva a nova senha no Supabase.
 */
function handleSubmit(event) {
  event.preventDefault();

  const senha = document.getElementById('reset-senha').value;
  const confirma = document.getElementById('reset-confirma').value;
  resetError.textContent = '';

  if (senha.length < 6) {
    resetError.textContent = 'A senha deve ter pelo menos 6 caracteres.';
    return;
  }
  if (senha !== confirma) {
    resetError.textContent = 'As senhas não conferem.';
    return;
  }

  const btn = resetForm.querySelector('.login-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Salvando...';

  auth.resetPassword(location.hash, senha).then(() => {
    // Remove os tokens da URL (segurança) antes de mostrar o sucesso
    history.replaceState(null, '', 'reset-password.html');
    showStatus('Senha atualizada com sucesso! Você será redirecionado para o login.');
    setTimeout(() => { location.replace('login.html'); }, 2500);
  }).catch((err) => {
    resetError.textContent = err && err.message
      ? err.message
      : 'Não foi possível definir a senha. O link pode ter expirado.';
  }).finally(() => {
    btn.disabled = false;
    btn.textContent = original;
  });
}

/* ---------- Eventos ---------- */

resetForm.addEventListener('submit', handleSubmit);
document.getElementById('goLoginBtn').addEventListener('click', () => {
  location.replace('login.html');
});

/* ---------- Inicialização ---------- */

theme.initTheme();
if (hasValidToken()) {
  showSection(resetSection);
  setTimeout(() => document.getElementById('reset-senha').focus(), 100);
} else {
  showStatus('Link de recuperação inválido ou expirado. Solicite um novo link na tela de login.');
}
