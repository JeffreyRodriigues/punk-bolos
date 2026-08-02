/* ============================================================
   STORAGE.JS — Camada de dados
   ------------------------------------------------------------
   Ponto único de acesso aos dados. Os módulos continuam lendo de
   forma SÍNCRONA (cache em memória); a persistência é transparente:

   - ONLINE (Supabase configurado): os dados são sincronizados com
     a nuvem. As escritas em lote (save/saveProducts) são aplicadas
     ao cache na hora e enviadas ao banco de forma diferencial
     (só cria/atualiza/exclui o que mudou).
   - OFFLINE (sem configuração): fallback para o LocalStorage
     (comportamento original).

   init() carrega os dados da nuvem ao abrir o app. Na primeira
   execução com o Supabase vazio, os dados antigos do LocalStorage
   são enviados automaticamente (migração única).
   ============================================================ */

import * as supabase from './supabase.js';

/** Chaves do LocalStorage (usadas offline e para a configuração). */
const PEDIDOS_KEY = 'punkbolos.pedidos';
const PRODUTOS_KEY = 'punkbolos.produtos';
const CONFIG_KEY = 'punkbolos.config';

/** Caches em memória (null = ainda não carregado). */
let ordersCache = null;
let productsCache = null;

/**
 * Snapshots do ÚLTIMO estado sincronizado com a nuvem.
 * A UI muta o cache ANTES de chamar save(), então a comparação
 * para saber o que inserir/atualizar/excluir é feita contra esses
 * snapshots (nunca contra o próprio cache, que já foi alterado).
 */
let ordersSynced = [];
let productsSynced = [];

/** true quando conectado ao Supabase (escritas vão para a nuvem). */
let online = false;

/** Callback de erros de sincronização (setado por app.js para exibir toast). */
let onError = null;

/**
 * Registra um callback para erros de sincronização com a nuvem.
 * @param {Function} cb - Função chamada com a mensagem de erro.
 */
export function setErrorHandler(cb) {
  onError = cb;
}

/** Reporta um erro de sincronização (não lança). */
function reportError(context, message) {
  if (typeof onError === 'function') {
    onError(`${context}: ${message}`);
  }
}

/* ---------- Configurações (tema, por dispositivo) ---------- */

/**
 * Lê a configuração do app (ex.: tema).
 * @returns {Object} Configuração atual.
 */
export function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Salva a configuração do app.
 * @param {Object} config - Objeto de configuração parcial.
 */
export function saveConfig(config) {
  const current = loadConfig();
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...current, ...config }));
}

/* ---------- Migração de formatos antigos ---------- */

/**
 * Converte um pedido de um formato antigo para o formato atual,
 * em que CADA ITEM carrega seu próprio produto (tipoProduto) e
 * tamanho (só para bolo). Pedidos já no formato atual passam
 * intactos.
 * @param {Object} order - Pedido bruto.
 * @returns {Object} Pedido normalizado.
 */
function migrateOrder(order) {
  if (!order || typeof order !== 'object') {
    return order;
  }

  const legacy = { ...order };
  const legacyType = legacy.tipoProduto || 'Fatia';
  const legacySize =
    legacy.tipoProduto === 'Bolo Inteiro' ? legacy.tamanho || '' : '';

  let items;
  if (Array.isArray(legacy.itens)) {
    items = legacy.itens.map((item) => {
      const type = item.tipoProduto || legacyType;
      return {
        tipoProduto: type,
        tamanho: item.tamanho != null ? item.tamanho : (type === 'Bolo Inteiro' ? legacySize : ''),
        sabor: item.sabor || '',
        quantidade: Number(item.quantidade) || 0,
        valorUnitario: Number(item.valorUnitario) || 0,
      };
    });
  } else {
    items = [
      {
        tipoProduto: legacyType,
        tamanho: legacyType === 'Bolo Inteiro' ? legacySize : '',
        sabor: legacy.sabor || '',
        quantidade: Number(legacy.quantidade) || 0,
        valorUnitario: Number(legacy.valorUnitario) || 0,
      },
    ];
  }

  delete legacy.sabor;
  delete legacy.valorUnitario;
  delete legacy.tipoProduto;
  delete legacy.tamanho;
  legacy.itens = items;
  return legacy;
}

/**
 * Converte um produto de um formato antigo para o formato atual.
 * Formato antigo: { nome, tipoProduto, tamanho, sabor, preco }
 * Formato atual:  { titulo, tipoProduto, tamanho, valor, detalhes }
 * @param {Object} product - Produto bruto.
 * @returns {Object} Produto normalizado.
 */
