/* ============================================================
   IMPORTEXPORT.JS — Planilha (CSV) de pedidos
   ------------------------------------------------------------
   - Exportar: gera um CSV compatível com o Excel (separador ";",
     BOM UTF-8 para acentos) com uma linha por ITEM do pedido.
   - Importar: lê o CSV (ou o modelo exportado), casa cada produto
     com o catálogo (tipo + título + tamanho em Bolo Inteiro) e
     CRIA no catálogo os produtos que não existirem. Cada linha do
     CSV vira um item; linhas com o mesmo "numero" formam um pedido
     com vários itens.

   Colunas (ordem do arquivo-modelo):
     numero;data;cliente;contato;status;pagamento;entrega;observacoes;
     tipo;tamanho;sabor;quantidade;valor_unitario
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as order from './order.js?v=16';
import * as product from './product.js?v=17';

const HEADER = [
  'numero', 'data', 'cliente', 'contato', 'status', 'pagamento',
  'entrega', 'observacoes', 'tipo', 'tamanho', 'sabor', 'quantidade',
  'valor_unitario',
];

/* ---------- CSV: montagem (export) ---------- */

/** Escapa um campo para CSV (aspas quando necessário). */
function esc(value) {
  const s = value == null ? '' : String(value);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Gera o conteúdo CSV de uma lista de pedidos (uma linha por item).
 * @param {Array<Object>} orders - Lista de pedidos.
 * @returns {string} CSV com BOM UTF-8 (pronto para Excel).
 */
export function buildCsv(orders) {
  const lines = [HEADER.join(';')];
  [...orders]
    .sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0))
    .forEach((o) => {
      const items = Array.isArray(o.itens) && o.itens.length > 0 ? o.itens : [{}];
      items.forEach((item) => {
        lines.push([
          o.numero, o.data, o.cliente, o.contato, o.status, o.pagamento,
          o.entrega, o.observacoes,
          item.tipoProduto || '', item.tamanho || '', item.sabor || '',
          item.quantidade != null ? item.quantidade : '',
          item.valorUnitario != null ? item.valorUnitario : '',
        ].map(esc).join(';'));
      });
    });
  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Baixa um arquivo CSV no navegador.
 * @param {string} csv - Conteúdo CSV.
 * @param {string} filename - Nome do arquivo.
 */
function downloadCsv(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

/** Exporta todos os pedidos atuais para CSV. */
export function exportOrders() {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  downloadCsv(buildCsv(storage.getAll()), `punk-bolos-pedidos-${stamp}.csv`);
}

/** Baixa o arquivo-modelo (apenas o cabeçalho) para preencher no Excel. */
export function downloadTemplate() {
  downloadCsv(`\uFEFF${HEADER.join(';')}`, 'punk-bolos-modelo.csv');
}

/* ---------- CSV: leitura (import) ---------- */

/** Remove acentos e normaliza um rótulo de coluna para comparação. */
function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Sinônimos aceitos para cada coluna. */
const COLUMN_ALIASES = {
  numero: ['numero', 'pedido', 'numpedido', 'n'],
  data: ['data', 'dt', 'datavenda', 'datapedido'],
  cliente: ['cliente', 'cliente(nome)', 'nomecliente', 'nome'],
  contato: ['contato', 'telefone', 'whatsapp', 'celular', 'contatodocliente'],
  status: ['status', 'situacao', 'estado'],
  pagamento: ['pagamento', 'pag', 'formapagamento', 'formadepagamento'],
  entrega: ['entrega', 'tipoentrega', 'tipodeentrega', 'formaentrega'],
  observacoes: ['observacoes', 'obs', 'observacao', 'nota'],
  tipo: ['tipo', 'tipodeproduto', 'tipoproduto', 'categoria'],
  tamanho: ['tamanho', 'tamanho(bolo)', 'tam'],
  sabor: ['sabor', 'produto', 'titulo', 'nomeproduto', 'bolo'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'qty', 'unidades', 'un', 'quant'],
  valor_unitario: ['valor_unitario', 'valorunitario', 'valorunit', 'precounitario', 'preco', 'valor', 'precounit'],
};

/** Mapeia o cabeçalho do arquivo para as chaves canônicas. */
function buildColumnMap(headerCells) {
  const map = {};
  headerCells.forEach((cell, index) => {
    const key = normalizeHeader(cell);
    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      if (key === canonical || aliases.includes(key)) {
        map[canonical] = index;
        break;
      }
    }
  });
  return map;
}

/** Detecta o separador (";" é o padrão do Excel pt-BR). */
function detectDelimiter(text) {
  const first = String(text).split(/\r?\n/)[0] || '';
  const semis = (first.match(/;/g) || []).length;
  const commas = (first.match(/,/g) || []).length;
  return semis >= commas ? ';' : ',';
}

/**
 * Faz o parsing de CSV em uma matriz de células (suporta aspas).
 * @param {string} text - Conteúdo do arquivo.
 * @param {string} delimiter - Separador.
 * @returns {Array<Array<string>>} Linhas x células.
 */
