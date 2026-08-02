/* ============================================================
   LOGIN.JS — Página de acesso (login.html)
   ------------------------------------------------------------
   Login com e-mail/senha dos administradores (contas criadas no
   painel do Supabase). Em caso de sucesso, redireciona para
   index.html.
   ============================================================ */

import * as auth from './auth.js';
import * as supabase from './supabase.js';
import * as theme from '../utils/theme.js';

const loginSection = document.getElementById('loginSection');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('login-error');

/**
 * Configura a tela: mostra o formulário e avisa se o Supabase
 * ainda não foi configurado.
 */
function render() {
  if (!supabase.isConfigured()) {
    loginError.textContent =
      'Acesso ainda não configurado. Preencha o Supabase em js/config.js.';
    loginForm.hidden = true;
  } else {
    loginError.textContent = '';
    loginForm.hidden = false;
  }
  loginSection.hidden = false;
  setTimeout(() => document.getElementById('login-email').focus(), 100);
}

/**
 * Valida e-mail/senha e entra no sistema.
 */
function handleLoginSubmit(event) {
  event.preventDefault();

  const email = document.getElementById('login-email').value;
  const senha = document.getElementById('login-senha').value;
  loginError.textContent = '';

  if (!email.trim()) {
    loginError.textContent = 'Informe seu e-mail.';
    return;
  }

  auth.login(email, senha).then((ok) => {
    if (ok) {
      location.href = 'index.html';
    } else {
      loginError.textContent = 'E-mail ou senha incorretos.';
    }
  }).catch(() => {
    loginError.textContent = 'E-mail ou senha incorretos.';
  });
}

/* ---------- Eventos ---------- */

loginForm.addEventListener('submit', handleLoginSubmit);

/* ---------- Inicialização ---------- */

theme.initTheme();
render();
