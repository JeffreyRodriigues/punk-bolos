import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { setDb, resetStorageBetweenTests } from './helpers/storageMock.js';

let estoque;

const P_FATIA = { id: 'f1', titulo: 'Chocolate', tipoProduto: 'Fatia', valor: 5, controlaEstoque: true };
const P_BOLO = { id: 'b1', titulo: 'Red Velvet', tipoProduto: 'Bolo Inteiro', tamanho: 'P', valor: 45, controlaEstoque: true };
const P_ILIMITADO = { id: 'i1', titulo: 'Brigadeiro', tipoProduto: 'Punkitos', valor: 12, controlaEstoque: false };

const seed = ({ orders = [], productions = [] } = {}) => {
  const products = [P_FATIA, P_BOLO, P_ILIMITADO];
  const merged = [...orders];
  if (!merged.some((o) => o.id === 'o-concluido')) {
    merged.push({
      id: 'o-concluido',
      numero: 1001,
      cliente: 'A',
      num: 0,
      itens: [{ produtoId: 'f1', tipoProduto: 'Fatia', tamanho: '', sabor: 'x', quantidade: 2, valorUnitario: 5 }],
      quantidade: 2,
      status: 'Concluído',
      consomeEstoque: true,
    });
  }
  return { orders: merged, products, productions };
};

const PEDIDO_PENDENTE = (quantidade = 3, id = 'o-pendente') => ({
  id,
  numero: 1002,
  cliente: 'B',
  num: 0,
  itens: [{ produtoId: 'f1', tipoProduto: 'Fatia', tamanho: '', sabor: 'x', quantidade, valorUnitario: 5 }],
  quantidade,
  status: 'Pendente',
  consomeEstoque: true,
});

before(() => {
  return setDb(seed()).then(() => import('../js/modules/estoque.js?v=17')).then((m) => { estoque = m; });
});
resetStorageBetweenTests();

// --- resolveProduct ---
test('resolveProduct: casa via produtoId quando disponível', () => {
  const item = { produtoId: 'f1', tipoProduto: 'Fatia', valorUnitario: 5 };
  const p = estoque.resolveProduct(item);
  assert.equal(p.id, 'f1');
});

test('resolveProduct: cai no matchProduct sem produtoId', () => {
  const item = { tipoProduto: 'Bolo Inteiro', tamanho: 'P', valorUnitario: 45 };
  assert.equal(estoque.resolveProduct(item).id, 'b1');
});

test('resolveProduct: item inválido devolve undefined', () => {
  assert.equal(estoque.resolveProduct(undefined), undefined);
  assert.equal(estoque.resolveProduct(null), undefined);
});

// --- totalProduzido ---
test('totalProduzido: soma produções por produto', () => {
  const producoes = [
    { produtoId: 'f1', quantidade: 10 },
    { produtoId: 'f1', quantidade: 5 },
    { produtoId: 'b1', quantidade: 2 },
  ];
  return setDb(seed({ productions: producoes }))
    .then(async () => {
      await import('../js/modules/estoque.js?v=17');
      const esp = await import('../js/modules/estoque.js?v=17');
      assert.equal(esp.totalProduzido('f1'), 15);
      assert.equal(esp.totalProduzido('b1'), 2);
      assert.equal(esp.totalProduzido('nao-existe'), 0);
    });
});

// --- totalVendido / disponivel ---
test('totalVendido: só conta Concluído com consomeEstoque', async () => {
  await setDb(seed());
  const esp = await import('../js/modules/estoque.js?v=17');
  assert.equal(esp.totalVendido('f1'), 2);
});

test('disponivel: produzido - vendido', async () => {
  const produ = [{ produtoId: 'f1', quantidade: 10 }];
  await setDb(seed({ productions: produ }));
  const esp = await import('../js/modules/estoque.js?v=17');
  assert.equal(esp.disponivel(P_FATIA), 8);
});

test('disponivel: sem produções fica negativo quando vendido', async () => {
  await setDb(seed());
  const esp = await import('../js/modules/estoque.js?v=17');
  assert.equal(esp.disponivel(P_FATIA), -2);
});

test('disponivel: Infinity nunca mais — produto sem produção fica com disponível negativo quando vendido', async () => {
  await setDb(seed());
  const esp = await import('../js/modules/estoque.js?v=17');
  assert.equal(esp.disponivel(P_ILIMITADO), 0);
  assert.equal(esp.disponivel(P_FATIA), -2);
});

test('disponivel: undefined', async () => {
  await setDb(seed());
  const esp = await import('../js/modules/estoque.js?v=17');
  assert.equal(esp.disponivel(undefined), 0);
});

