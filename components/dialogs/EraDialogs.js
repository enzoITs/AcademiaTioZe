'use client';
import { useMemo, useState } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { CONFIG, PROFILES, BLOCKS, eraDef } from '../../game/config.js';
import { ERA_CEREMONY } from '../../game/content/lines.js';
import { footprintSize } from '../../game/grid/grid.js';
import { formatMoney } from '../../game/utils/format.js';
import { canMoveEra, previewEraMove } from '../../game/systems/eras.js';
import { closeModal, confirmEraMove, dismissPending } from '../../game/engine/store.js';
import { Avatar } from '../hud/MessagesPanel.js';
import Modal from './Modal.js';
import Icon from '../ui/Icon.js';

const CAT_COLOR = { cardio: '#8ec5e8', pesoLivre: '#f29a8e', maquinas: '#b9a3e3', funcional: '#a8e6cf', conforto: '#f2cd5c', decoracao: '#f5b3c8' };

const listNames = (types) => types.map((t) => CONFIG.equipment[t].name.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' e $1');

/** Turno preferido do perfil ("de manhã", "à tarde", "à noite"). */
function peakOf(profile) {
  const shares = BLOCKS.map((b) => profile.blockShare?.[b.id] ?? b.share);
  const i = shares.indexOf(Math.max(...shares));
  return ['de manhã', 'à tarde', 'à noite'][i] ?? 'à noite';
}

/** Planta do novo ponto, com os aparelhos já onde a mudança inteligente vai pôr. */
function NewPlan({ preview }) {
  const { layout, placed, cols, rows } = preview;
  const door = layout.door;
  return (
    <svg className="site-plan" viewBox={`-0.3 -0.3 ${cols + 0.6} ${rows + 1.4}`} role="img" aria-label="Planta do novo ponto">
      <rect x={-0.3} y={rows + 0.2} width={cols + 0.6} height={0.9} fill="#b9b4c4" />
      {layout.zones.map((z) => (
        <g key={z.id}>
          <rect
            x={z.x + 0.06} y={z.y + 0.06} width={z.w - 0.12} height={z.h - 0.12} rx={0.3}
            fill={z.startsUnlocked ? '#f3e3d3' : '#ece8ef'}
            stroke={z.startsUnlocked ? '#3d3550' : '#9a92ad'}
            strokeWidth={0.1}
            strokeDasharray={z.startsUnlocked ? undefined : '0.35 0.25'}
          />
          {z.startsUnlocked ? null : (
            <>
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 - 0.1} textAnchor="middle" className="site-label">{z.label.split(' ')[0]}</text>
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 0.75} textAnchor="middle" className="site-sub">{formatMoney(z.cost)}</text>
            </>
          )}
        </g>
      ))}
      {placed.map((i) => {
        const { w, h } = footprintSize(i.type, i.rot);
        const def = CONFIG.equipment[i.type];
        return (
          <rect
            key={i.id} x={i.x + 0.1} y={i.y + 0.1} width={w - 0.2} height={h - 0.2} rx={0.18}
            fill={CAT_COLOR[def.category] ?? '#d9cfc0'} stroke="#3d3550" strokeWidth={0.06}
          >
            <title>{def.name}</title>
          </rect>
        );
      })}
      <rect x={door.x + 0.15} y={door.y + 0.75} width={0.7} height={0.35} rx={0.1} fill="#c9a27a" stroke="#3d3550" strokeWidth={0.06} />
    </svg>
  );
}

/** Prévia do mapa da cidade antes de virar Rede: Matriz, Matriz Histórica, MegaFit e os primeiros lotes. */
function CityTeaser() {
  const spots = [
    { x: 0, y: 0, label: 'Matriz', fill: '#cfe3ef' },
    { x: -2, y: 1, label: 'Matriz Histórica', fill: '#c8b6dc' },
    { x: 2, y: -1, label: 'MegaFit', fill: '#dfe2ea' },
    { x: 1, y: 0, label: 'À venda', lot: true },
    { x: -1, y: 0, label: 'À venda', lot: true },
  ];
  return (
    <svg className="site-plan" viewBox="-32 -20 64 40" role="img" aria-label="Prévia do mapa da cidade">
      <rect x="-32" y="-20" width="64" height="40" fill="#cfe6c0" />
      {[-18, -6, 6, 18].map((x) => <rect key={`v${x}`} x={x - 1} y="-20" width="2" height="40" fill="#b9b4c4" />)}
      {[-18, -6, 6, 18].map((y) => <rect key={`h${y}`} x="-32" y={y - 1} width="64" height="2" fill="#b9b4c4" />)}
      {spots.map((s) => (
        <g key={s.label + s.x}>
          <rect x={s.x * 12 - 5} y={s.y * 12 - 5} width="10" height="10" rx="1.2" fill={s.lot ? '#e6efd9' : '#efe6d6'} stroke={s.lot ? '#9a92ad' : '#3d3550'} strokeWidth="0.35" strokeDasharray={s.lot ? '1 0.7' : undefined} />
          {s.lot ? null : <rect x={s.x * 12 - 3} y={s.y * 12 - 3} width="6" height="4.5" rx="0.4" fill={s.fill} stroke="#3d3550" strokeWidth="0.3" />}
          <text x={s.x * 12} y={s.y * 12 + 4.2} textAnchor="middle" fontSize="1.7" fontWeight="800" fill="#3d3550">{s.label}</text>
        </g>
      ))}
    </svg>
  );
}

