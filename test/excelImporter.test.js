import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  parseExcelNumber,
  isHeaderOrSummaryLine,
  parseExcelText,
  matchParsedRowsWithInventory,
  STATUS_TYPES,
} from '../js/modules/excelImporter.js';

describe('excelImporter: normalizeText', () => {
  it('remove acentos, espaços extras e converte para minúsculas', () => {
    assert.equal(normalizeText('  Açúcar   Cristal  '), 'acucar cristal');
    assert.equal(normalizeText('Farinha de Trigo Tradicional'), 'farinha de trigo tradicional');
    assert.equal(normalizeText('Óleo de Soja 900ml'), 'oleo de soja 900ml');
  });

  it('trata valores vazios e nulos com segurança', () => {
    assert.equal(normalizeText(''), '');
    assert.equal(normalizeText(null), '');
    assert.equal(normalizeText(undefined), '');
  });
});

describe('excelImporter: parseExcelNumber', () => {
  it('converte valores em formato brasileiro (vírgula decimal)', () => {
    assert.equal(parseExcelNumber('12,50'), 12.5);
    assert.equal(parseExcelNumber('R$ 15,90'), 15.9);
    assert.equal(parseExcelNumber('1.250,00'), 1250);
    assert.equal(parseExcelNumber('395g'), 395);
    assert.equal(parseExcelNumber('1kg'), 1);
  });

  it('converte valores em formato numérico puro e padrão US', () => {
    assert.equal(parseExcelNumber(12.5), 12.5);
    assert.equal(parseExcelNumber('12.5'), 12.5);
    assert.equal(parseExcelNumber('1,250.50'), 1250.5);
  });

  it('retorna 0 para entradas inválidas', () => {
    assert.equal(parseExcelNumber(''), 0);
    assert.equal(parseExcelNumber('texto'), 0);
    assert.equal(parseExcelNumber(null), 0);
  });
});

describe('excelImporter: isHeaderOrSummaryLine', () => {
  it('detecta linhas de cabeçalho da planilha', () => {
    assert.equal(isHeaderOrSummaryLine('Ingredientes (A)\tCusto dos Ingredientes (B)\tQuantas em Gramas da Embalagem Fechada (C)\tGramas Utilizadas (D)\tQuanto Custou (E)'), true);
    assert.equal(isHeaderOrSummaryLine('Ingrediente\tCusto\tEmbalagem\tQtd Usada'), true);
  });

  it('detecta linhas de resumo e fórmulas do final da planilha', () => {
    assert.equal(isHeaderOrSummaryLine('Total Custo de Ingredientes\t\t\t\t15,50'), true);
    assert.equal(isHeaderOrSummaryLine('Adiciona 25% (custos incalculáveis, gás, luz, etc)'), true);
    assert.equal(isHeaderOrSummaryLine('Multiplica por 3 (seu lucro e mão de obra)'), true);
    assert.equal(isHeaderOrSummaryLine('Rendimento / quantas unidades (F)'), true);
    assert.equal(isHeaderOrSummaryLine('Preço por Unidade'), true);
    assert.equal(isHeaderOrSummaryLine('Preço por Embalagem Individual (G)'), true);
    assert.equal(isHeaderOrSummaryLine('Preço final de venda por unidade'), true);
  });

  it('não confunde ingredientes legítimos com palavras de resumo', () => {
    assert.equal(isHeaderOrSummaryLine('Farinha de Trigo\t6,00\t1000\t250'), false);
    assert.equal(isHeaderOrSummaryLine('Leite Moça\t8,50\t395\t395'), false);
    assert.equal(isHeaderOrSummaryLine('Ovos Médios\t18,00\t30\t4'), false);
  });
});

