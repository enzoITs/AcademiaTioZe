'use client';
import { useState } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG } from '../../game/config.js';
import { COLS, ROWS, DOOR } from '../../game/grid/grid.js';
import { formatMoney } from '../../game/utils/format.js';
import { closeModal, requestUnlockZone, zoneStatuses } from '../../game/engine/store.js';
import Modal from './Modal.js';
import Icon from '../ui/Icon.js';

const FILL = { owned: '#ece4d6', available: '#dff3e2', blocked: '#ece8ef' };
const STROKE = { owned: '#3d3550', available: '#4fa463', blocked: '#9a92ad' };

/** Planta em miniatura: mostra onde cada terreno fica em relação à garagem. */
function SitePlan({ zones, focus, onFocus }) {
  // A grade cresce com os terrenos; o texto cresce junto para continuar legível.
  const k = Math.max(1, Math.max(COLS / 16, ROWS / 12));
  return (
    <svg
      className="site-plan"
      viewBox={`-0.3 -0.3 ${COLS + 0.6} ${ROWS + 1.4}`}
      role="img"
      aria-label="Planta do terreno"
      style={{ '--site-k': k }}
    >
      <rect x={-0.3} y={ROWS + 0.2} width={COLS + 0.6} height={0.9} fill="#b9b4c4" />
      <rect x={DOOR.x + 0.2} y={DOOR.y + 1} width={0.6} height={ROWS - DOOR.y - 0.8} rx={0.15} fill="#efe6d6" stroke="#9a92ad" strokeWidth={0.05} />
      {zones.map((z) => (
        <g key={z.id} onMouseEnter={() => onFocus(z.id)} onMouseLeave={() => onFocus(null)}>
          <rect
            x={z.x + 0.06}
            y={z.y + 0.06}
            width={z.w - 0.12}
            height={z.h - 0.12}
            rx={0.3}
            fill={FILL[z.status]}
            stroke={focus === z.id ? '#e5b53a' : STROKE[z.status]}
            strokeWidth={focus === z.id ? 0.22 : 0.1}
            strokeDasharray={z.status === 'owned' ? undefined : '0.35 0.25'}
          />
          <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 0.1} textAnchor="middle" className="site-label">{z.label.split(' ')[0]}</text>
          <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 0.75} textAnchor="middle" className="site-sub">
            {z.status === 'owned' ? 'seu' : `${z.w}×${z.h}`}
          </text>
        </g>
      ))}
      <rect x={DOOR.x + 0.15} y={DOOR.y + 0.75} width={0.7} height={0.35} rx={0.1} fill="#c9a27a" stroke="#3d3550" strokeWidth={0.06} />
    </svg>
  );
}

export default function ExpansionsDialog() {
  const { state } = useGame();
  const [focus, setFocus] = useState(null);
  const zones = zoneStatuses();
  const owned = zones.filter((z) => z.status === 'owned');
  const ownedTiles = owned.reduce((s, z) => s + z.tiles, 0);
  // Disponíveis primeiro (do mais barato), depois os que ainda dependem de outra área.
  const forSale = zones
    .filter((z) => z.status !== 'owned')
    .sort((a, b) => (a.status === b.status ? a.cost - b.cost : a.status === 'available' ? -1 : 1));

  return (
    <Modal title="Ampliações" onClose={closeModal} className="modal-wide">
      <div className="exp-head">
        <h2 className="modal-title">Ampliar a academia</h2>
        <span className="small subtle">{ownedTiles} tiles · {owned.length} áreas · saldo {formatMoney(state.money)}</span>
      </div>
      <p className="small subtle exp-infinite">
        O bairro não acaba: cada área que você compra faz surgir um terreno novo ao lado, um pouco mais caro.
      </p>
      <div className="exp-layout">
        <SitePlan zones={zones} focus={focus} onFocus={setFocus} />
        <ul className="exp-list">
          {forSale.length === 0 ? <li className="empty small">Você já comprou todo o terreno disponível!</li> : null}
          {forSale.map((z) => (
            <li
              key={z.id}
              className={`exp-card exp-${z.status} ${focus === z.id ? 'focus' : ''}`}
              onMouseEnter={() => setFocus(z.id)}
              onMouseLeave={() => setFocus(null)}
            >
              <div className="exp-info">
                <strong>{z.label}</strong>
                <span className="small subtle">{z.w}×{z.h} · +{z.tiles} tiles</span>
                <span className="small">{z.description}</span>
                {z.status === 'blocked' ? (
                  <span className="small exp-req"><Icon name="lock" size={12} /> Compre antes: {z.requirement.label}</span>
                ) : null}
              </div>
              <div className="exp-buy">
                <span className={`price ${z.affordable ? '' : 'short'}`}>{formatMoney(z.cost)}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={z.status !== 'available' || !z.affordable}
                  onClick={() => requestUnlockZone(z.id)}
                  title={z.status === 'blocked' ? `Requer ${z.requirement.label}` : z.affordable ? 'Comprar este terreno' : 'Saldo insuficiente'}
                >
                  {z.status === 'blocked' ? <Icon name="lock" size={14} /> : 'Comprar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <p className="hint">Dica: deixe um corredor largo da porta até as áreas novas, senão os aparelhos de lá ficam sem acesso.</p>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={closeModal} data-autofocus>Fechar</button>
      </div>
    </Modal>
  );
}