function parseCsv(text, delimiter) {
  const src = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Remove linhas totalmente vazias
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/** Converte texto numérico (aceita "1.234,56" ou "12,50" ou "12.5"). */
function parseNumber(value) {
  if (value == null) return NaN;
  let s = String(value).trim().replace(/[R$\s]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}

/** Converte data para o formato do sistema (YYYY-MM-DD). */
function parseDate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

/** Normaliza um rótulo para comparação (minúsculas, sem acentos/símbolos). */
function normalizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Traduções dos rótulos das planilhas para os valores usados pelo sistema. */
const ENUM_ALIASES = {
  tipo: {
    'fatia': 'Fatia',
    'bolo': 'Bolo Inteiro',
    'bolointeiro': 'Bolo Inteiro',
    'punkitos': 'Punkitos',
    'kit': 'Punkitos',
  },
  tamanho: {
    'mini': 'Mini',
    'pp': 'PP', 'p': 'P', 'm': 'M', 'g': 'G', 'gg': 'GG',
    'bento': 'Bento Cake', 'bentocake': 'Bento Cake',
    'coracao': 'Coração',
    'unico': '', 'unicas': '', 'unica': '',
  },
  pagamento: {
    'pix': 'PIX', 'dinheiro': 'Dinheiro', 'credito': 'Crédito', 'debito': 'Débito',
    'cortesia': 'Cortesia', 'gratis': 'Cortesia', 'gratuito': 'Cortesia',
  },
  status: {
    'pendente': 'Pendente', 'emproducao': 'Em Produção', 'embalado': 'Embalado',
    'concluido': 'Concluído', 'cancelado': 'Cancelado',
  },
  entrega: {
    'retirada': 'Retirada',
    'entregapropria': 'Entrega Própria',
    'pessoalmente': 'Entrega Própria',
    'uberpelocliente': 'Uber Cliente',
    'ubercliente': 'Uber Cliente',
  },
};

/** Quantidade mínima de colunas reconhecidas para ser a linha de cabeçalho. */
const HEADER_MIN_COLS = 5;

/**
 * Resolve um valor de planilha para o enum do sistema (via ENUM_ALIASES).
 * Se não reconhecer, devolve o padrão.
 * @param {string} value - Valor cru da célula.
 * @param {string} column - Coluna canônica (tipo/tamanho/pagamento/status/entrega).
 * @param {string} fallback - Valor padrão.
 * @returns {string} Valor do sistema.
 */
function resolveEnum(value, column, fallback) {
  const v = String(value || '').trim();
  if (!v) return fallback;
  const nk = normalizeKey(v);
  const alias = ENUM_ALIASES[column] || {};
  if (Object.prototype.hasOwnProperty.call(alias, nk)) return alias[nk];
  return fallback;
}

/**
 * Procura um produto no catálogo por tipo + título (+ tamanho em Bolo Inteiro).
 * @param {Array<Object>} list - Lista onde procurar.
 * @param {Object} data - { tipoProduto, titulo, tamanho }.
 * @returns {Object|undefined} Produto encontrado.
 */
function findInCatalog(list, data) {
  const tipo = String(data.tipoProduto || '').trim().toLowerCase();
  const titulo = String(data.titulo || '').trim().toLowerCase();
  if (!tipo || !titulo) return undefined;
  const isCake = data.tipoProduto === 'Bolo Inteiro';
  const tamanho = isCake ? String(data.tamanho || '').trim().toLowerCase() : '';
  return list.find((p) =>
    String(p.tipoProduto || '').trim().toLowerCase() === tipo &&
    String(p.titulo || '').trim().toLowerCase() === titulo &&
    (!isCake || String(p.tamanho || '').trim().toLowerCase() === tamanho)
  );
}

/**
 * Importa pedidos a partir de um CSV (arquivo-modelo, exportado ou a planilha
 * "Controle de Fluxo de Vendas"). Casa produtos com o catálogo (cria os que
 * faltam) e persiste tudo, salvo em modo dryRun.
 *
 * Linhas de resumo acima do cabeçalho são ignoradas (detecção automática da
 * linha de cabeçalho). Rótulos de planilha são traduzidos (ex.: "Bolo" →
 * "Bolo Inteiro", "Bento" → "Bento Cake", "Uber pelo cliente" → "Uber Cliente").
 * Cliente vazio vira "(Sem nome)". Os pedidos recebem numeração nova do
 * sistema (o número da planilha é usado apenas para agrupar itens).
 *
 * @param {string} text - Conteúdo do arquivo CSV.
 * @param {{ dryRun?: boolean }} [options] - Em dryRun não grava nada.
 * @returns {{ ok: boolean, message?: string, pedidos?: number, itens?: number,
 *            produtosCriados?: number, produtos?: Array<string>,
 *            dryRun?: boolean, erros?: Array<string> }} Resumo.
 */
export function importCsv(text, options = {}) {
  const dryRun = Boolean(options && options.dryRun);
  const erros = [];
  const delimiter = detectDelimiter(text);
  const rows = parseCsv(text, delimiter);

  if (rows.length < 2) {
    return { ok: false, message: 'Arquivo vazio ou sem conteúdo.' };
  }

  // Localiza a linha de cabeçalho (pode haver títulos/resumos acima dela)
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (Object.keys(buildColumnMap(rows[i])).length >= HEADER_MIN_COLS) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    return { ok: false, message: 'Cabeçalho não encontrado. Use o arquivo-modelo (⬇ Modelo) ou exporte antes.' };
  }
  const col = buildColumnMap(rows[headerIdx]);
  if (col.cliente == null && col.sabor == null) {
    return { ok: false, message: 'Colunas não reconhecidas. Use o arquivo-modelo (⬇ Modelo).' };
  }

  const existingOrders = storage.getAll();
  const existingProducts = storage.getAllProducts();
  const productsToAdd = [];

  const readCell = (r, key) => {
    const idx = col[key];
    return idx == null ? '' : String(r[idx] || '').trim();
  };

  // Agrupa as linhas pelo número de pedido da planilha (mesmo número = mesmo pedido)
  const groups = new Map();
  rows.slice(headerIdx + 1).forEach((r, index) => {
    const fileLine = headerIdx + index + 2;
    const tipo = resolveEnum(readCell(r, 'tipo'), 'tipo', 'Fatia');
    const tamanho = tipo === 'Bolo Inteiro' ? resolveEnum(readCell(r, 'tamanho'), 'tamanho', '') : '';

    const row = {
      numero: readCell(r, 'numero'),
      data: parseDate(readCell(r, 'data')),
      cliente: readCell(r, 'cliente') || '(Sem nome)',
      contato: readCell(r, 'contato'),
      status: resolveEnum(readCell(r, 'status'), 'status', 'Concluído'),
      pagamento: resolveEnum(readCell(r, 'pagamento'), 'pagamento', 'PIX'),
      entrega: resolveEnum(readCell(r, 'entrega'), 'entrega', 'Retirada'),
      observacoes: readCell(r, 'observacoes'),
      tipo,
      tamanho,
      sabor: readCell(r, 'sabor'),
      quantidade: Math.max(1, Math.round(parseNumber(readCell(r, 'quantidade')) || 1)),
      valorUnitario: parseNumber(readCell(r, 'valor_unitario')),
    };

    if (!row.data) {
      erros.push(`Linha ${fileLine}: data inválida ou vazia — linha ignorada.`);
      return;
    }
    if (!row.sabor) {
      erros.push(`Linha ${fileLine}: sabor/produto vazio — linha ignorada.`);
      return;
    }

    const key = row.numero || `__linha_${index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  });

  const newOrders = [];
  let itensCount = 0;

  groups.forEach((groupRows) => {
    const first = groupRows[0];

    const items = groupRows.map((row) => {
      const data = { tipoProduto: row.tipo, titulo: row.sabor, tamanho: row.tamanho };
      let prod = findInCatalog(existingProducts.concat(productsToAdd), data);

      if (!prod) {
        // Cria o produto no catálogo (valor da planilha, se houver)
        prod = product.createProduct({
          tipoProduto: row.tipo,
          titulo: row.sabor,
          tamanho: row.tamanho,
          valor: Number.isFinite(row.valorUnitario) ? row.valorUnitario : 0,
        });
        productsToAdd.push(prod);
      }

      return {
        tipoProduto: prod.tipoProduto,
        tamanho: prod.tipoProduto === 'Bolo Inteiro' ? (row.tamanho || prod.tamanho || '') : '',
        sabor: prod.titulo,
        quantidade: row.quantidade,
        valorUnitario: Number.isFinite(row.valorUnitario) ? row.valorUnitario : Number(prod.valor) || 0,
      };
    });

    const created = order.createOrder(
      {
        data: first.data,
        cliente: first.cliente,
        contato: first.contato,
        itens: items,
        status: first.status,
        pagamento: first.pagamento,
        entrega: first.entrega,
        observacoes: first.observacoes,
      },
      order.nextOrderNumber(existingOrders.concat(newOrders))
    );
    // Histórico importado NÃO abate o estoque (estoque começa das produções).
    created.consomeEstoque = false;
    newOrders.push(created);
    itensCount += items.length;
  });

  if (newOrders.length === 0) {
    return { ok: false, message: 'Nenhum pedido válido para importar.', erros };
  }

  if (!dryRun) {
    storage.save(existingOrders.concat(newOrders));
    if (productsToAdd.length > 0) {
      storage.saveProducts(existingProducts.concat(productsToAdd));
    }
  }

  return {
    ok: true,
    pedidos: newOrders.length,
    itens: itensCount,
    produtosCriados: productsToAdd.length,
    produtos: productsToAdd.map((p) =>
      p.tipoProduto === 'Bolo Inteiro'
        ? `${p.titulo} (${p.tipoProduto} ${p.tamanho})`
        : `${p.titulo} (${p.tipoProduto})`
    ),
    dryRun,
    erros,
  };
}
