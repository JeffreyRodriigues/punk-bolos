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
  product = await import('../js/modules/product.js');
});
resetStorageBetweenTests();

test('createProduct: normaliza dados padrão', () => {
  const p = product.createProduct({ titulo: '  Bolo de Cenoura  ', valor: '30' });
  assert.equal(p.titulo, 'Bolo de Cenoura');
  assert.equal(p.tipoProduto, 'Fatia');
  assert.equal(p.valor, 30);
  assert.ok(p.id);
});

test('createProduct: tipo inválido vira Fatia, tamanho só em Bolo Inteiro e Bolo Naked', () => {
  const p1 = product.createProduct({ titulo: 'X', tipoProduto: 'Inexistente', valor: 10 });
  assert.equal(p1.tipoProduto, 'Fatia');
  const p2 = product.createProduct({ titulo: 'X', tipoProduto: 'Bolo Inteiro', tamanho: 'GG', valor: 10 });
  assert.equal(p2.tamanho, 'GG');
  const p2Naked = product.createProduct({ titulo: 'X', tipoProduto: 'Bolo Naked', tamanho: 'M', valor: 10 });
  assert.equal(p2Naked.tamanho, 'M');
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

test('validateProduct: Bolo Inteiro e Bolo Naked exigem tamanho', () => {
  const r1 = product.validateProduct({ titulo: 'X', tipoProduto: 'Bolo Inteiro', valor: '5' });
  assert.equal(r1.valid, false);
  assert.ok(r1.errors['tamanho-produto']);
  const r2 = product.validateProduct({ titulo: 'X', tipoProduto: 'Bolo Naked', valor: '5' });
  assert.equal(r2.valid, false);
  assert.ok(r2.errors['tamanho-produto']);
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

test('matchProduct: resolve bolo com nome composto e tamanho descritivo', async () => {
  await setDb({
    products: [
      { id: 'pNakedPink', titulo: 'Pink Lemonade', tipoProduto: 'Bolo Naked', tamanho: 'P', valor: 120 },
      { id: 'pDecorRed', titulo: 'Red Velvet', tipoProduto: 'Bolo Inteiro', tamanho: 'M', valor: 170 },
      { id: 'pGranulado', titulo: 'Granulado Belga', tipoProduto: 'Adicional', tamanho: '', valor: 10 },
    ],
  });

  // Nome composto vindo de pedido legado ou do wizard com adicionais agregados no preço
  const itemNaked = {
    tipoProduto: 'Bolo Naked',
    tamanho: 'Bolo P (15cm)',
    sabor: 'Naked Cake Pink Lemonade (Bolo P (15cm))',
    valorUnitario: 145, // Preço com adicional somado
  };
  const match = product.matchProduct(itemNaked);
  assert.equal(match?.id, 'pNakedPink');

  const itemAdicional = {
    tipoProduto: 'Adicional',
    tamanho: '',
    sabor: 'Granulado Belga',
    valorUnitario: 10,
  };
  const matchAdc = product.matchProduct(itemAdicional);
  assert.equal(matchAdc?.id, 'pGranulado');
});

test('matchProduct: casa Decoração e Adicional de forma flexível (Granulado, Papel Arroz)', async () => {
  await setDb({
    products: [
      { id: 'pPapel', titulo: 'Papel Arroz', tipoProduto: 'Decoração', tamanho: '', valor: 15 },
      { id: 'pConfeitoGranulado', titulo: 'Confeito Granulado Belga Callebaut', tipoProduto: 'Adicional', tamanho: '', valor: 10 },
    ],
  });

  // Decoração Papel Arroz casa com Papel Arroz (tipo Decoração)
  const itemPapel = { tipoProduto: 'Decoração', sabor: 'Decoração Papel Arroz', valorUnitario: 15 };
  assert.equal(product.matchProduct(itemPapel)?.id, 'pPapel');

  // Decoração Granulado casa com Confeito Granulado Belga Callebaut (tipo Adicional)
  const itemGranulado = { tipoProduto: 'Decoração', sabor: 'Decoração Granulado', valorUnitario: 10 };
  assert.equal(product.matchProduct(itemGranulado)?.id, 'pConfeitoGranulado');

  // Sabor Granulado simples
  const itemGranSimples = { tipoProduto: 'Decoração', sabor: 'Granulado', valorUnitario: 10 };
  assert.equal(product.matchProduct(itemGranSimples)?.id, 'pConfeitoGranulado');
});

test('ensureProduct: cria o produto no catálogo se ele não existir', async () => {
  const initialCount = product.getProducts().length;

  const itemBoloNovo = {
    tipoProduto: 'Bolo Inteiro',
    tamanho: 'P',
    sabor: 'Maracujá com Chocolate Branco',
    valorUnitario: 130,
  };

  const createdBolo = product.ensureProduct(itemBoloNovo);
  assert.ok(createdBolo?.id);
  assert.equal(createdBolo.titulo, 'Maracujá com Chocolate Branco');
  assert.equal(createdBolo.tipoProduto, 'Bolo Inteiro');
  assert.equal(createdBolo.tamanho, 'P');
  assert.equal(createdBolo.valor, 130);
  assert.equal(product.getProducts().length, initialCount + 1);

  // Segunda chamada retorna o produto já existente sem duplicar
  const existing = product.ensureProduct(itemBoloNovo);
  assert.equal(existing.id, createdBolo.id);
  assert.equal(product.getProducts().length, initialCount + 1);
});

test('inferProductType: infere corretamente Bolo Inteiro, Bolo Naked e Decoração sem cair em Fatia', () => {
  // Sabor com Bolo ou tamanho presente -> Bolo Inteiro
  assert.equal(product.inferProductType({ sabor: 'Bolo de Cenoura', tamanho: 'M' }), 'Bolo Inteiro');
  assert.equal(product.inferProductType({ sabor: 'Red Velvet', tamanho: 'P' }), 'Bolo Inteiro');
  assert.equal(product.inferProductType({ sabor: 'Bolo Pink Lemonade' }), 'Bolo Inteiro');

  // Sabor com Naked -> Bolo Naked
  assert.equal(product.inferProductType({ sabor: 'Naked Cake Pink Lemonade', tamanho: 'P' }), 'Bolo Naked');
  assert.equal(product.inferProductType({ sabor: 'Bolo Naked Frutas Vermelhas' }), 'Bolo Naked');

  // Confeitos / Decorações
  assert.equal(product.inferProductType({ sabor: 'Papel Arroz' }), 'Decoração');
  assert.equal(product.inferProductType({ sabor: 'Confeito Granulado Belga' }), 'Decoração');
  assert.equal(product.inferProductType({ sabor: 'Decoração Granulado' }), 'Decoração');

  // Fatia real
  assert.equal(product.inferProductType({ sabor: 'Fatia de Chocolate' }), 'Fatia');
  assert.equal(product.inferProductType({ tipoProduto: 'Fatia', sabor: 'Chocolate Tradicional' }), 'Fatia');
});

test('ensureProduct: não herda produtoId de fatia quando o item for Bolo Inteiro ou Bolo Naked', async () => {
  await setDb({
    products: [
      { id: 'pFatiaTiramissu', titulo: 'Tiramissu', tipoProduto: 'Fatia', tamanho: '', valor: 22 },
    ],
  });

  // Item de bolo com ID apontando para a fatia
  const itemBoloTiramissu = {
    produtoId: 'pFatiaTiramissu',
    tipoProduto: 'Bolo Inteiro',
    tamanho: 'P',
    sabor: 'Tiramissu',
    valorUnitario: 120,
  };

  const boloResult = product.ensureProduct(itemBoloTiramissu);
  assert.notEqual(boloResult.id, 'pFatiaTiramissu');
  assert.equal(boloResult.tipoProduto, 'Bolo Inteiro');
  assert.equal(boloResult.tamanho, 'P');
  assert.equal(boloResult.titulo, 'Tiramissu');
  assert.equal(boloResult.valor, 120);
});

test('createProduct e validateProduct com tipo Docinho', () => {
  const p = product.createProduct({ titulo: 'Brigadeiro', tipoProduto: 'Docinho', valor: 4 });
  assert.equal(p.tipoProduto, 'Docinho');
  assert.equal(p.tamanho, '');
  const val = product.validateProduct(p);
  assert.equal(val.valid, true);
});