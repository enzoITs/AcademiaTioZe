'use client';
import { useGame } from '../../hooks/useGame.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import {
  STYLES, branchTarget, branchMonthly, branchCapacity, networkMonthly, historicBonus, lotCost, districtName,
} from '../../game/systems/network.js';
import { openCityMap, openNetworkSpot } from '../../game/engine/store.js';
import Icon from '../ui/Icon.js';
import { StarsRow } from './NetworkDialogs.js';

/** Aba Rede (Era 4): resumo das filiais e atalho para o mapa da cidade. */
export default function NetworkPanel() {
  const { state } = useGame();
  const net = state.network;
  if (!net) return <p className="empty small">A rede de filiais chega na Era 4.</p>;
  const total = networkMonthly(state);
  const cheapest = [...net.lots].sort((a, b) => lotCost(state, a) - lotCost(state, b))[0];
  return (
    <section className="panel-section" aria-label="Rede">
      <h2 className="section-title">Rede Tio Zé</h2>
      <div className="city-total">
        <span>{net.branches.length} filial(is) · {formatNumber(total.members, 0)} membros</span>
        <strong className={total.result >= 0 ? 'pos' : 'neg'}>{formatMoney(total.result)}/mês</strong>
        <span className="small subtle">Matriz Histórica: +{Math.round(historicBonus(state) * 100)}% de membros em todas as filiais.</span>
      </div>
      <button type="button" className="btn btn-primary btn-block" onClick={openCityMap}>
        <Icon name="map" size={16} /> Abrir o mapa da cidade
      </button>
      {cheapest ? (
        <p className="hint">Próximo lote: {districtName(cheapest)} por {formatMoney(lotCost(state, cheapest))}.</p>
      ) : null}

      <h2 className="section-title">Filiais</h2>
      {net.branches.length === 0 ? (
        <p className="empty small">Nenhuma filial ainda. Abra o mapa e escolha um lote à venda.</p>
      ) : (
        <ul className="staff-list">
          {net.branches.map((b) => {
            const t = branchTarget(state, b);
            const m = branchMonthly(state, b);
            return (
              <li key={b.id}>
                <button type="button" className="staff-card branch-card" onClick={() => openNetworkSpot({ kind: 'branch', id: b.id })}>
                  <span className="staff-card-head">
                    <span className="style-dot" style={{ '--style': STYLES[b.style].color }} />
                    <span className="grow">
                      <strong>{b.name}</strong>
                      <span className="small subtle">{STYLES[b.style].label} · nível {b.level} · {b.manager ? <>{b.manager.name} <StarsRow rating={b.manager.rating} /></> : 'sem gerente'}</span>
                    </span>
                  </span>
                  <span className="branch-bar">
                    <span className="bar"><span style={{ width: `${Math.min(100, (b.members / branchCapacity(b)) * 100)}%` }} /></span>
                    <span className="small">{formatNumber(b.members, 0)}/{branchCapacity(b)} (meta {formatNumber(t.target, 0)})</span>
                  </span>
                  <span className={`small ${m.result >= 0 ? 'pos' : 'neg'}`}>{formatMoney(m.result)}/mês</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="hint">
        Filial é semiautomática: membros × mensalidade − custos. Gerente com mais estrelas, estilo que o bairro gosta e
        mensalidade perto da base (R$ 110) enchem a casa. Novos candidatos a gerente chegam todo mês.
      </p>
    </section>
  );
}
