'use client';
import { useGame } from '../../hooks/useGame.js';
import { getEquipmentDef, getTierDef, CONFIG } from '../../game/config.js';
import { formatMoney } from '../../game/utils/format.js';
import { rotate, cancelMode, placementPreview, site } from '../../game/engine/store.js';
import Icon from '../ui/Icon.js';

export default function PlacementBar() {
  const { ui } = useGame();
  if (ui.mode === 'normal') return null;
  const moving = ui.mode === 'move';
  const item = moving ? site().state.items.find((i) => i.id === ui.moving.id) : null;
  const type = moving ? item?.type : ui.placing.type;
  if (!type) return null;
  const def = getEquipmentDef(type);
  const tier = moving ? null : getTierDef(type, ui.placing.tier);
  const pv = placementPreview();
  const status = !pv ? { tone: 'info', text: 'Passe o mouse sobre a grade' }
    : !pv.ok ? { tone: 'bad', text: pv.reason }
      : pv.warning ? { tone: 'warn', text: pv.warning }
        : { tone: 'good', text: moving ? 'Cabe aqui! Solte (ou clique) para confirmar' : 'Cabe aqui! Clique para confirmar' };

  return (
    <div className="placement-bar" role="status" aria-live="polite">
      <div className="placement-title">
        <strong>{moving ? 'Movendo' : 'Posicionando'}: {def.name}</strong>
        {tier ? <span className="small subtle">{CONFIG.tiers[tier.id].label} · {formatMoney(tier.price)}</span> : <span className="small subtle">mover é grátis</span>}
      </div>
      <span className={`placement-status st-${status.tone}`}>{status.text}</span>
      <div className="placement-actions">
        <button type="button" className="btn btn-sm" onClick={rotate} title="Girar (R)"><Icon name="rotate" size={15} /> Girar <kbd>R</kbd></button>
        <button type="button" className="btn btn-sm" onClick={cancelMode} title="Cancelar (Esc)"><Icon name="close" size={15} /> Cancelar <kbd>Esc</kbd></button>
      </div>
      <p className="placement-hint">
        {moving ? 'Solte (ou clique) onde quiser; o tracejado cinza mostra de onde ele saiu. ' : ''}
        A área azul tracejada é a frente: precisa de corredor livre até a porta.
      </p>
    </div>
  );
}
