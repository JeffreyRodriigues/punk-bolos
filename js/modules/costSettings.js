/* ============================================================
   COSTSETTINGS.JS — Parâmetros Globais de Custos da Confeitaria
   (Metodologia SENAC / Sebrae)
   ------------------------------------------------------------
   Gerencia a estrutura de custos fixos mensais, equipe e mão de
   obra com encargos CLT/MEI, horas produtivas do mês e taxas de
   venda/deduções para a formação profissional de preços.
   ============================================================ */

export const STORAGE_KEY = 'punk_cost_settings';

/** Configurações padrão de custos de uma confeitaria artesanal / MEI / ME. */
export const DEFAULT_COST_SETTINGS = {
  // 1. Custos Fixos e Operacionais Mensais (R$)
  aluguel: 0,
  energia: 160,
  gas: 130,
  agua: 70,
  internetSistemas: 90,
  manutencaoDepreciacao: 80,
  contadorOuMei: 75,
  produtosLimpeza: 60,
  outrosCustosFixos: 0,

  // 2. Mão de Obra e Equipe
  proLaboreMensal: 3000,
  salarioAjudantes: 0,
  tipoContratacao: 'clt', // 'clt' | 'fixo'
  encargosCltPct: 34.24,  // 13º (8.33%) + Férias/1/3 (11.11%) + FGTS (8%) + Multa FGTS (3.8%) + outros (3%)
  beneficiosMensais: 0,   // VT, VA, cesta básica

  // 3. Jornada de Trabalho e Horas Produtivas
  diasTrabalhadosMes: 22,
  horasPorDia: 8,

  // 4. Deduções sobre a Venda & Segurança
  impostoVendaPct: 4.0,       // Simples Nacional Anexo I (ou 0 se MEI com DAS no custo fixo)
  taxaCartaoMediaPct: 3.5,    // Taxa média ponderada de maquininhas/meios de pagamento
  outrasDeducoesPct: 0,       // Comissões ou taxas adicionais
  quebraInsumosPct: 3.0,      // Margem de quebra técnica / perdas de cocção e manipulação (3% a 5%)
  lucroLiquidoPadraoPct: 25.0 // Margem de lucro líquido real desejada pela confeitaria
};

/**
 * Arredonda para 2 casas decimais.
 * @param {number} value
 * @returns {number}
 */
function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Calcula todas as taxas horárias, custo do minuto e deduções consolidadas.
 * @param {Object} [settings] - Parâmetros fornecidos (ou mescla com padrão).
 * @returns {Object} Taxas calculadas prontas para uso no motor de precificação.
 */
export function calculateCostRates(settings = {}) {
  const s = { ...DEFAULT_COST_SETTINGS, ...settings };

  // 1. Total de Custos Fixos Mensais (R$)
  const totalCustosFixos = round2(
    Number(s.aluguel || 0) +
    Number(s.energia || 0) +
    Number(s.gas || 0) +
    Number(s.agua || 0) +
    Number(s.internetSistemas || 0) +
    Number(s.manutencaoDepreciacao || 0) +
    Number(s.contadorOuMei || 0) +
    Number(s.produtosLimpeza || 0) +
    Number(s.outrosCustosFixos || 0)
  );

  // 2. Mão de Obra e Encargos
  const proLabore = Number(s.proLaboreMensal || 0);
  const salarioAjudantes = Number(s.salarioAjudantes || 0);
  const encargosPct = s.encargosCltPct !== undefined && s.encargosCltPct !== null && s.encargosCltPct !== ''
    ? Number(s.encargosCltPct)
    : 34.24;
  const encargos = s.tipoContratacao === 'clt' 
    ? (salarioAjudantes * (encargosPct / 100)) 
    : 0;
  const beneficios = Number(s.beneficiosMensais || 0);
  const totalMaoDeObraMensal = round2(proLabore + salarioAjudantes + encargos + beneficios);

  // 3. Horas e Minutos Produtivos no Mês
  const dias = Math.max(1, Number(s.diasTrabalhadosMes || 22));
  const horasDia = Math.max(1, Number(s.horasPorDia || 8));
  const horasMensais = round2(dias * horasDia);
  const minutosMensais = round2(horasMensais * 60);

  // 4. Custo por Hora e por Minuto
  const custoHoraMaoDeObra = horasMensais > 0 ? round2(totalMaoDeObraMensal / horasMensais) : 0;
  const custoMinutoMaoDeObra = minutosMensais > 0 ? Number((totalMaoDeObraMensal / minutosMensais).toFixed(4)) : 0;

  const custoHoraFixo = horasMensais > 0 ? round2(totalCustosFixos / horasMensais) : 0;
  const custoMinutoFixo = minutosMensais > 0 ? Number((totalCustosFixos / minutosMensais).toFixed(4)) : 0;

  // 5. Deduções Totais da Venda
  const impostoPct = Number(s.impostoVendaPct || 0);
  const taxaCartaoPct = Number(s.taxaCartaoMediaPct || 0);
  const outrasDeducoesPct = Number(s.outrasDeducoesPct || 0);
  const deducoesVendaPct = round2(impostoPct + taxaCartaoPct + outrasDeducoesPct);

  const quebraInsumosPct = Number(s.quebraInsumosPct || 0);
  const lucroLiquidoPadraoPct = Number(s.lucroLiquidoPadraoPct || 25);

  return {
    ...s,
    totalCustosFixos,
    totalMaoDeObraMensal,
    horasMensais,
    minutosMensais,
    custoHoraMaoDeObra,
    custoMinutoMaoDeObra,
    custoHoraFixo,
    custoMinutoFixo,
    impostoPct,
    taxaCartaoPct,
    outrasDeducoesPct,
    deducoesVendaPct,
    quebraInsumosPct,
    lucroLiquidoPadraoPct
  };
}

/**
 * Obtém as configurações salvas no localStorage ou os padrões de fábrica.
 * @returns {Object}
 */
export function getCostSettings() {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return calculateCostRates(parsed);
      }
    }
  } catch (e) {
    // Retorna os padrões se o storage estiver inacessível
  }
  return calculateCostRates(DEFAULT_COST_SETTINGS);
}

/**
 * Salva as configurações no storage local.
 * @param {Object} newSettings
 * @returns {Object}
 */
export function saveCostSettings(newSettings = {}) {
  const merged = { ...DEFAULT_COST_SETTINGS, ...newSettings };
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }
  return calculateCostRates(merged);
}
