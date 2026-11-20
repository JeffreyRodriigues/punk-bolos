/* ============================================================
   APP.JS — Integração principal (ponto de entrada do app)
   ------------------------------------------------------------
   Liga os módulos:
   - theme.js   -> alternância de tema (dark/light)
   - storage    -> camada de dados (Supabase na nuvem / LocalStorage)
   - orderForm  -> modal de novo/edição de pedido
   - orderList  -> lista de pedidos com busca, filtros e ações
   - dashboard  -> cards de resumo da tela inicial
   - toast      -> notificações

   Responsabilidades:
   - carregar os dados da nuvem (storage.init) com sincronização em background
   - navegação entre telas com lazy rendering e invalidação seletiva (dirty flags)
   - botão flutuante (FAB) abre o modal "Novo Pedido"
   - ações de status (Concluir / Cancelar) com atualização otimizada
   - botão "Atualizar" recarrega os dados compartilhados
   ============================================================ */

import * as theme from './utils/theme.js';
import * as storage from './modules/storage.js';
import * as auth from './modules/auth.js';
import * as orderForm from './modules/orderForm.js';
import * as orderList from './modules/orderList.js';
import * as dashboard from './modules/dashboard.js';
import * as dateFilter from './modules/dateFilter.js';
import * as productForm from './modules/productForm.js';
import * as productList from './modules/productList.js';
import * as importExport from './modules/importExport.js';
import * as estoque from './modules/estoque.js';
import * as estoqueView from './modules/estoqueView.js';
import * as inventoryView from './modules/inventoryView.js';
import * as pricingView from './modules/pricingView.js';
import * as customerForm from './modules/customerForm.js';
import * as customerView from './modules/customerView.js';
import * as purchasesView from './modules/purchasesView.js';
import * as financialView from './modules/financialView.js';
import * as systemInfo from './modules/systemInfo.js';
import * as shoppingList from './modules/shoppingList.js';
import * as realtime from './modules/realtime.js';
import { initExcelModal } from './modules/excelModal.js';
import { showToast } from './modules/toast.js';

/* ---------- Renderização Lazy & Controle de Views Sujas (Dirty Flags) ---------- */

/** Telas Inventário/Precificação/Financeiro/Compras ficam ocultas no mobile (abaixo de 768px). */
const isMobile = () => window.matchMedia('(max-width: 768px)').matches;

/** Mapa central de renderizadores por view. */
const VIEW_RENDERERS = {
  dashboard: () => dashboard.render(),
  orders: () => orderList.render(),
  produtos: () => productList.render(),
  estoque: () => estoqueView.render(),
  clientes: () => customerView.render(),
  inventario: () => { if (!isMobile()) inventoryView.render(); },
  precificacao: () => { if (!isMobile()) pricingView.render(); },
  compras: () => { if (!isMobile()) purchasesView.render(); },
  financeiro: () => { if (!isMobile()) financialView.render(); },
};

const ALL_VIEW_KEYS = Object.keys(VIEW_RENDERERS);

/** Conjunto de telas que tiveram dados alterados e precisam de re-renderização. */
const dirtyViews = new Set(ALL_VIEW_KEYS);

/**
 * Obtém o identificador da view atualmente visível no app.
 * @returns {string} Id da view ativa ('dashboard', 'orders', etc.)
 */
function getActiveTarget() {
  const activeView = document.querySelector('.view.active');
  return activeView ? activeView.id.replace('view-', '') : 'dashboard';
}

/**
 * Garante a renderização da view solicitada caso ela esteja marcada como desatualizada (dirty).
 * @param {string} target - Id da view.
 */
function ensureViewRendered(target) {
  if (dirtyViews.has(target) && typeof VIEW_RENDERERS[target] === 'function') {
    dirtyViews.delete(target);
    VIEW_RENDERERS[target]();
  }
}

/**
 * Invalida uma ou mais views marcando-as como 'dirty'.
 * Se a view ativa estiver entre as afetadas, renderiza-a imediatamente.
 * As demais permanecem marcadas e serão renderizadas sob demanda ao serem acessadas.
 * @param {Array<string>|string} targets - Views a invalidar.
 */
