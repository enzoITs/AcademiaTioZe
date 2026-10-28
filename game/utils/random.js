// RNG determinístico (mulberry32). O estado vive na partida para que a
// simulação seja reproduzível e possa ser salva.

export function createRng(seed) {
  return { s: seed >>> 0 };
}

export function nextRandom(rng) {
  rng.s = (rng.s + 0x6d2b79f5) >>> 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(rng, min, max) {
  return min + Math.floor(nextRandom(rng) * (max - min + 1));
}

export function pick(rng, list) {
  return list[Math.floor(nextRandom(rng) * list.length)];
}

export function weightedPick(rng, entries) {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = nextRandom(rng) * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
