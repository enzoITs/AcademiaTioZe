// Estado serializável da partida. Tudo aqui vai para o save.
import { CONFIG, PROFILE_IDS, DEMAND_CATEGORIES } from '../config.js';
import { createLedger } from '../economy/economy.js';

export function emptyExposure() {
  return Object.fromEntries(PROFILE_IDS.map((p) => [p, 0]));
}

export function emptyCategoryQueue() {
  return Object.fromEntries(DEMAND_CATEGORIES.map((c) => [c, 0]));
}

export function createNewGame(seed = Date.now() % 2147483647) {
  const money = CONFIG.economy.startingMoney;
  return {
    saveVersion: CONFIG.saveVersion,
    seed,
    rng: { s: seed >>> 0 },
    era: 1,
    closedDay: null, // dia da mudança de era (academia fechada, sem mensalidade)
    money,
    fee: CONFIG.economy.startingFee,
    reputation: CONFIG.reputation.start,
    time: { day: 0, block: 0, blockProgress: 0, speedIndex: 1, paused: false, staffCleaned: 0, staffFixed: 0 },
    unlockedZones: CONFIG.grid.zones.filter((z) => z.startsUnlocked).map((z) => z.id),
    extraZones: [], // terrenos gerados (áreas infinitas)
    nextZoneNum: 1,
    items: [],
    nextItemId: 1,
    students: [],
    nextStudentId: 1,
    staff: [],
    nextStaffId: 1,
    enrollAcc: 0,
    dirt: [],
    nextDirtId: 1,
    usesSinceDirt: 0,
    dayExposure: emptyExposure(),
    dayCategoryQueue: emptyCategoryQueue(),
    lastPeakOccupancy: 0,
    ledger: createLedger(0, money),
    reports: [],
    reviews: [],
    cancellations: [],
    messages: [],
    pendingModals: [{ kind: 'postcard', id: 'welcome' }],
    milestones: { welcome: true },
    vovoCount: 0,
    stats: { enrolled: 0, cancelled: 0, cleaned: 0, cleanedByStaff: 0, repairedByStaff: 0, repairs: 0 },
    wheyTipDay: -1,
    undo: [],
    savedAt: Date.now(),
  };
}
