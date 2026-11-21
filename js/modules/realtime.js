/* ============================================================
   REALTIME.JS — Sincronização em Tempo Real (Supabase WebSockets)
   ------------------------------------------------------------
   Responsabilidades:
   - Conectar ao WebSocket nativo do Supabase (protocolo Phoenix Channels)
   - Escutar novos pedidos (INSERT) e atualizações de status (UPDATE)
   - Tocar alerta sonoro harmônico de 2 tons (Web Audio API, 100% offline)
   - Destacar novos pedidos na esteira da cozinha (efeito pulse)
   - Exibir badge de status de conexão em tempo real (Online / Reconectando)
   - Reconciliação automática ao focar na janela (window focus) e reconexão
   ============================================================ */

import { CONFIG } from '../config.js';
import * as storage from './storage.js';
import * as supabase from './supabase.js';
import { showToast } from './toast.js';

let socket = null;
let heartbeatInterval = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let isConnected = false;
let audioCtx = null;

// Preferência de som salva no navegador (padrão: ativado)
let soundEnabled = typeof localStorage !== 'undefined' ? localStorage.getItem('punk_kitchen_sound_muted') !== 'true' : true;

// Callbacks registrados por app.js / orderList.js
let onOrderReceivedCallback = null;
let onOrderUpdatedCallback = null;
let onConnectionChangeCallback = null;

/**
 * Verifica se o som da cozinha está ativado.
 * @returns {boolean}
 */
export function isSoundEnabled() {
  return soundEnabled;
}

/**
 * Alterna entre som ativado e desativado.
 * @returns {boolean} Novo estado.
 */
export function toggleSound() {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem('punk_kitchen_sound_muted', soundEnabled ? 'false' : 'true');
  } catch (_) {}

  // Se ativou, desbloqueia o AudioContext com uma nota sutil de teste
  if (soundEnabled) {
    unlockAudioContext();
    playChime(659.25, 0.1, 0.2); // Mi (E5) breve
  }
  return soundEnabled;
}

/**
 * Desbloqueia o contexto de áudio em resposta a uma interação do usuário.
 */
function unlockAudioContext() {
  try {
    if (typeof window === 'undefined') return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  } catch (_) {}
}

/**
 * Toca um tom individual limpo e suave via oscilador senoidal nativo.
 * @param {number} freq - Frequência em Hz.
 * @param {number} startDelay - Atraso de início em segundos.
 * @param {number} duration - Duração em segundos.
 * @param {number} [volume=0.2] - Ganho máximo.
 */
function playChime(freq, startDelay, duration, volume = 0.2) {
  try {
    unlockAudioContext();
    if (!audioCtx) return;

    const now = audioCtx.currentTime + startDelay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);

    // Fade-in e fade-out exponencial suave para evitar cliques no alto-falante
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + duration);
  } catch (_) {}
}

/**
 * Executa o chime de confeitaria de 2 notas harmônicas (D5 -> A5).
 */
export function playOrderChime() {
  if (!soundEnabled) return;
  // Nota 1: Ré (D5 - 587.33 Hz)
  playChime(587.33, 0, 0.45, 0.18);
  // Nota 2: Lá (A5 - 880.00 Hz)
  playChime(880.00, 0.14, 0.75, 0.22);
}

/**
 * Registra listeners de eventos do ciclo de vida em tempo real.
 * @param {Object} handlers
 * @param {Function} [handlers.onOrderReceived]
 * @param {Function} [handlers.onOrderUpdated]
 * @param {Function} [handlers.onConnectionChange]
 */
export function setRealtimeListeners({ onOrderReceived, onOrderUpdated, onConnectionChange }) {
  if (onOrderReceived) onOrderReceivedCallback = onOrderReceived;
  if (onOrderUpdated) onOrderUpdatedCallback = onOrderUpdated;
  if (onConnectionChange) onConnectionChangeCallback = onConnectionChange;
}

/**
 * Atualiza o badge visual de conexão na interface.
 * @param {boolean} online
 */
function updateConnectionBadge(online) {
  isConnected = online;
  const badge = typeof document !== 'undefined' ? document.getElementById('realtimeStatusBadge') : null;
  if (badge) {
    badge.className = `realtime-status-badge ${online ? 'online' : 'offline'}`;
    badge.textContent = online ? 'Tempo Real: Ativo' : 'Tempo Real: Reconectando...';
    badge.title = online
      ? 'Conexão WebSocket ativa. Pedidos são recebidos instantaneamente.'
      : 'Tentando restabelecer conexão em tempo real com o servidor.';
  }
  if (onConnectionChangeCallback) {
    try {
      onConnectionChangeCallback(online);
    } catch (_) {}
  }
}

/**
 * Monta a URL do WebSocket do Supabase com base na configuração ativa.
 * @returns {string|null}
 */
