import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setDb, resetStorageBetweenTests } from './helpers/storageMock.js';

let product;
const seed = () => ({
  products: [
    { id: 'p1', titulo: 'Chocolate', tipoProduto: 'Fatia', tamanho: '', valor: 5, controlaEstoque: true },
    { id: 'p2', titulo: 'Brigadeiro', tipoProduto: 'Punkitos', tamanho: '', valor: 12, controlaEstoque: false },
    { id: 'p3', titulo: 'Red Velvet', tipoProduto: 'Bolo Inteiro', tamanho: 'P', valor: 45, controlaEstoque: true },
  ],
});

before(async () => {
  await setDb(seed());
  product = await import('../js/modules/product.js?v=17');
});
resetStorageBetweenTests();

test('createProduct: normaliza dados padrão', () => {
  const p = product.createProduct({ titulo: '  Bolo de Cenoura  ', valor: '30' });
  assert.equal(p.titulo, 'Bolo de Cenoura');
  assert.equal(p.tipoProduto, 'Fatia');
  assert.equal(p.valor, 30);
  assert.ok(p.id);
});

test('createProduct: tipo inválido vira Fatia, tamanho só em Bolo Inteiro', () => {
  const p1 = product.createProduct({ titulo: 'X', tipoProduto: 'Inexistente', valor: 10 });
  assert.equal(p1.tipoProduto, 'Fatia');
  const p2 = product.createProduct({ titulo: 'X', tipoProduto: 'Bolo Inteiro', tamanho: 'GG', valor: 10 });
  assert.equal(p2.tamanho, 'GG');
  const p3 = product.createProduct({ titulo: 'X', tipoProduto: 'Fatia', tamanho: 'P', valor: 10 });
  assert.equal(p3.tamanho, '');
});

test('createProduct: preserva id fornecido', () => {
  const p = product.createProduct({ id: 'custom-1', titulo: 'A', valor: 1 });
  assert.equal(p.id, 'custom-1');
});

test('createProduct: controlaEstoque default false', () => {
  assert.equal(product.createProduct({ titulo: 'A', valor: 1 }).controlaEstoque, false);
  assert.equal(product.createProduct({ titulo: 'A', valor: 1, controlaEstoque: true }).controlaEstoque, true);
});

test('validateProduct: válido', () => {
  const r = product.validateProduct({ titulo: 'Fatia de chocolate', tipoProduto: 'Fatia', valor: '5' });
  assert.equal(r.valid, true);
});

test('validateProduct: título obrigatório', () => {
  const r = product.validateProduct({ tipoProduto: 'Fatia', valor: '5' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.titulo);
});

test('validateProduct: tipo obrigatório', () => {
  const r = product.validateProduct({ titulo: 'X', valor: '5' });
  assert.equal(r.valid, false);
  assert.ok(r.errors['tipo-produto']);
});

test('validateProduct: Bolo Inteiro exige tamanho', () => {
  const r = product.validateProduct({ titulo: 'X', tipoProduto: 'Bolo Inteiro', valor: '5' });
  assert.equal(r.valid, false);
  assert.ok(r.errors['tamanho-produto']);
});

test('validateProduct: valor negativo inválido', () => {
  const r = product.validateProduct({ titulo: 'X', tipoProduto: 'Fatia', valor: '-1' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.valor);
});

test('findDuplicate: encontra mesmo tipo e título (ignora caixa/espaços)', () => {
  const dup = product.findDuplicate({ titulo: '  CHOCOLATE ', tipoProduto: 'Fatia' });
  assert.equal(dup?.id, 'p1');
});

test('findDuplicate: Bolo Inteiro diferencia tamanho', () => {
  const dupP = product.findDuplicate({ titulo: 'Red Velvet', tipoProduto: 'Bolo Inteiro', tamanho: 'P' });
  assert.equal(dupP.id, 'p3');
  const dupM = product.findDuplicate({ titulo: 'Red Velvet', tipoProduto: 'Bolo Inteiro', tamanho: 'M' });
  assert.equal(dupM, undefined);
});

test('findDuplicate: ignora o próprio id em edição', () => {
  const dup = product.findDuplicate({ id: 'p1', titulo: 'Chocolate', tipoProduto: 'Fatia' }, 'p1');
  assert.equal(dup, undefined);
});

test('matchProduct: casa por tipo+tamanho+valor', () => {
  const item = { tipoProduto: 'Fatia', tamanho: '', valorUnitario: 5 };
  assert.equal(product.matchProduct(item)?.id, 'p1');
  const otraItem = { tipoProduto: 'Bolo Inteiro', tamanho: 'P', valorUnitario: 45 };
  assert.equal(product.matchProduct(otraItem)?.id, 'p3');
});

test('matchProduct: sem casamento devolve undefined', () => {
  assert.equal(product.matchProduct({ tipoProduto: 'Fatia', tamanho: '', valorUnitario: 999 }), undefined);
});

test('matchProduct: desempata pelo título quando há produtos de mesmo valor', async () => {
  await setDb({
    products: [
      { id: 'pA', titulo: 'Fatia A', tipoProduto: 'Fatia', tamanho: '', valor: 10 },
      { id: 'pB', titulo: 'Fatia B', tipoProduto: 'Fatia', tamanho: '', valor: 10 },
    ],
  });
  // SEM o título (sabor) mantém compatibilidade: cai no primeiro com o valor.
  const semTitulo = product.matchProduct({ tipoProduto: 'Fatia', tamanho: '', valorUnitario: 10 });
  assert.ok(['pA', 'pB'].includes(semTitulo?.id));
  // Com o título desanco o produto certo, mesmo com o mesmo preço.
  const comTitulo = product.matchProduct({ tipoProduto: 'Fatia', tamanho: '', sabor: 'Fatia B', valorUnitario: 10 });
  assert.equal(comTitulo?.id, 'pB');
});