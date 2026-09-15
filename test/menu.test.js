import test from 'node:test';
import assert from 'node:assert/strict';
import * as menuService from '../js/modules/menuService.js';

test('verificarDisponibilidadeCardapio — Bolo Inteiro sempre sob encomenda; Fatia/Punkitos exigem estoque', () => {
  const bolo = { id: 'b1', tipoProduto: 'Bolo Inteiro', titulo: 'Ninho' };
  const fatia = { id: 'f1', tipoProduto: 'Fatia', titulo: 'Cenoura' };
  const punkito = { id: 'pk1', tipoProduto: 'Punkitos', titulo: 'Doce de Leite' };

  // Bolo Inteiro com 0 de estoque de produção -> SEMPRE disponível sob encomenda
  const dispBolo = menuService.verificarDisponibilidadeCardapio(bolo, 0);
  assert.equal(dispBolo.sobEncomenda, true);
  assert.equal(dispBolo.disponivel, true);
  assert.equal(dispBolo.statusClass, 'status-encomenda');

  // Fatia com 3 de estoque -> Disponível pronta entrega
  const dispFatia = menuService.verificarDisponibilidadeCardapio(fatia, 3);
  assert.equal(dispFatia.sobEncomenda, false);
  assert.equal(dispFatia.disponivel, true);
  assert.equal(dispFatia.estoqueMax, 3);
  assert.equal(dispFatia.statusClass, 'status-pronta');

  // Fatia com 0 de estoque -> Esgotado
  const dispFatiaEsgotada = menuService.verificarDisponibilidadeCardapio(fatia, 0);
  assert.equal(dispFatiaEsgotada.disponivel, false);
  assert.equal(dispFatiaEsgotada.statusClass, 'status-esgotado');

  // Punkitos com 5 de estoque -> Disponível pronta entrega
  const dispPk = menuService.verificarDisponibilidadeCardapio(punkito, 5);
  assert.equal(dispPk.disponivel, true);
  assert.equal(dispPk.estoqueMax, 5);
});

test('adicionarItemCarrinho — respeita limite de estoque de pronta entrega', () => {
  const fatia = { id: 'p2', titulo: 'Cenoura com Brigadeiro', tipoProduto: 'Fatia', valor: 15 };

  let carrinho = [];
  // Tenta adicionar 5, mas estoque max é 3
  carrinho = menuService.adicionarItemCarrinho(carrinho, fatia, 5, 3);
  assert.equal(carrinho.length, 1);
  assert.equal(carrinho[0].quantidade, 3);

  // Tenta adicionar mais 2, continua travado em 3
  carrinho = menuService.adicionarItemCarrinho(carrinho, fatia, 2, 3);
  assert.equal(carrinho[0].quantidade, 3);
});

test('alterarQuantidadeCarrinho — altera quantidade e remove se for <= 0', () => {
  const inicial = [
    { id: 'p1', titulo: 'Bolo 1', valor: 80, quantidade: 2 },
    { id: 'p2', titulo: 'Fatia 1', valor: 15, quantidade: 1 },
  ];

  // Aumenta quantidade respeitando max
  let c = menuService.alterarQuantidadeCarrinho(inicial, 'p1', 5, 99);
  assert.equal(c.find((i) => i.id === 'p1').quantidade, 5);

  // Zera quantidade (remove)
  c = menuService.alterarQuantidadeCarrinho(c, 'p1', 0);
  assert.equal(c.find((i) => i.id === 'p1'), undefined);
  assert.equal(c.length, 1);
});

test('calcularTotaisCarrinho — calcula quantidade de itens e valor total', () => {
  const carrinho = [
    { id: 'p1', valor: 85, quantidade: 2 },
    { id: 'p2', valor: 15.5, quantidade: 2 },
  ];

  const totais = menuService.calcularTotaisCarrinho(carrinho);
  assert.equal(totais.totalItens, 4);
  assert.equal(totais.totalValor, 201);
});

test('validarCheckout — valida campos obrigatórios (nome, whatsapp, data, endereco se entrega)', () => {
  const carrinho = [{ id: 'p1', valor: 80, quantidade: 1 }];

  const v1 = menuService.validarCheckout(
    { nome: 'Ana Souza', whatsapp: '11999998888', dataDesejada: '2026-09-20', tipoEntrega: 'Retirada' },
    carrinho
  );
  assert.equal(v1.valid, true);

  const v2 = menuService.validarCheckout(
    { nome: 'Ana Souza', whatsapp: '11999998888', dataDesejada: '2026-09-20' },
    []
  );
  assert.equal(v2.valid, false);
});

test('gerarMensagemPedidoWhatsapp — adiciona aviso de alinhamento para Bolo sob encomenda', () => {
  const dados = {
    nome: 'Mariana Silva',
    whatsapp: '(11) 99999-7777',
    tipoEntrega: 'Entrega',
    endereco: 'Rua Augusta, 500',
    dataDesejada: '2026-09-25',
    periodo: 'Tarde',
    pagamento: 'PIX',
  };

  const carrinhoComBolo = [
    { titulo: 'Ninho com Morango', tipoProduto: 'Bolo Inteiro', tamanho: 'Aro 15', valor: 85, quantidade: 1 },
  ];

  const msg = menuService.gerarMensagemPedidoWhatsapp(dados, carrinhoComBolo, 85, 'Punk Bolos');
  assert.ok(msg.includes('Sob Encomenda'));
  assert.ok(msg.includes('IMPORTANTE:'));
  assert.ok(msg.includes('alinhar e confirmar o horario exato'));
});
