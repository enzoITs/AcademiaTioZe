// Store central: fonte única de verdade para o canvas e para o React.
// - `game.state`: partida serializável (salva).
// - `game.rt`: dados derivados (avaliação da academia, bloco atual).
// - `game.ui`: estado de interface (modo, seleção, painéis), não salvo.
// O React assina via useSyncExternalStore(subscribe, getVersion).
import { CONFIG, EQUIPMENT, getEquipmentDef, getTierDef } from '../config.js';
import { createNewGame } from './state.js';
import { createRuntime, refreshDerived, advanceTime, catchUpOffline } from '../simulation/simulation.js';
import {
  validatePlacement, footprintSize, buildOccupancy, cellIndex, inBounds, allZones, zoneById, layoutShift,
} from '../grid/grid.js';
import { computeAccess } from '../pathfinding/floodFill.js';
import { transact, canAfford, feeLimits } from '../economy/economy.js';
import {
  repairCost, serviceCost, repairItem, serviceItem, canRepair, canService, conditionState, hasWear,
  levelUpCost, itemLevel, levelDef,
} from '../systems/maintenance.js';
import { grantNovelty } from '../simulation/students.js';
import { checkMilestones, wheyTip, addMessage } from '../systems/characters.js';
import { buildSuggestions, isTypeLocked } from '../systems/suggestions.js';
import { createStaffMember, hireBlocker, roleDef } from '../systems/staff.js';
import { canMoveEra, performEraMove } from '../systems/eras.js';
import { ensureFrontier } from '../systems/expansion.js';
import {
  STYLES, openBlocker, openBranch, upgradeBranch, branchUpgradeCost, changeBranchStyle, swapManager,
  sellBranch, branchSaleValue,
} from '../systems/network.js';
import {
  saveToLocal, readLocalRaw, parseSave, downloadJSON, loadSettings, saveSettings, clearLocal,
} from './persistence.js';
import { playSound, setSoundEnabled } from '../audio/sfx.js';
import { formatMoney } from '../utils/format.js';
import { EQUIPMENT_SHORT, FINALLY_LINES, BRANCH_LINES } from '../content/lines.js';

const AUTOSAVE_SECONDS = 15;

const listeners = new Set();
let version = 0;
let autosaveTimer = 0;
let toastId = 1;
let suggestionCache = { key: null, value: null };

export const game = {
  state: null,
  rt: null,
  ui: createUi(),
};

function createUi() {
  return {
    screen: 'title',
    mode: 'normal', // normal | place | move
    placing: null, // { type, tier, rot }
    moving: null, // { id, rot }
    hover: null, // { x, y } célula sob o cursor
    selectedId: null,
    editMode: false,
    maintenanceView: false,
    tab: 'shop',
    shopFilter: 'all',
    modal: null, // { kind: 'menu' | 'offline' | 'report', ... }
    confirm: null, // { title, text, confirmLabel, danger, onConfirm }
    toasts: [],
    fx: [], // efeitos visuais consumidos pelo renderer
    wheyBubble: null,
    soundOn: true,
  };
}

// ---------------------------------------------------------------- assinatura
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVersion() {
  return version;
}

export function emit() {
  version += 1;
  for (const fn of listeners) fn();
}

// ---------------------------------------------------------------- utilidades
function toast(text, tone = 'info') {
  const t = { id: toastId++, text, tone };
  game.ui.toasts = [...game.ui.toasts.slice(-3), t];
  return t;
}

export function dismissToast(id) {
  game.ui.toasts = game.ui.toasts.filter((t) => t.id !== id);
  emit();
}

function fx(effect) {
  game.ui.fx.push({ ...effect, t0: typeof performance !== 'undefined' ? performance.now() : 0 });
}

function fail(text) {
  playSound('error');
  toast(text, 'error');
  emit();
  return false;
}

export function notifyError(text) {
  return fail(text);
}

function itemById(id) {
  return game.state.items.find((i) => i.id === id) ?? null;
}

export function getSuggestions() {
  const { state, rt } = game;
  if (!state || !rt) return null;
  const key = rt.academy;
  if (suggestionCache.key !== key) suggestionCache = { key, value: buildSuggestions(state, rt.academy) };
  return suggestionCache.value;
}

export function isModalOpen() {
  const { ui, state } = game;
  return !!(ui.confirm || ui.modal || state?.pendingModals.length);
}

/** Recalcula derivados e premia necessidades recém-atendidas ("Finalmente!"). */
function afterLayoutChange() {
  const { state, rt } = game;
  const before = rt.academy.metTypes;
  refreshDerived(state, rt);
  const newly = [...rt.academy.metTypes].filter((t) => !before.has(t));
  for (const type of newly) {
    const affected = grantNovelty(state, type);
    if (affected.length) {
      fx({ kind: 'finally', type, text: FINALLY_LINES[state.time.day % FINALLY_LINES.length], count: affected.length });
      toast(`${affected.length} aluno(s) comemoram: ${EQUIPMENT_SHORT[type]} chegou! (+bônus de novidade)`, 'success');
      playSound('celebrate');
    }
  }
  checkMilestones(state, rt.academy);
}