// --- totalReservado / reserva ---
test('totalReservado: conta pedidos pendentes que consomem estoque', async () => {
  await setDb(seed({ orders: [PEDIDO_PENDENTE(3)] }));
  const esp = await import('../js/modules/estoque.js?v=17');
  assert.equal(esp.totalReservado('f1'), 3);
});

test('totalReservado: desconsidera cancelados, importados s/ consumo e desconta vendidos', async () => {
  await setDb(seed({
    orders: [
      PEDIDO_PENDENTE(2, 'o-pen'),
      { ...PEDIDO_PENDENTE(5, 'o-canc'), status: 'Cancelado' },
      { ...PEDIDO_PENDENTE(7, 'o-imp'), consomeEstoque: false },
      { ...PEDIDO_PENDENTE(11, 'o-emprod'), status: 'Em Produção' },
      { ...PEDIDO_PENDENTE(13, 'o-emb'), status: 'Embalado' },
    ],
  }));
  const esp = await import('../js/modules/estoque.js?v=17');
  // PEDIDO_PENDENTE(2) + Em Produção(11) + Embalado(13) — o-concluido não
  // é reserva (é venda), cancelado e importado não contam.
  assert.equal(esp.totalReservado('f1'), 26);
});

test('disponivel: produzido - reservado - vendido', async () => {
  const produ = [{ produtoId: 'f1', quantidade: 10 }];
  await setDb(seed({ orders: [PEDIDO_PENDENTE(3)], productions: produ }));
  const esp = await import('../js/modules/estoque.js?v=17');
  // 10 produzido - 3 reservado - 2 vendido (o-concluido) = 5
  assert.equal(esp.disponivel(P_FATIA), 5);
});

test('disponivel: com reserva igual a produção, bloqueia novos pedidos', async () => {
  const produ = [{ produtoId: 'f1', quantidade: 5 }];
  await setDb(seed({ orders: [PEDIDO_PENDENTE(3)], productions: produ }));
  const esp = await import('../js/modules/estoque.js?v=17');
  const itens = [{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 4 }];
  const erros = esp.validateItens(itens);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].reservado, 3);
});

test('disponivel: excludeOrderId ignora o próprio pedido em andamento', async () => {
  const produ = [{ produtoId: 'f1', quantidade: 5 }];
  await setDb(seed({ orders: [PEDIDO_PENDENTE(3)], productions: produ }));
  const esp = await import('../js/modules/estoque.js?v=17');
  // Com o próprio pedido contando: 5 prod - 3 reserv - 2 vend = 0
  assert.equal(esp.disponivel(P_FATIA), 0);
  // Excluindo o próprio pedido: 5 prod - 0 reserv - 2 vend = 3
  assert.equal(esp.disponivel(P_FATIA, 'o-pendente'), 3);
});

test('validateItens: só bloqueia quando reservado + vendido excede produção', async () => {
  const produ = [{ produtoId: 'f1', quantidade: 10 }];
  await setDb(seed({ orders: [PEDIDO_PENDENTE(3)], productions: produ }));
  const esp = await import('../js/modules/estoque.js?v=17');
  // 10 - 3 reservado - 2 vendido = 5 disponíveis; vender 5 passa
  assert.deepEqual(esp.validateItens([{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 5 }]), []);
  // vender 6 não passa
  const erros = esp.validateItens([{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 6 }]);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].reservado, 3);
  assert.equal(erros[0].faltante, 1);
});

test('describeErro: menciona a quantidade reservada', async () => {
  const produzido1 = [{ produtoId: 'f1', quantidade: 8 }];
  await setDb(seed({ orders: [PEDIDO_PENDENTE(5)], productions: produzido1 }));
  const esp = await import('../js/modules/estoque.js?v=17');
  const erros = esp.validateItens([{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 4 }]);
  const msg = esp.describeErro(erros[0]);
  assert.match(msg, /reservado/i);
  assert.match(msg, /faltam/);
});

// --- validateItens ---
test('validateItens: nenhum erro quando estoque suficiente', async () => {
  const produc = [{ produtoId: 'f1', quantidade: 10 }];
  await setDb(seed({ productions: produc }));
  const esp = await import('../js/modules/estoque.js?v=17');
  const itens = [{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 3 }];
  assert.deepEqual(esp.validateItens(itens), []);
});

test('validateItens: erro quando excede o disponível', async () => {
  const produc = [{ produtoId: 'f1', quantidade: 1 }];
  await setDb(seed({ productions: produc }));
  const esp = await import('../js/modules/estoque.js?v=17');
  const itens = [{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 5 }];
  const erros = esp.validateItens(itens);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].disponivel, -1);
  assert.equal(erros[0].produzido, 1);
  assert.equal(erros[0].faltante, 6);
});

