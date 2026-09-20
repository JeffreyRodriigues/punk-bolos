/* ============================================================
   CARDAPIO.JS — Controlador do Cardápio Digital Público
   ------------------------------------------------------------
   Ponto de entrada de cardapio.html. Gerencia catálogo, carrinho,
   autenticação/perfil do cliente, histórico de pedidos, fidelidade
   e envio do pedido para o WhatsApp.
   ============================================================ */

import * as storage from './modules/storage.js';
import * as menuService from './modules/menuService.js';
import * as orderModule from './modules/order.js';
import * as estoque from './modules/estoque.js';
import * as supabase from './modules/supabase.js';

// Estado local da página
let cart = [];
let currentCategory = 'todos';
let currentSearch = '';
let currentDeliveryType = 'Retirada';
let currentCustomer = null;
let currentCustomerOrders = [];

// Telefone da confeitaria
const STORE_PHONE = '11978819005';

/* ---------- Inicialização ---------- */
async function init() {
  const loadingEl = document.getElementById('menuLoadingState');
  if (loadingEl) loadingEl.hidden = false;

  // Carrega sessão existente do cliente no navegador
  currentCustomer = menuService.obterSessaoCliente();

  try {
    await storage.initPublicMenu();
  } catch (err) {
    console.warn('[cardapio] Inicializado com dados locais/cache:', err);
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }

  // Preenche a data mínima para hoje
  const dateInput = document.getElementById('deliveryDate');
  if (dateInput) {
    dateInput.min = new Date().toISOString().slice(0, 10);
    dateInput.value = new Date().toISOString().slice(0, 10);
  }

  setupEventListeners();
  updateAuthUi();
  renderProducts();
  updateCartUi();

  // Verifica notificação pendente ao inicializar/recarregar
  try {
    const pendingToast = sessionStorage.getItem('punk_order_toast');
    if (pendingToast) {
      sessionStorage.removeItem('punk_order_toast');
      closeCartModal();
      showCardapioToast(pendingToast, 'success', 5000);
    }
  } catch (_) {}
}

/* ---------- Sistema de Toasts e Confirmações do Cardápio ---------- */

function showCardapioToast(message, type = 'success', durationMs = 3200) {
  let container = document.getElementById('menuToastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'menuToastContainer';
    container.className = 'menu-toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '🧁',
    error: '❌',
    warn: '⚠️',
    info: '💡',
  };

  const toast = document.createElement('div');
  toast.className = `menu-toast toast-${type}`;
  toast.innerHTML = `
    <span class="menu-toast-icon">${icons[type] || '🧁'}</span>
    <span class="menu-toast-msg">${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, durationMs);
}

let pendingConfirmCallback = null;
let pendingCancelCallback = null;

function showConfirmDialog({ icon = '❓', title = 'Confirmar', desc = '', okText = 'Sim', cancelText = 'Cancelar', onConfirm, onCancel }) {
  const modal = document.getElementById('confirmDialogModal');
  const iconEl = document.getElementById('confirmDialogIcon');
  const titleEl = document.getElementById('confirmDialogTitle');
  const descEl = document.getElementById('confirmDialogDesc');
  const okBtn = document.getElementById('confirmDialogOk');
  const cancelBtn = document.getElementById('confirmDialogCancel');

  if (!modal) {
    if (confirm(desc || title)) {
      if (typeof onConfirm === 'function') onConfirm();
    } else {
      if (typeof onCancel === 'function') onCancel();
    }
    return;
  }

  if (iconEl) iconEl.textContent = icon;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
  if (okBtn) okBtn.textContent = okText;
  if (cancelBtn) cancelBtn.textContent = cancelText;

  pendingConfirmCallback = onConfirm;
  pendingCancelCallback = onCancel;
  modal.removeAttribute('hidden');
  modal.hidden = false;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeConfirmDialog() {
  const modal = document.getElementById('confirmDialogModal');
  if (modal) {
    modal.setAttribute('hidden', '');
    modal.hidden = true;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  pendingConfirmCallback = null;
  pendingCancelCallback = null;
}

/* ---------- Gestão de Endereço Estruturado e Autocompletar CEP ---------- */

function getStructuredAddress(prefix) {
  const cep = document.getElementById(`${prefix}Cep`)?.value || '';
  const logradouro = document.getElementById(`${prefix}Street`)?.value || '';
  const numero = document.getElementById(`${prefix}Number`)?.value || '';
  const bairro = document.getElementById(`${prefix}Neighborhood`)?.value || '';
  const complemento = document.getElementById(`${prefix}Complement`)?.value || '';
  const cidadeUf = document.getElementById(`${prefix}City`)?.value || '';
  const referencia = document.getElementById(`${prefix}Reference`)?.value || '';

  const [cidade, uf] = cidadeUf.split('/').map((s) => s.trim());

  return {
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade: cidade || cidadeUf,
    uf: uf || '',
    referencia,
  };
}

function setStructuredAddress(prefix, endereco) {
  if (!endereco) return;
  const data = typeof endereco === 'object' ? endereco : menuService.decomporEndereco(endereco);

  const cepEl = document.getElementById(`${prefix}Cep`);
  const streetEl = document.getElementById(`${prefix}Street`);
  const numEl = document.getElementById(`${prefix}Number`);
  const neighEl = document.getElementById(`${prefix}Neighborhood`);
  const compEl = document.getElementById(`${prefix}Complement`);
  const cityEl = document.getElementById(`${prefix}City`);
  const refEl = document.getElementById(`${prefix}Reference`);

  if (cepEl && data.cep) cepEl.value = menuService.formatarCep(data.cep);
  if (streetEl && (data.logradouro || data.rua)) streetEl.value = data.logradouro || data.rua;
  if (numEl && data.numero) numEl.value = data.numero;
  if (neighEl && data.bairro) neighEl.value = data.bairro;
  if (compEl && data.complemento) compEl.value = data.complemento;
  if (cityEl) {
    const cid = data.cidade || data.localidade || '';
    const uf = data.uf || '';
    cityEl.value = cid && uf ? `${cid} / ${uf}` : cid;
  }
  if (refEl && data.referencia) refEl.value = data.referencia;
}

function setupCepLookup(prefix) {
  const cepInput = document.getElementById(`${prefix}Cep`);
  const spinnerEl = document.getElementById(`${prefix}CepLoading`);
  const msgEl = document.getElementById(`${prefix}CepMsg`);
  const streetInput = document.getElementById(`${prefix}Street`);
  const numInput = document.getElementById(`${prefix}Number`);
  const neighInput = document.getElementById(`${prefix}Neighborhood`);
  const cityInput = document.getElementById(`${prefix}City`);

  if (!cepInput) return;

  let lastCepConsultado = '';

  const doLookup = async () => {
    const raw = cepInput.value;
    const clean = menuService.sanitizarCep(raw);

    if (clean.length === 8) {
      cepInput.value = menuService.formatarCep(clean);
    }

    if (clean.length !== 8) {
      if (msgEl) {
        msgEl.className = 'field-helper-msg';
        msgEl.textContent = '';
      }
      return;
    }

    if (clean === lastCepConsultado) return;
    lastCepConsultado = clean;

    if (spinnerEl) spinnerEl.hidden = false;
    if (msgEl) {
      msgEl.className = 'field-helper-msg info';
      msgEl.textContent = 'Buscando endereço...';
    }

    try {
      const res = await menuService.consultarCepViaCep(clean);
      if (res.sucesso) {
        if (streetInput && res.logradouro) streetInput.value = res.logradouro;
        if (neighInput && res.bairro) neighInput.value = res.bairro;
        if (cityInput) cityInput.value = `${res.localidade || ''} / ${res.uf || ''}`;

        if (msgEl) {
          msgEl.className = 'field-helper-msg success';
          msgEl.textContent = '✓ Endereço localizado!';
        }

        if (numInput && !numInput.value) {
          numInput.focus();
        }
      } else {
        if (msgEl) {
          msgEl.className = 'field-helper-msg error';
          msgEl.textContent = res.erro || 'CEP não encontrado. Preencha manualmente.';
        }
      }
    } catch {
      if (msgEl) {
        msgEl.className = 'field-helper-msg error';
        msgEl.textContent = 'Erro ao consultar CEP.';
      }
    } finally {
      if (spinnerEl) spinnerEl.hidden = true;
    }
  };

  cepInput.addEventListener('input', (e) => {
    const digits = menuService.sanitizarCep(e.target.value);
    if (digits.length <= 5) {
      e.target.value = digits;
    } else {
      e.target.value = `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
    }

    if (digits.length === 8) {
      doLookup();
    }
  });

  cepInput.addEventListener('blur', doLookup);
}