// ---------------------------------------------------------------- partida
function startWith(state, offlineSeconds = 0) {
  game.state = state;
  // Saves antigos que já compraram tudo ganham um terreno novo à venda.
  ensureFrontier(state);
  game.rt = createRuntime(state);
  const settings = loadSettings();
  game.ui = { ...createUi(), screen: 'game', soundOn: settings.soundOn !== false };
  setSoundEnabled(game.ui.soundOn);
  if (offlineSeconds > CONFIG.time.offlineThresholdSeconds) {
    const summary = catchUpOffline(state, game.rt, offlineSeconds);
    if (summary) game.ui.modal = { kind: 'offline', summary };
  }
  checkMilestones(state, game.rt.academy);
  autosaveTimer = 0;
  emit();
}

export function newGame() {
  clearLocal();
  startWith(createNewGame());
  saveToLocal(game.state);
}

export function continueGame() {
  const raw = readLocalRaw();
  if (!raw) return fail('Nenhum jogo salvo encontrado.');
  try {
    const state = parseSave(raw);
    startWith(state, (Date.now() - state.savedAt) / 1000);
    return true;
  } catch (err) {
    return fail(`Não foi possível carregar o save: ${err.message}`);
  }
}

export function importSave(text) {
  try {
    const state = parseSave(text);
    startWith(state);
    saveToLocal(state);
    toast('Partida importada com sucesso.', 'success');
    emit();
    return true;
  } catch (err) {
    return fail(`Importação recusada: ${err.message}`);
  }
}

export function exportSave() {
  if (!game.state) return;
  downloadJSON(game.state);
  toast('Arquivo JSON exportado.', 'success');
  emit();
}

export function saveNow(silent = false) {
  if (!game.state) return;
  const ok = saveToLocal(game.state);
  game.state.savedAt = Date.now();
  if (!silent) {
    toast(ok ? 'Jogo salvo neste navegador.' : 'Não foi possível salvar (armazenamento bloqueado).', ok ? 'success' : 'error');
    emit();
  }
}

export function backToTitle() {
  saveNow(true);
  game.ui = { ...createUi(), screen: 'title' };
  emit();
}

// ---------------------------------------------------------------- tempo
export function tick(dtSeconds) {
  const { state, rt, ui } = game;
  if (!state || ui.screen !== 'game') return;

  // Aba escondida ou computador suspenso: trata como progresso offline.
  if (dtSeconds > CONFIG.time.offlineThresholdSeconds) {
    const summary = catchUpOffline(state, rt, dtSeconds);
    if (summary && summary.days >= 0.5) ui.modal = { kind: 'offline', summary };
    emit();
    return;
  }

  autosaveTimer += dtSeconds;
  if (autosaveTimer >= AUTOSAVE_SECONDS) {
    autosaveTimer = 0;
    saveNow(true);
  }

  if (state.time.paused || isModalOpen()) return;
  const speed = CONFIG.time.speeds[state.time.speedIndex];
  if (!speed) return;
  const events = advanceTime(state, rt, (dtSeconds * speed) / CONFIG.time.secondsPerDay);
  if (events.length) {
    handleEvents(events);
    emit();
  }
}

function handleEvents(events) {
  const cancels = events.filter((e) => e.type === 'cancel');
  for (const e of events) {
    if (e.type === 'broken') {
      toast(`O ${EQUIPMENT_SHORT[e.itemType]} quebrou! O Whey está encarando ele.`, 'error');
      playSound('error');
    }
    if (e.type === 'joined') toast(`+${e.count} matrícula${e.count > 1 ? 's' : ''} hoje!`, 'success');
    if (e.type === 'month') {
      toast(`Mês fechado: resultado ${formatMoney(e.report.result)}. Veja em Finanças.`, e.report.result >= 0 ? 'success' : 'warn');
      playSound('notify');
    }
    if (e.type === 'vovo') playSound('notify');
    if (e.type === 'staffClean') for (const d of e.dirt) fx({ kind: 'clean', x: d.x, y: d.y, quiet: true });
    if (e.type === 'staffRepair') {
      for (const f of e.items) fx({ kind: 'repair', itemId: f.itemId });
      const broken = e.items.filter((f) => f.broken);
      if (broken.length) toast(`A equipe técnica consertou: ${broken.map((f) => EQUIPMENT_SHORT[f.type]).join(', ')}.`, 'success');
    }
  }
  if (cancels.length === 1) toast(`${cancels[0].entry.name} saiu: "${cancels[0].entry.quote}"`, 'warn');
  if (cancels.length > 1) toast(`${cancels.length} cancelamentos hoje. Veja os motivos na aba Alunos.`, 'warn');
}

export function setSpeed(index) {
  const t = game.state.time;
  if (index === 0) t.paused = true;
  else {
    t.paused = false;
    t.speedIndex = index;
  }
  playSound('click');
  emit();
}

export function togglePause() {
  const t = game.state.time;
  t.paused = !t.paused;
  if (!t.paused && t.speedIndex === 0) t.speedIndex = 1;
  emit();
}

// ---------------------------------------------------------------- construção
export function anchorFor(type, rot, cell) {
  const { w, h } = footprintSize(type, rot);
  return { x: cell.x - Math.floor((w - 1) / 2), y: cell.y - Math.floor((h - 1) / 2) };
}

