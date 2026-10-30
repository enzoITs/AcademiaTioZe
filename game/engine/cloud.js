// Conta do jogador e envio do progresso para a nuvem (só no navegador).
// Não importa o store: o store chama cloudSave() e a UI assina `account`.
import { CONFIG } from '../config.js';
import { serialize, localOwner, setLocalOwner } from './persistence.js';

const listeners = new Set();
let version = 0;

/** sync: idle | saving | saved | offline | error */
export const account = {
  checked: false,
  user: null, // { name, role }
  sync: 'idle',
  syncedAt: null,
  message: null,
  rev: null, // versão do save da nuvem que este jogo conhece (sobe quando o admin mexe)
};

// O store registra o que fazer quando o servidor manda recarregar ou mostra avisos.
const handlers = { reload: null, notices: null };

/** onReload(message): buscar o save da nuvem e continuar dele. onNotices(list, title?): mostrar avisos. */
export function setCloudHandlers({ onReload, onNotices }) {
  handlers.reload = onReload;
  handlers.notices = onNotices;
}

function showNotices(list, title) {
  if (list?.length) handlers.notices?.(list, title);
}

const REV_KEY = 'academia-tio-ze/rev';

function setRev(rev) {
  account.rev = Number.isInteger(rev) ? rev : null;
  try {
    if (account.rev == null) window.localStorage.removeItem(REV_KEY);
    else window.localStorage.setItem(REV_KEY, JSON.stringify({ owner: account.user?.name ?? '', rev: account.rev }));
  } catch {
    /* sem armazenamento: só fica na memória */
  }
}

/** Versão guardada neste navegador (para continuar sem internet). */
function storedRev() {
  try {
    const data = JSON.parse(window.localStorage.getItem(REV_KEY) ?? 'null');
    return data && data.owner === (account.user?.name ?? '') && Number.isInteger(data.rev) ? data.rev : null;
  } catch {
    return null;
  }
}

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

async function api(path, { method = 'GET', body, rawBody, contentType = 'application/json', keepalive = false } = {}) {
  const payload = rawBody ?? (body ? JSON.stringify(body) : undefined);
  const res = await fetch(path, {
    method,
    headers: payload ? { 'Content-Type': contentType } : undefined,
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
    err.code = data?.code ?? null;
    err.data = data;
    throw err;
  }
  return data;
}

const isNetworkError = (err) => !err.status;

/** Pergunta ao servidor quem está logado. Sem internet, confia no dono do save local. */
export async function refreshMe() {
  try {
    const { user, banned, notices } = await api('/api/auth/me');
    set({ checked: true, user, sync: 'idle' });
    if (banned) showNotices([banned], 'Conta banida');
    showNotices(notices);
  } catch (err) {
    const owner = localOwner();
    set({ checked: true, user: isNetworkError(err) && owner ? { name: owner } : null, sync: isNetworkError(err) ? 'offline' : 'idle' });
  }
  return account.user;
}

export async function register(name, password) {
  const { user } = await api('/api/auth/register', { method: 'POST', body: { name, password } });
  account.rev = null;
  set({ user, message: null });
  return user;
}

export async function login(name, password) {
  const { user } = await api('/api/auth/login', { method: 'POST', body: { name, password } });
  account.rev = null;
  set({ user, message: null });
  return user;
}

export async function logout() {
  setRev(null);
  // Espera o último envio terminar antes de encerrar a sessão.
  await currentPush?.catch(() => {});
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } finally {
    set({ user: null, sync: 'idle', syncedAt: null });
  }
}

/** Baixa o progresso da conta e guarda a versão (rev) para os próximos envios. */
export async function fetchCloudSave() {
  const data = await api('/api/save');
  setRev(data.rev ?? 0);
  return data;
}
export const fetchRanking = (by, page = 0) => api(`/api/ranking?by=${by}&page=${page}`);
export const searchPlayers = (q) => api(`/api/players?q=${encodeURIComponent(q)}`);
export const fetchProfile = (name) => api(`/api/players/${encodeURIComponent(name)}`);

// ---------------------------------------------------------------- envio
/**
 * Progresso grande vai compactado (gzip): o JSON de quem tem milhares de alunos
 * passa de alguns MB, e compactado fica bem menor. Sem suporte no navegador, vai como está.
 */
async function packSave(text) {
  if (text.length < 20_000 || typeof CompressionStream === 'undefined') return { rawBody: text };
  try {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    return { rawBody: await new Response(stream).arrayBuffer(), contentType: 'application/gzip' };
  } catch {
    return { rawBody: text };
  }
}

let lastPush = 0;
let inFlight = false;
let retryAfter = 0;
let currentPush = null;
let reloading = false;

/** Servidor recusou ou mudou o save: para de enviar e recarrega da nuvem. */
function reloadFromCloud(message, notices) {
  if (reloading) return;
  reloading = true;
  set({ sync: 'idle', message: null });
  Promise.resolve(handlers.reload?.(message, notices ?? []))
    .catch(() => {})
    .finally(() => {
      reloading = false;
    });
}

/** Envia o progresso. Sem `force`, no máximo a cada `cloudSaveSeconds`. */
export function cloudSave(state, { force = false, keepalive = false } = {}) {
  if (!account.user || !state || reloading) return;
  const now = Date.now();
  if (inFlight && !keepalive) return;
  if (!force && now - lastPush < CONFIG.online.cloudSaveSeconds * 1000) return;
  if (now < retryAfter && !keepalive) return;
  if (account.rev == null) account.rev = storedRev() ?? 0;
  const rawBody = `{"rev":${account.rev},"save":${serialize(state)}}`;
  // O navegador só garante pedidos "keepalive" pequenos ao fechar a aba.
  if (keepalive && rawBody.length > 60_000) return;
  lastPush = now;
  inFlight = true;
  set({ sync: 'saving' });
  // Ao fechar a aba não dá tempo de compactar: vai direto (e só se for pequeno).
  const packed = keepalive ? Promise.resolve({ rawBody }) : packSave(rawBody);
  currentPush = packed
    .then((p) => api('/api/save', { method: 'PUT', ...p, keepalive }))
    .then((res) => {
      setLocalOwner(account.user?.name ?? '');
      setRev(res?.rev ?? account.rev);
      set({ sync: 'saved', syncedAt: Date.now(), message: null });
      if (res?.review) {
        showNotices(['Seu progresso foi salvo, mas veio de fora da nuvem (convidado ou arquivo importado) já avançado. Ele fica fora do ranking até a administração conferir.'], 'Perfil em análise');
      }
      showNotices(res?.notices);
    })
    .catch((err) => {
      if (err.status === 401) set({ user: null, sync: 'idle', message: 'Sua sessão expirou. Entre de novo para salvar na nuvem.' });
      else if (err.code === 'banned') {
        set({ user: null, sync: 'idle', message: null });
        setRev(null);
        showNotices([err.message], 'Conta banida');
      } else if (err.code === 'reload' || err.code === 'stale' || err.code === 'cheat') {
        reloadFromCloud(err.message, err.data?.notices);
      } else if (err.status === 429) {
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