/* ---------- Gestão de Endereço Padrão e Atalhos ---------- */

function updateAddressShortcutsUi() {
  const shortcutsEl = document.getElementById('addressShortcuts');
  const btnDefault = document.getElementById('btnUseDefaultAddress');
  const btnLast = document.getElementById('btnUseLastAddress');
  if (!shortcutsEl || !btnDefault || !btnLast) return;

  const defaultEnd = currentCustomer?.endereco;
  const lastEnd = currentCustomer?.ultimoEnderecoEntrega;

  const defaultStr = defaultEnd ? (typeof defaultEnd === 'object' ? menuService.montarEnderecoCompleto(defaultEnd) : String(defaultEnd).trim()) : '';
  const lastStr = lastEnd ? (typeof lastEnd === 'object' ? menuService.montarEnderecoCompleto(lastEnd) : String(lastEnd).trim()) : '';

  if (defaultStr || lastStr) {
    shortcutsEl.hidden = false;
    shortcutsEl.removeAttribute('hidden');

    if (defaultStr && lastStr && defaultStr !== lastStr) {
      btnDefault.hidden = false;
      btnDefault.removeAttribute('hidden');
      btnLast.hidden = false;
      btnLast.removeAttribute('hidden');
    } else {
      btnDefault.hidden = false;
      btnDefault.removeAttribute('hidden');
      btnLast.hidden = true;
      btnLast.setAttribute('hidden', '');
    }
  } else {
    shortcutsEl.hidden = true;
    shortcutsEl.setAttribute('hidden', '');
  }
}

/* ---------- Gestão de Autenticação / Sessão na Interface ---------- */

function updateAuthUi() {
  const btnAuth = document.getElementById('btnUserAuth');
  const userIcon = document.getElementById('userAuthIcon');
  const userLabel = document.getElementById('userAuthLabel');
  const banner = document.getElementById('cartUserSessionBanner');
  const loggedName = document.getElementById('cartLoggedUserName');

  updateAddressShortcutsUi();

  if (currentCustomer && currentCustomer.nome) {
    const firstName = menuService.extrairPrimeiroNome(currentCustomer.nome);
    if (userLabel) userLabel.textContent = `Olá, ${firstName} ▾`;
    if (userIcon) userIcon.textContent = '👤';
    if (btnAuth) btnAuth.classList.add('btn-user-logged');

    if (banner && loggedName) {
      banner.hidden = false;
      banner.removeAttribute('hidden');
      loggedName.textContent = `${currentCustomer.nome} (${menuService.formatarTelefone(currentCustomer.contato)})`;
    }

    // Preenche os campos do checkout se estiverem vazios
    const nameInput = document.getElementById('clientName');
    const phoneInput = document.getElementById('clientPhone');

    if (nameInput && !nameInput.value) nameInput.value = currentCustomer.nome;
    if (phoneInput && !phoneInput.value) phoneInput.value = menuService.formatarTelefone(currentCustomer.contato);
    
    const endToApply = currentCustomer.endereco || currentCustomer.ultimoEnderecoEntrega;
    if (endToApply) {
      setStructuredAddress('client', endToApply);
    }
  } else {
    if (userLabel) userLabel.textContent = 'Entrar / Criar Conta';
    if (userIcon) userIcon.textContent = '👤';
    if (btnAuth) btnAuth.classList.remove('btn-user-logged');
    if (banner) {
      banner.hidden = true;
      banner.setAttribute('hidden', '');
    }
  }
}

