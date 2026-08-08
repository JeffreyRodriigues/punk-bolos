/* ============================================================
   ESTOQUE.JS — Controle de estoque (regras de negócio)
   ------------------------------------------------------------
   Modelo DERIVADO (sem contador que dessincroniza):
     disponível(p) = produzido(p) − reservado(p) − vendido(p)

   - produzido(p): soma das quantidades do log de produções.
   - reservado(p): soma dos itens de pedidos que CONSOMEM estoque
     (consomeEstoque = true) ainda em andamento — Pendente,
     Em Produção e Embalado. O produto fica retido e não pode ser
     vendido de novo.
   - vendido(p):   soma dos itens de pedidos que CONSOMEM estoque
     (consomeEstoque = true) e já foram CONCLUÍDOS. Pedidos
     importados/históricos não consomem (consomeEstoque = false).

   Ciclo de um pedido:
     Pendente/Em Produção/Embalado  -> RESERVA o estoque
     Concluído                       -> Reserva vira VENDA
     Cancelado                       -> Libera para DISPONÍVEL

   REGRA ATUAL: TODOS os produtos precisam de produção para funcionar.
   O campo "controlaEstoque" foi descontinuado — a produção agora é
   obrigatória para qualquer produto do catálogo.
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as product from './product.js?v=16';

/**
 * Resolve o produto do catálogo correspondente a um item de pedido.
 * Prioriza o produtoId (novo formato); senão casa por tipo+tamanho+valor.
 * @param {Object} item - Item de pedido.
 * @returns {Object|undefined} Produto do catálogo (ou undefined).
 */
export function resolveProduct(item) {
  if (!item || typeof item !== 'object') {
    return undefined;
  }
  if (item.produtoId) {
    const byId = product.getProducts().find((p) => p.id === item.produtoId);
    if (byId) return byId;
  }
  return product.matchProduct(item);
}

/**
 * Total de unidades produzidas de um produto.
 * @param {string} produtoId - Id do produto.
 * @returns {number} Soma das quantidades produzidas.
 */
export function totalProduzido(produtoId) {
  return storage
    .getAllProductions()
    .filter((pr) => pr.produtoId === produtoId)
    .reduce((sum, pr) => sum + (Number(pr.quantidade) || 0), 0);
}

/**
 * Total de unidades vendidas (pedidos Concluídos que consomem estoque).
 * @param {string} produtoId - Id do produto.
 * @param {string} [excludeOrderId] - Id de pedido a ignorar (o que está sendo editado).
 * @returns {number} Soma das quantidades vendidas.
 */
export function totalVendido(produtoId, excludeOrderId = '') {
  let total = 0;
  storage.getAll().forEach((o) => {
    if (o.id === excludeOrderId) return;
    if (!o.consomeEstoque || o.status !== 'Concluído') return;
    (Array.isArray(o.itens) ? o.itens : []).forEach((item) => {
      const p = resolveProduct(item);
      if (p && p.id === produtoId) {
        total += Number(item.quantidade) || 0;
      }
    });
  });
  return total;
}

/**
 * Status de pedido em andamento que RESERVAM estoque (ainda não vendidos).
 * @type {string[]}
 */
const STATUS_RESERVA = ['Pendente', 'Em Produção', 'Embalado'];

/**
 * Total de unidades reservadas (pedidos em andamento que consomem estoque).
 * Um produto retido por pedidos abertos não pode ser vendido de novo.
 * @param {string} produtoId - Id do produto.
 * @param {string} [excludeOrderId] - Id de pedido a ignorar (o que está sendo editado).
 * @returns {number} Soma das quantidades reservadas.
 */
export function totalReservado(produtoId, excludeOrderId = '') {
  let total = 0;
  storage.getAll().forEach((o) => {
    if (o.id === excludeOrderId) return;
    if (!o.consomeEstoque || !STATUS_RESERVA.includes(o.status)) return;
    (Array.isArray(o.itens) ? o.itens : []).forEach((item) => {
      const p = resolveProduct(item);
      if (p && p.id === produtoId) {
        total += Number(item.quantidade) || 0;
      }
    });
  });
  return total;
}

