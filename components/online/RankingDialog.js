'use client';
import { useEffect, useState } from 'react';
import { eraDef } from '../../game/config.js';
import { closeModal, openModal } from '../../game/engine/store.js';
import { fetchRanking, searchPlayers, fetchProfile } from '../../game/engine/cloud.js';
import { formatMoney, formatMoneyShort, formatNumber } from '../../game/utils/format.js';
import { useAccount } from '../../hooks/useAccount.js';
import Modal from '../dialogs/Modal.js';
import Stars from '../hud/Stars.js';
import Icon from '../ui/Icon.js';
import CompareChart from './CompareChart.js';

const BOARDS = {
  money: { label: 'Dinheiro', value: (p) => formatMoney(p.money) },
  students: { label: 'Alunos', value: (p) => `${p.students} alunos` },
};
const ME_COLOR = '#3f7fb0';
const THEM_COLOR = '#d4555c';

const sameName = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const errorText = (err) => (err.status ? err.message : 'Sem conexão com o servidor.');

function useFetch(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn()
      .then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((err) => alive && setState({ loading: false, data: null, error: errorText(err) }));
    return () => {
      alive = false;
    };
  }, deps);
  return state;
}

function PlayerRow({ player, board, me, onOpen }) {
  return (
    <li>
      <button type="button" className={`rank-row ${me ? 'is-me' : ''}`} onClick={() => onOpen(player.name)}>
        <span className={`rank-pos pos-${player.position}`}>{player.position ?? '—'}</span>
        <span className="rank-name">
          <strong>{player.name}</strong>{me ? <span className="chip">você</span> : null}
          <small>Era {player.era} · {eraDef(player.era).label} · {player.branches ? `${player.branches} filiais` : `dia ${player.day + 1}`}</small>
        </span>
        <span className="rank-value">{BOARDS[board].value(player)}</span>
      </button>
    </li>
  );
}

function Board() {
  const acc = useAccount();
  const [board, setBoard] = useState('money');
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState(null);
  const [viewing, setViewing] = useState(null);
  const ranking = useFetch(() => fetchRanking(board, page), [board, page, acc.user?.name, acc.syncedAt ? 1 : 0]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setFound(null);
      return undefined;
    }
    const id = setTimeout(() => {
      searchPlayers(q).then((r) => setFound(r.players)).catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(id);
  }, [query]);

  if (viewing) return <ProfileView name={viewing} onBack={() => setViewing(null)} />;

  const data = ranking.data;
  const me = data?.me;
  const meInList = me && data.list.some((p) => sameName(p.name, me.name));
  return (
    <>
      <div className="char-head"><span className="trophy-mark"><Icon name="trophy" size={26} /></span><h2 className="modal-title">Ranking das academias</h2></div>
      <div className="seg" role="tablist" aria-label="Ordenar por">
        {Object.entries(BOARDS).map(([id, b]) => (
          <button key={id} type="button" role="tab" aria-selected={board === id} className={`seg-btn ${board === id ? 'active' : ''}`} onClick={() => { setBoard(id); setPage(0); }}>
            <Icon name={id === 'money' ? 'coin' : 'people'} size={15} /> {b.label}
          </button>
        ))}
      </div>
      <label className="field search-field">
        <Icon name="search" size={15} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar jogador pelo apelido" aria-label="Buscar jogador" />
      </label>

      {found ? (
        <ul className="rank-list" aria-label="Jogadores encontrados">
          {found.length ? found.map((p) => (
            <PlayerRow key={p.name} player={{ ...p, position: null }} board={board} me={sameName(p.name, acc.user?.name)} onOpen={setViewing} />
          )) : <li className="small subtle rank-empty">Ninguém com esse apelido.</li>}
        </ul>
      ) : ranking.error ? (
        <p className="form-error"><Icon name="alert" size={15} /> {ranking.error}</p>
      ) : !data ? (
        <p className="small subtle rank-empty">Carregando…</p>
      ) : (
        <>
          <ol className="rank-list" aria-label={`Ranking por ${BOARDS[board].label.toLowerCase()}`}>
            {data.list.length ? data.list.map((p) => (
              <PlayerRow key={p.name} player={p} board={board} me={sameName(p.name, acc.user?.name)} onOpen={setViewing} />
            )) : <li className="small subtle rank-empty">Ninguém no ranking ainda. Seja o primeiro!</li>}
          </ol>
          {page > 0 || data.hasMore ? (
            <div className="rank-pages">
              <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
              <span className="small subtle">Página {page + 1}</span>
              <button type="button" className="btn btn-sm" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Próxima</button>
            </div>
          ) : null}
        </>
      )}

      <div className="rank-me">
        {!acc.user ? (
          <>
            <span>Entre numa conta para aparecer no ranking.</span>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => openModal({ kind: 'account', mode: 'register' })}>Criar conta</button>
          </>
        ) : me?.flagged ? (
          <span><Icon name="alert" size={15} /> Seu perfil está em revisão e fora do ranking: o servidor achou um salto de progresso impossível.</span>
        ) : me && !meInList && !found ? (
          <ul className="rank-list"><PlayerRow player={me} board={board} me onOpen={setViewing} /></ul>
        ) : !me ? (
          <span>Seu perfil aparece aqui depois do primeiro salvamento na nuvem.</span>
        ) : (
          <button type="button" className="btn btn-sm" onClick={() => setViewing(me.name)}><Icon name="user" size={15} /> Ver meu perfil</button>
        )}
      </div>
      <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={closeModal}>Fechar</button></div>
    </>
  );
}

