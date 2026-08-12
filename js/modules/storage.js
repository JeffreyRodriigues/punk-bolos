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

import * as supabase from './supabase.js?v=13';

/** Chaves do LocalStorage (usadas offline e para a configuração). */
const PEDIDOS_KEY = 'punkbolos.pedidos';
const PRODUTOS_KEY = 'punkbolos.produtos';
const PRODUCOES_KEY = 'punkbolos.producao';
const INSUMOS_KEY = 'punkbolos.insumos';
const PRECIFICACOES_KEY = 'punkbolos.precificacoes';
const BASES_KEY = 'punkbolos.bases';
const CONFIG_KEY = 'punkbolos.config';

/** Caches em memória (null = ainda não carregado). */
let ordersCache = null;
let productsCache = null;
let productionsCache = null;
let insumosCache = null;
let precificacoesCache = null;
let basesCache = null;

/**
 * Snapshots do ÚLTIMO estado sincronizado com a nuvem.
 * A UI muta o cache ANTES de chamar save(), então a comparação
 * para saber o que inserir/atualizar/excluir é feita contra esses
 * snapshots (nunca contra o próprio cache, que já foi alterado).
 */
let ordersSynced = [];
let productsSynced = [];
let productionsSynced = [];
let insumosSynced = [];
let precificacoesSynced = [];

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
        produtoId: item.produtoId ? String(item.produtoId) : '',
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
        produtoId: legacy.produtoId ? String(legacy.produtoId) : '',
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
  // Pedidos antigos/históricos não consomem estoque (recurso novo).
  if (legacy.consomeEstoque == null) {
    legacy.consomeEstoque = false;
  }
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
    controlaEstoque: Boolean(product.controlaEstoque),
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

/** Normaliza uma produção carregada (guarda contra formatos antigos). */
function normalizeProduction(production) {
  if (!production || typeof production !== 'object') {
    return production;
  }
  return {
    id: production.id,
    produtoId: String(production.produtoId || ''),
    quantidade: Number(production.quantidade) || 0,
    data: production.data || '',
    observacao: String(production.observacao || '').trim(),
  };
}

/** Lê as produções do LocalStorage. */
function readLocalProductions() {
  try {
    const raw = localStorage.getItem(PRODUCOES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeProduction) : [];
  } catch {
    return [];
  }
}

/** Normaliza um insumo carregado (guarda contra formatos antigos). */
function normalizeInsumo(insumo) {
  if (!insumo || typeof insumo !== 'object') {
    return insumo;
  }
  return {
    id: insumo.id,
    nome: String(insumo.nome || '').trim(),
    unidade: String(insumo.unidade || 'unidade').trim(),
    descricao: String(insumo.descricao || '').trim(),
    compras: Array.isArray(insumo.compras)
      ? insumo.compras.map((c) => ({
          id: c.id,
          data: c.data || '',
          custoTotal: Number(c.custoTotal) || 0,
          quantidadeCompra: Number(c.quantidadeCompra) || 0,
        }))
      : [],
  };
}

/** Lê os insumos do LocalStorage. */
function readLocalInsumos() {
  try {
    const raw = localStorage.getItem(INSUMOS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeInsumo) : [];
  } catch {
    return [];
  }
}

/** Normaliza uma precificação carregada (guarda contra formatos antigos). */
function normalizePrecificacao(receita) {
  if (!receita || typeof receita !== 'object') {
    return receita;
  }
  return {
    id: receita.id,
    produtoId: String(receita.produtoId || '').trim(),
    itens: Array.isArray(receita.itens)
      ? receita.itens.map((i) => ({
          insumoId: String(i.insumoId || '').trim(),
          baseId: String(i.baseId || '').trim(),
          quantidade: Number(i.quantidade) || 0,
        }))
      : [],
    margem: Number(receita.margem) || 0,
    multiplicador: Number(receita.multiplicador) || 0,
    rendimento: Number(receita.rendimento) || 0,
    embalagem: Number(receita.embalagem) || 0,
    custoAdicional: Number(receita.custoAdicional) || 0,
    custoAdicionalObs: String(receita.custoAdicionalObs || '').trim(),
    dataCalculo: receita.dataCalculo || '',
    custoIngredientes: Number(receita.custoIngredientes) || 0,
    custoPorUnidade: Number(receita.custoPorUnidade) || 0,
  };
}

/** Normaliza uma base carregada (guarda contra formatos antigos). */
function normalizeBase(base) {
  if (!base || typeof base !== 'object') {
    return base;
  }
  return {
    id: base.id,
    nome: String(base.nome || '').trim(),
    descricao: String(base.descricao || '').trim(),
    rendimento: Number(base.rendimento) || 0,
    rendimentoUnidade: String(base.rendimentoUnidade || 'un').trim(),
    componentes: Array.isArray(base.componentes)
      ? base.componentes.map((c) => ({
          insumoId: String(c.insumoId || ''),
          quantidade: Number(c.quantidade) || 0,
        }))
      : [],
  };
}

