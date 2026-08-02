/* ============================================================
   MONEY.JS — Utilitários de formatação de moeda (R$)
   ------------------------------------------------------------
   Centraliza a formatação de valores para que todo o sistema
   use o mesmo padrão BRL. Evita duplicação de lógica de
   parse/formatação em módulos diferentes.
   ============================================================ */

/**
 * Formata um número para o padrão de moeda brasileiro (R$ 1.234,56).
 * @param {number|string} value - Valor numérico ou string de número.
 * @returns {string} Valor formatado. Ex.: "R$ 45,00"
 */
export function formatCurrency(value) {
  const number = Number(value) || 0;
  return number.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Converte uma string de número (aceita vírgula como separador
 * decimal) em Number. Ex.: "45,90" -> 45.9 | "45.90" -> 45.9
 * @param {string|number} value - Valor a ser convertido.
 * @returns {number} Número sem arredondamento de exibição.
 */
export function parseMoney(value) {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  const str = String(value).trim();
  if (!str) {
    return 0;
  }
  // Troca vírgula por ponto e remove pontos de milhar ("1.234,56" -> "1234.56")
  const normalized = str
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Formata um número como data pt-BR (DD/MM/AAAA).
 * @param {string} isoDate - Data no formato ISO "YYYY-MM-DD".
 * @returns {string} Data formatada ou string vazia.
 */
export function formatDate(isoDate) {
  if (!isoDate) {
    return '';
  }
  const [year, month, day] = isoDate.split('-');
  return day && month && year ? `${day}/${month}/${year}` : isoDate;
}
