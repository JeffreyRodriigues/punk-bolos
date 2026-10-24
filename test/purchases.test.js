import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  generatePurchaseId,
  nextPurchaseCode,
  calculateItemUnitCost,
  calculatePurchaseTotal,
  createPurchase,
  validatePurchase,
  applyPurchaseToInventory,
  revertPurchaseFromInventory,
  filterPurchases,
} from '../js/modules/purchases.js';

describe('purchases.js — Módulo de Compras em Lote', () => {
  test('nextPurchaseCode: gera código sequencial começando em CMP0001', () => {
    assert.equal(nextPurchaseCode([]), 'CMP0001');
    assert.equal(nextPurchaseCode([{ codigo: 'CMP0001' }]), 'CMP0002');
    assert.equal(nextPurchaseCode([{ codigo: 'CMP0015' }, { codigo: 'CMP0003' }]), 'CMP0016');
  });

  test('calculateItemUnitCost: calcula custo por unidade corretamente', () => {
    assert.equal(calculateItemUnitCost(50, 10), 5);
    assert.equal(calculateItemUnitCost(35, 5000), 0.007);
    assert.equal(calculateItemUnitCost(0, 10), 0);
    assert.equal(calculateItemUnitCost(50, 0), 0);
  });

  test('calculatePurchaseTotal: soma o valor total de itens arredondado em 2 casas', () => {
    const itens = [
      { custoTotal: 42.5 },
      { custoTotal: 18.25 },
      { custoTotal: 9.3 },
    ];
    assert.equal(calculatePurchaseTotal(itens), 70.05);
  });

  test('validatePurchase: valida campos obrigatórios e itens', () => {
    const v1 = validatePurchase({});
    assert.equal(v1.valid, false);
    assert.ok(v1.errors.data);
    assert.ok(v1.errors.itens);

    const v2 = validatePurchase({
      data: '2026-10-24',
      formaPagamento: 'PIX',
      itens: [{ insumoId: '', quantidade: 0, custoTotal: 0 }],
    });
    assert.equal(v2.valid, false);
    assert.ok(v2.errors['itens.0.insumoId']);
    assert.ok(v2.errors['itens.0.quantidade']);
    assert.ok(v2.errors['itens.0.custoTotal']);

    const v3 = validatePurchase({
      data: '2026-10-24',
      formaPagamento: 'PIX',
      itens: [{ insumoId: 'i1', quantidade: 10, custoTotal: 50 }],
    });
    assert.equal(v3.valid, true);
    assert.deepEqual(v3.errors, {});
  });

  test('createPurchase: normaliza dados e calcula total geral', () => {
    const p = createPurchase(
      {
        fornecedor: '  Assaí Atacadista  ',
        formaPagamento: 'Cartão de Crédito',
        itens: [
          { insumoId: 'i-farinha', insumoNome: 'Farinha', unidade: 'g', quantidade: 5000, custoTotal: 35 },
          { insumoId: 'i-leite', insumoNome: 'Leite Moça', unidade: 'unidade', quantidade: 10, custoTotal: 80 },
        ],
      },
      [{ codigo: 'CMP0004' }]
    );

    assert.equal(p.codigo, 'CMP0005');
    assert.equal(p.fornecedor, 'Assaí Atacadista');
    assert.equal(p.formaPagamento, 'Cartão de Crédito');
    assert.equal(p.valorTotal, 115);
    assert.equal(p.itens.length, 2);
    assert.equal(p.itens[0].custoUnitario, 0.007);
    assert.equal(p.itens[1].custoUnitario, 8);
    assert.ok(p.id.startsWith('cmp_'));
  });

  test('applyPurchaseToInventory: soma estoque e adiciona histórico de compras nos insumos', () => {
    const insumos = [
      { id: 'i-farinha', nome: 'Farinha', estoqueAtual: 2000, compras: [] },
      { id: 'i-leite', nome: 'Leite Moça', estoqueAtual: 5, compras: [] },
    ];

    const compra = createPurchase({
      id: 'cmp_123',
      data: '2026-10-24',
      fornecedor: 'Atacadão',
      itens: [
        { insumoId: 'i-farinha', quantidade: 5000, custoTotal: 35 },
        { insumoId: 'i-leite', quantidade: 10, custoTotal: 80 },
      ],
    });

    const updated = applyPurchaseToInventory(compra, insumos);
    const farinha = updated.find((i) => i.id === 'i-farinha');
    const leite = updated.find((i) => i.id === 'i-leite');

    assert.equal(farinha.estoqueAtual, 7000);
    assert.equal(farinha.compras.length, 1);
    assert.equal(farinha.compras[0].custoTotal, 35);
    assert.equal(farinha.compras[0].quantidadeCompra, 5000);
    assert.equal(farinha.compras[0].compraId, 'cmp_123');

    assert.equal(leite.estoqueAtual, 15);
    assert.equal(leite.compras.length, 1);
  });

  test('revertPurchaseFromInventory: subtrai estoque e remove do histórico', () => {
    const insumos = [
      {
        id: 'i-farinha',
        nome: 'Farinha',
        estoqueAtual: 7000,
        compras: [
          { id: 'ci_old', data: '2026-09-01', custoTotal: 30, quantidadeCompra: 5000 },
          { id: 'ci_new', compraId: 'cmp_123', data: '2026-10-24', custoTotal: 35, quantidadeCompra: 5000 },
        ],
      },
    ];

    const compra = {
      id: 'cmp_123',
      data: '2026-10-24',
      itens: [{ insumoId: 'i-farinha', quantidade: 5000, custoTotal: 35 }],
    };

    const reverted = revertPurchaseFromInventory(compra, insumos);
    const farinha = reverted.find((i) => i.id === 'i-farinha');

    assert.equal(farinha.estoqueAtual, 2000);
    assert.equal(farinha.compras.length, 1);
    assert.equal(farinha.compras[0].id, 'ci_old');
  });

  test('filterPurchases: filtra por busca de texto, fornecedor e data', () => {
    const list = [
      createPurchase({ codigo: 'CMP0001', data: '2026-10-10', fornecedor: 'Assaí', itens: [{ insumoNome: 'Farinha' }] }),
      createPurchase({ codigo: 'CMP0002', data: '2026-10-15', fornecedor: 'Atacadão', itens: [{ insumoNome: 'Manteiga' }] }),
      createPurchase({ codigo: 'CMP0003', data: '2026-10-20', fornecedor: 'Assaí', itens: [{ insumoNome: 'Ovos' }] }),
    ];

    const res1 = filterPurchases(list, { query: 'Assaí' });
    assert.equal(res1.length, 2);

    const res2 = filterPurchases(list, { query: 'Manteiga' });
    assert.equal(res2.length, 1);
    assert.equal(res2[0].codigo, 'CMP0002');

    const res3 = filterPurchases(list, { dateFrom: '2026-10-12', dateTo: '2026-10-18' });
    assert.equal(res3.length, 1);
    assert.equal(res3[0].codigo, 'CMP0002');
  });
});
