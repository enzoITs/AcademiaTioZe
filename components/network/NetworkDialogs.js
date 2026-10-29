'use client';
import { useState } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG } from '../../game/config.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import {
  STYLES, STYLE_IDS, lotCost, districtName, districtOf, branchTarget, branchMonthly, branchUpgradeCost,
  branchLevelDef, branchSaleValue, networkMonthly, historicBonus, MAX_BRANCH_LEVEL, branchCapacity, openBlocker,
} from '../../game/systems/network.js';
import {
  closeModal, openModal, openNetworkSpot, confirmOpenBranch, upgradeBranchAction, changeBranchStyleAction,
  swapManagerAction, requestSellBranch,
} from '../../game/engine/store.js';
import Modal from '../dialogs/Modal.js';
import Icon from '../ui/Icon.js';
import CityMap from './CityMap.js';

const N = CONFIG.network;
const pct = (v) => `${Math.round(v * 100)}%`;

export function StarsRow({ rating }) {
  return (
    <span className="mgr-stars" aria-label={`${rating} de 5 estrelas`}>
      {'★★★★★'.slice(0, rating)}<span className="off">{'★★★★★'.slice(rating)}</span>
    </span>
  );
}

function CandidateList({ candidates, chosen, onChoose }) {
  if (!candidates.length) return <p className="empty small">Sem candidatos agora. Um novo grupo chega no começo do mês.</p>;
  return (
    <ul className="mgr-list">
      {candidates.map((c) => (
        <li key={c.id}>
          <button type="button" className={`mgr-card ${chosen === c.id ? 'on' : ''}`} onClick={() => onChoose(c.id)} aria-pressed={chosen === c.id}>
            <span className="mgr-head"><strong>{c.name}</strong><StarsRow rating={c.rating} /></span>
            <span className="small subtle">{c.trait}</span>
            <span className="small">Salário {formatMoney(c.salary)}/mês · enche a casa {pct(N.manager.factorBase + N.manager.factorPerStar * c.rating)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function StylePicker({ chosen, onChoose, likes }) {
  return (
    <ul className="style-list">
      {STYLE_IDS.map((id) => {
        const s = STYLES[id];
        return (
          <li key={id}>
            <button type="button" className={`style-card ${chosen === id ? 'on' : ''}`} onClick={() => onChoose(id)} aria-pressed={chosen === id} style={{ '--style': s.color }}>
              <span className="style-head"><span className="style-dot" />{s.label}{likes === id ? <span className="style-like">o bairro gosta</span> : null}</span>
              <span className="small subtle">{s.description}</span>
              <span className="small">Até {s.capacity} membros · mensalidade ×{String(s.feeMultiplier).replace('.', ',')} · {formatMoney(s.monthlyCost)}/mês de operação</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Mapa da cidade: a visão da Era 4. */
export function CityDialog() {
  const { state } = useGame();
  const net = state.network;
  if (!net) return null;
  const total = networkMonthly(state);
  return (
    <Modal title="Mapa da cidade" onClose={closeModal} className="modal-wide modal-city">
      <div className="exp-head">
        <h2 className="modal-title">Mapa da cidade</h2>
        <span className="small subtle">{net.branches.length} filial(is) · {formatNumber(total.members, 0)} membros nas filiais · saldo {formatMoney(state.money)}</span>
      </div>
      <p className="small subtle exp-infinite">
        Clique num lote <strong>À VENDA</strong> para abrir uma filial. Cada filial aberta faz surgir outro lote, um pouco mais caro.
        Você só mexe nos aparelhos da Matriz; as filiais rendem sozinhas, até com a aba fechada.
      </p>
      <div className="city-layout">
        <CityMap state={state} selected={null} onSelect={openNetworkSpot} />
        <div className="city-side">
          <div className="city-total">
            <span>Resultado das filiais</span>
            <strong className={total.result >= 0 ? 'pos' : 'neg'}>{formatMoney(total.result)}/mês</strong>
            <span className="small subtle">{formatMoney(total.revenue)} de mensalidades − {formatMoney(total.cost)} de custos</span>
          </div>
          <p className="small"><Icon name="star" size={13} /> <strong>Matriz Histórica:</strong> a garagem do Tio Zé dá +{pct(historicBonus(state))} de membros em todas as filiais.</p>
          <ul className="branch-mini">
            {net.branches.map((b) => {
              const m = branchMonthly(state, b);
              return (
                <li key={b.id}>
                  <button type="button" className="link-row" onClick={() => openNetworkSpot({ kind: 'branch', id: b.id })}>
                    <span className="style-dot" style={{ '--style': STYLES[b.style].color }} />
                    <span className="grow">{b.name}</span>
                    <span className={m.result >= 0 ? 'pos' : 'neg'}>{formatMoney(m.result)}</span>
                  </button>
                </li>
              );
            })}
            {net.lots.map((l) => (
              <li key={l.id}>
                <button type="button" className="link-row" onClick={() => openNetworkSpot({ kind: 'lot', id: l.id })}>
                  <Icon name="flag" size={14} />
                  <span className="grow">Lote em {districtName(l)}</span>
                  <span className={state.money >= lotCost(state, l) ? '' : 'neg'}>{formatMoney(lotCost(state, l))}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={closeModal} data-autofocus>Fechar</button>
      </div>
    </Modal>
  );
}

/** Abrir filial num lote: estilo + gerente. */
export function OpenBranchDialog({ lotId }) {
  const { state } = useGame();
  const lot = state.network?.lots.find((l) => l.id === lotId);
  const likes = lot ? districtOf(lot).likes : null;
  const [style, setStyle] = useState(likes ?? 'acolhedora');
  const [cand, setCand] = useState(() => [...(state.network?.candidates ?? [])].sort((a, b) => b.rating - a.rating)[0]?.id ?? null);
  if (!lot) return null;
  const cost = lotCost(state, lot);
  const preview = {
    style, level: 1, district: lot.district, members: 0,
    manager: state.network.candidates.find((c) => c.id === cand) ?? null,
  };
  const t = branchTarget(state, preview);
  const fee = state.fee * STYLES[style].feeMultiplier;
  const monthly = t.target * fee - STYLES[style].monthlyCost - (preview.manager?.salary ?? 0);
  const blocker = openBlocker(state, lot.id, style, cand);
  const back = () => openModal({ kind: 'city' });
  return (
    <Modal title={`Nova filial: ${districtName(lot)}`} onClose={back} className="modal-wide">
      <div className="exp-head">
        <h2 className="modal-title">Filial em {districtName(lot)}</h2>
        <span className="small subtle">bairro gosta do estilo {STYLES[likes].label} · procura ×{String(districtOf(lot).demand).replace('.', ',')}</span>
      </div>
      <div className="exp-layout">
        <div>
          <h3 className="section-title">1. Estilo da filial</h3>
          <StylePicker chosen={style} onChoose={setStyle} likes={likes} />
        </div>
        <div>
          <h3 className="section-title">2. Gerente</h3>
          <CandidateList candidates={state.network.candidates} chosen={cand} onChoose={setCand} />
          <div className="city-total">
            <span>Previsão com a casa cheia</span>
            <strong>{formatNumber(t.target, 0)} membros × {formatMoney(fee)}</strong>
            <span className={`small ${monthly >= 0 ? 'pos' : 'neg'}`}>≈ {formatMoney(monthly)}/mês de resultado</span>
            <span className="small subtle">Começa com {pct(N.startMembersShare)} disso e enche aos poucos (≈{pct(N.dailyApproach)} por dia do que falta).</span>
          </div>
        </div>
      </div>
      {blocker ? <p className="neg small">{blocker}</p> : null}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={back} data-autofocus>Voltar ao mapa</button>
        <button type="button" className="btn btn-primary" disabled={!!blocker} onClick={() => confirmOpenBranch(lot.id, style, cand)}>
          <Icon name="flag" size={15} /> Abrir filial ({formatMoney(cost)})
        </button>
      </div>
    </Modal>
  );
}

function FactorRow({ label, value, note }) {
  return (
    <li>
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <span className="small subtle">{note}</span> : null}
    </li>
  );
}

/** Ficha da filial: por que tem esse número de membros e o que dá para mudar. */
export function BranchDialog({ branchId }) {
  const { state } = useGame();
  const [panel, setPanel] = useState(null); // 'style' | 'manager'
  const [pickStyle, setPickStyle] = useState(null);
  const [pickCand, setPickCand] = useState(null);
  const b = state.network?.branches.find((x) => x.id === branchId);
  if (!b) return null;
  const t = branchTarget(state, b);
  const f = t.factors;
  const m = branchMonthly(state, b);
  const upCost = branchUpgradeCost(b);
  const back = () => openModal({ kind: 'city' });
  const style = STYLES[b.style];
  const ratio = state.fee / CONFIG.economy.eraBaseFee['4'];

  return (
    <Modal title={b.name} onClose={back} className="modal-wide">
      <div className="exp-head">
        <h2 className="modal-title"><span className="style-dot" style={{ '--style': style.color }} /> {b.name}</h2>
        <span className="small subtle">{style.label} · {branchLevelDef(b.level).label} · aberta no dia {b.openedDay + 1}</span>
      </div>
      <div className="exp-layout">
        <div>
          <div className="city-total">
            <span>Membros</span>
            <strong>{formatNumber(b.members, 0)} de {branchCapacity(b)} <span className="small subtle">(meta {formatNumber(t.target, 0)})</span></strong>
            <span className={`small ${m.result >= 0 ? 'pos' : 'neg'}`}>
              {formatMoney(m.revenue)} − {formatMoney(m.cost)} = {formatMoney(m.result)}/mês
            </span>
          </div>
          <h3 className="section-title">De onde vem a meta</h3>
          <ul className="factor-grid">
            <FactorRow label="Capacidade" value={`${f.capacity}`} note={`estilo ${style.label}, ${branchLevelDef(b.level).label}`} />
            <FactorRow label="Gerente" value={`×${f.manager.toFixed(2).replace('.', ',')}`} note={b.manager ? `${b.manager.name}, ${b.manager.rating}★` : 'sem gerente'} />
            <FactorRow label="Reputação" value={`×${f.reputation.toFixed(2).replace('.', ',')}`} note={`${state.reputation.toFixed(1).replace('.', ',')}★ da Matriz`} />
            <FactorRow label="Mensalidade" value={`×${f.price.toFixed(2).replace('.', ',')}`} note={`${formatMoney(state.fee)} é ${pct(ratio)} da base da Era 4`} />
            <FactorRow label="Bairro" value={`×${f.district.toFixed(2).replace('.', ',')}`} note={f.match ? 'gosta deste estilo (+20%)' : `prefere ${STYLES[districtOf(b).likes].label}`} />
            <FactorRow label="Matriz Histórica" value={`×${f.historic.toFixed(2).replace('.', ',')}`} note="bônus de Comunidade" />
          </ul>
        </div>
        <div>
          <h3 className="section-title">Gerente</h3>
          {b.manager ? (
            <p className="small"><strong>{b.manager.name}</strong> <StarsRow rating={b.manager.rating} /> · {formatMoney(b.manager.salary)}/mês<br /><span className="subtle">{b.manager.trait}</span></p>
          ) : <p className="small neg">Sem gerente: a filial rende pouco.</p>}
          <div className="inspector-actions">
            <button type="button" className="btn btn-sm btn-primary" disabled={upCost == null || state.money < upCost} onClick={() => upgradeBranchAction(b.id)}>
              <Icon name="upgrade" size={15} /> {upCost == null ? 'Nível máximo' : `Reformar (${branchLevelDef(b.level + 1).label}) ${formatMoney(upCost)}`}
            </button>
            <button type="button" className={`btn btn-sm ${panel === 'manager' ? 'active' : ''}`} onClick={() => setPanel(panel === 'manager' ? null : 'manager')}>
              Trocar gerente
            </button>
            <button type="button" className={`btn btn-sm ${panel === 'style' ? 'active' : ''}`} onClick={() => setPanel(panel === 'style' ? null : 'style')}>
              Trocar estilo
            </button>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => requestSellBranch(b.id)}>
              <Icon name="trash" size={15} /> Vender {formatMoney(branchSaleValue(b))}
            </button>
          </div>
          {upCost != null ? (
            <p className="small subtle">Reforma: capacidade ×{String(branchLevelDef(b.level + 1).capacityMultiplier).replace('.', ',')} e operação ×{String(branchLevelDef(b.level + 1).costMultiplier).replace('.', ',')} (até o {branchLevelDef(MAX_BRANCH_LEVEL).label}).</p>
          ) : null}
          {panel === 'manager' ? (
            <>
              <CandidateList candidates={state.network.candidates} chosen={pickCand} onChoose={setPickCand} />
              <button type="button" className="btn btn-sm btn-primary" disabled={!pickCand} onClick={() => { swapManagerAction(b.id, pickCand); setPanel(null); setPickCand(null); }}>
                Contratar para a filial
              </button>
            </>
          ) : null}
          {panel === 'style' ? (
            <>
              <StylePicker chosen={pickStyle ?? b.style} onChoose={setPickStyle} likes={districtOf(b).likes} />
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!pickStyle || pickStyle === b.style || state.money < N.styleChangeCost}
                onClick={() => { changeBranchStyleAction(b.id, pickStyle); setPanel(null); setPickStyle(null); }}
              >
                Trocar estilo ({formatMoney(N.styleChangeCost)}, perde {pct(N.styleChangeMemberLoss)} dos membros)
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn" onClick={back} data-autofocus>Voltar ao mapa</button>
      </div>
    </Modal>
  );
}
