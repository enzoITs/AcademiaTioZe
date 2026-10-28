// Alunos: criação, satisfação diária, reclamações, cancelamentos, matrículas,
// reputação e avaliações. Tudo calculado por números; os sprites só mostram.
import { CONFIG, PROFILES, PROFILE_IDS, DEMAND_CATEGORIES } from '../config.js';
import { needsScoreFor } from './academy.js';
import { nextRandom, pick, weightedPick, randInt } from '../utils/random.js';
import { clamp, calendarOf } from '../utils/format.js';
import {
  FIRST_NAMES, EQUIPMENT_SHORT, CATEGORY_SHORT, COMPLAINTS, PRAISES, CANCEL_REASONS,
  REVIEW_GOOD, REVIEW_BAD,
} from '../content/lines.js';

const SAT = CONFIG.satisfaction;
const MANIAS = CONFIG.manias;
const MANIA_IDS = Object.keys(MANIAS);

const SKIN_TONES = ['#f6d7c3', '#eac0a0', '#d49a74', '#b07650', '#8a5a3c', '#5e3b26'];
const HAIR_COLORS = ['#2b2230', '#5a3a28', '#a8642e', '#d8a85a', '#c94f3d', '#7a6f8a'];
const HAIR_STYLES = ['short', 'long', 'bun', 'curly', 'bald', 'ponytail'];
const AGES = ['young', 'adult', 'adult', 'senior'];

/** Aparência modular: tom de pele, cabelo, corpo e idade variam livremente. */
export function createLook(rng) {
  const age = pick(rng, AGES);
  return {
    skin: pick(rng, SKIN_TONES),
    hair: age === 'senior' ? '#d9d4dc' : pick(rng, HAIR_COLORS),
    hairStyle: pick(rng, HAIR_STYLES),
    body: 0.85 + nextRandom(rng) * 0.35,
    height: 0.92 + nextRandom(rng) * 0.16,
    age,
    shade: randInt(rng, 0, 2),
  };
}

export function createStudent(state, rng, profileId = null) {
  const profile = profileId ?? weightedPick(rng, PROFILE_IDS.map((p) => [p, PROFILES[p].spawnWeight]));
  const student = {
    id: state.nextStudentId++,
    name: pick(rng, FIRST_NAMES),
    profile,
    mania: pick(rng, MANIA_IDS),
    look: createLook(rng),
    S: SAT.newStudentSatisfaction,
    joinedDay: state.time.day,
    novelty: null,
    factors: null,
    complaint: null,
  };
  return student;
}

function noveltyValue(student, day) {
  if (!student.novelty) return 0;
  const elapsed = day - student.novelty.startDay;
  if (elapsed >= student.novelty.days) return 0;
  return student.novelty.bonus * (1 - elapsed / student.novelty.days);
}

/** Calcula as notas dos 5 fatores e o alvo de satisfação de um aluno. */
export function studentTarget(student, academy, exposure, fee, day) {
  const profile = PROFILES[student.profile];
  const mania = MANIAS[student.mania] ?? {};
  const needs = needsScoreFor(student.profile, academy.metTypes, mania.extraEssential ?? null);

  let penalty = 0;
  for (const t of needs.missingEssentials) {
    penalty += t === mania.extraEssential && !profile.essentials.includes(t) ? mania.penalty : SAT.missingEssentialPenalty;
  }

  const queueMult = profile.queueMultiplier * (mania.queueMultiplier ?? 1);
  const queue = clamp(100 - SAT.queueSlope * exposure * queueMult, 0, 100);

  let vibe = academy.vibeByProfile[student.profile];
  if (mania.vibePenaltyWithout && !academy.metTypes.has(mania.vibePenaltyWithout)) vibe -= mania.vibePenalty;
  vibe = clamp(vibe, 0, 100);

  const overPct = Math.max(0, fee / academy.perceivedValue - 1) * 100;
  const price = clamp(100 - overPct * CONFIG.economy.pricePointsPerPercentAbove * profile.priceMultiplier, 0, 100);

  const factors = { needs: needs.score, queue, condition: academy.conditionScore, vibe, price };
  const w = SAT.weights;
  const weighted = w.needs * factors.needs + w.queue * factors.queue + w.condition * factors.condition
    + w.vibe * factors.vibe + w.price * factors.price;
  const target = clamp(weighted - penalty + noveltyValue(student, day), 0, 100);
  return { target, factors, penalty, needs };
}

