'use client';
import { useGame } from '../../hooks/useGame.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import {
  STYLES, branchTarget, branchMonthly, branchCapacity, districtOf, branchLevelDef,
} from '../../game/systems/network.js';
import { viewMatriz, cycleBranchView, openModal } from '../../game/engine/store.js';
import Icon from '../ui/Icon.js';
import { StarsRow } from './NetworkDialogs.js';

const THEME_LABEL = {
  residencial: 'bairro de casas', comercial: 'rua de comércio', centro: 'centro da cidade',
  industrial: 'bairro industrial', verde: 'bairro arborizado', rio: 'beira do rio',
};

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
  return (
    <div className="branch-view-bar" role="region" aria-label={`Visitando ${b.name}`} style={{ '--style': style.color }}>
      {many ? (
        <button type="button" className="icon-btn" onClick={() => cycleBranchView(-1)} aria-label="Filial anterior" title="Filial anterior (←)">
          <span aria-hidden="true">‹</span>
        </button>
      ) : null}
      <div className="bvb-info">
        <strong><span className="style-dot" /> {b.name}</strong>
        <span className="small">
          {style.label} · {branchLevelDef(b.level).label} · {formatNumber(b.members, 0)}/{branchCapacity(b)} membros (meta {formatNumber(t.target, 0)})
          {' · '}
          <span className={m.result >= 0 ? 'pos' : 'neg'}>{formatMoney(m.result)}/mês</span>
        </span>
        <span className="small subtle">
          {b.manager ? <>Gerente {b.manager.name} <StarsRow rating={b.manager.rating} /> · </> : null}
          {THEME_LABEL[districtOf(b).theme] ?? 'bairro'} · aqui quem manda é o gerente: você só observa
        </span>
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