/** Prévia do posicionamento atual (para o renderer e a barra de status). */
export function placementPreview() {
  const { ui, state } = game;
  if (!ui.hover || (ui.mode !== 'place' && ui.mode !== 'move')) return null;
  const type = ui.mode === 'place' ? ui.placing.type : itemById(ui.moving.id)?.type;
  if (!type) return null;
  const rot = ui.mode === 'place' ? ui.placing.rot : ui.moving.rot;
  const ignoreId = ui.mode === 'move' ? ui.moving.id : null;
  // Ao arrastar, o aparelho mantém o ponto onde foi "agarrado" sob o cursor.
  const grab = ui.mode === 'move' ? ui.moving.grab : null;
  const { x, y } = grab ? { x: ui.hover.x - grab.dx, y: ui.hover.y - grab.dy } : anchorFor(type, rot, ui.hover);
  const check = validatePlacement(state, { type, x, y, rot }, ignoreId);
  const warning = check.ok ? accessWarning(state, { type, x, y, rot }, ignoreId) : null;
  return { type, x, y, rot, ...check, warning };
}

/** Simula o layout para avisar sobre acesso (o item ou outros ficam sem corredor). */
function accessWarning(state, { type, x, y, rot }, ignoreId) {
  const temp = state.items.filter((i) => i.id !== ignoreId).concat({ id: -999, type, x, y, rot });
  const access = computeAccess(state.unlockedZones, temp);
  if (!access.reachable.has(-999)) return 'Sem corredor até a frente: ficará inutilizável';
  const blocked = temp.filter((i) => i.id !== -999 && !access.reachable.has(i.id) && game.rt.academy.access.reachable.has(i.id));
  return blocked.length ? `Bloqueia o acesso a: ${blocked.map((i) => EQUIPMENT_SHORT[i.type]).join(', ')}` : null;
}

export function setHover(cell) {
  const prev = game.ui.hover;
  if (prev && cell && prev.x === cell.x && prev.y === cell.y) return;
  if (!prev && !cell) return;
  game.ui.hover = cell;
  if (game.ui.mode !== 'normal') emit();
}

export function startPlacement(type, tierId) {
  const { state, ui } = game;
  const def = getEquipmentDef(type);
  const tier = getTierDef(type, tierId);
  if ((def.minEra ?? 1) > state.era) return fail(`Bloqueado: chega na Era ${def.minEra}.`);
  if (isTypeLocked(type, state.reputation, state.era) || (tier.minRep ?? 0) > state.reputation) {
    return fail(`Bloqueado: precisa de ${Math.max(def.minRep ?? 0, tier.minRep ?? 0)} estrelas de reputação.`);
  }
  if (!canAfford(state, tier.price)) return fail(`Saldo insuficiente para ${def.name} (${formatMoney(tier.price)}).`);
  ui.mode = 'place';
  ui.placing = { type, tier: tier.id, rot: 0 };
  ui.moving = null;
  ui.selectedId = null;
  playSound('click');
  emit();
  return true;
}

export function cancelMode() {
  const { ui } = game;
  if (ui.mode !== 'normal') {
    ui.mode = 'normal';
    ui.placing = null;
    ui.moving = null;
  } else if (ui.selectedId) ui.selectedId = null;
  else if (ui.editMode) ui.editMode = false;
  emit();
}

/**
 * Giro no lugar de um aparelho já colocado. Gira em torno do centro (não do
 * canto), e se a nova forma não couber ali procura o encaixe livre mais
 * próximo (até 2 células), preferindo um que não feche o corredor de ninguém
 * (se só couber fechando, gira e avisa). Se 90° não couber em lugar nenhum,
 * tenta 180° e 270°.
 */
function findRotation(state, item) {
  const { w, h } = footprintSize(item.type, item.rot);
  const cx = item.x + w / 2;
  const cy = item.y + h / 2;
  let firstReason = null;
  let fallback = null;
  for (let turn = 1; turn < 4; turn++) {
    const rot = (item.rot + turn) % 4;
    const size = footprintSize(item.type, rot);
    const ix = cx - size.w / 2;
    const iy = cy - size.h / 2;
    const candidates = [];
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const x = Math.round(ix) + dx;
        const y = Math.round(iy) + dy;
        // Empate: fica o mais perto do canto atual (girar 4× volta ao início).
        candidates.push({ x, y, d: Math.hypot(x - ix, y - iy) + Math.hypot(x - item.x, y - item.y) * 0.01 });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    for (const c of candidates) {
      const spot = { type: item.type, x: c.x, y: c.y, rot };
      const check = validatePlacement(state, spot, item.id);
      if (!check.ok) {
        firstReason ??= check.reason;
        continue;
      }
      const warning = accessWarning(state, spot, item.id);
      if (!warning) return { ok: true, x: c.x, y: c.y, rot };
      fallback ??= { ok: true, x: c.x, y: c.y, rot, warning };
    }
    if (fallback) return fallback;
  }
  return { ok: false, reason: firstReason ?? 'Sem espaço' };
}

export function rotate() {
  const { ui, state } = game;
  if (ui.mode === 'place') ui.placing.rot = (ui.placing.rot + 1) % 4;
  else if (ui.mode === 'move') {
    ui.moving.rot = (ui.moving.rot + 1) % 4;
    ui.moving.grab = null; // a pega muda de lugar ao girar: recentra no cursor
  } else if (ui.selectedId) {
    const item = itemById(ui.selectedId);
    if (!item) return;
    const spot = findRotation(state, item);
    if (!spot.ok) return fail(`Não dá para girar aqui: ${spot.reason.toLowerCase()}.`);
    state.undo.push({ kind: 'move', itemId: item.id, from: { x: item.x, y: item.y, rot: item.rot } });
    Object.assign(item, { x: spot.x, y: spot.y, rot: spot.rot });
    fx({ kind: 'place', itemId: item.id });
    afterLayoutChange();
    if (spot.warning) toast(spot.warning, 'warn');
  } else return;
  playSound('rotate');
  emit();
}

