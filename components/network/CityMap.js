'use client';
// Mapa da cidade da Era 4: a Matriz no centro, a Matriz Histórica (a garagem),
// a MegaFit da Valéria, as filiais com bandeirinhas e os lotes à venda.
import { formatMoney } from '../../game/utils/format.js';
import { MAP_SPOTS, STYLES, lotCost, districtName, districtOf } from '../../game/systems/network.js';

const CELL = 12; // quarteirão (10) + rua (2)
const BLOCK = 10;

const at = (spot) => ({ x: spot.gx * CELL, y: spot.gy * CELL });
/** Tamanho de fonte para o texto caber na largura do quarteirão. */
const fit = (text, max) => ({ fontSize: `${Math.min(max, (BLOCK - 0.8) / (String(text).length * 0.56)).toFixed(2)}px` });

/** Quarteirão comum da cidade: casinhas e árvores, sempre iguais no mesmo lugar. */
function Filler({ gx, gy }) {
  const x = gx * CELL;
  const y = gy * CELL;
  const h = Math.abs(gx * 73856093 ^ gy * 19349663);
  const roofs = ['#f29a8e', '#8ec5e8', '#f2cd5c', '#b9a3e3', '#a8e6cf'];
  const houses = [[-2.6, -2.2], [1.8, -2.6], [-2, 1.8], [2.4, 1.6]].filter((_, i) => (h >> i) & 1 || i === h % 4);
  return (
    <g aria-hidden="true">
      <rect x={x - BLOCK / 2} y={y - BLOCK / 2} width={BLOCK} height={BLOCK} rx="1.2" fill="#d8ebc9" />
      {houses.map(([dx, dy], i) => (
        <g key={i}>
          <rect x={x + dx - 1.1} y={y + dy - 0.6} width="2.2" height="1.7" fill="#fffdf8" stroke="#9a92ad" strokeWidth="0.2" />
          <path d={`M${x + dx - 1.4} ${y + dy - 0.5} L${x + dx} ${y + dy - 1.7} L${x + dx + 1.4} ${y + dy - 0.5} Z`} fill={roofs[(h + i) % roofs.length]} stroke="#9a92ad" strokeWidth="0.2" />
        </g>
      ))}
      {[[0.2, 0.1], [-3.6, 3.4], [3.6, -0.4]].filter((_, i) => (h >> (i + 4)) & 1).map(([dx, dy], i) => (
        <circle key={`t${i}`} cx={x + dx} cy={y + dy} r="0.9" fill="#9ccf8a" stroke="#7fb36e" strokeWidth="0.2" />
      ))}
    </g>
  );
}

function Flag({ x, y, color }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1="0" y1="0" x2="0" y2="-5.2" stroke="#3d3550" strokeWidth="0.35" strokeLinecap="round" />
      <path className="city-flag" d="M0 -5.2 L3 -4.4 L0 -3.5 Z" fill={color} stroke="#3d3550" strokeWidth="0.25" strokeLinejoin="round" />
    </g>
  );
}

/** Varal de bandeirinhas coloridas (festa da rede). */
function Bunting({ x1, x2, y }) {
  const colors = ['#f2cd5c', '#e8646a', '#8ec5e8', '#7cc98a', '#b9a3e3'];
  const n = Math.max(3, Math.round((x2 - x1) / 1.4));
  const step = (x2 - x1) / n;
  return (
    <g aria-hidden="true">
      <path d={`M${x1} ${y} Q${(x1 + x2) / 2} ${y + 1.2} ${x2} ${y}`} stroke="#3d3550" strokeWidth="0.15" fill="none" />
      {Array.from({ length: n }, (_, i) => {
        const cx = x1 + step * (i + 0.5);
        const t = (i + 0.5) / n;
        const cy = y + 2.4 * t * (1 - t);
        return <path key={i} d={`M${cx - 0.5} ${cy} L${cx + 0.5} ${cy} L${cx} ${cy + 0.9} Z`} fill={colors[i % colors.length]} />;
      })}
    </g>
  );
}

