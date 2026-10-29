// Salvamento local, exportação/importação JSON e validação de saves.
// Nunca é chamado no servidor: todas as funções verificam `window`.
import { CONFIG, EQUIPMENT, PROFILES } from '../config.js';
import { validatePlacement, rectsOverlap, syncLayout, allZones } from '../grid/grid.js';
import { createNewGame } from './state.js';
import { POSTCARDS } from '../systems/characters.js';

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
  } catch {
    /* armazenamento indisponível: nada a fazer */
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
  // Terrenos gerados: retângulos válidos, sem sobreposição e dentro do limite.
  const P = CONFIG.grid.procedural;
  const extraZones = [];
  for (const z of arr(data.extraZones)) {
    if (!z || typeof z.id !== 'string' || !/^area-\d+$/.test(z.id)) continue;
    if (![z.x, z.y, z.w, z.h, z.cost].every(isNum)) continue;
    const rect = { x: Math.floor(z.x), y: Math.floor(z.y), w: Math.floor(z.w), h: Math.floor(z.h) };
    if (rect.x < 0 || rect.y < 0 || rect.w < 1 || rect.h < 1 || rect.w > 12 || rect.h > 12) continue;
    if (rect.x + rect.w > P.maxCoordinate || rect.y + rect.h > P.maxCoordinate) continue;
    if ([...CONFIG.grid.zones, ...extraZones].some((o) => o.id === z.id || rectsOverlap(o, rect))) continue;
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
  if (!state.unlockedZones.includes('garagem')) state.unlockedZones.unshift('garagem');
  state.fee = isNum(data.fee) ? Math.min(Math.max(data.fee, CONFIG.economy.feeSlider.min), CONFIG.economy.feeSlider.max) : base.fee;
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
    .slice(0, CONFIG.staff.maxStaff)
    .map((m) => ({ ...m, shifts: CONFIG.time.blocks.map((_, i) => m.shifts[i] === true) }));
  state.nextStaffId = Math.max(base.nextStaffId, ...state.staff.map((m) => m.id + 1));
  state.time.staffCleaned = isNum(state.time.staffCleaned) ? Math.max(0, Math.floor(state.time.staffCleaned)) : 0;
  state.time.staffFixed = isNum(state.time.staffFixed) ? Math.max(0, Math.floor(state.time.staffFixed)) : 0;
  state.dirt = arr(data.dirt).filter((d) => d && isNum(d.x) && isNum(d.y)).slice(0, CONFIG.cleaning.maxDirt);
  state.nextDirtId = Math.max(base.nextDirtId, ...state.dirt.map((d) => (isNum(d.id) ? d.id + 1 : 1)));

  for (const key of ['reports', 'reviews', 'cancellations', 'messages']) state[key] = arr(data[key]);
  state.pendingModals = arr(data.pendingModals).filter(
    (m) => m && ((m.kind === 'postcard' && POSTCARDS[m.id]) || (m.kind === 'vovo' && isNum(m.debt))),
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