function placeNewItem(preview) {
  const { state, ui } = game;
  const tier = getTierDef(preview.type, ui.placing.tier);
  if (!canAfford(state, tier.price)) return fail('Saldo insuficiente.');
  const item = {
    id: state.nextItemId++,
    type: preview.type,
    tier: tier.id,
    x: preview.x,
    y: preview.y,
    rot: preview.rot,
    condition: CONFIG.tiers[tier.id].startCondition,
    purchasedDay: state.time.day,
    pricePaid: tier.price,
    usesRecent: 0,
  };
  state.items.push(item);
  transact(state, -tier.price, 'equipamentos', `Compra: ${getEquipmentDef(item.type).name} (${CONFIG.tiers[tier.id].label})`);
  state.undo.push({ kind: 'place', itemId: item.id });
  fx({ kind: 'place', itemId: item.id });
  fx({ kind: 'money', x: item.x, y: item.y, text: `-${formatMoney(tier.price)}` });
  playSound('place');
  ui.mode = 'normal';
  ui.placing = null;
  ui.selectedId = item.id;
  afterLayoutChange();
  if (preview.warning) toast(preview.warning, 'warn');
  return true;
}

function dropMovedItem(preview) {
  const { state, ui } = game;
  const item = itemById(ui.moving.id);
  if (!item) return false;
  ui.mode = 'normal';
  ui.moving = null;
  ui.selectedId = item.id;
  // Soltou no mesmo lugar: nada mudou, nada para desfazer.
  if (item.x === preview.x && item.y === preview.y && item.rot === preview.rot) return true;
  state.undo.push({ kind: 'move', itemId: item.id, from: { x: item.x, y: item.y, rot: item.rot } });
  Object.assign(item, { x: preview.x, y: preview.y, rot: preview.rot });
  fx({ kind: 'place', itemId: item.id });
  playSound('place');
  afterLayoutChange();
  if (preview.warning) toast(preview.warning, 'warn');
  return true;
}

/** Fim do arrastar: solta se couber; senão o aparelho volta para onde estava. */
export function dropDrag(cell) {
  const { ui } = game;
  if (ui.mode !== 'move') return;
  ui.hover = cell;
  const preview = placementPreview();
  if (!preview || !preview.ok) {
    ui.mode = 'normal';
    ui.selectedId = ui.moving.id;
    ui.moving = null;
    return fail(preview ? `Não coube aí (${preview.reason.toLowerCase()}). O aparelho voltou para o lugar.` : 'Movimento cancelado.');
  }
  dropMovedItem(preview);
  emit();
  return true;
}

/** Empurra o aparelho selecionado uma célula (setas do teclado). */
export function nudgeSelected(dx, dy) {
  const { state, ui } = game;
  const item = ui.mode === 'normal' ? itemById(ui.selectedId) : null;
  if (!item) return false;
  const next = { type: item.type, x: item.x + dx, y: item.y + dy, rot: item.rot };
  const check = validatePlacement(state, next, item.id);
  if (!check.ok) return fail(`Não dá para mover para lá: ${check.reason.toLowerCase()}.`);
  state.undo.push({ kind: 'move', itemId: item.id, from: { x: item.x, y: item.y, rot: item.rot } });
  item.x = next.x;
  item.y = next.y;
  playSound('rotate');
  afterLayoutChange();
  emit();
  return true;
}

export function clickCell(cell) {
  const { ui, state } = game;
  if (ui.mode === 'place' || ui.mode === 'move') {
    ui.hover = cell;
    const preview = placementPreview();
    if (!preview) return;
    if (!preview.ok) return fail(preview.reason);
    if (ui.mode === 'place') placeNewItem(preview);
    else dropMovedItem(preview);
    emit();
    return;
  }
  if (!inBounds(cell.x, cell.y)) {
    ui.selectedId = null;
    emit();
    return;
  }
  const occ = buildOccupancy(state.items);
  const id = occ[cellIndex(cell.x, cell.y)];
  ui.selectedId = id >= 0 ? id : null;
  if (id >= 0) playSound('click');
  emit();
}

export function selectItem(id) {
  game.ui.selectedId = id;
  emit();
}

export function toggleEditMode() {
  const { ui } = game;
  ui.editMode = !ui.editMode;
  playSound('click');
  emit();
}

export function toggleMaintenanceView() {
  game.ui.maintenanceView = !game.ui.maintenanceView;
  playSound('click');
  emit();
}

/**
 * Começa a mover um aparelho (grátis, sem precisar do modo edição).
 * `grabCell`: célula onde o jogador agarrou, para o arrastar não dar "pulo".
 */