const ROWS = [
  { label: 'Dinheiro', get: (p) => p.money, show: formatMoney },
  { label: 'Alunos (total)', get: (p) => p.students, show: String },
  { label: 'Alunos na Matriz', get: (p) => p.matrizStudents, show: String },
  { label: 'Membros nas filiais', get: (p) => p.branchMembers, show: String },
  { label: 'Filiais', get: (p) => p.branches, show: String },
  { label: 'Reputação', get: (p) => p.reputation, show: (v) => <Stars value={v} size={12} /> },
  { label: 'Era', get: (p) => p.era, show: (v) => `${v} · ${eraDef(v).label}` },
  { label: 'Aparelhos', get: (p) => p.equipment, show: String },
  { label: 'Equipe', get: (p) => p.staff, show: String },
  { label: 'Dias de jogo', get: (p) => p.day + 1, show: String, neutral: true },
  { label: 'Posição em dinheiro', get: (p) => p.rank, show: (v) => (v ? `#${v}` : '—'), lowerWins: true },
  { label: 'Posição em alunos', get: (p) => p.rankStudents, show: (v) => (v ? `#${v}` : '—'), lowerWins: true },
];

function better(row, a, b) {
  const x = row.get(a);
  const y = row.get(b);
  if (row.neutral || x == null || y == null || x === y) return false;
  return row.lowerWins ? x < y : x > y;
}

const points = (profile, key) => (profile?.history ?? []).map((h) => ({ month: h.month, label: h.label, value: h[key] }));

function ProfileView({ name, onBack }) {
  const acc = useAccount();
  const own = sameName(name, acc.user?.name);
  const them = useFetch(() => fetchProfile(name), [name]);
  const mine = useFetch(() => (acc.user && !own ? fetchProfile(acc.user.name) : Promise.resolve(null)), [acc.user?.name, own]);
  const p = them.data?.profile;
  const m = mine.data?.profile ?? null;

  if (them.error) {
    return (
      <>
        <button type="button" className="btn btn-sm btn-link" onClick={onBack}>← Ranking</button>
        <p className="form-error"><Icon name="alert" size={15} /> {them.error}</p>
      </>
    );
  }
  if (!p) return <p className="small subtle rank-empty">Carregando perfil…</p>;

  const series = (key) => [
    { name: p.name, color: own ? ME_COLOR : THEM_COLOR, dashed: !own, points: points(p, key) },
    ...(m ? [{ name: 'Você', color: ME_COLOR, points: points(m, key) }] : []),
  ];
  const since = new Date(p.createdAt).toLocaleDateString('pt-BR');

  return (
    <>
      <button type="button" className="btn btn-sm btn-link back-link" onClick={onBack}>← Ranking</button>
      <div className="profile-head">
        <span className="profile-avatar" aria-hidden="true">{p.name.slice(0, 2).toUpperCase()}</span>
        <div>
          <h2 className="modal-title">{p.name}{own ? <span className="chip">você</span> : null}</h2>
          <p className="small subtle">Era {p.era} · {eraDef(p.era).label} · jogando desde {since}</p>
          {p.flagged ? <p className="small neg"><Icon name="alert" size={13} /> Perfil em revisão, fora do ranking.</p> : null}
        </div>
      </div>

      <table className="compare-table">
        <thead>
          <tr><th scope="col"><span className="sr-only">Indicador</span></th><th scope="col">{p.name}</th>{m ? <th scope="col">Você</th> : null}</tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td className={m && better(row, p, m) ? 'wins' : ''}>{row.show(row.get(p))}</td>
              {m ? <td className={better(row, m, p) ? 'wins' : ''}>{row.show(row.get(m))}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {m ? <p className="small subtle">Em verde, quem está na frente em cada item.</p> : !acc.user ? <p className="small subtle">Entre numa conta para comparar com o seu desempenho.</p> : null}

      <div className="chart-pair">
        <CompareChart title="Saldo no fim de cada mês" series={series('money')} format={(v, axis) => (axis ? formatMoneyShort(v) : formatMoney(v))} />
        <CompareChart title="Alunos na Matriz no fim de cada mês" series={series('students')} format={(v, axis) => (axis ? formatNumber(v, 0) : `${v} alunos`)} />
      </div>
      <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={closeModal}>Fechar</button></div>
    </>
  );
}

export default function RankingDialog({ profile = null }) {
  return (
    <Modal title="Ranking" onClose={closeModal} className="modal-wide modal-ranking">
      {profile ? <ProfileOnly name={profile} /> : <Board />}
    </Modal>
  );
}

function ProfileOnly({ name }) {
  const [viewing, setViewing] = useState(name);
  if (!viewing) return <Board />;
  return <ProfileView name={viewing} onBack={() => setViewing(null)} />;
}
