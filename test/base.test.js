import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setDb, resetStorageBetweenTests } from './helpers/storageMock.js';

let base;
let inventory;

const seed = ({ insumos = [], bases = [] } = {}) => ({
  insumos,
  bases,
  orders: [],
  products: [],
  productions: [],
});

const FARINHA = {
  id: 'i-farinha',
  nome: 'Farinha de trigo',
  unidade: 'g',
  compras: [{ id: 'c1', data: '2026-07-01', custoTotal: 10, quantidadeCompra: 1000 }],
};

before(async () => {
  await setDb(seed({ insumos: [FARINHA] }));
  base = await import('../js/modules/base.js');
  inventory = await import('../js/modules/inventory.js');
});
resetStorageBetweenTests();

test('nextBaseCodigo: gera PBA0001 com lista vazia e incrementa', () => {
  assert.equal(base.nextBaseCodigo([]), 'PBA0001');
  assert.equal(base.nextBaseCodigo([{ codigo: 'PBA0001' }, { codigo: 'PBA0003' }]), 'PBA0004');
});

test('createBase: normaliza campos e atribui código se lista passada', () => {
  const b = base.createBase(
    {
      nome: 'Massa Chiffon',
      rendimento: 1,
      rendimentoUnidade: 'unidade',
      estoqueAtual: 4,
      estoqueMinimo: 2,
      componentes: [{ insumoId: 'i-farinha', quantidade: 200 }],
    },
    []
  );

  assert.equal(b.nome, 'Massa Chiffon');
  assert.equal(b.codigo, 'PBA0001');
  assert.equal(b.estoqueAtual, 4);
  assert.equal(b.estoqueMinimo, 2);
  assert.equal(b.componentes.length, 1);
});

test('validateBase: valida obrigatoriedade de nome, rendimento e componentes', () => {
  const v1 = base.validateBase({});
  assert.equal(v1.valid, false);
  assert.ok(v1.errors.nome);
  assert.ok(v1.errors.rendimento);
  assert.ok(v1.errors.componentes);

  const v2 = base.validateBase({
    nome: 'Massa',
    rendimento: 1,
    componentes: [{ insumoId: 'i-farinha', quantidade: 100 }],
  });
  assert.equal(v2.valid, true);
});
