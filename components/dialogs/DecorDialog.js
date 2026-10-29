'use client';
import { useState } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { allZones } from '../../game/grid/grid.js';
import { floorOf, eraLook } from '../../game/render/look.js';
import { decorOptions, decorArea, decorPrice } from '../../game/systems/decor.js';
import { formatMoney } from '../../game/utils/format.js';
import { closeModal, applyDecor } from '../../game/engine/store.js';
import Modal from './Modal.js';

/** Cores que cada opção mostra (o "original" usa a cor da era / da área principal). */
function colorsOf(kind, opt, state) {
  if (kind === 'floor') {
    if (opt.colors) return opt.colors;
    const main = allZones(state).find((z) => state.unlockedZones.includes(z.id));
    return main ? floorOf(main) : ['#ece4d6', '#e4dac9'];
  }
  return [opt.color ?? eraLook(state.era).wall];
}

/** Maquete vista de cima: chão quadriculado cercado pelas paredes. */
function Preview({ floor, wall }) {
  const cells = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={(x + y) % 2 ? floor[0] : floor[1]} />);
  return (
    <svg className="decor-preview" viewBox="-0.6 -0.6 9.2 6.4" role="img" aria-label="Prévia da reforma">
      <rect x={-0.45} y={-0.45} width={8.9} height={5.9} rx={0.25} fill={wall} stroke="#3d3550" strokeWidth={0.12} />
      <g>{cells}</g>
      <rect x={0} y={0} width={8} height={5} fill="none" stroke="#3d3550" strokeWidth={0.08} />
      {/* porta */}
      <rect x={3.5} y={4.9} width={1} height={0.7} fill="#c9a27a" stroke="#3d3550" strokeWidth={0.07} />
    </svg>
  );
}

function Swatches({ kind, state, area, picked, onPick }) {
  const current = state.decor?.[kind] ?? 'original';
  return (
    <ul className="decor-grid">
      {decorOptions(kind).map((opt) => {
        const colors = colorsOf(kind, opt, state);
        const price = decorPrice(state, kind, opt.id, area);
        const isCurrent = current === opt.id;
        return (
          <li key={opt.id}>
            <button
              type="button"
              className={`decor-swatch ${picked === opt.id ? 'picked' : ''}`}
              aria-pressed={picked === opt.id}
              onClick={() => onPick(opt.id)}
              title={`${opt.label} · ${isCurrent ? 'cor atual' : formatMoney(price)}`}
            >
              <span
                className="decor-chip"
                style={{
                  background: kind === 'floor'
                    ? `repeating-conic-gradient(${colors[0]} 0 25%, ${colors[1]} 0 50%) 0 0 / 50% 50%`
                    : colors[0],
                }}
              />
              <span className="decor-name">{opt.label}</span>
              <span className={`decor-price small ${isCurrent ? '' : state.money < price ? 'short' : 'subtle'}`}>
                {isCurrent ? 'atual' : formatMoney(price)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ kind, title, unit, state, area, picked, onPick }) {
  const current = state.decor?.[kind] ?? 'original';
  const opt = decorOptions(kind).find((o) => o.id === picked);
  const price = decorPrice(state, kind, picked, area);
  const same = picked === current;
  const short = state.money < price;
  return (
    <section className="decor-section">
      <p className="small subtle decor-head">Preço: {unit.replace('preço ', '')} × tamanho da academia</p>
      <Swatches kind={kind} state={state} area={area} picked={picked} onPick={onPick} />
      <button
        type="button"
        className="btn btn-sm btn-primary decor-buy"
        disabled={same || short}
        onClick={() => applyDecor(kind, picked)}
      >
        {same ? `${title}: ${opt.label.toLowerCase()} (atual)` : `Pintar ${kind === 'floor' ? 'o chão' : 'as paredes'} de ${opt.label.toLowerCase()} · ${formatMoney(price)}`}
      </button>
      {!same && short ? <p className="small neg">Falta {formatMoney(price - state.money)}.</p> : null}
    </section>
  );
}

export default function DecorDialog() {
  const { state } = useGame();
  const area = decorArea(state);
  const [floor, setFloor] = useState(state.decor?.floor ?? 'original');
  const [wall, setWall] = useState(state.decor?.wall ?? 'original');
  const [tab, setTab] = useState('floor');
  const floorColors = colorsOf('floor', decorOptions('floor').find((o) => o.id === floor), state);
  const wallColor = colorsOf('wall', decorOptions('wall').find((o) => o.id === wall), state)[0];

  return (
    <Modal title="Reforma" onClose={closeModal} className="modal-wide">
      <div className="exp-head">
        <h2 className="modal-title">Reforma da academia</h2>
        <span className="small subtle">{area.tiles} tiles · {area.walls} m de parede · saldo {formatMoney(state.money)}</span>
      </div>
      <p className="small subtle">
        Escolha uma cor para ver a prévia e pague para pintar. O preço depende do tamanho da academia:
        as áreas compradas depois já ganham a mesma cor.
      </p>
      <div className="decor-layout">
        <Preview floor={floorColors} wall={wallColor} />
        <div className="decor-sections">
          <div className="seg decor-tabs" role="tablist" aria-label="O que pintar">
            {[['floor', 'Chão'], ['wall', 'Paredes']].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`seg-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'floor'
            ? <Section kind="floor" title="Chão" unit="preço por tile" state={state} area={area} picked={floor} onPick={setFloor} />
            : <Section kind="wall" title="Paredes" unit="preço por metro" state={state} area={area} picked={wall} onPick={setWall} />}
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={closeModal} data-autofocus>Fechar</button>
      </div>
    </Modal>
  );
}