/** Lê as bases do LocalStorage. */
function readLocalBases() {
  try {
    const raw = localStorage.getItem(BASES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizeBase) : [];
  } catch {
    return [];
  }
}

/** Lê as precificações do LocalStorage. */
function readLocalPrecificacoes() {
  try {
    const raw = localStorage.getItem(PRECIFICACOES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map(normalizePrecificacao) : [];
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
    consome_estoque: Boolean(order.consomeEstoque),
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
    consomeEstoque: Boolean(row.consome_estoque),
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
    controla_estoque: Boolean(product.controlaEstoque),
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
    controlaEstoque: Boolean(row.controla_estoque),
  };
}

/** Produção (app) → linha do banco. */
function toProductionRow(production) {
  return {
    id: production.id,
    produto_id: production.produtoId || '',
    quantidade: Number(production.quantidade) || 0,
    data: production.data || null,
    observacao: production.observacao || '',
  };
}

/** Linha do banco → produção (app). */
function fromProductionRow(row) {
  return {
    id: row.id,
    produtoId: row.produto_id || '',
    quantidade: Number(row.quantidade) || 0,
    data: row.data || '',
    observacao: row.observacao || '',
  };
}

/** Insumo (app) → linha do banco (compras embutidas em JSONB). */
function toInsumoRow(insumo) {
  return {
    id: insumo.id,
    nome: insumo.nome || '',
    unidade: insumo.unidade || 'unidade',
    descricao: insumo.descricao || '',
    compras: Array.isArray(insumo.compras) ? insumo.compras : [],
  };
}

/** Linha do banco → insumo (app). */
function fromInsumoRow(row) {
  return {
    id: row.id,
    nome: row.nome || '',
    unidade: row.unidade || 'unidade',
    descricao: row.descricao || '',
    compras: Array.isArray(row.compras) ? row.compras : [],
  };
}

/** Precificação (app) → linha do banco (itens embutidos em JSONB). */
function toPrecificacaoRow(receita) {
  return {
    id: receita.id,
    produto_id: receita.produtoId || '',
    itens: Array.isArray(receita.itens) ? receita.itens : [],
    margem: Number(receita.margem) || 0,
    multiplicador: Number(receita.multiplicador) || 0,
    rendimento: Number(receita.rendimento) || 0,
    embalagem: Number(receita.embalagem) || 0,
    custo_adicional: Number(receita.custoAdicional) || 0,
    custo_adicional_obs: receita.custoAdicionalObs || '',
    data_calculo: receita.dataCalculo || null,
    custo_ingredientes: Number(receita.custoIngredientes) || 0,
    custo_por_unidade: Number(receita.custoPorUnidade) || 0,
  };
}

/** Linha do banco → precificação (app). */
function fromPrecificacaoRow(row) {
  return {
    id: row.id,
    produtoId: row.produto_id || '',
    itens: Array.isArray(row.itens) ? row.itens : [],
    margem: Number(row.margem) || 0,
    multiplicador: Number(row.multiplicador) || 0,
    rendimento: Number(row.rendimento) || 0,
    embalagem: Number(row.embalagem) || 0,
    custoAdicional: Number(row.custo_adicional) || 0,
    custoAdicionalObs: row.custo_adicional_obs || '',
    dataCalculo: row.data_calculo || '',
    custoIngredientes: Number(row.custo_ingredientes) || 0,
    custoPorUnidade: Number(row.custo_por_unidade) || 0,
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

/**
 * Lê todas as produções (log de estoque).
 * @returns {Array<Object>} Lista de produções.
 */
export function getAllProductions() {
  if (productionsCache === null) {
    productionsCache = readLocalProductions();
  }
  return productionsCache;
}

/**
 * Lê todos os insumos (inventário).
 * @returns {Array<Object>} Lista de insumos.
 */
export function getAllInsumos() {
  if (insumosCache === null) {
    insumosCache = readLocalInsumos();
  }
  return insumosCache;
}

/**
 * Lê todas as precificações (receitas por produto).
 * @returns {Array<Object>} Lista de precificações.
 */
export function getAllPrecificacoes() {
  if (precificacoesCache === null) {
    precificacoesCache = readLocalPrecificacoes();
  }
  return precificacoesCache;
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
    const [remoteOrders, remoteProducts, remoteProductions, remoteInsumos, remotePrecificacoes] = await Promise.all([
      supabase.listOrders(),
      supabase.listProducts(),
      supabase.listProductions(),
      supabase.listInsumos(),
      supabase.listPrecificacoes(),
    ]);

    const localOrders = readLocalOrders();
    const localProducts = readLocalProducts();
    const localProductions = readLocalProductions();
    const localInsumos = readLocalInsumos();
    const localPrecificacoes = readLocalPrecificacoes();

    // Reconciliação: envia para a nuvem o que existe apenas no
    // dispositivo (criado offline ou com escrita que falhou). Isso
    // garante que nenhum pedido/produto/produção/insumo se perca ao voltar online.
    const remoteOrderIds = new Set(remoteOrders.map((o) => o.id));
    const remoteProductIds = new Set(remoteProducts.map((p) => p.id));
    const remoteProductionIds = new Set(remoteProductions.map((pr) => pr.id));
    const remoteInsumoIds = new Set(remoteInsumos.map((i) => i.id));
    const remotePrecificacaoIds = new Set(remotePrecificacoes.map((r) => r.id));

    for (const order of localOrders.filter((o) => !remoteOrderIds.has(o.id))) {
      try {
        await supabase.insertOrder(toOrderRow(order));
      } catch (e) {
        reportError('Falha ao reenviar pedido', e && e.message ? e.message : 'sem conexão');
      }
    }
    for (const product of localProducts.filter((p) => !remoteProductIds.has(p.id))) {
      try {
        await supabase.insertProduct(toProductRow(product));
      } catch (e) {
        reportError('Falha ao reenviar produto', e && e.message ? e.message : 'sem conexão');
      }
    }
    for (const production of localProductions.filter((pr) => !remoteProductionIds.has(pr.id))) {
      try {
        await supabase.insertProduction(toProductionRow(production));
      } catch (e) {
        reportError('Falha ao reenviar produção', e && e.message ? e.message : 'sem conexão');
      }
    }
    for (const insumo of localInsumos.filter((i) => !remoteInsumoIds.has(i.id))) {
      try {
        await supabase.insertInsumo(toInsumoRow(insumo));
      } catch (e) {
        reportError('Falha ao reenviar insumo', e && e.message ? e.message : 'sem conexão');
      }
    }
    for (const receita of localPrecificacoes.filter((r) => !remotePrecificacaoIds.has(r.id))) {
      try {
        await supabase.insertPrecificacao(toPrecificacaoRow(receita));
      } catch (e) {
        reportError('Falha ao reenviar precificação', e && e.message ? e.message : 'sem conexão');
      }
    }

    // Fonte de verdade = nuvem (após o merge), atualizada via refetch
    const [o2, p2, pr2, i2, prc2] = await Promise.all([
      supabase.listOrders(),
      supabase.listProducts(),
      supabase.listProductions(),
      supabase.listInsumos(),
      supabase.listPrecificacoes(),
    ]);
    ordersCache = o2.map(fromOrderRow);
    productsCache = p2.map(fromProductRow);
    productionsCache = pr2.map(fromProductionRow);
    insumosCache = i2.map(fromInsumoRow);
    precificacoesCache = prc2.map(fromPrecificacaoRow);
    ordersSynced = JSON.parse(JSON.stringify(ordersCache));
    productsSynced = JSON.parse(JSON.stringify(productsCache));
    productionsSynced = JSON.parse(JSON.stringify(productionsCache));
    insumosSynced = JSON.parse(JSON.stringify(insumosCache));
    precificacoesSynced = JSON.parse(JSON.stringify(precificacoesCache));
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

  // Backup local SEMPRE: se a escrita na nuvem falhar (sessão expirada,
  // sem internet), os dados sobrevivem no dispositivo e são reconciliados
  // com a nuvem no próximo init() — evita perder pedidos/produtos.
  localStorage.setItem(PEDIDOS_KEY, JSON.stringify(orders));

  if (!online) {
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

  // Backup local SEMPRE (mesma garantia de save acima).
  localStorage.setItem(PRODUTOS_KEY, JSON.stringify(products));

  if (!online) {
    return;
  }
  diffProducts(productsSynced, products);
  productsSynced = JSON.parse(JSON.stringify(products));
}

/**
 * Persiste a lista de produções (log de estoque, mesma lógica diferencial).
 * @param {Array<Object>} productions - Nova lista de produções.
 */
export function saveProductions(productions) {
  productionsCache = productions;

  // Backup local SEMPRE.
  localStorage.setItem(PRODUCOES_KEY, JSON.stringify(productions));

  if (!online) {
    return;
  }
  diffProductions(productionsSynced, productions);
  productionsSynced = JSON.parse(JSON.stringify(productions));
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

/** Envia ao banco as produções criadas/alteradas/removidas. */
function diffProductions(previous, next) {
  const byId = new Map(previous.map((production) => [production.id, production]));

  next.forEach((production) => {
    const old = byId.get(production.id);
    if (!old) {
      supabase.insertProduction(toProductionRow(production)).catch((e) => reportError('Falha ao criar produção', e.message));
    } else if (JSON.stringify(old) !== JSON.stringify(production)) {
      supabase.updateProduction(production.id, toProductionRow(production)).catch((e) => reportError('Falha ao atualizar produção', e.message));
    }
    byId.delete(production.id);
  });

  byId.forEach((_, id) => supabase.deleteProduction(id).catch((e) => reportError('Falha ao excluir produção', e.message)));
}

/**
 * Persiste a lista de insumos (inventário, mesma lógica diferencial).
 * @param {Array<Object>} insumos - Nova lista de insumos.
 */
export function saveInsumos(insumos) {
  insumosCache = insumos;

  // Backup local SEMPRE.
  localStorage.setItem(INSUMOS_KEY, JSON.stringify(insumos));

  if (!online) {
    return;
  }
  diffInsumos(insumosSynced, insumos);
  insumosSynced = JSON.parse(JSON.stringify(insumos));
}

/**
 * Lê todas as bases (receitas de insumos) do cache/local.
 * @returns {Array<Object>} Lista de bases.
 */
export function getAllBases() {
  if (basesCache === null) {
    basesCache = readLocalBases();
  }
  return basesCache;
}

/**
 * Salva a lista de bases (apenas LocalStorage — sem sincronização
 * com a nuvem nesta versão).
 * @param {Array<Object>} bases - Nova lista de bases.
 */
export function saveBases(bases) {
  basesCache = bases;
  localStorage.setItem(BASES_KEY, JSON.stringify(bases));
}

/** Envia ao banco os insumos criados/alterados/removidos. */
function diffInsumos(previous, next) {
  const byId = new Map(previous.map((insumo) => [insumo.id, insumo]));

  next.forEach((insumo) => {
    const old = byId.get(insumo.id);
    if (!old) {
      supabase.insertInsumo(toInsumoRow(insumo)).catch((e) => reportError('Falha ao criar insumo', e.message));
    } else if (JSON.stringify(old) !== JSON.stringify(insumo)) {
      supabase.updateInsumo(insumo.id, toInsumoRow(insumo)).catch((e) => reportError('Falha ao atualizar insumo', e.message));
    }
    byId.delete(insumo.id);
  });

  byId.forEach((_, id) => supabase.deleteInsumo(id).catch((e) => reportError('Falha ao excluir insumo', e.message)));
}

/**
 * Persiste a lista de precificações (mesma lógica diferencial das
 * produções/insumos).
 * @param {Array<Object>} precificacoes - Nova lista de precificações.
 */
export function savePrecificacoes(precificacoes) {
  precificacoesCache = precificacoes;

  localStorage.setItem(PRECIFICACOES_KEY, JSON.stringify(precificacoes));

  if (!online) {
    return;
  }
  diffPrecificacoes(precificacoesSynced, precificacoes);
  precificacoesSynced = JSON.parse(JSON.stringify(precificacoes));
}

/** Envia ao banco as precificações criadas/alteradas/removidas. */
function diffPrecificacoes(previous, next) {
  const byId = new Map(previous.map((r) => [r.id, r]));

  next.forEach((r) => {
    const old = byId.get(r.id);
    if (!old) {
      supabase.insertPrecificacao(toPrecificacaoRow(r)).catch((e) => reportError('Falha ao criar precificação', e.message));
    } else if (JSON.stringify(old) !== JSON.stringify(r)) {
      supabase.updatePrecificacao(r.id, toPrecificacaoRow(r)).catch((e) => reportError('Falha ao atualizar precificação', e.message));
    }
    byId.delete(r.id);
  });

  byId.forEach((_, id) => supabase.deletePrecificacao(id).catch((e) => reportError('Falha ao excluir precificação', e.message)));
}

/* ---------- Manutenção ---------- */

/**
 * Remove todos os dados do app (reset completo, inclusive nuvem é
 * re-sincronizada no próximo init). Usado em testes/manutenção.
 */
export function clearAll() {
  ordersCache = null;
  productsCache = null;
  productionsCache = null;
  insumosCache = null;
  precificacoesCache = null;
  basesCache = null;
  ordersSynced = [];
  productsSynced = [];
  productionsSynced = [];
  insumosSynced = [];
  precificacoesSynced = [];
  online = false;
  localStorage.removeItem(PEDIDOS_KEY);
  localStorage.removeItem(PRODUTOS_KEY);
  localStorage.removeItem(PRODUCOES_KEY);
  localStorage.removeItem(INSUMOS_KEY);
  localStorage.removeItem(PRECIFICACOES_KEY);
  localStorage.removeItem(BASES_KEY);
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
  productionsCache = null;
  insumosCache = null;
  precificacoesCache = null;
  basesCache = null;
  ordersSynced = [];
  productsSynced = [];
  productionsSynced = [];
  insumosSynced = [];
  precificacoesSynced = [];
  online = false;
}
