/* ============================================================
   CUSTOMERSERVICE.JS — Regras de negócio de Clientes & CRM
   ------------------------------------------------------------
   Módulo puro (sem DOM). Responsável por:
   - Cálculo de dias para aniversário (com virada de ano)
   - Filtragem de aniversariantes próximos com histórico de pedidos
   - Agregação de métricas de clientes (LTV, total de pedidos, VIP, inativos)
   - Gerador de links e mensagens personalizadas para o WhatsApp
   ============================================================ */

import { formatCurrency } from '../utils/money.js';

/**
 * Remove caracteres não numéricos e formata o telefone para o padrão WhatsApp.
 * Remove prefixo 55 se já vier duplicado e garante apenas dígitos.
 * @param {string} telefone - Telefone bruto.
 * @returns {string} Telefone apenas com dígitos (DDD + número).
 */
export function sanitizarTelefone(telefone) {
  if (!telefone) return '';
  let digits = String(telefone).replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  return digits;
}

/**
 * Gera o link direto para o WhatsApp (wa.me) com a mensagem codificada.
 * @param {string} telefone - Telefone/WhatsApp do cliente.
 * @param {string} mensagem - Texto da mensagem pré-formatada.
 * @returns {string} URL wa.me ou string vazia se telefone inválido.
 */
export function formatarWhatsappLink(telefone, mensagem = '') {
  const digits = sanitizarTelefone(telefone);
  if (!digits || digits.length < 10) return '';
  const numComDdi = `55${digits}`;
  const encoded = encodeURIComponent(mensagem);
  return `https://wa.me/${numComDdi}?text=${encoded}`;
}

/**
 * Calcula a quantidade de dias restantes até o próximo aniversário do cliente.
 * Trata casos de mesmo mês, meses futuros e virada de ano civil.
 * @param {string} dataNascimento - String YYYY-MM-DD ou DD/MM.
 * @param {Date} [dataReferencia] - Data atual para cálculo.
 * @returns {number|null} Dias até o aniversário ou null se inválido.
 */
