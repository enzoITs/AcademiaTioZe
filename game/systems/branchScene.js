// Visita a uma filial. Na Era 4 a cena existe só para VER: monta um estado no
// mesmo formato do da Matriz, com a planta da filial, os aparelhos do estilo, a
// recepção com o gerente e os membros treinando. Na Era 5 a filial é editável:
// a cena aponta para os aparelhos salvos do andar visitado (sem cópia) e usa a
// interface do jogo, então comprar, mover e consertar funcionam como na Matriz.
import { CONFIG } from '../config.js';
import { syncLayout, validatePlacement, withLayout } from '../grid/grid.js';
import { evaluateAcademy } from '../simulation/academy.js';
import { computeBlockStats } from '../simulation/demand.js';
import { createStudent, createLook } from '../simulation/students.js';
import { smartLayout } from './eras.js';
import {
  STYLES, districtOf, districtName, hasNetwork, branchBuilding, branchKit, kitTier, floorState,
} from './network.js';
import { createRng, nextRandom, pick, weightedPick } from '../utils/random.js';
import { STYLE_CHATTER } from '../content/lines.js';

const N = CONFIG.network;
const scenes = new Map(); // branchId → cena montada

export { branchBuilding, branchKit };

function lookFor(branch, style) {
  const L = style.look ?? {};
  return {
    wall: L.wall ?? '#e6e1d8',
    mullion: L.mullion,
    door: L.door ?? 'awning',
    bunting: true,
    sign: {
      fill: style.color,
      ink: '#3d3550',
      sub: '#3d3550',
      lines: ['ACADEMIA DO TIO ZÉ', `${style.label} · ${districtName(branch)}`],
      w: 136,
      neon: !!L.neon,
    },
  };
}

function viewUi() {
  return {
    screen: 'game', mode: 'normal', placing: null, moving: null, hover: null, selectedId: null,
    editMode: false, maintenanceView: false, fx: [], wheyBubble: null, view: null,
  };
}

function sceneKey(home, branch) {
  return `${home.state.seed}|${branch.style}|${branch.level}|${branch.manager?.id ?? 0}|${branch.district}`;
}

/** Monta a cena. Deixa a grade global na planta da filial: quem chama restaura. */
function createScene(home, branch) {
  const style = STYLES[branch.style];
  const { w, h, door } = branchBuilding(branch);
  const zone = {
    id: `filial-${branch.id}`, label: branch.name, x: 0, y: 0, w, h, cost: 0, startsUnlocked: true, floor: style.look?.floor,
  };
  const layout = {
    id: `${zone.id}|${branch.level}`, era: 4, zones: [zone], door, cols: w, rows: h + 2, reserved: { x: door.x, y: h, w: 1 },
  };
  const seed = ((home.state.seed ?? 1) * 7919 + branch.id * 104729) >>> 0;
  const state = {
    isBranchView: true,
    branchId: branch.id,
    era: 4,
    seed,
    rng: createRng(seed),
    customLayout: layout,
    look: lookFor(branch, style),
    city: { theme: districtOf(branch).theme ?? 'residencial', seed: branch.id * 131 + branch.district * 17 + 5 },
    time: home.state.time, // o relógio é o mesmo da Matriz: dia, tarde e noite juntos
    reputation: home.state.reputation,
    fee: home.state.fee,
    unlockedZones: [zone.id],
    extraZones: [],
    shift: { x: 0, y: 0 },
    items: [],
    nextItemId: 1,
    students: [],
    nextStudentId: 1,
    staff: [],
    dirt: [],
    nextDirtId: 1,
    closedDay: null,
    lastPeakOccupancy: 0,
    managerSpot: null,
    network: null,
    pendingModals: [],
    messages: [],
    milestones: {},
    undo: [],
  };
  syncLayout(state);

  // Recepção logo depois da porta, com o balcão virado para a entrada.
  const desk = {
    id: state.nextItemId++, type: 'recepcao', tier: 'usado', x: Math.min(door.x + 2, w - 3), y: h - 2, rot: 2,
    condition: 100, purchasedDay: 0, pricePaid: 0,
  };
  const fixed = validatePlacement(state, desk).ok ? [desk] : [];
  const kit = branchKit(branch).map((type) => ({
    id: state.nextItemId++, type, tier: kitTier(type, style.tier), x: 0, y: 0, rot: 0,
    condition: 88 + Math.round(nextRandom(state.rng) * 10), purchasedDay: 0, pricePaid: 0,
  }));
  const { placed, leftovers } = smartLayout(state, kit, fixed);
  state.items = placed.sort((a, b) => a.id - b.id);

  const academy = evaluateAcademy(state);
  const deskCells = fixed.length ? academy.access.usageCells.get(desk.id) ?? [] : [];
  state.managerSpot = deskCells[Math.floor(deskCells.length / 2)] ?? null;
  const mgr = branch.manager;
  if (mgr) {
    const mrng = createRng(((mgr.id ?? 1) * 2654435761 + branch.id) >>> 0);
    state.staff = [{
      id: 1, role: 'gerente', name: mgr.name, rating: mgr.rating, look: createLook(mrng, 'adult'),
      shifts: CONFIG.time.blocks.map(() => true), color: style.color,
    }];
  }
  return {
    kind: 'branch',
    key: sceneKey(home, branch),
    branchId: branch.id,
    state,
    rt: { academy, blockStats: null },
    ui: viewUi(),
    statsKey: null,
    leftovers: leftovers.length,
  };
}

