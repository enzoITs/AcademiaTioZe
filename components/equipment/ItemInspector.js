'use client';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG, getEquipmentDef } from '../../game/config.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import {
  conditionState, hasWear, repairCost, serviceCost, canRepair, canService, conditionCeiling, CONDITION_STATES,
  itemLevel, levelDef, levelUpCost, capacityAtLevel, vibeAtLevel, itemCapacity, itemVibe, MAX_LEVEL,
} from '../../game/systems/maintenance.js';
import {
  selectItem, startMove, rotate, requestSell, upgradeItem, levelUpItem, repair, refundFor, site,
} from '../../game/engine/store.js';
import { isFixedItem } from '../../game/systems/branchEdit.js';
import EquipmentThumb from './EquipmentThumb.js';
import Icon from '../ui/Icon.js';

const times = (n) => `${String(n).replace('.', ',')}×`;

/** Três bolinhas: o nível atual do aparelho. */
function LevelPips({ level }) {
  return (
    <span className="level-pips" aria-label={`Nível ${level} de ${MAX_LEVEL}`}>
      {Array.from({ length: MAX_LEVEL }, (_, i) => <span key={i} className={i < level ? 'on' : ''} />)}
    </span>
  );
}

export default function ItemInspector() {
  const { state, ui } = useGame();
  if (!ui.selectedId || ui.mode !== 'normal') return null;
  // O aparelho pode estar na Matriz ou no andar da filial visitada (Era 5).
  const here = site();
  const rt = here.rt;
  const item = here.state.items.find((i) => i.id === ui.selectedId);
  if (!item || !rt.academy) return null;
  const def = getEquipmentDef(item.type);
  const fixed = isFixedItem(item);
  const info = rt.academy.itemInfo.get(item.id);
  const stats = rt.blockStats?.perItem[item.id];
  const wear = hasWear(item);
  const st = wear ? conditionState(item.condition) : 'ok';
  const tierIndex = def.tiers.findIndex((t) => t.id === item.tier);
  const nextTier = def.tiers[tierIndex + 1];
  const upgradeCost = nextTier ? Math.max(0, nextTier.price - refundFor(item, { withLevels: false })) : 0;
  const nextLocked = nextTier && (nextTier.minRep ?? 0) > state.reputation;

  const level = itemLevel(item);
  const lvUp = levelUpCost(item);
  const nextLevel = lvUp != null ? levelDef(level + 1) : null;
  const gain = nextLevel
    ? wear
      ? `capacidade ${itemCapacity(item)} → ${capacityAtLevel(item.type, item.tier, level + 1)}, desgaste −${Math.round((1 - nextLevel.wearMultiplier) * 100)}%`
      : `vibe +${itemVibe(item)} → +${vibeAtLevel(item.type, level + 1)}`
    : null;

  return (
    <div className="inspector" role="dialog" aria-label={`Detalhes: ${def.name}`}>
      <button type="button" className="icon-btn inspector-close" onClick={() => selectItem(null)} aria-label="Fechar detalhes">
        <Icon name="close" size={16} />
      </button>
      <div className="inspector-head">
        <EquipmentThumb type={item.type} tier={item.tier} size={52} />
        <div>
          <h3>{def.name}</h3>
          <span className="small subtle">
            {CONFIG.tiers[item.tier].label} · {levelDef(level).label} <LevelPips level={level} /> · {CONFIG.categories[def.category].label}
          </span>
        </div>
      </div>

      <dl className="inspector-stats">
        {wear ? (
          <>
            <dt>Condição</dt>
            <dd>
              <span className={`bar cond-${st}`}><span style={{ width: `${item.condition}%`, background: CONDITION_STATES[st].color }} /></span>
              {Math.round(item.condition)}% · {CONDITION_STATES[st].label} <span className="subtle">(teto {conditionCeiling(item)})</span>
            </dd>
            <dt>Capacidade</dt>
            <dd>{formatNumber(info.capacity, 1)} de {itemCapacity(item)} por bloco{st === 'cansado' ? ' (cansado ×0,75)' : ''}</dd>
            <dt>Agora</dt>
            <dd>{stats ? `${formatNumber(stats.uses)} usando · ${formatNumber(stats.queue)} na fila` : 'sem uso neste bloco'}</dd>
            <dt>Conserto</dt>
            <dd>{formatMoney(repairCost(item))}{level > 1 ? <span className="subtle"> ({times(levelDef(level).repairMultiplier)} pelo nível)</span> : null}</dd>
          </>
        ) : (
          <>
            <dt>Efeito</dt>
            <dd>Vibe +{itemVibe(item)} (cópias repetidas valem metade)</dd>
          </>
        )}
        <dt>Acesso</dt>
        <dd className={info.reachable ? 'pos' : 'neg'}>
          {info.reachable ? (def.needsAccess ? 'Corredor ok até a frente' : 'Não precisa de corredor') : 'Sem corredor: inutilizável'}
        </dd>
      </dl>

      <div className="inspector-actions">
        {wear ? (
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
            title={nextLocked ? `Requer ${nextTier.minRep} estrelas` : `Troca por um ${CONFIG.tiers[nextTier.id].label.toLowerCase()} (teto de condição maior). O atual entra como parte do pagamento e as melhorias de nível continuam.`}
          >
            {nextLocked ? <Icon name="lock" size={14} /> : <Icon name="upgrade" size={15} />} {CONFIG.tiers[nextTier.id].label} {formatMoney(upgradeCost)}
          </button>
        ) : null}
      </div>

      <div className="level-box" style={fixed ? { display: 'none' } : undefined}>
        {nextLevel ? (
          <>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={state.money < lvUp}
              onClick={() => levelUpItem(item.id)}
              title={nextLevel.description}
            >
              <Icon name="upgrade" size={15} /> Melhorar para {nextLevel.label} · {formatMoney(lvUp)}
            </button>
            <span className="small subtle">
              {gain}.{wear ? ` Conserto passa a ${formatMoney(Math.round(repairCost(item) * nextLevel.repairMultiplier / levelDef(level).repairMultiplier))}.` : ''}
            </span>
          </>
        ) : (
          <span className="small"><Icon name="star" size={14} /> Nível máximo: este aparelho já está no topo.</span>
        )}
      </div>

      {fixed ? (
        <p className="inspector-tip small subtle">Fica sempre no mesmo lugar: não dá para mover nem vender.</p>
      ) : (
      <div className="inspector-actions edit">
        <button type="button" className="btn btn-sm" onClick={() => startMove(item.id)} title="Também dá para arrastar o aparelho no mapa">
          <Icon name="move" size={15} /> Mover
        </button>
        <button type="button" className="btn btn-sm" onClick={rotate} title="Girar no lugar (R)"><Icon name="rotate" size={15} /> Girar</button>
        <button type="button" className="btn btn-sm btn-danger" onClick={() => requestSell(item.id)} title="Vender (Delete)">
          <Icon name="trash" size={15} /> Vender {formatMoney(refundFor(item))}
        </button>
      </div>
      )}
      {item.gift ? <p className="inspector-tip small subtle">Veio com a filial: vender não devolve o preço.</p> : null}
      <p className="inspector-tip small subtle">
        Mover é grátis: arraste no mapa ou use as setas <kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd>. <kbd>Del</kbd> vende.
      </p>
    </div>
  );
}
