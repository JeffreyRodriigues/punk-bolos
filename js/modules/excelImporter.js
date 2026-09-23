/* ============================================================
   EXCELIMPORTER.JS — Parse, validação e correspondência de dados
   copiados do Excel para receitas e bases (Precificação e Bases).
   ------------------------------------------------------------
   Colunas esperadas no Excel (separadas por tabulação ao colar):
     1. Ingrediente (Nome do insumo)
     2. Custo dos Ingredientes (Preço pago pela embalagem fechada)
     3. Gramas/Qtd da Embalagem Fechada (Tamanho do pacote)
     4. Gramas Utilizadas (Quantidade usada na receita)
     5. Quanto Custou (Opcional - calculado automaticamente pelo sistema)
   ============================================================ */

import * as inventory from './inventory.js';

/** Status de cada linha na pré-visualização. */
export const STATUS_TYPES = {
  EXACT_MATCH_SAME_PRICE: 'same_price',
  EXACT_MATCH_DIFF_PRICE: 'diff_price',
  SIMILAR_NAME: 'similar_name',
  NEW_INSUMO: 'new_insumo',
  INVALID: 'invalid',
};

/**
 * Remove acentos, pontuação irrelevante e espaços extras para comparação segura.
 * @param {string} str - Texto a normalizar.
 * @returns {string} Texto normalizado em minúsculas sem acentos.
 */
export function normalizeText(str) {
  if (!str) return '';
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s%]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Stopwords e termos comuns em ingredientes que podem ser desconsiderados em busca difusa.
 */
const STOPWORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'em', 'com', 'c', 'sem', 's', 'para', 'tipo', 'tradicional', 'especial']);

/**
 * Extrai palavras significativas de um nome de ingrediente.
 * @param {string} text - Texto normalizado.
 * @returns {Array<string>} Lista de palavras-chave.
 */
export function extractKeywords(text) {
  return normalizeText(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/**
 * Calcula a similaridade entre duas strings usando coeficiente de Sørensen–Dice (bigramas) e sobreposição de termos.
 * @param {string} strA - Primeira string.
 * @param {string} strB - Segunda string.
 * @returns {number} Coeficiente de 0 a 1.
 */
export function calculateSimilarity(strA, strB) {
  const normA = normalizeText(strA);
  const normB = normalizeText(strB);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  // Se uma string contém a outra completamente e tem tamanho razoável
  if (normA.length >= 4 && normB.length >= 4) {
    if (normA.includes(normB) || normB.includes(normA)) {
      return 0.88;
    }
  }

  // Sobreposição de palavras-chave (Jaccard / Token Overlap)
  const kwA = extractKeywords(normA);
  const kwB = extractKeywords(normB);

  if (kwA.length > 0 && kwB.length > 0) {
    const setB = new Set(kwB);
    const common = kwA.filter((w) => setB.has(w));
    if (common.length > 0) {
      const tokenScore = common.length / Math.max(kwA.length, kwB.length);
      if (tokenScore >= 0.5) {
        return Math.max(0.75, tokenScore);
      }
    }
  }

  // Bigramas (Dice Coefficient) para capturar pequenas variações ortográficas
  const getBigrams = (str) => {
    const s = ` ${str} `;
    const bigrams = new Set();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.substring(i, i + 2));
    }
    return bigrams;
  };

  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);

  let intersection = 0;
  bigramsA.forEach((bg) => {
    if (bigramsB.has(bg)) intersection++;
  });

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Converte string de valor (ex: "R$ 12,50", "1.250,00", "500", "1.5") para número float.
 * @param {string|number} val - Valor bruto.
 * @returns {number} Número parseado ou 0.
 */
