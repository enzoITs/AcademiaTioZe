// Cores do cenário compartilhadas pelos renderizadores 3D e 2D.
import { decorFloorColors, decorWallColor } from '../systems/decor.js';

export const ZONE_FLOOR = {
  garagem: ['#ece4d6', '#e4dac9'],
  quintal: ['#e3ecd9', '#d9e4cd'],
  puxadinho: ['#e9e3f1', '#dfd7ea'],
  varanda: ['#f3e3d3', '#ebd6c2'],
  galpao: ['#e1e3ea', '#d6d9e2'],
  terraco: ['#dcebef', '#cfe2e7'],
  ponto: ['#f1e6d8', '#e8dac8'],
  sala_fundos: ['#e2ecf3', '#d6e3ec'],
  sobreloja: ['#ece6f2', '#e1d9ea'],
  predio: ['#eef0f4', '#e3e7ee'],
  ala_aulas: ['#ecd9bd', '#e3cdac'],
  terraco_predio: ['#dcefe6', '#cfe6da'],
  complexo: ['#f0dfc4', '#e8d3b2'],
  parque_aquatico: ['#d8eef3', '#c8e5ec'],
  ginasio_lutas: ['#e9d9e8', '#dfcbdd'],
  pista_coberta: ['#f2c7b8', '#ebb8a6'],
};

// Cara de cada era: parede, letreiro e porta (portão de enrolar na garagem,
// porta com toldo listrado no ponto de bairro).
export const ERA_LOOK = {
  1: { wall: '#c8b6dc', door: 'gate', sign: { fill: '#f2cd5c', ink: '#3d3550', lines: ['ACADEMIA', 'DO TIO ZÉ'], w: 76 } },
  2: { wall: '#ecc9b4', door: 'awning', sign: { fill: '#fffdf8', ink: '#c94f55', sub: '#5d9cc9', lines: ['ACADEMIA DO TIO ZÉ', 'ponto de bairro · desde 1987'], w: 110 } },
  // prédio de vidro com neon: paredes azul-vidro com montantes brancos e letreiro escuro que brilha
  3: {
    wall: '#cfe3ef', mullion: '#fffdf8', door: 'glass',
    sign: { fill: '#3d3550', ink: '#ff7eb6', sub: '#7ef0e0', lines: ['ACADEMIA DO TIO ZÉ', 'academia completa · desde 1987'], w: 124, neon: true },
  },
  // Rede: o mesmo prédio, agora Matriz, com bandeirinhas na fachada
  4: {
    wall: '#cfe3ef', mullion: '#fffdf8', door: 'glass', bunting: true,
    sign: { fill: '#3d3550', ink: '#f2cd5c', sub: '#7ef0e0', lines: ['ACADEMIA DO TIO ZÉ', 'matriz da rede · desde 1987'], w: 124, neon: true },
  },
  // Centro Esportivo: ginásio de paredes verde-quadra, porta de vidro e letreiro de clube
  5: {
    wall: '#cfe6d2', mullion: '#fffdf8', door: 'glass', bunting: true,
    sign: { fill: '#2f6f9f', ink: '#fffdf8', sub: '#f2cd5c', lines: ['CENTRO ESPORTIVO TIO ZÉ', 'matriz da rede · desde 1987'], w: 140, neon: true },
  },
};
export const eraLook = (era) => ERA_LOOK[era] ?? ERA_LOOK[1];
/** Cara da cena: a filial traz a sua (cor do estilo e letreiro próprio); a Matriz usa a da era (e a reforma). */
export function lookOf(state) {
  if (state?.look) return state.look;
  const base = eraLook(state?.era ?? 1);
  const wall = decorWallColor(state);
  return wall ? { ...base, wall } : base;
}
// Pisos dos terrenos gerados: alternam numa paleta pastel.
export const PROC_FLOORS = [
  ['#efe6dc', '#e6dbcd'], ['#e2ecf3', '#d6e3ec'], ['#ece6f2', '#e1d9ea'],
  ['#e6efe0', '#dbe7d3'], ['#f3e8d8', '#ebdcc6'], ['#e4e8ec', '#d9dee4'],
];
export const floorOf = (zone, state = null) => decorFloorColors(state)
  ?? zone.floor ?? ZONE_FLOOR[zone.id] ?? PROC_FLOORS[(Number(zone.id.split('-')[1]) || 0) % PROC_FLOORS.length];
export const BLOCK_TINT = ['rgba(255,214,150,0.07)', 'rgba(255,255,255,0)', 'rgba(70,80,160,0.12)'];
