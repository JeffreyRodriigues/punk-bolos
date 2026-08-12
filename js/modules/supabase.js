/* ============================================================
   SUPABASE.JS — Cliente REST do Supabase (via fetch)
   ------------------------------------------------------------
   Conecta o app ao Supabase sem dependências externas:
   - Auth REST: /auth/v1/token (login por e-mail/senha)
   - Data REST: /rest/v1/{products|orders}
   - Sessão guardada no LocalStorage ("punkbolos.session").
   - Em caso de 401 (token expirado), limpa a sessão e volta ao login.

   Toda chamada de dados usa o token do usuário logado; as regras
   de segurança (Row Level Security) do banco garantem que só
   usuários autenticados leem/escrevem.
   ============================================================ */

import { CONFIG } from '../config.js?v=12';

/** Chave da sessão no LocalStorage. */
const SESSION_KEY = 'punkbolos.session';

/**
 * URL base do projeto (sem barra final).
 * @returns {string} URL do Supabase.
 */
function baseUrl() {
  return (CONFIG.supabaseUrl || '').replace(/\/+$/, '');
}

/**
 * Indica se a configuração do Supabase foi preenchida.
 * @returns {boolean} true quando URL e anon key existem.
 */
export function isConfigured() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}

/* ---------- Sessão ---------- */

/**
 * Lê a sessão salva (token de acesso).
 * @returns {Object|null} Sessão ({ access_token, ... }) ou null.
 */
export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persiste a sessão no LocalStorage.
 * @param {Object} session - { access_token, refresh_token, expires_at, email }.
 */
function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/**
 * Remove a sessão (logout ou sessão expirada).
 */
export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** Token de acesso atual (ou null). */
function accessToken() {
  const session = loadSession();
  return session && session.access_token ? session.access_token : null;
}

/* ---------- Requisições ---------- */

/**
 * Executa uma requisição para a API REST do Supabase.
 * Lança erro com a mensagem da API em caso de falha.
 * @param {string} path - Caminho (ex.: "/rest/v1/orders?select=*").
 * @param {Object} [opts] - { method, body, auth, headers }.
 * @returns {Promise<Object|null>} JSON da resposta (ou null se 204).
 */
async function request(path, { method = 'GET', body, auth = false, headers: extraHeaders = {} } = {}) {
  const headers = { apikey: CONFIG.supabaseAnonKey };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth) {
    const token = accessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  Object.assign(headers, extraHeaders);

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth) {
    // Sessão expirada/inválida: encerra e volta para o login
    clearSession();
    if (typeof window !== 'undefined' && window.location) {
      window.location.replace('login.html');
    }
    throw new Error('Sessão expirada');
  }

  if (!res.ok) {
    let message = `Erro na requisição (${res.status})`;
    try {
      const data = await res.json();
      message = data.msg || data.message || data.error_description || message;
    } catch {
      // resposta sem JSON: mantém a mensagem padrão
    }
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  if (res.status === 204) {
    return null;
  }
  return res.json();
}

/* ---------- Autenticação ---------- */

/**
 * Entra com e-mail e senha (Supabase Auth).
 * @param {string} email - E-mail do admin.
 * @param {string} password - Senha.
 * @returns {Promise<Object>} Usuário autenticado.
 */
export async function signIn(email, password) {
  const data = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  saveSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    email: (data.user && data.user.email) || email,
  });
  return (data.user || { email });
}

/**
 * Encerra a sessão no Supabase e limpa o LocalStorage.
 */
