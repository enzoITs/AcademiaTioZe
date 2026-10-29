// Salvamento local, exportação/importação JSON e validação de saves.
// Nunca é chamado no servidor: todas as funções verificam `window`.
import { normalizeDecor } from '../systems/decor.js';
import { CONFIG, EQUIPMENT, PROFILES, MAX_ERA, eraDef } from '../config.js';
import { validatePlacement, rectsOverlap, syncLayout, allZones, baseZones } from '../grid/grid.js';
import { createNewGame } from './state.js';
import { POSTCARDS } from '../systems/characters.js';
import { feeLimits } from '../economy/economy.js';
import {
  STYLES, MAX_BRANCH_LEVEL, createNetwork, initNetwork, ensureLots, refreshCandidates, managerSalary,
} from '../systems/network.js';

export const SAVE_KEY = 'academia-tio-ze/save-v1';
export const SETTINGS_KEY = 'academia-tio-ze/settings';

const hasStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export function serialize(state) {
  return JSON.stringify({ ...state, savedAt: Date.now() });
}

export function saveToLocal(state) {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

export function readLocalRaw() {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

export function hasLocalSave() {
  return !!readLocalRaw();
}

export function clearLocal() {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
    window.localStorage.removeItem(OWNER_KEY);
  } catch {
    /* armazenamento indisponível: nada a fazer */
  }
}

const OWNER_KEY = 'academia-tio-ze/owner';

/** Apelido da conta dona do save deste navegador ('' = convidado, null = não se sabe). */
export function localOwner() {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export function setLocalOwner(name) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(OWNER_KEY, name ?? '');
  } catch {
    /* ignora */
  }
}