describe('excelImporter: parseExcelText', () => {
  it('faz o parse correto de dados copiados do Excel (TSV)', () => {
    const rawTsv = `Ingredientes (A)\tCusto dos Ingredientes (B)\tQuantas em Gramas da Embalagem Fechada (C)\tGramas Utilizadas (D)\tQuanto Custou (E)
Farinha de Trigo\tR$ 6,00\t1.000\t250\tR$ 1,50
Açúcar Cristal\t5,00\t1000\t200\t1,00
Ovos\t18,00\t30\t4\t2,40

Total Custo de Ingredientes\t\t\t\t4,90
Adiciona 25% (custos incalculáveis, gás, luz, etc)\t\t\t\t6,12
Multiplica por 3 (seu lucro e mão de obra)\t\t\t\t18,37
Rendimento / quantas unidades (F)\t\t\t10\t
Preço por Unidade\t\t\t\t1,83
Preço por Embalagem Individual (G)\t\t\t\t1,00
Preço final de venda por unidade\t\t\t\t2,83`;

    const parsed = parseExcelText(rawTsv);
    assert.equal(parsed.length, 3);

    assert.equal(parsed[0].rawNome, 'Farinha de Trigo');
    assert.equal(parsed[0].custoEmbalagem, 6);
    assert.equal(parsed[0].qtdEmbalagem, 1000);
    assert.equal(parsed[0].qtdUtilizada, 250);

    assert.equal(parsed[1].rawNome, 'Açúcar Cristal');
    assert.equal(parsed[1].custoEmbalagem, 5);
    assert.equal(parsed[1].qtdEmbalagem, 1000);
    assert.equal(parsed[1].qtdUtilizada, 200);

    assert.equal(parsed[2].rawNome, 'Ovos');
    assert.equal(parsed[2].custoEmbalagem, 18);
    assert.equal(parsed[2].qtdEmbalagem, 30);
    assert.equal(parsed[2].qtdUtilizada, 4);
  });
});

describe('excelImporter: matchParsedRowsWithInventory', () => {
  const fakeInsumos = [
    {
      id: 'i1',
      nome: 'Farinha de Trigo',
      unidade: 'g',
      compras: [{ id: 'c1', data: '2026-09-01', custoTotal: 6.0, quantidadeCompra: 1000 }],
    },
    {
      id: 'i2',
      nome: 'Açúcar Cristal',
      unidade: 'g',
      compras: [{ id: 'c2', data: '2026-09-01', custoTotal: 5.0, quantidadeCompra: 1000 }],
    },
  ];

  it('identifica produto existente com mesmo preço', () => {
    const rows = [{ rawNome: 'Farinha de Trigo', custoEmbalagem: 6.0, qtdEmbalagem: 1000, qtdUtilizada: 200 }];
    const matches = matchParsedRowsWithInventory(rows, fakeInsumos);

    assert.equal(matches[0].status, STATUS_TYPES.EXACT_MATCH_SAME_PRICE);
    assert.equal(matches[0].insumoId, 'i1');
    assert.equal(matches[0].acao, 'use_existing');
  });

  it('identifica produto existente com preço diferente sem acentos/case', () => {
    const rows = [{ rawNome: 'acucar cristal', custoEmbalagem: 7.5, qtdEmbalagem: 1000, qtdUtilizada: 200 }];
    const matches = matchParsedRowsWithInventory(rows, fakeInsumos);

    assert.equal(matches[0].status, STATUS_TYPES.EXACT_MATCH_DIFF_PRICE);
    assert.equal(matches[0].insumoId, 'i2');
    assert.equal(matches[0].precoAtual, 5.0);
    assert.equal(matches[0].acao, 'keep_existing_price');
  });

  it('identifica produto com nome parecido (similaridade) e sugere vincular', () => {
    const rows = [{ rawNome: 'Farinha de Trigo Tradicional Dona Benta', custoEmbalagem: 6.5, qtdEmbalagem: 1000, qtdUtilizada: 250 }];
    const matches = matchParsedRowsWithInventory(rows, fakeInsumos);

    assert.equal(matches[0].status, STATUS_TYPES.SIMILAR_NAME);
    assert.equal(matches[0].insumoId, 'i1');
    assert.equal(matches[0].insumoMatch.nome, 'Farinha de Trigo');
    assert.equal(matches[0].acao, 'use_similar');
  });

  it('identifica produto novo inexistente no inventário', () => {
    const rows = [{ rawNome: 'Cacau em Pó 100%', custoEmbalagem: 22.0, qtdEmbalagem: 500, qtdUtilizada: 80 }];
    const matches = matchParsedRowsWithInventory(rows, fakeInsumos);

    assert.equal(matches[0].status, STATUS_TYPES.NEW_INSUMO);
    assert.equal(matches[0].insumoId, '');
    assert.equal(matches[0].acao, 'create_new');
    assert.equal(matches[0].unidade, 'g');
  });
});
