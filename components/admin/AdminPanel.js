'use client';
import { useCallback, useEffect, useState } from 'react';
import { formatMoney } from '../../game/utils/format.js';
import Icon from '../ui/Icon.js';

const FILTERS = [
  { id: 'all', label: 'Todos', total: 'users' },
  { id: 'suspect', label: 'Suspeitos', total: 'suspect' },
  { id: 'review', label: 'Em análise', total: 'review' },
  { id: 'banned', label: 'Banidos', total: 'banned' },
  { id: 'admin', label: 'Admins' },
];

const SORTS = [
  { id: 'recent', label: 'Jogou por último' },
  { id: 'alerts', label: 'Mais alertas' },
  { id: 'money', label: 'Mais dinheiro' },
  { id: 'students', label: 'Mais alunos' },
  { id: 'created', label: 'Conta mais nova' },
  { id: 'name', label: 'Apelido (A–Z)' },
];

const ACTION_LABEL = {
  warn: 'Advertência',
  fine: 'Multa',
  reset: 'Progresso zerado',
  hide: 'Tirado do ranking',
  unhide: 'Devolvido ao ranking',
  ban: 'Banimento',
  unban: 'Desbanido',
  clear_alerts: 'Alertas arquivados',
};

const EVENT_LABEL = { rejected: 'Save recusado', review: 'Em análise', cleared: 'Alertas arquivados' };

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
  return data;
}

const when = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

function ago(iso) {
  if (!iso) return 'nunca';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'agora';
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  return `há ${Math.round(s / 86400)} d`;
}

