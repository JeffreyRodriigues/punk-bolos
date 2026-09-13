import test from 'node:test';
import assert from 'node:assert/strict';
import * as customerService from '../js/modules/customerService.js';

test('sanitizarTelefone — remove caracteres não numéricos e formata', () => {
  assert.equal(customerService.sanitizarTelefone('(11) 98765-4321'), '11987654321');
  assert.equal(customerService.sanitizarTelefone('+55 11 98765-4321'), '11987654321');
  assert.equal(customerService.sanitizarTelefone(''), '');
  assert.equal(customerService.sanitizarTelefone(null), '');
});

test('formatarWhatsappLink — gera URL wa.me com DDD e mensagem codificada', () => {
  const link = customerService.formatarWhatsappLink('(11) 98765-4321', 'Olá Maria!');
  assert.ok(link.startsWith('https://wa.me/5511987654321?text='));
  assert.ok(link.includes('Ol%C3%A1%20Maria!'));

  // Retorna vazio se telefone for inválido
  assert.equal(customerService.formatarWhatsappLink('', 'Olá'), '');
});

test('diasParaAniversario — calcula dias restantes considerando mesmo ano e virada de ano', () => {
  // Mesmo dia
  const ref = new Date(2026, 8, 15); // 15 de Setembro de 2026
  assert.equal(customerService.diasParaAniversario('1990-09-15', ref), 0);

  // 5 dias no futuro
  assert.equal(customerService.diasParaAniversario('1995-09-20', ref), 5);

  // Já passou neste ano (10 de Setembro) -> calcula para o próximo ano (360 dias)
  const passou = customerService.diasParaAniversario('1992-09-10', ref);
  assert.ok(passou > 300);

  // Virada de ano: ref em 20 de Dezembro, aniversário em 5 de Janeiro -> 16 dias
  const refDez = new Date(2026, 11, 20); // 20 de Dezembro
  assert.equal(customerService.diasParaAniversario('1988-01-05', refDez), 16);

  // Data inválida
  assert.equal(customerService.diasParaAniversario('', ref), null);
  assert.equal(customerService.diasParaAniversario(null, ref), null);
});

test('aniversariantesProximos — filtra e ordena clientes na janela de dias', () => {
  const ref = new Date(2026, 8, 10); // 10 de Setembro
  const customers = [
    { id: 'c1', nome: 'Ana', dataNascimento: '1992-09-12' }, // 2 dias
    { id: 'c2', nome: 'Bruno', dataNascimento: '1985-09-22' }, // 12 dias
    { id: 'c3', nome: 'Carlos', dataNascimento: '1990-10-15' }, // 35 dias (fora da janela de 15)
    { id: 'c4', nome: 'Diana', dataNascimento: '' }, // sem aniversário
  ];
  const orders = [
    {
      cliente: 'Ana',
      status: 'Concluído',
      itens: [{ tipoProduto: 'Bolo Inteiro', sabor: 'Cenoura com Chocolate', quantidade: 1 }],
    },
  ];

  const proximos = customerService.aniversariantesProximos(customers, orders, 15, ref);
  assert.equal(proximos.length, 2);
  assert.equal(proximos[0].id, 'c1');
  assert.equal(proximos[0].diasRestantes, 2);
  assert.equal(proximos[0].ultimoSabor, 'Cenoura com Chocolate');
  assert.equal(proximos[1].id, 'c2');
  assert.equal(proximos[1].diasRestantes, 12);
});

test('clientesComMetricas — calcula LTV, contagem de pedidos, último pedido e status VIP', () => {
  const customers = [
    { id: 'c1', nome: 'Maria Silva', contato: '11999991111' },
    { id: 'c2', nome: 'João Souza', contato: '11999992222' },
  ];
  const orders = [
    { cliente: 'Maria Silva', status: 'Concluído', valorTotal: 120, data: '2026-08-01', itens: [{ sabor: 'Ninho' }] },
    { cliente: 'Maria Silva', status: 'Concluído', valorTotal: 150, data: '2026-09-01', itens: [{ sabor: 'Nutella' }] },
    { cliente: 'Maria Silva', status: 'Cancelado', valorTotal: 200, data: '2026-09-05', itens: [] }, // não deve somar
    { cliente: 'João Souza', status: 'Concluído', valorTotal: 60, data: '2026-05-01', itens: [{ sabor: 'Cenoura' }] },
  ];

  const metricas = customerService.clientesComMetricas(customers, orders, new Date(2026, 8, 11));
  const maria = metricas.find((c) => c.id === 'c1');
  const joao = metricas.find((c) => c.id === 'c2');

  assert.equal(maria.totalGasto, 270);
  assert.equal(maria.totalPedidos, 2);
  assert.equal(maria.ultimoPedidoData, '2026-09-01');
  assert.equal(maria.isVIP, true); // >= 250 ou >= 3 pedidos
  assert.equal(maria.isInativo, false);

  assert.equal(joao.totalGasto, 60);
  assert.equal(joao.totalPedidos, 1);
  assert.equal(joao.isVIP, false);
  assert.equal(joao.isInativo, true); // mais de 60 dias desde maio até setembro
});

