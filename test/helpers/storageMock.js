import { beforeEach, after } from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = process.cwd();
const storageSpec = pathToFileURL(path.join(ROOT, 'js/modules/storage.js')).href + '?v=13';

/** Stub mínimo de localStorage (global para o test runner). */
export function installLocalStorage() {
  if (typeof globalThis.localStorage !== 'undefined') {
    return;
  }
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    _store: store,
  };
}

/**
 * Semeia o localStorage com o estado do "banco" dos testes
 * e zera o cache do storage.js (módulo real).
 */
export async function setDb({ orders = [], products = [], productions = [] } = {}) {
  installLocalStorage();
  localStorage.clear();
  localStorage.setItem('punkbolos.pedidos', JSON.stringify(orders));
  localStorage.setItem('punkbolos.produtos', JSON.stringify(products));
  localStorage.setItem('punkbolos.producao', JSON.stringify(productions));
  const storage = await import(storageSpec);
  storage.reset();
}

/** Registra o reset do storage entre os testes do arquivo. */
export function resetStorageBetweenTests() {
  beforeEach(async () => {
    const storage = await import(storageSpec);
    storage.reset();
  });
  after(() => {
    globalThis.localStorage?._store?.clear();
  });
}