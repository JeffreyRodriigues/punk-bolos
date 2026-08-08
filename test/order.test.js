import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setDb, resetStorageBetweenTests } from './helpers/storageMock.js';

let order;
before(() => {
  return setDb().then(() => import('../js/modules/order.js?v=15')).then((m) => { order = m; });
});
resetStorageBetweenTests();

test('nextOrderNumber: começa em 1001 com lista vazia', () => {
  assert.equal(order.nextOrderNumber([]), 1001);
});

test('nextOrderNumber: incrementa a partir do maior número', () => {
  const orders = [{ numero: 1001 }, { numero: 1003 }, { numero: 1002 }];
  assert.equal(order.nextOrderNumber(orders), 1004);
});

test('nextOrderNumber: ignora pedidos sem número', () => {
  assert.equal(order.nextOrderNumber([{}, { numero: 0 }]), 1001);
});

test('calculateTotal: quantidade × valor com arredondamento', () => {
  assert.equal(order.calculateTotal(2, 15.5), 31);
  assert.equal(order.calculateTotal(0.5, 10), 5);
  assert.equal(order.calculateTotal(3, 9.99), 29.97);
});

test('calculateTotal: protege contra NaN', () => {
  assert.equal(order.calculateTotal('abc', 10), 0);
  assert.equal(order.calculateTotal(2, 'x'), 0);
  assert.equal(order.calculateTotal(undefined, 5), 0);
});

test('normalizeItems: remove itens sem produto e sem sabor', () => {
  const result = order.normalizeItems([
    { tipoProduto: 'Fatia', sabor: 'chocolate', quantidade: '2', valorUnitario: '10' },
    { tipoProduto: '', sabor: '' },
    { tipoProduto: '', sabor: ' ' },
    { tipoProduto: 'Punkitos', sabor: '', quantidade: '1', valorUnitario: '12' },
  ]);
  assert.equal(result.length, 2);
  assert.equal(result[0].quantidade, 2);
  assert.equal(result[0].valorUnitario, 10);
  assert.equal(result[1].sabor, '');
});

test('normalizeItems: converte números e trima strings', () => {
  const result = order.normalizeItems([
    { produtoId: 'p1', tipoProduto: '  Bolo Inteiro  ', tamanho: '  P  ', sabor: 'red', quantidade: '1', valorUnitario: '45,5' },
  ]);
  assert.equal(result[0].produtoId, 'p1');
  assert.equal(result[0].tipoProduto, 'Bolo Inteiro');
  assert.equal(result[0].tamanho, 'P');
  assert.equal(result[0].quantidade, 1);
});

test('normalizeItems: não-array devolve []', () => {
  assert.deepEqual(order.normalizeItems(undefined), []);
});

test('totalQuantity: soma quantidades', () => {
  assert.equal(order.totalQuantity([{ quantidade: 2 }, { quantidade: 3 }]), 5);
  assert.equal(order.totalQuantity([]), 0);
  assert.equal(order.totalQuantity(undefined), 0);
});

test('totalValue: soma valor unitário × quantidade dos itens', () => {
  const items = [
    { quantidade: 2, valorUnitario: 10 },
    { quantidade: 1, valorUnitario: 5.5 },
  ];
  assert.equal(order.totalValue(items), 25.5);
});

test('quantityByType: agrupa por tipo', () => {
  const result = order.quantityByType([
    { tipoProduto: 'Fatia', quantidade: 3 },
    { tipoProduto: 'Bolo Inteiro', quantidade: 1 },
    { tipoProduto: 'Outro', quantidade: 9 },
  ]);
  assert.deepEqual(result, { 'Fatia': 3, 'Punkitos': 0, 'Bolo Inteiro': 1 });
});

test('createOrder: monta pedido com agregados calculados', () => {
  const pedido = order.createOrder(
    {
      data: '2026-08-08',
      cliente: '  Maria  ',
      contato: '1199999',
      itens: [{ tipoProduto: 'Fatia', sabor: 'chocolate', quantidade: 2, valorUnitario: 10 }],
      observacoes: '  obs  ',
    },
    1005
  );
  assert.equal(pedido.numero, 1005);
  assert.equal(pedido.cliente, 'Maria');
  assert.equal(pedido.quantidade, 2);
  assert.equal(pedido.valorTotal, 20);
  assert.equal(pedido.status, 'Pendente');
  assert.equal(pedido.pagamento, 'PIX');
  assert.equal(pedido.entrega, 'Retirada');
  assert.equal(pedido.observacoes, 'obs');
  assert.equal(pedido.consomeEstoque, true);
  assert.ok(pedido.id);
});

