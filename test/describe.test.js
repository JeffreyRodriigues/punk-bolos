import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeItens, sortKey, defaultItemType } from '../js/utils/describe.js';

test('describeItens: monta lista "qtd× sabor"', () => {
  const o = { itens: [
    { quantidade: 2, sabor: 'Fatia de chocolate', tipoProduto: 'Fatia' },
    { quantidade: 1, sabor: 'Red Velvet', tipoProduto: 'Bolo Inteiro' },
  ]};
  assert.equal(describeItens(o), '2× Fatia de chocolate · 1× Red Velvet');
});

test('describeItens: usa tipo quando não há sabor', () => {
  const o = { itens: [{ quantidade: 1, tipoProduto: 'Punkitos' }] };
  assert.equal(describeItens(o), '1× Punkitos');
});

test('describeItens: sem itens devolve "—"', () => {
  assert.equal(describeItens({ itens: [] }), '—');
  assert.equal(describeItens({}), '—');
  assert.equal(describeItens(undefined), '—');
});

test('sortKey: normaliza caixa e acentos', () => {
  assert.equal(sortKey('Coração'), 'coracao');
  assert.equal(sortKey('BOLO M'), 'bolo m');
  assert.equal(sortKey(''), '');
  assert.equal(sortKey(undefined), '');
});

test('defaultItemType: primeiro tipo com produtos', () => {
  const products = [
    { tipoProduto: 'Bolo Inteiro' },
    { tipoProduto: 'Fatia' },
  ];
  const types = ['Fatia', 'Punkitos', 'Bolo Inteiro'];
  assert.equal(defaultItemType(products, types), 'Fatia');
});

test('defaultItemType: fallback para Fatia quando só tem tipos sem produtos', () => {
  const products = [{ tipoProduto: 'Bolo Inteiro' }];
  const types = ['Fatia', 'Punkitos', 'Bolo Inteiro'];
  assert.equal(defaultItemType(products, types), 'Bolo Inteiro');
});

test('defaultItemType: catálogo vazio devolve Fatia', () => {
  assert.equal(defaultItemType([], ['Fatia', 'Punkitos', 'Bolo Inteiro']), 'Fatia');
  assert.equal(defaultItemType(undefined, ['Fatia']), 'Fatia');
});