function Matriz({ spot, selected, onSelect }) {
  const { x, y } = at(spot);
  return (
    <g className={`city-spot ${selected ? 'sel' : ''}`} onClick={() => onSelect({ kind: 'matriz' })} role="button" tabIndex={0} aria-label="Matriz">
      <rect x={x - BLOCK / 2} y={y - BLOCK / 2} width={BLOCK} height={BLOCK} rx="1.2" className="city-block" />
      <rect x={x - 3.6} y={y - 3.4} width="7.2" height="6" rx="0.5" fill="#cfe3ef" stroke="#3d3550" strokeWidth="0.35" />
      {[-2.4, -0.8, 0.8, 2.4].map((dx) => <line key={dx} x1={x + dx} y1={y - 3.2} x2={x + dx} y2={y + 2.4} stroke="#fffdf8" strokeWidth="0.25" />)}
      <rect x={x - 3.2} y={y - 4.6} width="6.4" height="1.5" rx="0.3" fill="#3d3550" />
      <text x={x} y={y - 3.5} textAnchor="middle" className="city-neon">MATRIZ</text>
      <rect x={x - 0.7} y={y + 1.2} width="1.4" height="1.4" fill="#bfe3f5" stroke="#3d3550" strokeWidth="0.25" />
      <Bunting x1={x - 3.6} x2={x + 3.6} y={y - 3.0} />
      <text x={x} y={y + 4.4} textAnchor="middle" className="city-label">Matriz</text>
    </g>
  );
}

function Historica({ spot, selected, onSelect }) {
  const { x, y } = at(spot);
  return (
    <g className={`city-spot ${selected ? 'sel' : ''}`} onClick={() => onSelect({ kind: 'historica' })} role="button" tabIndex={0} aria-label="Matriz Histórica">
      <rect x={x - BLOCK / 2} y={y - BLOCK / 2} width={BLOCK} height={BLOCK} rx="1.2" className="city-block" />
      <rect x={x - 2.6} y={y - 1.6} width="5.2" height="3.6" fill="#c8b6dc" stroke="#3d3550" strokeWidth="0.35" />
      <path d={`M${x - 3.1} ${y - 1.5} L${x} ${y - 3.6} L${x + 3.1} ${y - 1.5} Z`} fill="#f29a8e" stroke="#3d3550" strokeWidth="0.35" strokeLinejoin="round" />
      <rect x={x - 1.6} y={y - 0.4} width="3.2" height="2.4" fill="#9aa0b5" stroke="#3d3550" strokeWidth="0.25" />
      {[0.2, 0.8, 1.4].map((dy) => <line key={dy} x1={x - 1.5} y1={y + dy} x2={x + 1.5} y2={y + dy} stroke="#7f8499" strokeWidth="0.15" />)}
      <rect x={x - 2.4} y={y - 2.9} width="4.8" height="1.1" rx="0.25" fill="#f2cd5c" stroke="#3d3550" strokeWidth="0.2" />
      <text x={x} y={y - 2.07} textAnchor="middle" className="city-tiny">MUSEU</text>
      <Flag x={x + 3.2} y={y + 2} color="#f2cd5c" />
      <text x={x} y={y + 4.4} textAnchor="middle" className="city-label">Matriz Histórica</text>
    </g>
  );
}

function MegaFit({ spot }) {
  const { x, y } = at(spot);
  return (
    <g className="city-spot rival" aria-label="MegaFit da Valéria">
      <rect x={x - BLOCK / 2} y={y - BLOCK / 2} width={BLOCK} height={BLOCK} rx="1.2" className="city-block" />
      <rect x={x - 3.4} y={y - 3.4} width="6.8" height="5.8" rx="0.4" fill="#dfe2ea" stroke="#3d3550" strokeWidth="0.35" />
      <rect x={x - 3} y={y - 4.4} width="6" height="1.4" rx="0.3" fill="#8ec5e8" stroke="#3d3550" strokeWidth="0.25" />
      <text x={x} y={y - 3.4} textAnchor="middle" className="city-tiny">MegaFit</text>
      {[-2, 0, 2].map((dx) => <rect key={dx} x={x + dx - 0.6} y={y - 1.8} width="1.2" height="1.2" fill="#fffdf8" stroke="#9a92ad" strokeWidth="0.15" />)}
      <text x={x} y={y + 4.4} textAnchor="middle" className="city-label subtle">MegaFit</text>
    </g>
  );
}

function Branch({ branch, selected, onSelect }) {
  const { x, y } = at(branch);
  const style = STYLES[branch.style];
  return (
    <g className={`city-spot ${selected ? 'sel' : ''}`} onClick={() => onSelect({ kind: 'branch', id: branch.id })} role="button" tabIndex={0} aria-label={branch.name}>
      <rect x={x - BLOCK / 2} y={y - BLOCK / 2} width={BLOCK} height={BLOCK} rx="1.2" className="city-block" />
      <rect x={x - 2.8 - branch.level * 0.3} y={y - 2.2} width={5.6 + branch.level * 0.6} height="4.2" rx="0.4" fill="#fffdf8" stroke="#3d3550" strokeWidth="0.35" />
      <rect x={x - 3.1 - branch.level * 0.3} y={y - 3.2} width={6.2 + branch.level * 0.6} height="1.3" rx="0.3" fill={style.color} stroke="#3d3550" strokeWidth="0.3" />
      <text x={x} y={y - 2.3} textAnchor="middle" className="city-tiny">TIO ZÉ</text>
      <rect x={x - 0.6} y={y + 0.4} width="1.2" height="1.6" fill="#c9a27a" stroke="#3d3550" strokeWidth="0.2" />
      <Flag x={x + 3.3 + branch.level * 0.3} y={y + 2} color={style.color} />
      <text x={x} y={y + 3.6} textAnchor="middle" className="city-label" style={fit(districtName(branch), 1.15)}>{districtName(branch)}</text>
      <text x={x} y={y + 4.6} textAnchor="middle" className="city-sub">{Math.round(branch.members)} membros · {style.label}</text>
    </g>
  );
}