function migrateProduct(product) {
  if (!product || typeof product !== 'object') {
    return product;
  }
  if (product.titulo != null && product.valor != null) {
    return product;
  }
  const tipoProduto = ['Fatia', 'Punkitos', 'Bolo Inteiro'].includes(product.tipoProduto)
    ? product.tipoProduto
    : 'Fatia';
  const parts = [product.tamanho, product.sabor].filter(Boolean).join(' · ');
  return {
    id: product.id,
    titulo: String(product.nome != null ? product.nome : product.titulo || '').trim(),
    tipoProduto,
    tamanho: tipoProduto === 'Bolo Inteiro' ? String(product.tamanho || '').trim() : '',
    valor: Number(product.preco != null ? product.preco : product.valor) || 0,
    detalhes: String(product.detalhes != null ? product.detalhes : parts).trim(),
  };
}

/** Lê os pedidos do LocalStorage com migração automática. */
function readLocalOrders() {
  try {
    const raw = localStorage.getItem(PEDIDOS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(migrateOrder) : [];
  } catch {
    return [];
  }
}

/** Lê os produtos do LocalStorage com migração automática. */
function readLocalProducts() {
  try {
    const raw = localStorage.getItem(PRODUTOS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(migrateProduct) : [];
  } catch {
    return [];
  }
}

/* ---------- Mapeamento para o banco (snake_case) ---------- */

/** Pedido (app) → linha do banco. */
function toOrderRow(order) {
  return {
    id: order.id,
    numero: order.numero,
    data: order.data || null,
    cliente: order.cliente || '',
    contato: order.contato || '',
    itens: Array.isArray(order.itens) ? order.itens : [],
    quantidade: Number(order.quantidade) || 0,
    valor_total: Number(order.valorTotal) || 0,
    status: order.status || 'Pendente',
    pagamento: order.pagamento || 'PIX',
    entrega: order.entrega || 'Retirada',
    observacoes: order.observacoes || '',
  };
}

/** Linha do banco → pedido (app). */
function fromOrderRow(row) {
  return {
    id: row.id,
    numero: Number(row.numero) || 0,
    data: row.data || '',
    cliente: row.cliente || '',
    contato: row.contato || '',
    itens: Array.isArray(row.itens) ? row.itens : [],
    quantidade: Number(row.quantidade) || 0,
    valorTotal: Number(row.valor_total) || 0,
    status: row.status || 'Pendente',
    pagamento: row.pagamento || 'PIX',
    entrega: row.entrega || 'Retirada',
    observacoes: row.observacoes || '',
  };
}

/** Produto (app) → linha do banco. */
function toProductRow(product) {
  return {
    id: product.id,
    titulo: product.titulo || '',
    tipo_produto: product.tipoProduto || 'Fatia',
    tamanho: product.tamanho || '',
    valor: Number(product.valor) || 0,
    detalhes: product.detalhes || '',
  };
}

/** Linha do banco → produto (app). */
function fromProductRow(row) {
  return {
    id: row.id,
    titulo: row.titulo || '',
    tipoProduto: row.tipo_produto || 'Fatia',
    tamanho: row.tamanho || '',
    valor: Number(row.valor) || 0,
    detalhes: row.detalhes || '',
  };
}

/* ---------- Leitura síncrona (cache) ---------- */

/**
 * Lê todos os pedidos (cache ou LocalStorage no primeiro acesso).
 * @returns {Array<Object>} Lista de pedidos.
 */
export function getAll() {
  if (ordersCache === null) {
    ordersCache = readLocalOrders();
  }
  return ordersCache;
}

/**
 * Lê todos os produtos do catálogo.
 * @returns {Array<Object>} Lista de produtos.
 */
export function getAllProducts() {
  if (productsCache === null) {
    productsCache = readLocalProducts();
  }
  return productsCache;
}

/* ---------- Inicialização / sincronização ---------- */

/**
 * Carrega os dados da nuvem (Supabase). Se não houver configuração,
 * mantém o modo offline (LocalStorage). Na primeira execução online
 * com o banco vazio, envia os dados antigos do LocalStorage (migração).
 */
export async function init() {
  if (!supabase.isConfigured()) {
    getAll();
    getAllProducts();
    online = false;
    return;
  }

  try {
    const [remoteOrders, remoteProducts] = await Promise.all([
      supabase.listOrders(),
      supabase.listProducts(),
    ]);

    const localOrders = readLocalOrders();
    const localProducts = readLocalProducts();

    // Migração única: banco vazio + dados locais → envia para a nuvem
    if (
      remoteOrders.length === 0 &&
      remoteProducts.length === 0 &&
      (localOrders.length > 0 || localProducts.length > 0)
    ) {
      for (const order of localOrders) {
        await supabase.insertOrder(toOrderRow(order));
      }
      for (const product of localProducts) {
        await supabase.insertProduct(toProductRow(product));
      }
      const [o2, p2] = await Promise.all([
        supabase.listOrders(),
        supabase.listProducts(),
      ]);
      ordersCache = o2.map(fromOrderRow);
      productsCache = p2.map(fromProductRow);
    } else {
      ordersCache = remoteOrders.map(fromOrderRow);
      productsCache = remoteProducts.map(fromProductRow);
    }
    ordersSynced = JSON.parse(JSON.stringify(ordersCache));
    productsSynced = JSON.parse(JSON.stringify(productsCache));
    online = true;
  } catch (error) {
    if (error && error.message === 'Sessão expirada') {
      throw error; // o cliente já redirecionou para o login
    }
    // Falha de rede/API: segue com os dados locais
    reportError('Não foi possível carregar da nuvem', error && error.message ? error.message : 'sem conexão');
    getAll();
    getAllProducts();
    online = false;
  }
}

/* ---------- Escrita (diferencial quando online) ---------- */

/**
 * Persiste a lista de pedidos. Aplica ao cache na hora (UI imediata)
 * e, online, sincroniza no banco enviando apenas as diferenças.
 * @param {Array<Object>} orders - Nova lista de pedidos.
 */
export function save(orders) {
  ordersCache = orders;

  if (!online) {
    localStorage.setItem(PEDIDOS_KEY, JSON.stringify(orders));
    return;
  }
  diffOrders(ordersSynced, orders);
  ordersSynced = JSON.parse(JSON.stringify(orders));
}

/**
 * Persiste a lista de produtos (mesma lógica diferencial).
 * @param {Array<Object>} products - Nova lista de produtos.
 */
export function saveProducts(products) {
  productsCache = products;

  if (!online) {
    localStorage.setItem(PRODUTOS_KEY, JSON.stringify(products));
    return;
  }
  diffProducts(productsSynced, products);
  productsSynced = JSON.parse(JSON.stringify(products));
}

/** Envia ao banco os pedidos criados/alterados/removidos. */
function diffOrders(previous, next) {
  const byId = new Map(previous.map((order) => [order.id, order]));

  next.forEach((order) => {
    const old = byId.get(order.id);
    if (!old) {
      supabase.insertOrder(toOrderRow(order)).catch((e) => reportError('Falha ao criar pedido', e.message));
    } else if (JSON.stringify(old) !== JSON.stringify(order)) {
      supabase.updateOrder(order.id, toOrderRow(order)).catch((e) => reportError('Falha ao atualizar pedido', e.message));
    }
    byId.delete(order.id);
  });

  byId.forEach((_, id) => supabase.deleteOrder(id).catch((e) => reportError('Falha ao excluir pedido', e.message)));
}

/** Envia ao banco os produtos criados/alterados/removidos. */
function diffProducts(previous, next) {
  const byId = new Map(previous.map((product) => [product.id, product]));

  next.forEach((product) => {
    const old = byId.get(product.id);
    if (!old) {
      supabase.insertProduct(toProductRow(product)).catch((e) => reportError('Falha ao criar produto', e.message));
    } else if (JSON.stringify(old) !== JSON.stringify(product)) {
      supabase.updateProduct(product.id, toProductRow(product)).catch((e) => reportError('Falha ao atualizar produto', e.message));
    }
    byId.delete(product.id);
  });

  byId.forEach((_, id) => supabase.deleteProduct(id).catch((e) => reportError('Falha ao excluir produto', e.message)));
}

/* ---------- Manutenção ---------- */

/**
 * Remove todos os dados do app (reset completo, inclusive nuvem é
 * re-sincronizada no próximo init). Usado em testes/manutenção.
 */
export function clearAll() {
  ordersCache = null;
  productsCache = null;
  ordersSynced = [];
  productsSynced = [];
  online = false;
  localStorage.removeItem(PEDIDOS_KEY);
  localStorage.removeItem(PRODUTOS_KEY);
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem('punkbolos.session');
}

/**
 * Zera apenas os caches em memória (usado em testes para simular
 * um novo carregamento).
 */
export function reset() {
  ordersCache = null;
  productsCache = null;
  ordersSynced = [];
  productsSynced = [];
  online = false;
}
