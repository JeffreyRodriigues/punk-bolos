/* ============================================================
   CARDAPIO.JS — Controlador do Cardápio Digital Público
   ------------------------------------------------------------
   Ponto de entrada de cardapio.html. Gerencia catálogo, carrinho,
   filtros, modal de sacola e envio do pedido para o WhatsApp.
   ============================================================ */

import * as storage from './modules/storage.js';
import * as menuService from './modules/menuService.js';
import * as orderModule from './modules/order.js';

// Estado local da página
let cart = [];
let currentCategory = 'todos';
let currentSearch = '';
let currentDeliveryType = 'Retirada';

// Telefone da confeitaria (fallback ou das configurações)
const STORE_PHONE = '11999999999';

/* ---------- Inicialização ---------- */
async function init() {
  try {
    await storage.init();
  } catch (err) {
    console.warn('[cardapio] Inicializado com dados locais/cache:', err);
  }

  // Preenche a data mínima para hoje
  const dateInput = document.getElementById('deliveryDate');
  if (dateInput) {
    dateInput.min = new Date().toISOString().slice(0, 10);
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  setupEventListeners();
  renderProducts();
  updateCartUi();
}

/* ---------- Renderização do Catálogo ---------- */
function renderProducts() {
  const grid = document.getElementById('menuProductsGrid');
  const emptyState = document.getElementById('menuEmptyState');
  if (!grid) return;

  const allProducts = storage.getProducts() || [];

  // Filtragem por busca e categoria
  const q = currentSearch.trim().toLowerCase();
  const filtered = allProducts.filter((p) => {
    // Busca
    const matchSearch = !q ||
      String(p.titulo || '').toLowerCase().includes(q) ||
      String(p.tipoProduto || '').toLowerCase().includes(q) ||
      String(p.tamanho || '').toLowerCase().includes(q) ||
      String(p.detalhes || '').toLowerCase().includes(q);

    if (!matchSearch) return false;

    // Categoria
    if (currentCategory === 'todos') return true;
    if (currentCategory === 'outros') {
      return p.tipoProduto !== 'Bolo Inteiro' && p.tipoProduto !== 'Fatia';
    }
    return p.tipoProduto === currentCategory;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '';
    if (emptyState) emptyState.hidden = false;
    return;
  }

  if (emptyState) emptyState.hidden = true;
  grid.innerHTML = '';

  filtered.forEach((p) => {
    const card = document.createElement('div');
    card.className = 'menu-product-card';

    const inCart = cart.find((item) => item.id === p.id);
    const badgeText = p.tipoProduto === 'Bolo Inteiro' && p.tamanho ? `${p.tipoProduto} • ${p.tamanho}` : p.tipoProduto;

    card.innerHTML = `
      <div class="menu-product-info">
        <span class="menu-product-badge">${escapeHtml(badgeText)}</span>
        <h3 class="menu-product-title">${escapeHtml(p.titulo)}</h3>
        ${p.detalhes ? `<p class="menu-product-details">${escapeHtml(p.detalhes)}</p>` : ''}
        <span class="menu-product-price">${menuService.formatarMoeda(p.valor)}</span>
      </div>
      <div class="menu-product-action">
        ${
          inCart
            ? `<div class="menu-qty-control">
                <button type="button" class="btn-qty btn-minus" data-id="${p.id}" aria-label="Diminuir">－</button>
                <span class="qty-val">${inCart.quantidade}</span>
                <button type="button" class="btn-qty btn-plus" data-id="${p.id}" aria-label="Aumentar">＋</button>
              </div>`
            : `<button type="button" class="btn-add-item" data-id="${p.id}">
                <span>＋</span> Adicionar
              </button>`
        }
      </div>
    `;

    // Eventos dos botões do card
    const btnAdd = card.querySelector('.btn-add-item');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        cart = menuService.adicionarItemCarrinho(cart, p, 1);
        updateCartUi();
        renderProducts();
      });
    }

    const btnMinus = card.querySelector('.btn-minus');
    if (btnMinus) {
      btnMinus.addEventListener('click', () => {
        const item = cart.find((i) => i.id === p.id);
        if (item) {
          cart = menuService.alterarQuantidadeCarrinho(cart, p.id, item.quantidade - 1);
          updateCartUi();
          renderProducts();
        }
      });
    }

    const btnPlus = card.querySelector('.btn-plus');
    if (btnPlus) {
      btnPlus.addEventListener('click', () => {
        const item = cart.find((i) => i.id === p.id);
        if (item) {
          cart = menuService.alterarQuantidadeCarrinho(cart, p.id, item.quantidade + 1);
          updateCartUi();
          renderProducts();
        }
      });
    }

    grid.appendChild(card);
  });
}

