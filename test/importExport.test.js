import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setDb, resetStorageBetweenTests } from './helpers/storageMock.js';

let ie;

const produtos = [
  { id: 'p1', titulo: 'Chocolate', tipoProduto: 'Fatia', valor: 5, controlaEstoque: false },
  { id: 'p2', titulo: 'Red Velvet', tipoProduto: 'Bolo Inteiro', tamanho: 'P', valor: 45, controlaEstoque: false },
];

before(async () => {
  await setDb({ products: produtos });
  ie = await import('../js/modules/importExport.js?v=16');
});
resetStorageBetweenTests();

test('buildCsv: gera CSV com cabeçalho e uma linha por item', () => {
  const orders = [{
    numero: 1001, data: '2026-08-01', cliente: 'Maria', contato: '1', status: 'Concluído',
    pagamento: 'PIX', entrega: 'Retirada', observacoes: 'obs; vírgula',
    itens: [
      { tipoProduto: 'Fatia', tamanho: '', sabor: 'Chocolate', quantidade: 2, valorUnitario: 5 },
      { tipoProduto: 'Bolo Inteiro', tamanho: 'P', sabor: 'Red Velvet', quantidade: 1, valorUnitario: 45 },
    ],
  }];
  const csv = ie.buildCsv(orders);
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], 'numero;data;cliente;contato;status;pagamento;entrega;observacoes;tipo;tamanho;sabor;quantidade;valor_unitario');
  assert.equal(lines.length, 3); // header + 2 itens
  assert.ok(lines[1].includes('Maria'));
  assert.ok(lines[2].includes('Bolo Inteiro;P;Red Velvet'));
});

test('buildCsv: escapa aspas e ponto-e-vírgula', () => {
  const orders = [{
    numero: 1002, data: '2026-08-02', cliente: 'João "Jr"', contato: '', status: 'Pendente',
    pagamento: 'PIX', entrega: 'Retirada', observacoes: 'obs; "x"', itens: [{}],
  }];
  const csv = ie.buildCsv(orders);
  assert.ok(csv.includes('"João ""Jr"""'));
});

test('importCsv: reconhece modelo, casa produtos existentes e cria pedidos', async () => {
  const csv = [
    'numero;data;cliente;contato;status;pagamento;entrega;observacoes;tipo;tamanho;sabor;quantidade;valor_unitario',
    '1001;2026-08-01;Maria;999;Concluído;PIX;Retirada;;Fatia;;Chocolate;2;5',
    '1001;2026-08-01;Maria;999;Concluído;PIX;Retirada;;Bolo Inteiro;P;Red Velvet;1;45',
  ].join('\r\n');

  const res = await setDb({ products: produtos }).then(() => ie.importCsv(csv, { dryRun: true }));
  assert.equal(res.ok, true);
  assert.equal(res.pedidos, 1);
  assert.equal(res.itens, 2);
  assert.equal(res.produtosCriados, 0); // ambos já existem no catálogo
});

test('importCsv: cria produtos que não existem no catálogo (dryRun não grava)', async () => {
  const csv = [
    'numero;data;cliente;tipo;tamanho;sabor;quantidade;valor_unitario',
    '1;2026-08-01;Novo;Fatia;;Brigadeiro;3;6',
  ].join('\r\n');

  const res = await setDb({ products: produtos }).then(() => ie.importCsv(csv, { dryRun: true }));
  assert.equal(res.ok, true);
  assert.equal(res.produtosCriados, 1);
  assert.equal(res.produtos[0], 'Brigadeiro (Fatia)');
});

test('importCsv: traduz rótulos de planilha (Bolo, Bento, Uber pelo cliente)', async () => {
  const csv = [
    'numero;data;cliente;tipo;tamanho;sabor;quantidade;valor_unitario',
    '5;01/08/2026;Ana;Bolo;M;Bento de morango;1;60',
  ].join('\r\n');

  const res = await setDb({ products: produtos }).then(() => ie.importCsv(csv, { dryRun: true }));
  assert.equal(res.ok, true);
  assert.equal(res.produtos[0], 'Bento de morango (Bolo Inteiro M)');
  const storage = (await import('../js/modules/storage.js?v=13'));
  assert.equal(storage.getAll().length, 0); // dryRun não persistiu
});

test('importCsv: cabeçalho não encontrado', async () => {
  const res = await setDb({ products: produtos }).then(() =>
    ie.importCsv('a;b;c\r\nd;e;f\r\ng;h;i', { dryRun: true })
  );
  assert.equal(res.ok, false);
  assert.ok(res.message.includes('Cabeçalho'));
});

test('importCsv: arquivo vazio', async () => {
  const res = await setDb({ products: produtos }).then(() => ie.importCsv('', { dryRun: true }));
  assert.equal(res.ok, false);
});

test('importCsv: ignora linhas com sabor vazio e reporta erro', async () => {
  const csv = [
    'numero;data;cliente;tipo;sabor;quantidade;valor_unitario',
    '1;2026-08-01;A;Fatia;;2;5',
  ].join('\r\n');
  const res = await setDb({ products: produtos }).then(() => ie.importCsv(csv, { dryRun: true }));
  assert.equal(res.ok, false);
  assert.equal(res.erros.length, 1);
});