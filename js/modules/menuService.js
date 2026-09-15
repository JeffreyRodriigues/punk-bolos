/* ============================================================
   MENUSERVICE.JS — Regras de Negócio do Cardápio Digital Público
   ------------------------------------------------------------
   Funções puras para:
   - Gestão do carrinho de compras com travas de estoque de pronta entrega
   - Regras de disponibilidade: Bolos sob encomenda vs Fatias/Punkitos
   - Cálculo de subtotais e valor total
   - Validação dos dados de checkout do cliente
   - Formatação da mensagem do pedido para o WhatsApp (sem emojis)
   ============================================================ */

/**
 * Verifica se um produto está disponível para venda no cardápio.
 * - "Bolo Inteiro": sempre disponível sob encomenda (não depende de estoque prévio).
 * - "Fatia", "Punkitos" e outros: disponíveis apenas se saldoEstoque > 0.
 * @param {Object} produto - Produto do catálogo.
 * @param {number} [saldoEstoque=0] - Saldo disponível retornado por estoque.disponivel(p).
 * @returns {{ sobEncomenda: boolean, disponivel: boolean, estoqueMax: number, statusTexto: string, statusClass: string }}
 */
export function verificarDisponibilidadeCardapio(produto, saldoEstoque = 0) {
  if (!produto) {
    return {
      sobEncomenda: false,
      disponivel: false,
      estoqueMax: 0,
      statusTexto: 'Indisponível',
      statusClass: 'status-esgotado',
    };
  }

  const isBolo = produto.tipoProduto === 'Bolo Inteiro';
  if (isBolo) {
    return {
      sobEncomenda: true,
      disponivel: true,
      estoqueMax: 99,
      statusTexto: 'Sob Encomenda',
      statusClass: 'status-encomenda',
    };
  }

  const saldo = Math.max(0, parseInt(saldoEstoque, 10) || 0);
  const temEstoque = saldo > 0;

  return {
    sobEncomenda: false,
    disponivel: temEstoque,
    estoqueMax: saldo,
    statusTexto: temEstoque ? `Pronta Entrega (${saldo} disp.)` : 'Esgotado por hoje',
    statusClass: temEstoque ? 'status-pronta' : 'status-esgotado',
  };
}

/**
 * Adiciona um produto ao carrinho ou incrementa sua quantidade respeitando o estoque máximo.
 * @param {Array<Object>} carrinho - Lista atual de itens no carrinho.
 * @param {Object} produto - Produto selecionado do catálogo.
 * @param {number} [quantidade=1] - Quantidade a adicionar.
 * @param {number} [maxEstoque=99] - Quantidade máxima permitida em estoque.
 * @returns {Array<Object>} Novo estado do carrinho.
 */
export function adicionarItemCarrinho(carrinho = [], produto, quantidade = 1, maxEstoque = 99) {
  if (!produto || !produto.id) return [...carrinho];
  const qtdAdd = Math.max(1, parseInt(quantidade, 10) || 1);
  const limite = Math.max(1, parseInt(maxEstoque, 10) || 99);
  const copia = carrinho.map((item) => ({ ...item }));
  const index = copia.findIndex((item) => item.id === produto.id);

  if (index >= 0) {
    const qtdAtual = copia[index].quantidade || 1;
    copia[index].quantidade = Math.min(limite, qtdAtual + qtdAdd);
  } else {
    copia.push({
      id: produto.id,
      titulo: produto.titulo || 'Produto',
      tipoProduto: produto.tipoProduto || 'Produto',
      tamanho: produto.tamanho || '',
      valor: Number(produto.valor) || 0,
      detalhes: produto.detalhes || '',
      quantidade: Math.min(limite, qtdAdd),
    });
  }

  return copia;
}

/**
 * Altera a quantidade de um item no carrinho. Remove se quantidade <= 0.
 * @param {Array<Object>} carrinho - Lista atual de itens.
 * @param {string} produtoId - Id do produto.
 * @param {number} novaQuantidade - Nova quantidade desejada.
 * @param {number} [maxEstoque=99] - Limite máximo de estoque.
 * @returns {Array<Object>} Novo estado do carrinho.
 */
export function alterarQuantidadeCarrinho(carrinho = [], produtoId, novaQuantidade, maxEstoque = 99) {
  const qtd = parseInt(novaQuantidade, 10);
  if (isNaN(qtd) || qtd <= 0) {
    return removerItemCarrinho(carrinho, produtoId);
  }

  const limite = Math.max(1, parseInt(maxEstoque, 10) || 99);
  const qtdAjustada = Math.min(limite, qtd);

  return carrinho.map((item) => {
    if (item.id === produtoId) {
      return { ...item, quantidade: qtdAjustada };
    }
    return { ...item };
  });
}

/**
 * Remove um item do carrinho pelo id.
 * @param {Array<Object>} carrinho - Lista atual de itens.
 * @param {string} produtoId - Id do produto a remover.
 * @returns {Array<Object>} Novo estado do carrinho.
 */
export function removerItemCarrinho(carrinho = [], produtoId) {
  return (carrinho || []).filter((item) => item.id !== produtoId);
}

/**
 * Calcula a quantidade total de itens e o valor total do carrinho.
 * @param {Array<Object>} carrinho - Lista de itens.
 * @returns {{ totalItens: number, totalValor: number }}
 */