export function parseExcelNumber(val) {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (!val) return 0;

  let str = String(val).trim();
  // Remove "R$", "g", "ml", "un", "kg", "L" mantendo os números e pontuação
  str = str.replace(/R\$|\b(reais|g|ml|un|unidades?|kg|litros?|l)\b/gi, '').trim();

  // Se tiver vírgula e ponto (ex: 1.250,50 ou 1,250.50)
  if (str.includes(',') && str.includes('.')) {
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // Padrão BR: 1.250,50 -> 1250.50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // Padrão US: 1,250.50 -> 1250.50
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Apenas vírgula: 12,50 -> 12.50
    str = str.replace(',', '.');
  } else if (str.includes('.')) {
    // Se tiver apenas ponto, verificar se é milhar ex: 1.000 ou 2.500 (3 dígitos após ponto)
    // Se for 3 dígitos após ponto sem outro ponto (ex: "1.000", "25.000"), no BR é milhar
    if (/^\d{1,3}\.\d{3}$/.test(str)) {
      str = str.replace('.', '');
    }
  }

  // Remove qualquer caractere que não seja dígito, sinal ou ponto decimal
  str = str.replace(/[^0-9.-]/g, '');

  const num = parseFloat(str);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Palavras-chave que identificam linhas de cabeçalho ou de resumo do Excel
 * que devem ser ignoradas no parse dos ingredientes.
 */
const IGNORED_KEYWORDS = [
  'ingrediente',
  'ingredientes',
  'custo dos ingredientes',
  'embalagem fechada',
  'gramas utilizadas',
  'quanto custou',
  'total custo',
  'total de custo',
  'adiciona 25',
  'custos incalculaveis',
  'multiplica por',
  'seu lucro',
  'rendimento',
  'quantas unidades',
  'preco por unidade',
  'preco por embalagem',
  'preco final de venda',
  'preco final',
  'lucro e mao de obra',
];

/**
 * Verifica se a linha de texto é um cabeçalho ou rodapé/resumo.
 * @param {string} text - Linha de texto bruta.
 * @returns {boolean} true se for para ignorar.
 */
export function isHeaderOrSummaryLine(text) {
  const norm = normalizeText(text);
  if (!norm) return true;
  return IGNORED_KEYWORDS.some((kw) => norm.includes(kw));
}

/**
 * Faz o parse do texto colado da área de transferência (Excel/Sheets).
 * @param {string} rawText - Texto copiado da planilha.
 * @returns {Array<Object>} Lista de itens brutos extraídos.
 */
export function parseExcelText(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText.split(/\r?\n/);
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isHeaderOrSummaryLine(line)) continue;

    // Excel separa colunas por tabulação (\t) ao copiar. Suportamos também ponto e vírgula (;).
    let cols = line.split('\t');
    if (cols.length === 1 && line.includes(';')) {
      cols = line.split(';');
    }

    const rawNome = (cols[0] || '').trim();
    if (!rawNome) continue;

    const rawCusto = cols[1] != null ? cols[1] : '';
    const rawQtdEmbalagem = cols[2] != null ? cols[2] : '';
    const rawQtdUtilizada = cols[3] != null ? cols[3] : '';

    const custoEmbalagem = parseExcelNumber(rawCusto);
    const qtdEmbalagem = parseExcelNumber(rawQtdEmbalagem);
    const qtdUtilizada = parseExcelNumber(rawQtdUtilizada);

    // Se não tiver quantidade utilizada nem custo, pode ser uma linha vazia ou rótulo
    if (qtdUtilizada <= 0 && custoEmbalagem <= 0 && qtdEmbalagem <= 0) {
      continue;
    }

    result.push({
      index: i,
      rawNome,
      custoEmbalagem,
      qtdEmbalagem: qtdEmbalagem > 0 ? qtdEmbalagem : 1000,
      qtdUtilizada: qtdUtilizada > 0 ? qtdUtilizada : 0,
    });
  }

  return result;
}

/**
 * Cruza as linhas extraídas da planilha com os insumos existentes no inventário.
 * @param {Array<Object>} parsedRows - Linhas do parseExcelText.
 * @param {Array<Object>} existingInsumos - Lista de insumos do inventário.
 * @returns {Array<Object>} Lista de itens com status e recomendações de mapeamento.
 */