test('metricasClientes — calcula indicadores gerais do dashboard', () => {
  const customers = [
    { id: 'c1', nome: 'Maria', dataNascimento: '1990-09-12' },
    { id: 'c2', nome: 'João', dataNascimento: '1985-05-20' },
  ];
  const orders = [
    { cliente: 'Maria', status: 'Concluído', valorTotal: 300, data: '2026-09-01' },
    { cliente: 'João', status: 'Concluído', valorTotal: 50, data: '2026-06-01' },
  ];

  const ref = new Date(2026, 8, 10);
  const dashboard = customerService.metricasClientes(customers, orders, ref);

  assert.equal(dashboard.totalClientes, 2);
  assert.equal(dashboard.aniversariantesProximos, 1);
  assert.equal(dashboard.totalVips, 1);
  assert.equal(dashboard.totalInativos, 1);
  assert.equal(dashboard.ticketMedioLtv, 175); // (300 + 50) / 2
});

test('gerarMensagemAniversario — cria texto amigável citando último sabor e preferências quando disponíveis', () => {
  const msgComSaborEObs = customerService.gerarMensagemAniversario(
    { nome: 'Priscila', observacoes: 'Gosto de bolo bem molhadinho e frutado' },
    'Bolo de Morango'
  );
  assert.ok(msgComSaborEObs.includes('Priscila'));
  assert.ok(msgComSaborEObs.includes('Bolo de Morango'));
  assert.ok(msgComSaborEObs.includes('Gosto de bolo bem molhadinho e frutado'));

  const msgSemSabor = customerService.gerarMensagemAniversario({ nome: 'Carlos' }, null);
  assert.ok(msgSemSabor.includes('Carlos'));
  assert.ok(!msgSemSabor.includes('undefined'));
});

test('gerarMensagemPedido — gera resumo completo de itens, valor total e pedido de confirmação', () => {
  const order = {
    numero: 1092,
    cliente: 'Jeffrey Rodrigues',
    contato: '11999998888',
    valorTotal: 145.5,
    pagamento: 'PIX',
    entrega: 'Retirada',
    itens: [
      { tipoProduto: 'Fatia', sabor: 'Red Velvet', quantidade: 2, valorUnitario: 20 },
      { tipoProduto: 'Bolo Inteiro', tamanho: 'M', sabor: 'Chocolate Belga', quantidade: 1, valorUnitario: 105.5 },
    ],
  };

  const msg = customerService.gerarMensagemPedido(order);
  assert.ok(msg.includes('Jeffrey'));
  assert.ok(msg.includes('#1092'));
  assert.ok(msg.includes('2 x Fatias Red Velvet - 40,00'));
  assert.ok(msg.includes('1 x Bolo Inteiro(M) Chocolate Belga - 105,50'));
  assert.ok(msg.includes('Total 145,50'));
  assert.ok(msg.includes('Retirada'));
  assert.ok(msg.includes('PIX'));
  assert.ok(msg.includes('Você confirma os itens do seu pedido?'));
});

test('obterHistoricoCliente e extrairSaborFavorito — agrega pedidos, LTV, ticket médio e sabor favorito', () => {
  const orders = [
    {
      numero: 1001,
      cliente: 'Maria Silva',
      status: 'Concluído',
      data: '2026-07-10',
      valorTotal: 50,
      itens: [{ tipoProduto: 'Fatia', sabor: 'Ninho', quantidade: 2 }],
    },
    {
      numero: 1005,
      cliente: 'Maria Silva',
      status: 'Concluído',
      data: '2026-08-15',
      valorTotal: 150,
      itens: [{ tipoProduto: 'Bolo Inteiro', sabor: 'Ninho', quantidade: 1 }],
    },
    {
      numero: 1008,
      cliente: 'Maria Silva',
      status: 'Cancelado',
      data: '2026-09-01',
      valorTotal: 200,
      itens: [{ tipoProduto: 'Bolo Inteiro', sabor: 'Chocolate', quantidade: 2 }],
    },
    {
      numero: 1010,
      cliente: 'Outro Cliente',
      status: 'Concluído',
      data: '2026-09-02',
      valorTotal: 80,
      itens: [{ tipoProduto: 'Fatia', sabor: 'Cenoura', quantidade: 4 }],
    },
  ];

  const hist = customerService.obterHistoricoCliente('maria silva', orders, new Date(2026, 8, 13));
  assert.equal(hist.totalPedidos, 2); // ignora o cancelado e de outro cliente
  assert.equal(hist.totalGasto, 200); // 50 + 150
  assert.equal(hist.ticketMedio, 100); // 200 / 2
  assert.equal(hist.primeiroPedidoData, '2026-07-10');
  assert.equal(hist.ultimoPedidoData, '2026-08-15');
  assert.equal(hist.saborFavorito, 'Ninho'); // 2 + 1 = 3 unidades de Ninho
  assert.equal(hist.pedidos.length, 3); // inclui o cancelado na listagem de timeline
});



