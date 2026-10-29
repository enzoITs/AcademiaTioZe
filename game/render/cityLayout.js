// Planta da cidade ao redor da academia: ruas, quarteirões, lotes com casas,
// lojas e prédios, praças, árvores e postes. Pura (sem desenho): o 3D e o 2D
// de reserva montam a partir dela. Unidades em células (1 = um quadrado da
// grade); a academia ocupa [0, cols] × [0, rows] e a rua principal passa logo
// abaixo (z de rows + 0,25 a rows + 3,25), como no desenho do terreno.
import { createRng, nextRandom } from '../utils/random.js';

export const STREET = 2.6; // largura das ruas laterais e dos fundos
export const BLOCK = 7; // profundidade de um quarteirão
const WALK = 0.6; // calçada em volta do quarteirão
const GAP = 0.9; // recuo entre a academia e os vizinhos
export const MAIN = { z0: 0.25, z1: 3.25 }; // rua principal, relativa a rows

/** Mistura de construções de cada tipo de bairro. */
export const THEMES = {
  residencial: {
    ground: '#d6ebc6',
    acad: { house: 6, sobrado: 2, park: 1 },
    inner: { house: 5, sobrado: 3, shop: 1, predio: 1, park: 1 },
    outer: { tree: 6, house: 2, park: 2 },
  },
  comercial: {
    ground: '#e3e7dc',
    acad: { shop: 5, sobrado: 2, house: 1 },
    inner: { shop: 5, predio: 2, sobrado: 2, park: 1 },
    outer: { tree: 4, shop: 2, predio: 2, park: 1 },
  },
  centro: {
    ground: '#e6e3dd',
    acad: { shop: 3, predio: 4 },
    inner: { torre: 4, predio: 3, shop: 2, park: 1 },
    outer: { torre: 3, predio: 2, tree: 3 },
  },
  industrial: {
    ground: '#e0dbd2',
    acad: { galpao: 5, house: 2, shop: 1 },
    inner: { galpao: 5, fabrica: 3, park: 1 },
    outer: { tree: 4, galpao: 3, fabrica: 2 },
  },
  verde: {
    ground: '#d6ebc6',
    acad: { house: 3, park: 3, sobrado: 1 },
    inner: { park: 4, house: 3, sobrado: 1 },
    outer: { tree: 7, park: 2 },
    bigPark: true,
  },
  rio: {
    ground: '#d6ebc6',
    acad: { house: 4, sobrado: 2, park: 1 },
    inner: { house: 4, sobrado: 2, shop: 1, park: 2 },
    outer: { tree: 6, house: 2 },
    river: true,
  },
};

// Altura (em células) de cada tipo; o teto do lote rebaixa o tipo se precisar.
const HEIGHT = {
  house: [1.0, 1.25], sobrado: [1.6, 1.9], shop: [1.2, 1.9], predio: [2.2, 3.6], torre: [3.8, 7.0],
  galpao: [1.3, 1.7], fabrica: [1.5, 2.0], megafit: [2.3, 2.3], museu: [1.05, 1.05], park: [0, 0], tree: [0, 0],
};
const DOWNGRADE = { torre: 'predio', predio: 'sobrado', sobrado: 'house', fabrica: 'galpao' };

const WALLS = ['#fffdf8', '#f3e3d3', '#f6d7c3', '#e3ecd9', '#e2ecf3', '#ece6f2', '#fdf0cc', '#f5dfe6'];
const ROOFS = ['#e07b5c', '#c96a4f', '#8e9bb5', '#7f6a8e', '#b5735a', '#d98c6a'];
const AWNINGS = ['#e8646a', '#8ec5e8', '#7cc98a', '#f2cd5c', '#b9a3e3', '#f29a5c'];
const GLASS = ['#bfe3f5', '#a9d3ea', '#cfe3ef', '#b9d6e8'];
const CONCRETE = ['#dfe2ea', '#e6e1d8', '#d6d0dd', '#e9e4dc'];
const INDUSTRY = ['#d9d2c5', '#cfc8bb', '#c9d1d6', '#e0d6c6'];
export const SHOP_LABELS = ['PADARIA', 'FARMÁCIA', 'MERCADINHO', 'SALÃO', 'AÇAÍ', 'PET SHOP', 'PAPELARIA', 'LANCHES', 'SORVETES', 'BARBEARIA', 'FLORICULTURA', 'BAZAR'];
const MAX_LABELS = 9;

