import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setDb, resetStorageBetweenTests } from './helpers/storageMock.js';

let realtime;
let storage;

before(async () => {
  await setDb();
  storage = await import('../js/modules/storage.js');
  realtime = await import('../js/modules/realtime.js');
});

resetStorageBetweenTests();

test('realtime: isSoundEnabled e toggleSound alternam estado', () => {
  const initial = realtime.isSoundEnabled();
  const toggled = realtime.toggleSound();
  assert.equal(toggled, !initial);
  assert.equal(realtime.isSoundEnabled(), !initial);

  // Restaura para o estado inicial
  const restored = realtime.toggleSound();
  assert.equal(restored, initial);
});

test('realtime: handlePostgresChange com INSERT insere o pedido e dispara callback', () => {
  let receivedOrder = null;
  realtime.setRealtimeListeners({
    onOrderReceived: (order) => {
      receivedOrder = order;
    },
  });

  const payload = {
    data: {
      type: 'INSERT',
      schema: 'public',
      table: 'orders',
      record: {
        id: 'ord-realtime-1',
        numero: 1099,
        cliente: 'Maria Clara Realtime',
        status: 'Pendente',
        pagamento: 'PIX',
        entrega: 'Retirada',
        itens: JSON.stringify([{ tipoProduto: 'Fatia', sabor: 'Chocolate', quantidade: 2, valorUnitario: 15 }]),
        valor_total: 30,
        consome_estoque: true,
      },
    },
  };

  realtime.handlePostgresChange(payload);

  assert.ok(receivedOrder);
  assert.equal(receivedOrder.id, 'ord-realtime-1');
  assert.equal(receivedOrder.numero, 1099);
  assert.equal(receivedOrder.cliente, 'Maria Clara Realtime');

  // Verifica que o pedido foi inserido no storage
  const allOrders = storage.getAll();
  const found = allOrders.find((o) => o.id === 'ord-realtime-1');
  assert.ok(found);
  assert.equal(found.cliente, 'Maria Clara Realtime');
});

test('realtime: handlePostgresChange com UPDATE atualiza o pedido e dispara callback', () => {
  // Cria pedido inicial
  storage.applyRemoteOrderInsert({
    id: 'ord-realtime-2',
    numero: 1100,
    cliente: 'Lucas Silveira',
    status: 'Pendente',
    itens: JSON.stringify([]),
    valor_total: 50,
  });

  let updatedEventCalled = false;
  realtime.setRealtimeListeners({
    onOrderUpdated: (order) => {
      updatedEventCalled = true;
    },
  });

  const payload = {
    data: {
      type: 'UPDATE',
      schema: 'public',
      table: 'orders',
      record: {
        id: 'ord-realtime-2',
        numero: 1100,
        cliente: 'Lucas Silveira',
        status: 'Concluído',
        itens: JSON.stringify([]),
        valor_total: 50,
      },
    },
  };

  realtime.handlePostgresChange(payload);

  assert.ok(updatedEventCalled);
  const found = storage.getAll().find((o) => o.id === 'ord-realtime-2');
  assert.ok(found);
  assert.equal(found.status, 'Concluído');
});

test('realtime: handlePostgresChange com DELETE remove o pedido do storage', () => {
  storage.applyRemoteOrderInsert({
    id: 'ord-realtime-3',
    numero: 1101,
    cliente: 'Ana Beatriz',
    status: 'Pendente',
    itens: JSON.stringify([]),
    valor_total: 25,
  });

  assert.ok(storage.getAll().some((o) => o.id === 'ord-realtime-3'));

  let updatedEventCalled = false;
  realtime.setRealtimeListeners({
    onOrderUpdated: () => {
      updatedEventCalled = true;
    },
  });

  const payload = {
    data: {
      type: 'DELETE',
      schema: 'public',
      table: 'orders',
      old_record: {
        id: 'ord-realtime-3',
      },
    },
  };

  realtime.handlePostgresChange(payload);

  assert.ok(updatedEventCalled);
  assert.equal(storage.getAll().some((o) => o.id === 'ord-realtime-3'), false);
});
