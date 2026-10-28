'use client';
import { useGame } from '../../hooks/useGame.js';
import { PROFILES, PROFILE_IDS, CONFIG } from '../../game/config.js';
import { countProfiles } from '../../game/simulation/academy.js';
import { averageSatisfaction, dailyEnrollmentRate } from '../../game/simulation/students.js';
import { formatNumber } from '../../game/utils/format.js';
import { FACTOR_LABELS } from '../../game/content/lines.js';
import Stars from '../hud/Stars.js';

const FACTORS = Object.keys(FACTOR_LABELS);

function factorAverages(students) {
  const withF = students.filter((s) => s.factors);
  if (!withF.length) return null;
  return Object.fromEntries(FACTORS.map((f) => [f, withF.reduce((sum, s) => sum + s.factors[f], 0) / withF.length]));
}

export default function StudentsPanel() {
  const { state, rt } = useGame();
  const counts = countProfiles(state.students);
  const factors = factorAverages(state.students);
  const rate = dailyEnrollmentRate(state);

  return (
    <section className="panel-section" aria-label="Alunos">
      <h2 className="section-title">Perfis</h2>
      <div className="profile-grid">
        {PROFILE_IDS.map((pid) => {
          const list = state.students.filter((s) => s.profile === pid);
          const p = PROFILES[pid];
          return (
            <div key={pid} className={`profile-card chip-${pid}`}>
              <strong>{p.label}</strong>
              <span className="profile-count">{counts[pid]}</span>
              <span className="small">{list.length ? `${Math.round(averageSatisfaction(list))}% satisfeitos` : 'nenhum ainda'}</span>
              <span className="small subtle">Fila: paciência {p.patience.toLowerCase()} · {p.visitsPerDay} visitas/dia</span>
              <span className="small subtle">Essenciais: {p.essentials.map((t) => CONFIG.equipment[t].name.split(' ')[0]).join(', ')}</span>
            </div>
          );
        })}
      </div>
      <p className="hint">
        Matrículas: {formatNumber(rate, 2)}/dia pela reputação · vagas {state.students.length}/{rt.academy.maxMembers}.
        Total desde o início: {state.stats.enrolled} entraram, {state.stats.cancelled} saíram.
      </p>

      <h2 className="section-title">Notas médias da satisfação</h2>
      {factors ? (
        <ul className="factor-list">
          {FACTORS.map((f) => (
            <li key={f}>
              <span>{FACTOR_LABELS[f]} <em>({Math.round(CONFIG.satisfaction.weights[f] * 100)}%)</em></span>
              <span className={`bar ${factors[f] >= 65 ? 'good' : factors[f] >= 45 ? 'warn' : 'bad'}`}><span style={{ width: `${factors[f]}%` }} /></span>
              <span className="occ-num">{Math.round(factors[f])}</span>
            </li>
          ))}
        </ul>
      ) : <p className="empty small">As notas aparecem depois do primeiro dia com alunos.</p>}

      <h2 className="section-title">Avaliações</h2>
      {state.reviews.length === 0 ? <p className="empty small">Nenhuma avaliação publicada ainda.</p> : (
        <ul className="review-list">
          {state.reviews.slice(0, 8).map((r, i) => (
            <li key={`${r.day}-${i}`} className="review">
              <div className="review-head">
                <strong>{r.name}</strong>
                <span className="small subtle">{PROFILES[r.profile].label} · dia {r.day + 1}</span>
              </div>
              <Stars value={r.stars} size={12} />
              <p>{r.text}</p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section-title">Cancelamentos</h2>
      {state.cancellations.length === 0 ? <p className="empty small">Ninguém cancelou. Continue assim!</p> : (
        <ul className="cancel-list">
          {state.cancellations.slice(0, 10).map((c, i) => (
            <li key={`${c.day}-${i}`}>
              <strong>{c.name}</strong> saiu no dia {c.day + 1}: “{c.quote}”
              <span className="small subtle"> · motivo: {FACTOR_LABELS[c.reason]} · satisfação {c.S}%</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