export function startMove(id, grabCell = null) {
  const { ui } = game;
  const item = itemById(id);
  if (!item) return;
  ui.mode = 'move';
  ui.placing = null;
  ui.moving = {
    id,
    rot: item.rot,
    origin: { x: item.x, y: item.y, rot: item.rot },
    grab: grabCell ? { dx: grabCell.x - item.x, dy: grabCell.y - item.y } : null,
  };
  if (grabCell) ui.hover = grabCell;
  else {
    // Pelo botão: o aparelho segue o cursor pelo centro e começa exatamente onde está.
    const { w, h } = footprintSize(item.type, item.rot);
    ui.hover = { x: item.x + Math.floor((w - 1) / 2), y: item.y + Math.floor((h - 1) / 2) };
  }
  playSound('click');
  emit();
}

/**
 * Reembolso: total no mesmo dia da compra; depois, 50% ajustado pela condição.
 * As melhorias de nível entram no valor (`withLevels`); na troca de categoria
 * (usado → novo) elas ficam no aparelho, então só a base entra como pagamento.
 */
export function refundFor(item, { withLevels = true } = {}) {
  const spent = withLevels ? (item.upgradeSpent ?? 0) : 0;
  if (item.purchasedDay === game.state.time.day) return item.pricePaid + spent;
  const price = getTierDef(item.type, item.tier).price + spent;
  const condFactor = hasWear(item) ? item.condition / 100 : 1;
  return Math.round(price * CONFIG.economy.sellRefundRate * condFactor);
}

export function requestSell(id) {
  const item = itemById(id);
  if (!item) return;
  const refund = refundFor(item);
  const sameDay = item.purchasedDay === game.state.time.day;
  game.ui.confirm = {
    title: `Vender ${getEquipmentDef(item.type).name}?`,
    text: sameDay
      ? `Comprado hoje: reembolso total de ${formatMoney(refund)}.`
      : `Você recebe ${formatMoney(refund)} (50% do preço${item.upgradeSpent ? ' e das melhorias' : ''}, ajustado pela condição). Dá para desfazer até o fim do dia.`,
    confirmLabel: 'Vender',
    danger: true,
    onConfirm: () => sellItem(id),
  };
  emit();
}

function sellItem(id) {
  const { state, ui } = game;
  const item = itemById(id);
  if (!item) return;
  const refund = refundFor(item);
  const sameDay = item.purchasedDay === state.time.day;
  state.items = state.items.filter((i) => i.id !== id);
  transact(state, refund, sameDay ? 'reembolsos' : 'vendas', `${sameDay ? 'Reembolso' : 'Venda'}: ${getEquipmentDef(item.type).name}`);
  state.undo.push({ kind: 'sell', item: { ...item }, refund, sameDay });
  fx({ kind: 'money', x: item.x, y: item.y, text: `+${formatMoney(refund)}` });
  playSound('sell');
  ui.selectedId = null;
  afterLayoutChange();
  emit();
}

export function upgradeItem(id, tierId) {
  const { state } = game;
  const item = itemById(id);
  if (!item) return;
  const tier = getTierDef(item.type, tierId);
  if ((tier.minRep ?? 0) > state.reputation) return fail(`Precisa de ${tier.minRep} estrelas para o nível ${CONFIG.tiers[tier.id].label}.`);
  const tradeIn = refundFor(item, { withLevels: false });
  const cost = Math.max(0, tier.price - tradeIn);
  if (!canAfford(state, cost)) return fail(`Saldo insuficiente para o upgrade (${formatMoney(cost)}).`);
  state.undo.push({ kind: 'upgrade', itemId: id, from: { tier: item.tier, condition: item.condition, pricePaid: item.pricePaid, purchasedDay: item.purchasedDay }, cost });
  transact(state, -cost, 'equipamentos', `Upgrade: ${getEquipmentDef(item.type).name} → ${CONFIG.tiers[tier.id].label}`);
  item.tier = tier.id;
  item.condition = CONFIG.tiers[tier.id].startCondition;
  item.pricePaid = tier.price;
  item.purchasedDay = state.time.day;
  fx({ kind: 'place', itemId: id });
  fx({ kind: 'money', x: item.x, y: item.y, text: `-${formatMoney(cost)}` });
  playSound('buy');
  afterLayoutChange();
  emit();
}

/** Melhoria de nível (1 → 2 → 3): mais capacidade e vibe, menos desgaste; conserto mais caro. */
export function levelUpItem(id) {
  const { state } = game;
  const item = itemById(id);
  if (!item) return;
  const cost = levelUpCost(item);
  if (cost == null) return fail('Este aparelho já está no nível máximo.');
  if (!canAfford(state, cost)) return fail(`Saldo insuficiente para a melhoria (${formatMoney(cost)}).`);
  const from = { level: itemLevel(item), upgradeSpent: item.upgradeSpent ?? 0 };
  const next = from.level + 1;
  transact(state, -cost, 'equipamentos', `Melhoria: ${getEquipmentDef(item.type).name} → ${levelDef(next).label}`);
  item.level = next;
  item.upgradeSpent = from.upgradeSpent + cost;
  state.undo.push({ kind: 'level', itemId: id, from, cost });
  fx({ kind: 'place', itemId: id });
  fx({ kind: 'money', x: item.x, y: item.y, text: `-${formatMoney(cost)}` });
  toast(`${getEquipmentDef(item.type).name} agora é ${levelDef(next).label}! Conserto custa ${String(levelDef(next).repairMultiplier).replace('.', ',')}× mais.`, 'success');
  playSound('buy');
  afterLayoutChange();
  emit();
}

