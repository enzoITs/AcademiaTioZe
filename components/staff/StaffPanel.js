'use client';
import { useEffect, useRef } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG, BLOCKS } from '../../game/config.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import { computeBlockStats } from '../../game/simulation/demand.js';
import {
  roleDef, staffSalary, totalMonthlySalaries, cleaningCapacityByBlock, repairCapacityByBlock, repairQueue,
  hireBlocker, maxStaff, PEAK_BLOCK,
} from '../../game/systems/staff.js';
import { hireStaff, toggleStaffShift, requestFire, staffHere, site } from '../../game/engine/store.js';
import { branchHireBlocker } from '../../game/systems/branchEdit.js';
import { maxBranchStaff } from '../../game/systems/network.js';
import { drawCleaner } from '../../game/render/draw/people.js';
import Icon from '../ui/Icon.js';

const ROLES = [
  { id: 'zelador', icon: 'broom' },
  { id: 'tecnico', icon: 'wrench' },
];

function StaffThumb({ look, role, size = 44 }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * 1.25, 0, 0, dpr * 1.25, (size * dpr) / 2 - 4 * dpr, size * dpr - 5 * dpr);
    drawCleaner(ctx, look, 'idle', 0.4, 1, role);
  }, [look, role, size]);
  return <canvas ref={ref} className="staff-thumb" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Sujeira esperada por bloco: atendidos no bloco ÷ usos por sujeira. */
function dirtForecast(state, academy) {
  return BLOCKS.map((_, i) => {
    const stats = computeBlockStats(state, academy, i, state.time.day);
    const served = Object.values(stats.served).reduce((a, b) => a + b, 0);
    return served / CONFIG.cleaning.usesPerDirt;
  });
}

const floorName = (i) => (i === 0 ? 'térreo' : `${i}º andar`);