/** Escolhe no máximo 1 reclamação por aluno por dia: a de maior peso. */
function pickComplaint(student, result, academy, exposure, rng) {
  const p = student.profile;
  const candidates = [];
  const { needs, factors } = result;
  for (const t of needs.missingEssentials) {
    const isMania = t === MANIAS[student.mania]?.extraEssential && !PROFILES[p].essentials.includes(t);
    candidates.push({
      weight: isMania ? 2.5 : 3,
      kind: isMania ? 'mania' : 'missing',
      key: t,
      text: isMania ? COMPLAINTS.mania[student.mania] : COMPLAINTS.missingEssential[p](EQUIPMENT_SHORT[t]),
    });
  }
  const mania = MANIAS[student.mania];
  if (mania.vibePenaltyWithout && !academy.metTypes.has(mania.vibePenaltyWithout)) {
    candidates.push({ weight: 2.2, kind: 'mania', key: mania.vibePenaltyWithout, text: COMPLAINTS.mania[student.mania] });
  }
  if (exposure > 0.08) {
    let worstCat = null;
    let worst = 0;
    for (const cat of DEMAND_CATEGORIES) {
      const share = PROFILES[p].categoryShare[cat] ?? 0;
      const q = (student._catQueue?.[cat] ?? 0) * share;
      if (q > worst) { worst = q; worstCat = cat; }
    }
    if (worstCat) {
      const text = student.mania === 'odeia_lotacao' ? COMPLAINTS.mania.odeia_lotacao : COMPLAINTS.queue[p](CATEGORY_SHORT[worstCat]);
      candidates.push({ weight: 2 + exposure * 5, kind: 'queue', key: worstCat, text });
    }
  }
  const brokenNeeded = academy.brokenItems.find((i) => PROFILES[p].essentials.includes(i.type) || PROFILES[p].desired.includes(i.type));
  if (brokenNeeded) candidates.push({ weight: 2, kind: 'broken', key: brokenNeeded.type, text: COMPLAINTS.broken(EQUIPMENT_SHORT[brokenNeeded.type]) });
  if (academy.cleanliness < 60) candidates.push({ weight: 1.5, kind: 'dirty', key: 'dirt', text: COMPLAINTS.dirty });
  if (factors.price < 70) candidates.push({ weight: 1.5, kind: 'price', key: 'price', text: COMPLAINTS.price });
  if (needs.missingDesired.length) {
    const t = needs.missingDesired[Math.floor(nextRandom(rng) * needs.missingDesired.length)];
    candidates.push({ weight: 1, kind: 'missingDesired', key: t, text: COMPLAINTS.missingDesired[p](EQUIPMENT_SHORT[t]) });
  }
  if (factors.vibe < 40) candidates.push({ weight: 0.9, kind: 'vibe', key: 'vibe', text: COMPLAINTS.vibe });

  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates[0];
  if (top && top.weight >= 1) return top;
  if (student.S >= 75) return { weight: 0, kind: 'happy', key: 'happy', text: pick(rng, PRAISES) };
  return top ?? null;
}

export function lowestFactor(factors) {
  return Object.entries(factors).sort((a, b) => a[1] - b[1])[0][0];
}

