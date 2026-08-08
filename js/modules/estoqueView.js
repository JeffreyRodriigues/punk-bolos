/* ============================================================
   ESTOQUEVIEW.JS — Tela de Estoque (produção + saldo)
   ------------------------------------------------------------
   - Formulário para registrar produção (produto + data + quantidade)
   - Tabela de estoque atual por produto (produzido/vendido/disponível)
   - Histórico de produções com exclusão
   As regras de cálculo ficam em estoque.js (módulo de negócio).
   ============================================================ */

import * as storage from './storage.js?v=13';
import * as product from './product.js?v=16';
import * as estoque from './estoque.js?v=1';
import { showToast } from './toast.js?v=12';
import { formatDate } from '../utils/money.js?v=12';

/** Callback disparado após registrar/excluir produção (setado por app.js). */
let onChange = () => {};

/**
 * Registra o callback de notificação de mudanças.
 * @param {Function} cb - Função chamada após alterar produções.
 */
export function setChangeListener(cb) {
  onChange = cb;
}

/**
 * Gera um id único para uma produção.
 * @returns {string} Id no formato "pr<timestamp>-<aleatório>".
 */
function generateId() {
  return `pr${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Exibe (ou oculta) o aviso do formulário de produção.
 * @param {string} message - Mensagem (vazia oculta).
 * @param {boolean} [ok] - true usa estilo de sucesso.
 */
function showAviso(message, ok = false) {
  const aviso = document.getElementById('estoqueFormAviso');
  if (!aviso) return;
  aviso.textContent = message;
  aviso.hidden = !message;
  aviso.classList.toggle('estoque-aviso-ok', ok);
}

/** Nome de produto para ordenar a tabela (ignora caixa/acentos). */
function sortKey(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Preenche o seletor de produto do formulário com os produtos que
 * têm controle de estoque ativo.
 * @param {string} selectedId - Id a preselecionar (se ainda existir).
 */
function populateProductSelect(selectedId = '') {
  const select = document.getElementById('estoqueFormProduto');
  if (!select) return;

  const controlled = product.getProducts().filter((p) => p.controlaEstoque);
  select.innerHTML = '';

  if (controlled.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— nenhum produto com estoque —';
    select.appendChild(opt);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— Escolha o produto —';
  select.appendChild(placeholder);

  [...controlled]
    .sort((a, b) => sortKey(estoque.nomeProduto(a)).localeCompare(sortKey(estoque.nomeProduto(b))))
    .forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = estoque.nomeProduto(p);
      select.appendChild(opt);
    });

  if (selectedId && controlled.some((p) => p.id === selectedId)) {
    select.value = selectedId;
  }
}

/**
 * Renderiza a tabela de estoque atual (produzido/vendido/disponível).
 */
function renderTable() {
  const tbody = document.getElementById('estoqueTableBody');
  if (!tbody) return;

  const controlled = product
    .getProducts()
    .filter((p) => p.controlaEstoque)
    .sort((a, b) => sortKey(estoque.nomeProduto(a)).localeCompare(sortKey(estoque.nomeProduto(b))));

  tbody.innerHTML = '';
  controlled.forEach((p) => {
    const produzido = estoque.totalProduzido(p.id);
    const vendido = estoque.totalVendido(p.id);
    const disp = produzido - vendido;

    const tr = document.createElement('tr');

    const name = document.createElement('td');
    name.className = 'estoque-name';
    name.textContent = estoque.nomeProduto(p);

    const produzidoTd = document.createElement('td');
    produzidoTd.textContent = produzido;

    const vendidoTd = document.createElement('td');
    vendidoTd.textContent = vendido;

    const dispTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `stock-badge stock-${estoque.stockStatus(disp)}`;
    badge.textContent = disp <= 0 ? 'Zerado' : disp;
    dispTd.appendChild(badge);

    const actionTd = document.createElement('td');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-ghost estoque-produzir';
    btn.textContent = '＋ Produzir';
    btn.title = `Registrar produção de ${estoque.nomeProduto(p)}`;
    btn.addEventListener('click', () => prepararProducao(p.id));
    actionTd.appendChild(btn);

    tr.append(name, produzidoTd, vendidoTd, dispTd, actionTd);
    tbody.appendChild(tr);
  });
}

/**
 * Preseleciona o produto no formulário, define a data de hoje e foca
 * o campo de quantidade (usado pelo botão "＋ Produzir" da tabela).
 * @param {string} produtoId - Id do produto.
 */
function prepararProducao(produtoId) {
  populateProductSelect(produtoId);
  const dataEl = document.getElementById('estoqueFormData');
  if (dataEl && !dataEl.value) {
    dataEl.value = new Date().toISOString().slice(0, 10);
  }
  showAviso('');
  const qtdEl = document.getElementById('estoqueFormQtd');
  if (qtdEl) qtdEl.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Renderiza o histórico de produções (mais recentes primeiro).
 */
function renderHistory() {
  const historyEl = document.getElementById('estoqueHistory');
  if (!historyEl) return;

  const list = storage.getAllProductions();
  historyEl.innerHTML = '';

  if (list.length === 0) {
    const li = document.createElement('li');
    li.className = 'estoque-history-empty';
    li.textContent = 'Nenhuma produção registrada ainda.';
    historyEl.appendChild(li);
    return;
  }

  const productsById = new Map(product.getProducts().map((p) => [p.id, p]));

  [...list]
    .sort(
      (a, b) =>
        String(b.data || '').localeCompare(String(a.data || '')) ||
        String(b.id || '').localeCompare(String(a.id || ''))
    )
    .slice(0, 20)
    .forEach((pr) => {
      const prod = productsById.get(pr.produtoId);

      const li = document.createElement('li');
      li.className = 'estoque-history-item';

      const info = document.createElement('div');
      info.className = 'estoque-history-info';

      const title = document.createElement('strong');
      title.textContent = `+${Number(pr.quantidade) || 0} ${prod ? estoque.nomeProduto(prod) : 'produto removido'}`;

      const meta = document.createElement('span');
      meta.className = 'estoque-history-meta';
      meta.textContent = formatDate(pr.data) + (pr.observacao ? ` · ${pr.observacao}` : '');

      info.append(title, meta);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn danger';
      del.textContent = '🗑️';
      del.title = 'Excluir produção';
      del.setAttribute('aria-label', 'Excluir produção');
      del.addEventListener('click', () => removeProduction(pr));

      li.append(info, del);
      historyEl.appendChild(li);
    });
}

/**
 * Exclui uma produção com confirmação.
 * @param {Object} production - Produção a excluir.
 */
function removeProduction(production) {
  const confirmed = window.confirm(
    `Excluir esta produção de ${Number(production.quantidade) || 0} unidade(s)?`
  );
  if (!confirmed) return;

  storage.saveProductions(
    storage.getAllProductions().filter((pr) => pr.id !== production.id)
  );
  showToast('Produção excluída.');
  onChange();
}

/**
 * Lida com o envio do formulário de produção (valida e persiste).
 * @returns {boolean} true se registrou.
 */
function handleRegister(event) {
  event.preventDefault();

  const select = document.getElementById('estoqueFormProduto');
  const dataEl = document.getElementById('estoqueFormData');
  const qtdEl = document.getElementById('estoqueFormQtd');
  const obsEl = document.getElementById('estoqueFormObs');

  const produtoId = select ? select.value : '';
  const data = dataEl ? dataEl.value : '';
  const quantidade = Number(qtdEl ? qtdEl.value : NaN);

  if (!produtoId) {
    showAviso('Selecione um produto para registrar a produção.');
    return false;
  }
  if (!data) {
    showAviso('Informe a data da produção.');
    return false;
  }
  if (!Number.isFinite(quantidade) || quantidade <= 0) {
    showAviso('Informe uma quantidade maior que zero.');
    return false;
  }

  const producoes = storage.getAllProductions();
  producoes.push({
    id: generateId(),
    produtoId,
    quantidade,
    data,
    observacao: obsEl ? String(obsEl.value).trim() : '',
  });
  storage.saveProductions(producoes);

  if (qtdEl) qtdEl.value = '';
  if (obsEl) obsEl.value = '';
  showAviso('Produção registrada!', true);
  showToast('Produção registrada!');
  onChange();
  return true;
}

/**
 * Renderiza a tela de estoque completa.
 */
export function render() {
  const controlled = product.getProducts().filter((p) => p.controlaEstoque);

  const countEl = document.getElementById('estoqueCount');
  if (countEl) {
    countEl.textContent = controlled.length;
  }

  const emptyEl = document.getElementById('estoqueEmpty');
  if (emptyEl) {
    emptyEl.hidden = controlled.length > 0;
  }

  const tableWrap = document.getElementById('estoqueTableWrap');
  if (tableWrap) {
    tableWrap.hidden = controlled.length === 0;
  }

  populateProductSelect();
  renderTable();
  renderHistory();
}

/* ---------- Eventos ---------- */

const form = document.getElementById('estoqueForm');
if (form) {
  form.addEventListener('submit', handleRegister);
}
