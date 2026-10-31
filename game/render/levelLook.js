// Cara de cada nível de aparelho (1 a 3), igual no 3D e no 2D.
// O nível 1 é o visual padrão de todo item; os níveis 2 e 3 trocam as cores
// da paleta (estrutura, estofado, metal, anilhas, madeira...) e ganham adornos.
import { PALETTE as P } from './draw/primitives.js';

const WOOD = '#c9a27a';
const WOOD_DARK = '#b88a55';
const VASE = '#c9845a';
const MAT = '#d6c7b4';
const MAT_LINE = '#c2b29e';
const MAT_LIGHT = '#ddd5c8';
const RACK = '#d9cfc0';

export const LEVEL_LOOK = {
  1: {
    level: 1,
    label: 'Padrão',
    accent: '#a9adbd',
    trim: null,
    remap: {},
  },
  2: {
    level: 2,
    label: 'Reforçado',
    accent: '#5d9cc9',
    trim: '#5d9cc9',
    badge: '#8ec5e8',
    remap: {
      [P.metalDark]: '#5f7fa6',
      [P.metal]: '#e4e9f1',
      [P.pad]: '#41639a',
      [P.padDark]: '#2f4a75',
      [P.plate]: '#46587a',
      [MAT]: '#c3cfdf',
      [MAT_LINE]: '#aebdd2',
      [MAT_LIGHT]: '#cbd6e4',
      [RACK]: '#cbd6e4',
      [WOOD]: '#a8794f',
      [WOOD_DARK]: '#8f6440',
      [VASE]: '#5d9cc9',
    },
  },
  3: {
    level: 3,
    label: 'Topo de linha',
    accent: '#f2cd5c',
    trim: '#3d3550',
    badge: '#f2cd5c',
    led: '#7ef0e0',
    remap: {
      [P.metalDark]: '#3e3a4c',
      [P.metal]: '#e9c46a',
      [P.pad]: '#7d2f42',
      [P.padDark]: '#5e2231',
      [P.plate]: '#2e2a3d',
      [P.rubber]: '#2e2a3d',
      [MAT]: '#57506a',
      [MAT_LINE]: '#6a6280',
      [MAT_LIGHT]: '#5e5772',
      [RACK]: '#5e5772',
      [WOOD]: '#6f4a32',
      [WOOD_DARK]: '#5a3a26',
      [VASE]: '#f2cd5c',
    },
  },
};

/** Visual do nível (1 a 3; qualquer outro valor cai no mais próximo). */
export function levelLook(level) {
  const n = Math.min(3, Math.max(1, Math.floor(Number(level) || 1)));
  return LEVEL_LOOK[n];
}

/** Troca uma cor da paleta pela do nível (cores fora do mapa ficam iguais). */
export function levelColor(level, hex) {
  if (typeof hex !== 'string') return hex;
  return levelLook(level).remap[hex.toLowerCase()] ?? hex;
}

const paletteCache = new Map();
/** Paleta completa já com as cores do nível (para os desenhos 2D). */
export function levelPalette(level) {
  const look = levelLook(level);
  let pal = paletteCache.get(look.level);
  if (!pal) {
    pal = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, look.remap[v] ?? v]));
    paletteCache.set(look.level, pal);
  }
  return pal;
}
