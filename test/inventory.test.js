import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setDb, resetStorageBetweenTests } from './helpers/storageMock.js';

let inventory;

const seed = ({ insumos = [] } = {}) => ({
  insumos,
  orders: [],
  products: [],
  productions: [],
});

const FARINHA = (compras = [
  { id: 'c1', data: '2026-07-01', custoTotal: 35, quantidadeCompra: 5000 },
]) => ({
  id: 'i-farinha',
  nome: 'Farinha de trigo',
  unidade: 'g',
  descricao: '',
  compras,
});

const LEITE = (compras = [
  { id: 'cl1', data: '2026-07-01', custoTotal: 4.5, quantidadeCompra: 1000 },
]) => ({
  id: 'i-leite',
  nome: 'Leite integral',
  unidade: 'ml',
  descricao: '',
  compras,
});

const OVOS = (compras = [
  { id: 'cov1', data: '2026-07-01', custoTotal: 12, quantidadeCompra: 12 },
]) => ({
  id: 'i-ovos',
  nome: 'Ovos',
  unidade: 'unidade',
  descricao: '',
  compras,
});

before(async () => {
  await setDb(seed());
  inventory = await import('../js/modules/inventory.js?v=1');
});
resetStorageBetweenTests();

// --- createInsumo ---
test('createInsumo: normaliza dados padrão', () => {
  const i = inventory.createInsumo({ nome: '  Farinha  ', unidade: 'g', descricao: '  ' });
  assert.equal(i.nome, 'Farinha');
  assert.equal(i.unidade, 'g');
  assert.equal(i.descricao, '');
  assert.ok(i.id);
  assert.deepEqual(i.compras, []);
});

test('createInsumo: unidade inválida vira unidade', () => {
  assert.equal(inventory.createInsumo({ nome: 'X', unidade: 'tonelada' }).unidade, 'unidade');
});

test('createInsumo: preserva id e compras fornecidas', () => {
  const compras = [
    { id: 'c9', data: '2026-08-01', custoTotal: '10', quantidadeCompra: '2' },
    {},
  ];
  const i = inventory.createInsumo({ id: 'custom', nome: 'A', unidade: 'g', compras });
  assert.equal(i.id, 'custom');
  assert.equal(i.compras.length, 2);
  assert.equal(i.compras[0].custoTotal, 10);
  assert.equal(i.compras[0].quantidadeCompra, 2);
  // compra sem id recebe um id gerado
  assert.ok(i.compras[1].id);
});

// --- validateInsumo ---
test('validateInsumo: válido com compras corretas', () => {
  const r = inventory.validateInsumo({
    nome: 'Farinha',
    unidade: 'g',
    compras: [{ data: '2026-08-01', custoTotal: 35, quantidadeCompra: 5000 }],
  });
  assert.equal(r.valid, true);
});

