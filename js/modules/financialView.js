/* ============================================================
   FINANCIALVIEW.JS — Gestão Financeira & Planejamento de Metas
   (Metodologia da Planilha de Precificação & SENAC / Sebrae)
   ------------------------------------------------------------
   Gerencia a visualização e edição de custos fixos operacionais,
   mão de obra e pró-labore, deduções sobre a venda, faturamento
   alvo e demonstrativo sintético (DRE) com ponto de equilíbrio.
   ============================================================ */

import * as costSettings from './costSettings.js';
import * as storage from './storage.js';
import * as product from './product.js';
import * as base from './base.js';
import * as pricing from './pricing.js';
import * as dashboardService from './dashboardService.js';
import { showToast } from './toast.js';

/**
 * Formata valor monetário no padrão R$ 0,00.
 * @param {number} value
 * @returns {string}
 */
function formatCurrency(value) {
  return (Number(value) || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

/**
 * Coleta os valores atuais dos campos da tela de Financeiro.
 * @returns {Object}
 */
export function getFormValues() {
  const getNum = (id, fallback = 0) => {
    const el = document.getElementById(id);
    if (!el || el.value === '') return fallback;
    const n = Number(el.value);
    return Number.isFinite(n) ? n : fallback;
  };

  const getStr = (id, fallback = '') => {
    const el = document.getElementById(id);
    return el ? el.value : fallback;
  };

  return {
    proLaboreMensal: getNum('finProLabore', 3000),
    salarioAjudantes: getNum('finSalarioAjudantes', 0),
    tipoContratacao: getStr('finTipoContrato', 'clt'),
    encargosCltPct: getNum('finEncargosPct', 34.24),
    diasTrabalhadosMes: getNum('finDiasMes', 22),
    horasPorDia: getNum('finHorasDia', 8),

    aluguel: getNum('finAluguel', 0),
    energia: getNum('finEnergia', 160),
    gas: getNum('finGas', 130),
    agua: getNum('finAgua', 70),
    internetSistemas: getNum('finInternet', 90),
    manutencaoDepreciacao: getNum('finManutencao', 80),
    contadorOuMei: getNum('finContador', 75),
    produtosLimpeza: getNum('finLimpeza', 60),
    outrosCustosFixos: getNum('finOutrosCustos', 0),

    impostoVendaPct: getNum('finImpostoPct', 4.0),
    taxaCartaoMediaPct: getNum('finTaxaCartaoPct', 3.5),
    outrasDeducoesPct: getNum('finOutrasDeducoesPct', 0),
    quebraInsumosPct: getNum('finQuebraPct', 3.0),
    faturamentoAlvoMensal: getNum('finFaturamentoAlvo', 10000),
  };
}

/**
 * Preenche os inputs da tela com as configurações salvas.
 * @param {Object} [rates]
 */
export function populateInputs(rates) {
  const s = rates || costSettings.getCostSettings();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
  };

  setVal('finProLabore', s.proLaboreMensal);
  setVal('finSalarioAjudantes', s.salarioAjudantes);
  setVal('finTipoContrato', s.tipoContratacao || 'clt');
  setVal('finEncargosPct', s.encargosCltPct);
  setVal('finDiasMes', s.diasTrabalhadosMes);
  setVal('finHorasDia', s.horasPorDia);

  setVal('finAluguel', s.aluguel);
  setVal('finEnergia', s.energia);
  setVal('finGas', s.gas);
  setVal('finAgua', s.agua);
  setVal('finInternet', s.internetSistemas);
  setVal('finManutencao', s.manutencaoDepreciacao);
  setVal('finContador', s.contadorOuMei);
  setVal('finLimpeza', s.produtosLimpeza);
  setVal('finOutrosCustos', s.outrosCustosFixos);

  setVal('finImpostoPct', s.impostoVendaPct);
  setVal('finTaxaCartaoPct', s.taxaCartaoMediaPct);
  setVal('finOutrasDeducoesPct', s.outrasDeducoesPct);
  setVal('finQuebraPct', s.quebraInsumosPct);
  setVal('finFaturamentoAlvo', s.faturamentoAlvoMensal);
}

/**
 * Recalcula e atualiza todos os cards de KPIs, resumos e DRE projetado na interface.
 */
export function updateCalculations() {
  const values = getFormValues();
  const rates = costSettings.calculateCostRates(values);

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  // 1. Mão de Obra
  setText('finHorasMensais', `${rates.horasMensais}h`);
  setText('finTotalMOD', formatCurrency(rates.totalMaoDeObraMensal));
  setText('finCustoHoraMOD', `${formatCurrency(rates.custoHoraMaoDeObra)} /h`);
  setText('finCustoMinutoMOD', `${formatCurrency(rates.custoMinutoMaoDeObra)} /min`);

  // 2. Custos Fixos
  setText('finTotalCustosFixos', `${formatCurrency(rates.totalCustosFixos)} /mês`);
  setText('finCustoFixoHora', `${formatCurrency(rates.custoHoraFixo)} /h`);

  // 3. Deduções
  setText('finTotalDeducoesPct', `${rates.deducoesVendaPct.toFixed(1)}%`);

  // 4. Metas Fracionadas e Faturamento Alvo
  setText('kpiMetaSemanal', formatCurrency(rates.metaSemanal));
  setText('kpiMetaDiaria', formatCurrency(rates.metaDiaria));
  setText('kpiCustoFixoPct', `${rates.custoFixoPct.toFixed(1)}%`);
  setText('kpiMaoDeObraPct', `${rates.maoDeObraPct.toFixed(1)}%`);

  // 5. Ponto de Equilíbrio Operacional (Break-Even)
  setText('peMesReais', formatCurrency(rates.pontoEquilibrioMensalReais));
  setText('peSemanaReais', formatCurrency(rates.pontoEquilibrioSemanalReais));
  setText('peDiaReais', formatCurrency(rates.pontoEquilibrioDiarioReais));

  // 6. DRE Sintético Projetado
  setText('dreFaturamentoBruto', formatCurrency(rates.faturamentoAlvoMensal));
  setText('dreDeducoes', `- ${formatCurrency(rates.deducoesProjetadasValor)}`);
  setText('dreDeducoesPct', `${rates.deducoesVendaPct.toFixed(1)}%`);

  setText('dreFaturamentoLiquido', formatCurrency(rates.faturamentoLiquidoProjetado));
  const fatLiqPct = rates.faturamentoAlvoMensal > 0 ? (rates.faturamentoLiquidoProjetado / rates.faturamentoAlvoMensal) * 100 : 0;
  setText('dreFaturamentoLiquidoPct', `${fatLiqPct.toFixed(1)}%`);

  setText('dreCMV', `- ${formatCurrency(rates.cmvEstimadoValor)}`);

  setText('dreLucroBruto', formatCurrency(rates.lucroBrutoProjetado));
  const lucroBrutoPct = rates.faturamentoAlvoMensal > 0 ? (rates.lucroBrutoProjetado / rates.faturamentoAlvoMensal) * 100 : 0;
  setText('dreLucroBrutoPct', `${lucroBrutoPct.toFixed(1)}%`);

  setText('dreMOD', `- ${formatCurrency(rates.totalMaoDeObraMensal)}`);
  setText('dreMODPct', `${rates.maoDeObraPct.toFixed(1)}%`);

  setText('dreCustosFixos', `- ${formatCurrency(rates.totalCustosFixos)}`);
  setText('dreCustosFixosPct', `${rates.custoFixoPct.toFixed(1)}%`);

  setText('dreLucroLiquido', formatCurrency(rates.lucroLiquidoProjetado));
  setText('dreLucroLiquidoPct', `${rates.margemLucroProjetadaPct.toFixed(1)}%`);

  // Destaque visual do Lucro Líquido
  const lucroRow = document.getElementById('dreRowLucroFinal');
  const healthBadge = document.getElementById('dreHealthBadge');

  if (lucroRow) {
    if (rates.lucroLiquidoProjetado > 0) {
      lucroRow.style.color = 'var(--color-ok)';
    } else if (rates.lucroLiquidoProjetado === 0) {
      lucroRow.style.color = 'var(--color-warn)';
    } else {
      lucroRow.style.color = 'var(--color-danger)';
    }
  }

  if (healthBadge) {
    if (rates.lucroLiquidoProjetado > 0) {
      healthBadge.className = 'financial-health-card financial-health-ok';
      healthBadge.innerHTML = `
        <div>
          <span class="badge" style="background: var(--color-ok-soft); color: var(--color-ok); margin-bottom: 6px; display: inline-block;">Operação Lucrativa</span>
          <p>Com faturamento de ${formatCurrency(rates.faturamentoAlvoMensal)}, a confeitaria cobre 100% dos custos, paga o pró-labore de ${formatCurrency(rates.proLaboreMensal)} e acumula <strong>${formatCurrency(rates.lucroLiquidoProjetado)} (${rates.margemLucroProjetadaPct.toFixed(1)}%)</strong> de lucro líquido no caixa da empresa.</p>
        </div>
      `;
    } else if (rates.lucroLiquidoProjetado === 0) {
      healthBadge.className = 'financial-health-card financial-health-warn';
      healthBadge.innerHTML = `
        <div>
          <span class="badge" style="background: var(--color-warn-soft); color: var(--color-warn); margin-bottom: 6px; display: inline-block;">Ponto de Equilíbrio</span>
          <p>As contas da empresa e salários estão pagos, mas sem margem de sobra para reservas de segurança ou investimentos.</p>
        </div>
      `;
    } else {
      healthBadge.className = 'financial-health-card financial-health-danger';
      healthBadge.innerHTML = `
        <div>
          <span class="badge" style="background: var(--color-danger-soft); color: var(--color-danger); margin-bottom: 6px; display: inline-block;">Meta Abaixo do Equilíbrio</span>
          <p>Com essa meta de faturamento, a confeitaria fechará com déficit de <strong>${formatCurrency(Math.abs(rates.lucroLiquidoProjetado))}</strong>. Aumente o faturamento alvo para ao menos <strong>${formatCurrency(rates.pontoEquilibrioMensalReais)}</strong> ou reduza custos fixos.</p>
        </div>
      `;
    }
  }

  // 7. Atualiza termômetro de acompanhamento real de vendas no mês
  updateBreakEvenThermometer();
}

/**
 * Renderiza o termômetro de progresso do Ponto de Equilíbrio no mês vigente.
 */
export function updateBreakEvenThermometer() {
  const badgeEl = document.getElementById('dashBreakevenBadge');
  const fillEl = document.getElementById('dashBreakevenFill');
  const margemEl = document.getElementById('dashBreakevenMargem');
  const metaEl = document.getElementById('dashBreakevenMeta');
  const statusEl = document.getElementById('dashBreakevenStatus');
  if (!badgeEl || !fillEl || !margemEl || !metaEl || !statusEl) return;

  const allOrders = storage.getAll();
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const from = `${year}-${month}-01`;
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  const to = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;

  const monthOrders = dashboardService.filterByRange(allOrders, { from, to });
  const products = product.getProducts();
  const receitas = storage.getAllPrecificacoes();
  const insumos = storage.getAllInsumos();
  const bases = base.getBases();
  const rates = costSettings.getCostSettings();

  const progress = dashboardService.breakEvenProgress(
    monthOrders,
    products,
    receitas,
    pricing.calcular,
    insumos,
    bases,
    rates
  );

  margemEl.textContent = formatCurrency(progress.margemTotal);
  metaEl.textContent = formatCurrency(progress.metaMensal);
  fillEl.style.width = `${Math.min(100, Math.max(0, progress.percentual))}%`;

  if (progress.metaMensal <= 0) {
    badgeEl.textContent = 'Sem Metas';
    badgeEl.className = 'badge';
    badgeEl.style.background = 'var(--color-surface-alt)';
    badgeEl.style.color = 'var(--color-text-muted)';
    statusEl.textContent = 'Defina custos fixos para calcular.';
    statusEl.style.color = 'var(--color-text-muted)';
    return;
  }

  badgeEl.textContent = `${progress.percentual.toFixed(1)}% Atingido`;
  if (progress.atingido) {
    badgeEl.className = 'badge badge-success';
    badgeEl.style.background = 'var(--color-ok-soft)';
    badgeEl.style.color = 'var(--color-ok)';
    fillEl.style.background = 'var(--color-ok)';
    const excedenteTxt = progress.excedente > 0 ? ` (+ ${formatCurrency(progress.excedente)} de lucro)` : '';
    statusEl.innerHTML = `<span style="color: var(--color-ok); font-weight: 700;">Contas do mês pagas!</span>${excedenteTxt}`;
    statusEl.style.color = 'var(--color-text)';
  } else {
    badgeEl.className = 'badge badge-warning';
    badgeEl.style.background = 'var(--color-warn-soft)';
    badgeEl.style.color = 'var(--color-warn)';
    fillEl.style.background = 'var(--color-primary)';
    statusEl.innerHTML = `Faltam <strong>${formatCurrency(progress.restante)}</strong> para o ponto de equilíbrio.`;
    statusEl.style.color = 'var(--color-text-muted)';
  }
}

let isEditing = false;
let snapshotValues = null;

/**
 * Salva snapshot dos valores para possível cancelamento.
 */
function saveSnapshot() {
  snapshotValues = getFormValues();
}

/**
 * Restaura snapshot dos valores salvos.
 */
function restoreSnapshot() {
  if (snapshotValues) {
    populateInputs(snapshotValues);
    updateCalculations();
  } else {
    populateInputs(costSettings.getCostSettings());
    updateCalculations();
  }
}

/**
 * Alterna a interface da tela Financeiro entre modo Leitura e modo Edição.
 * @param {boolean} editing
 */
export function setEditingMode(editing) {
  isEditing = editing;

  const btnEdit = document.getElementById('btnEditFinancialSettings');
  const editingActions = document.getElementById('finEditingActions');

  if (btnEdit) btnEdit.style.display = editing ? 'none' : 'inline-flex';
  if (editingActions) editingActions.style.display = editing ? 'inline-flex' : 'none';

  // Habilita ou desabilita todos os inputs e selects da tela de Financeiro
  const view = document.getElementById('view-financeiro');
  if (view) {
    const fields = view.querySelectorAll('input, select');
    fields.forEach((f) => {
      f.disabled = !editing;
    });
  }
}

/**
 * Salva as configurações editadas no storage.
 */
export function saveSettings() {
  const values = getFormValues();
  const saved = costSettings.saveCostSettings(values);
  updateCalculations();

  // Sincroniza o modal legado caso esteja no DOM
  syncLegacyModal(saved);

  // Retorna para o modo visualização (leitura)
  setEditingMode(false);

  showToast('Parâmetros financeiros salvos com sucesso!', 'success');
}

/**
 * Sincroniza os inputs do modal antigo para manter compatibilidade absoluta.
 * @param {Object} s
 */
function syncLegacyModal(s) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val != null ? val : '';
  };

  setVal('costAluguel', s.aluguel);
  setVal('costEnergia', s.energia);
  setVal('costGas', s.gas);
  setVal('costAgua', s.agua);
  setVal('costInternet', s.internetSistemas);
  setVal('costManutencao', s.manutencaoDepreciacao);
  setVal('costContador', s.contadorOuMei);
  setVal('costLimpeza', s.produtosLimpeza);
  setVal('costProLabore', s.proLaboreMensal);
  setVal('costSalarioAjudantes', s.salarioAjudantes);
  setVal('costTipoContrato', s.tipoContratacao || 'clt');
  setVal('costEncargosPct', s.encargosCltPct);
  setVal('costDiasMes', s.diasTrabalhadosMes);
  setVal('costHorasDia', s.horasPorDia);
  setVal('costImpostoPct', s.impostoVendaPct);
  setVal('costTaxaCartaoPct', s.taxaCartaoMediaPct);
  setVal('costQuebraPct', s.quebraInsumosPct);
}

/**
 * Renderiza a tela de Financeiro (inicia sempre em modo leitura).
 */
export function render() {
  populateInputs();
  updateCalculations();
  setEditingMode(false);
}

/**
 * Inicializa os event listeners da tela de Financeiro.
 */
export function init() {
  const view = document.getElementById('view-financeiro');
  if (!view) return;

  const btnEdit = document.getElementById('btnEditFinancialSettings');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      saveSnapshot();
      setEditingMode(true);
    });
  }

  const btnCancel = document.getElementById('btnCancelFinancialSettings');
  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      restoreSnapshot();
      setEditingMode(false);
    });
  }

  const btnSave = document.getElementById('btnSaveFinancialSettings');
  if (btnSave) {
    btnSave.addEventListener('click', saveSettings);
  }

  // Atualização em tempo real ao digitar em qualquer input da view (somente quando editando)
  view.addEventListener('input', () => {
    if (isEditing) updateCalculations();
  });

  view.addEventListener('change', () => {
    if (isEditing) updateCalculations();
  });
}
