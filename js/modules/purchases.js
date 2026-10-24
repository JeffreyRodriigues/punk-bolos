/* ============================================================
   PURCHASES.JS — Regras de negócio do Módulo de Compras (Entradas)
   ------------------------------------------------------------
   Responsável por:
   - criação e normalização de compras em lote (carrinho de mercado/nota)
   - validação de cabeçalho e itens da compra
   - cálculo de custo unitário e valor total da nota
   - código sequencial automático (CMP0001, CMP0002...)
   - aplicação automática no inventário (soma estoque e registra compras nos insumos)
   - reversão no inventário ao excluir compra
   - filtros e busca de compras
   ============================================================ */

/** Formas de pagamento aceitas em compras. */
export const FORMAS_PAGAMENTO = [
  'PIX',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'Boleto',
  'Outro',
];

/** Gera um id único no formato "cmp_<timestamp>_<aleatório>". */
export function generatePurchaseId() {
  return `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Arredonda para 2 casas decimais. */
export function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Gera o próximo código sequencial de compra (ex.: "CMP0001").
 * @param {Array<Object>} [existingList=[]] - Lista atual de compras.
 * @returns {string} Código no formato CMPXXXX.
 */
export function nextPurchaseCode(existingList = []) {
  let maxNum = 0;
  (existingList || []).forEach((item) => {
    if (item && typeof item.codigo === 'string') {
      const match = item.codigo.match(/^CMP(\d+)$/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });
  return `CMP${String(maxNum + 1).padStart(4, '0')}`;
}

/**
 * Calcula o custo unitário de um item: custoTotal ÷ quantidade.
 * @param {number} custoTotal
 * @param {number} quantidade
 * @returns {number}
 */
export function calculateItemUnitCost(custoTotal, quantidade) {
  const total = Number(custoTotal) || 0;
  const qtd = Number(quantidade) || 0;
  if (total <= 0 || qtd <= 0) return 0;
  return total / qtd;
}

/**
 * Soma o valor total de uma lista de itens.
 * @param {Array<Object>} [itens=[]]
 * @returns {number} Valor total arredondado em 2 casas.
 */
export function calculatePurchaseTotal(itens = []) {
  if (!Array.isArray(itens)) return 0;
  const sum = itens.reduce((acc, item) => acc + (Number(item.custoTotal) || 0), 0);
  return round2(sum);
}

/**
 * Normaliza e cria uma compra no formato padrão do sistema.
 * @param {Object} data - Dados da compra.
 * @param {Array<Object>} [existingList=[]] - Lista de compras existente para código sequencial.
 * @returns {Object} Compra normalizada.
 */
export function createPurchase(data = {}, existingList = []) {
  let codigo = String(data.codigo || '').trim();
  if (!codigo && Array.isArray(existingList)) {
    codigo = nextPurchaseCode(existingList);
  }

  const itens = Array.isArray(data.itens)
    ? data.itens.map((it) => {
        const custoTotal = Number(it.custoTotal) || 0;
        const quantidade = Number(it.quantidade) || 0;
        return {
          insumoId: String(it.insumoId || '').trim(),
          insumoNome: String(it.insumoNome || '').trim(),
          unidade: String(it.unidade || 'unidade').trim(),
          quantidade,
          custoTotal,
          custoUnitario: calculateItemUnitCost(custoTotal, quantidade),
        };
      })
    : [];

  const valorTotal = calculatePurchaseTotal(itens);

  return {
    id: typeof data.id === 'string' && data.id ? data.id : generatePurchaseId(),
    codigo: codigo || '',
    data: String(data.data || '').trim() || new Date().toISOString().slice(0, 10),
    fornecedor: String(data.fornecedor || '').trim(),
    formaPagamento: String(data.formaPagamento || 'PIX').trim(),
    observacoes: String(data.observacoes || '').trim(),
    itens,
    valorTotal,
    createdAt: data.createdAt || new Date().toISOString(),
  };
}

/**
 * Valida os dados de uma compra.
 * @param {Object} data - Dados da compra.
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validatePurchase(data = {}) {
  const errors = {};

  if (!data.data || !String(data.data).trim()) {
    errors.data = 'Informe a data da compra.';
  }

  if (!data.formaPagamento || !String(data.formaPagamento).trim()) {
    errors.formaPagamento = 'Selecione a forma de pagamento.';
  }

  const itens = Array.isArray(data.itens) ? data.itens : [];
  if (itens.length === 0) {
    errors.itens = 'Adicione ao menos um insumo na compra.';
  } else {
    for (let i = 0; i < itens.length; i++) {
      const it = itens[i] || {};
      if (!it.insumoId) {
        errors[`itens.${i}.insumoId`] = 'Selecione o insumo.';
      }
      if (!(Number(it.quantidade) > 0)) {
        errors[`itens.${i}.quantidade`] = 'Informe uma quantidade maior que zero.';
      }
      if (!(Number(it.custoTotal) > 0)) {
        errors[`itens.${i}.custoTotal`] = 'Informe o valor total pago no insumo.';
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Aplica os itens de uma compra no inventário:
 * - incrementa o estoqueAtual de cada insumo
 * - adiciona o registro no histórico de compras do insumo (para referência de custo vigente)
 * @param {Object} compra - Compra a ser aplicada.
 * @param {Array<Object>} existingInsumos - Lista atual de insumos.
 * @returns {Array<Object>} Nova lista de insumos com o estoque e compras atualizados.
 */
export function applyPurchaseToInventory(compra, existingInsumos = []) {
  if (!compra || !Array.isArray(compra.itens) || !Array.isArray(existingInsumos)) {
    return existingInsumos;
  }

  const insumosMap = new Map(existingInsumos.map((i) => [i.id, { ...i }]));

  compra.itens.forEach((item) => {
    if (!item.insumoId || !insumosMap.has(item.insumoId)) return;
    const ins = insumosMap.get(item.insumoId);

    // Soma ao estoque atual
    const curEstoque = Number(ins.estoqueAtual) || 0;
    const qtdComprada = Number(item.quantidade) || 0;
    ins.estoqueAtual = Math.round((curEstoque + qtdComprada) * 1000) / 1000;

    // Registra no histórico de compras do insumo
    const comprasInsumo = Array.isArray(ins.compras) ? [...ins.compras] : [];
    comprasInsumo.push({
      id: `ci_${compra.id}_${item.insumoId}_${Date.now()}`,
      compraId: compra.id,
      data: compra.data,
      custoTotal: Number(item.custoTotal) || 0,
      quantidadeCompra: qtdComprada,
      fornecedor: compra.fornecedor || '',
    });
    ins.compras = comprasInsumo;
  });

  return Array.from(insumosMap.values());
}

/**
 * Reverte o efeito de uma compra no inventário ao ser excluída:
 * - subtrai a quantidade do estoqueAtual
 * - remove as compras vinculadas ao compraId
 * @param {Object} compra - Compra sendo excluída.
 * @param {Array<Object>} existingInsumos - Lista atual de insumos.
 * @returns {Array<Object>} Nova lista de insumos com estoques revertidos.
 */
export function revertPurchaseFromInventory(compra, existingInsumos = []) {
  if (!compra || !Array.isArray(compra.itens) || !Array.isArray(existingInsumos)) {
    return existingInsumos;
  }

  const insumosMap = new Map(existingInsumos.map((i) => [i.id, { ...i }]));

  compra.itens.forEach((item) => {
    if (!item.insumoId || !insumosMap.has(item.insumoId)) return;
    const ins = insumosMap.get(item.insumoId);

    // Subtrai do estoque atual (sem ficar negativo)
    const curEstoque = Number(ins.estoqueAtual) || 0;
    const qtdComprada = Number(item.quantidade) || 0;
    ins.estoqueAtual = Math.max(0, Math.round((curEstoque - qtdComprada) * 1000) / 1000);

    // Remove do histórico de compras do insumo
    const comprasInsumo = Array.isArray(ins.compras) ? [...ins.compras] : [];
    ins.compras = comprasInsumo.filter((c) => {
      if (c.compraId && c.compraId === compra.id) return false;
      // Fallback para compras sem compraId explícito mas com mesmos dados
      return !(c.data === compra.data && c.custoTotal === item.custoTotal && c.quantidadeCompra === item.quantidade);
    });
  });

  return Array.from(insumosMap.values());
}

/**
 * Filtra e ordena a lista de compras.
 * @param {Array<Object>} purchases - Lista de compras.
 * @param {Object} filters - { query, dateFrom, dateTo, formaPagamento }
 * @returns {Array<Object>}
 */
export function filterPurchases(purchases = [], filters = {}) {
  const query = String(filters.query || '').trim().toLowerCase();
  const dateFrom = String(filters.dateFrom || '').trim();
  const dateTo = String(filters.dateTo || '').trim();
  const forma = String(filters.formaPagamento || '').trim();

  return (purchases || [])
    .filter((p) => {
      if (!p) return false;

      // Busca textual por código, fornecedor, observações ou nomes de itens
      if (query) {
        const matchesCode = String(p.codigo || '').toLowerCase().includes(query);
        const matchesForn = String(p.fornecedor || '').toLowerCase().includes(query);
        const matchesObs = String(p.observacoes || '').toLowerCase().includes(query);
        const matchesItem = (Array.isArray(p.itens) ? p.itens : []).some((it) =>
          String(it.insumoNome || '').toLowerCase().includes(query)
        );
        if (!matchesCode && !matchesForn && !matchesObs && !matchesItem) {
          return false;
        }
      }

      // Filtro por data
      if (dateFrom && p.data && p.data < dateFrom) return false;
      if (dateTo && p.data && p.data > dateTo) return false;

      // Filtro por forma de pagamento
      if (forma && p.formaPagamento !== forma) return false;

      return true;
    })
    .sort((a, b) => {
      // Mais recentes primeiro (data e código)
      const cmpDate = String(b.data || '').localeCompare(String(a.data || ''));
      if (cmpDate !== 0) return cmpDate;
      return String(b.codigo || '').localeCompare(String(a.codigo || ''));
    });
}