test('validateItens: erro quando produto nunca foi produzido', async () => {
  await setDb(seed());
  const esp = await import('../js/modules/estoque.js?v=17');
  const itens = [{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 1 }];
  const erros = esp.validateItens(itens);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].produzido, 0);
  assert.equal(erros[0].disponivel, -2);
});

test('validateItens: valida produto mesmo sem controle de estoque', async () => {
  await setDb(seed());
  const esp = await import('../js/modules/estoque.js?v=17');
  const itens = [{ produtoId: 'i1', tipoProduto: 'Punkitos', quantidade: 999 }];
  const erros = esp.validateItens(itens);
  assert.equal(erros.length, 1);
  assert.equal(erros[0].produzido, 0);
});

test('validateItens: excludeOrderId evita contar o próprio pedido', async () => {
  const produc = [{ produtoId: 'f1', quantidade: 3 }];
  await setDb(seed({ productions: produc }));
  const esp = await import('../js/modules/estoque.js?v=17');
  const itens = [{ produtoId: 'f1', tipoProduto: 'Fatia', quantidade: 2 }];
  const comExclusao = esp.validateItens(itens, { excludeOrderId: 'o-concluido' });
  assert.deepEqual(comExclusao, []);
  const semExclusao = esp.validateItens(itens);
  assert.equal(semExclusao.length, 1);
});

// --- nomeProduto / stockStatus ---
test('nomeProduto: Bolo Inteiro inclui tamanho', () => {
  assert.equal(estoque.nomeProduto(P_BOLO), 'Red Velvet (P)');
  assert.equal(estoque.nomeProduto(P_FATIA), 'Chocolate (Fatia)');
});

test('nomeProduto: vazio devolve vazio', () => {
  assert.equal(estoque.nomeProduto(undefined), '');
});

test('stockStatus: classicacao por nível', () => {
  assert.equal(estoque.stockStatus(0), 'empty');
  assert.equal(estoque.stockStatus(-3), 'empty');
  assert.equal(estoque.stockStatus(3), 'low');
  assert.equal(estoque.stockStatus(5), 'low');
  assert.equal(estoque.stockStatus(6), 'ok');
});

// --- describeErro ---
test('describeErro: sem produção registrada', () => {
  const erro = { produto: P_FATIA, produzido: 0, disponivel: -2, faltante: 3 };
  const msg = estoque.describeErro(erro);
  assert.match(msg, /sem produção registrada/i);
  assert.match(msg, /Chocolate/);
});

test('describeErro: produção insuficiente', () => {
  const erro = { produto: P_FATIA, produzido: 2, disponivel: 0, faltante: 3 };
  const msg = estoque.describeErro(erro);
  assert.match(msg, /disponível: 0/);
  assert.match(msg, /faltam 3/);
});

test('describeErro: produto indefinido não quebra', () => {
  const erro = { produto: undefined, produzido: 0, disponivel: 0, faltante: 1 };
  assert.match(estoque.describeErro(erro), /sem produção registrada/i);
});

// --- produtosDisponiveis ---
test('produtosDisponiveis: filtra produtos sem estoque para venda', async () => {
  const produ = [{ produtoId: 'f1', quantidade: 10 }];
  await setDb(seed({ orders: [PEDIDO_PENDENTE(3)], productions: produ }));
  const esp = await import('../js/modules/estoque.js?v=17');
  // f1: 10 prod - 3 reserv - 2 vend = 5 (disponível); b1 e i1 sem produção
  const ok = esp.produtosDisponiveis([P_FATIA, P_BOLO, P_ILIMITADO]);
  assert.deepEqual(ok.map((p) => p.id), ['f1']);
});

test('produtosDisponiveis: requiredId sempre aparece (item de pedido em edição)', async () => {
  await setDb(seed());
  const esp = await import('../js/modules/estoque.js?v=17');
  const ok = esp.produtosDisponiveis([P_FATIA, P_BOLO], { requiredId: 'b1' });
  assert.deepEqual(ok.map((p) => p.id), ['b1']);
});

test('produtosDisponiveis: excludeOrderId ignora a própria reserva em edição', async () => {
  const produ = [{ produtoId: 'f1', quantidade: 5 }];
  await setDb(seed({ orders: [PEDIDO_PENDENTE(4)], productions: produ }));
  const esp = await import('../js/modules/estoque.js?v=17');
  // Sem excluir o pedido pendente que reserva 4: f1 fica com 5-4-2=-1
  assert.deepEqual(esp.produtosDisponiveis([P_FATIA]).map((p) => p.id), []);
  // Excluindo o próprio pedido: 5-0-2=3 disponível
  const ok = esp.produtosDisponiveis([P_FATIA], { excludeOrderId: 'o-pendente' });
  assert.deepEqual(ok.map((p) => p.id), ['f1']);
});