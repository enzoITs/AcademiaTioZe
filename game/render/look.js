// Cores do cenário compartilhadas pelos renderizadores 3D e 2D.

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
};

// Cara de cada era: parede, letreiro e porta (portão de enrolar na garagem,
// porta com toldo listrado no ponto de bairro).
export const ERA_LOOK = {
  1: { wall: '#c8b6dc', door: 'gate', sign: { fill: '#f2cd5c', ink: '#3d3550', lines: ['ACADEMIA', 'DO TIO ZÉ'], w: 76 } },
  2: { wall: '#ecc9b4', door: 'awning', sign: { fill: '#fffdf8', ink: '#c94f55', sub: '#5d9cc9', lines: ['ACADEMIA DO TIO ZÉ', 'ponto de bairro · desde 1987'], w: 110 } },
};
export const eraLook = (era) => ERA_LOOK[era] ?? ERA_LOOK[1];
// Pisos dos terrenos gerados: alternam numa paleta pastel.
export const PROC_FLOORS = [
  ['#efe6dc', '#e6dbcd'], ['#e2ecf3', '#d6e3ec'], ['#ece6f2', '#e1d9ea'],
  ['#e6efe0', '#dbe7d3'], ['#f3e8d8', '#ebdcc6'], ['#e4e8ec', '#d9dee4'],
];
export const floorOf = (zone) => ZONE_FLOOR[zone.id] ?? PROC_FLOORS[(Number(zone.id.split('-')[1]) || 0) % PROC_FLOORS.length];
export const BLOCK_TINT = ['rgba(255,214,150,0.07)', 'rgba(255,255,255,0)', 'rgba(70,80,160,0.12)'];
