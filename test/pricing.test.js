/* ============================================================
   TESTE — pricing.test.js (regras profissionais SENAC / Sebrae)
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as inventory from '../js/modules/inventory.js';
import * as pricing from '../js/modules/pricing.js';
import * as costSettings from '../js/modules/costSettings.js';

/* ---------- Fixtures (exemplo real da spec) ---------- */

function FARINHA() {
  return inventory.createInsumo({ nome: 'Farinha', unidade: 'g', compras: [{ data: '2026-01-01', custoTotal: 35, quantidadeCompra: 5000 }] });
}
function ACUCAR() {
  return inventory.createInsumo({ nome: 'Açúcar', unidade: 'g', compras: [{ data: '2026-01-01', custoTotal: 30, quantidadeCompra: 5000 }] });
}
function CHOCOLATE() {
  return inventory.createInsumo({ nome: 'Chocolate', unidade: 'g', compras: [{ data: '2026-01-01', custoTotal: 12, quantidadeCompra: 300 }] });
}
function LEITE() {
  return inventory.createInsumo({ nome: 'Leite', unidade: 'ml', compras: [{ data: '2026-01-01', custoTotal: 4.5, quantidadeCompra: 1000 }] });
}
function FERMENTO() {
  return inventory.createInsumo({ nome: 'Fermento', unidade: 'g', compras: [{ data: '2026-01-01', custoTotal: 3, quantidadeCompra: 15 }] });
}
function OVOS() {
  return inventory.createInsumo({ nome: 'Ovos', unidade: 'g', compras: [{ data: '2026-01-01', custoTotal: 4, quantidadeCompra: 100 }] });
}

function insumosExemplo() {
  return [FARINHA(), ACUCAR(), CHOCOLATE(), LEITE(), FERMENTO(), OVOS()];
}

function receitaExemplo(insumos) {
  const [f, a, c, l, fe, o] = insumos;
  return pricing.createReceita({
    produtoId: 'p1',
    itens: [
      { insumoId: f.id, quantidade: 250 },
      { insumoId: a.id, quantidade: 150 },
      { insumoId: c.id, quantidade: 50 },
      { insumoId: l.id, quantidade: 200 },
      { insumoId: fe.id, quantidade: 5 },
      { insumoId: o.id, quantidade: 62 },
    ],
    margem: 25,
    multiplicador: 3,
    rendimento: 10,
    embalagem: 1,
    custoAdicional: 0,
    tempoPreparoMinutos: 30,
    lucroLiquidoDesejado: 25,
  });
}

/* ---------- createReceita: defaults ---------- */

test('createReceita: aplica defaults da spec (25/3/10/1)', () => {
  const r = pricing.createReceita({ produtoId: 'p1' });
  assert.equal(r.margem, 25);
  assert.equal(r.multiplicador, 3);
  assert.equal(r.rendimento, 10);
  assert.equal(r.embalagem, 1);
  assert.equal(r.custoAdicional, 0);
  assert.equal(r.tempoPreparoMinutos, 30);
  assert.equal(r.lucroLiquidoDesejado, 25);
  assert.ok(r.id.startsWith('prc'));
});

/* ---------- custoIngredientes ---------- */

test('custoIngredientes: soma os itens arredondados (exemplo = 9,03)', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  assert.equal(pricing.custoIngredientes(r, insumos), 9.03);
});

test('custoIngredientes: insumo ausente na receita não conta', () => {
  const insumos = [FARINHA()];
  const r = pricing.createReceita({
    produtoId: 'p1',
    itens: [{ insumoId: 'id-inexistente', quantidade: 100 }],
  });
  assert.equal(pricing.custoIngredientes(r, insumos), 0);
});

/* ---------- costSettings: cálculo de taxas horárias e encargos ---------- */

test('costSettings: calcula custo hora/minuto e encargos CLT corretamente', () => {
  const settings = {
    proLaboreMensal: 3000,
    salarioAjudantes: 2000,
    tipoContratacao: 'clt',
    encargosCltPct: 34.24, // 2000 * 0.3424 = 684.80
    beneficiosMensais: 300,
    diasTrabalhadosMes: 20,
    horasPorDia: 8, // 160h no mês = 9600 minutos
    aluguel: 1000,
    energia: 300,
    gas: 200,
    agua: 100,
    internetSistemas: 100,
    manutencaoDepreciacao: 100,
    contadorOuMei: 200,
    produtosLimpeza: 100,
    outrosCustosFixos: 0,
    impostoVendaPct: 4.0,
    taxaCartaoMediaPct: 3.5,
    quebraInsumosPct: 3.0,
    lucroLiquidoPadraoPct: 25.0,
  };

  const rates = costSettings.calculateCostRates(settings);
  assert.equal(rates.totalCustosFixos, 2100);
  assert.equal(rates.totalMaoDeObraMensal, 5984.80); // 3000 + 2000 + 684.80 + 300
  assert.equal(rates.horasMensais, 160);
  assert.equal(rates.minutosMensais, 9600);
  assert.equal(rates.custoHoraMaoDeObra, 37.41); // 5984.80 / 160
  assert.equal(rates.custoHoraFixo, 13.13); // 2100 / 160
  assert.equal(rates.deducoesVendaPct, 7.5); // 4.0 + 3.5
});

