/* ============================================================
   TESTE — pricing.js (regras puras de precificação)
   ============================================================ */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as inventory from '../js/modules/inventory.js?v=2';
import * as pricing from '../js/modules/pricing.js?v=1';

/* ---------- Fixtures (exemplo real da spec) ---------- */

function FARINHA() {
  return inventory.createInsumo({ nome: 'Farinha', unidade: 'kg', compras: [{ data: '2026-01-01', custoTotal: 35, quantidadeCompra: 5 }] });
}
function ACUCAR() {
  return inventory.createInsumo({ nome: 'Açúcar', unidade: 'kg', compras: [{ data: '2026-01-01', custoTotal: 30, quantidadeCompra: 5 }] });
}
function CHOCOLATE() {
  return inventory.createInsumo({ nome: 'Chocolate', unidade: 'g', compras: [{ data: '2026-01-01', custoTotal: 12, quantidadeCompra: 300 }] });
}
function LEITE() {
  return inventory.createInsumo({ nome: 'Leite', unidade: 'L', compras: [{ data: '2026-01-01', custoTotal: 4.5, quantidadeCompra: 1 }] });
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

/* ---------- calcular: fórmula completa (exemplo aprovado) ---------- */

test('calcular: pipeline completo (9,03 -> 4,39)', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  const c = pricing.calcular(r, insumos);
  assert.equal(c.custoIngredientes, 9.03);
  assert.equal(c.comMargem, 11.29);     // 9,03 * 1,25
  assert.equal(c.comMultiplicador, 33.87); // 11,29 * 3
  assert.equal(c.porUnidade, 3.39);     // 33,87 / 10
  assert.equal(c.custoPorUnidade, 4.39); // +1,00 embalagem
});

test('calcular: margem incide ANTES do multiplicador e embalagem FORA dele', () => {
  const insumos = [FARINHA()];
  const r = pricing.createReceita({
    produtoId: 'p1',
    itens: [{ insumoId: insumos[0].id, quantidade: 250 }], // 1,75
    margem: 0,
    multiplicador: 1,
    rendimento: 1,
    embalagem: 2,
  });
  // (1,75 * 1) / 1 + 2 = 3,75
  assert.equal(pricing.calcular(r, insumos).custoPorUnidade, 3.75);
});

test('calcular: custo adicional somado por unidade (fora do multiplicador)', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  r.custoAdicional = 0.5;
  assert.equal(pricing.calcular(r, insumos).custoPorUnidade, 4.89); // 4,39 + 0,50
});

test('calcular: custoAdicional "" é tratado como 0', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  r.custoAdicional = '';
  assert.equal(pricing.calcular(r, insumos).custoPorUnidade, 4.39);
});

/* ---------- arredondamento (2 casas em cada etapa) ---------- */

test('round2: arredonda para 2 casas', () => {
  assert.equal(pricing.round2(1.234), 1.23);
  assert.equal(pricing.round2(1.235), 1.24);
  assert.equal(pricing.round2(33.865), 33.87);
});

test('calcular: margem não inteira mantém 2 casas por etapa', () => {
  const insumos = [FARINHA()];
  const r = pricing.createReceita({
    produtoId: 'p1',
    itens: [{ insumoId: insumos[0].id, quantidade: 250 }], // 1,75
    margem: 10, // 1,75 * 1,1 = 1,925 -> 1,93
    multiplicador: 2, // 1,93 * 2 = 3,86
    rendimento: 1,
    embalagem: 0,
  });
  const c = pricing.calcular(r, insumos);
  assert.equal(c.comMargem, 1.93);
  assert.equal(c.custoPorUnidade, 3.86);
});

/* ---------- snapshot / desatualização ---------- */

test('recalcular: atualiza snapshot (custo + dataCalculo)', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  const atual = pricing.recalcular(r, insumos);
  assert.equal(atual.custoIngredientes, 9.03);
  assert.equal(atual.custoPorUnidade, 4.39);
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(atual.dataCalculo));
});

test('isDesatualizada: false quando insumos não mudaram', () => {
  const insumos = insumosExemplo();
  const r = pricing.recalcular(receitaExemplo(insumos), insumos);
  assert.equal(pricing.isDesatualizada(r, insumos), false);
});

test('isDesatualizada: true quando muda o preço do insumo', () => {
  const insumos = insumosExemplo();
  const r = pricing.recalcular(receitaExemplo(insumos), insumos);
  // Farinha fica mais cara: nova compra vigente
  const alterados = insumos.map((i) =>
    i.nome === 'Farinha'
      ? inventory.createInsumo({ ...i, compras: [{ data: '2026-06-01', custoTotal: 70, quantidadeCompra: 5 }] })
      : i
  );
  assert.equal(pricing.isDesatualizada(r, alterados), true);
});

/* ---------- validateReceita ---------- */

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

test('validateReceita: multiplicador/rendimento > 0', () => {
  const insumos = insumosExemplo();
  const r = receitaExemplo(insumos);
  r.multiplicador = 0;
  assert.match(pricing.validateReceita(r, insumos), /multiplicador/i);
  r.multiplicador = 3;
  r.rendimento = 0;
  assert.match(pricing.validateReceita(r, insumos), /rendimento/i);
});

/* ---------- findDuplicate / getReceita ---------- */

test('getReceita: retorna a receita do produto', () => {
  const r = pricing.createReceita({ produtoId: 'pX' });
  assert.equal(pricing.getReceita([r, pricing.createReceita({ produtoId: 'pY' })], 'pX').produtoId, 'pX');
});

test('findDuplicate: detecta mesma receita para outro produto', () => {
  const r1 = pricing.createReceita({ produtoId: 'pA' });
  const r2 = pricing.createReceita({ produtoId: 'pA' });
  assert.ok(pricing.findDuplicate(r2, [r1, r2]));
});

test('findDuplicate: ignora a própria receita em edição', () => {
  const r = pricing.createReceita({ produtoId: 'pA' });
  assert.equal(pricing.findDuplicate(r, [r]), null);
});