test('createOrder: consomeEstoque false preservado', () => {
  const p = order.createOrder({ itens: [], consomeEstoque: false }, 1006);
  assert.equal(p.consomeEstoque, false);
});

test('createOrder: pagamento Cortesia zera o valor total', () => {
  const pedido = order.createOrder(
    {
      data: '2026-08-08',
      cliente: 'Maria',
      itens: [{ tipoProduto: 'Fatia', sabor: 'chocolate', quantidade: 4, valorUnitario: 10 }],
      pagamento: 'Cortesia',
    },
    1007
  );
  assert.equal(pedido.valorTotal, 0);
  assert.equal(pedido.pagamento, 'Cortesia');
});

test('createOrder: demais formas mantêm o valor dos itens', () => {
  const pedido = order.createOrder(
    {
      cliente: 'Maria',
      itens: [{ tipoProduto: 'Fatia', quantidade: 3, valorUnitario: 10 }],
      pagamento: 'Crédito',
    },
    1008
  );
  assert.equal(pedido.valorTotal, 30);
});

test('isCortesia: reconhece a forma de pagamento', () => {
  assert.equal(order.isCortesia('Cortesia'), true);
  assert.equal(order.isCortesia('PIX'), false);
  assert.equal(order.isCortesia(undefined), false);
  assert.equal(order.isCortesia(''), false);
});

test('orderTotalValue: zera em cortesia e mantém nos demais', () => {
  const itens = [{ quantidade: 2, valorUnitario: 10 }];
  assert.equal(order.orderTotalValue(itens, 'Cortesia'), 0);
  assert.equal(order.orderTotalValue(itens, 'Dinheiro'), 20);
  assert.equal(order.orderTotalValue(itens, undefined), 20);
});

test('duplicateOrder: reseta status para Pendente e gera novos id/número', () => {
  const original = {
    data: '2026-08-08',
    cliente: 'Ana',
    contato: '1',
    itens: [{ tipoProduto: 'Fatia', sabor: 'x', quantidade: 1, valorUnitario: 5 }],
    status: 'Concluído',
    pagamento: 'Crédito',
    entrega: 'Entrega Própria',
    observacoes: 'obs',
    id: 'orig',
  };
  const copia = order.duplicateOrder(original, 1006);
  assert.equal(copia.numero, 1006);
  assert.equal(copia.status, 'Pendente');
  assert.notEqual(copia.id, 'orig');
  assert.deepEqual(copia.itens, [
    { produtoId: '', tipoProduto: 'Fatia', tamanho: '', sabor: 'x', quantidade: 1, valorUnitario: 5 },
  ]);
  assert.equal(copia.cliente, 'Ana');
  assert.equal(copia.pagamento, 'Crédito');
});

test('validateOrder: válido com data, cliente e itens ok', () => {
  const r = order.validateOrder({
    data: '2026-08-08',
    cliente: 'Maria',
    itens: [{ tipoProduto: 'Fatia', quantidade: 1, valorUnitario: 5 }],
  });
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, {});
});

test('validateOrder: cliente vazio', () => {
  const r = order.validateOrder({ data: 'x', itens: [{ tipoProduto: 'Fatia' }] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.cliente);
});

test('validateOrder: sem itens', () => {
  const r = order.validateOrder({ data: '2026-08-08', cliente: 'Maria', itens: [] });
  assert.equal(r.valid, false);
  assert.ok(r.errors.itens);
});

test('validateOrder: tipo inválido no item', () => {
  const r = order.validateOrder({
    data: '2026-08-08', cliente: 'Maria',
    itens: [{ tipoProduto: 'X', quantidade: 1, valorUnitario: 5 }],
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.itens);
});

test('validateOrder: quantidade 0', () => {
  const r = order.validateOrder({
    data: '2026-08-08', cliente: 'Maria',
    itens: [{ tipoProduto: 'Fatia', quantidade: 0, valorUnitario: 5 }],
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.itens);
});