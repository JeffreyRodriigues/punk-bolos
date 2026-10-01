/* ============================================================
   PRODUCT.JS — Regras de negócio do catálogo de produtos
   ------------------------------------------------------------
   Funções puras (sem DOM): criação, validação e consulta de
   produtos. Cada produto tem: título, tipo, valor e detalhes.
   O pedido usa o catálogo para escolher tipo → sabor (produto)
   sem digitar nada — o valor vem do cadastro.
   ============================================================ */

import * as storage from './storage.js';
import { PRODUCT_TYPES, CAKE_SIZES } from './order.js';

/**
 * Gera um id único para o produto.
 * @returns {string} Id no formato "p<timestamp>-<aleatório>".
 */
function generateId() {
  return `p${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Normaliza os dados de um produto no formato padrão.
 * Tamanho só é mantido para Bolo Inteiro.
 * @param {Object} data - Dados brutos do formulário.
 * @returns {Object} Produto normalizado.
 */
export function createProduct(data = {}) {
  const tipoProduto = PRODUCT_TYPES.includes(data.tipoProduto) ? data.tipoProduto : 'Fatia';
  const isCake = tipoProduto === 'Bolo Inteiro' || tipoProduto === 'Bolo Naked';
  return {
    id: typeof data.id === 'string' && data.id ? data.id : generateId(),
    titulo: String(data.titulo || '').trim(),
    tipoProduto,
    tamanho: isCake ? String(data.tamanho || '').trim() : '',
    valor: Number(data.valor) || 0,
    detalhes: String(data.detalhes || '').trim(),
    controlaEstoque: Boolean(data.controlaEstoque),
  };
}

/**
 * Valida os dados de um produto.
 * @param {Object} data - Dados brutos do formulário.
 * @returns {{ valid: boolean, errors: Object }} Resultado da validação.
 */
export function validateProduct(data = {}) {
  const errors = {};

  if (!data.titulo || !String(data.titulo).trim()) {
    errors.titulo = 'Informe o título do produto.';
  }

  if (!PRODUCT_TYPES.includes(data.tipoProduto)) {
    errors['tipo-produto'] = 'Selecione o tipo do produto.';
  } else if ((data.tipoProduto === 'Bolo Inteiro' || data.tipoProduto === 'Bolo Naked') && data.tamanho && !CAKE_SIZES.includes(data.tamanho)) {
    errors['tamanho-produto'] = 'Selecione o tamanho.';
  } else if ((data.tipoProduto === 'Bolo Inteiro' || data.tipoProduto === 'Bolo Naked') && !data.tamanho) {
    errors['tamanho-produto'] = 'Selecione o tamanho.';
  }

  const valor = Number(data.valor);
  if (data.valor === '' || data.valor == null || Number.isNaN(valor) || valor < 0) {
    errors.valor = 'Informe um valor válido (≥ 0).';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Retorna todos os produtos cadastrados (da camada de dados).
 * @returns {Array<Object>} Lista de produtos.
 */
export function getProducts() {
  return storage.getAllProducts();
}

/**
 * Procura um produto duplicado: mesmo tipo e mesmo título, ignorando
 * caixa e espaços. Para "Bolo Inteiro" e "Bolo Naked" o tamanho também conta — permite
 * cadastrar o mesmo sabor em tamanhos diferentes.
 * @param {Object} data - Dados do produto (tipoProduto, titulo e tamanho).
 * @param {string} [excludeId] - Id a ignorar (o próprio produto em edição).
 * @returns {Object|undefined} Produto existente que duplica, ou undefined.
 */
export function findDuplicate(data = {}, excludeId = '') {
  const titulo = String(data.titulo || '').trim().toLowerCase();
  const tipo = String(data.tipoProduto || '').trim().toLowerCase();
  if (!titulo || !tipo) return undefined;

  const isCake = data.tipoProduto === 'Bolo Inteiro' || data.tipoProduto === 'Bolo Naked';
  const tamanho = isCake ? String(data.tamanho || '').trim().toLowerCase() : '';

  return getProducts().find((p) => {
    if (p.id === excludeId) return false;
    if (String(p.tipoProduto || '').trim().toLowerCase() !== tipo) return false;
    if (String(p.titulo || '').trim().toLowerCase() !== titulo) return false;
    if (isCake && String(p.tamanho || '').trim().toLowerCase() !== tamanho) return false;
    return true;
  });
}

/**
 * Limpa prefixos de sabor e sufixos de tamanho/descrição.
 * @param {string} raw - Sabor ou título bruto.
 * @returns {string} Sabor limpo.
 */
export function cleanItemFlavor(raw = '') {
  return String(raw || '')
    .replace(/^(Bolo Naked|Naked Cake|Bolo Inteiro|Fatia|Bolo|Punkitos|Decoração|Decoracao|Adicional|Confeito)\s*(de\s*)?/i, '')
    .replace(/\s*\([^)]*\)$/, '')
    .trim();
}

/**
 * Verifica se dois tipos de produtos são compatíveis/intercambiáveis
 * (ex.: Decoração e Adicional, Bolo Inteiro e Bolo Naked).
 * @param {string} tipoA
 * @param {string} tipoB
 * @returns {boolean}
 */
function areCompatibleTypes(tipoA, tipoB) {
  if (!tipoA || !tipoB) return true;
  if (tipoA === tipoB) return true;
  if ((tipoA === 'Decoração' || tipoA === 'Adicional') && (tipoB === 'Decoração' || tipoB === 'Adicional')) return true;
  if ((tipoA === 'Bolo Inteiro' || tipoA === 'Bolo Naked') && (tipoB === 'Bolo Inteiro' || tipoB === 'Bolo Naked')) return true;
  return false;
}

/**
 * Busca o produto que corresponde a um item de pedido, para
 * auto-preenchimento ao editar. Casa pelo tipo + tamanho + valor unitário
 * e, quando o item guarda o título (sabor), usa-o para desempatar
 * produtos com o mesmo preço.
 * @param {Object} item - Item de pedido.
 * @returns {Object|undefined} Produto correspondente (ou undefined).
 */
export function matchProduct(item = {}) {
  const rawSabor = String(item.sabor || item.titulo || '').trim();
  const cleanSabor = cleanItemFlavor(rawSabor).toLowerCase();

  const all = getProducts();
  const tipo = item.tipoProduto;
  const rawTamanho = String(item.tamanho || '').trim();
  const cleanTamanho = rawTamanho.replace(/^Bolo\s+/i, '').replace(/\s*\(.*$/, '').trim();

  // 1. Casa por tipo + tamanho + sabor exato + valor
  let found = all.find((p) => {
    if (p.tipoProduto !== tipo) return false;
    const pTam = String(p.tamanho || '').trim();
    if (pTam && pTam !== rawTamanho && pTam !== cleanTamanho) return false;
    if (Number(p.valor) !== Number(item.valorUnitario)) return false;
    const pTit = String(p.titulo || '').trim().toLowerCase();
    const pClean = cleanItemFlavor(pTit).toLowerCase();
    return pTit === cleanSabor || pClean === cleanSabor || pTit === rawSabor.toLowerCase();
  });
  if (found) return found;

  // 2. Casa por tipo + tamanho + sabor (mesmo se valor for diferente)
  if (cleanSabor) {
    // 2a. Tipo exato
    found = all.find((p) => {
      if (p.tipoProduto !== tipo) return false;
      const pTam = String(p.tamanho || '').trim();
      if (pTam && pTam !== rawTamanho && pTam !== cleanTamanho) return false;
      const pTit = String(p.titulo || '').trim().toLowerCase();
      const pClean = cleanItemFlavor(pTit).toLowerCase();
      return pTit === cleanSabor || pClean === cleanSabor || pTit.includes(cleanSabor) || cleanSabor.includes(pTit) || (pClean && cleanSabor.includes(pClean));
    });
    if (found) return found;

    // 2b. Tipos compatíveis (Decoração <-> Adicional, Bolo Inteiro <-> Bolo Naked)
    found = all.find((p) => {
      if (!areCompatibleTypes(p.tipoProduto, tipo)) return false;
      const pTam = String(p.tamanho || '').trim();
      if (pTam && pTam !== rawTamanho && pTam !== cleanTamanho) return false;
      const pTit = String(p.titulo || '').trim().toLowerCase();
      const pClean = cleanItemFlavor(pTit).toLowerCase();
      return pTit === cleanSabor || pClean === cleanSabor || pTit.includes(cleanSabor) || cleanSabor.includes(pTit) || (pClean && cleanSabor.includes(pClean));
    });
    if (found) return found;
  }

  // 3. Casa apenas por tipo + tamanho + valor
  found = all.find((p) => {
    if (p.tipoProduto !== tipo) return false;
    const pTam = String(p.tamanho || '').trim();
    if (pTam && pTam !== rawTamanho && pTam !== cleanTamanho) return false;
    return Number(p.valor) === Number(item.valorUnitario);
  });
  if (found) return found;

  // 4. Casa por tipo compatível + tamanho + valor
  return all.find((p) => {
    if (!areCompatibleTypes(p.tipoProduto, tipo)) return false;
    const pTam = String(p.tamanho || '').trim();
    if (pTam && pTam !== rawTamanho && pTam !== cleanTamanho) return false;
    return Number(p.valor) === Number(item.valorUnitario);
  });
}

/**
 * Infere o tipo real do produto a partir dos dados do item (sabor, tamanho, tipo).
 * Evita que bolos e decorações caiam no fallback de 'Fatia'.
 * @param {Object} item
 * @returns {string} Tipo de produto inferido.
 */
export function inferProductType(item = {}) {
  const rawType = String(item.tipoProduto || item.tipo || '').trim();
  const rawSabor = String(item.sabor || item.titulo || '').toLowerCase();
  const rawTamanho = String(item.tamanho || '').trim();

  if (/\bnaked\b/i.test(rawSabor)) return 'Bolo Naked';
  if (/\bbolo\b/i.test(rawSabor) || rawTamanho) {
    return rawType === 'Bolo Naked' ? 'Bolo Naked' : 'Bolo Inteiro';
  }
  if (/\b(decor|papel\s+arroz|granulado|confeito|glitter|topo)\b/i.test(rawSabor)) {
    return rawType === 'Adicional' ? 'Adicional' : 'Decoração';
  }
  if (/\badicional\b/i.test(rawSabor)) return 'Adicional';
  if (/\bpunkitos\b/i.test(rawSabor)) return 'Punkitos';

  if (PRODUCT_TYPES.includes(rawType) && rawType !== 'Fatia') return rawType;
  return 'Fatia';
}

/**
 * Garante que exista um produto no catálogo correspondente ao item de pedido.
 * Se o produto já existir (por id ou correspondência de sabor/tamanho/tipo), retorna o produto existente.
 * Caso não exista, cria e salva automaticamente no catálogo e retorna o novo produto.
 * @param {Object} item - Item do pedido.
 * @returns {Object} Produto existente ou recém-criado.
 */
export function ensureProduct(item = {}) {
  if (!item || typeof item !== 'object') return null;

  const all = getProducts();
  const tipoProduto = inferProductType(item);
  const isCake = tipoProduto === 'Bolo Inteiro' || tipoProduto === 'Bolo Naked';

  const rawSabor = String(item.sabor || item.titulo || '').trim();
  const cleanTitle = cleanItemFlavor(rawSabor) || rawSabor || 'Produto';

  let tamanho = String(item.tamanho || '').trim().replace(/^Bolo\s+/i, '').replace(/\s*\(.*$/, '').trim();
  if (isCake && !tamanho) {
    const matchSize = rawSabor.match(/\b(Mini|PP|P|M|G|GG|Bento Cake|Coração)\b/i);
    tamanho = matchSize ? matchSize[1] : 'P';
  }

  // 1. Se tem produtoId, só aceita se o produto no catálogo tiver o tipo e tamanho compatíveis
  if (item.produtoId) {
    const existingById = all.find((p) => p.id === item.produtoId);
    if (existingById && existingById.tipoProduto === tipoProduto) {
      if (!isCake || (existingById.tamanho === tamanho || !tamanho)) {
        return existingById;
      }
    }
  }

  // 2. Se casa com produto existente via matchProduct
  const normalizedItem = { ...item, tipoProduto, tamanho: isCake ? tamanho : '', sabor: cleanTitle };
  const matched = matchProduct(normalizedItem);
  if (matched && matched.tipoProduto === tipoProduto) {
    if (!isCake || matched.tamanho === tamanho || !tamanho) {
      return matched;
    }
  }

  // 3. Se não existe, cria o produto automaticamente
  const valor = Number(item.valorUnitario != null ? item.valorUnitario : (item.valorBase != null ? item.valorBase : item.valor)) || 0;

  const newProduct = createProduct({
    titulo: cleanTitle,
    tipoProduto,
    tamanho: isCake ? tamanho : '',
    valor,
    detalhes: 'Cadastrado automaticamente a partir do pedido',
    controlaEstoque: false,
  });

  const updatedProducts = [...all, newProduct];
  storage.saveProducts(updatedProducts);

  return newProduct;
}
