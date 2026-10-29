'use client';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG } from '../../game/config.js';
import { formatMoney, calendarOf } from '../../game/utils/format.js';
import { LEDGER_CATEGORIES, monthSummary, projectedMonthly, monthlyRent, feeLimits } from '../../game/economy/economy.js';
import { setFee, openModal } from '../../game/engine/store.js';
import { networkMonthly } from '../../game/systems/network.js';

function LedgerTable({ totals, opening, closing }) {
  const rows = Object.entries(LEDGER_CATEGORIES)
    .map(([id, c]) => ({ id, ...c, value: totals[id] ?? 0 }))
    .filter((r) => r.value !== 0);
  const s = monthSummary({ totals });
  return (
    <table className="ledger">
      <tbody>
        <tr className="ledger-sub"><th scope="row">Saldo anterior</th><td>{formatMoney(opening)}</td></tr>
        {rows.filter((r) => r.kind === 'revenue').map((r) => (
          <tr key={r.id}><th scope="row">{r.label}</th><td className="pos">+{formatMoney(r.value)}</td></tr>
        ))}
        {!rows.some((r) => r.id === 'extras') ? (
          <tr className="muted"><th scope="row">Receitas extras</th><td>libera na Era 2</td></tr>
        ) : null}
        {rows.filter((r) => r.kind === 'expense').map((r) => (
          <tr key={r.id}><th scope="row">{r.label}</th><td className="neg">{formatMoney(r.value)}</td></tr>
        ))}
        <tr className="ledger-total"><th scope="row">Resultado do período</th><td className={s.result >= 0 ? 'pos' : 'neg'}>{formatMoney(s.result)}</td></tr>
        <tr className="ledger-sub"><th scope="row">Saldo atual</th><td>{formatMoney(closing)}</td></tr>
      </tbody>
    </table>
  );
}

export default function FinancePanel() {
  const { state, rt } = useGame();
  const { min, max, step } = feeLimits(state.era);
  const nextMax = CONFIG.economy.feeSlider.maxByEra?.[String(state.era + 1)];
  const [fairLow, fairHigh] = rt.academy.fairRange;
  const pct = (v) => ((v - min) / (max - min)) * 100;
  const proj = projectedMonthly(state);
  const net = networkMonthly(state);
  const over = Math.max(0, state.fee / rt.academy.perceivedValue - 1) * 100;
  const cal = calendarOf(state.time.day);

  return (
    <section className="panel-section" aria-label="Finanças">
      <h2 className="section-title">Mensalidade</h2>
      <div className="fee-box">
        <div className="fee-head">
          <label htmlFor="fee-slider">Preço por aluno/mês</label>
          <strong className={state.fee > fairHigh ? 'neg' : 'pos'}>{formatMoney(state.fee)}</strong>
        </div>
        <div className="fee-track">
          <span className="fair-zone" style={{ left: `${pct(Math.max(min, fairLow))}%`, width: `${pct(Math.min(max, fairHigh)) - pct(Math.max(min, fairLow))}%` }} />
          <input
            id="fee-slider"
            type="range"
            min={min}
            max={max}
            step={step}
            value={state.fee}
            onChange={(e) => setFee(Number(e.target.value))}
            aria-valuetext={`${formatMoney(state.fee)}`}
          />
        </div>
        <p className="small">
          Faixa justa agora: <strong>{formatMoney(fairLow)}–{formatMoney(fairHigh)}</strong> (valor percebido {formatMoney(rt.academy.perceivedValue)},
          base da Era {state.era} {formatMoney(CONFIG.economy.eraBaseFee[String(state.era)])}). Cada 5% acima do valor percebido tira 5 pontos da nota de Preço justo
          (Iniciante sente ×1,5). Qualidade sobe o valor percebido.
        </p>
        <p className="small subtle">
          Teto da mensalidade na Era {state.era}: {formatMoney(max)}.{nextMax ? ` Na Era ${state.era + 1} o teto sobe para ${formatMoney(nextMax)}.` : ''}
        </p>
        {over > 0 ? <p className="small neg">Você está {over.toFixed(0)}% acima do valor percebido.</p> : null}
        <p className="small">
          Projeção mensal com {state.students.length} alunos: {formatMoney(proj.revenue)} de mensalidades − {formatMoney(proj.fixed)} de custos fixos
          {proj.salaries ? ` − ${formatMoney(proj.salaries)} de salários` : ''} ={' '}
          <strong className={proj.result >= 0 ? 'pos' : 'neg'}>{formatMoney(proj.result)}</strong> (sem consertos e compras).
        </p>
        {state.network ? (
          <p className="small">
            Filiais ({state.network.branches.length}): {formatMoney(net.revenue)} − {formatMoney(net.cost)} ={' '}
            <strong className={net.result >= 0 ? 'pos' : 'neg'}>{formatMoney(net.result)}/mês</strong>. A mensalidade da Matriz também vale nas filiais
            (ajustada pelo estilo de cada uma).
          </p>
        ) : null}
      </div>

      <h2 className="section-title">Relatório de {cal.monthName} (em andamento)</h2>
      <LedgerTable totals={state.ledger.totals} opening={state.ledger.opening} closing={state.money} />
      <p className="hint">
        Custos fixos da Era {state.era}: energia R$ 150 e água/limpeza R$ 80 por mês, cobrados por dia.
        {monthlyRent(state) ? ` Aluguel do ponto: ${formatMoney(monthlyRent(state))}/mês.` : ' Aluguel zero (herança do Tio Zé).'}
      </p>

      <h2 className="section-title">Meses anteriores</h2>
      {state.reports.length === 0 ? <p className="empty small">O primeiro mês fecha no dia 30.</p> : (
        <ul className="report-list">
          {state.reports.map((r) => (
            <li key={r.monthIndex}>
              <button type="button" className="report-row" onClick={() => openModal({ kind: 'report', report: r })}>
                <span>{r.label}</span>
                <span className={r.result >= 0 ? 'pos' : 'neg'}>{formatMoney(r.result)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title">Últimos lançamentos</h2>
      <ul className="tx-list">
        {state.ledger.log.slice(0, 14).map((tx, i) => (
          <li key={`${tx.day}-${i}`}>
            <span className="tx-day">Dia {tx.day + 1}</span>
            <span className="tx-label">{tx.label}</span>
            <span className={tx.amount >= 0 ? 'pos' : 'neg'}>{tx.amount >= 0 ? '+' : ''}{formatMoney(tx.amount)}</span>
          </li>
        ))}
      </ul>
      {state.vovoCount ? <p className="hint">A Vovó Dalva já ajudou {state.vovoCount}× (só um carinho na sua honra).</p> : null}
    </section>
  );
}

export { LedgerTable };
