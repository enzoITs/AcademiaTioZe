// Conta do jogador e envio do progresso para a nuvem (só no navegador).
// Não importa o store: o store chama cloudSave() e a UI assina `account`.
import { CONFIG } from '../config.js';
import { serialize, localOwner, setLocalOwner } from './persistence.js';

const listeners = new Set();
let version = 0;

/** sync: idle | saving | saved | offline | error */
export const account = {
  checked: false,
  user: null, // { name }
  sync: 'idle',
  syncedAt: null,
  message: null,
};

function set(patch) {
  Object.assign(account, patch);
  version += 1;
  for (const fn of listeners) fn();
}

export function subscribeAccount(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getAccountVersion() {
  return version;
}

async function api(path, { method = 'GET', body, rawBody, keepalive = false } = {}) {
  const payload = rawBody ?? (body ? JSON.stringify(body) : undefined);
  const res = await fetch(path, {
    method,
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload,
    credentials: 'same-origin',
    keepalive,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* resposta sem corpo */
  }
  if (!res.ok) {
    const err = new Error(data?.error ?? `Erro ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const isNetworkError = (err) => !err.status;

/** Pergunta ao servidor quem está logado. Sem internet, confia no dono do save local. */
export async function refreshMe() {
  try {
    const { user } = await api('/api/auth/me');
    set({ checked: true, user, sync: 'idle' });
  } catch (err) {
    const owner = localOwner();
    set({ checked: true, user: isNetworkError(err) && owner ? { name: owner } : null, sync: isNetworkError(err) ? 'offline' : 'idle' });
  }
  return account.user;
}

export async function register(name, password) {
  const { user } = await api('/api/auth/register', { method: 'POST', body: { name, password } });
  set({ user, message: null });
  return user;
}

export async function login(name, password) {
  const { user } = await api('/api/auth/login', { method: 'POST', body: { name, password } });
  set({ user, message: null });
  return user;
}

export async function logout() {
  // Espera o último envio terminar antes de encerrar a sessão.
  await currentPush?.catch(() => {});
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    set({ user: null, sync: 'idle', syncedAt: null });
  }
}

export const fetchCloudSave = () => api('/api/save');
export const fetchRanking = (by, page = 0) => api(`/api/ranking?by=${by}&page=${page}`);
export const searchPlayers = (q) => api(`/api/players?q=${encodeURIComponent(q)}`);
export const fetchProfile = (name) => api(`/api/players/${encodeURIComponent(name)}`);

// ---------------------------------------------------------------- envio
let lastPush = 0;
let inFlight = false;
let retryAfter = 0;
let currentPush = null;

/** Envia o progresso. Sem `force`, no máximo a cada `cloudSaveSeconds`. */
export function cloudSave(state, { force = false, keepalive = false } = {}) {
  if (!account.user || !state) return;
  const now = Date.now();
  if (inFlight && !keepalive) return;
  if (!force && now - lastPush < CONFIG.online.cloudSaveSeconds * 1000) return;
  if (now < retryAfter && !keepalive) return;
  const rawBody = `{"save":${serialize(state)}}`;
  // O navegador só garante pedidos "keepalive" pequenos ao fechar a aba.
  if (keepalive && rawBody.length > 60_000) return;
  lastPush = now;
  inFlight = true;
  set({ sync: 'saving' });
  currentPush = api('/api/save', { method: 'PUT', rawBody, keepalive })
    .then(() => {
      setLocalOwner(account.user?.name ?? '');
      set({ sync: 'saved', syncedAt: Date.now(), message: null });
    })
    .catch((err) => {
      if (err.status === 401) set({ user: null, sync: 'idle', message: 'Sua sessão expirou. Entre de novo para salvar na nuvem.' });
      else if (err.status === 429) {
        retryAfter = Date.now() + 5000;
        set({ sync: 'idle' });
      } else if (isNetworkError(err)) {
        retryAfter = Date.now() + 15000;
        set({ sync: 'offline' });
      } else set({ sync: 'error', message: err.message });
    })
    .finally(() => {
      inFlight = false;
      currentPush = null;
    });
}