function Lot({ lot, state, selected, onSelect }) {
  const { x, y } = at(lot);
  const cost = lotCost(state, lot);
  const affordable = state.money >= cost;
  return (
    <g className={`city-spot lot ${selected ? 'sel' : ''}`} onClick={() => onSelect({ kind: 'lot', id: lot.id })} role="button" tabIndex={0} aria-label={`Lote à venda: ${districtName(lot)}`}>
      <rect x={x - BLOCK / 2} y={y - BLOCK / 2} width={BLOCK} height={BLOCK} rx="1.2" className="city-lot" />
      <line x1={x} y1={y - 0.4} x2={x} y2={y + 1.8} stroke="#a07f5c" strokeWidth="0.35" />
      <rect x={x - 2.6} y={y - 2.4} width="5.2" height="2.2" rx="0.3" fill="#fffdf8" stroke="#3d3550" strokeWidth="0.3" />
      <text x={x} y={y - 1.55} textAnchor="middle" className="city-tiny">À VENDA</text>
      <text x={x} y={y - 0.7} textAnchor="middle" className={`city-tiny price ${affordable ? '' : 'short'}`}>{formatMoney(cost)}</text>
      <text x={x} y={y + 3.6} textAnchor="middle" className="city-label" style={fit(districtName(lot), 1.15)}>{districtName(lot)}</text>
      <text x={x} y={y + 4.6} textAnchor="middle" className="city-sub">gosta de {STYLES[districtOf(lot).likes].label}</text>
    </g>
  );
}


export default function CityMap({ state, selected, onSelect }) {
  const net = state.network;
  const spots = [MAP_SPOTS.matriz, MAP_SPOTS.historica, MAP_SPOTS.megafit, ...net.branches, ...net.lots];
  const minX = Math.min(...spots.map((s) => s.gx)) - 0.5;
  const maxX = Math.max(...spots.map((s) => s.gx)) + 0.5;
  const minY = Math.min(...spots.map((s) => s.gy)) - 0.5;
  const maxY = Math.max(...spots.map((s) => s.gy)) + 0.5;
  const vb = { x: minX * CELL - 2, y: minY * CELL - 2, w: (maxX - minX) * CELL + 4, h: (maxY - minY) * CELL + 4 };
  const streets = [];
  for (let gx = Math.floor(minX); gx <= Math.ceil(maxX); gx++) streets.push(<rect key={`v${gx}`} x={gx * CELL + CELL / 2 - 1} y={vb.y} width="2" height={vb.h} className="city-street" />);
  for (let gy = Math.floor(minY); gy <= Math.ceil(maxY); gy++) streets.push(<rect key={`h${gy}`} x={vb.x} y={gy * CELL + CELL / 2 - 1} width={vb.w} height="2" className="city-street" />);
  const isSel = (kind, id) => selected?.kind === kind && (id == null || selected.id === id);
  const used = new Set(spots.map((s) => `${s.gx},${s.gy}`));
  const fillers = [];
  for (let gx = Math.ceil(minX); gx <= Math.floor(maxX); gx++) {
    for (let gy = Math.ceil(minY); gy <= Math.floor(maxY); gy++) if (!used.has(`${gx},${gy}`)) fillers.push(<Filler key={`f${gx},${gy}`} gx={gx} gy={gy} />);
  }
  return (
    <svg className="city-map" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} role="img" aria-label="Mapa da cidade">
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="#cfe6c0" />
      {streets}
      {fillers}
      <Matriz spot={MAP_SPOTS.matriz} selected={isSel('matriz')} onSelect={onSelect} />
      <Historica spot={MAP_SPOTS.historica} selected={isSel('historica')} onSelect={onSelect} />
      <MegaFit spot={MAP_SPOTS.megafit} />
      {net.branches.map((b) => <Branch key={b.id} branch={b} selected={isSel('branch', b.id)} onSelect={onSelect} />)}
      {net.lots.map((l) => <Lot key={l.id} lot={l} state={state} selected={isSel('lot', l.id)} onSelect={onSelect} />)}
    </svg>
  );
}