/* ---------- calcular: pipeline completo e Markup Divisor SENAC ---------- */

test('calcular: pipeline completo Senac/Sebrae com Markup Divisor', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  
  // Parâmetros simulados
  const customRates = costSettings.calculateCostRates({
    proLaboreMensal: 3000,
    salarioAjudantes: 0,
    diasTrabalhadosMes: 22,
    horasPorDia: 8, // 176h = 10560 min -> 3000/10560 = 0.2841/min
    aluguel: 0,
    energia: 160,
    gas: 130,
    agua: 70,
    internetSistemas: 90,
    manutencaoDepreciacao: 80,
    contadorOuMei: 75,
    produtosLimpeza: 60,
    outrosCustosFixos: 0, // Total Fixos = 665 / 10560 = 0.0630/min
    impostoVendaPct: 4.0,
    taxaCartaoMediaPct: 3.5,
    quebraInsumosPct: 3.0,
    lucroLiquidoPadraoPct: 25.0,
  });

  const c = pricing.calcular(r, insumos, [], customRates);
  assert.equal(c.custoIngredientes, 9.03);
  assert.equal(c.custoIngredientesComQuebra, 9.30); // 9.03 * 1.03 = 9.3009 -> 9.30
  assert.equal(c.custoMaoDeObraLote, 8.52); // 30 min * 0.2841 = 8.523 -> 8.52
  assert.equal(c.custoFixoLote, 1.89); // 30 min * 0.0630 = 1.89
  
  // Por unidade (rendimento 10 + 1.00 embalagem):
  assert.equal(c.custoRealUnitario, 1.93); // 9.30/10 (0.93) + 1.00 embalagem
  assert.equal(c.custoMaoDeObraUnitario, 0.85); // 8.52/10
  assert.equal(c.custoFixoUnitario, 0.19); // 1.89/10
  assert.equal(c.custoUnitarioTotal, 2.97); // 1.93 + 0.85 + 0.19 = 2.97

  // Preço de venda via Markup Divisor:
  // Taxas = 7.5% (4.0 + 3.5), Lucro = 25% -> Total 32.5% -> Divisor = 0.675
  // Preço Sugerido = 2.97 / 0.675 = 4.40
  assert.equal(c.precoSugerido, 4.40);

  // Preço Mínimo (Ponto de Equilíbrio / Margem Zero):
  // Divisor = 1 - 0.075 = 0.925 -> 2.97 / 0.925 = 3.21
  assert.equal(c.precoMinimo, 3.21);

  // Lucro Líquido Real e Margem de Contribuição:
  // 4.40 - 2.97 - (4.40 * 0.075 = 0.33) = 1.10
  assert.equal(c.lucroLiquidoValor, 1.10);
  assert.equal(c.margemContribuicaoValor, 2.14); // 4.40 - 1.93 - 0.33
  assert.equal(c.margemContribuicaoPct, 48.64);
});

/* ---------- arredondamento e validações ---------- */

test('round2: arredonda para 2 casas', () => {
  assert.equal(pricing.round2(1.234), 1.23);
  assert.equal(pricing.round2(1.235), 1.24);
  assert.equal(pricing.round2(33.865), 33.87);
});

test('validateReceita: receita válida retorna null', () => {
  const insumos = insumosExemplo();
  assert.equal(pricing.validateReceita(receitaExemplo(insumos), insumos), null);
});

test('validateReceita: exige produto', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  r.produtoId = '';
  assert.match(pricing.validateReceita(r, insumos), /produto/i);
});

test('validateReceita: exige ao menos um insumo', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  r.itens = [];
  assert.match(pricing.validateReceita(r, insumos), /insumo/i);
});

test('validateReceita: insumo inexistente no inventário', () => {
  const r = pricing.createReceita({
    produtoId: 'p1',
    itens: [{ insumoId: 'id-inexistente', quantidade: 10 }],
  });
  assert.match(pricing.validateReceita(r, []), /invent.rio/i);
});

test('validateReceita: quantidade deve ser > 0', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  r.itens[0].quantidade = 0;
  assert.match(pricing.validateReceita(r, insumos), /maior que zero/i);
});

test('findDuplicate e getReceita funcionam normalmente', () => {
  const r1 = pricing.createReceita({ produtoId: 'pA' });
  const r2 = pricing.createReceita({ produtoId: 'pA' });
  assert.ok(pricing.findDuplicate(r2, [r1, r2]));
  assert.equal(pricing.findDuplicate(r1, [r1]), null);
  assert.equal(pricing.getReceita([r1], 'pA').produtoId, 'pA');
});
