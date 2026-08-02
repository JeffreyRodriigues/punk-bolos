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

import { CONFIG } from '../config.js';

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