/** Membros na tela = membros da filial (com teto), com o perfil que o estilo atrai. */
function syncMembers(scene, branch, members = branch.members) {
  const { state } = scene;
  const want = Math.max(0, Math.min(N.maxViewMembers ?? 240, Math.round(members)));
  const entries = Object.entries(STYLES[branch.style].profiles ?? { iniciante: 1 });
  const chatter = STYLE_CHATTER[branch.style] ?? [];
  const rating = branch.manager?.rating ?? 2;
  let changed = false;
  while (state.students.length < want) {
    const s = createStudent(state, state.rng, weightedPick(state.rng, entries));
    s.S = Math.round(Math.min(95, 52 + rating * 6 + nextRandom(state.rng) * 14));
    if (chatter.length && nextRandom(state.rng) < 0.65) s.complaint = { kind: 'happy', text: pick(state.rng, chatter) };
    state.students.push(s);
    changed = true;
  }
  if (state.students.length > want) {
    state.students.length = want;
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- Era 5: andar editável
/** Quem aparece no andar: o gerente no térreo e a equipe contratada para aquele andar. */
function sceneStaff(branch, floor) {
  const out = [];
  const mgr = branch.manager;
  if (mgr && floor === 0) {
    const mrng = createRng(((mgr.id ?? 1) * 2654435761 + branch.id) >>> 0);
    out.push({
      id: 1, role: 'gerente', name: mgr.name, rating: mgr.rating, look: createLook(mrng, 'adult'),
      shifts: CONFIG.time.blocks.map(() => true), color: STYLES[branch.style].color,
    });
  }
  for (const m of branch.staff ?? []) if (m.floor === floor) out.push({ ...m, id: 1000 + m.id });
  return out;
}

function editableKey(home, branch, floor) {
  return `${home.state.seed}|${branch.style}|${branch.level}|${branch.manager?.id ?? 0}|${branch.district}|f${floor}`;
}

/** Assinatura do que muda a avaliação do andar: posição, giro, nível e se o aparelho funciona. */
function itemsSignature(items) {
  return items.map((i) => `${i.id}:${i.x},${i.y},${i.rot},${i.tier},${i.level ?? 1},${i.condition <= CONFIG.wear.brokenCondition ? 'q' : ''}`).join('|');
}

function createEditableScene(home, branch, floor) {
  const style = STYLES[branch.style];
  const seed = ((home.state.seed ?? 1) * 7919 + branch.id * 104729 + floor * 31) >>> 0;
  const state = {
    ...floorState(home.state, branch, floor),
    editable: true,
    seed,
    rng: createRng(seed),
    look: lookFor(branch, style),
    city: { theme: districtOf(branch).theme ?? 'residencial', seed: branch.id * 131 + branch.district * 17 + 5 },
    nextStudentId: 1,
    staff: [],
    nextDirtId: branch.nextDirtId ?? 1,
    closedDay: null,
    lastPeakOccupancy: 0,
    managerSpot: null,
    network: null,
    pendingModals: [],
    messages: [],
    milestones: {},
    undo: [],
  };
  state.staff = sceneStaff(branch, floor);
  return {
    kind: 'branch',
    key: editableKey(home, branch, floor),
    branchId: branch.id,
    floor,
    state,
    rt: { academy: null, blockStats: null },
    // A interface é a do jogo: seleção, prévia e modo edição valem dentro da filial.
    ui: home.ui,
    statsKey: null,
    itemsKey: null,
    leftovers: 0,
  };
}

/** Recalcula a avaliação do andar (dentro da grade dele) quando os aparelhos mudam. */
export function refreshEditableScene(home, scene, force = false) {
  const branch = home.state.network?.branches.find((b) => b.id === scene.branchId);
  const f = branch?.floors?.[scene.floor];
  if (!f) return;
  const { state } = scene;
  state.items = f.items;
  state.dirt = f.dirt;
  state.time = home.state.time;
  state.reputation = home.state.reputation;
  state.fee = home.state.fee;
  state.era = home.state.era;
  const sig = itemsSignature(f.items);
  if (force || sig !== scene.itemsKey || !scene.rt.academy) {
    scene.itemsKey = sig;
    scene.statsKey = null;
    withLayout(state, home.state, () => {
      scene.rt.academy = evaluateAcademy(state);
      const desk = state.items.find((i) => i.type === 'recepcao');
      const cells = desk ? scene.rt.academy.access.usageCells.get(desk.id) ?? [] : [];
      state.managerSpot = cells[Math.floor(cells.length / 2)] ?? null;
    });
  }
}

function editableScene(home, branch, floor) {
  const id = `${branch.id}:${floor}`;
  let scene = scenes.get(id);
  if (!scene || scene.key !== editableKey(home, branch, floor)) {
    scene = createEditableScene(home, branch, floor);
    scenes.set(id, scene);
  }
  scene.ui = home.ui;
  scene.state.staff = sceneStaff(branch, floor);
  refreshEditableScene(home, scene);
  // Membros do andar: a parte da filial proporcional à capacidade dele.
  const caps = branch.floorCaps ?? [];
  const total = caps.reduce((a, b) => a + b, 0);
  const share = total > 0 ? (caps[floor] ?? 0) / total : floor === 0 ? 1 : 0;
  const changed = syncMembers(scene, branch, branch.members * share);
  const t = home.state.time;
  const key = `${t.day}|${t.block}|${scene.state.students.length}`;
  if (changed || key !== scene.statsKey) {
    scene.statsKey = key;
    withLayout(scene.state, home.state, () => {
      scene.rt.blockStats = computeBlockStats(scene.state, scene.rt.academy, t.block, t.day);
    });
  }
  return scene;
}

/**
 * Cena da filial para o desenho (ou null se ela não existe mais). Remonta a
 * planta quando o estilo, o nível ou o gerente mudam; a cada bloco do dia
 * recalcula quem está treinando. Na Era 5, `floor` escolhe o andar.
 */
export function branchScene(home, branchId, floor = 0) {
  if (!home?.state || !hasNetwork(home.state)) return null;
  const branch = home.state.network.branches.find((b) => b.id === branchId);
  if (!branch) return null;
  if (branch.floors) return editableScene(home, branch, Math.min(Math.max(0, floor), branch.floors.length - 1));
  let scene = scenes.get(branch.id);
  if (!scene || scene.key !== sceneKey(home, branch)) {
    try {
      scene = createScene(home, branch);
    } finally {
      syncLayout(home.state);
    }
    scenes.set(branch.id, scene);
  }
  const { state } = scene;
  state.time = home.state.time;
  state.reputation = home.state.reputation;
  state.fee = home.state.fee;
  const changed = syncMembers(scene, branch);
  const t = home.state.time;
  const key = `${t.day}|${t.block}|${state.students.length}`;
  if (changed || key !== scene.statsKey) {
    scene.statsKey = key;
    scene.rt.blockStats = computeBlockStats(state, scene.rt.academy, t.block, t.day);
  }
  return scene;
}

/** Esquece as cenas montadas (nova partida, testes). */
export function forgetBranchScenes() {
  scenes.clear();
}
