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
    const end = dadosCliente.endereco;
    const endStr = typeof end === 'object' && end !== null ? montarEnderecoCompleto(end) : String(end || '').trim();
    if (!endStr) {
      errors.endereco = 'Informe o endereço completo para a entrega.';
    } else if (typeof end === 'object' && end !== null && (end.logradouro || end.rua) && !end.numero) {
      errors.numero = 'Por favor, informe o número do imóvel para a entrega.';
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

/* ---------- Gestão de Conta & Fidelidade do Cliente ---------- */

const CUSTOMER_SESSION_KEY = 'punk_cardapio_customer';

/**
 * Limpa e extrai apenas os números de um telefone.
 * @param {string} telefone
 * @returns {string}
 */
export function sanitizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

/**
 * Formata um número de telefone no padrão brasileiro (11) 99999-9999.
 * @param {string} telefone
 * @returns {string}
 */
export function formatarTelefone(telefone) {
  const d = sanitizarTelefone(telefone);
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return telefone || '';
}

/**
 * Extrai o primeiro nome de um nome completo.
 * @param {string} nomeCompleto
 * @returns {string}
 */
export function extrairPrimeiroNome(nomeCompleto) {
  const n = String(nomeCompleto || '').trim();
  if (!n) return 'Cliente';
  return n.split(/\s+/)[0];
}

/**
 * Valida o formulário de cadastro / identificação do cliente no cardápio.
 * @param {Object} dados - { nome, contato, endereco, dataNascimento }
 * @returns {{ valid: boolean, errors: Object }}
 */
export function validarCadastroCliente(dados = {}) {
  const errors = {};
  const nome = String(dados.nome || '').trim();
  const phone = sanitizarTelefone(dados.contato || dados.whatsapp);

  if (!nome) {
    errors.nome = 'Por favor, informe seu nome completo.';
  } else if (nome.length < 3) {
    errors.nome = 'O nome deve ter ao menos 3 caracteres.';
  }

  if (!phone || phone.length < 10) {
    errors.contato = 'Informe um número de WhatsApp válido com DDD.';
  }

  if (dados.endereco !== undefined) {
    const end = dados.endereco;
    const endStr = typeof end === 'object' && end !== null ? montarEnderecoCompleto(end) : String(end || '').trim();
    if (!endStr) {
      errors.endereco = 'Por favor, informe seu endereço para entrega.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/* ---------- Gestão de Endereço e CEP (ViaCEP) ---------- */

/**
 * Sanitiza um CEP removendo caracteres não numéricos.
 * @param {string} cep
 * @returns {string}
 */
export function sanitizarCep(cep) {
  return String(cep || '').replace(/\D/g, '');
}

/**
 * Formata um CEP no padrão brasileiro (00000-000).
 * @param {string} cep
 * @returns {string}
 */
export function formatarCep(cep) {
  const d = sanitizarCep(cep);
  if (d.length === 8) {
    return `${d.slice(0, 5)}-${d.slice(5)}`;
  }
  return cep || '';
}

/**
 * Consulta os dados de endereço na API pública do ViaCEP.
 * @param {string} cep - CEP com ou sem formatação.
 * @returns {Promise<{ sucesso: boolean, logradouro?: string, bairro?: string, localidade?: string, uf?: string, cep?: string, erro?: string }>}
 */
export async function consultarCepViaCep(cep) {
  const clean = sanitizarCep(cep);
  if (!clean || clean.length !== 8) {
    return { sucesso: false, erro: 'CEP deve conter 8 dígitos numéricos.' };
  }

  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (!res.ok) {
      return { sucesso: false, erro: 'Falha na consulta do CEP.' };
    }
    const data = await res.json();
    if (data.erro) {
      return { sucesso: false, erro: 'CEP não encontrado.' };
    }
    return {
      sucesso: true,
      logradouro: data.logradouro || '',
      bairro: data.bairro || '',
      localidade: data.localidade || '',
      uf: data.uf || '',
      cep: data.cep || formatarCep(clean),
    };
  } catch {
    return { sucesso: false, erro: 'Não foi possível conectar ao serviço de CEP.' };
  }
}

/**
 * Monta o endereço completo estruturado em uma string única e legível para entregadores.
 * @param {Object} partes - { cep, logradouro, rua, numero, complemento, bairro, cidade, localidade, uf, referencia }
 * @returns {string}
 */
export function montarEnderecoCompleto(partes = {}) {
  if (!partes) return '';
  if (typeof partes === 'string') return partes.trim();

  const logr = String(partes.logradouro || partes.rua || '').trim();
  const num = String(partes.numero || '').trim();
  const compl = String(partes.complemento || '').trim();
  const bairro = String(partes.bairro || '').trim();
  const cidade = String(partes.cidade || partes.localidade || '').trim();
  const uf = String(partes.uf || '').trim().toUpperCase();
  const cep = sanitizarCep(partes.cep);
  const ref = String(partes.referencia || '').trim();

  if (!logr && !cidade && !cep) return '';

  const pedacos = [];

  // Logradouro + Número + Complemento
  let linhaRua = logr;
  if (num) linhaRua += linhaRua ? `, ${num}` : num;
  if (compl) linhaRua += linhaRua ? ` (${compl})` : compl;
  if (linhaRua) pedacos.push(linhaRua);

  // Bairro
  if (bairro) pedacos.push(bairro);

  // Cidade / UF
  let cidadeUf = cidade;
  if (uf) cidadeUf += cidadeUf ? `/${uf}` : uf;
  if (cidadeUf) pedacos.push(cidadeUf);

  let resultado = pedacos.join(' - ');

  // CEP
  if (cep && cep.length === 8) {
    resultado += ` [CEP: ${formatarCep(cep)}]`;
  }

  // Ponto de Referência
  if (ref) {
    resultado += ` (Ref: ${ref})`;
  }

  return resultado.trim();
}

/**
 * Decompõe uma string de endereço em campos estruturados básicos (fallback/parse inteligente).
 * @param {string} enderecoTexto
 * @returns {{ cep: string, logradouro: string, numero: string, complemento: string, bairro: string, cidade: string, uf: string, referencia: string }}
 */
export function decomporEndereco(enderecoTexto) {
  const res = {
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    referencia: '',
  };

  if (!enderecoTexto || typeof enderecoTexto !== 'string') return res;
  const texto = enderecoTexto.trim();

  // Extrai CEP se houver (00000-000 ou CEP: 00000-000)
  const cepMatch = texto.match(/(?:CEP:?\s*)?(\d{5}-?\d{3})/i);
  if (cepMatch) {
    res.cep = formatarCep(cepMatch[1]);
  }

  // Extrai Referência se houver [Ref: ...] ou (Ref: ...)
  const refMatch = texto.match(/(?:\[|\()Ref:?\s*([^\]\)]+)(?:\]|\))/i);
  if (refMatch) {
    res.referencia = refMatch[1].trim();
  }

  // Limpa CEP e Referência do texto base
  res.logradouro = texto
    .replace(/\[CEP:[^\]]+\]/gi, '')
    .replace(/\(Ref:[^\)]+\)/gi, '')
    .replace(/\[Ref:[^\]]+\]/gi, '')
    .trim();

  return res;
}