function getWebSocketUrl() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseAnonKey) return null;
  const wsBase = CONFIG.supabaseUrl.replace(/^http/, 'ws').replace(/\/+$/, '');
  const session = supabase.loadSession();
  const token = session && session.access_token ? session.access_token : CONFIG.supabaseAnonKey;
  return `${wsBase}/realtime/v1/websocket?apikey=${encodeURIComponent(CONFIG.supabaseAnonKey)}&token=${encodeURIComponent(token)}&vsn=1.0.0`;
}

/**
 * Conecta ao canal WebSocket do Supabase.
 */
export function connect() {
  const url = getWebSocketUrl();
  if (!url) return;

  // Evita múltiplas conexões simultâneas
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  try {
    socket = new WebSocket(url);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    reconnectAttempts = 0;
    updateConnectionBadge(true);

    const session = supabase.loadSession();
    const token = session && session.access_token ? session.access_token : CONFIG.supabaseAnonKey;

    // Junta-se ao canal de escuta da tabela 'orders' no schema 'public'
    const joinMsg = {
      topic: 'realtime:public:orders',
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: [
            {
              event: '*',
              schema: 'public',
              table: 'orders',
            },
          ],
        },
        access_token: token,
      },
      ref: 'join_orders',
    };
    socket.send(JSON.stringify(joinMsg));

    // Inicia heartbeat a cada 25 segundos para manter a conexão aberta no gateway
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            topic: 'phoenix',
            event: 'heartbeat',
            payload: {},
            ref: `hb_${Date.now()}`,
          })
        );
      }
    }, 25000);
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (!msg) return;

      // Evento de alteração no Postgres recebido pelo Realtime
      if (msg.event === 'postgres_changes' && msg.payload) {
        handlePostgresChange(msg.payload);
      }
    } catch (_) {}
  };

  socket.onerror = () => {
    updateConnectionBadge(false);
  };

  socket.onclose = () => {
    updateConnectionBadge(false);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    scheduleReconnect();
  };
}

/**
 * Agenda a reconexão automática com backoff exponencial suave.
 */
function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  const delay = Math.min(2000 * Math.pow(1.5, reconnectAttempts), 30000);
  reconnectAttempts++;
  reconnectTimer = setTimeout(() => {
    connect();
  }, delay);
}

/**
 * Processa uma alteração da tabela 'orders' recebida em tempo real.
 * @param {Object} payload - Dados do evento postgres_changes.
 */
export function handlePostgresChange(payload) {
  const data = payload.data || payload;
  const changeType = String(data.type || data.eventType || '').toUpperCase();
  const record = data.record || data.new;
  const oldRecord = data.old_record || data.old;

  if (changeType === 'INSERT' && record) {
    const newOrder = storage.applyRemoteOrderInsert(record);

    // 1. Toca o alerta sonoro de comanda
    playOrderChime();

    // 2. Notifica com toast informativo no topo
    const numStr = newOrder.numero ? `#${newOrder.numero}` : '';
    const clienteStr = newOrder.cliente ? ` de ${newOrder.cliente}` : '';
    showToast(`Novo pedido ${numStr}${clienteStr} recebido em tempo real!`, 'success');

    // 3. Dispara callback para atualização e destaque da esteira de pedidos
    if (onOrderReceivedCallback) {
      try {
        onOrderReceivedCallback(newOrder);
      } catch (_) {}
    }
  } else if (changeType === 'UPDATE' && record) {
    const updatedOrder = storage.applyRemoteOrderUpdate(record);
    if (onOrderUpdatedCallback) {
      try {
        onOrderUpdatedCallback(updatedOrder);
      } catch (_) {}
    }
  } else if (changeType === 'DELETE') {
    const targetId = (oldRecord && oldRecord.id) || (record && record.id);
    if (targetId) {
      storage.applyRemoteOrderDelete(targetId);
      if (onOrderUpdatedCallback) {
        try {
          onOrderUpdatedCallback(null);
        } catch (_) {}
      }
    }
  }
}

/**
 * Inicializa os listeners globais de interação e janela.
 */
export function init() {
  if (typeof window === 'undefined') return;

  // Desbloqueia o AudioContext na primeira interação do usuário na página
  const unlockOnce = () => {
    unlockAudioContext();
    window.removeEventListener('pointerdown', unlockOnce);
    window.removeEventListener('keydown', unlockOnce);
  };
  window.addEventListener('pointerdown', unlockOnce, { once: true });
  window.addEventListener('keydown', unlockOnce, { once: true });

  // Reconecta se a conexão de rede voltar
  window.addEventListener('online', () => {
    reconnectAttempts = 0;
    connect();
  });

  // Reconecta ao alternar visibilidade para a página
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        connect();
      }
    }
  });

  // Conecta ao carregar
  connect();
}