/* ---------- Atualização da Interface do Carrinho ---------- */
function updateCartUi() {
  const totais = menuService.calcularTotaisCarrinho(cart);

  // Barra Flutuante
  const floatingBar = document.getElementById('floatingCartBar');
  const countBadge = document.getElementById('cartCountBadge');
  const totalAmount = document.getElementById('cartTotalAmount');

  if (floatingBar) {
    if (totais.totalItens > 0) {
      floatingBar.hidden = false;
      if (countBadge) countBadge.textContent = totais.totalItens;
      if (totalAmount) totalAmount.textContent = menuService.formatarMoeda(totais.totalValor);
    } else {
      floatingBar.hidden = true;
    }
  }

  // Gaveta / Modal do Carrinho
  const modalTotal = document.getElementById('modalCartTotal');
  if (modalTotal) modalTotal.textContent = menuService.formatarMoeda(totais.totalValor);

  renderCartDrawerItems();
}

function renderCartDrawerItems() {
  const container = document.getElementById('cartItemsContainer');
  const emptyEl = document.getElementById('cartDrawerEmpty');
  const formSection = document.getElementById('cartFormSection');
  const btnSubmit = document.getElementById('btnSubmitWhatsapp');
  if (!container) return;

  if (cart.length === 0) {
    container.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    if (formSection) formSection.style.display = 'none';
    if (btnSubmit) btnSubmit.disabled = true;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  if (formSection) formSection.style.display = 'block';
  if (btnSubmit) btnSubmit.disabled = false;
  container.innerHTML = '';

  cart.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'cart-item-row';

    const itemTotal = (Number(item.quantidade) || 1) * (Number(item.valor) || 0);
    const desc = item.tamanho ? `${item.tipoProduto} (${item.tamanho})` : item.tipoProduto;

    row.innerHTML = `
      <div class="cart-item-info">
        <h4 class="cart-item-name">${escapeHtml(item.titulo)}</h4>
        <p class="cart-item-desc">${escapeHtml(desc)}</p>
      </div>
      <div class="cart-item-controls">
        <div class="menu-qty-control">
          <button type="button" class="btn-qty btn-drawer-minus" data-id="${item.id}" aria-label="Diminuir">－</button>
          <span class="qty-val">${item.quantidade}</span>
          <button type="button" class="btn-qty btn-drawer-plus" data-id="${item.id}" aria-label="Aumentar">＋</button>
        </div>
        <span class="cart-item-price">${menuService.formatarMoeda(itemTotal)}</span>
      </div>
    `;

    row.querySelector('.btn-drawer-minus')?.addEventListener('click', () => {
      cart = menuService.alterarQuantidadeCarrinho(cart, item.id, item.quantidade - 1);
      updateCartUi();
      renderProducts();
    });

    row.querySelector('.btn-drawer-plus')?.addEventListener('click', () => {
      cart = menuService.alterarQuantidadeCarrinho(cart, item.id, item.quantidade + 1);
      updateCartUi();
      renderProducts();
    });

    container.appendChild(row);
  });
}

