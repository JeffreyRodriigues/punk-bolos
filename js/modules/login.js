/* ============================================================
   LOGIN.JS — Página de acesso (login.html)
   ------------------------------------------------------------
   Login com e-mail/senha dos administradores (contas criadas no
   painel do Supabase). Em caso de sucesso, redireciona para
   index.html. Inclui o fluxo "Esqueci minha senha", que envia
   um link de recuperação por e-mail (Supabase Auth).
   ============================================================ */

import * as auth from './auth.js?v=13';
import * as supabase from './supabase.js?v=14';
import * as theme from '../utils/theme.js?v=13';

const loginSection = document.getElementById('loginSection');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('login-error');
const recoverSection = document.getElementById('recoverSection');
const recoverForm = document.getElementById('recoverForm');
const recoverEmail = document.getElementById('recover-email');
const recoverError = document.getElementById('recover-error');
const recoverSuccess = document.getElementById('recover-success');

/**
 * Configura a tela: mostra o formulário e avisa se o Supabase
 * ainda não foi configurado.
 */
function render() {
  if (!supabase.isConfigured()) {
    loginError.textContent =
      'Acesso ainda não configurado. Defina SUPABASE_URL e SUPABASE_ANON_KEY no arquivo .env (local) ou nas variáveis de ambiente (Render).';
    loginForm.hidden = true;
    document.getElementById('forgotLink').hidden = true;
  } else {
    loginError.textContent = '';
    loginForm.hidden = false;
  }
  loginSection.hidden = false;
  recoverSection.hidden = true;
  setTimeout(() => document.getElementById('login-email').focus(), 100);
}

/**
 * Alterna entre a seção de login e a de recuperação de senha.
 * @param {HTMLElement} target - Seção a mostrar.
 */
function showSection(target) {
  loginSection.hidden = target !== loginSection;
  recoverSection.hidden = target !== recoverSection;
  loginError.textContent = '';
  recoverError.textContent = '';
  recoverSuccess.textContent = '';
  const focusId = target === recoverSection ? 'recover-email' : 'login-email';
  setTimeout(() => document.getElementById(focusId).focus(), 100);
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

/**
 * Envia o link de recuperação de senha para o e-mail informado.
 */
function handleRecoverSubmit(event) {
  event.preventDefault();

  const email = recoverEmail.value;
  recoverError.textContent = '';
  recoverSuccess.textContent = '';

  if (!email.trim()) {
    recoverError.textContent = 'Informe seu e-mail.';
    return;
  }

  const btn = recoverForm.querySelector('.login-btn');
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  auth.sendRecovery(email).then(() => {
    // Mensagem genérica: não revela se o e-mail existe no sistema
    recoverSuccess.textContent =
      'Se o e-mail existir no sistema, você receberá um link para redefinir sua senha.';
    recoverEmail.value = '';
  }).catch((err) => {
    recoverError.textContent = err && err.message
      ? err.message
      : 'Não foi possível enviar o link. Tente novamente.';
  }).finally(() => {
    btn.disabled = false;
    btn.textContent = original;
  });
}

/* ---------- Eventos ---------- */

loginForm.addEventListener('submit', handleLoginSubmit);
recoverForm.addEventListener('submit', handleRecoverSubmit);
document.getElementById('forgotLink').addEventListener('click', () => showSection(recoverSection));
document.getElementById('backLink').addEventListener('click', () => showSection(loginSection));

/* ---------- Inicialização ---------- */

theme.initTheme();
render();