function StatusBadges({ u }) {
  return (
    <span className="adm-badges">
      {u.role === 'admin' ? <span className="adm-badge adm-badge-admin">admin</span> : null}
      {u.banned ? <span className="adm-badge adm-badge-ban">banido</span> : null}
      {u.hidden ? <span className="adm-badge adm-badge-review">fora do ranking</span> : null}
      {u.alerts > 0 || u.suspect.length ? <span className="adm-badge adm-badge-alert">suspeito</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------- ficha do jogador
function ActionForm({ kind, user, busy, onRun }) {
  const [message, setMessage] = useState('');
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState('7');
  const [sure, setSure] = useState(false);

  const run = (e) => {
    e.preventDefault();
    if (kind === 'reset' && !sure) {
      setSure(true);
      return;
    }
    const body = { action: kind, message };
    if (kind === 'fine') body.amount = Number(amount.replace(/\D/g, ''));
    if (kind === 'ban') body.days = days === 'forever' ? null : Number(days);
    onRun(body);
  };

  const needsText = kind === 'warn' || kind === 'ban' || kind === 'hide';
  const placeholder = {
    warn: 'Ex.: editar o jogo pelo navegador é proibido. Na próxima é banimento.',
    fine: 'Motivo (opcional, aparece para o jogador)',
    reset: 'Motivo (opcional, aparece para o jogador)',
    hide: 'Motivo (aparece para o jogador)',
    ban: 'Motivo (aparece quando a pessoa tentar entrar)',
  }[kind];

  return (
    <form className="adm-form" onSubmit={run}>
      {kind === 'fine' ? (
        <label className="adm-field">
          <span>Valor da multa (R$)</span>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ex.: 50000" required />
          <small>Saldo atual: {user.money == null ? '—' : formatMoney(user.money)}. A multa nunca deixa o saldo negativo.</small>
        </label>
      ) : null}
      {kind === 'ban' ? (
        <label className="adm-field">
          <span>Duração</span>
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">1 dia</option>
            <option value="3">3 dias</option>
            <option value="7">7 dias</option>
            <option value="30">30 dias</option>
            <option value="forever">Para sempre</option>
          </select>
        </label>
      ) : null}
      <label className="adm-field">
        <span>{needsText ? 'Mensagem' : 'Mensagem (opcional)'}</span>
        <textarea rows={2} maxLength={300} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={placeholder} required={needsText} />
      </label>
      <button type="submit" className={`btn btn-sm ${kind === 'warn' || kind === 'hide' ? 'btn-primary' : 'btn-danger'}`} disabled={busy}>
        {kind === 'reset' && sure ? 'Clique de novo para confirmar: apagar tudo' : {
          warn: 'Enviar advertência', fine: 'Aplicar multa', reset: 'Zerar progresso', hide: 'Tirar do ranking', ban: 'Banir',
        }[kind]}
      </button>
    </form>
  );
}

const ACTIONS = [
  { kind: 'warn', label: 'Advertir', icon: 'mail' },
  { kind: 'fine', label: 'Multar', icon: 'coin' },
  { kind: 'reset', label: 'Zerar progresso', icon: 'trash' },
  { kind: 'hide', label: 'Tirar do ranking', icon: 'eye' },
  { kind: 'ban', label: 'Banir', icon: 'ban' },
];

function UserDrawer({ name, onClose, onChanged }) {
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    let alive = true;
    setUser(null);
    setError(null);
    setOpen(null);
    setFlash(null);
    api(`/api/admin/users/${encodeURIComponent(name)}`)
      .then((d) => alive && setUser(d.user))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [name]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (body) => {
    setBusy(true);
    setFlash(null);
    try {
      const d = await api(`/api/admin/users/${encodeURIComponent(name)}`, body);
      setUser(d.user);
      setOpen(null);
      setFlash({ tone: 'ok', text: d.message });
      onChanged();
    } catch (e) {
      setFlash({ tone: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const isAdmin = user?.role === 'admin';
  const alerts = user?.events.filter((e) => e.kind === 'rejected') ?? [];

  return (
    <div className="adm-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="adm-drawer" role="dialog" aria-modal="true" aria-label={`Jogador ${name}`}>
        <header className="adm-drawer-head">
          <div>
            <h2>{user?.name ?? name}</h2>
            {user ? <StatusBadges u={user} /> : null}
          </div>
          <button type="button" className="btn btn-sm" onClick={onClose} aria-label="Fechar"><Icon name="close" size={16} /></button>
        </header>

        {error ? <p className="form-error"><Icon name="alert" size={15} /> {error}</p> : null}
        {!user && !error ? <p className="subtle">Carregando…</p> : null}

        {user ? (
          <div className="adm-drawer-body">
            {flash ? <p className={`adm-flash adm-flash-${flash.tone}`}>{flash.text}</p> : null}

            <dl className="adm-stats-grid">
              <div><dt>Dinheiro</dt><dd>{user.money == null ? '—' : formatMoney(user.money)}</dd></div>
              <div><dt>Patrimônio</dt><dd>{user.save ? formatMoney(user.save.wealth) : '—'}</dd></div>
              <div><dt>Alunos</dt><dd>{user.students ?? '—'}</dd></div>
              <div><dt>Era · dia</dt><dd>{user.era ? `${user.era} · ${user.day + 1}` : '—'}</dd></div>
              <div><dt>Conta criada</dt><dd>{when(user.createdAt)}</dd></div>
              <div><dt>Último save</dt><dd>{ago(user.lastSeen)}</dd></div>
              <div><dt>Sessões abertas</dt><dd>{user.sessions}</dd></div>
              <div><dt>Saves recusados</dt><dd className={user.alerts ? 'neg' : ''}>{user.alerts}</dd></div>
            </dl>

            {user.banned ? (
              <div className="adm-box adm-box-ban">
                <strong><Icon name="ban" size={15} /> Banido {user.bannedUntil ? `até ${when(user.bannedUntil)}` : 'para sempre'}</strong>
                <p>{user.banReason}</p>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run({ action: 'unban' })}>Desbanir</button>
              </div>
            ) : null}
            {user.hidden ? (
              <div className="adm-box adm-box-review">
                <strong><Icon name="eye" size={15} /> Fora do ranking</strong>
                <p>{user.hiddenReason}</p>
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => run({ action: 'unhide' })}>Aprovar e devolver ao ranking</button>
              </div>
            ) : null}

            <section className="adm-section">
              <h3><Icon name="shield" size={16} /> Análise automática</h3>
              {user.suspect.length ? (
                <div className="adm-box adm-box-alert">
                  <strong>O progresso atual é impossível partindo do zero:</strong>
                  <ul>{user.suspect.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  <p className="small">Provavelmente editou o jogo antes da proteção existir. Sugestão: zerar o progresso ou multar.</p>
                </div>
              ) : (
                <p className="small subtle">O progresso atual é possível jogando normalmente.</p>
              )}
              {alerts.length ? (
                <>
                  <p className="small"><strong>{alerts.length} save(s) recusado(s)</strong> — tentativas de mandar números impossíveis:</p>
                  <ul className="adm-log">
                    {alerts.slice(0, 8).map((e, i) => (
                      <li key={i}>
                        <span className="adm-log-when">{when(e.at)}</span>
                        <span>{e.detail}</span>
                        {e.data?.sent ? (
                          <span className="small subtle">
                            Enviou: {formatMoney(e.data.sent.money)} · {e.data.sent.students} alunos · dia {Math.floor(e.data.sent.day) + 1}
                            {e.data.from ? ` (antes: ${formatMoney(e.data.from.money)} · dia ${Math.floor(e.data.from.day) + 1})` : ''}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {!isAdmin ? (
                    <button type="button" className="btn btn-xs" disabled={busy} onClick={() => run({ action: 'clear_alerts' })}>Arquivar alertas</button>
                  ) : null}
                </>
              ) : null}
            </section>

            {isAdmin ? (
              <p className="small subtle">Contas de administrador não podem ser punidas pelo painel.</p>
            ) : (
              <section className="adm-section">
                <h3><Icon name="flag" size={16} /> Punições</h3>
                <div className="adm-actions">
                  {ACTIONS.filter((a) => !(a.kind === 'ban' && user.banned) && !(a.kind === 'hide' && user.hidden)).map((a) => (
                    <button
                      key={a.kind}
                      type="button"
                      className={`btn btn-sm ${open === a.kind ? 'btn-primary' : ''}`}
                      onClick={() => setOpen(open === a.kind ? null : a.kind)}
                      aria-expanded={open === a.kind}
                    >
                      <Icon name={a.icon} size={14} /> {a.label}
                    </button>
                  ))}
                </div>
                {open ? <ActionForm key={open} kind={open} user={user} busy={busy} onRun={run} /> : null}
              </section>
            )}

            <section className="adm-section">
              <h3><Icon name="calendar" size={16} /> Histórico</h3>
              {user.actions.length || user.events.length ? (
                <ul className="adm-log">
                  {[
                    ...user.actions.map((a) => ({ at: a.at, title: ACTION_LABEL[a.action] ?? a.action, text: a.detail, by: a.admin })),
                    ...user.events.filter((e) => e.kind !== 'rejected').map((e) => ({ at: e.at, title: EVENT_LABEL[e.kind] ?? e.kind, text: e.detail })),
                  ]
                    .sort((a, b) => new Date(b.at) - new Date(a.at))
                    .map((h, i) => (
                      <li key={i}>
                        <span className="adm-log-when">{when(h.at)}</span>
                        <span><strong>{h.title}</strong>{h.by ? ` por ${h.by}` : ''}{h.text ? ` — ${h.text}` : ''}</span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="small subtle">Nada por aqui ainda.</p>
              )}
              {user.notices.length ? (
                <>
                  <p className="small"><strong>Avisos enviados</strong></p>
                  <ul className="adm-log">
                    {user.notices.map((n, i) => (
                      <li key={i}>
                        <span className="adm-log-when">{when(n.at)}</span>
                        <span>{n.text} <em className="subtle">({n.seen ? 'visto' : 'ainda não visto'})</em></span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------- lista
export default function AdminPanel({ adminName }) {
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ filter, sort, q: query, page: String(page) });
    api(`/api/admin/users?${params}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [filter, sort, query, page, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const close = useCallback(() => setSelected(null), []);
  const totals = data?.totals;

  return (
    <div className="adm">
      <header className="adm-top">
        <div className="adm-brand">
          <Icon name="shield" size={26} />
          <div>
            <h1>Painel do administrador</h1>
            <p className="small subtle">Academia do Tio Zé · logado como <strong>{adminName}</strong></p>
          </div>
        </div>
        <div className="adm-top-actions">
          <button type="button" className="btn btn-sm" onClick={refresh}><Icon name="undo" size={14} /> Atualizar</button>
          <a className="btn btn-sm" href="/"><Icon name="play" size={14} /> Voltar ao jogo</a>
        </div>
      </header>

      <main className="adm-main">
        <div className="adm-cards">
          {FILTERS.filter((f) => f.total).map((f) => (
            <button
              key={f.id}
              type="button"
              className={`adm-card adm-card-${f.id} ${filter === f.id ? 'is-on' : ''}`}
              onClick={() => { setFilter(f.id); setPage(0); }}
            >
              <span className="adm-card-n">{totals ? totals[f.total] : '–'}</span>
              <span className="adm-card-l">{f.label}</span>
            </button>
          ))}
        </div>

        <div className="adm-toolbar">
          <label className="adm-search">
            <Icon name="search" size={16} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Buscar apelido" maxLength={20} aria-label="Buscar apelido" />
          </label>
          <div className="adm-tabs" role="tablist" aria-label="Filtro">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={filter === f.id ? 'is-on' : ''} onClick={() => { setFilter(f.id); setPage(0); }}>
                {f.label}
              </button>
            ))}
          </div>
          <label className="adm-sort">
            <span className="small subtle">Ordenar</span>
            <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>

        {error ? <p className="form-error"><Icon name="alert" size={15} /> {error}</p> : null}

        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Jogador</th>
                <th className="num">Dinheiro</th>
                <th className="num">Alunos</th>
                <th className="num">Era · dia</th>
                <th>Último save</th>
                <th className="num">Recusados</th>
              </tr>
            </thead>
            <tbody>
              {data?.list.map((u) => (
                <tr key={u.name} onClick={() => setSelected(u.name)} className={u.banned ? 'is-banned' : ''}>
                  <td>
                    <button type="button" className="adm-name" onClick={(e) => { e.stopPropagation(); setSelected(u.name); }}>{u.name}</button>
                    <StatusBadges u={u} />
                  </td>
                  <td className="num">{u.money == null ? '—' : formatMoney(u.money)}</td>
                  <td className="num">{u.students ?? '—'}</td>
                  <td className="num">{u.era ? `${u.era} · ${u.day + 1}` : '—'}</td>
                  <td>{ago(u.lastSeen)}</td>
                  <td className={`num ${u.alerts ? 'neg' : 'subtle'}`}>{u.alerts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && !data.list.length ? <p className="empty">Nenhum jogador encontrado.</p> : null}
          {!data && !error ? <p className="subtle adm-loading">Carregando jogadores…</p> : null}
        </div>

        {data && (page > 0 || data.hasMore) ? (
          <div className="adm-pager">
            <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button>
            <span className="small subtle">Página {page + 1}</span>
            <button type="button" className="btn btn-sm" disabled={!data.hasMore} onClick={() => setPage(page + 1)}>Próxima</button>
          </div>
        ) : null}
      </main>

      {selected ? <UserDrawer name={selected} onClose={close} onChanged={refresh} /> : null}
    </div>
  );
}
