/* ============================================================
   ORDER.JS — Modelo do pedido + regras de negócio
   ------------------------------------------------------------
   Centraliza:
   - criação de pedidos (com id e número auto-incrementado)
   - itens do pedido (cada um com sabor, quantidade e valor)
   - cálculo do valor total
   - validação de campos obrigatórios
   - geração de id único (sem dependência de biblioteca)

   Estrutura do pedido:
   {
     id, numero, data, cliente, contato,
     itens: [
       { tipoProduto, tamanho (só Bolo Inteiro), sabor, quantidade, valorUnitario }
     ],
     quantidade,   // total de itens (soma das quantidades)
     valorTotal,   // soma dos totais dos itens
     status, pagamento, entrega, observacoes
   }
   ============================================================ */

import * as storage from './storage.js?v=13';

/** Tipos de produto aceitos pelo sistema. */
export const PRODUCT_TYPES = ['Fatia', 'Punkitos', 'Bolo Inteiro'];

/** Tamanhos válidos apenas para "Bolo Inteiro". */
export const CAKE_SIZES = ['Mini', 'PP', 'P', 'M', 'G', 'GG', 'Bento Cake', 'Coração'];

/** Status válidos (fluxo de produção). */
export const STATUSES = [
  'Pendente',
  'Em Produção',
  'Embalado',
  'Concluído',
  'Cancelado',
];

/** Formas de pagamento disponíveis. */
export const PAYMENT_METHODS = ['PIX', 'Dinheiro', 'Crédito', 'Débito', 'Cortesia'];

/**
 * Indica se a forma de pagamento é Cortesia (pedido grátis, R$ 0,00).
 * @param {string} pagamento - Forma de pagamento.
 * @returns {boolean} true quando é Cortesia.
 */
export function isCortesia(pagamento) {
  return String(pagamento || '') === 'Cortesia';
}

/** Formas de entrega disponíveis. */
export const DELIVERY_METHODS = ['Retirada', 'Entrega Própria', 'Uber Cliente'];

/** Número do primeiro pedido. */
const FIRST_ORDER_NUMBER = 1001;

/**
 * Gera um id único usando timestamp + contador/aleatório.
 * Suficiente para uso local sem depender de biblioteca.
 * @returns {string} Id no formato "t<timestamp>-<rand>".
 */
