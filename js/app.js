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
   - carregar os dados da nuvem (storage.init) antes do 1º render
   - navegação entre telas (abas Início / Pedidos / Produtos)
   - botão flutuante (FAB) abre o modal "Novo Pedido"
   - ações de status (Concluir / Cancelar) com atualização automática
   - botão "Atualizar" recarrega os dados compartilhados
   - re-render global após qualquer mudança de dados
   ============================================================ */

import * as theme from './utils/theme.js?v=13';
import * as storage from './modules/storage.js?v=13';
import * as auth from './modules/auth.js?v=13';
import * as orderForm from './modules/orderForm.js?v=17';
import * as orderList from './modules/orderList.js?v=14';
import * as dashboard from './modules/dashboard.js?v=14';
import * as dateFilter from './modules/dateFilter.js?v=13';
import * as productForm from './modules/productForm.js?v=16';
import * as productList from './modules/productList.js?v=15';
import * as importExport from './modules/importExport.js?v=15';
import * as estoque from './modules/estoque.js?v=1';
import * as estoqueView from './modules/estoqueView.js?v=1';
import { showToast } from './modules/toast.js?v=12';

/* ---------- Navegação entre telas ---------- */

/**
 * Alterna a tela visível (Início / Pedidos / Produtos) e atualiza a aba ativa.
 * @param {string} target - Id da view ("dashboard" | "orders" | "produtos").
 */
function navigate(target) {
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.toggle('active', view.id === `view-${target}`);
  });
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.viewTarget === target);
  });

  // A cada troca de tela, garante dados atualizados
  if (target === 'dashboard') {
    dashboard.render();
  } else if (target === 'produtos') {
    productList.render();
  } else if (target === 'estoque') {
    estoqueView.render();
  } else {
    orderList.render();
  }
}

/* ---------- Ações de status ---------- */

/**
 * Atualiza o status de um pedido e re-renderiza tudo.
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

  // Ao concluir, garante que ainda há estoque para os itens do pedido
  if (newStatus === 'Concluído') {
    const stockErrors = estoque.validateItens(orderToUpdate.itens);
    if (stockErrors.length > 0) {
      const detail = stockErrors
        .map((e) => `"${estoque.nomeProduto(e.produto)}" — disponível: ${e.disponivel}`)
        .join('; ');
      showToast(`Não há mais produto disponível para a venda: ${detail}`, 'error');
      return;
    }
  }

  orders[index].status = newStatus;
  storage.save(orders);

  orderList.render();
  dashboard.render();
  estoqueView.render();
  productList.render();
  showToast(successMessage);
}

/* ---------- Inicialização ---------- */

function init() {
  // Tema salvo/preferido do sistema
  theme.initTheme();

  // Erros de sincronização com a nuvem ficam visíveis ao usuário
  storage.setErrorHandler((message) => showToast(message, 'error'));

  // Filtro por período (Início + Pedidos)
  dateFilter.init();
  dateFilter.subscribe(() => {
    dashboard.render();
    orderList.render();
  });

  // Alternância do tema pelo botão do header
  document.getElementById('themeToggle').addEventListener('click', () => {
    theme.toggleTheme();
    // Gráficos usam cores do tema: recria após a troca
    dashboard.render();
  });

  // Atualizar dados compartilhados (nuvem)
  document.getElementById('refreshBtn').addEventListener('click', () => {
    storage.init()
      .then(() => {
        dashboard.render();
        orderList.render();
        productList.render();
        estoqueView.render();
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

  // Navegação pelas abas
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.addEventListener('click', () => navigate(tab.dataset.viewTarget));
  });

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
    cancel: (o) => updateStatus(o, 'Cancelado', `Pedido #${o.numero} cancelado`),
  });

  // Após salvar/editar no modal, atualiza todas as telas
  orderForm.setChangeListener(() => {
    orderList.render();
    dashboard.render();
    estoqueView.render();
    productList.render();
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
    productList.render();
    orderList.render();
    dashboard.render();
    estoqueView.render();
  });
  productForm.setChangeListener(() => {
    productList.render();
    orderList.render();
    dashboard.render();
    estoqueView.render();
    // Se o cadastro veio do modal de pedido, volta ao pedido preservado
    if (orderForm.restorePending()) {
      navigate('orders');
    }
  });

  // Produção (estoque): após registrar/excluir, reflete o estoque no catálogo
  estoqueView.setChangeListener(() => {
    estoqueView.render();
    productList.render();
    orderList.render();
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
        orderList.render();
        dashboard.render();
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

  // Carrega os dados (Supabase na nuvem ou LocalStorage offline)
  // antes do primeiro render
  storage.init().finally(() => {
    dashboard.render();
    orderList.render();
    productList.render();
    estoqueView.render();
  });
}

// Dispara a inicialização quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
