import test from 'node:test';
import assert from 'node:assert/strict';
import * as menuService from '../js/modules/menuService.js';

test('adicionarItemCarrinho — adiciona novo item ou incrementa quantidade existente', () => {
  const p1 = { id: 'p1', titulo: 'Ninho com Nutella', tipoProduto: 'Bolo Inteiro', tamanho: 'Aro 15', valor: 85 };
  const p2 = { id: 'p2', titulo: 'Cenoura com Brigadeiro', tipoProduto: 'Fatia', valor: 15 };

  let carrinho = [];
  carrinho = menuService.adicionarItemCarrinho(carrinho, p1, 1);
  assert.equal(carrinho.length, 1);
  assert.equal(carrinho[0].quantidade, 1);
  assert.equal(carrinho[0].valor, 85);

  // Adiciona mais 2 do mesmo produto
  carrinho = menuService.adicionarItemCarrinho(carrinho, p1, 2);
  assert.equal(carrinho.length, 1);
  assert.equal(carrinho[0].quantidade, 3);

  // Adiciona produto diferente
  carrinho = menuService.adicionarItemCarrinho(carrinho, p2, 1);
  assert.equal(carrinho.length, 2);
  assert.equal(carrinho[1].id, 'p2');
  assert.equal(carrinho[1].quantidade, 1);
});

test('alterarQuantidadeCarrinho — altera quantidade e remove se for <= 0', () => {
  const inicial = [
    { id: 'p1', titulo: 'Bolo 1', valor: 80, quantidade: 2 },
    { id: 'p2', titulo: 'Fatia 1', valor: 15, quantidade: 1 },
  ];

  // Aumenta quantidade
  let c = menuService.alterarQuantidadeCarrinho(inicial, 'p1', 5);
  assert.equal(c.find((i) => i.id === 'p1').quantidade, 5);

  // Zera quantidade (remove)
  c = menuService.alterarQuantidadeCarrinho(c, 'p1', 0);
  assert.equal(c.find((i) => i.id === 'p1'), undefined);
  assert.equal(c.length, 1);
});

test('removerItemCarrinho — remove o produto especificado', () => {
  const inicial = [
    { id: 'p1', titulo: 'Bolo 1', valor: 80, quantidade: 1 },
    { id: 'p2', titulo: 'Fatia 1', valor: 15, quantidade: 1 },
  ];

  const c = menuService.removerItemCarrinho(inicial, 'p1');
  assert.equal(c.length, 1);
  assert.equal(c[0].id, 'p2');
});

test('calcularTotaisCarrinho — calcula quantidade de itens e valor total', () => {
  const carrinho = [
    { id: 'p1', valor: 85, quantidade: 2 }, // 170
    { id: 'p2', valor: 15.5, quantidade: 2 }, // 31
  ];

  const totais = menuService.calcularTotaisCarrinho(carrinho);
  assert.equal(totais.totalItens, 4);
  assert.equal(totais.totalValor, 201);
});

test('validarCheckout — valida campos obrigatórios (nome, whatsapp, data, endereco se entrega)', () => {
  const carrinho = [{ id: 'p1', valor: 80, quantidade: 1 }];

  // Válido com retirada
  const v1 = menuService.validarCheckout(
    { nome: 'Ana Souza', whatsapp: '11999998888', dataDesejada: '2026-09-20', tipoEntrega: 'Retirada' },
    carrinho
  );
  assert.equal(v1.valid, true);

  // Inválido se carrinho vazio
  const v2 = menuService.validarCheckout(
    { nome: 'Ana Souza', whatsapp: '11999998888', dataDesejada: '2026-09-20' },
    []
  );
  assert.equal(v2.valid, false);
  assert.ok(v2.errors.carrinho);

  // Inválido sem nome ou telefone curto
  const v3 = menuService.validarCheckout(
    { nome: '', whatsapp: '123', dataDesejada: '2026-09-20' },
    carrinho
  );
  assert.equal(v3.valid, false);
  assert.ok(v3.errors.nome);
  assert.ok(v3.errors.whatsapp);

  // Inválido se entrega sem endereço
  const v4 = menuService.validarCheckout(
    { nome: 'Ana Souza', whatsapp: '11999998888', dataDesejada: '2026-09-20', tipoEntrega: 'Entrega', endereco: '' },
    carrinho
  );
  assert.equal(v4.valid, false);
  assert.ok(v4.errors.endereco);
});

test('gerarMensagemPedidoWhatsapp — formata mensagem sem emojis pronta para WhatsApp', () => {
  const dados = {
    nome: 'Mariana Silva',
    whatsapp: '(11) 99999-7777',
    tipoEntrega: 'Entrega',
    endereco: 'Rua Augusta, 500 - Consolação',
    dataDesejada: '2026-09-25',
    periodo: 'Tarde',
    pagamento: 'PIX',
    observacoes: 'Escrever Parabéns na caixa',
  };

  const carrinho = [
    { titulo: 'Ninho com Morango', tipoProduto: 'Bolo Inteiro', tamanho: 'Aro 15', valor: 85, quantidade: 1 },
    { titulo: 'Cenoura com Chocolate', tipoProduto: 'Fatia', tamanho: '', valor: 15, quantidade: 2 },
  ];

  const msg = menuService.gerarMensagemPedidoWhatsapp(dados, carrinho, 115, 'Punk Bolos');
  assert.ok(msg.includes('Mariana Silva'));
  assert.ok(msg.includes('Ninho com Morango'));
  assert.ok(msg.includes('Rua Augusta, 500'));
  assert.ok(msg.includes('VALOR TOTAL:'));
  assert.ok(msg.includes('PIX'));
});

test('formatarLinkWhatsapp — monta url wa.me com DDI', () => {
  const url = menuService.formatarLinkWhatsapp('11999998888', 'Ola mundo');
  assert.ok(url.startsWith('https://wa.me/5511999998888?text='));
});
