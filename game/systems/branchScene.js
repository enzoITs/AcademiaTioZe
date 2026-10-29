// Visita a uma filial (Era 4). A filial continua semiautomática (rede em
// network.js); esta cena existe só para VER: monta um estado no mesmo formato
// do da Matriz, com a planta da filial, os aparelhos do estilo, a recepção com
// o gerente e os membros treinando. Assim o desenho reaproveita tudo
// (aparelhos, bonecos, filas, balões) sem tocar na partida.
import { CONFIG, getEquipmentDef, demandCategoryOf } from '../config.js';
import { syncLayout, validatePlacement } from '../grid/grid.js';
import { evaluateAcademy } from '../simulation/academy.js';
import { computeBlockStats } from '../simulation/demand.js';
import { createStudent, createLook } from '../simulation/students.js';
import { smartLayout } from './eras.js';
import { STYLES, branchLevelDef, districtOf, districtName, hasNetwork } from './network.js';
import { createRng, nextRandom, pick, weightedPick } from '../utils/random.js';
import { STYLE_CHATTER } from '../content/lines.js';

const N = CONFIG.network;
const scenes = new Map(); // branchId → cena montada

/** Prédio da filial: cresce com a reforma (nível 1 a 3). A porta fica na frente, à esquerda. */
export function branchBuilding(branch) {
  const [w, h] = branchLevelDef(branch.level).building ?? [10, 8];
  return { w, h, door: { x: 2, y: h - 1 } };
}

/** Aparelhos do estilo. A reforma acrescenta mais unidades dos aparelhos de treino. */
export function branchKit(branch) {
  const kit = STYLES[branch.style].kit;
  const core = kit.filter((t) => demandCategoryOf(t));
  if (branch.level >= 3) return [...kit, ...core];
  if (branch.level === 2) return [...kit, ...core.slice(0, Math.ceil(core.length / 2))];
  return [...kit];
}

/** Melhor nível de qualidade do aparelho que o estilo pede (Premium usa profissional). */
function tierFor(type, wanted) {
  const tiers = getEquipmentDef(type).tiers.map((t) => t.id);
  if (wanted && tiers.includes(wanted)) return wanted;
  if (wanted && tiers.includes('novo')) return 'novo';
  return tiers[0];
}

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
    id: state.nextItemId++, type, tier: tierFor(type, style.tier), x: 0, y: 0, rot: 0,
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
function syncMembers(scene, branch) {
  const { state } = scene;
  const want = Math.max(0, Math.min(N.maxViewMembers ?? 240, Math.round(branch.members)));
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

/**
 * Cena da filial para o desenho (ou null se ela não existe mais). Remonta a
 * planta quando o estilo, o nível ou o gerente mudam; a cada bloco do dia
 * recalcula quem está treinando.
 */
export function branchScene(home, branchId) {
  if (!home?.state || !hasNetwork(home.state)) return null;
  const branch = home.state.network.branches.find((b) => b.id === branchId);
  if (!branch) return null;
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
