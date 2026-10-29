// Academias de verdade para os testes do modo online (aparelhos válidos e alcançáveis).
import { CONFIG, EQUIPMENT } from '../../game/config.js';
import { createNewGame } from '../../game/engine/state.js';
import { syncLayout, validatePlacement, allZones } from '../../game/grid/grid.js';
import { computeAccess } from '../../game/pathfinding/floodFill.js';
import { createStudent } from '../../game/simulation/students.js';

/** Aparelhos que se compram na era (sem os escondidos, como a recepção da filial). */
const typesFor = (era) => Object.keys(EQUIPMENT).filter(
  (t) => !EQUIPMENT[t].hidden && (EQUIPMENT[t].minEra ?? 1) <= era && EQUIPMENT[t].tiers.some((x) => x.price > 0),
);

/** Partida com aparelhos pagos (pricePaid = preço de catálogo) em todas as áreas desenhadas da era. */
export function academy({ seed = 5, era = 1, maxItems = 12, students = 0, money = 5000, day = 0, fee = null } = {}) {
  const s = createNewGame(seed);
  s.era = era;
  syncLayout(s);
  s.unlockedZones = allZones(s).filter((z) => !z.procedural).map((z) => z.id);
  syncLayout(s);
  s.money = money;
  s.reputation = 4.5;
  s.fee = fee ?? CONFIG.economy.eraBaseFee[String(era)];
  s.time.day = day;
  const TYPES = typesFor(era);
  let id = 1;
  for (let y = 0; y < 40 && s.items.length < maxItems; y++) {
    for (let x = 0; x < 40 && s.items.length < maxItems; x++) {
      const type = TYPES[(x * 7 + y * 3) % TYPES.length];
      const tier = EQUIPMENT[type].tiers[0];
      const it = { id, type, tier: tier.id, x, y, rot: 0, condition: 100, purchasedDay: 0, pricePaid: tier.price, level: 1 };
      if (!validatePlacement(s, it).ok) continue;
      s.items.push(it);
      const acc = computeAccess(s.unlockedZones, s.items);
      if (s.items.some((i) => !acc.reachable.has(i.id))) {
        s.items.pop();
        continue;
      }
      id += 1;
    }
  }
  s.nextItemId = id;
  for (let i = 0; i < students; i++) s.students.push(createStudent(s, s.rng));
  return s;
}

/** Rede da Era 4 com filiais abertas (base para os testes da Era 5). */
export async function era4WithBranches({ branches = 2, money = 400000 } = {}) {
  const { performEraMove } = await import('../../game/systems/eras.js');
  const { openBranch } = await import('../../game/systems/network.js');
  const s = academy({ era: 3, maxItems: 24, money, students: 80 });
  performEraMove(s);
  s.pendingModals = [];
  for (let i = 0; i < branches; i++) {
    const styles = ['familia', 'premium', 'zen', 'luta'];
    openBranch(s, s.network.lots[0].id, styles[i % styles.length], s.network.candidates[0].id);
  }
  return s;
}