export function calcularTotaisCarrinho(carrinho = []) {
  const totalItens = (carrinho || []).reduce((sum, item) => sum + (Number(item.quantidade) || 0), 0);
  const totalValor = Math.round(
    (carrinho || []).reduce(
      (sum, item) => sum + (Number(item.quantidade) || 0) * (Number(item.valor) || 0),
      0
    ) * 100
  ) / 100;

  return {
    totalItens,
    totalValor,
  };
}

/**
 * Valida os dados preenchidos pelo cliente no checkout do cardápio.
 * @param {Object} dadosCliente - Dados do cliente e da entrega.
 * @param {Array<Object>} carrinho - Lista de itens no carrinho.
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validarCheckout(dadosCliente = {}, carrinho = []) {
  const errors = {};

  if (!carrinho || carrinho.length === 0) {
    errors.carrinho = 'Sua sacola está vazia. Adicione itens antes de continuar.';
  }

  const nome = String(dadosCliente.nome || '').trim();
  if (!nome) {
    errors.nome = 'Por favor, informe o seu nome completo.';
  }

  const whatsapp = String(dadosCliente.whatsapp || '').replace(/\D/g, '');
  if (!whatsapp || whatsapp.length < 10) {
    errors.whatsapp = 'Informe um número de WhatsApp válido com DDD.';
  }

  const dataDesejada = String(dadosCliente.dataDesejada || '').trim();
  if (!dataDesejada) {
    errors.dataDesejada = 'Selecione a data desejada para entrega ou retirada.';
  }

  const tipoEntrega = dadosCliente.tipoEntrega || 'Retirada';
  if (tipoEntrega === 'Entrega') {
    const endereco = String(dadosCliente.endereco || '').trim();
    if (!endereco) {
      errors.endereco = 'Informe o endereço completo para a entrega.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Formata um valor numérico para a moeda brasileira (R$ 0,00).
 * @param {number} valor - Valor numérico.
 * @returns {string}
 */
export function formatarMoeda(valor) {
  const num = Number(valor) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Gera a mensagem de texto completa e sem emojis para envio no WhatsApp da confeitaria.
 * @param {Object} dadosCliente - Informações do cliente e entrega.
 * @param {Array<Object>} carrinho - Lista de itens do pedido.
 * @param {number} totalValor - Valor total calculado.
 * @param {string} [nomeConfeitaria='Punk Bolos'] - Nome da confeitaria.
 * @returns {string} Mensagem pronta para o WhatsApp.
 */
export function gerarMensagemPedidoWhatsapp(
  dadosCliente = {},
  carrinho = [],
  totalValor = 0,
  nomeConfeitaria = 'Punk Bolos'
) {
  const temBoloEncomenda = (carrinho || []).some((i) => i.tipoProduto === 'Bolo Inteiro');

  const itensTexto = (carrinho || []).map((item) => {
    const qtd = item.quantidade || 1;
    const tipo = item.tipoProduto || 'Produto';
    const tam = item.tamanho ? ` (${item.tamanho})` : '';
    const titulo = item.titulo ? ` - ${item.titulo}` : '';
    const tagEncomenda = item.tipoProduto === 'Bolo Inteiro' ? ' [Sob Encomenda]' : ' [Pronta Entrega]';
    const itemTotal = (Number(item.quantidade) || 1) * (Number(item.valor) || 0);
    return `- ${qtd}x ${tipo}${tam}${titulo}${tagEncomenda} (${formatarMoeda(itemTotal)})`;
  }).join('\n');

  const tipoEntrega = dadosCliente.tipoEntrega === 'Entrega' ? 'Entrega' : 'Retirada no Ateliê';
  const enderecoLinha = dadosCliente.tipoEntrega === 'Entrega' && dadosCliente.endereco
    ? `\n- Endereco: ${dadosCliente.endereco.trim()}`
    : '';

  const periodoStr = dadosCliente.periodo ? ` (Periodo: ${dadosCliente.periodo})` : '';
  const pagamentoStr = dadosCliente.pagamento ? `\n- Forma de pagamento preferida: ${dadosCliente.pagamento}` : '';
  const obsLinha = dadosCliente.observacoes && dadosCliente.observacoes.trim()
    ? `\n- Observacoes: ${dadosCliente.observacoes.trim()}`
    : '';

  const avisoFinal = temBoloEncomenda
    ? '\n\n*IMPORTANTE:* Seu pedido inclui bolo sob encomenda. Vamos alinhar e confirmar o horario exato de entrega por aqui!'
    : '\n\nVoce confirma a disponibilidade para retirada/entrega?';

  return `Ola ${nomeConfeitaria}! Gostaria de fazer o seguinte pedido:

*ITENS DO PEDIDO:*
${itensTexto || '- Nenhum item'}

*VALOR TOTAL: ${formatarMoeda(totalValor)}*

*DADOS DO CLIENTE:*
- Nome: ${(dadosCliente.nome || '').trim()}
- WhatsApp: ${(dadosCliente.whatsapp || '').trim()}
- Tipo: ${tipoEntrega}${enderecoLinha}
- Data desejada: ${(dadosCliente.dataDesejada || '').trim()}${periodoStr}${pagamentoStr}${obsLinha}${avisoFinal}`;
}

/**
 * Gera o link direto de WhatsApp web/app para envio da mensagem.
 * @param {string} telefone - Telefone da confeitaria.
 * @param {string} mensagem - Texto da mensagem.
 * @returns {string} URL wa.me formatada.
 */
export function formatarLinkWhatsapp(telefone, mensagem) {
  const digits = String(telefone || '').replace(/\D/g, '');
  if (!digits) return '';
  const phone = digits.length <= 11 && !digits.startsWith('55') ? `55${digits}` : digits;
  return `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
}