const rand = (rng, a, b) => a + nextRandom(rng) * (b - a);
const pickOf = (rng, list) => list[Math.floor(nextRandom(rng) * list.length)];
function weighted(rng, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = nextRandom(rng) * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

/** Divide um comprimento em pedaços de min a max (o último absorve a sobra). */
function split(rng, length, min, max) {
  const out = [];
  let left = length;
  while (left > 0.01) {
    let w = rand(rng, min, max);
    if (left - w < min) w = left;
    out.push(w);
    left -= w;
  }
  return out;
}

/**
 * Planta completa. `landmarks`: 'armando' (casa do vizinho e o Fusca), 'museu'
 * (a garagem do Tio Zé, que vira Matriz Histórica na Era 4) e 'megafit' (a
 * academia da Valéria, do outro lado da rua).
 */
export function cityPlan({ cols, rows, door = { x: 1, y: rows - 1 }, theme = 'residencial', seed = 1, landmarks = [], historic = false }) {
  const T = THEMES[theme] ?? THEMES.residencial;
  const rng = createRng((seed * 2654435761) >>> 0 || 1);
  const xl = -(GAP + 6.2); // borda interna da rua lateral esquerda
  const xr = cols + GAP + 6.2;
  const zb = -(GAP + 6.2);
  const mainZ0 = rows + MAIN.z0;
  const mainZ1 = rows + MAIN.z1;
  const W1 = [xl - STREET, xl];
  const E1 = [xr, xr + STREET];
  const N1 = [zb - STREET, zb];
  const W2 = [W1[0] - BLOCK - STREET, W1[0] - BLOCK];
  const E2 = [E1[1] + BLOCK, E1[1] + BLOCK + STREET];
  const N2 = [N1[0] - BLOCK - STREET, N1[0] - BLOCK];
  const S1 = [mainZ1 + BLOCK, mainZ1 + BLOCK + STREET];
  const X0 = W2[0] - BLOCK;
  const X1 = E2[1] + BLOCK;
  const Z0 = N2[0] - BLOCK;
  const Z1 = S1[1] + BLOCK;
  const bounds = { x0: X0, z0: Z0, x1: X1, z1: Z1 };

  const streets = [];
  const bridges = [];
  // Rio: corre no lugar do quarteirão de trás, com pontes nas ruas laterais.
  const river = T.river ? { x0: X0, z0: N2[1] + 0.8, x1: X1, z1: N1[0] - 0.8 } : null;
  for (const [a, b] of [W2, W1, E1, E2]) {
    streets.push({ x0: a, z0: Z0, x1: b, z1: Z1, dir: 'v' });
    if (river) bridges.push({ x0: a - 0.2, z0: river.z0 - 0.3, x1: b + 0.2, z1: river.z1 + 0.3 });
  }
  for (const [a, b] of [N2, N1, S1]) streets.push({ x0: X0, z0: a, x1: X1, z1: b, dir: 'h' });

  const cols5 = [[X0, W2[0], 'outer'], [W2[1], W1[0], 'inner'], [W1[1], E1[0], 'acad'], [E1[1], E2[0], 'inner'], [E2[1], X1, 'outer']];
  const rows5 = [[Z0, N2[0], 'outer'], [N2[1], N1[0], 'inner'], [N1[1], mainZ0, 'acad'], [mainZ1, S1[0], 'inner'], [S1[1], Z1, 'outer']];

  const blocks = [];
  const lots = [];
  const trees = [];
  const lamps = [];
  const parked = [];
  let labels = 0;
  // letreiros sem repetir: a ordem das lojas é sorteada uma vez por cidade
  const labelPool = [...SHOP_LABELS].sort(() => nextRandom(rng) - 0.5);

  const addLot = (lot, ring) => {
    let kind = lot.kind ?? weighted(rng, T[ring] ?? T.inner);
    if (kind === 'tree') {
      // quarteirão de borda: só árvores, para a cidade terminar suave
      const n = Math.max(1, Math.round(((lot.x1 - lot.x0) * (lot.z1 - lot.z0)) / 5));
      for (let i = 0; i < n; i++) trees.push({ x: rand(rng, lot.x0 + 0.4, lot.x1 - 0.4), z: rand(rng, lot.z0 + 0.4, lot.z1 - 0.4), s: rand(rng, 0.8, 1.3) });
      return;
    }
    const cap = lot.cap ?? 99;
    while (HEIGHT[kind] && HEIGHT[kind][0] > cap && DOWNGRADE[kind]) kind = DOWNGRADE[kind];
    const [h0, h1] = HEIGHT[kind] ?? [1, 1.2];
    const h = Math.min(cap, rand(rng, h0, h1));
    const out = { ...lot, kind, h, seed: Math.floor(nextRandom(rng) * 1e6) };
    if (kind === 'house' || kind === 'sobrado' || kind === 'museu') {
      out.wall = pickOf(rng, WALLS);
      out.roof = pickOf(rng, ROOFS);
    } else if (kind === 'shop') {
      out.wall = pickOf(rng, WALLS);
      out.accent = pickOf(rng, AWNINGS);
      if ((lot.face === 's' || lot.face === 'e') && labels < MAX_LABELS && (lot.x1 - lot.x0 >= 2.6 || lot.z1 - lot.z0 >= 2.6)) {
        out.label = labelPool[labels % labelPool.length];
        labels += 1;
      }
    } else if (kind === 'predio') {
      out.wall = pickOf(rng, [...WALLS, ...CONCRETE]);
      out.floors = Math.max(3, Math.round(h / 0.62));
    } else if (kind === 'torre') {
      out.wall = pickOf(rng, GLASS);
      out.trim = pickOf(rng, CONCRETE);
      out.floors = Math.max(5, Math.round(h / 0.6));
    } else if (kind === 'galpao' || kind === 'fabrica') {
      out.wall = pickOf(rng, INDUSTRY);
      out.roof = pickOf(rng, ['#8e9bb5', '#9aa0b5', '#b5735a']);
    }
    // janelas acesas à noite (sorteadas por lote, sempre iguais)
    out.lit = nextRandom(rng);
    lots.push(out);
    if (kind === 'park') {
      const n = Math.max(2, Math.round(((lot.x1 - lot.x0) * (lot.z1 - lot.z0)) / 4));
      for (let i = 0; i < n; i++) trees.push({ x: rand(rng, lot.x0 + 0.5, lot.x1 - 0.5), z: rand(rng, lot.z0 + 0.5, lot.z1 - 0.5), s: rand(rng, 0.9, 1.4) });
    }
  };

  /** Lotes de um quarteirão: duas fileiras de costas, de frente para as ruas. */
  const fillBlock = (x0, z0, x1, z1, ring, opts = {}) => {
    const ix0 = x0 + WALK;
    const iz0 = z0 + WALK;
    const ix1 = x1 - WALK;
    const iz1 = z1 - WALK;
    if (ix1 - ix0 < 1.5 || iz1 - iz0 < 1.5) return;
    blocks.push({ x0, z0, x1, z1, ring });
    if (opts.park || (T.bigPark && ring === 'inner' && nextRandom(rng) < 0.35)) {
      lots.push({ x0: ix0, z0: iz0, x1: ix1, z1: iz1, kind: 'park', big: true, h: 0, pond: true, seed: Math.floor(nextRandom(rng) * 1e6) });
      const n = Math.round(((ix1 - ix0) * (iz1 - iz0)) / 6);
      for (let i = 0; i < n; i++) {
        const x = rand(rng, ix0 + 0.5, ix1 - 0.5);
        const z = rand(rng, iz0 + 0.5, iz1 - 0.5);
        const cx = (ix0 + ix1) / 2;
        const cz = (iz0 + iz1) / 2;
        if (Math.abs(x - cx) < 1.6 && Math.abs(z - cz) < 1.1) continue; // laguinho no meio
        trees.push({ x, z, s: rand(rng, 0.9, 1.4) });
      }
      return;
    }
    const wide = ix1 - ix0 >= iz1 - iz0;
    if (wide) {
      const half = (iz1 - iz0) / 2;
      const rowsOf = half >= 2.2 ? [[iz0, iz0 + half, 'n', opts.capN], [iz0 + half, iz1, 's', opts.capS]] : [[iz0, iz1, opts.face ?? 's', opts.capS]];
      for (const [a, b, face, cap] of rowsOf) {
        let x = ix0;
        for (const w of split(rng, ix1 - ix0, 2.6, 4.4)) {
          addLot({ x0: x + 0.12, z0: a + 0.12, x1: x + w - 0.12, z1: b - 0.12, face, cap }, ring);
          x += w;
        }
      }
    } else {
      const half = (ix1 - ix0) / 2;
      const colsOf = half >= 2.2 ? [[ix0, ix0 + half, 'w', opts.capW], [ix0 + half, ix1, 'e', opts.capE]] : [[ix0, ix1, opts.face ?? 'e', opts.capE]];
      for (const [a, b, face, cap] of colsOf) {
        let z = iz0;
        for (const d of split(rng, iz1 - iz0, 2.6, 4.4)) {
          addLot({ x0: a + 0.12, z0: z + 0.12, x1: b - 0.12, z1: z + d - 0.12, face, cap }, ring);
          z += d;
        }
      }
    }
  };

  for (const [cx0, cx1, cring] of cols5) {
    for (const [rz0, rz1, rring] of rows5) {
      const ring = cring === 'outer' || rring === 'outer' ? 'outer' : cring === 'acad' && rring === 'acad' ? 'center' : 'inner';
      if (ring === 'center') continue;
      if (river && rz0 === N2[1]) continue; // o rio passa aqui
      // Do outro lado da rua (ao sul), a fileira de frente fica baixa para não
      // esconder a rua; ao leste, a câmera olha por cima dos vizinhos.
      const southFront = rz0 === mainZ1;
      fillBlock(cx0, rz0, cx1, rz1, ring, {
        capN: southFront ? 2.6 : undefined,
        capW: cx0 === E1[1] && rring === 'acad' ? 2.4 : undefined,
      });
    }
  }

  // Quarteirão da academia: vizinhos à esquerda, à direita e nos fundos.
  const A = { x0: xl, z0: zb, x1: xr, z1: mainZ0 };
  blocks.push({ ...A, ring: 'acad', academy: true });
  const strip = (x0, z0, x1, z1, face, cap, along) => {
    if (x1 - x0 < 1.2 || z1 - z0 < 1.2) return [];
    const made = [];
    if (along === 'z') {
      let z = z0;
      for (const d of split(rng, z1 - z0, 2.8, 4.2)) {
        made.push({ x0: x0 + 0.12, z0: z + 0.12, x1: x1 - 0.12, z1: z + d - 0.12, face, cap });
        z += d;
      }
    } else {
      let x = x0;
      for (const w of split(rng, x1 - x0, 2.8, 4.4)) {
        made.push({ x0: x + 0.12, z0: z0 + 0.12, x1: x + w - 0.12, z1: z1 - 0.12, face, cap });
        x += w;
      }
    }
    return made;
  };
  const west = strip(xl + WALK, zb + WALK, -GAP, rows, 'w', 2.6, 'z');
  const east = strip(cols + GAP, zb + WALK, xr - WALK, rows, 'e', 2.2, 'z');
  const north = strip(-GAP, zb + WALK, cols + GAP, -GAP, 'n', undefined, 'x');

  // Pontos de referência da história.
  if (landmarks.includes('museu') && west.length) {
    const lot = west[west.length - 1];
    lot.kind = 'museu';
    lot.label = historic ? 'MATRIZ HISTÓRICA' : 'MUSEU DO TIO ZÉ';
    lot.face = 'e';
  }
  if (landmarks.includes('armando') && east.length) {
    const lot = east[east.length - 1];
    lot.kind = 'house';
    lot.label = 'SEU ARMANDO';
    lot.armando = true;
    parked.push({ x: E1[0] + 0.7, z: (lot.z0 + lot.z1) / 2, dir: 'v', color: '#8ec5e8', fusca: true });
  }
  for (const lot of west) addLot(lot, 'acad');
  for (const lot of east) addLot(lot, 'acad');
  for (const lot of north) addLot(lot, 'acad');

  if (landmarks.includes('megafit')) {
    // a lot da fileira de frente, do outro lado da rua, mais perto da porta
    const front = lots
      .filter((l) => l.face === 'n' && l.z0 > mainZ1 && l.z0 < mainZ1 + BLOCK)
      .sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - door.x - 3) - Math.abs((b.x0 + b.x1) / 2 - door.x - 3))[0];
    if (front) Object.assign(front, { kind: 'megafit', h: HEIGHT.megafit[0], label: 'MegaFit', wall: '#dfe2ea', accent: '#8ec5e8' });
  }

  // Árvores de calçada e postes ao longo das ruas.
  for (const b of blocks) {
    if (b.academy) continue;
    for (let x = b.x0 + 1.2; x < b.x1 - 0.8; x += rand(rng, 3.2, 4.6)) {
      trees.push({ x, z: b.z0 + 0.3, s: 0.7, street: true });
      trees.push({ x, z: b.z1 - 0.3, s: 0.7, street: true });
    }
  }
  for (let x = X0 + 2; x < X1 - 1; x += 5) {
    lamps.push({ x, z: rows + 0.42 });
    lamps.push({ x: x + 2.5, z: mainZ1 + 0.3 });
  }
  // Carros estacionados nas ruas laterais e dos fundos.
  const carColors = ['#e8646a', '#8ec5e8', '#fffdf8', '#f2cd5c', '#7cc98a', '#b9a3e3', '#4a4560', '#f29a5c'];
  for (const s of streets) {
    const n = s.dir === 'v' ? Math.floor((s.z1 - s.z0) / 7) : Math.floor((s.x1 - s.x0) / 8);
    for (let i = 0; i < n; i++) {
      if (nextRandom(rng) < 0.45) continue;
      if (s.dir === 'v') {
        const z = s.z0 + (i + 0.5) * ((s.z1 - s.z0) / n);
        if (z > mainZ0 - 1 && z < mainZ1 + 1) continue; // nada no cruzamento
        if (river && z > river.z0 - 0.5 && z < river.z1 + 0.5) continue;
        parked.push({ x: s.x0 + 0.45, z, dir: 'v', color: pickOf(rng, carColors) });
      } else {
        const x = s.x0 + (i + 0.5) * ((s.x1 - s.x0) / n);
        parked.push({ x, z: s.z0 + 0.45, dir: 'h', color: pickOf(rng, carColors) });
      }
    }
  }

  return {
    theme, ground: T.ground, bounds, streets, bridges, river, blocks, lots, trees, lamps, parked,
    main: { z0: mainZ0, z1: mainZ1, lanes: [mainZ0 + 0.85, mainZ0 + 2.2] },
    sidewalks: [rows + 0.36, mainZ1 + 0.3],
    sideStreets: [W1, E1].map(([a, b]) => (a + b) / 2),
  };
}

/** Bairro de cada era da Matriz: garagem em rua de casas, ponto em rua de comércio, prédio no centro. */
export function matrizTheme(era) {
  if (era <= 1) return 'residencial';
  if (era === 2) return 'comercial';
  return 'centro';
}

export function matrizLandmarks(era) {
  if (era <= 1) return ['armando'];
  if (era === 2) return ['museu', 'armando'];
  return ['museu', 'megafit'];
}