test('validateInsumo: nome obrigatório', () => {
  const r = inventory.validateInsumo({ unidade: 'g' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.nome);
});

test('validateInsumo: unidade obrigatória', () => {
  const r = inventory.validateInsumo({ nome: 'X' });
  assert.equal(r.valid, false);
  assert.ok(r.errors.unidade);
});

test('validateInsumo: compra sem data, custo zero ou quantidade zero ficam inválidas', () => {
  const r = inventory.validateInsumo({
    nome: 'X',
    unidade: 'g',
    compras: [{ data: '', custoTotal: 0, quantidadeCompra: 0 }],
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors['compras.0.data']);
  assert.ok(r.errors['compras.0.custoTotal']);
  assert.ok(r.errors['compras.0.quantidadeCompra']);
});

// --- validateCompra ---
test('validateCompra: válida uma compra avulsa', () => {
  assert.equal(inventory.validateCompra({ data: '2026-08-01', custoTotal: 35, quantidadeCompra: 5 }).valid, true);
});

test('validateCompra: rejeita custo e quantidade não positivos', () => {
  const r = inventory.validateCompra({ data: '', custoTotal: 0, quantidadeCompra: -1 });
  assert.equal(r.valid, false);
});

// --- custoUnitario / custoUnitarioVigente ---
test('custoUnitario: custoTotal ÷ quantidadeCompra', () => {
  assert.equal(inventory.custoUnitario({ custoTotal: 35, quantidadeCompra: 5 }), 7);
  assert.equal(inventory.custoUnitario({ custoTotal: 4.5, quantidadeCompra: 1 }), 4.5);
  assert.equal(inventory.custoUnitario({ custoTotal: 12, quantidadeCompra: 12 }), 1);
});

test('custoUnitario: 0 quando a compra é inválida', () => {
  assert.equal(inventory.custoUnitario(null), 0);
  assert.equal(inventory.custoUnitario({ custoTotal: 0, quantidadeCompra: 5 }), 0);
  assert.equal(inventory.custoUnitario({ custoTotal: 10, quantidadeCompra: 0 }), 0);
});

test('custoUnitarioVigente: usa a última compra por data', () => {
  const insumo = FARINHA([
    { id: 'c1', data: '2026-07-01', custoTotal: 35, quantidadeCompra: 5 },
    { id: 'c2', data: '2026-08-01', custoTotal: 40, quantidadeCompra: 5 },
  ]);
  assert.equal(inventory.custoUnitarioVigente(insumo), 8);
});

test('custoUnitarioVigente: 0 quando não há compra', () => {
  assert.equal(inventory.custoUnitarioVigente(undefined), 0);
  assert.equal(inventory.custoUnitarioVigente(FARINHA([])), 0);
});

// --- subunidade / fatorConversao / custoPorSubunidade ---
test('subunidade: converte família para a receita', () => {
  assert.equal(inventory.subunidade(FARINHA()), 'g');
  assert.equal(inventory.subunidade(LEITE()), 'ml');
  assert.equal(inventory.subunidade(OVOS()), 'un');
});

test('fatorConversao: kg/L legados = 1000; g/ml/unidade = 1', () => {
  assert.equal(inventory.fatorConversao({ unidade: 'kg' }), 1000);
  assert.equal(inventory.fatorConversao({ unidade: 'L' }), 1000);
  assert.equal(inventory.fatorConversao({ unidade: 'g' }), 1);
  assert.equal(inventory.fatorConversao({ unidade: 'ml' }), 1);
  assert.equal(inventory.fatorConversao({ unidade: 'unidade' }), 1);
  assert.equal(inventory.fatorConversao(FARINHA()), 1);
  assert.equal(inventory.fatorConversao(LEITE()), 1);
  assert.equal(inventory.fatorConversao(OVOS()), 1);
});

test('custoPorSubunidade: kg vira custo por grama', () => {
  // R$ 7,00/kg → R$ 0,007/g
  assert.equal(inventory.custoPorSubunidade(FARINHA()), 0.007);
});

test('custoPorSubunidade: L vira custo por ml', () => {
  // R$ 4,50/L → R$ 0,0045/ml
  assert.equal(inventory.custoPorSubunidade(LEITE()), 0.0045);
});

test('custoPorSubunidade: unidade permanece o custo unitário', () => {
  assert.equal(inventory.custoPorSubunidade(OVOS()), 1);
});

// --- cadastro direto em g/ml (novas unidades) ---
test('INSUMO_UNITS: cadastro oferece g, ml e unidade', () => {
  assert.deepEqual(inventory.INSUMO_UNITS, ['g', 'ml', 'unidade']);
});

test('subunidade: g e ml diretos na receita', () => {
  assert.equal(inventory.subunidade({ unidade: 'g' }), 'g');
  assert.equal(inventory.subunidade({ unidade: 'ml' }), 'ml');
});

test('fatorConversao: g, ml e unidade = 1 (direto)', () => {
  assert.equal(inventory.fatorConversao({ unidade: 'g' }), 1);
  assert.equal(inventory.fatorConversao({ unidade: 'ml' }), 1);
  assert.equal(inventory.fatorConversao({ unidade: 'unidade' }), 1);
});

test('custoPorSubunidade: g é custo por grama direto (fator 1)', () => {
  // R$ 7,00 / 1000g → R$ 0,007/g
  const g = { unidade: 'g', compras: [{ id: 'c', data: '2026-08-01', custoTotal: 7, quantidadeCompra: 1000 }] };
  assert.equal(inventory.custoPorSubunidade(g), 0.007);
});

test('validateInsumo: aceita unidade g', () => {
  const r = inventory.validateInsumo({ nome: 'Açúcar', unidade: 'g' });
  assert.equal(r.valid, true);
});


// --- custoItem ---
test('custoItem: quantidade × custo por subunidade, arredondado', () => {
  // 250g × 0,007 = 1,75
  assert.equal(inventory.custoItem(FARINHA(), 250), 1.75);
  assert.equal(inventory.custoItem(OVOS(), 3), 3);
});

test('custoItem: sem compra devolve 0', () => {
  assert.equal(inventory.custoItem(FARINHA([]), 250), 0);
});

// --- findDuplicate ---
test('findDuplicate: encontra mesmo nome + unidade (ignora caixa/espaços)', () => {
  const list = [FARINHA(), LEITE()];
  const dup = inventory.findDuplicate(list, { nome: '  farinha de TRIGO ', unidade: 'g' });
  assert.equal(dup?.id, 'i-farinha');
});

test('findDuplicate: ignora o próprio id em edição', () => {
  const list = [FARINHA()];
  assert.equal(inventory.findDuplicate(list, { nome: 'Farinha de trigo', unidade: 'g' }, 'i-farinha'), undefined);
});

test('findDuplicate: unidade diferente não duplica', () => {
  const list = [FARINHA()];
  assert.equal(inventory.findDuplicate(list, { nome: 'Farinha de trigo', unidade: 'unidade' }), undefined);
});

// --- getInsumos (via storage) ---
test('getInsumos: lê os insumos da camada de dados', async () => {
  await setDb(seed({ insumos: [FARINHA(), LEITE()] }));
  const inv = await import('../js/modules/inventory.js?v=1');
  assert.equal(inv.getInsumos().length, 2);
  assert.equal(inv.getInsumos()[0].nome, 'Farinha de trigo');
});