export default function StaffPanel() {
  const { state } = useGame();
  // Dentro de uma filial (Era 5) a aba mostra a equipe dela; a cobertura é a do andar visitado.
  const here = staffHere();
  const place = site();
  const inBranch = here.kind === 'branch';
  const team = here.list;
  const floorTeam = inBranch ? team.filter((m) => m.floor === here.floor) : team;
  const crew = { staff: floorTeam, items: place.state.items };
  const capacity = cleaningCapacityByBlock(crew);
  const fixCapacity = repairCapacityByBlock(crew);
  const hasTech = floorTeam.some((m) => m.role === 'tecnico');
  const queue = hasTech ? repairQueue(crew).length : 0;
  const forecast = place.rt.academy ? dirtForecast(place.state, place.rt.academy) : BLOCKS.map(() => 0);
  const salaries = totalMonthlySalaries({ staff: team });
  const max = inBranch ? maxBranchStaff(here.branch) : maxStaff(state);

  return (
    <section className="panel-section" aria-label="Equipe">
      {inBranch ? (
        <p className="small subtle">
          Equipe da <strong>{here.branch.name}</strong>. Quem você contratar aqui trabalha no {floorName(here.floor)}; troque de andar na faixa da filial.
          Os salários entram nos custos da filial.
        </p>
      ) : null}
      <h2 className="section-title">Contratar{inBranch ? ` para o ${floorName(here.floor)}` : ''}</h2>
      {ROLES.map(({ id, icon }) => {
        const role = roleDef(id);
        const blocker = inBranch ? branchHireBlocker(state, here.branch, id) : hireBlocker(state, id);
        return (
          <div key={id} className="staff-role">
            <div className="staff-role-head">
              <div>
                <strong>{role.label}</strong>
                <div className="small subtle">
                  {formatMoney(role.monthlySalary)}/mês por 1 turno · +{Math.round(role.extraShiftRate * 100)}% por turno extra
                </div>
                {role.hireCost ? (
                  <div className="small subtle">
                    Contratação: {formatMoney(role.hireCost)} · exige {String(role.minRep).replace('.', ',')}★
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => hireStaff(id)}
                disabled={!!blocker}
                title={blocker ?? 'Contratar e colocar no turno da noite'}
              >
                <Icon name={blocker && role.minRep && blocker.includes('★') ? 'lock' : icon} size={15} /> Contratar
              </button>
            </div>
            <p className="small">{role.description}</p>
          </div>
        );
      })}
      <p className="small subtle">Equipe: {team.length}/{max}{inBranch ? ' (2 por andar)' : ''}. Faxineiro(a) não tem taxa de contratação; os salários são cobrados por dia.</p>

      <h2 className="section-title">Cobertura de limpeza por turno</h2>
      <div className="coverage">
        {BLOCKS.map((b, i) => (
          <div key={b.id} className={capacity[i] ? 'on' : ''}>
            {b.label}{i === PEAK_BLOCK ? ' ★' : ''}
            <strong>{capacity[i] ? `limpa ${capacity[i]}` : 'ninguém'}</strong>
            <span className="small subtle">suja ≈ {formatNumber(forecast[i])}</span>
          </div>
        ))}
      </div>
      <p className="hint">
        “Suja ≈” é a previsão com os alunos de hoje (1 sujeira a cada {CONFIG.cleaning.usesPerDirt} usos). A noite (★) é o pico: 55% das visitas.
        A sujeira que sobra para o próximo turno ainda pode ser limpa por você com um clique.
      </p>

      {hasTech ? (
        <>
          <h2 className="section-title">Cobertura de manutenção por turno</h2>
          <div className="coverage">
            {BLOCKS.map((b, i) => (
              <div key={b.id} className={fixCapacity[i] ? 'on' : ''}>
                {b.label}{i === PEAK_BLOCK ? ' ★' : ''}
                <strong>{fixCapacity[i] ? `conserta ${fixCapacity[i]}` : 'ninguém'}</strong>
              </div>
            ))}
          </div>
          <p className="hint">
            Na fila agora: {queue} aparelho{queue === 1 ? '' : 's'} (quebrados ou abaixo de {roleDef('tecnico').workCondition}%).
            A equipe técnica não cobra peça: quebrado volta novinho, gasto ganha uma revisão.
          </p>
        </>
      ) : null}

      <h2 className="section-title">{inBranch ? 'Equipe da filial' : 'Sua equipe'}</h2>
      {team.length === 0 ? (
        <p className="empty small">Ninguém contratado. Por enquanto você limpa tudo sozinho(a) clicando nas sujeiras.</p>
      ) : (
        <ul className="staff-list">
          {team.map((m) => (
            <li key={m.id} className="staff-card">
              <div className="staff-card-head">
                <StaffThumb look={m.look} role={m.role} />
                <div>
                  <strong>{m.name}</strong>
                  <span className="small subtle">{roleDef(m.role).label}{inBranch ? ` · ${floorName(m.floor)}` : ''} · {m.trait}</span>
                </div>
                <span className="price">{formatMoney(staffSalary(m))}<span className="small subtle">/mês</span></span>
              </div>
              <div className="shift-picker" role="group" aria-label={`Turnos de ${m.name}`}>
                {BLOCKS.map((b, i) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`shift-btn ${m.shifts[i] ? 'active' : ''} ${i === PEAK_BLOCK ? 'peak' : ''}`}
                    aria-pressed={m.shifts[i]}
                    onClick={() => toggleStaffShift(m.id, i)}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <button type="button" className="link-btn" onClick={() => requestFire(m.id)}>Dispensar</button>
            </li>
          ))}
        </ul>
      )}

      {inBranch ? (
        <p className="hint">Folha mensal da filial: <strong>{formatMoney(salaries)}</strong>. Aparece em Finanças junto com os custos das filiais.</p>
      ) : (
      <p className="hint">
        Folha mensal: <strong>{formatMoney(salaries)}</strong> · sujeiras limpas pela equipe: {state.stats.cleanedByStaff ?? 0} · por você: {state.stats.cleaned} · aparelhos consertados pela equipe: {state.stats.repairedByStaff ?? 0}.
        Os salários aparecem em Finanças como “Salários da equipe”.
      </p>
      )}
    </section>
  );
}