/* ---------- Controle do Modal de Sacola ---------- */
function openCartModal() {
  const modal = document.getElementById('cartModal');
  if (modal) {
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeCartModal() {
  const modal = document.getElementById('cartModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

/* ---------- Envio do Pedido via WhatsApp ---------- */
function handleCheckout() {
  const nome = document.getElementById('clientName')?.value || '';
  const whatsapp = document.getElementById('clientPhone')?.value || '';
  const endereco = document.getElementById('clientAddress')?.value || '';
  const dataDesejada = document.getElementById('deliveryDate')?.value || '';
  const periodo = document.getElementById('deliveryPeriod')?.value || '';
  const pagamento = document.getElementById('paymentMethod')?.value || 'PIX';
  const observacoes = document.getElementById('orderNotes')?.value || '';

  const dadosCliente = {
    nome,
    whatsapp,
    tipoEntrega: currentDeliveryType,
    endereco,
    dataDesejada,
    periodo,
    pagamento,
    observacoes,
  };

  const validacao = menuService.validarCheckout(dadosCliente, cart);
  if (!validacao.valid) {
    const primeiroErro = Object.values(validacao.errors)[0];
    alert(primeiroErro);
    return;
  }

  const totais = menuService.calcularTotaisCarrinho(cart);
  const msg = menuService.gerarMensagemPedidoWhatsapp(dadosCliente, cart, totais.totalValor, 'Punk Bolos');

  // Grava o pedido no banco/storage interno como "Pendente"
  try {
    const orders = storage.getAll();
    const numero = orderModule.nextOrderNumber(orders);
    const orderItems = cart.map((c) => ({
      tipoProduto: c.tipoProduto,
      sabor: c.titulo,
      tamanho: c.tamanho || '',
      quantidade: c.quantidade,
      valorUnitario: c.valor,
    }));

    const novoPedido = {
      id: `ped_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      numero,
      data: dataDesejada || new Date().toISOString().slice(0, 10),
      cliente: nome.trim(),
      contato: whatsapp.trim(),
      itens: orderItems,
      valorTotal: totais.totalValor,
      quantidadeTotal: totais.totalItens,
      status: 'Pendente',
      pagamento,
      entrega: currentDeliveryType === 'Entrega' ? `Entrega (${endereco.trim()})` : 'Retirada',
      observacoes: observacoes.trim(),
      consomeEstoque: true,
    };

    orders.push(novoPedido);
    storage.save(orders);

    // Sincroniza cliente no cadastro
    const allCust = storage.getAllCustomers();
    const matchCust = allCust.find((c) => c.nome.trim().toLowerCase() === nome.trim().toLowerCase());
    if (!matchCust) {
      storage.saveCustomer({
        id: `cli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nome: nome.trim(),
        contato: whatsapp.trim(),
        endereco: currentDeliveryType === 'Entrega' ? endereco.trim() : '',
        dataNascimento: '',
        observacoes: observacoes.trim(),
      });
    }
  } catch (e) {
    console.error('[cardapio] Erro ao salvar pedido interno:', e);
  }

  // Redireciona para o WhatsApp
  const waLink = menuService.formatarLinkWhatsapp(STORE_PHONE, msg);
  if (waLink) {
    window.open(waLink, '_blank');
  }
}

/* ---------- Listeners de Eventos ---------- */
function setupEventListeners() {
  // Busca
  const searchInput = document.getElementById('menuSearch');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value;
      renderProducts();
    });
  }

  // Categorias
  const catButtons = document.querySelectorAll('.menu-cat-btn');
  catButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      catButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category || 'todos';
      renderProducts();
    });
  });

  // Barra flutuante
  const floatingBar = document.getElementById('floatingCartBar');
  if (floatingBar) {
    floatingBar.addEventListener('click', openCartModal);
  }

  // Fechar modal
  document.getElementById('btnCartClose')?.addEventListener('click', closeCartModal);
  document.getElementById('cartBackdrop')?.addEventListener('click', closeCartModal);

  // Tipo de Entrega (Retirada vs Entrega)
  const btnRetirada = document.getElementById('btnOptRetirada');
  const btnEntrega = document.getElementById('btnOptEntrega');
  const addressWrap = document.getElementById('fieldAddressWrap');

  if (btnRetirada && btnEntrega) {
    btnRetirada.addEventListener('click', () => {
      btnRetirada.classList.add('active');
      btnEntrega.classList.remove('active');
      currentDeliveryType = 'Retirada';
      if (addressWrap) addressWrap.hidden = true;
    });

    btnEntrega.addEventListener('click', () => {
      btnEntrega.classList.add('active');
      btnRetirada.classList.remove('active');
      currentDeliveryType = 'Entrega';
      if (addressWrap) addressWrap.hidden = false;
    });
  }

  // Botão Enviar Pedido
  document.getElementById('btnSubmitWhatsapp')?.addEventListener('click', handleCheckout);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', init);
