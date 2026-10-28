'use client';
import { useEffect, useRef, useState } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG } from '../../game/config.js';
import { formatMoney, formatDate } from '../../game/utils/format.js';
import { averageSatisfaction } from '../../game/simulation/students.js';
import { monthSummary } from '../../game/economy/economy.js';
import { setSpeed, saveNow, openModal, toggleSound } from '../../game/engine/store.js';
import Icon from '../ui/Icon.js';
import Stars from './Stars.js';

const SPEED_LABELS = ['Pausar', '×1', '×2', '×4'];

function Stat({ icon, label, value, sub, tone, title }) {
  return (
    <div className={`stat ${tone ?? ''}`} title={title}>
      <span className="stat-icon"><Icon name={icon} size={18} /></span>
      <span className="stat-body">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        {sub ? <span className="stat-sub">{sub}</span> : null}
      </span>
    </div>
  );
}

export default function TopBar() {
  const { state, rt, ui } = useGame();
  const [flash, setFlash] = useState(null);
  const prevMoney = useRef(state.money);

  useEffect(() => {
    const diff = state.money - prevMoney.current;
    prevMoney.current = state.money;
    if (Math.abs(diff) >= 1) {
      setFlash(diff > 0 ? 'up' : 'down');
      const id = setTimeout(() => setFlash(null), 600);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [state.money]);

  const avg = averageSatisfaction(state.students);
  const month = monthSummary(state.ledger);
  const t = state.time;
  const block = CONFIG.time.blocks[t.block];
  const satTone = !state.students.length ? '' : avg >= 65 ? 'good' : avg >= 45 ? 'warn' : 'bad';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">TZ</span>
        <span className="brand-name">Academia do Tio Zé<small>Era 1 · Garagem</small></span>
      </div>

      <div className="stats" role="group" aria-label="Indicadores">
        <Stat
          icon="coin"
          label="Saldo"
          value={<span className={`money ${flash ?? ''} ${state.money < 0 ? 'negative' : ''}`}>{formatMoney(state.money)}</span>}
          title="Dinheiro disponível"
        />
        <Stat
          icon="people"
          label="Alunos"
          value={state.students.length}
          sub={`vagas ${rt.academy.maxMembers}`}
          title="Alunos ativos / lotação máxima (2× a capacidade do bloco)"
        />
        <Stat icon="smile" label="Satisfação" value={state.students.length ? `${Math.round(avg)}%` : '—'} tone={satTone} />
        <div className="stat" title={`Reputação ${state.reputation.toFixed(2)} de 5`}>
          <span className="stat-body">
            <span className="stat-label">Reputação</span>
            <Stars value={state.reputation} />
          </span>
        </div>
        <Stat
          icon="chart"
          label="Mês até agora"
          value={<span className={month.result >= 0 ? 'pos' : 'neg'}>{formatMoney(month.result)}</span>}
          sub={`+${formatMoney(month.revenue)} / ${formatMoney(month.expense)}`}
          title="Receitas e despesas lançadas neste mês"
        />
      </div>

      <div className="clock">
        <div className="clock-date">
          <Icon name="calendar" size={16} />
          <span>{formatDate(t.day)}</span>
          <span className={`block-chip block-${block.id}`}>{block.label}</span>
        </div>
        <div className="day-progress" aria-hidden="true">
          <span style={{ width: `${((t.block + t.blockProgress) / CONFIG.time.blocks.length) * 100}%` }} />
        </div>
        <div className="speed" role="group" aria-label="Velocidade da simulação">
          {CONFIG.time.speeds.map((s, i) => {
            const active = i === 0 ? t.paused : !t.paused && t.speedIndex === i;
            return (
              <button
                key={s}
                type="button"
                className={`speed-btn ${active ? 'active' : ''}`}
                onClick={() => setSpeed(i)}
                aria-pressed={active}
                title={i === 0 ? 'Pausar (Espaço)' : `Velocidade ${SPEED_LABELS[i]}`}
              >
                {i === 0 ? <Icon name="pause" size={14} /> : i === 1 ? <Icon name="play" size={14} filled /> : SPEED_LABELS[i]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="top-actions">
        <button type="button" className="icon-btn" onClick={toggleSound} title="Ligar/desligar som" aria-label="Alternar som" aria-pressed={ui.soundOn}>
          <Icon name={ui.soundOn ? 'sound' : 'mute'} />
        </button>
        <button type="button" className="icon-btn" onClick={() => saveNow()} title="Salvar agora" aria-label="Salvar">
          <Icon name="save" />
        </button>
        <button type="button" className="icon-btn" onClick={() => openModal({ kind: 'menu' })} title="Menu" aria-label="Abrir menu">
          <Icon name="menu" />
        </button>
      </div>
    </header>
  );
}
