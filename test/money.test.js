import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency, parseMoney, formatDate, formatPrecise } from '../js/utils/money.js?v=13';

const brl = (value) => formatCurrency(value).replace(/\u00A0/g, ' ');

test('formatCurrency: formata números como moeda BRL', () => {
  assert.equal(brl(45), 'R$ 45,00');
  assert.equal(brl(1234.5), 'R$ 1.234,50');
  assert.equal(brl(0), 'R$ 0,00');
});

test('formatCurrency: aceita string numérica e valores inválidos viram R$ 0,00', () => {
  assert.equal(brl('12.9'), 'R$ 12,90');
  assert.equal(brl('abc'), 'R$ 0,00');
  assert.equal(brl(undefined), 'R$ 0,00');
  assert.equal(brl(null), 'R$ 0,00');
});

test('formatPrecise: exibe N casas decimais (custo por ml/g)', () => {
  const brl4 = (v) => formatPrecise(v, 4).replace(/\u00A0/g, ' ');
  assert.equal(brl4(0.0053), 'R$ 0,0053');
  assert.equal(brl4(45), 'R$ 45,0000');
  assert.equal(brl4(0), 'R$ 0,0000');
  assert.equal(brl4(0.0053), 'R$ 0,0053'); // default = 4 casas
});

test('parseMoney: número passthrough', () => {
  assert.equal(parseMoney(45), 45);
  assert.equal(parseMoney(45.9), 45.9);
  assert.equal(parseMoney(0), 0);
});

test('parseMoney: converte vírgula decimal', () => {
  assert.equal(parseMoney('45,90'), 45.9);
  assert.equal(parseMoney('12,5'), 12.5);
});

test('parseMoney: ponto decimal sem vírgula é decimal', () => {
  assert.equal(parseMoney('12.90'), 12.9);
});

test('parseMoney: remove pontos de milhar', () => {
  assert.equal(parseMoney('1.234,56'), 1234.56);
});

test('parseMoney: vazio/inválido devolve 0', () => {
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney('   '), 0);
  assert.equal(parseMoney('abc'), 0);
});

test('formatDate: converte ISO para DD/MM/AAAA', () => {
  assert.equal(formatDate('2026-08-08'), '08/08/2026');
});

test('formatDate: vazio ou sem dia/mês/ano devolve string original', () => {
  assert.equal(formatDate(''), '');
  assert.equal(formatDate(null), '');
  assert.equal(formatDate(undefined), '');
  assert.equal(formatDate('2026'), '2026');
});