function toggleUserDropdown(forceState) {
  const dropdown = document.getElementById('userDropdown');
  const btnAuth = document.getElementById('btnUserAuth');
  if (!dropdown) return;

  const isOpen = forceState !== undefined ? forceState : !dropdown.classList.contains('open');
  if (isOpen) {
    dropdown.classList.add('open');
    if (btnAuth) btnAuth.setAttribute('aria-expanded', 'true');
  } else {
    dropdown.classList.remove('open');
    if (btnAuth) btnAuth.setAttribute('aria-expanded', 'false');
  }
}

function handleUserAuthClick() {
  if (currentCustomer) {
    toggleUserDropdown();
  } else {
    openAuthModal('tabContentRegister');
  }
}

/* ---------- Controle dos Modais (Auth & Account) ---------- */

function openAuthModal(defaultTabId = 'tabContentRegister') {
  toggleUserDropdown(false);
  const modal = document.getElementById('authModal');
  if (!modal) return;

  switchModalTab('authModal', defaultTabId);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

async function openAccountModal(defaultTabId = 'tabContentOrders') {
  toggleUserDropdown(false);
  if (!currentCustomer) {
    openAuthModal('tabContentRegister');
    return;
  }

  const modal = document.getElementById('accountModal');
  if (!modal) return;

  const nameEl = document.getElementById('accountCustomerName');
  if (nameEl) {
    nameEl.textContent = currentCustomer.nome || 'Minha Conta';
  }

  switchModalTab('accountModal', defaultTabId);
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Carrega os pedidos do cliente
  await loadCustomerOrdersAndFidelity();
  prefillProfileForm();
}

function closeAccountModal() {
  const modal = document.getElementById('accountModal');
  if (modal) {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function switchModalTab(modalId, targetContentId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const tabs = modal.querySelectorAll('.modal-tab-btn');
  const contents = modal.querySelectorAll('.modal-tab-content');

  tabs.forEach((tab) => {
    if (tab.dataset.target === targetContentId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  contents.forEach((content) => {
    if (content.id === targetContentId) {
      content.classList.add('active');
    } else {
      content.classList.remove('active');
    }
  });
}

/* ---------- Operações de Login, Cadastro e Perfil ---------- */

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const nome = document.getElementById('regCustomerName')?.value || '';
  const contato = document.getElementById('regCustomerPhone')?.value || '';
  const enderecoObj = getStructuredAddress('regCustomer');
  const endereco = menuService.montarEnderecoCompleto(enderecoObj);
  const dataNascimento = document.getElementById('regCustomerBirthday')?.value || null;

  const validacao = menuService.validarCadastroCliente({ nome, contato, endereco: enderecoObj });
  if (!validacao.valid) {
    const primeiroErro = Object.values(validacao.errors)[0];
    showCardapioToast(primeiroErro, 'warn');
    return;
  }

  const btn = document.getElementById('btnSubmitRegister');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando dados...';
  }

  try {
    let savedCustomer = null;
    if (supabase.isConfigured()) {
      try {
        savedCustomer = await supabase.upsertCustomerProfilePublic({
          nome,
          contato,
          endereco,
          dataNascimento,
        });
      } catch (err) {
        console.warn('[cardapio] Falha ao gravar no Supabase via RPC, usando local:', err);
      }
    }

    if (!savedCustomer) {
      const cleanPhone = menuService.sanitizarTelefone(contato);
      const existing = storage.getAllCustomers().find(
        (c) => menuService.sanitizarTelefone(c.contato) === cleanPhone
      );
      savedCustomer = {
        id: existing ? existing.id : `cli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        nome: nome.trim(),
        contato: contato.trim(),
        endereco: endereco.trim(),
        dataNascimento: dataNascimento || '',
      };
      storage.saveCustomer(savedCustomer);
    }

    currentCustomer = savedCustomer;
    menuService.salvarSessaoCliente(currentCustomer);
    updateAuthUi();
    closeAuthModal();
    showCardapioToast(`Conta criada com sucesso! Bem-vinda(o), ${menuService.extrairPrimeiroNome(currentCustomer.nome)}! 🧁`, 'success');
  } catch (err) {
    showCardapioToast(`Erro ao salvar cadastro: ${err.message || err}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Salvar Dados e Continuar';
    }
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const phone = document.getElementById('loginCustomerPhone')?.value || '';
  const cleanPhone = menuService.sanitizarTelefone(phone);

  if (!cleanPhone || cleanPhone.length < 10) {
    showCardapioToast('Informe um número de WhatsApp válido com DDD.', 'warn');
    return;
  }

  const btn = document.getElementById('btnSubmitLogin');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verificando...';
  }

  try {
    let found = null;
    if (supabase.isConfigured()) {
      try {
        found = await supabase.getCustomerByPhonePublic(cleanPhone);
      } catch (err) {
        console.warn('[cardapio] getCustomerByPhonePublic falhou, buscando local:', err);
      }
    }

    if (!found) {
      found = storage.getAllCustomers().find(
        (c) => menuService.sanitizarTelefone(c.contato) === cleanPhone
      );
    }

    if (found) {
      currentCustomer = found;
      menuService.salvarSessaoCliente(currentCustomer);
      updateAuthUi();
      closeAuthModal();
      showCardapioToast(`Olá de volta, ${menuService.extrairPrimeiroNome(currentCustomer.nome)}! 👋`, 'success');
    } else {
      showCardapioToast('Telefone não encontrado. Vamos criar sua conta agora!', 'info');
      const regPhone = document.getElementById('regCustomerPhone');
      if (regPhone) regPhone.value = phone;
      switchModalTab('authModal', 'tabContentRegister');
    }
  } catch (err) {
    showCardapioToast(`Erro ao entrar: ${err.message || err}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Acessar Minha Conta';
    }
  }
}

function handleLogout() {
  toggleUserDropdown(false);
  menuService.limparSessaoCliente();
  currentCustomer = null;
  currentCustomerOrders = [];

  // Limpa os campos do formulário de checkout
  const nameInput = document.getElementById('clientName');
  const phoneInput = document.getElementById('clientPhone');
  if (nameInput) nameInput.value = '';
  if (phoneInput) phoneInput.value = '';
  setStructuredAddress('client', {
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    referencia: '',
  });

  // Limpa os campos do formulário de perfil e histórico
  const profName = document.getElementById('profCustomerName');
  const profPhone = document.getElementById('profCustomerPhone');
  const profBday = document.getElementById('profCustomerBirthday');
  if (profName) profName.value = '';
  if (profPhone) profPhone.value = '';
  if (profBday) profBday.value = '';
  setStructuredAddress('profCustomer', {
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    referencia: '',
  });

  const ordersList = document.getElementById('accountOrdersList');
  if (ordersList) ordersList.innerHTML = '';
  const stampsGrid = document.getElementById('loyaltyStampsGrid');
  if (stampsGrid) stampsGrid.innerHTML = '';

  updateAuthUi();
  toggleUserDropdown(false);
  closeAccountModal();
  showCardapioToast('Você saiu da sua conta.', 'info');
}

function prefillProfileForm() {
  if (!currentCustomer) return;
  const nameEl = document.getElementById('profCustomerName');
  const phoneEl = document.getElementById('profCustomerPhone');
  const birthdayEl = document.getElementById('profCustomerBirthday');

  if (nameEl) nameEl.value = currentCustomer.nome || '';
  if (phoneEl) phoneEl.value = menuService.formatarTelefone(currentCustomer.contato);
  if (birthdayEl) birthdayEl.value = currentCustomer.dataNascimento || currentCustomer.data_nascimento || '';

  let addrToFill = currentCustomer.endereco || currentCustomer.ultimoEnderecoEntrega || '';
  if (!addrToFill && Array.isArray(currentCustomerOrders) && currentCustomerOrders.length > 0) {
    const lastDelivery = currentCustomerOrders.find((o) => o.entrega && o.entrega.startsWith('Entrega ('));
    if (lastDelivery) {
      const match = lastDelivery.entrega.match(/^Entrega \((.*)\)$/);
      if (match && match[1]) {
        addrToFill = match[1];
      }
    }
  }

  if (addrToFill) {
    setStructuredAddress('profCustomer', addrToFill);
  }
}

async function handleProfileSave(e) {
  e.preventDefault();
  if (!currentCustomer) return;

  const nome = document.getElementById('profCustomerName')?.value || '';
  const enderecoObj = getStructuredAddress('profCustomer');
  const endereco = menuService.montarEnderecoCompleto(enderecoObj);
  const dataNascimento = document.getElementById('profCustomerBirthday')?.value || null;

  const validacao = menuService.validarCadastroCliente({
    nome,
    contato: currentCustomer.contato,
    endereco: enderecoObj,
  });

  if (!validacao.valid) {
    const primeiroErro = Object.values(validacao.errors)[0];
    showCardapioToast(primeiroErro, 'warn');
    return;
  }

  const btn = document.getElementById('btnSubmitSaveProfile');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando...';
  }

  try {
    let updated = null;
    if (supabase.isConfigured()) {
      try {
        updated = await supabase.upsertCustomerProfilePublic({
          id: currentCustomer.id,
          nome,
          contato: currentCustomer.contato,
          endereco,
          dataNascimento,
        });
      } catch (err) {
        console.warn('[cardapio] updateProfile via RPC falhou:', err);
      }
    }

    if (!updated) {
      updated = {
        ...currentCustomer,
        nome: nome.trim(),
        endereco: endereco.trim(),
        dataNascimento: dataNascimento || '',
      };
      storage.saveCustomer(updated);
    }

    currentCustomer = updated;
    menuService.salvarSessaoCliente(currentCustomer);
    updateAuthUi();
    showCardapioToast('Seus dados foram atualizados com sucesso! ✨', 'success');
  } catch (err) {
    showCardapioToast(`Erro ao salvar dados: ${err.message || err}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Salvar Alterações';
    }
  }
}

/* ---------- Carregamento de Pedidos e Fidelidade ---------- */

async function loadCustomerOrdersAndFidelity() {
  const loadingEl = document.getElementById('accountOrdersLoading');
  const listEl = document.getElementById('accountOrdersList');
  const emptyEl = document.getElementById('accountOrdersEmpty');

  if (!currentCustomer || !currentCustomer.contato) return;

  if (loadingEl) loadingEl.hidden = false;
  if (listEl) listEl.innerHTML = '';
  if (emptyEl) emptyEl.hidden = true;

  const cleanPhone = menuService.sanitizarTelefone(currentCustomer.contato);
  let orders = [];

  try {
    if (supabase.isConfigured()) {
      try {
        orders = await supabase.getCustomerOrdersPublic(cleanPhone);
      } catch (err) {
        console.warn('[cardapio] getCustomerOrdersPublic falhou, lendo local:', err);
      }
    }

    if (!Array.isArray(orders) || orders.length === 0) {
      const allOrders = storage.getAll();
      orders = allOrders.filter((o) => menuService.sanitizarTelefone(o.contato) === cleanPhone);
    }
  } catch (err) {
    console.error('[cardapio] Erro ao carregar histórico:', err);
  } finally {
    if (loadingEl) loadingEl.hidden = true;
  }

  currentCustomerOrders = orders || [];
  renderCustomerOrders(currentCustomerOrders);
  renderCustomerLoyalty(currentCustomerOrders);
}

function renderCustomerOrders(orders = []) {
  const listEl = document.getElementById('accountOrdersList');
  const emptyEl = document.getElementById('accountOrdersEmpty');
  if (!listEl) return;

  if (orders.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.hidden = false;
    return;
  }

  if (emptyEl) emptyEl.hidden = true;
  listEl.innerHTML = '';

  // Ordena os pedidos mais recentes primeiro (por número decrescente e data)
  const sortedOrders = [...orders].sort((a, b) => {
    const numA = Number(a.numero) || 0;
    const numB = Number(b.numero) || 0;
    if (numA && numB) return numB - numA;
    const dateA = new Date(a.data || a.created_at || 0).getTime();
    const dateB = new Date(b.data || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  sortedOrders.forEach((order) => {
    const card = document.createElement('div');
    card.className = 'order-history-card';

    const statusBadgeClass = getStatusBadgeClass(order.status);
    const dateFormatted = formatDateBr(order.data || order.created_at);
    const totalVal = order.valor_total !== undefined ? Number(order.valor_total) : Number(order.valorTotal) || 0;
    const orderNum = order.numero ? `#${order.numero}` : 'Pedido';

    const items = Array.isArray(order.itens) ? order.itens : [];
    const itemsHtml = items.map((item) => {
      const nome = item.sabor || item.titulo || item.tipoProduto || 'Produto';
      const tam = item.tamanho ? ` (${item.tamanho})` : '';
      const qtd = item.quantidade || 1;
      const unitVal = item.valorUnitario !== undefined ? Number(item.valorUnitario) : Number(item.valor) || 0;
      const itemSubtotal = qtd * unitVal;
      return `
        <div class="order-history-item-line">
          <span>${qtd}x ${escapeHtml(nome)}${escapeHtml(tam)}</span>
          <strong>${menuService.formatarMoeda(itemSubtotal)}</strong>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="order-history-header">
        <div>
          <span class="order-history-number">${orderNum}</span>
          <span class="order-history-date">• ${dateFormatted}</span>
        </div>
        <span class="order-status-badge ${statusBadgeClass}">${escapeHtml(order.status || 'Pendente')}</span>
      </div>
      <div class="order-history-items">
        ${itemsHtml || '<p style="margin:0;color:var(--menu-text-muted);">Itens do pedido</p>'}
      </div>
      <div class="order-history-footer">
        <span class="order-history-total">Total: ${menuService.formatarMoeda(totalVal)}</span>
        <button type="button" class="btn-repeat-order" data-id="${order.id}">
          <span>🔁</span> Repetir Pedido
        </button>
      </div>
    `;

    card.querySelector('.btn-repeat-order')?.addEventListener('click', () => {
      repeatOrder(order);
    });

    listEl.appendChild(card);
  });
}

function renderCustomerLoyalty(orders = []) {
  const countBadge = document.getElementById('loyaltyStampsCount');
  const gridEl = document.getElementById('loyaltyStampsGrid');
  const msgEl = document.getElementById('loyaltyProgressMsg');
  if (!gridEl) return;

  const fidelidade = menuService.calcularFidelidadeCliente(orders);

  if (countBadge) {
    countBadge.textContent = `${fidelidade.selos} / 10`;
  }

  if (msgEl) {
    if (fidelidade.selos === 0 && fidelidade.totalPedidos === 0) {
      msgEl.textContent = 'Faça seu primeiro pedido para começar a acumular selos e ganhar recompensas!';
    } else if (fidelidade.selosRestantes === 0 || fidelidade.selos === 10) {
      msgEl.innerHTML = '🎉 <strong>Parabéns!</strong> Você completou 10 selos e ganhou 1 recompensa deliciosa no seu próximo pedido!';
    } else {
      msgEl.textContent = `Você tem ${fidelidade.selos} selo${fidelidade.selos > 1 ? 's' : ''}. Faltam apenas ${fidelidade.selosRestantes} pedido${fidelidade.selosRestantes > 1 ? 's' : ''} para sua próxima recompensa! 🎁`;
    }
  }

  gridEl.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    const slot = document.createElement('div');
    const isStamped = i <= fidelidade.selos;
    const isRewardSlot = i === 10;

    slot.className = `loyalty-stamp-slot${isRewardSlot ? ' reward-slot' : ''}${isStamped ? ' stamped' : ''}`;

    if (isStamped) {
      slot.textContent = isRewardSlot ? '🎁' : '🧁';
      slot.title = `Selo ${i} conquistado!`;
    } else {
      slot.textContent = isRewardSlot ? '10 🎁' : String(i);
      slot.title = `Selo ${i}`;
    }

    gridEl.appendChild(slot);
  }
}

function repeatOrder(order) {
  const items = Array.isArray(order.itens) ? order.itens : [];
  if (items.length === 0) {
    showCardapioToast('Este pedido não contém itens para repetir.', 'warn');
    return;
  }

  const allProducts = storage.getAllProducts() || [];
  let newCart = [];
  const itemsNaoDisponiveis = [];

  items.forEach((item) => {
    // 1. Tenta encontrar pelo ID exato do produto se existir
    let prod = item.produtoId ? allProducts.find((p) => p.id === item.produtoId) : null;

    // 2. Se não encontrou por ID, casa estritamente por Tipo + Sabor + Tamanho
    if (!prod) {
      const itemTipo = String(item.tipoProduto || '').trim().toLowerCase();
      const itemSabor = String(item.sabor || item.titulo || '').trim().toLowerCase();
      const itemTamanho = String(item.tamanho || '').trim().toLowerCase();

      prod = allProducts.find((p) => {
        const pTipo = String(p.tipoProduto || '').trim().toLowerCase();
        const pTitulo = String(p.titulo || '').trim().toLowerCase();
        const pTamanho = String(p.tamanho || '').trim().toLowerCase();

        const matchTipo = pTipo === itemTipo;
        const matchTitulo = pTitulo === itemSabor;
        const matchTamanho = pTipo !== 'bolo inteiro' || pTamanho === itemTamanho;

        return matchTipo && matchTitulo && matchTamanho;
      });
    }

    // 3. Fallback inteligente por Tipo + Tamanho + Valor
    if (!prod) {
      prod = allProducts.find((p) =>
        p.tipoProduto === item.tipoProduto &&
        (p.tamanho || '') === (item.tamanho || '') &&
        Number(p.valor) === Number(item.valorUnitario || item.valor)
      );
    }

    // 4. Se o produto não existe mais no catálogo, monta o item preservando todos os atributos originais
    if (!prod) {
      prod = {
        id: item.produtoId || `prod_custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        titulo: item.sabor || item.titulo || item.tipoProduto,
        tipoProduto: item.tipoProduto || 'Fatia',
        tamanho: item.tamanho || '',
        valor: item.valorUnitario || item.valor || 0,
      };
    }

    const saldoEstoque = prod.estoqueDisponivel !== undefined ? prod.estoqueDisponivel : estoque.disponivel(prod);
    const disp = menuService.verificarDisponibilidadeCardapio(prod, saldoEstoque);

    if (disp.disponivel) {
      const qtdToAdd = Math.min(item.quantidade || 1, disp.estoqueMax || 99);
      newCart = menuService.adicionarItemCarrinho(newCart, prod, qtdToAdd, disp.estoqueMax);
    } else {
      itemsNaoDisponiveis.push(`${prod.tipoProduto} (${prod.titulo})`);
    }
  });

  if (newCart.length === 0 && itemsNaoDisponiveis.length > 0) {
    showCardapioToast(`Itens indisponíveis no momento: ${itemsNaoDisponiveis.join(', ')}`, 'warn', 5000);
    return;
  }

  cart = newCart;
  updateCartUi();
  renderProducts();
  closeAccountModal();
  openCartModal();

  if (itemsNaoDisponiveis.length > 0) {
    showCardapioToast(`Pedido carregado! Alguns itens estavam esgotados: ${itemsNaoDisponiveis.join(', ')}`, 'warn', 5000);
  } else {
    showCardapioToast('Itens do pedido carregados na sua sacola! 🛍️', 'success');
  }
}

function getStatusBadgeClass(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('produ') || s.includes('preparo')) return 'badge-status-producao';
  if (s.includes('pronto')) return 'badge-status-pronto';
  if (s.includes('entregue') || s.includes('concl')) return 'badge-status-entregue';
  if (s.includes('cancel')) return 'badge-status-cancelado';
  return 'badge-status-pendente';
}

function formatDateBr(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/* ---------- Renderização do Catálogo ---------- */
function renderProducts() {
  const grid = document.getElementById('menuProductsGrid');
  const emptyState = document.getElementById('menuEmptyState');
  if (!grid) return;

  const allProducts = storage.getAllProducts() || [];

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
    const saldoEstoque = p.estoqueDisponivel !== undefined ? p.estoqueDisponivel : estoque.disponivel(p);
    const disp = menuService.verificarDisponibilidadeCardapio(p, saldoEstoque);
    const inCart = cart.find((item) => item.id === p.id);

    card.className = `menu-product-card${!disp.disponivel ? ' esgotado' : ''}`;

    const badgeCategoria = p.tipoProduto === 'Bolo Inteiro' && p.tamanho
      ? `${p.tipoProduto} • ${p.tamanho}`
      : p.tipoProduto;

    card.innerHTML = `
      <div class="menu-product-info">
        <div class="menu-badges-row">
          <span class="menu-product-badge">${escapeHtml(badgeCategoria)}</span>
          <span class="status-badge ${disp.statusClass}">${escapeHtml(disp.statusTexto)}</span>
        </div>
        <h3 class="menu-product-title">${escapeHtml(p.titulo)}</h3>
        ${p.detalhes ? `<p class="menu-product-details">${escapeHtml(p.detalhes)}</p>` : ''}
        <span class="menu-product-price">${menuService.formatarMoeda(p.valor)}</span>
      </div>
      <div class="menu-product-action">
        ${
          !disp.disponivel
            ? `<button type="button" class="btn-add-item" disabled>Esgotado</button>`
            : inCart
              ? `<div class="menu-qty-control">
                  <button type="button" class="btn-qty btn-minus" data-id="${p.id}" aria-label="Diminuir">－</button>
                  <span class="qty-val">${inCart.quantidade}</span>
                  <button type="button" class="btn-qty btn-plus" data-id="${p.id}" aria-label="Aumentar" ${inCart.quantidade >= disp.estoqueMax ? 'disabled title="Limite máximo disponível"' : ''}>＋</button>
                </div>`
              : `<button type="button" class="btn-add-item" data-id="${p.id}">
                  <span>＋</span> Adicionar
                </button>`
        }
      </div>
    `;

    // Eventos dos botões do card
    const btnAdd = card.querySelector('.btn-add-item:not(:disabled)');
    if (btnAdd) {
      btnAdd.addEventListener('click', () => {
        cart = menuService.adicionarItemCarrinho(cart, p, 1, disp.estoqueMax);
        updateCartUi();
        renderProducts();
      });
    }

    const btnMinus = card.querySelector('.btn-minus');
    if (btnMinus) {
      btnMinus.addEventListener('click', () => {
        const item = cart.find((i) => i.id === p.id);
        if (item) {
          cart = menuService.alterarQuantidadeCarrinho(cart, p.id, item.quantidade - 1, disp.estoqueMax);
          updateCartUi();
          renderProducts();
        }
      });
    }

    const btnPlus = card.querySelector('.btn-plus:not(:disabled)');
    if (btnPlus) {
      btnPlus.addEventListener('click', () => {
        const item = cart.find((i) => i.id === p.id);
        if (item) {
          cart = menuService.alterarQuantidadeCarrinho(cart, p.id, item.quantidade + 1, disp.estoqueMax);
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

  const allProducts = storage.getAllProducts() || [];

  cart.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'cart-item-row';

    const prod = allProducts.find((p) => p.id === item.id) || item;
    const saldoEstoque = prod.estoqueDisponivel !== undefined ? prod.estoqueDisponivel : estoque.disponivel(prod);
    const disp = menuService.verificarDisponibilidadeCardapio(prod, saldoEstoque);

    const itemTotal = (Number(item.quantidade) || 1) * (Number(item.valor) || 0);
    const desc = item.tamanho ? `${item.tipoProduto} (${item.tamanho})` : item.tipoProduto;

    row.innerHTML = `
      <div class="cart-item-info">
        <h4 class="cart-item-name">${escapeHtml(item.titulo)}</h4>
        <p class="cart-item-desc">${escapeHtml(desc)} • <span class="status-badge ${disp.statusClass}" style="font-size:0.68rem;">${escapeHtml(disp.statusTexto)}</span></p>
      </div>
      <div class="cart-item-controls">
        <div class="menu-qty-control">
          <button type="button" class="btn-qty btn-drawer-minus" data-id="${item.id}" aria-label="Diminuir">－</button>
          <span class="qty-val">${item.quantidade}</span>
          <button type="button" class="btn-qty btn-drawer-plus" data-id="${item.id}" aria-label="Aumentar" ${item.quantidade >= disp.estoqueMax ? 'disabled title="Limite máximo disponível"' : ''}>＋</button>
        </div>
        <span class="cart-item-price">${menuService.formatarMoeda(itemTotal)}</span>
      </div>
    `;

    row.querySelector('.btn-drawer-minus')?.addEventListener('click', () => {
      cart = menuService.alterarQuantidadeCarrinho(cart, item.id, item.quantidade - 1, disp.estoqueMax);
      updateCartUi();
      renderProducts();
    });

    row.querySelector('.btn-drawer-plus:not(:disabled)')?.addEventListener('click', () => {
      cart = menuService.alterarQuantidadeCarrinho(cart, item.id, item.quantidade + 1, disp.estoqueMax);
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
    updateAuthUi();
    const addressWrap = document.getElementById('fieldAddressWrap');
    if (addressWrap) {
      addressWrap.hidden = currentDeliveryType !== 'Entrega';
    }
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
async function handleCheckout() {
  const nome = document.getElementById('clientName')?.value || '';
  const whatsapp = document.getElementById('clientPhone')?.value || '';
  const enderecoObj = currentDeliveryType === 'Entrega' ? getStructuredAddress('client') : null;
  const endereco = enderecoObj ? menuService.montarEnderecoCompleto(enderecoObj) : '';
  const dataDesejada = document.getElementById('deliveryDate')?.value || '';
  const periodo = document.getElementById('deliveryPeriod')?.value || '';
  const pagamento = document.getElementById('paymentMethod')?.value || 'PIX';
  const observacoes = document.getElementById('orderNotes')?.value || '';

  const dadosCliente = {
    nome,
    whatsapp,
    tipoEntrega: currentDeliveryType,
    endereco: enderecoObj || endereco,
    dataDesejada,
    periodo,
    pagamento,
    observacoes,
  };

  const validacao = menuService.validarCheckout(dadosCliente, cart);
  if (!validacao.valid) {
    const primeiroErro = Object.values(validacao.errors)[0];
    showCardapioToast(primeiroErro, 'warn');
    return;
  }

  const totais = menuService.calcularTotaisCarrinho(cart);
  const msg = menuService.gerarMensagemPedidoWhatsapp(
    { ...dadosCliente, endereco },
    cart,
    totais.totalValor,
    'Punk Bolos'
  );

  // Grava o pedido no banco/storage interno como "Pendente"
  try {
    const orders = storage.getAll();
    const numero = orderModule.nextOrderNumber(orders);
    const orderItems = cart.map((c) => ({
      produtoId: c.id,
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

    // Atualiza o endereço padrão (se não tiver) e o último endereço de entrega no perfil do cliente
    if (currentCustomer) {
      if (currentDeliveryType === 'Entrega' && (enderecoObj || endereco)) {
        currentCustomer.ultimoEnderecoEntrega = enderecoObj || endereco;
        if (!currentCustomer.endereco) {
          currentCustomer.endereco = enderecoObj || endereco;
        }
      }
      currentCustomer.nome = nome.trim();
      currentCustomer.contato = whatsapp.trim();
      storage.saveCustomer(currentCustomer);
      menuService.salvarSessaoCliente(currentCustomer);

      if (supabase.isConfigured()) {
        supabase.upsertCustomerProfilePublic(currentCustomer).catch((e) =>
          console.warn('[cardapio] upsertCustomerProfilePublic falhou em checkout:', e)
        );
      }
      updateAuthUi();
    } else {
      const cleanPhone = menuService.sanitizarTelefone(whatsapp);
      const allCust = storage.getAllCustomers();
      let matchCust = allCust.find((c) => menuService.sanitizarTelefone(c.contato) === cleanPhone);

      if (!matchCust) {
        matchCust = {
          id: `cli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          nome: nome.trim(),
          contato: whatsapp.trim(),
          endereco: currentDeliveryType === 'Entrega' ? (enderecoObj || endereco.trim()) : '',
          ultimoEnderecoEntrega: currentDeliveryType === 'Entrega' ? (enderecoObj || endereco.trim()) : '',
          dataNascimento: '',
          observacoes: observacoes.trim(),
        };
        storage.saveCustomer(matchCust);

        if (supabase.isConfigured()) {
          supabase.upsertCustomerProfilePublic(matchCust).catch((e) =>
            console.warn('[cardapio] upsertCustomerProfilePublic falhou em checkout:', e)
          );
        }
      } else {
        if (currentDeliveryType === 'Entrega' && (enderecoObj || endereco)) {
          matchCust.ultimoEnderecoEntrega = enderecoObj || endereco;
          if (!matchCust.endereco) {
            matchCust.endereco = enderecoObj || endereco;
          }
          storage.saveCustomer(matchCust);
        }
      }
      currentCustomer = matchCust;
      menuService.salvarSessaoCliente(currentCustomer);
      updateAuthUi();
    }
  } catch (e) {
    console.error('[cardapio] Erro ao salvar pedido interno:', e);
  }

  // Salva notificação pendente para reexibir quando o cliente retornar do WhatsApp
  try {
    sessionStorage.setItem('punk_order_toast', 'Pedido registrado com sucesso! Aguarde nosso retorno no WhatsApp. 🎉');
  } catch (_) {}

  // Limpa o carrinho e reseta a interface para a tela principal
  cart = [];
  updateCartUi();
  renderProducts();
  closeCartModal();
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Reseta estado de entrega para Retirada padrão
  currentDeliveryType = 'Retirada';
  const btnRet = document.getElementById('btnOptRetirada');
  const btnEnt = document.getElementById('btnOptEntrega');
  const addrWrap = document.getElementById('fieldAddressWrap');
  if (btnRet) btnRet.classList.add('active');
  if (btnEnt) btnEnt.classList.remove('active');
  if (addrWrap) addrWrap.hidden = true;

  // Limpa campos específicos do pedido mantendo dados do cliente
  const notesEl = document.getElementById('orderNotes');
  if (notesEl) notesEl.value = '';

  // Notifica o cliente com toast de sucesso
  showCardapioToast('Pedido registrado com sucesso! Aguarde nosso retorno no WhatsApp. 🎉', 'success', 6000);

  // Redireciona para o WhatsApp
  const waLink = menuService.formatarLinkWhatsapp(STORE_PHONE, msg);
  if (waLink) {
    window.open(waLink, '_blank');
  }
}

/* ---------- Listeners de Eventos ---------- */
function setupEventListeners() {
  // Exibe toast de confirmação quando o cliente retorna do WhatsApp
  const checkPendingOrderToast = () => {
    try {
      const pendingToast = sessionStorage.getItem('punk_order_toast');
      if (pendingToast) {
        sessionStorage.removeItem('punk_order_toast');
        closeCartModal();
        showCardapioToast(pendingToast, 'success', 5000);
      }
    } catch (_) {}
  };

  window.addEventListener('pageshow', checkPendingOrderToast);
  window.addEventListener('focus', checkPendingOrderToast);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkPendingOrderToast();
    }
  });

  // Inicializa a escuta de CEP com auto-complete nos 3 formulários
  setupCepLookup('client');
  setupCepLookup('regCustomer');
  setupCepLookup('profCustomer');

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

  // Autenticação & Dropdown
  document.getElementById('btnUserAuth')?.addEventListener('click', handleUserAuthClick);
  document.getElementById('btnNavOrders')?.addEventListener('click', () => openAccountModal('tabContentOrders'));
  document.getElementById('btnNavLoyalty')?.addEventListener('click', () => openAccountModal('tabContentLoyalty'));
  document.getElementById('btnNavProfile')?.addEventListener('click', () => openAccountModal('tabContentProfile'));
  document.getElementById('btnLogoutCustomer')?.addEventListener('click', handleLogout);

  // Fecha dropdown ao clicar fora
  document.addEventListener('click', (e) => {
    const btnAuth = document.getElementById('btnUserAuth');
    const dropdown = document.getElementById('userDropdown');
    if (dropdown && btnAuth && !btnAuth.contains(e.target) && !dropdown.contains(e.target)) {
      toggleUserDropdown(false);
    }
  });

  // Modais de Auth & Conta
  document.getElementById('btnAuthClose')?.addEventListener('click', closeAuthModal);
  document.getElementById('authBackdrop')?.addEventListener('click', closeAuthModal);
  document.getElementById('btnAccountClose')?.addEventListener('click', closeAccountModal);
  document.getElementById('accountBackdrop')?.addEventListener('click', closeAccountModal);

  // Abas do Modal Auth
  document.getElementById('tabBtnRegister')?.addEventListener('click', () => switchModalTab('authModal', 'tabContentRegister'));
  document.getElementById('tabBtnLogin')?.addEventListener('click', () => switchModalTab('authModal', 'tabContentLogin'));

  // Abas do Modal Account
  document.getElementById('tabBtnAccountOrders')?.addEventListener('click', () => switchModalTab('accountModal', 'tabContentOrders'));
  document.getElementById('tabBtnAccountLoyalty')?.addEventListener('click', () => switchModalTab('accountModal', 'tabContentLoyalty'));
  document.getElementById('tabBtnAccountProfile')?.addEventListener('click', () => switchModalTab('accountModal', 'tabContentProfile'));

  // Formulários
  document.getElementById('customerRegisterForm')?.addEventListener('submit', handleRegisterSubmit);
  document.getElementById('customerLoginForm')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('customerProfileForm')?.addEventListener('submit', handleProfileSave);

  // Trocar usuário no carrinho
  document.getElementById('btnCartSwitchUser')?.addEventListener('click', () => {
    closeCartModal();
    openAuthModal('tabContentRegister');
  });

  // Barra flutuante
  document.getElementById('floatingCartBar')?.addEventListener('click', openCartModal);

  // Fechar modal do carrinho
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
      if (addressWrap) {
        addressWrap.hidden = true;
        addressWrap.setAttribute('hidden', '');
      }
    });

    btnEntrega.addEventListener('click', () => {
      btnEntrega.classList.add('active');
      btnRetirada.classList.remove('active');
      currentDeliveryType = 'Entrega';
      if (addressWrap) {
        addressWrap.hidden = false;
        addressWrap.removeAttribute('hidden');
      }

      if (currentCustomer) {
        updateAddressShortcutsUi();
        const streetVal = document.getElementById('clientStreet')?.value;
        if (!streetVal) {
          const endToApply = currentCustomer.endereco || currentCustomer.ultimoEnderecoEntrega;
          if (endToApply) {
            setStructuredAddress('client', endToApply);
          }
        }
      }
    });
  }

  // Atalhos de Endereço no Checkout
  document.getElementById('btnUseDefaultAddress')?.addEventListener('click', () => {
    if (currentCustomer?.endereco) {
      setStructuredAddress('client', currentCustomer.endereco);
      document.getElementById('btnUseDefaultAddress')?.classList.add('active');
      document.getElementById('btnUseLastAddress')?.classList.remove('active');
      showCardapioToast('Endereço padrão aplicado! 🏠', 'success');
    }
  });

  document.getElementById('btnUseLastAddress')?.addEventListener('click', () => {
    if (currentCustomer?.ultimoEnderecoEntrega) {
      setStructuredAddress('client', currentCustomer.ultimoEnderecoEntrega);
      document.getElementById('btnUseLastAddress')?.classList.add('active');
      document.getElementById('btnUseDefaultAddress')?.classList.remove('active');
      showCardapioToast('Último endereço aplicado! 🕒', 'success');
    }
  });

  // Botão Sair da Conta dentro da aba Meus Dados
  document.getElementById('btnLogoutFromProfile')?.addEventListener('click', handleLogout);

  // Botão Enviar Pedido
  document.getElementById('btnSubmitWhatsapp')?.addEventListener('click', handleCheckout);

  // Modal de Confirmação Customizado
  document.getElementById('confirmDialogCancel')?.addEventListener('click', () => {
    const cb = pendingCancelCallback;
    closeConfirmDialog();
    if (typeof cb === 'function') {
      cb();
    }
  });
  document.getElementById('confirmDialogBackdrop')?.addEventListener('click', () => {
    const cb = pendingCancelCallback;
    closeConfirmDialog();
    if (typeof cb === 'function') {
      cb();
    }
  });
  document.getElementById('confirmDialogOk')?.addEventListener('click', () => {
    const cb = pendingConfirmCallback;
    closeConfirmDialog();
    if (typeof cb === 'function') {
      cb();
    }
  });
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
