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

import * as theme from './utils/theme.js';
import * as storage from './modules/storage.js';
import * as auth from './modules/auth.js';
import * as orderForm from './modules/orderForm.js';
import * as orderList from './modules/orderList.js';
import * as dashboard from './modules/dashboard.js';
import * as dateFilter from './modules/dateFilter.js';
import * as productForm from './modules/productForm.js';
import * as productList from './modules/productList.js';
import { showToast } from './modules/toast.js';

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
  } else {
    orderList.render();
  }
}

/* ---------- Ações de status ---------- */

/**
 * Atualiza o status de um pedido e re-renderiza tudo.
 * @param {Object} orderToUpdate - Pedido a alterar.
 * @param {string} newStatus - Novo status.
 * @param {string} successMessage - Mensagem de confirmação.
 */
function updateStatus(orderToUpdate, newStatus, successMessage) {
  const orders = storage.getAll();
  const index = orders.findIndex((o) => o.id === orderToUpdate.id);
  if (index === -1) return;

  orders[index].status = newStatus;
  storage.save(orders);

  orderList.render();
  dashboard.render();
  showToast(successMessage);
}

/* ---------- Inicialização ---------- */

function init() {
  // Tema salvo/preferido do sistema
  theme.initTheme();

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
  });

  // Atalho "cadastrar produto" dentro do modal de pedido:
  // fecha o pedido, navega para Produtos e abre o formulário
  orderForm.setCreateProductHandler(() => {
    orderForm.closeModal();
    navigate('produtos');
    productForm.openNew();
  });

  // Catálogo de produtos: edição abre o modal e qualquer mudança re-renderiza
  productList.setEditHandler((p) => productForm.openEdit(p));
  productList.setChangeListener(() => {
    productList.render();
    orderList.render();
    dashboard.render();
  });
  productForm.setChangeListener(() => {
    productList.render();
    orderList.render();
    dashboard.render();
  });

  // Carrega os dados (Supabase na nuvem ou LocalStorage offline)
  // antes do primeiro render
  storage.init().finally(() => {
    dashboard.render();
    orderList.render();
    productList.render();
  });
}

// Dispara a inicialização quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