function invalidateViews(targets) {
  const list = Array.isArray(targets) ? targets : [targets];
  const current = getActiveTarget();

  list.forEach((t) => {
    dirtyViews.add(t);
  });

  if (dirtyViews.has(current)) {
    ensureViewRendered(current);
  }
}

/* ---------- Navegação entre telas ---------- */

/**
 * Alterna a tela visível e renderiza o conteúdo sob demanda (lazy).
 * @param {string} target - Id da view de destino.
 */
function navigate(target) {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${target}`);
  });
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.viewTarget === target);
  });

  // Filtro de período só faz sentido em Dashboard/Pedidos/Produção
  const hasPeriodFilter = target === 'dashboard' || target === 'orders' || target === 'estoque';
  const filterEl = document.querySelector('.date-filter');
  if (filterEl) filterEl.hidden = !hasPeriodFilter;

  const fab = document.getElementById('fabNewOrder');
  if (fab) fab.hidden = target !== 'orders';

  // Renderiza a tela sob demanda se estiver pendente
  ensureViewRendered(target);
}

/* ---------- Ações de status ---------- */

/**
 * Atualiza o status de um pedido e invalida as telas dependentes.
 * Ao CONCLUIR, valida o estoque (bloqueia a conclusão se não houver
 * produto disponível para a venda).
 * @param {Object} orderToUpdate - Pedido a alterar.
 * @param {string} newStatus - Novo status.
 * @param {string} successMessage - Mensagem de confirmação.
 */
function updateStatus(orderToUpdate, newStatus, successMessage) {
  const orders = storage.getAll();
  const index = orders.findIndex((o) => o.id === orderToUpdate.id);
  if (index === -1) return;

  // Ao concluir, garante que ainda há estoque para os itens do pedido.
  if (newStatus === 'Concluído') {
    const stockErrors = estoque.validateItens(orderToUpdate.itens, { excludeOrderId: orderToUpdate.id });
    if (stockErrors.length > 0) {
      const detail = stockErrors.map((e) => estoque.describeErro(e)).join('; ');
      showToast(`Não é possível concluir — produto sem produção: ${detail}`, 'error');
      return;
    }
  }

  orders[index].status = newStatus;
  storage.save(orders);

  updatePendingOrdersBadge();
  invalidateViews(['orders', 'dashboard', 'estoque', 'produtos']);
  showToast(successMessage);
}

/**
 * Atualiza o indicador numérico (badge) de pedidos com status Pendente na aba Pedidos.
 */
export function updatePendingOrdersBadge() {
  const badge = document.getElementById('pendingOrdersBadge');
  if (!badge) return;
  const orders = storage.getAll();
  const pendingCount = orders.filter((o) => o.status === 'Pendente').length;
  if (pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.hidden = false;
    badge.removeAttribute('hidden');
  } else {
    badge.hidden = true;
    badge.setAttribute('hidden', '');
  }
}

/* ---------- Inicialização ---------- */

function init() {
  // Tema salvo/preferido do sistema
  theme.initTheme();
  updatePendingOrdersBadge();

  // Erros de sincronização com a nuvem ficam visíveis ao usuário
  storage.setErrorHandler((message) => showToast(message, 'error'));

  // Filtro por período (Dashboard + Pedidos + Produção)
  dateFilter.init();
  dateFilter.subscribe(() => {
    invalidateViews(['dashboard', 'orders', 'estoque']);
  });

  // Alternância do tema pelo botão do header
  document.getElementById('themeToggle').addEventListener('click', () => {
    theme.toggleTheme();
    // Gráficos usam cores do tema: invalida dashboard para recriar se necessário
    invalidateViews(['dashboard']);
  });

  // Atualizar dados compartilhados (nuvem)
  document.getElementById('refreshBtn').addEventListener('click', () => {
    storage.init()
      .then(() => {
        updatePendingOrdersBadge();
        orderForm.updateCustomersDatalist();
        invalidateViews(ALL_VIEW_KEYS);
        showToast('Dados atualizados!');
      })
      .catch(() => {
        showToast('Falha ao atualizar os dados.');
      });
  });

  // Sair do sistema: encerra a sessão e volta para o login
  document.getElementById('logoutBtn').addEventListener('click', () => {
    auth.logout();
    location.replace('login.html');
  });

  // Controle da Barra Lateral (Sidebar no Desktop)
  const SIDEBAR_STORAGE_KEY = 'punkbolos.sidebar.collapsed';
  const sidebarToggle = document.getElementById('sidebarToggle');
  const isSidebarCollapsed = localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';

  if (isSidebarCollapsed && !isMobile()) {
    document.body.classList.add('sidebar-collapsed');
  }

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    });
  }

  // Navegação pelas abas
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.viewTarget));
  });

  // Estado inicial de visibilidade (FAB só na tela de Pedidos)
  const activeView = document.querySelector('.view.active');
  const activeTarget = activeView ? activeView.id.replace('view-', '') : 'dashboard';
  navigate(activeTarget);

  // Botão flutuante: abre novo pedido (ou novo produto na view Produtos)
  document.getElementById('fabNewOrder').addEventListener('click', () => {
    const active = document.querySelector('.view.active');
    if (active && active.id === 'view-produtos') {
      productForm.openNew();
    } else {
      orderForm.openNew();
    }
  });

  // Botão "Novo produto" da view Produtos
  document.getElementById('btnAddProduct').addEventListener('click', () => {
    productForm.openNew();
  });

  // Ações dos cards da lista
  orderList.setActionHandlers({
    edit: (o) => orderForm.openEdit(o),
    complete: (o) => updateStatus(o, 'Concluído', `Pedido #${o.numero} concluído!`),
    advance: (o, nextStatus, msg) => updateStatus(o, nextStatus, msg),
    cancel: (o) => updateStatus(o, 'Cancelado', `Pedido #${o.numero} cancelado`),
  });

  // Atalho direto de precificação no card de produtos
  productList.setPricingHandler((p) => {
    navigate('precificacao');
    pricingView.selectProduto(p.id);
  });

  // Ao duplicar ou excluir pedidos na lista, atualiza as telas dependentes
  orderList.setChangeListener(() => {
    invalidateViews(['orders', 'dashboard', 'estoque', 'produtos']);
  });

  // Após salvar/editar no modal, atualiza todas as telas dependentes
  orderForm.setChangeListener(() => {
    invalidateViews(['orders', 'dashboard', 'estoque', 'produtos', 'clientes']);
  });

  // Atalho "cadastrar produto" dentro do modal de pedido:
  // preserva o pedido em andamento, navega para Produtos e abre o formulário
  orderForm.setCreateProductHandler(() => {
    orderForm.prepareLeave();
    navigate('produtos');
    productForm.openNew();
  });

  // Catálogo de produtos: edição abre o modal e qualquer mudança re-renderiza
  productList.setEditHandler((p) => productForm.openEdit(p));
  productList.setChangeListener(() => {
    invalidateViews(['produtos', 'orders', 'dashboard', 'estoque']);
  });
  productForm.setChangeListener(() => {
    invalidateViews(['produtos', 'orders', 'dashboard', 'estoque']);
    // Se o cadastro veio do modal de pedido, volta ao pedido preservado
    if (orderForm.restorePending()) {
      navigate('orders');
    }
  });

  // Produção (estoque): após registrar/excluir, reflete o estoque no catálogo
  estoqueView.setChangeListener(() => {
    invalidateViews(['estoque', 'produtos', 'orders']);
  });

  // Inventário: após criar/editar/excluir insumo ou base, re-renderiza as telas
  inventoryView.setChangeListener(() => {
    invalidateViews(['inventario', 'precificacao']);
  });

  // Precificação: após salvar/usar preço, re-renderiza e reflete no catálogo
  pricingView.setChangeListener(() => {
    invalidateViews(['precificacao', 'produtos', 'orders', 'dashboard']);
  });

  // Compras: inicializa modais, eventos e listener de mudanças
  purchasesView.initPurchasesEvents();
  purchasesView.setChangeListener(() => {
    invalidateViews(['compras', 'inventario', 'precificacao']);
  });

  // Clientes: inicializa modais e ações
  customerForm.init();
  customerView.init();
  customerView.setChangeListener(() => {
    invalidateViews(['clientes']);
    orderForm.updateCustomersDatalist();
  });

  // Importar / exportar planilha (CSV)
  document.getElementById('btnModeloCsv').addEventListener('click', () => {
    importExport.downloadTemplate();
  });
  document.getElementById('btnExportOrders').addEventListener('click', () => {
    importExport.exportOrders();
  });
  const fileInput = document.getElementById('orderImportFile');
  document.getElementById('btnImportOrders').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = importExport.importCsv(text);
      if (result.ok) {
        invalidateViews(['orders', 'dashboard', 'clientes']);
        const aviso = result.erros.length > 0 ? ` (${result.erros.length} linha(s) ignorada(s))` : '';
        showToast(`Importados ${result.pedidos} pedido(s) e ${result.itens} item(ns).${aviso}`);
        if (result.produtosCriados > 0) {
          showToast(`Produtos criados no catálogo: ${result.produtos.join('; ')}`);
        }
        if (result.erros.length > 0) {
          showToast(result.erros[0], 'error');
        }
      } else {
        showToast(result.message || 'Falha ao importar.', 'error');
      }
    } catch (e) {
      showToast(`Falha ao ler o arquivo: ${e.message}`, 'error');
    } finally {
      fileInput.value = '';
    }
  });

  // Inicializa modal de importação do Excel
  initExcelModal();

  // Inicializa modal e indicador de versão e novidades do sistema
  systemInfo.init();

  // Inicializa tela de Gestão Financeira e Metas
  financialView.init();

  // Inicializa modal de Lista de Compras Automática (Atacadista)
  shoppingList.init();

  // Atalho do Inventário: Registrar Compras
  const btnInvRegistrarCompra = document.getElementById('btnInvRegistrarCompra');
  if (btnInvRegistrarCompra) {
    btnInvRegistrarCompra.addEventListener('click', () => navigate('compras'));
  }

  // Inicializa sincronização em tempo real (Supabase WebSockets) e alerta sonoro
  realtime.init();
  realtime.setRealtimeListeners({
    onOrderReceived: (newOrder) => {
      updatePendingOrdersBadge();
      if (newOrder && newOrder.id) {
        orderList.highlightOrder(newOrder.id);
      }
      invalidateViews(['orders', 'dashboard']);
    },
    onOrderUpdated: () => {
      updatePendingOrdersBadge();
      invalidateViews(['orders', 'dashboard']);
    },
  });

  // Botão de controle de som da cozinha
  const btnKitchenAudio = document.getElementById('btnToggleKitchenAudio');
  if (btnKitchenAudio) {
    const updateAudioBtnUI = () => {
      const active = realtime.isSoundEnabled();
      btnKitchenAudio.textContent = active ? 'Som: Ativado' : 'Som: Desativado';
      btnKitchenAudio.classList.toggle('muted', !active);
    };
    updateAudioBtnUI();
    btnKitchenAudio.addEventListener('click', () => {
      const active = realtime.toggleSound();
      updateAudioBtnUI();
      showToast(active ? 'Alerta sonoro da cozinha ativado' : 'Alerta sonoro da cozinha desativado', 'info');
    });
  }

  // 1. Render inicial INSTANTÂNEO (0ms): renderiza apenas a tela ativa inicial
  dirtyViews.clear();
  ALL_VIEW_KEYS.forEach((k) => dirtyViews.add(k));
  ensureViewRendered(activeTarget);

  // 2. Em segundo plano, busca os dados atualizados da nuvem (Supabase) e invalida as telas
  storage.init().then(() => {
    updatePendingOrdersBadge();
    orderForm.updateCustomersDatalist();
    invalidateViews(ALL_VIEW_KEYS);
  }).catch(() => {
    // Erros de conexão são notificados pelo errorHandler do storage
  });
}

// Dispara a inicialização quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