function generateId() {
  return `t${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Retorna o próximo número de pedido, baseado na lista atual.
 * @param {Array<Object>} orders - Lista de pedidos.
 * @returns {number} Maior número + 1 (nunca repete).
 */
export function nextOrderNumber(orders) {
  const max = orders.reduce(
    (highest, order) => Math.max(highest, order.numero || 0),
    FIRST_ORDER_NUMBER - 1
  );
  return max + 1;
}

/**
 * Calcula o valor total de um item: quantidade * valor unitário.
 * @param {number} quantity - Quantidade.
 * @param {number} unitPrice - Valor unitário.
 * @returns {number} Valor total arredondado para 2 casas.
 */
export function calculateTotal(quantity, unitPrice) {
  const qty = Number(quantity) || 0;
  const price = Number(unitPrice) || 0;
  return Math.round(qty * price * 100) / 100;
}

/**
 * Normaliza e sanitiza a lista de itens do pedido.
 * Remove itens vazios (sem produto e sem sabor) e garante números válidos.
 * Um item é mantido mesmo sem sabor (produtos do catálogo podem não ter).
 * @param {Array<Object>|undefined} rawItems - Itens crus do formulário.
 * @returns {Array<Object>} Itens válidos.
 */
export function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

    return rawItems
      .map((item) => ({
        produtoId: item.produtoId ? String(item.produtoId) : '',
        tipoProduto: String(item.tipoProduto || '').trim(),
        tamanho: (item.tamanho || '').trim(),
        sabor: (item.sabor || '').trim(),
        quantidade: Number(item.quantidade) || 0,
        valorUnitario: Number(item.valorUnitario) || 0,
        cortesia: Boolean(item.cortesia) || false,
      }))
      .filter((item) => item.tipoProduto !== '' || item.sabor !== '');
}

/**
 * Soma a quantidade total de todos os itens.
 * @param {Array<Object>} items - Itens do pedido.
 * @returns {number} Quantidade total.
 */
export function totalQuantity(items) {
  return (items || []).reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
}

/**
 * Soma o valor total de todos os itens.
 * @param {Array<Object>} items - Itens do pedido.
 * @returns {number} Valor total arredondado para 2 casas.
 */
export function totalValue(items) {
  const sum = (items || []).reduce(
    (acc, item) => acc + (item.cortesia ? 0 : calculateTotal(item.quantidade, item.valorUnitario)),
    0
  );
  return Math.round(sum * 100) / 100;
}

/**
 * Soma a quantidade total por tipo de produto (acumulando os itens).
 * @param {Array<Object>} items - Itens dos pedidos.
 * @returns {Object} Mapa tipo -> quantidade (0 quando nenhum).
 */
export function quantityByType(items) {
  const counts = { 'Fatia': 0, 'Punkitos': 0, 'Bolo Inteiro': 0 };
  (items || []).forEach((item) => {
    const type = item.tipoProduto;
    if (Object.prototype.hasOwnProperty.call(counts, type)) {
      counts[type] += Number(item.quantidade) || 0;
    }
  });
  return counts;
}

/**
 * Valor total do pedido: soma dos itens; 0 quando a forma de pagamento
 * é Cortesia (pedido grátis).
 * @param {Array<Object>} items - Itens do pedido.
 * @param {string} pagamento - Forma de pagamento.
 * @returns {number} Valor total arredondado para 2 casas (0 em cortesia).
 */
export function orderTotalValue(items, pagamento) {
  return isCortesia(pagamento) ? 0 : totalValue(items);
}

/**
 * Cria um novo pedido com valores padronizados.
 * @param {Object} data - Dados do pedido (inclui itens).
 * @param {number} numero - Número do pedido (calculado antes).
 * @returns {Object} Pedido completo.
 */
export function createOrder(data, numero) {
  const items = normalizeItems(data.itens);

  return {
    id: generateId(),
    numero,
    data: data.data || '',
    cliente: (data.cliente || '').trim(),
    contato: (data.contato || '').trim(),
    itens: items,
    // Agregados calculados (para o dashboard e listas)
    quantidade: totalQuantity(items),
    valorTotal: orderTotalValue(items, data.pagamento),
    status: data.status || 'Pendente',
    pagamento: data.pagamento || 'PIX',
    entrega: data.entrega || 'Retirada',
    observacoes: (data.observacoes || '').trim(),
    // Pedidos criados pelo app a partir de agora consomem estoque.
    // Importações/legados são marcados como false (histórico).
    consomeEstoque: data.consomeEstoque !== false,
  };
}

/**
 * Duplica um pedido existente: copia todos os dados (incluindo itens),
 * gera novo id, novo número e SEMPRE reinicia o status para "Pendente".
 * @param {Object} order - Pedido original.
 * @param {number} numero - Número do novo pedido.
 * @returns {Object} Novo pedido duplicado.
 */
export function duplicateOrder(order, numero) {
  return {
    ...createOrder(
      {
        data: order.data,
        cliente: order.cliente,
        contato: order.contato,
        itens: (order.itens || []).map((item) => ({ ...item })),
        status: 'Pendente',
        pagamento: order.pagamento,
        entrega: order.entrega,
        observacoes: order.observacoes,
      },
      numero
    ),
    id: generateId(),
  };
}

/**
 * Valida os campos obrigatórios de um pedido.
 * @param {Object} data - Dados brutos (sem id/numero/valorTotal).
 * @returns {{ valid: boolean, errors: Object }} Resultado da validação.
 *   errors mapeia campo -> mensagem de erro.
 */
export function validateOrder(data) {
  const errors = {};

  if (!data.data) {
    errors.data = 'Informe a data.';
  }
  if (!data.cliente || !data.cliente.trim()) {
    errors.cliente = 'Informe o nome do cliente.';
  }

  // Itens: precisa de pelo menos um produto selecionado
  const items = normalizeItems(data.itens);
  if (items.length === 0) {
    errors.itens = 'Adicione pelo menos um produto.';
  } else {
    if (items.some((item) => !PRODUCT_TYPES.includes(item.tipoProduto))) {
      errors.itens = 'Selecione o produto em cada item.';
    } else if (items.some((item) => item.quantidade <= 0 || item.valorUnitario < 0)) {
      errors.itens = 'Quantidade deve ser maior que zero e valor não negativo.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Lê os pedidos atuais e devolve a estrutura usada pelo modal.
 * (Helper simples para o orderForm não acessar storage diretamente.)
 */
export function getOrders() {
  return storage.getAll();
}
