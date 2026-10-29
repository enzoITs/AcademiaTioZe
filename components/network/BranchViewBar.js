'use client';
import { useGame } from '../../hooks/useGame.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import {
  STYLES, branchTarget, branchMonthly, branchCapacity, districtOf, branchLevelDef, floorCost, MAX_FLOORS,
} from '../../game/systems/network.js';
import { viewMatriz, cycleBranchView, openModal, viewFloor, buildFloorAction } from '../../game/engine/store.js';
import Icon from '../ui/Icon.js';
import { StarsRow } from './NetworkDialogs.js';

const THEME_LABEL = {
  residencial: 'bairro de casas', comercial: 'rua de comércio', centro: 'centro da cidade',
  industrial: 'bairro industrial', verde: 'bairro arborizado', rio: 'beira do rio',
};

const floorName = (i) => (i === 0 ? 'Térreo' : `${i}º andar`);

/** Andares da filial (Era 5): escolher onde montar e construir o próximo. */
function FloorPicker({ b, current, money }) {
  const cost = floorCost(b);
  return (
    <div className="bvb-floors" role="group" aria-label="Andares da filial">
      {[...b.floors].map((_, i) => b.floors.length - 1 - i).map((i) => (
        <button key={i} type="button" className={`btn btn-xs ${i === current ? 'btn-primary' : ''}`} onClick={() => viewFloor(i)} aria-pressed={i === current}>
          {floorName(i)}
        </button>
      ))}
      {cost != null ? (
        <button type="button" className="btn btn-xs" disabled={money < cost} onClick={() => buildFloorAction(b.id)} title="O terreno não cresce: a filial cresce para cima">
          <Icon name="upgrade" size={13} /> Construir {floorName(b.floors.length)} · {formatMoney(cost)}
        </button>
      ) : <span className="small subtle">{MAX_FLOORS} andares (máximo)</span>}
    </div>
  );
}

/** Faixa no topo do mapa durante a visita a uma filial. */
export default function BranchViewBar() {
  const { state, ui } = useGame();
  if (ui.view?.kind !== 'branch') return null;
  const branches = state.network?.branches ?? [];
  const b = branches.find((x) => x.id === ui.view.branchId);
  if (!b) return null;
  const style = STYLES[b.style];
  const t = branchTarget(state, b);
  const m = branchMonthly(state, b);
  const many = branches.length > 1;
  const editable = !!b.floors;
  const size = editable ? `${b.floors.length} andar${b.floors.length > 1 ? 'es' : ''}` : branchLevelDef(b.level).label;
  return (
    <div className="branch-view-bar" role="region" aria-label={`Visitando ${b.name}`} style={{ '--style': style.color }}>
      {many ? (
        <button type="button" className="icon-btn" onClick={() => cycleBranchView(-1)} aria-label="Filial anterior" title="Filial anterior (←)">
          <span aria-hidden="true">‹</span>
        </button>
      ) : null}
      <div className="bvb-info">
        <strong><span className="style-dot" /> {b.name}{editable ? ` · ${floorName(ui.view.floor ?? 0)}` : ''}</strong>
        <span className="small">
          {style.label} · {size} · {formatNumber(b.members, 0)}/{branchCapacity(b)} membros (meta {formatNumber(t.target, 0)})
          {' · '}
          <span className={m.result >= 0 ? 'pos' : 'neg'}>{formatMoney(m.result)}/mês</span>
        </span>
        <span className="small subtle">
          {b.manager ? <>Gerente {b.manager.name} <StarsRow rating={b.manager.rating} /> · </> : null}
          {THEME_LABEL[districtOf(b).theme] ?? 'bairro'}
          {editable ? ' · monte como na Matriz: o dinheiro sai do caixa da rede' : ' · aqui quem manda é o gerente: você só observa'}
        </span>
        {editable ? <FloorPicker b={b} current={ui.view.floor ?? 0} money={state.money} /> : null}
      </div>
      {many ? (
        <button type="button" className="icon-btn" onClick={() => cycleBranchView(1)} aria-label="Próxima filial" title="Próxima filial (→)">
          <span aria-hidden="true">›</span>
        </button>
      ) : null}
      <div className="bvb-actions">
        <button type="button" className="btn btn-sm" onClick={() => openModal({ kind: 'branch', branchId: b.id })}>Ficha</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={viewMatriz} title="Voltar para a Matriz (Esc)">
          <Icon name="door" size={15} /> Voltar à Matriz
        </button>
      </div>
    </div>
  );
}