/** Era 3 → 4: não há mudança de lugar; a tela mostra o mapa da cidade. */
function NetworkMoveDialog({ preview }) {
  const { state } = useGame();
  const def = eraDef(preview.era);
  const check = canMoveEra(state);
  const fee = CONFIG.economy.eraBaseFee;
  const N = CONFIG.network;
  const maxFee = CONFIG.economy.feeSlider.maxByEra?.[String(preview.era)];
  return (
    <Modal title={`Era ${preview.era}: ${def.label}`} onClose={closeModal} className="modal-wide">
      <div className="exp-head">
        <h2 className="modal-title">Era {preview.era}: {def.label}</h2>
        <span className="small subtle">saldo {formatMoney(state.money)}</span>
      </div>
      <p className="small subtle exp-infinite">{def.description}</p>
      <div className="exp-layout">
        <CityTeaser />
        <ul className="era-move-list">
          <li><strong>Sem mudança:</strong> os {state.items.length} aparelhos, as áreas e a equipe ficam onde estão. O prédio vira a Matriz.</li>
          <li><strong>{def.moveCostLabel}:</strong> {formatMoney(def.moveCost ?? 0)} agora.</li>
          <li><strong>Mensalidade base:</strong> sobe de {formatMoney(fee[String(state.era)])} para {formatMoney(fee[String(preview.era)])}{maxFee ? ` (teto do slider: ${formatMoney(maxFee)})` : ''}.</li>
          <li>
            <strong>Filiais:</strong> a primeira custa a partir de {formatMoney(N.branchCost)}. Cada uma tem estilo (Acolhedora, Hardcore, Família ou Premium),
            gerente com nota de 1 a 5 estrelas e rende sozinha: membros × mensalidade − custos.
          </li>
          <li><strong>Matriz Histórica:</strong> a garagem do Tio Zé dá +{Math.round(N.historicBonus * 100)}% de membros em todas as filiais.</li>
          <li><strong>Equipe da Matriz:</strong> até {def.maxStaff} pessoas.</li>
          <li><strong>Festa:</strong> sem dia de portas fechadas. Todos os alunos ganham +{def.noveltyBonus} de satisfação por {def.noveltyDays} dias.</li>
        </ul>
      </div>
      {check.ok ? null : <p className="neg small">{check.reason}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={closeModal} data-autofocus>Ainda não</button>
        <button type="button" className="btn btn-primary" onClick={confirmEraMove} disabled={!check.ok}>
          <Icon name="flag" size={15} /> Virar Rede ({formatMoney(def.moveCost ?? 0)})
        </button>
      </div>
    </Modal>
  );
}

/** Passo 1: a planta do espaço novo antes de pagar. */
export function EraMoveDialog() {
  const { state } = useGame();
  const preview = useMemo(() => previewEraMove(state), [state, state.items.length, state.era]);
  if (!preview) return null;
  if (preview.stays) return <NetworkMoveDialog preview={preview} />;
  const def = eraDef(preview.era);
  const base = preview.layout.zones.find((z) => z.startsUnlocked);
  const extras = preview.layout.zones.filter((z) => !z.startsUnlocked);
  const check = canMoveEra(state);
  const newcomers = Object.entries(PROFILES).filter(([, p]) => p.minEra === preview.era);
  const fee = CONFIG.economy.eraBaseFee;
  const refund = preview.leftovers.reduce((s, i) => s + (i.pricePaid ?? 0), 0);
  const newItems = Object.entries(CONFIG.equipment).filter(([, e]) => e.minEra === preview.era).map(([t]) => t);

  return (
    <Modal title={`Mudança para o ${def.label}`} onClose={closeModal} className="modal-wide">
      <div className="exp-head">
        <h2 className="modal-title">Era {preview.era}: {def.label}</h2>
        <span className="small subtle">saldo {formatMoney(state.money)}</span>
      </div>
      <p className="small subtle exp-infinite">{def.description}</p>
      <div className="exp-layout">
        <NewPlan preview={preview} />
        <ul className="era-move-list">
          <li>
            <strong>Espaço:</strong> {base.w}×{base.h} ({base.w * base.h} tiles)
            {extras.length ? `, e depois ${extras.map((z) => `${z.label} ${z.w}×${z.h} (${formatMoney(z.cost)})`).join(' e ')}` : ''}.
          </li>
          <li>
            <strong>Mudança inteligente:</strong> {preview.placed.length} de {state.items.length} aparelhos já encaixados na planta, com corredor até a frente de cada um.
            O usado continua usado e a condição se mantém.
            {preview.leftovers.length ? ` ${preview.leftovers.length} não cabem e serão vendidos pelo preço pago (${formatMoney(refund)}).` : ''}
          </li>
          <li><strong>{def.moveCostLabel ?? 'Mudança'}:</strong> {formatMoney(def.moveCost ?? 0)} agora.</li>
          <li><strong>{def.rentLabel ?? 'Aluguel'}:</strong> {formatMoney(def.rent)}/mês, cobrado por dia{eraDef(state.era).rent ? ` (hoje: ${formatMoney(eraDef(state.era).rent)})` : ''}.</li>
          <li><strong>Mensalidade base:</strong> sobe de {formatMoney(fee[String(state.era)])} para {formatMoney(fee[String(preview.era)])}: dá para cobrar mais sem perder a nota de preço justo.</li>
          {newcomers.map(([id, p]) => (
            <li key={id}>
              <strong>Novo perfil, {p.label}:</strong> treina mais {peakOf(p)} e quer {listNames(p.essentials)}.
            </li>
          ))}
          {newItems.length ? <li><strong>Na loja:</strong> {listNames(newItems)}.</li> : null}
          <li><strong>Equipe:</strong> até {def.maxStaff} pessoas.</li>
          <li>
            <strong>Inauguração:</strong> 1 dia de portas fechadas (sem mensalidade). Em troca, todos os alunos ganham +{def.noveltyBonus} de
            satisfação por {def.noveltyDays} dias.
          </li>
          {def.leaving ? <li className="subtle">{def.leaving}</li> : null}
        </ul>
      </div>
      {check.ok ? null : <p className="neg small">{check.reason}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={closeModal} data-autofocus>Ainda não</button>
        <button type="button" className="btn btn-primary" onClick={confirmEraMove} disabled={!check.ok}>
          <Icon name="door" size={15} /> Mudar agora ({formatMoney(def.moveCost ?? 0)})
        </button>
      </div>
    </Modal>
  );
}

function TruckArt() {
  return (
    <svg viewBox="0 0 200 120" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="120" fill="#cfe6c0" />
      <rect y="86" width="200" height="34" fill="#b9b4c4" />
      <path d="M0 102 H200" stroke="#fffdf8" strokeWidth="3" strokeDasharray="14 10" />
      <rect x="30" y="38" width="92" height="52" rx="6" fill="#fffdf8" stroke="#3d3550" strokeWidth="2.5" />
      <text x="76" y="60" textAnchor="middle" fontSize="11" fontWeight="800" fill="#3d3550">MUDANÇAS</text>
      <text x="76" y="75" textAnchor="middle" fontSize="9" fontWeight="700" fill="#c94f55">do Bairro</text>
      <path d="M122 52 H150 L166 70 V90 H122 Z" fill="#f29a5c" stroke="#3d3550" strokeWidth="2.5" />
      <rect x="130" y="58" width="18" height="12" rx="2" fill="#bfe3f5" stroke="#3d3550" strokeWidth="2" />
      {[52, 100, 148].map((x) => <circle key={x} cx={x} cy="92" r="10" fill="#4a4560" stroke="#3d3550" strokeWidth="2.5" />)}
      <rect x="6" y="66" width="18" height="22" rx="3" fill="#8ec5e8" stroke="#3d3550" strokeWidth="2" />
    </svg>
  );
}

function RibbonArt({ era }) {
  const neon = era >= 3;
  return (
    <svg viewBox="0 0 200 120" width="100%" height="100%" aria-hidden="true">
      <rect width="200" height="120" fill={neon ? '#dcebf3' : '#f3e3d3'} />
      <rect x="40" y="14" width="120" height="22" rx="5" fill={neon ? '#3d3550' : '#f2cd5c'} stroke="#3d3550" strokeWidth="2.5" />
      <text x="100" y="30" textAnchor="middle" fontSize="11" fontWeight="800" fill={neon ? '#ff7eb6' : '#3d3550'}>ACADEMIA DO TIO ZÉ</text>
      <rect x="62" y="40" width="76" height="70" rx="4" fill={neon ? '#cfe3ef' : '#c8b6dc'} stroke="#3d3550" strokeWidth="2.5" />
      <rect x="70" y="48" width="60" height="62" fill="#efe6d6" stroke="#3d3550" strokeWidth="2" />
      <path d="M20 74 Q60 82 100 74 T180 74" stroke="#e8646a" strokeWidth="7" fill="none" />
      <path d="M92 66 L100 74 L92 84 M108 66 L100 74 L108 84" stroke="#e8646a" strokeWidth="5" fill="none" />
      <path d="M124 60 L146 80 M146 60 L124 80" stroke="#8f92a6" strokeWidth="4" strokeLinecap="round" />
      <circle cx="122" cy="58" r="5" fill="none" stroke="#3d3550" strokeWidth="2.5" />
      <circle cx="148" cy="58" r="5" fill="none" stroke="#3d3550" strokeWidth="2.5" />
      {[[30, 20, '#8ec5e8'], [175, 26, '#a8e6cf'], [20, 100, '#f5b3c8'], [182, 96, '#f2cd5c']].map(([x, y, c]) => (
        <rect key={`${x}`} x={x} y={y} width="7" height="7" fill={c} transform={`rotate(25 ${x} ${y})`} />
      ))}
    </svg>
  );
}

/** Passos 3 a 5: cerimônia curta de inauguração, um quadro por vez. */
export function EraCeremony({ era }) {
  const def = eraDef(era);
  const text = ERA_CEREMONY[era] ?? ERA_CEREMONY[2];
  const [step, setStep] = useState(0);
  const steps = def.relocate === false ? [
    { title: 'A cidade no mapa', art: <CityTeaser />, text: text.city },
    {
      title: 'Corte de fita da Rede',
      art: <RibbonArt era={era} />,
      text: `${text.ribbon} Todo mundo treina com +${def.noveltyBonus} de satisfação por ${def.noveltyDays} dias.`,
    },
    { who: 'tioze', title: 'O Tio Zé voltou!', text: text.tioze },
    { who: 'whey', title: 'O Whey inspeciona', text: text.whey },
    { who: 'valeria', title: 'Cesta da Valéria', text: text.valeria },
  ] : [
    { title: 'O caminhão chegou!', art: <TruckArt />, text: text.truck },
    {
      title: 'Corte de fita',
      art: <RibbonArt era={era} />,
      text: `${text.ribbon} Hoje as portas ficam fechadas para a festa (sem mensalidade). A partir de amanhã, todo mundo treina com +${def.noveltyBonus} de satisfação por ${def.noveltyDays} dias.`,
    },
    { who: 'tioze', title: 'Postal do Tio Zé', text: text.tioze },
    { who: 'whey', title: 'O Whey inspeciona', text: text.whey },
    { who: 'armando', title: 'Seu Armando passou na calçada', text: text.armando },
    ...(text.duda ? [{ who: 'duda', title: 'A embaixadora chegou', text: text.duda }] : []),
  ];
  const s = steps[step];
  const last = step === steps.length - 1;
  return (
    <Modal title={`Inauguração: ${def.label}`} onClose={dismissPending} className="postcard">
      <div className="postcard-photo">
        {s.art ?? (
          <div className="era-portrait"><Avatar who={s.who} size={96} /></div>
        )}
        <span className="postcard-caption">Era {era} · {def.label}</span>
      </div>
      <div className="postcard-text">
        <span className="postcard-stamp">Inauguração · {step + 1}/{steps.length}</span>
        <h2 className="modal-title">{s.title}</h2>
        <p>{s.text}</p>
        <div className="era-dots" aria-hidden="true">
          {steps.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}
        </div>
        <div className="modal-actions">
          {last ? (
            <button type="button" className="btn btn-primary" onClick={dismissPending} data-autofocus>Bora treinar!</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)} data-autofocus>Próximo</button>
          )}
        </div>
      </div>
    </Modal>
  );
}
