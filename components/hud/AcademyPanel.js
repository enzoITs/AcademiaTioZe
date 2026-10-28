'use client';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG, PROFILES, EQUIPMENT, DEMAND_CATEGORIES } from '../../game/config.js';
import { formatMoney, formatNumber, formatPercent } from '../../game/utils/format.js';
import {
  getSuggestions, selectItem, startPlacement, repair, setTab, setShopFilter,
} from '../../game/engine/store.js';
import { repairCost } from '../../game/systems/maintenance.js';
import Icon from '../ui/Icon.js';

const CAT_LABEL = CONFIG.demandCategories;
const BLOCK_LABEL = CONFIG.time.blocks.map((b) => b.label);

function Bar({ value, max, tone }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : value > 0 ? 100 : 0;
  return <span className={`bar ${tone ?? ''}`}><span style={{ width: `${pct}%` }} /></span>;
}

function Alerts({ state, rt }) {
  const a = rt.academy;
  const alerts = [];
  for (const i of a.brokenItems) {
    alerts.push({ key: `b${i.id}`, tone: 'bad', text: `${EQUIPMENT[i.type].name} quebrado`, action: () => repair(i.id), actionLabel: `Consertar ${formatMoney(repairCost(i))}` });
  }
  for (const i of a.unreachableItems) {
    alerts.push({ key: `u${i.id}`, tone: 'bad', text: `${EQUIPMENT[i.type].name} sem corredor até a frente`, action: () => selectItem(i.id), actionLabel: 'Ver' });
  }
  if (state.dirt.length >= 4) {
    alerts.push({
      key: 'dirt', tone: 'warn', text: `${state.dirt.length} sujeiras: limpeza em ${Math.round(a.cleanliness)}%`,
      action: () => setTab('staff'), actionLabel: state.staff.length ? 'Ver equipe' : 'Contratar',
    });
  }
  if (state.money < 0) alerts.push({ key: 'money', tone: 'bad', text: `Saldo negativo. Abaixo de ${formatMoney(CONFIG.economy.negativeFloor)} a Vovó Dalva intervém.` });
  if (state.fee > a.fairRange[1]) alerts.push({ key: 'fee', tone: 'warn', text: `Mensalidade acima da faixa justa (${formatMoney(a.fairRange[0])}–${formatMoney(a.fairRange[1])})` });
  if (a.adjacency.noisePenalty) alerts.push({ key: 'noise', tone: 'info', text: `Peso barulhento colado no cardio: −${a.adjacency.noisePenalty} de Vibe` });
  if (a.adjacency.crowded) alerts.push({ key: 'crowd', tone: 'warn', text: 'Academia lotada no pico: −Vibe' });
  if (state.students.length >= a.maxMembers && a.maxMembers > 0) alerts.push({ key: 'full', tone: 'info', text: 'Lotação máxima atingida: mais capacidade libera novas matrículas.' });

  if (!alerts.length) return <p className="empty small">Nenhum alerta. O Whey está tirando uma soneca.</p>;
  return (
    <ul className="alert-list">
      {alerts.map((al) => (
        <li key={al.key} className={`alert alert-${al.tone}`}>
          <Icon name="alert" size={15} />
          <span>{al.text}</span>
          {al.action ? <button type="button" className="btn btn-xs" onClick={al.action}>{al.actionLabel}</button> : null}
        </li>
      ))}
    </ul>
  );
}

