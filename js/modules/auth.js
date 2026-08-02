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

import * as supabase from './supabase.js';

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
