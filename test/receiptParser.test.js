import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeText,
  expandAbbreviations,
  matchInsumo,
  mapPaymentMethod,
  normalizeUnit,
  parseReceiptXml,
  normalizeParsedReceipt,
} from '../js/modules/receiptParser.js';

test('receiptParser — normalizeText e expandAbbreviations', () => {
  assert.equal(normalizeText('Açúcar Refinado União!'), 'acucar refinado uniao');
  assert.equal(normalizeText('MANT. PAUL. C/S 500G'), 'mant paul c s 500g');

  const expanded = expandAbbreviations('AC REF UNIAO 1KG');
  assert.match(expanded, /acucar/);
  assert.match(expanded, /refinado/);
});

test('receiptParser — matchInsumo cruza descrições de notas com insumos do inventário', () => {
  const insumos = [
    { id: 'ins-1', nome: 'Açúcar Refinado', unidade: 'unidade' },
    { id: 'ins-2', nome: 'Manteiga', unidade: 'unidade' },
    { id: 'ins-3', nome: 'Cream Cheese', unidade: 'unidade' },
    { id: 'ins-4', nome: 'Fermento em Pó', unidade: 'unidade' },
    { id: 'ins-5', nome: 'Limão Tahiti', unidade: 'kg' },
    { id: 'ins-6', nome: 'Farinha de Trigo', unidade: 'kg' },
  ];

  // Casamento por abreviações e palavras-chave
  const matchAcucar = matchInsumo('AC REF UNIAO 1KG', insumos);
  assert.ok(matchAcucar);
  assert.equal(matchAcucar.id, 'ins-1');

  const matchManteiga = matchInsumo('MANT PAUL C/S 500G', insumos);
  assert.ok(matchManteiga);
  assert.equal(matchManteiga.id, 'ins-2');

  const matchCreamCheese = matchInsumo('CR CHEESE IPAN 1,2KG', insumos);
  assert.ok(matchCreamCheese);
  assert.equal(matchCreamCheese.id, 'ins-3');

  const matchFermento = matchInsumo('FERM PO OETKER 100G', insumos);
  assert.ok(matchFermento);
  assert.equal(matchFermento.id, 'ins-4');

  const matchLimao = matchInsumo('LIMAO THAITI KG', insumos);
  assert.ok(matchLimao);
  assert.equal(matchLimao.id, 'ins-5');

  // Item não relacionado
  const matchSaco = matchInsumo('SAC 58X70CM CINZA', insumos);
  assert.equal(matchSaco, null);
});

test('receiptParser — mapPaymentMethod mapeia códigos e textos da SEFAZ', () => {
  assert.equal(mapPaymentMethod('01'), 'Dinheiro');
  assert.equal(mapPaymentMethod('03'), 'Cartão de Crédito');
  assert.equal(mapPaymentMethod('04'), 'Cartão de Débito');
  assert.equal(mapPaymentMethod('15'), 'Boleto');
  assert.equal(mapPaymentMethod('17'), 'PIX');
  assert.equal(mapPaymentMethod('PIX'), 'PIX');
  assert.equal(mapPaymentMethod('Cartao Credito'), 'Cartão de Crédito');
});

test('receiptParser — normalizeUnit padroniza unidades', () => {
  assert.equal(normalizeUnit('KG'), 'kg');
  assert.equal(normalizeUnit('QUILO'), 'kg');
  assert.equal(normalizeUnit('GR'), 'g');
  assert.equal(normalizeUnit('LT'), 'l');
  assert.equal(normalizeUnit('ML'), 'ml');
  assert.equal(normalizeUnit('UN'), 'unidade');
  assert.equal(normalizeUnit('PT'), 'unidade');
});

test('receiptParser — parseReceiptXml extrai dados de XML de NF-e', () => {
  const xmlSample = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc>
  <NFe>
    <infNFe>
      <ide>
        <dhEmi>2026-09-04T13:03:00-03:00</dhEmi>
      </ide>
      <emit>
        <xNome>SENDAS DISTRIBUIDORA S/A</xNome>
        <xFant>ASSAI ATACADISTA</xFant>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>3349</cProd>
          <cEAN>3349</cEAN>
          <xProd>LIMAO THAITI KG</xProd>
          <uCom>KG</uCom>
          <qCom>0.326</qCom>
          <vUnCom>11.90</vUnCom>
          <vProd>3.87</vProd>
        </prod>
      </det>
      <det nItem="2">
        <prod>
          <cProd>7896294901948</cProd>
          <cEAN>7896294901948</cEAN>
          <xProd>MANT PAUL C/S 500G</xProd>
          <uCom>PT</uCom>
          <qCom>3.000</qCom>
          <vUnCom>21.90</vUnCom>
          <vProd>65.70</vProd>
        </prod>
      </det>
      <total>
        <ICMSTot>
          <vNF>69.57</vNF>
        </ICMSTot>
      </total>
      <pag>
        <detPag>
          <tPag>17</tPag>
        </detPag>
      </pag>
    </infNFe>
  </NFe>
</nfeProc>`;

  const parsed = parseReceiptXml(xmlSample);
  assert.equal(parsed.fornecedor, 'ASSAI ATACADISTA');
  assert.equal(parsed.data, '2026-09-04');
  assert.equal(parsed.formaPagamento, 'PIX');
  assert.equal(parsed.valorTotal, 69.57);
  assert.equal(parsed.itens.length, 2);
  assert.equal(parsed.itens[0].descricao, 'LIMAO THAITI KG');
  assert.equal(parsed.itens[0].quantidade, 0.326);
  assert.equal(parsed.itens[0].unidade, 'kg');
  assert.equal(parsed.itens[0].custoTotal, 3.87);
  assert.equal(parsed.itens[1].descricao, 'MANT PAUL C/S 500G');
  assert.equal(parsed.itens[1].quantidade, 3);
  assert.equal(parsed.itens[1].unidade, 'unidade');
  assert.equal(parsed.itens[1].custoTotal, 65.70);
});

test('receiptParser — normalizeParsedReceipt valida e calcula totais', () => {
  const raw = {
    fornecedor: ' Atacadão ',
    data: '2026-09-04',
    formaPagamento: 'PIX',
    itens: [
      { descricao: 'Farinha de Trigo 1kg', quantidade: 5, unidade: 'kg', custoTotal: 25.00 },
      { descricao: 'Açúcar Cristal 5kg', quantidade: 2, unidade: 'un', custoTotal: 30.50 },
      { descricao: '', quantidade: 1, unidade: 'un', custoTotal: 10.00 }, // deve ignorar sem descrição
    ],
  };

  const normalized = normalizeParsedReceipt(raw);
  assert.equal(normalized.fornecedor, 'Atacadão');
  assert.equal(normalized.data, '2026-09-04');
  assert.equal(normalized.itens.length, 2);
  assert.equal(normalized.valorTotal, 55.50);
});
