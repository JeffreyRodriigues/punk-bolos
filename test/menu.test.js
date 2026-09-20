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

test('sanitizarTelefone e formatarTelefone — formata e limpa telefones corretamente', () => {
  assert.equal(menuService.sanitizarTelefone('(11) 98765-4321'), '11987654321');
  assert.equal(menuService.sanitizarTelefone('11 98765 4321'), '11987654321');
  assert.equal(menuService.formatarTelefone('11987654321'), '(11) 98765-4321');
  assert.equal(menuService.formatarTelefone('1187654321'), '(11) 8765-4321');
});

test('extrairPrimeiroNome — extrai primeiro nome ou fallback', () => {
  assert.equal(menuService.extrairPrimeiroNome('Mariana Silva Pereira'), 'Mariana');
  assert.equal(menuService.extrairPrimeiroNome('Carlos'), 'Carlos');
  assert.equal(menuService.extrairPrimeiroNome(''), 'Cliente');
});

test('validarCadastroCliente — valida nome, whatsapp e endereço obrigatório', () => {
  const v1 = menuService.validarCadastroCliente({
    nome: 'Mariana Silva',
    contato: '11999998888',
    endereco: 'Rua das Flores, 123',
  });
  assert.equal(v1.valid, true);

  const v2 = menuService.validarCadastroCliente({
    nome: 'M',
    contato: '119',
    endereco: '',
  });
  assert.equal(v2.valid, false);
  assert.ok(v2.errors.nome);
  assert.ok(v2.errors.contato);
  assert.ok(v2.errors.endereco);
});

test('calcularFidelidadeCliente — calcula selos e recompensas a cada 10 pedidos', () => {
  // Sem pedidos
  const f0 = menuService.calcularFidelidadeCliente([]);
  assert.equal(f0.totalPedidos, 0);
  assert.equal(f0.selos, 0);
  assert.equal(f0.recompensas, 0);
  assert.equal(f0.selosRestantes, 10);

  // 3 pedidos
  const pedidos3 = [{ status: 'Entregue' }, { status: 'Pendente' }, { status: 'Em produção' }];
  const f3 = menuService.calcularFidelidadeCliente(pedidos3);
  assert.equal(f3.totalPedidos, 3);
  assert.equal(f3.selos, 3);
  assert.equal(f3.selosRestantes, 7);
  assert.equal(f3.recompensas, 0);

  // 12 pedidos com 1 cancelado (11 válidos)
  const pedidos12 = Array.from({ length: 11 }, () => ({ status: 'Entregue' })).concat([{ status: 'Cancelado' }]);
  const f11 = menuService.calcularFidelidadeCliente(pedidos12);
  assert.equal(f11.totalPedidos, 11);
  assert.equal(f11.selos, 1);
  assert.equal(f11.recompensas, 1);
  assert.equal(f11.selosRestantes, 9);
});

test('sanitizarCep e formatarCep — higieniza e formata CEPs brasileiros', () => {
  assert.equal(menuService.sanitizarCep('01310-100'), '01310100');
  assert.equal(menuService.sanitizarCep('01.310.100'), '01310100');
  assert.equal(menuService.formatarCep('01310100'), '01310-100');
  assert.equal(menuService.formatarCep('01310-100'), '01310-100');
});

test('montarEnderecoCompleto — gera texto de endereço estruturado e legível', () => {
  const partes = {
    cep: '01310-100',
    logradouro: 'Avenida Paulista',
    numero: '1578',
    complemento: 'Apto 42',
    bairro: 'Bela Vista',
    cidade: 'São Paulo',
    uf: 'SP',
    referencia: 'Próximo ao MASP',
  };

  const end = menuService.montarEnderecoCompleto(partes);
  assert.equal(
    end,
    'Avenida Paulista, 1578 (Apto 42) - Bela Vista - São Paulo/SP [CEP: 01310-100] (Ref: Próximo ao MASP)'
  );

  // Sem complemento e sem referência
  const simples = menuService.montarEnderecoCompleto({
    logradouro: 'Rua das Flores',
    numero: '100',
    bairro: 'Centro',
    cidade: 'Guarulhos',
    uf: 'SP',
  });
  assert.equal(simples, 'Rua das Flores, 100 - Centro - Guarulhos/SP');
});

test('decomporEndereco — extrai campos de uma string legada ou composta', () => {
  const texto = 'Avenida Paulista, 1578 - Bela Vista - São Paulo/SP [CEP: 01310-100] (Ref: Perto do MASP)';
  const d = menuService.decomporEndereco(texto);
  assert.equal(d.cep, '01310-100');
  assert.equal(d.referencia, 'Perto do MASP');
  assert.ok(d.logradouro.includes('Avenida Paulista'));
});

test('validarCheckout e validarCadastroCliente com objeto de endereço estruturado', () => {
  const carrinho = [{ id: 'p1', valor: 50, quantidade: 1 }];

  // Checkout com endereço estruturado completo
  const v1 = menuService.validarCheckout(
    {
      nome: 'Mariana Silva',
      whatsapp: '11999998888',
      tipoEntrega: 'Entrega',
      endereco: {
        logradouro: 'Rua Augusta',
        numero: '500',
        bairro: 'Consolação',
        cidade: 'São Paulo',
        uf: 'SP',
      },
      dataDesejada: '2026-09-25',
    },
    carrinho
  );
  assert.equal(v1.valid, true);

  // Checkout com logradouro preenchido mas sem número
  const v2 = menuService.validarCheckout(
    {
      nome: 'Mariana Silva',
      whatsapp: '11999998888',
      tipoEntrega: 'Entrega',
      endereco: {
        logradouro: 'Rua Augusta',
        numero: '',
      },
      dataDesejada: '2026-09-25',
    },
    carrinho
  );
  assert.equal(v2.valid, false);
  assert.ok(v2.errors.numero);
});


