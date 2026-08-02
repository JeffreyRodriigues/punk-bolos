/* ============================================================
   AUTH.JS — Autenticação (Supabase Auth, e-mail/senha)
   ------------------------------------------------------------
   Os 3 administradores são criados no painel do Supabase
   (Authentication → Users). Este módulo apenas:
   - login(email, senha): valida no Supabase e salva a sessão
   - logout(): encerra a sessão
   - isAuthenticated(): há sessão válida neste dispositivo?

   A sessão fica no LocalStorage ("punkbolos.session"); se o token
   expirar durante o uso, o cliente Supabase limpa a sessão e volta
   para o login.
   ============================================================ */

import * as supabase from './supabase.js?v=12';

/**
 * Indica se há sessão ativa neste dispositivo.
 * @returns {boolean} true se o usuário está logado.
 */
export function isAuthenticated() {
  const session = supabase.loadSession();
  return Boolean(session && session.access_token);
}

/**
 * Entra no sistema com e-mail e senha.
 * @param {string} email - E-mail do admin (criado no Supabase).
 * @param {string} senha - Senha.
 * @returns {Promise<boolean>} true se o login foi bem-sucedido.
 */
export async function login(email, senha) {
  try {
    await supabase.signIn(String(email).trim(), senha);
    return true;
  } catch (error) {
    if (error && error.message === 'Sessão expirada') {
      throw error;
    }
    return false;
  }
}

/**
 * Encerra a sessão atual (exige novo login).
 */
export function logout() {
  supabase.signOut();
}

/**
 * Envia o e-mail de recuperação de senha.
 * @param {string} email - E-mail do admin.
 * @returns {Promise<void>}
 */
export async function sendRecovery(email) {
  await supabase.sendRecoveryEmail(
    String(email).trim(),
    `${window.location.origin}/reset-password.html`
  );
}

/**
 * Define uma nova senha a partir do link de recuperação do e-mail.
 * @param {string} urlHash - Hash da URL (ex.: "#access_token=..." ou "#code=...").
 * @param {string} newPassword - Nova senha.
 * @returns {Promise<Object>} Resultado com { accessToken, email }.
 */
export async function resetPassword(urlHash, newPassword) {
  const params = new URLSearchParams(urlHash.startsWith('#') ? urlHash.slice(1) : urlHash);
  const code = params.get('code');
  let accessToken = params.get('access_token');

  if (!accessToken && code) {
    // Fluxo PKCE: troca o código por uma sessão válida
    const session = await supabase.exchangeRecoveryCode(code);
    accessToken = session.access_token;
  }

  if (!accessToken) {
    throw new Error('Link de recuperação inválido ou expirado.');
  }

  await supabase.updatePassword(accessToken, newPassword);
  return {
    accessToken,
    email: (params.get('email') || '').replace(/\+/g, ' '),
  };
}