/**
 * Estoque disponível de um produto. Como a produção é obrigatória para
 * vender, todos os produtos têm estoque calculado:
 * produzido − reservado − vendido.
 * @param {Object} produto - Produto do catálogo.
 * @param {string} [excludeOrderId] - Id de pedido a ignorar no cálculo.
 * @returns {number} Unidades disponíveis.
 */
export function disponivel(produto, excludeOrderId = '') {
  if (!produto) {
    return 0;
  }
  return (
    totalProduzido(produto.id) -
    totalReservado(produto.id, excludeOrderId) -
    totalVendido(produto.id, excludeOrderId)
  );
}

/**
 * Disponibilidade por item de pedido (para exibição no formulário).
 * @param {Object} item - Item de pedido.
 * @returns {{ produto: (Object|undefined), disponivel: number }} Info do item.
 */
export function disponivelPorItem(item) {
  const produto = resolveProduct(item);
  return { produto, disponivel: disponivel(produto) };
}

/**
 * Valida uma lista de itens contra o estoque disponível.
 * A produção é obrigatória para vender: qualquer produto cuja quantidade
 * do pedido exceda o disponível (já descontados os reservados e vendidos,
 * inclusive sem produção registrada) é erro.
 * @param {Array<Object>} itens - Itens de um pedido.
 * @param {{ excludeOrderId?: string }} [options] - Id do pedido sendo editado
 *   (para não contar o próprio consumo atual contra o novo pedido).
 * @returns {Array<Object>} Erros: [{ produto, item, disponivel, produzido, reservado, faltante }].
 */
export function validateItens(itens, options = {}) {
  const excludeOrderId = options.excludeOrderId || '';
  const errors = [];
  (itens || []).forEach((item) => {
    const produto = resolveProduct(item);
    if (!produto) {
      return;
    }
    const qtd = Number(item.quantidade) || 0;
    const produzido = totalProduzido(produto.id);
    const reservado = totalReservado(produto.id, excludeOrderId);
    const disp = disponivel(produto, excludeOrderId);
    if (qtd > disp) {
      errors.push({
        produto,
        item,
        disponivel: disp,
        produzido,
        reservado,
        faltante: qtd - disp,
      });
    }
  });
  return errors;
}

/**
 * Descreve o motivo de um erro de estoque de forma legível para o usuário.
 * Diferencia "nunca produzido" de "produção insuficiente" e menciona o
 * estoque retido por pedidos em andamento quando for o caso.
 * @param {Object} erro - Item do retorno de validateItens.
 * @returns {string} Ex.: "Fatia de chocolate — sem produção registrada."
 */
export function describeErro(erro) {
  const nome = nomeProduto(erro.produto) || 'Produto';
  if (erro.produzido <= 0) {
    return `${nome} — sem produção registrada (produza antes de vender).`;
  }
  const falta = Math.max(0, erro.faltante);
  if (erro.reservado > 0) {
    return `${nome} — disponível: ${erro.disponivel}, ${erro.reservado} reservado(s) e faltam ${falta} (produza mais ${falta}).`;
  }
  return `${nome} — disponível: ${erro.disponivel}, faltam ${falta} (produza mais ${falta}).`;
}

/**
 * Nome legível de um produto (com tamanho em Bolo Inteiro).
 * @param {Object} produto - Produto do catálogo.
 * @returns {string} Ex.: "Fatia de chocolate" ou "Bolo M Red Velvet".
 */
export function nomeProduto(produto) {
  if (!produto) return '';
  const base = produto.titulo || 'Produto';
  if (produto.tipoProduto === 'Bolo Inteiro' && produto.tamanho) {
    return `${base} (${produto.tamanho})`;
  }
  return `${base} (${produto.tipoProduto || 'Fatia'})`;
}

/**
 * Classifica o nível do estoque para exibição (badge colorido).
 * @param {number} disponivel - Unidades disponíveis.
 * @returns {string} "empty" | "low" | "ok".
 */
export function stockStatus(disponivel) {
  if (disponivel <= 0) return 'empty';
  if (disponivel <= 5) return 'low';
  return 'ok';
}