export function diasParaAniversario(dataNascimento, dataReferencia = new Date()) {
  if (!dataNascimento || typeof dataNascimento !== 'string') return null;

  let mes, dia;
  if (dataNascimento.includes('-')) {
    const parts = dataNascimento.split('-');
    if (parts.length < 3) return null;
    mes = Number(parts[1]) - 1; // 0-indexed
    dia = Number(parts[2]);
  } else if (dataNascimento.includes('/')) {
    const parts = dataNascimento.split('/');
    if (parts.length < 2) return null;
    dia = Number(parts[0]);
    mes = Number(parts[1]) - 1;
  } else {
    return null;
  }

  if (Number.isNaN(mes) || Number.isNaN(dia) || mes < 0 || mes > 11 || dia < 1 || dia > 31) {
    return null;
  }

  const anoRef = dataReferencia.getFullYear();
  const hoje = new Date(anoRef, dataReferencia.getMonth(), dataReferencia.getDate());
  let proxNiver = new Date(anoRef, mes, dia);

  // Se o aniversário deste ano já passou, calcula para o próximo ano
  if (proxNiver < hoje) {
    proxNiver = new Date(anoRef + 1, mes, dia);
  }

  const diffMs = proxNiver.getTime() - hoje.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formata uma data de nascimento para exibição simplificada (DD/MM ou DD/MM/AAAA).
 * @param {string} dataNascimento - Data bruta.
 * @returns {string} Data formatada.
 */
export function formatarDataAniversario(dataNascimento) {
  if (!dataNascimento) return '—';
  if (dataNascimento.includes('-')) {
    const parts = dataNascimento.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}`;
    }
  }
  return dataNascimento;
}

/**
 * Obtém o último sabor ou produto comprado pelo cliente a partir do histórico de pedidos.
 * @param {string} clienteNome - Nome do cliente.
 * @param {Array<Object>} orders - Lista de pedidos.
 * @returns {string|null} Último sabor comprado ou null.
 */
function extrairUltimoSabor(clienteNome, orders = []) {
  if (!clienteNome) return null;
  const nomeNorm = clienteNome.trim().toLowerCase();

  const pedidosCliente = (orders || [])
    .filter((o) => o.status !== 'Cancelado' && String(o.cliente || '').trim().toLowerCase() === nomeNorm)
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));

  for (const o of pedidosCliente) {
    if (Array.isArray(o.itens) && o.itens.length > 0) {
      const itemComSabor = o.itens.find((i) => i.sabor && String(i.sabor).trim());
      if (itemComSabor) {
        return itemComSabor.sabor.trim();
      }
      const primeiroItem = o.itens[0];
      if (primeiroItem.tipoProduto) {
        return primeiroItem.tipoProduto;
      }
    }
  }
  return null;
}

/**
 * Retorna os clientes que fazem aniversário dentro da janela de dias especificada.
 * @param {Array<Object>} customers - Lista de clientes.
 * @param {Array<Object>} orders - Lista de pedidos (para extrair sabor favorito).
 * @param {number} [diasJanela=15] - Janela de dias futuros.
 * @param {Date} [dataReferencia=new Date()] - Data de corte.
 * @returns {Array<Object>} Aniversariantes ordenados do mais próximo ao mais distante.
 */
export function aniversariantesProximos(customers = [], orders = [], diasJanela = 15, dataReferencia = new Date()) {
  const list = [];

  (customers || []).forEach((c) => {
    const dias = diasParaAniversario(c.dataNascimento, dataReferencia);
    if (dias !== null && dias >= 0 && dias <= diasJanela) {
      const ultimoSabor = extrairUltimoSabor(c.nome, orders);
      list.push({
        ...c,
        diasRestantes: dias,
        ultimoSabor,
      });
    }
  });

  return list.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/**
 * Agrega dados de histórico (LTV, total de pedidos, data do último pedido, status VIP e inatividade)
 * para cada cliente cadastrado.
 * @param {Array<Object>} customers - Clientes cadastrados.
 * @param {Array<Object>} orders - Pedidos.
 * @param {Date} [dataReferencia=new Date()] - Data de corte.
 * @returns {Array<Object>} Clientes enriquecidos com métricas.
 */
export function clientesComMetricas(customers = [], orders = [], dataReferencia = new Date()) {
  const agora = new Date(dataReferencia.getFullYear(), dataReferencia.getMonth(), dataReferencia.getDate());
  const mapPedidos = new Map();

  (orders || []).forEach((o) => {
    if (o.status === 'Cancelado') return;
    const nomeNorm = String(o.cliente || '').trim().toLowerCase();
    if (!nomeNorm) return;

    if (!mapPedidos.has(nomeNorm)) {
      mapPedidos.set(nomeNorm, []);
    }
    mapPedidos.get(nomeNorm).push(o);
  });

  return (customers || []).map((c) => {
    const nomeNorm = String(c.nome || '').trim().toLowerCase();
    const pedidos = mapPedidos.get(nomeNorm) || [];

    const totalPedidos = pedidos.length;
    const totalGasto = Math.round(
      pedidos.reduce((acc, p) => acc + (Number(p.valorTotal) || 0), 0) * 100
    ) / 100;

    let ultimoPedidoData = '';
    let diasSemComprar = null;

    if (totalPedidos > 0) {
      const datas = pedidos.map((p) => p.data).filter(Boolean).sort();
      if (datas.length > 0) {
        ultimoPedidoData = datas[datas.length - 1];
        const [ano, mes, dia] = ultimoPedidoData.split('-').map(Number);
        if (ano && mes && dia) {
          const dataUlt = new Date(ano, mes - 1, dia);
          const diffMs = agora.getTime() - dataUlt.getTime();
          diasSemComprar = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        }
      }
    }

    // Regras: VIP se comprou >= R$ 250 ou fez >= 3 pedidos
    const isVIP = totalGasto >= 250 || totalPedidos >= 3;
    // Inativo se já comprou no passado mas está há mais de 60 dias sem comprar
    const isInativo = totalPedidos > 0 && diasSemComprar !== null && diasSemComprar > 60;
    const diasNiver = diasParaAniversario(c.dataNascimento, dataReferencia);

    return {
      ...c,
      totalGasto,
      totalPedidos,
      ultimoPedidoData,
      diasSemComprar,
      isVIP,
      isInativo,
      diasParaAniversario: diasNiver,
    };
  });
}

/**
 * Calcula os indicadores gerais do dashboard de CRM/Clientes.
 * @param {Array<Object>} customers - Clientes.
 * @param {Array<Object>} orders - Pedidos.
 * @param {Date} [dataReferencia=new Date()] - Data de corte.
 * @returns {Object} Indicadores de resumo.
 */
export function metricasClientes(customers = [], orders = [], dataReferencia = new Date()) {
  const enriquecidos = clientesComMetricas(customers, orders, dataReferencia);
  const totalClientes = enriquecidos.length;
  const aniversariantes = aniversariantesProximos(customers, orders, 15, dataReferencia).length;
  const totalVips = enriquecidos.filter((c) => c.isVIP).length;
  const totalInativos = enriquecidos.filter((c) => c.isInativo).length;

  const somaLtv = enriquecidos.reduce((acc, c) => acc + c.totalGasto, 0);
  const ticketMedioLtv = totalClientes > 0 ? Math.round((somaLtv / totalClientes) * 100) / 100 : 0;

  return {
    totalClientes,
    aniversariantesProximos: aniversariantes,
    totalVips,
    totalInativos,
    ticketMedioLtv,
  };
}

/**
 * Gera uma mensagem amigável e personalizada de aniversário para envio via WhatsApp.
 * Inclui preferências/observações do cliente caso existam.
 * @param {Object} customer - Objeto do cliente.
 * @param {string|null} [ultimoSabor] - Sabor comprado anteriormente.
 * @returns {string} Mensagem pronta.
 */
export function gerarMensagemAniversario(customer, ultimoSabor = null) {
  const nome = (customer && customer.nome ? customer.nome.trim() : 'Cliente').split(' ')[0];
  const obs = customer && customer.observacoes ? customer.observacoes.trim() : '';

  let msg = '';
  if (ultimoSabor) {
    msg = `Oi ${nome}, tudo bem? Passando para lembrar que seu aniversário está chegando! Que tal já garantir a sua comemoração com a Punk Bolos? Da última vez você pediu nosso ${ultimoSabor}, podemos preparar um especial para o seu dia!`;
  } else {
    msg = `Oi ${nome}, tudo bem? Passando para lembrar que seu aniversário está chegando! Que tal já garantir a sua data e encomendar seu bolo com a Punk Bolos? Posso te mandar o nosso cardápio atualizado?`;
  }

  if (obs) {
    msg += ` Já deixei anotado aqui o seu gosto/preferência: "${obs}".`;
  }

  return msg;
}

/**
 * Gera uma mensagem detalhada para o WhatsApp com o resumo do pedido (itens, total, entrega)
 * solicitando a confirmação e a forma de pagamento preferida.
 * @param {Object} order - Objeto do pedido.
 * @returns {string} Mensagem pronta.
 */
export function gerarMensagemPedido(order) {
  if (!order) return '';
  const cliente = (order.cliente || 'Cliente').trim();
  const itens = Array.isArray(order.itens) ? order.itens : [];

  const itensList = itens.map((item) => {
    const qtd = item.quantidade || 1;
    let tipo = item.tipoProduto || 'Produto';
    if (tipo.toLowerCase() === 'fatia' && qtd > 1) {
      tipo = 'Fatias';
    }
    const tam = item.tamanho ? `(${item.tamanho})` : '';
    const sabor = item.sabor ? ` ${item.sabor}` : '';
    const totalItem = (Number(item.quantidade) || 1) * (Number(item.valorUnitario) || 0);
    const valorStr = item.cortesia
      ? 'Cortesia'
      : (Number(totalItem) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return `${qtd} x ${tipo}${tam}${sabor} - ${valorStr}`;
  }).join('\n');

  const valorTotalStr = (Number(order.valorTotal) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const formaPagamento = order.pagamento ? ` (está marcado como ${order.pagamento})` : '';
  const entregaStr = order.entrega ? `\nEntrega: ${order.entrega}` : '';

  return `Olá ${cliente}! Tudo bem?\n\nSobre o seu pedido #${order.numero} da Punk Bolos:\n\n${itensList || '1 x Pedido Especial'}\n\nTotal ${valorTotalStr}${entregaStr}\n\nVocê confirma os itens do seu pedido? Qual seria a melhor forma de pagamento para você${formaPagamento}?`;
}