export function repair(id, mode = 'repair') {
  const { state } = game;
  const item = itemById(id);
  if (!item) return;
  const isRepair = mode === 'repair';
  if (isRepair ? !canRepair(item) : !canService(item)) return fail('Nada a fazer neste aparelho agora.');
  const cost = isRepair ? repairCost(item) : serviceCost(item);
  if (!canAfford(state, cost)) return fail(`Saldo insuficiente (${formatMoney(cost)}).`);
  transact(state, -cost, 'consertos', `${isRepair ? 'Conserto' : 'Revisão'}: ${getEquipmentDef(item.type).name}`);
  if (isRepair) repairItem(item);
  else serviceItem(item);
  state.stats.repairs += 1;
  fx({ kind: 'repair', itemId: id });
  fx({ kind: 'money', x: item.x, y: item.y, text: `-${formatMoney(cost)}` });
  playSound('repair');
  afterLayoutChange();
  emit();
}

export function repairAllBroken() {
  const broken = game.state.items.filter((i) => hasWear(i) && conditionState(i.condition) === 'quebrado');
  for (const item of broken) repair(item.id, 'repair');
}

// ---------------------------------------------------------------- limpeza
export function cleanDirt(id) {
  const { state, rt } = game;
  const dirt = state.dirt.find((d) => d.id === id);
  if (!dirt) return;
  state.dirt = state.dirt.filter((d) => d.id !== id);
  state.stats.cleaned += 1;
  fx({ kind: 'clean', x: dirt.x, y: dirt.y });
  playSound('clean');
  refreshDerived(state, rt);
  emit();
}

// ---------------------------------------------------------------- ampliações
/** Situação de cada terreno: comprado, disponível ou aguardando o pré-requisito. */
export function zoneStatuses() {
  const { state } = game;
  const zones = allZones(state);
  return zones.map((zone) => {
    const owned = state.unlockedZones.includes(zone.id);
    const requirement = zone.requires ? zones.find((z) => z.id === zone.requires) : null;
    const blocked = !owned && !!requirement && !state.unlockedZones.includes(requirement.id);
    return {
      ...zone,
      tiles: zone.w * zone.h,
      status: owned ? 'owned' : blocked ? 'blocked' : 'available',
      requirement,
      affordable: state.money >= zone.cost,
    };
  });
}

export function openExpansions() {
  game.ui.selectedId = null;
  openModal({ kind: 'expansions' });
}

export function requestUnlockZone(zoneId) {
  const { state } = game;
  const zone = zoneById(zoneId);
  if (!zone || state.unlockedZones.includes(zoneId)) return;
  if (zone.requires && !state.unlockedZones.includes(zone.requires)) {
    return fail(`Amplie primeiro: ${zoneById(zone.requires)?.label ?? 'a área ao lado'}.`);
  }
  game.ui.confirm = {
    title: `Ampliar: ${zone.label} (${zone.w}×${zone.h})`,
    text: `Custa ${formatMoney(zone.cost)} e adiciona ${zone.w * zone.h} tiles à academia.`,
    confirmLabel: `Ampliar por ${formatMoney(zone.cost)}`,
    disabled: !canAfford(state, zone.cost),
    onConfirm: () => unlockZone(zoneId),
  };
  emit();
}

function unlockZone(zoneId) {
  const { state } = game;
  const zone = zoneById(zoneId);
  if (!zone || state.unlockedZones.includes(zoneId)) return;
  if (!canAfford(state, zone.cost)) return fail('Saldo insuficiente para ampliar.');
  transact(state, -zone.cost, 'ampliacoes', `Ampliação: ${zone.label}`);
  state.unlockedZones.push(zoneId);
  fx({ kind: 'zone', zoneId });
  fx({ kind: 'money', x: zone.x + zone.w / 2 - 0.5, y: zone.y + zone.h / 2, text: `-${formatMoney(zone.cost)}` });
  if (zone.reaction) addMessage(state, zone.reaction.from, zone.reaction.text);
  toast(`Nova área: ${zone.label} (+${zone.w * zone.h} tiles)!`, 'success');
  // Áreas infinitas: cada compra faz surgir outro terreno à venda ao lado.
  const shiftBefore = { ...layoutShift(state) };
  const created = ensureFrontier(state, zoneId);
  const shiftAfter = layoutShift(state);
  if (shiftAfter.x !== shiftBefore.x || shiftAfter.y !== shiftBefore.y) {
    // Nasceu terreno à esquerda: a academia andou para a direita no mapa. O
    // desenho desloca bonecos e câmera primeiro; efeitos já na fila vão junto.
    const dx = shiftAfter.x - shiftBefore.x;
    const dy = shiftAfter.y - shiftBefore.y;
    for (const e of game.ui.fx) if (e.kind === 'money' || e.kind === 'clean') { e.x += dx; e.y += dy; }
    game.ui.fx.unshift({ kind: 'shift', dx, dy, t0: typeof performance !== 'undefined' ? performance.now() : 0 });
  }
  for (const fresh of created) {
    fx({ kind: 'newZone', zoneId: fresh.id });
    toast(`Novo terreno à venda: ${fresh.label} (${fresh.w}×${fresh.h}) por ${formatMoney(fresh.cost)}.`, 'info');
  }
  // Fecha o painel de ampliações para o jogador ver a obra no mapa.
  if (game.ui.modal?.kind === 'expansions') game.ui.modal = null;
  playSound('celebrate');
  afterLayoutChange();
  emit();
}