function Suggestions({ suggestions, state }) {
  const buy = (type) => {
    setShopFilter(EQUIPMENT[type].category);
    setTab('shop');
  };
  const { missing, capacity } = suggestions;
  if (!state.students.length) {
    return <p className="empty small">Sem alunos ainda. Compre um aparelho: a lotação máxima é 2× a capacidade por bloco.</p>;
  }
  if (!missing.length && !capacity.length) return <p className="empty small">Ninguém está pedindo nada. Que fase!</p>;
  return (
    <ul className="suggest-list">
      {missing.slice(0, 6).map((m) => (
        <li key={m.type} className="suggest">
          <div className="suggest-main">
            <strong>{m.count} pedem {EQUIPMENT[m.type].name}</strong>
            <span className="suggest-sub">
              Falta aparelho · {m.profiles.map((p) => PROFILES[p].label).join(', ')}
              {m.essentialCount ? ` · essencial para ${m.essentialCount}` : ''}
            </span>
            <span className="suggest-gain">+{formatNumber(m.gain, 0)} no alvo de satisfação de quem pede</span>
          </div>
          <button type="button" className="btn btn-xs" disabled={m.locked} onClick={() => buy(m.type)} title={m.locked ? 'Ainda bloqueado' : 'Ver na loja'}>
            {m.locked ? <Icon name="lock" size={13} /> : formatMoney(m.price)}
          </button>
        </li>
      ))}
      {capacity.map((c) => (
        <li key={c.category} className="suggest suggest-capacity">
          <div className="suggest-main">
            <strong>Fila em {CAT_LABEL[c.category]}: {formatNumber(c.waiting)} esperando à noite</strong>
            <span className="suggest-sub">
              Falta capacidade ({formatPercent(c.queuePct)} na fila) · outra unidade ou upgrade de nível
            </span>
          </div>
          {c.types[0] ? (
            <button type="button" className="btn btn-xs" onClick={() => startPlacement(c.types[0], 'usado')}>
              +1 {EQUIPMENT[c.types[0]].name.split(' ')[0]}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function Occupancy({ rt, peak }) {
  const now = rt.blockStats;
  return (
    <table className="occ-table">
      <thead>
        <tr>
          <th scope="col">Categoria</th>
          <th scope="col">Agora ({BLOCK_LABEL[now.blockIndex]})</th>
          <th scope="col">Pico (Noite)</th>
        </tr>
      </thead>
      <tbody>
        {DEMAND_CATEGORIES.map((cat) => (
          <tr key={cat}>
            <th scope="row">{CAT_LABEL[cat]}</th>
            <td>
              <Bar value={now.demand[cat]} max={now.capacity[cat]} tone={now.queuePct[cat] > 0 ? 'bad' : 'good'} />
              <span className="occ-num">{formatNumber(now.demand[cat])}/{formatNumber(now.capacity[cat], 0)}</span>
            </td>
            <td>
              <Bar value={peak.demand[cat]} max={peak.capacity[cat]} tone={peak.queuePct[cat] > 0 ? 'bad' : 'good'} />
              <span className="occ-num">
                {peak.queuePeople[cat] > 0.05 ? `fila ${formatNumber(peak.queuePeople[cat])}` : 'sem fila'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Era2({ state }) {
  const goal = CONFIG.era2Preview;
  const types = new Set(state.items.map((i) => i.type)).size;
  const rows = [
    ['Alunos ativos', state.students.length, goal.students],
    ['Reputação', Number(state.reputation.toFixed(1)), goal.reputation],
    ['Tipos de aparelho', types, goal.equipmentTypes],
    ['Ampliações', state.unlockedZones.length - 1, goal.expansions],
  ];
  return (
    <div className="era-card">
      <p className="small">
        Metas de referência para a Era 2 (Ponto de bairro). <strong>A mudança de era ainda não está implementada neste protótipo.</strong>
      </p>
      <ul className="era-goals">
        {rows.map(([label, v, g]) => (
          <li key={label} className={v >= g ? 'done' : ''}>
            <span>{label}</span>
            <Bar value={v} max={g} tone={v >= g ? 'good' : ''} />
            <span className="occ-num">{v}/{g}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AcademyPanel() {
  const { state, rt } = useGame();
  const suggestions = getSuggestions();
  return (
    <section className="panel-section" aria-label="Academia">
      <h2 className="section-title">Alertas</h2>
      <Alerts state={state} rt={rt} />
      <h2 className="section-title">Caixa de sugestões</h2>
      <Suggestions suggestions={suggestions} state={state} />
      <h2 className="section-title">Ocupação e filas</h2>
      <Occupancy rt={rt} peak={suggestions.peak} />
      <p className="hint">Demanda/capacidade por bloco. Só contam aparelhos alcançáveis e funcionando (cansado ×0,75).</p>
      <h2 className="section-title">Rumo à Era 2</h2>
      <Era2 state={state} />
    </section>
  );
}