/** Atualização diária: S caminha 20% em direção ao alvo. */
export function updateSatisfaction(state, academy, rng) {
  const exposure = state.dayExposure;
  const catQueue = state.dayCategoryQueue;
  for (const student of state.students) {
    const exp = exposure[student.profile] ?? 0;
    const result = studentTarget(student, academy, exp, state.fee, state.time.day);
    student.S = clamp(student.S + SAT.dailyApproach * (result.target - student.S), 0, 100);
    student.factors = result.factors;
    student.target = result.target;
    student._catQueue = catQueue;
    student.complaint = pickComplaint(student, result, academy, exp, rng);
    delete student._catQueue;
  }
}

export function cancelProbability(S) {
  const R = CONFIG.retention;
  if (S < R.cancelThreshold) return ((R.cancelThreshold - S) / R.cancelThreshold) * R.cancelMaxDaily;
  return R.baseDailyCancel;
}

export function processCancellations(state, rng) {
  const leaving = [];
  state.students = state.students.filter((s) => {
    if (nextRandom(rng) >= cancelProbability(s.S)) return true;
    const reason = s.factors ? lowestFactor(s.factors) : 'needs';
    leaving.push({
      day: state.time.day,
      name: s.name,
      profile: s.profile,
      reason,
      quote: pick(rng, CANCEL_REASONS[reason]),
      S: Math.round(s.S),
    });
    return false;
  });
  return leaving;
}

export function updateReputation(state) {
  if (!state.students.length) return;
  const avg = averageSatisfaction(state.students);
  const keep = CONFIG.reputation.keep;
  state.reputation = clamp(keep * state.reputation + (1 - keep) * (avg / 20), 0, 5);
}

export function dailyEnrollmentRate(state) {
  const E = CONFIG.enrollment;
  const eraFactor = E.eraFactor[String(state.era)] ?? 1;
  const january = calendarOf(state.time.day).calendarMonth === 0 ? CONFIG.seasonality.januaryEnrollmentMultiplier : 1;
  return Math.max(0, (E.base + (state.reputation - 1) * E.perStarAboveOne) * eraFactor * january);
}

export function processEnrollment(state, academy, rng) {
  const joined = [];
  state.enrollAcc += dailyEnrollmentRate(state);
  while (state.enrollAcc >= 1 && state.students.length < academy.maxMembers) {
    state.enrollAcc -= 1;
    const s = createStudent(state, rng);
    state.students.push(s);
    joined.push(s);
  }
  // Sem vaga, o interesse acumulado não cresce sem limite.
  state.enrollAcc = Math.min(state.enrollAcc, 3);
  return joined;
}

export function averageSatisfaction(students) {
  if (!students.length) return 0;
  return students.reduce((sum, s) => sum + s.S, 0) / students.length;
}

export function maybeReview(state, rng) {
  if (!state.students.length || nextRandom(rng) > CONFIG.reviews.dailyChance) return null;
  const s = pick(rng, state.students);
  if (!s.factors) return null;
  const entries = Object.entries(s.factors).sort((a, b) => b[1] - a[1]);
  const best = entries[0][0];
  const worst = entries[entries.length - 1];
  const stars = clamp(Math.round(s.S / 20), 1, 5);
  const text = worst[1] < 70 ? `${capitalize(REVIEW_GOOD[best])}, ${REVIEW_BAD[worst[0]]}.` : `${capitalize(REVIEW_GOOD[best])}! Recomendo.`;
  return { day: state.time.day, name: s.name, profile: s.profile, stars, text };
}

function capitalize(t) {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Bônus de novidade: +5 de satisfação que decai em alguns dias. */
export function grantNovelty(state, type, bonus = SAT.noveltyBonus, days = SAT.noveltyDays) {
  const affected = [];
  for (const s of state.students) {
    const p = PROFILES[s.profile];
    const wants = p.essentials.includes(type) || p.desired.includes(type) || MANIAS[s.mania]?.extraEssential === type;
    if (!wants && type !== '*') continue;
    s.novelty = { startDay: state.time.day, bonus, days };
    affected.push(s);
  }
  return affected;
}