export async function signOut() {
  const token = accessToken();
  clearSession();
  if (!token || !isConfigured()) {
    return;
  }
  try {
    await fetch(`${baseUrl()}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: CONFIG.supabaseAnonKey,
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // falha no logout remoto não impede o logout local
  }
}

/* ---------- Recuperação de senha (esqueci minha senha) ---------- */

/** Chave do code_verifier do fluxo PKCE no LocalStorage. */
const RECOVERY_VERIFIER_KEY = 'punkbolos.recovery.verifier';

/** Codifica bytes em Base64URL (seguro para PKCE). */
function base64url(bytes) {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Gera um code_verifier aleatório (padrão PKCE). */
function createCodeVerifier() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** Gera o code_challenge (S256) a partir do code_verifier. */
async function createCodeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/**
 * Envia o e-mail de recuperação de senha (Supabase Auth).
 * O link do e-mail leva a reset-password.html com um token/código.
 * @param {string} email - E-mail do administrador.
 * @param {string} redirectTo - URL da página de troca de senha.
 */
export async function sendRecoveryEmail(email, redirectTo) {
  let challenge;
  let verifier = null;
  try {
    verifier = createCodeVerifier();
    challenge = await createCodeChallenge(verifier);
  } catch {
    challenge = null; // contexto sem WebCrypto: cai no fluxo implícito
  }

  if (challenge) {
    localStorage.setItem(RECOVERY_VERIFIER_KEY, verifier);
  } else {
    localStorage.removeItem(RECOVERY_VERIFIER_KEY);
  }

  const body = {
    email,
    options: { redirect_to: redirectTo },
  };
  if (challenge) {
    body.code_challenge = challenge;
    body.code_challenge_method = 's256';
  }

  return request('/auth/v1/recover', { method: 'POST', body });
}

/**
 * Troca o código de recuperação (fluxo PKCE) por uma sessão válida.
 * @param {string} code - Código que veio na URL do e-mail.
 * @returns {Promise<Object>} Sessão ({ access_token, ... }).
 */
export async function exchangeRecoveryCode(code) {
  const verifier = localStorage.getItem(RECOVERY_VERIFIER_KEY);
  const data = await request('/auth/v1/token?grant_type=pkce', {
    method: 'POST',
    body: { auth_code: code, code_verifier: verifier || '' },
  });
  localStorage.removeItem(RECOVERY_VERIFIER_KEY);
  return data;
}

/**
 * Define uma nova senha usando um token de recuperação válido.
 * @param {string} accessToken - Token de acesso (da URL do e-mail).
 * @param {string} newPassword - Nova senha.
 */
export async function updatePassword(accessToken, newPassword) {
  return request('/auth/v1/user', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { password: newPassword },
  });
}

/* ---------- Pedidos (orders) ---------- */

/** Lista todos os pedidos (linhas cruas do banco). */
export async function listOrders() {
  return request('/rest/v1/orders?select=*', { auth: true });
}

/** Insere um pedido. @param {Object} row - Linha com colunas snake_case. */
export async function insertOrder(row) {
  return request('/rest/v1/orders', {
    method: 'POST',
    auth: true,
    headers: { Prefer: 'return=representation' },
    body: row,
  });
}

/** Atualiza um pedido pelo id. */
export async function updateOrder(id, row) {
  return request(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body: row,
  });
}

/** Exclui um pedido pelo id. */
export async function deleteOrder(id) {
  return request(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: true,
  });
}

/* ---------- Produtos (products) ---------- */

/** Lista todos os produtos (linhas cruas do banco). */
export async function listProducts() {
  return request('/rest/v1/products?select=*', { auth: true });
}

/** Insere um produto. */
export async function insertProduct(row) {
  return request('/rest/v1/products', {
    method: 'POST',
    auth: true,
    headers: { Prefer: 'return=representation' },
    body: row,
  });
}

/** Atualiza um produto pelo id. */
export async function updateProduct(id, row) {
  return request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body: row,
  });
}

/** Exclui um produto pelo id. */
export async function deleteProduct(id) {
  return request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: true,
  });
}

/* ---------- Produções (productions) ---------- */

/** Lista todas as produções (linhas cruas do banco). */
export async function listProductions() {
  return request('/rest/v1/productions?select=*', { auth: true });
}

/** Insere uma produção. @param {Object} row - Linha com colunas snake_case. */
export async function insertProduction(row) {
  return request('/rest/v1/productions', {
    method: 'POST',
    auth: true,
    headers: { Prefer: 'return=representation' },
    body: row,
  });
}

/** Atualiza uma produção pelo id. */
export async function updateProduction(id, row) {
  return request(`/rest/v1/productions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body: row,
  });
}

/** Exclui uma produção pelo id. */
export async function deleteProduction(id) {
  return request(`/rest/v1/productions?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: true,
  });
}

/* ---------- Insumos (inventário) ---------- */

/** Lista todos os insumos (linhas cruas do banco). */
export async function listInsumos() {
  return request('/rest/v1/insumos?select=*', { auth: true });
}

/** Insere um insumo. @param {Object} row - Linha com colunas snake_case. */
export async function insertInsumo(row) {
  return request('/rest/v1/insumos', {
    method: 'POST',
    auth: true,
    headers: { Prefer: 'return=representation' },
    body: row,
  });
}

/** Atualiza um insumo pelo id. */
export async function updateInsumo(id, row) {
  return request(`/rest/v1/insumos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: true,
    body: row,
  });
}

/** Exclui um insumo pelo id. */
export async function deleteInsumo(id) {
  return request(`/rest/v1/insumos?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: true,
  });
}
