// Era 5: filiais editáveis. O jogador entra na filial e monta igual à Matriz,
// mas o terreno não cresce: a reforma vira andar, ligado por uma escada fixa.
// Ao chegar na Era 5, o kit que o gerente montou vira o térreo de verdade
// (aparelhos marcados `gift`: vieram com a filial, não valem dinheiro na venda).
import { CONFIG } from '../config.js';
import { validatePlacement, withLayout } from '../grid/grid.js';
import { transact } from '../economy/economy.js';
import { smartLayout } from './eras.js';
import {
  STYLES, MAX_FLOORS, branchBuilding, branchEditable, branchKit, floorCost, floorState, kitTier,
  refreshBranchCapacity, stairsSpot,
} from './network.js';

export function stairsItem(branch) {
  const st = stairsSpot(branch);
  return {
    id: branch.nextItemId++, type: 'escada_filial', tier: 'usado', ...st, condition: 100, purchasedDay: 0, pricePaid: 0, fixed: true,
  };
}

/** Transforma o kit do gerente no térreo de verdade (uma vez só). */
export function migrateBranch(home, branch) {
  if (branch.floors) return false;
  const style = STYLES[branch.style];
  branch.nextItemId = 1;
  branch.nextDirtId = 1;
  branch.floors = [{ items: [], dirt: [] }];
  const st = floorState(home, branch, 0);
  withLayout(st, home, () => {
    const { w, h, door } = branchBuilding(branch);
    const desk = {
      id: branch.nextItemId++, type: 'recepcao', tier: 'usado', x: Math.min(door.x + 2, w - 3), y: h - 2, rot: 2,
      condition: 100, purchasedDay: 0, pricePaid: 0, fixed: true,
    };
    const fixed = [];
    for (const it of [stairsItem(branch), desk]) {
      if (validatePlacement({ ...st, items: fixed }, it).ok) fixed.push(it);
    }
    const day = home?.time?.day ?? 0;
    const kit = branchKit(branch).map((type) => ({
      id: branch.nextItemId++, type, tier: kitTier(type, style.tier), x: 0, y: 0, rot: 0,
      condition: 92, purchasedDay: day - 1, pricePaid: 0, gift: true,
    }));
    const { placed } = smartLayout({ ...st, items: [] }, kit, fixed);
    branch.floors[0].items = placed.sort((a, b) => a.id - b.id);
  });
  refreshBranchCapacity(home, branch);
  return true;
}

/** Na Era 5, toda filial tem andares (as antigas são migradas; as novas nascem assim). */
export function ensureBranchFloors(state) {
  if (!branchEditable(state)) return 0;
  let n = 0;
  for (const b of state.network.branches) if (migrateBranch(state, b)) n += 1;
  return n;
}

/** Por que não dá para construir um andar agora (ou null se dá). */
export function floorBlocker(state, branch) {
  if (!branchEditable(state) || !branch?.floors) return 'Andares chegam na Era 5.';
  const cost = floorCost(branch);
  if (cost == null) return `A filial já tem ${MAX_FLOORS} andares, o máximo.`;
  if (state.money < cost) return 'Saldo insuficiente para construir o andar.';
  return null;
}

/** Constrói o próximo andar (vazio, só com a escada). Devolve o número do andar novo ou null. */
export function buildFloor(state, branchId) {
  const branch = state.network?.branches.find((b) => b.id === branchId);
  if (floorBlocker(state, branch)) return null;
  const cost = floorCost(branch);
  transact(state, -cost, 'filiaisAbertura', `Novo andar: ${branch.name}`);
  branch.invested = (branch.invested ?? 0) + cost;
  branch.floors.push({ items: [stairsItem(branch)], dirt: [] });
  refreshBranchCapacity(state, branch);
  return branch.floors.length - 1;
}

/** Itens que não se compram nem se movem (recepção e escada). */
export const isFixedItem = (item) => !!(item?.fixed || CONFIG.equipment[item?.type]?.fixed);
