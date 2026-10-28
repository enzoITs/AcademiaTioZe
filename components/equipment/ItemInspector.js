'use client';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG, getEquipmentDef, getTierDef } from '../../game/config.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import {
  conditionState, hasWear, repairCost, serviceCost, canRepair, canService, conditionCeiling, CONDITION_STATES,
} from '../../game/systems/maintenance.js';
import {
  selectItem, startMove, rotate, requestSell, upgradeItem, repair, refundFor, toggleEditMode,
} from '../../game/engine/store.js';
import EquipmentThumb from './EquipmentThumb.js';
import Icon from '../ui/Icon.js';

export default function ItemInspector() {
  const { state, rt, ui } = useGame();
  if (!ui.selectedId || ui.mode !== 'normal') return null;
  const item = state.items.find((i) => i.id === ui.selectedId);
  if (!item) return null;
  const def = getEquipmentDef(item.type);
  const tier = getTierDef(item.type, item.tier);
  const info = rt.academy.itemInfo.get(item.id);
  const stats = rt.blockStats.perItem[item.id];
  const st = hasWear(item) ? conditionState(item.condition) : 'ok';
  const tierIndex = def.tiers.findIndex((t) => t.id === item.tier);
  const nextTier = def.tiers[tierIndex + 1];
  const upgradeCost = nextTier ? Math.max(0, nextTier.price - refundFor(item)) : 0;
  const nextLocked = nextTier && (nextTier.minRep ?? 0) > state.reputation;

  return (
    <div className="inspector" role="dialog" aria-label={`Detalhes: ${def.name}`}>
      <button type="button" className="icon-btn inspector-close" onClick={() => selectItem(null)} aria-label="Fechar detalhes">
        <Icon name="close" size={16} />
      </button>
      <div className="inspector-head">
        <EquipmentThumb type={item.type} tier={item.tier} size={52} />
        <div>
          <h3>{def.name}</h3>
          <span className="small subtle">{CONFIG.tiers[item.tier].label} · {CONFIG.categories[def.category].label}</span>
        </div>
      </div>

      <dl className="inspector-stats">
        {hasWear(item) ? (
          <>
            <dt>Condição</dt>
            <dd>
              <span className={`bar cond-${st}`}><span style={{ width: `${item.condition}%`, background: CONDITION_STATES[st].color }} /></span>
              {Math.round(item.condition)}% · {CONDITION_STATES[st].label} <span className="subtle">(teto {conditionCeiling(item)})</span>
            </dd>
            <dt>Capacidade</dt>
            <dd>{formatNumber(info.capacity, 1)} de {tier.capacity} por bloco{st === 'cansado' ? ' (cansado ×0,75)' : ''}</dd>
            <dt>Agora</dt>
            <dd>{stats ? `${formatNumber(stats.uses)} usando · ${formatNumber(stats.queue)} na fila` : 'sem uso neste bloco'}</dd>
          </>
        ) : (
          <>
            <dt>Efeito</dt>
            <dd>Vibe +{def.vibe} (cópias repetidas valem metade)</dd>
          </>
        )}
        <dt>Acesso</dt>
        <dd className={info.reachable ? 'pos' : 'neg'}>
          {info.reachable ? (def.needsAccess ? 'Corredor ok até a frente' : 'Não precisa de corredor') : 'Sem corredor: inutilizável'}
        </dd>
      </dl>

      <div className="inspector-actions">
        {hasWear(item) ? (
          <>
            <button type="button" className="btn btn-sm btn-primary" disabled={!canRepair(item) || state.money < repairCost(item)} onClick={() => repair(item.id, 'repair')}>
              <Icon name="wrench" size={15} /> Consertar {formatMoney(repairCost(item))}
            </button>
            <button type="button" className="btn btn-sm" disabled={!canService(item) || state.money < serviceCost(item)} onClick={() => repair(item.id, 'service')} title="+30 de condição, antes de quebrar">
              Revisão {formatMoney(serviceCost(item))}
            </button>
          </>
        ) : null}
        {nextTier ? (
          <button
            type="button"
            className="btn btn-sm"
            disabled={nextLocked || state.money < upgradeCost}
            onClick={() => upgradeItem(item.id, nextTier.id)}
            title={nextLocked ? `Requer ${nextTier.minRep} estrelas` : `Capacidade ${nextTier.capacity}; o atual entra como parte do pagamento`}
          >
            {nextLocked ? <Icon name="lock" size={14} /> : <Icon name="upgrade" size={15} />} {CONFIG.tiers[nextTier.id].label} {formatMoney(upgradeCost)}
          </button>
        ) : null}
      </div>

      <div className="inspector-actions edit">
        <button type="button" className="btn btn-sm" onClick={() => startMove(item.id)} title="Também dá para arrastar o aparelho no mapa">
          <Icon name="move" size={15} /> Mover
        </button>
        <button type="button" className="btn btn-sm" onClick={rotate} title="Girar no lugar (R)"><Icon name="rotate" size={15} /> Girar</button>
        {ui.editMode ? (
          <button type="button" className="btn btn-sm btn-danger" onClick={() => requestSell(item.id)}>
            <Icon name="trash" size={15} /> Vender {formatMoney(refundFor(item))}
          </button>
        ) : null}
      </div>
      <p className="inspector-tip small subtle">
        Mover é grátis: arraste no mapa ou use as setas <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd>.
        {ui.editMode ? null : (
          <> Para vender, <button type="button" className="link-btn" onClick={toggleEditMode}>entre no modo edição</button>.</>
        )}
      </p>
    </div>
  );
}