// ---------------------------------------------------------------- eras
/** Passo 1 da mudança: abre a planta do novo ponto antes de pagar. */
export function openEraMove() {
  game.ui.modal = { kind: 'eraMove' };
  game.ui.mode = 'normal';
  game.ui.placing = null;
  game.ui.moving = null;
  game.ui.selectedId = null;
  playSound('click');
  emit();
}

/** Passos 2 a 5: paga, muda os aparelhos, fecha um dia e dá bônus de novidade. */
export function confirmEraMove() {
  const { state } = game;
  const check = canMoveEra(state);
  if (!check.ok) return fail(check.reason);
  const summary = performEraMove(state);
  game.ui.modal = null;
  game.ui.editMode = false;
  refreshDerived(state, game.rt);
  fx({ kind: 'era', era: summary.era });
  playSound('celebrate');
  if (summary.leftovers) {
    toast(`${summary.leftovers} aparelho(s) não couberam e foram vendidos por ${formatMoney(summary.refund)}.`, 'warn');
  }
  emit();
  return true;
}

// ---------------------------------------------------------------- rede (Era 4)
export function openCityMap() {
  game.ui.selectedId = null;
  openModal({ kind: 'city' });
}

/** Abre a ficha de um lote (para abrir filial) ou de uma filial existente. */
export function openNetworkSpot(spot) {
  if (spot.kind === 'lot') openModal({ kind: 'openBranch', lotId: spot.id });
  else if (spot.kind === 'branch') openModal({ kind: 'branch', branchId: spot.id });
  else if (spot.kind === 'matriz') closeModal(); // volta para a grade da Matriz
  else if (spot.kind === 'historica') {
    toast('Matriz Histórica: a garagem onde tudo começou. Dá +5% de membros em todas as filiais.', 'info');
    emit();
  }
}

export function confirmOpenBranch(lotId, style, candidateId) {
  const { state } = game;
  const blocker = openBlocker(state, lotId, style, candidateId);
  if (blocker) return fail(blocker);
  const branch = openBranch(state, lotId, style, candidateId);
  const lineIdx = (state.network.opened - 1);
  addMessage(state, 'valeria', BRANCH_LINES.valeria[lineIdx % BRANCH_LINES.valeria.length](branch.name));
  addMessage(state, 'tioze', BRANCH_LINES.tioze[lineIdx % BRANCH_LINES.tioze.length](branch.name));
  if (state.network.opened === 1) {
    state.milestones.first_branch = true;
    state.pendingModals.push({ kind: 'postcard', id: 'first_branch' });
  }
  toast(`${branch.name} inaugurada! A Valéria mandou uma cesta de presente.`, 'success');
  playSound('celebrate');
  game.ui.modal = { kind: 'branch', branchId: branch.id };
  emit();
  return true;
}

export function upgradeBranchAction(branchId) {
  const { state } = game;
  const b = state.network?.branches.find((x) => x.id === branchId);
  const cost = b && branchUpgradeCost(b);
  if (cost == null) return fail('Essa filial já está no nível máximo.');
  if (!upgradeBranch(state, branchId)) return fail(`Saldo insuficiente para a reforma (${formatMoney(cost)}).`);
  toast(`${b.name} reformada: cabe mais gente!`, 'success');
  playSound('buy');
  emit();
  return true;
}

export function changeBranchStyleAction(branchId, style) {
  const { state } = game;
  if (!changeBranchStyle(state, branchId, style)) return fail('Não deu para trocar o estilo agora (saldo ou estilo igual).');
  toast(`Estilo trocado para ${STYLES[style].label}. Parte dos membros estranhou a mudança.`, 'info');
  playSound('click');
  emit();
  return true;
}

export function swapManagerAction(branchId, candidateId) {
  const { state } = game;
  const b = state.network?.branches.find((x) => x.id === branchId);
  const old = b?.manager?.name;
  if (!swapManager(state, branchId, candidateId)) return fail('Esse candidato não está mais disponível.');
  toast(`${b.manager.name} assumiu a ${b.name}.${old ? ` ${old} foi cuidar da vida (sem multa e sem drama).` : ''}`, 'success');
  playSound('click');
  emit();
  return true;
}

export function requestSellBranch(branchId) {
  const b = game.state.network?.branches.find((x) => x.id === branchId);
  if (!b) return;
  game.ui.confirm = {
    title: `Vender a ${b.name}?`,
    text: `Você recebe ${formatMoney(branchSaleValue(b))} (metade do que investiu). O lote volta a ficar à venda no mapa.`,
    confirmLabel: 'Vender filial',
    danger: true,
    onConfirm: () => {
      const value = sellBranch(game.state, branchId);
      toast(`${b.name} vendida por ${formatMoney(value)}.`, 'info');
      game.ui.modal = { kind: 'city' };
      playSound('sell');
      emit();
    },
  };
  emit();
}