/**
 * Calcula os selos de fidelidade com base no histórico de pedidos do cliente.
 * Cada pedido válido (não cancelado) rende 1 selo. A cada 10 selos = 1 recompensa.
 * @param {Array<Object>} pedidos - Lista de pedidos do cliente.
 * @returns {{ totalPedidos: number, selos: number, selosRestantes: number, recompensas: number }}
 */
export function calcularFidelidadeCliente(pedidos = []) {
  const validOrders = (pedidos || []).filter((p) => p && p.status !== 'Cancelado');
  const total = validOrders.length;
  const selos = total % 10;
  const recompensas = Math.floor(total / 10);
  const selosRestantes = 10 - selos;

  return {
    totalPedidos: total,
    selos,
    selosRestantes: selos === 0 && total > 0 ? 0 : selosRestantes,
    recompensas,
  };
}

/**
 * Lê a sessão salva do cliente no navegador (localStorage).
 * @returns {Object|null}
 */
export function obterSessaoCliente() {
  try {
    const raw = localStorage.getItem(CUSTOMER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Salva a sessão do cliente no navegador.
 * @param {Object} cliente
 */
export function salvarSessaoCliente(cliente) {
  if (!cliente) return;
  try {
    localStorage.setItem(CUSTOMER_SESSION_KEY, JSON.stringify(cliente));
  } catch (e) {
    console.warn('[menuService] Não foi possível salvar sessão no localStorage:', e);
  }
}

/**
 * Remove a sessão do cliente (logout).
 */
export function limparSessaoCliente() {
  try {
    localStorage.removeItem(CUSTOMER_SESSION_KEY);
  } catch {
    // no-op
  }
}
