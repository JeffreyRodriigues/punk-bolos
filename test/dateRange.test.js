import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toISO, todayISO, presetRange, filterByRange } from '../js/utils/dateRange.js';

const NOW = new Date(2026, 7, 8, 15, 30); // 08/08/2026 15:30 local

test('toISO: formata Data para YYYY-MM-DD local', () => {
  assert.equal(toISO(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(toISO(new Date(2026, 11, 31)), '2026-12-31');
});

test('todayISO: data de hoje no fuso local', () => {
  assert.equal(todayISO(NOW), '2026-08-08');
});

test('presetRange hoje', () => {
  assert.deepEqual(presetRange('hoje', NOW), { from: '2026-08-08', to: '2026-08-08' });
});

test('presetRange ontem', () => {
  assert.deepEqual(presetRange('ontem', NOW), { from: '2026-08-07', to: '2026-08-07' });
});

test('presetRange 7dias (6 dias atrás até hoje)', () => {
  assert.deepEqual(presetRange('7dias', NOW), { from: '2026-08-02', to: '2026-08-08' });
});

test('presetRange 30dias (29 dias atrás até hoje)', () => {
  assert.deepEqual(presetRange('30dias', NOW), { from: '2026-07-10', to: '2026-08-08' });
});

test('presetRange mes: do dia 1 até hoje', () => {
  assert.deepEqual(presetRange('mes', NOW), { from: '2026-08-01', to: '2026-08-08' });
});

test('presetRange mespassado: intervalo completo do mês anterior', () => {
  assert.deepEqual(presetRange('mespassado', NOW), { from: '2026-07-01', to: '2026-07-31' });
});

test('presetRange vira mês no dia 1', () => {
  const first = new Date(2026, 0, 1, 10, 0); // 01/01/2026
  assert.deepEqual(presetRange('ontem', first), { from: '2025-12-31', to: '2025-12-31' });
  assert.deepEqual(presetRange('mes', first), { from: '2026-01-01', to: '2026-01-01' });
  assert.deepEqual(presetRange('mespassado', first), { from: '2025-12-01', to: '2025-12-31' });
});

test('presetRange default/tudo: faixa vazia', () => {
  assert.deepEqual(presetRange('tudo', NOW), { from: '', to: '' });
  assert.deepEqual(presetRange('desconhecido', NOW), { from: '', to: '' });
});

test('filterByRange: sem faixa devolve tudo', () => {
  const orders = [{ data: '2026-08-01' }, { data: '2026-08-20' }];
  assert.equal(filterByRange(orders, {}), orders);
  assert.equal(filterByRange(orders, { from: '', to: '' }), orders);
});

test('filterByRange: filtra por intervalo inclusivo', () => {
  const orders = [
    { data: '2026-08-01' },
    { data: '2026-08-10' },
    { data: '2026-08-20' },
  ];
  const res = filterByRange(orders, { from: '2026-08-05', to: '2026-08-15' });
  assert.equal(res.length, 1);
  assert.equal(res[0].data, '2026-08-10');
});

test('filterByRange: apenas from ou apenas to', () => {
  const orders = [{ data: '2026-07-01' }, { data: '2026-08-15' }];
  assert.deepEqual(filterByRange(orders, { from: '2026-08-01' }).map((o) => o.data), ['2026-08-15']);
  assert.deepEqual(filterByRange(orders, { to: '2026-08-01' }).map((o) => o.data), ['2026-07-01']);
});