// ---------------------------------------------------------------- equipe
export function hireStaff(role = 'zelador') {
  const { state } = game;
  const blocker = hireBlocker(state, role);
  if (blocker) return fail(blocker);
  const def = roleDef(role);
  const member = createStaffMember(state, state.rng, role);
  if (def.hireCost) transact(state, -def.hireCost, 'salarios', `Contratação: ${member.name}`);
  state.staff.push(member);
  addMessage(state, 'tioze', role === 'tecnico'
    ? `Um(a) técnico(a) de verdade? ${member.name} não é barato(a), mas aparelho parado custa mais caro. Dizem que ${member.trait}.`
    : `Contratou ${member.name}? Gente boa! Dizem que ${member.trait}.`);
  toast(`${member.name} (${def.label.toLowerCase()}) contratado(a) para o turno da noite. Ajuste os turnos na aba Equipe.`, 'success');
  playSound('buy');
  emit();
  return true;
}

export function toggleStaffShift(id, blockIndex) {
  const member = game.state.staff.find((m) => m.id === id);
  if (!member) return;
  const next = [...member.shifts];
  next[blockIndex] = !next[blockIndex];
  if (!next.some(Boolean)) return fail('Cada pessoa da equipe precisa cobrir pelo menos um turno.');
  member.shifts = next;
  playSound('click');
  emit();
}

export function requestFire(id) {
  const member = game.state.staff.find((m) => m.id === id);
  if (!member) return;
  game.ui.confirm = {
    title: `Dispensar ${member.name}?`,
    text: 'Sem multa e sem drama: o salário para de ser cobrado a partir de amanhã.',
    confirmLabel: 'Dispensar',
    danger: true,
    onConfirm: () => {
      game.state.staff = game.state.staff.filter((m) => m.id !== id);
      toast(`${member.name} foi dispensado(a). Quem sabe volta como aluno(a)!`, 'info');
      emit();
    },
  };
  emit();
}

// ---------------------------------------------------------------- desfazer
export function undo() {
  const { state } = game;
  const action = state.undo.pop();
  if (!action) return fail('Nada para desfazer hoje.');
  if (action.kind === 'place') {
    const item = itemById(action.itemId);
    if (item) {
      state.items = state.items.filter((i) => i.id !== item.id);
      transact(state, item.pricePaid, 'reembolsos', `Desfeito: ${getEquipmentDef(item.type).name}`);
    }
  } else if (action.kind === 'move') {
    const item = itemById(action.itemId);
    const check = item && validatePlacement(state, { type: item.type, ...action.from }, item.id);
    if (!check?.ok) return fail('A posição original está ocupada agora.');
    Object.assign(item, action.from);
  } else if (action.kind === 'sell') {
    const check = validatePlacement(state, action.item);
    if (!check.ok) return fail('O lugar do aparelho vendido está ocupado agora.');
    if (!canAfford(state, action.refund)) return fail('Saldo insuficiente para desfazer a venda.');
    transact(state, -action.refund, action.sameDay ? 'reembolsos' : 'vendas', `Desfeito: venda de ${getEquipmentDef(action.item.type).name}`);
    state.items.push(action.item);
  } else if (action.kind === 'level') {
    const item = itemById(action.itemId);
    if (item) {
      Object.assign(item, action.from);
      transact(state, action.cost, 'reembolsos', `Desfeito: melhoria de ${getEquipmentDef(item.type).name}`);
    }
  } else if (action.kind === 'upgrade') {
    const item = itemById(action.itemId);
    if (item) {
      Object.assign(item, action.from);
      transact(state, action.cost, 'reembolsos', `Desfeito: upgrade de ${getEquipmentDef(item.type).name}`);
    }
  }
  game.ui.selectedId = null;
  playSound('rotate');
  afterLayoutChange();
  emit();
  return true;
}

// ---------------------------------------------------------------- economia e UI
export function setFee(value) {
  const { min, max } = feeLimits(game.state.era);
  game.state.fee = Math.min(max, Math.max(min, Math.round(value)));
  emit();
}

export function clickWhey() {
  const { state, rt, ui } = game;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  playSound('meow');
  if (state.wheyTipDay === state.time.day) {
    ui.wheyBubble = { text: 'Miau. (Dica de hoje já foi. Volte amanhã!)', until: now + 2500 };
  } else {
    state.wheyTipDay = state.time.day;
    const text = wheyTip(state, rt.academy, rt.blockStats, getSuggestions().missing);
    ui.wheyBubble = { text, until: now + 6000 };
    addMessage(state, 'whey', text);
  }
  emit();
}

export function setTab(tab) {
  game.ui.tab = tab;
  emit();
}

export function setShopFilter(filter) {
  game.ui.shopFilter = filter;
  emit();
}

export function openModal(modal) {
  game.ui.modal = modal;
  emit();
}

export function closeModal() {
  game.ui.modal = null;
  emit();
}

export function dismissPending() {
  game.state.pendingModals.shift();
  emit();
}

export function resolveConfirm(accepted) {
  const c = game.ui.confirm;
  game.ui.confirm = null;
  if (accepted && c?.onConfirm) c.onConfirm();
  emit();
}

export function askConfirm(confirm) {
  game.ui.confirm = confirm;
  emit();
}

export function toggleSound() {
  game.ui.soundOn = !game.ui.soundOn;
  setSoundEnabled(game.ui.soundOn);
  saveSettings({ ...loadSettings(), soundOn: game.ui.soundOn });
  emit();
}

export function catalogEntries() {
  return Object.entries(EQUIPMENT).map(([type, def]) => ({ type, ...def }));
}