export function loadSettings() {
  if (!hasStorage()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function saveSettings(settings) {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignora */
  }
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const arr = (v) => (Array.isArray(v) ? v : []);
const int = (v, min, max, fallback) => (isNum(v) ? Math.min(Math.max(Math.floor(v), min), max) : fallback);

function parseManager(m) {
  if (!m || typeof m !== 'object') return null;
  const rating = int(m.rating, 1, 5, 3);
  return {
    id: int(m.id, 0, 1e9, 0),
    name: String(m.name ?? 'Gerente').slice(0, 30),
    rating,
    trait: String(m.trait ?? '').slice(0, 120),
    salary: isNum(m.salary) ? Math.max(0, m.salary) : managerSalary(rating),
  };
}

/** Rede (Era 4): filiais, lotes à venda e candidatos. Nula antes da Era 4. */
function parseNetwork(raw, state) {
  if (state.era < 4) return null;
  if (!raw || typeof raw !== 'object') return initNetwork(state);
  const net = createNetwork();
  const spots = new Set();
  const freeSpot = (gx, gy) => {
    const key = `${gx},${gy}`;
    if (spots.has(key)) return false;
    spots.add(key);
    return true;
  };
  for (const b of arr(raw.branches)) {
    if (!b || !isNum(b.id) || !STYLES[b.style] || !isNum(b.gx) || !isNum(b.gy)) continue;
    const gx = Math.floor(b.gx);
    const gy = Math.floor(b.gy);
    if (!freeSpot(gx, gy)) continue;
    net.branches.push({
      id: Math.floor(b.id),
      name: String(b.name ?? 'Filial').slice(0, 40),
      gx,
      gy,
      district: int(b.district, 0, 1e6, 0),
      style: b.style,
      level: int(b.level, 1, MAX_BRANCH_LEVEL, 1),
      manager: parseManager(b.manager),
      members: isNum(b.members) ? Math.max(0, b.members) : 0,
      invested: isNum(b.invested) ? Math.max(0, b.invested) : 0,
      openedDay: int(b.openedDay, 0, 1e9, 0),
    });
  }
  for (const l of arr(raw.lots)) {
    if (!l || typeof l.id !== 'string' || !/^lote-\d+$/.test(l.id) || !isNum(l.gx) || !isNum(l.gy)) continue;
    const gx = Math.floor(l.gx);
    const gy = Math.floor(l.gy);
    if (!freeSpot(gx, gy)) continue;
    net.lots.push({ id: l.id, gx, gy, district: int(l.district, 0, 1e6, 0) });
  }
  net.candidates = arr(raw.candidates).map(parseManager).filter(Boolean).slice(0, 6);
  net.opened = int(raw.opened, net.branches.length, 1e6, net.branches.length);
  net.nextBranchId = Math.max(int(raw.nextBranchId, 1, 1e9, 1), ...net.branches.map((b) => b.id + 1));
  net.nextLotNum = Math.max(int(raw.nextLotNum, 1, 1e9, 1), ...net.lots.map((l) => Number(l.id.slice(5)) + 1));
  net.nextCandidateId = Math.max(int(raw.nextCandidateId, 1, 1e9, 1), ...net.candidates.map((c) => c.id + 1));
  state.network = net;
  ensureLots(state);
  refreshCandidates(state);
  return net;
}

/**
 * Valida e normaliza um save. Lança Error com mensagem amigável se for inválido.
 * Campos opcionais ausentes são preenchidos com os valores de uma partida nova.
 */
export function parseSave(text) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('O arquivo não é um JSON válido.');
  }
  if (!data || typeof data !== 'object') throw new Error('Save vazio ou corrompido.');
  if (data.saveVersion !== CONFIG.saveVersion) throw new Error('Versão de save incompatível.');
  if (!isNum(data.money)) throw new Error('Save sem saldo válido.');
  if (!data.time || !isNum(data.time.day) || data.time.day < 0) throw new Error('Save sem tempo de jogo válido.');

  const base = createNewGame(isNum(data.seed) ? data.seed : 1);
  const state = { ...base, ...data };
  state.time = { ...base.time, ...data.time };
  state.time.block = Math.min(Math.max(0, Math.floor(state.time.block)), CONFIG.time.blocks.length - 1);
  state.time.blockProgress = Math.min(Math.max(0, state.time.blockProgress), 0.999);
  state.time.speedIndex = Math.min(Math.max(0, Math.floor(state.time.speedIndex)), CONFIG.time.speeds.length - 1);
  state.rng = data.rng && isNum(data.rng.s) ? { s: data.rng.s >>> 0 } : base.rng;
  state.era = Number.isInteger(data.era) && data.era >= 1 && data.era <= MAX_ERA ? data.era : 1;
  state.closedDay = isNum(data.closedDay) ? Math.floor(data.closedDay) : null;
  // Terrenos gerados: retângulos válidos, sem sobreposição e dentro do limite.
  const P = CONFIG.grid.procedural;
  const shiftOf = (v) => (isNum(v) ? Math.min(Math.max(0, Math.floor(v)), P.maxCoordinate) : 0);
  state.shift = { x: shiftOf(data.shift?.x), y: shiftOf(data.shift?.y) };
  const extraZones = [];
  for (const z of arr(data.extraZones)) {
    if (!z || typeof z.id !== 'string' || !/^area-\d+$/.test(z.id)) continue;
    if (![z.x, z.y, z.w, z.h, z.cost].every(isNum)) continue;
    const rect = { x: Math.floor(z.x), y: Math.floor(z.y), w: Math.floor(z.w), h: Math.floor(z.h) };
    if (rect.x < 0 || rect.y < 0 || rect.w < 1 || rect.h < 1 || rect.w > 12 || rect.h > 12) continue;
    if (rect.x + rect.w > P.maxCoordinate || rect.y + rect.h > P.maxCoordinate) continue;
    if ([...baseZones(state), ...extraZones].some((o) => o.id === z.id || rectsOverlap(o, rect))) continue;
    extraZones.push({
      id: z.id,
      label: String(z.label ?? 'Área').slice(0, 40),
      description: String(z.description ?? '').slice(0, 160),
      ...rect,
      cost: Math.max(0, Math.round(z.cost)),
      requires: typeof z.requires === 'string' ? z.requires : null,
      procedural: true,
    });
  }
  state.extraZones = extraZones;
  state.nextZoneNum = Math.max(
    isNum(data.nextZoneNum) ? Math.floor(data.nextZoneNum) : 1,
    ...extraZones.map((z) => Number(z.id.slice(5)) + 1),
  );
  syncLayout(state);
  const knownZones = new Set(allZones(state).map((z) => z.id));
  state.unlockedZones = [...new Set(arr(data.unlockedZones).filter((z) => knownZones.has(z)))];
  for (const z of baseZones(state)) if (z.startsUnlocked && !state.unlockedZones.includes(z.id)) state.unlockedZones.unshift(z.id);
  const fee = feeLimits(state.era);
  state.fee = isNum(data.fee) ? Math.min(Math.max(data.fee, fee.min), fee.max) : base.fee;
  state.reputation = isNum(data.reputation) ? Math.min(Math.max(data.reputation, 0), 5) : base.reputation;

  // Equipamentos: tipo conhecido, posição válida e sem colisão.
  const items = [];
  for (const raw of arr(data.items)) {
    if (!raw || !EQUIPMENT[raw.type] || !isNum(raw.x) || !isNum(raw.y) || !isNum(raw.id)) continue;
    const tier = EQUIPMENT[raw.type].tiers.some((t) => t.id === raw.tier) ? raw.tier : EQUIPMENT[raw.type].tiers[0].id;
    const item = {
      ...raw,
      tier,
      rot: [0, 1, 2, 3].includes(raw.rot) ? raw.rot : 0,
      condition: isNum(raw.condition) ? Math.min(Math.max(raw.condition, 0), 100) : 100,
      pricePaid: isNum(raw.pricePaid) ? raw.pricePaid : 0,
      purchasedDay: isNum(raw.purchasedDay) ? raw.purchasedDay : 0,
      level: isNum(raw.level) ? Math.min(Math.max(1, Math.floor(raw.level)), CONFIG.levels.max) : 1,
      upgradeSpent: isNum(raw.upgradeSpent) ? Math.max(0, raw.upgradeSpent) : 0,
    };
    const check = validatePlacement({ ...state, items }, item);
    if (check.ok) items.push(item);
  }
  state.items = items;
  state.nextItemId = Math.max(base.nextItemId, ...items.map((i) => i.id + 1));

  state.students = arr(data.students).filter((s) => s && PROFILES[s.profile] && isNum(s.S) && s.look)
    .map((s) => ({ ...s, S: Math.min(Math.max(s.S, 0), 100), mania: CONFIG.manias[s.mania] ? s.mania : Object.keys(CONFIG.manias)[0] }));
  state.nextStudentId = Math.max(base.nextStudentId, ...state.students.map((s) => s.id + 1));
  state.staff = arr(data.staff)
    .filter((m) => m && isNum(m.id) && CONFIG.staff.roles[m.role] && m.look && Array.isArray(m.shifts))
    .slice(0, eraDef(state.era).maxStaff ?? CONFIG.staff.maxStaff)
    .map((m) => ({ ...m, shifts: CONFIG.time.blocks.map((_, i) => m.shifts[i] === true) }));
  state.nextStaffId = Math.max(base.nextStaffId, ...state.staff.map((m) => m.id + 1));
  state.network = parseNetwork(data.network, state);
  state.decor = normalizeDecor(data.decor);
  state.time.staffCleaned = isNum(state.time.staffCleaned) ? Math.max(0, Math.floor(state.time.staffCleaned)) : 0;
  state.time.staffFixed = isNum(state.time.staffFixed) ? Math.max(0, Math.floor(state.time.staffFixed)) : 0;
  state.dirt = arr(data.dirt).filter((d) => d && isNum(d.x) && isNum(d.y)).slice(0, CONFIG.cleaning.maxDirt);
  state.nextDirtId = Math.max(base.nextDirtId, ...state.dirt.map((d) => (isNum(d.id) ? d.id + 1 : 1)));

  for (const key of ['reports', 'reviews', 'cancellations', 'messages']) state[key] = arr(data[key]);
  state.pendingModals = arr(data.pendingModals).filter(
    (m) => m && ((m.kind === 'postcard' && POSTCARDS[m.id]) || (m.kind === 'vovo' && isNum(m.debt))
      || (m.kind === 'era' && m.era === state.era)),
  );
  state.ledger = data.ledger && typeof data.ledger === 'object' && data.ledger.totals ? data.ledger : base.ledger;
  state.ledger.log = arr(state.ledger.log);
  state.milestones = data.milestones && typeof data.milestones === 'object' ? data.milestones : {};
  state.stats = { ...base.stats, ...(data.stats ?? {}) };
  state.dayExposure = { ...base.dayExposure, ...(data.dayExposure ?? {}) };
  state.dayCategoryQueue = { ...base.dayCategoryQueue, ...(data.dayCategoryQueue ?? {}) };
  state.undo = [];
  state.savedAt = isNum(data.savedAt) ? data.savedAt : Date.now();
  return state;
}

export function downloadJSON(state) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([serialize(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `academia-tio-ze-dia-${state.time.day + 1}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