export function matchParsedRowsWithInventory(parsedRows = [], existingInsumos = []) {
  return parsedRows.map((row) => {
    const normName = normalizeText(row.rawNome);

    if (!normName || row.qtdUtilizada <= 0) {
      return {
        ...row,
        status: STATUS_TYPES.INVALID,
        insumoId: '',
        insumoMatch: null,
        acao: 'invalid',
        mensagem: 'Quantidade utilizada inválida ou nome ausente.',
      };
    }

    // Busca insumo correspondente exato (normalizado)
    const match = existingInsumos.find((ins) => normalizeText(ins.nome) === normName);

    if (match) {
      const ultimaCompra = inventory.ultimaCompra(match);
      const precoAtual = ultimaCompra ? Number(ultimaCompra.custoTotal) || 0 : 0;
      const qtdAtual = ultimaCompra ? Number(ultimaCompra.quantidadeCompra) || 0 : 0;

      // Se não informou custo na planilha ou informou igual ao inventário
      const custoInformado = row.custoEmbalagem;
      const qtdInformada = row.qtdEmbalagem;

      const custoUnitarioAtual = qtdAtual > 0 ? precoAtual / qtdAtual : 0;
      const custoUnitarioInformado = qtdInformada > 0 ? custoInformado / qtdInformada : 0;

      const precoDiferente =
        custoInformado > 0 &&
        custoUnitarioAtual > 0 &&
        Math.abs(custoUnitarioAtual - custoUnitarioInformado) > 0.0001;

      if (precoDiferente) {
        return {
          ...row,
          status: STATUS_TYPES.EXACT_MATCH_DIFF_PRICE,
          insumoId: match.id,
          insumoMatch: match,
          precoAtual,
          qtdAtual,
          acao: 'keep_existing_price', // 'keep_existing_price' ou 'update_price'
          mensagem: `Já existe no inventário (Preço atual: R$ ${precoAtual.toFixed(2)} / ${qtdAtual}g)`,
        };
      }

      return {
        ...row,
        status: STATUS_TYPES.EXACT_MATCH_SAME_PRICE,
        insumoId: match.id,
        insumoMatch: match,
        precoAtual,
        qtdAtual,
        acao: 'use_existing',
        mensagem: 'Insumo existente correspondente.',
      };
    }

    // Busca insumo com nome parecido (fuzzy matching)
    let bestSimilar = null;
    let bestScore = 0;

    for (const ins of existingInsumos) {
      const score = calculateSimilarity(row.rawNome, ins.nome);
      if (score > bestScore) {
        bestScore = score;
        bestSimilar = ins;
      }
    }

    if (bestSimilar && bestScore >= 0.55) {
      const ultimaCompra = inventory.ultimaCompra(bestSimilar);
      const precoAtual = ultimaCompra ? Number(ultimaCompra.custoTotal) || 0 : 0;
      const qtdAtual = ultimaCompra ? Number(ultimaCompra.quantidadeCompra) || 0 : 0;

      return {
        ...row,
        status: STATUS_TYPES.SIMILAR_NAME,
        insumoId: bestSimilar.id,
        insumoMatch: bestSimilar,
        similarityScore: bestScore,
        precoAtual,
        qtdAtual,
        acao: 'use_similar', // 'use_similar', 'create_new' ou 'map_other'
        unidade: 'g',
        mensagem: `Possível produto similar: "${bestSimilar.nome}" (${Math.round(bestScore * 100)}% compatível)`,
      };
    }

    // Insumo novo a ser cadastrado
    return {
      ...row,
      status: STATUS_TYPES.NEW_INSUMO,
      insumoId: '',
      insumoMatch: null,
      unidade: 'g', // Padrão gramas (conforme planilha de bolos)
      acao: 'create_new',
      mensagem: 'Novo insumo (será cadastrado no inventário)',
    };
  });
}
