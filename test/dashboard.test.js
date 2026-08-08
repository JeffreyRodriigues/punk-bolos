import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../js/modules/dashboardService.js?v=16';

const completed = (obj) => ({ status: 'Concluído', valorTotal: 100, itens: [], ...obj });
const O = {
  ativo: completed({ id: 'a1', data: '2026-08-01', quantidade: 2 }),
  ativo2: completed({ id: 'a2', data: '2026-08-02', quantidade: 3, valorTotal: 50 }),
  cancelado: { id: 'c1', status: 'Cancelado', valorTotal: 500, quantidade: 10, itens: [], data: '2026-08-01' },
  pendente: { id: 'p1', status: 'Pendente', valorTotal: 10, quantidade: 1, itens: [], data: '2026-08-03' },
};

// --- filterByRange ---
test('filterByRange: sem faixa devolve todos', () => {
  assert.equal(s.filterByRange([O.ativo, O.cancelado], {}).length, 2);
});
test('filterByRange: filtra por from/to (ISO)', () => {
  const res = s.filterByRange([O.ativo, O.pendente, O.ativo2], { from: '2026-08-02', to: '2026-08-02' });
  assert.equal(res.length, 1);
  assert.equal(res[0].id, 'a2');
});

// --- isCancelled / activeOrders ---
test('isCancelled: detecta cancelado', () => {
  assert.equal(s.isCancelled(O.cancelado), true);
  assert.equal(s.isCancelled(O.ativo), false);
});
test('activeOrders: exclui cancelados', () => {
  assert.equal(s.activeOrders([O.ativo, O.cancelado, O.ativo2]).length, 2);
});

// --- Indicadores ---
test('revenue: soma valorTotal sem cancelados', () => {
  assert.equal(s.revenue([O.ativo, O.cancelado, O.ativo2]), 150);
});
test('revenue: lista vazia = 0', () => {
  assert.equal(s.revenue([]), 0);
});
test('orderCount: conta apenas não cancelados', () => {
  assert.equal(s.orderCount([O.ativo, O.cancelado, O.ativo2]), 2);
});
test('totalQuantitySold: soma quantidade sem cancelados', () => {
  assert.equal(s.totalQuantitySold([O.ativo, O.cancelado, O.ativo2]), 5);
});
test('ticketMedio: receita ÷ pedidos', () => {
  assert.equal(s.ticketMedio([O.ativo, O.cancelado, O.ativo2]), 75);
});
test('ticketMedio: 0 sem pedidos ativos', () => {
  assert.equal(s.ticketMedio([]), 0);
  assert.equal(s.ticketMedio([O.cancelado]), 0);
});
test('lucroBruto: custo 0 → lucro = receita', () => {
  const r = s.lucroBruto([O.ativo, O.cancelado]);
  assert.deepEqual(r, { receita: 100, custo: 0, lucro: 100 });
});

// --- Distribuição por status ---
test('countByStatus: inclui cancelados', () => {
  const counts = s.countByStatus([O.ativo, O.cancelado, O.pendente]);
  assert.deepEqual(counts, {
    'Pendente': 1, 'Em Produção': 0, 'Embalado': 0, 'Concluído': 1, 'Cancelado': 1,
  });
});
test('countByStatus: status desconhecido é ignorado', () => {
  const counts = s.countByStatus([{ status: 'Estranho' }, O.ativo]);
  assert.deepEqual(counts['Concluído'], 1);
  assert.equal(counts['Estranho'], undefined);
});

// --- Agregações ---
test('dailyRevenue: soma por dia ordenado', () => {
  const res = s.dailyRevenue([O.ativo, O.ativo2]);
  assert.deepEqual(res, [
    { date: '2026-08-01', value: 100 },
    { date: '2026-08-02', value: 50 },
  ]);
});

test('revenueByProduct/quantityByProduct: contam itens dos ativos', () => {
  const orders = [{ status: 'Concluído', itens: [
    { tipoProduto: 'Fatia', quantidade: 2, valorUnitario: 5 },
    { tipoProduto: 'Bolo Inteiro', quantidade: 1, valorUnitario: 45 },
  ]}];
  assert.deepEqual(s.revenueByProduct(orders), { 'Fatia': 10, 'Bolo Inteiro': 45 });
  assert.deepEqual(s.quantityByProduct(orders), { 'Fatia': 2, 'Bolo Inteiro': 1 });
});

test('quantityByFlavor / revenueByFlavor: ignoram sabor vazio e cancelados', () => {
  const orders = [
    { status: 'Concluído', itens: [
      { sabor: 'chocolate', quantidade: 3, valorUnitario: 5 },
      { sabor: ' ', quantidade: 1, valorUnitario: 5 },
    ]},
    { status: 'Cancelado', itens: [
      { sabor: 'chocolate', quantidade: 99, valorUnitario: 99 },
    ]},
  ];
  assert.deepEqual(s.quantityByFlavor(orders), { 'chocolate': 3 });
  assert.deepEqual(s.revenueByFlavor(orders), { 'chocolate': 15 });
});

// --- Rankings ---
test('rankingSabores: ordena e limita', () => {
  const orders = [{ status: 'Concluído', itens: [
    { sabor: 'a', quantidade: 1 },
    { sabor: 'b', quantidade: 5 },
    { sabor: 'c', quantidade: 3 },
  ]}];
  assert.deepEqual(s.rankingSabores(orders, 2), [
    { sabor: 'b', quantidade: 5 },
    { sabor: 'c', quantidade: 3 },
  ]);
});

test('rankingProdutos: ordena e limita', () => {
  const orders = [
    { status: 'Concluído', itens: [
      { tipoProduto: 'Fatia', quantidade: 2 },
      { tipoProduto: 'Punkitos', quantidade: 7 },
      { tipoProduto: 'Bolo Inteiro', quantidade: 3 },
    ]},
  ];
  assert.deepEqual(s.rankingProdutos(orders, 2), [
    { produto: 'Punkitos', quantidade: 7 },
    { produto: 'Bolo Inteiro', quantidade: 3 },
  ]);
});