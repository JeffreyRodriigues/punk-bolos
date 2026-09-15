/* ============================================================
   MENUSERVICE.JS — Regras de Negócio do Cardápio Digital Público
   ------------------------------------------------------------
   Funções puras para:
   - Gestão do carrinho de compras (adicionar, remover, alterar quantidade)
   - Cálculo de subtotais e valor total
   - Validação dos dados de checkout do cliente
   - Formatação da mensagem do pedido para o WhatsApp (sem emojis)
   ============================================================ */

/**
 * Adiciona um produto ao carrinho ou incrementa sua quantidade.
 * @param {Array<Object>} carrinho - Lista atual de itens no carrinho.
 * @param {Object} produto - Produto selecionado do catálogo.
 * @param {number} [quantidade=1] - Quantidade a adicionar.
 * @returns {Array<Object>} Novo estado do carrinho.
 */
export function adicionarItemCarrinho(carrinho = [], produto, quantidade = 1) {
  if (!produto || !produto.id) return [...carrinho];
  const qtd = Math.max(1, parseInt(quantidade, 10) || 1);
  const copia = carrinho.map((item) => ({ ...item }));
  const index = copia.findIndex((item) => item.id === produto.id);

  if (index >= 0) {
    copia[index].quantidade = (copia[index].quantidade || 1) + qtd;
  } else {
    copia.push({
      id: produto.id,
      titulo: produto.titulo || 'Produto',
      tipoProduto: produto.tipoProduto || 'Produto',
      tamanho: produto.tamanho || '',
      valor: Number(produto.valor) || 0,
      detalhes: produto.detalhes || '',
      quantidade: qtd,
    });
  }

  return copia;
}

/**
 * Altera a quantidade de um item no carrinho. Remove se quantidade <= 0.
 * @param {Array<Object>} carrinho - Lista atual de itens.
 * @param {string} produtoId - Id do produto.
 * @param {number} novaQuantidade - Nova quantidade desejada.
 * @returns {Array<Object>} Novo estado do carrinho.
 */
export function alterarQuantidadeCarrinho(carrinho = [], produtoId, novaQuantidade) {
  const qtd = parseInt(novaQuantidade, 10);
  if (isNaN(qtd) || qtd <= 0) {
    return removerItemCarrinho(carrinho, produtoId);
  }

  return carrinho.map((item) => {
    if (item.id === produtoId) {
      return { ...item, quantidade: qtd };
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
  const itensTexto = (carrinho || []).map((item) => {
    const qtd = item.quantidade || 1;
    const tipo = item.tipoProduto || 'Produto';
    const tam = item.tamanho ? ` (${item.tamanho})` : '';
    const titulo = item.titulo ? ` - ${item.titulo}` : '';
    const itemTotal = (Number(item.quantidade) || 1) * (Number(item.valor) || 0);
    return `- ${qtd}x ${tipo}${tam}${titulo} (${formatarMoeda(itemTotal)})`;
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

  return `Ola ${nomeConfeitaria}! Gostaria de fazer o seguinte pedido:

*ITENS DO PEDIDO:*
${itensTexto || '- Nenhum item'}

*VALOR TOTAL: ${formatarMoeda(totalValor)}*

*DADOS DO CLIENTE:*
- Nome: ${(dadosCliente.nome || '').trim()}
- WhatsApp: ${(dadosCliente.whatsapp || '').trim()}
- Tipo: ${tipoEntrega}${enderecoLinha}
- Data desejada: ${(dadosCliente.dataDesejada || '').trim()}${periodoStr}${pagamentoStr}${obsLinha}

Voce confirma a disponibilidade para essa data?`;
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
