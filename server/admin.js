// Painel do administrador: lista de jogadores, detalhes e punições.
// Só é chamado pelas rotas /api/admin, que conferem o papel 'admin' antes.
import { parseSave } from '../game/engine/persistence.js';
import { createNewGame } from '../game/engine/state.js';
import { transact } from '../game/economy/economy.js';
import { formatMoney } from '../game/utils/format.js';
import { one, query, BAN_ACTIVE } from './db.js';
import { writeSave, fullMetrics, metricsOf, logEvent } from './progress.js';

const PAGE = 50;

const SORTS = {
  recent: 'last_seen DESC NULLS LAST, u.id DESC',
  money: 'p.money DESC NULLS LAST',
  students: 'p.students DESC NULLS LAST',
  alerts: 'alerts DESC, last_alert DESC NULLS LAST',
  name: 'u.name_key ASC',
  created: 'u.created_at DESC',
};

const FILTERS = {
  all: 'true',
  suspect: "(ev.alerts > 0 OR jsonb_array_length(COALESCE(s.metrics->'scratch', '[]'::jsonb)) > 0)",
  review: 'COALESCE(p.hidden, false)',
  banned: BAN_ACTIVE,
  admin: "u.role = 'admin'",
};

/** Saves antigos ainda sem métricas: calcula agora (uma vez). */
async function fillMissingMetrics() {
  const rows = await query('SELECT user_id, data FROM saves WHERE metrics IS NULL LIMIT 200');
  for (const r of rows) {
    const m = metricsOf(r.data);
    if (m) await query('UPDATE saves SET metrics = $2::jsonb WHERE user_id = $1', [r.user_id, JSON.stringify(m)]);
  }
}

function userRow(r) {
  return {
    name: r.name,
    role: r.role,
    createdAt: r.created_at,
    lastSeen: r.last_seen,
    banned: !!r.banned,
    banReason: r.ban_reason,
    bannedUntil: r.banned_until,
    hidden: !!r.hidden,
    hiddenReason: r.hidden_reason,
    money: r.money == null ? null : Number(r.money),
    students: r.students,
    era: r.era,
    day: r.day,
    alerts: r.alerts ?? 0,
    lastAlert: r.last_alert,
    suspect: Array.isArray(r.scratch) ? r.scratch : [],
  };
}

const USER_SELECT = `
  u.id, u.name, u.role, u.created_at, u.ban_reason, u.banned_until, ${BAN_ACTIVE} AS banned,
  p.money, p.students, p.era, p.day, p.hidden, p.hidden_reason, s.updated_at AS last_seen,
  s.metrics->'scratch' AS scratch, COALESCE(ev.alerts, 0)::int AS alerts, ev.last_alert
  FROM users u
  LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN saves s ON s.user_id = u.id
  LEFT JOIN (
    SELECT user_id, count(*) AS alerts, max(created_at) AS last_alert
      FROM security_events WHERE kind = 'rejected' GROUP BY user_id
  ) ev ON ev.user_id = u.id`;

export async function listUsers({ q = '', filter = 'all', sort = 'recent', page = 0 } = {}) {
  await fillMissingMetrics();
  const term = String(q).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const where = `${FILTERS[filter] ?? FILTERS.all} AND u.name_key LIKE $1`;
  const offset = Math.max(0, page) * PAGE;
  const rows = await query(
    `SELECT ${USER_SELECT} WHERE ${where} ORDER BY ${SORTS[sort] ?? SORTS.recent} LIMIT $2 OFFSET $3`,
    [`%${term}%`, PAGE + 1, offset],
  );
  const totals = await one(
    `SELECT count(*)::int AS users,
            count(*) FILTER (WHERE ${BAN_ACTIVE})::int AS banned,
            count(*) FILTER (WHERE COALESCE(p.hidden, false))::int AS review,
            count(*) FILTER (WHERE ${FILTERS.suspect})::int AS suspect
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN saves s ON s.user_id = u.id
       LEFT JOIN (SELECT user_id, count(*) AS alerts FROM security_events WHERE kind = 'rejected' GROUP BY user_id) ev ON ev.user_id = u.id`,
  );
  return { list: rows.slice(0, PAGE).map(userRow), hasMore: rows.length > PAGE, page, totals };
}

async function targetByName(name) {
  return one(`SELECT ${USER_SELECT} WHERE u.name_key = $1`, [String(name).toLowerCase()]);
}

export async function userDetail(name) {
  const r = await targetByName(name);
  if (!r) return null;
  const [events, actions, notices, save, sessions] = await Promise.all([
    query('SELECT kind, detail, data, created_at FROM security_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [r.id]),
    query(
      `SELECT a.action, a.detail, a.created_at, adm.name AS admin
         FROM admin_actions a LEFT JOIN users adm ON adm.id = a.admin_id
        WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 50`,
      [r.id],
    ),
    query('SELECT text, created_at, seen_at FROM notices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [r.id]),
    one('SELECT metrics, rev, updated_at FROM saves WHERE user_id = $1', [r.id]),
    one('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND expires_at > now()', [r.id]),
  ]);
  const m = save?.metrics ?? null;
  return {
    ...userRow(r),
    sessions: sessions.n,
    save: m ? { day: m.day, money: m.money, wealth: m.wealth, students: m.matriz, branchMembers: m.branchMembers, era: m.era, rev: save.rev } : null,
    events: events.map((e) => ({ kind: e.kind, detail: e.detail, data: e.data, at: e.created_at })),
    actions: actions.map((a) => ({ action: a.action, detail: a.detail, admin: a.admin, at: a.created_at })),
    notices: notices.map((n) => ({ text: n.text, at: n.created_at, seen: !!n.seen_at })),
  };
}

/** Erro com mensagem para o admin (vira 400/404). */
export class AdminError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const text = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function notify(userId, message) {
  await query('INSERT INTO notices (user_id, text) VALUES ($1, $2)', [userId, message]);
}

async function logAction(adminId, userId, action, detail) {
  await query('INSERT INTO admin_actions (admin_id, user_id, action, detail) VALUES ($1, $2, $3, $4)', [adminId, userId, action, detail]);
}

/** Muda o save guardado do jogador; o jogo dele recarrega da nuvem no próximo envio. */
async function editSave(userId, edit) {
  const row = await one('SELECT data FROM saves WHERE user_id = $1', [userId]);
  if (!row) throw new AdminError('Esse jogador ainda não tem progresso salvo na nuvem.');
  const state = parseSave(row.data);
  const result = edit(state);
  state.savedAt = Date.now();
  await writeSave(userId, state, fullMetrics(state), { bumpRev: true });
  return result;
}

const BAN_DAYS = new Set([1, 3, 7, 30]);

/** Aplica uma ação do painel. Devolve uma frase para mostrar ao admin. */
export async function applyAction(admin, name, body) {
  const target = await targetByName(name);
  if (!target) throw new AdminError('Jogador não encontrado.', 404);
  if (target.role === 'admin') throw new AdminError('Contas de administrador não podem ser punidas pelo painel.');
  const action = String(body?.action ?? '');
  const message = text(body?.message, 300);
  const id = target.id;

  if (action === 'warn') {
    if (!message) throw new AdminError('Escreva a advertência.');
    await notify(id, `Advertência da administração: ${message}`);
    await logAction(admin.id, id, 'warn', message);
    return `Advertência enviada para ${target.name}.`;
  }

  if (action === 'fine') {
    const amount = Math.floor(Number(body?.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > 1e12) throw new AdminError('Valor da multa inválido.');
    // A multa nunca deixa o saldo negativo (senão a Vovó Dalva perdoaria a dívida).
    const charged = await editSave(id, (state) => {
      const value = Math.min(amount, Math.max(0, Math.floor(state.money)));
      if (value > 0) transact(state, -value, 'multa', 'Multa da administração');
      return value;
    });
    await notify(id, `Você recebeu uma multa de ${formatMoney(charged)}.${message ? ` Motivo: ${message}` : ''}`);
    await logAction(admin.id, id, 'fine', `${formatMoney(charged)}${charged < amount ? ` (pedido: ${formatMoney(amount)}, limitado ao saldo)` : ''}${message ? ` — ${message}` : ''}`);
    return `Multa de ${formatMoney(charged)} aplicada em ${target.name}.`;
  }

  if (action === 'reset') {
    await editSave(id, (state) => {
      const fresh = createNewGame();
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, fresh);
    });
    await notify(id, `Seu progresso foi zerado pela administração.${message ? ` Motivo: ${message}` : ''}`);
    await logAction(admin.id, id, 'reset', message || null);
    return `Progresso de ${target.name} zerado.`;
  }

  if (action === 'hide' || action === 'unhide') {
    const hide = action === 'hide';
    if (hide && !message) throw new AdminError('Escreva o motivo.');
    const done = await one(
      'UPDATE profiles SET hidden = $2, hidden_reason = $3 WHERE user_id = $1 RETURNING user_id',
      [id, hide, hide ? message : null],
    );
    if (!done) throw new AdminError('Esse jogador ainda não tem perfil (nunca salvou na nuvem).');
    await logAction(admin.id, id, action, message || null);
    if (hide) await notify(id, `Seu perfil saiu do ranking. Motivo: ${message}`);
    return hide ? `${target.name} saiu do ranking.` : `${target.name} voltou ao ranking.`;
  }

  if (action === 'ban') {
    if (!message) throw new AdminError('Escreva o motivo do banimento.');
    const days = body?.days == null ? null : Number(body.days);
    if (days != null && !BAN_DAYS.has(days)) throw new AdminError('Duração inválida.');
    await query(
      `UPDATE users SET banned_at = now(), ban_reason = $2,
              banned_until = CASE WHEN $3::int IS NULL THEN NULL ELSE now() + make_interval(days => $3::int) END
        WHERE id = $1`,
      [id, message, days],
    );
    // As sessões continuam no banco só para o jogo mostrar o motivo; o servidor já trata
    // a conta como deslogada (currentUser ignora banidos) e encerra a sessão no próximo /api/auth/me.
    await logAction(admin.id, id, 'ban', `${days ? `${days} dia(s)` : 'permanente'} — ${message}`);
    return `${target.name} foi banido(a) ${days ? `por ${days} dia(s)` : 'permanentemente'}.`;
  }

  if (action === 'unban') {
    await query('UPDATE users SET banned_at = NULL, banned_until = NULL, ban_reason = NULL WHERE id = $1', [id]);
    await logAction(admin.id, id, 'unban', message || null);
    return `${target.name} foi desbanido(a).`;
  }

  if (action === 'clear_alerts') {
    const n = await one("WITH d AS (DELETE FROM security_events WHERE user_id = $1 AND kind = 'rejected' RETURNING 1) SELECT count(*)::int AS n FROM d", [id]);
    await logAction(admin.id, id, 'clear_alerts', `${n.n} alerta(s) arquivado(s)`);
    await logEvent(id, 'cleared', `${n.n} alerta(s) arquivado(s) por ${admin.name}`);
    return `Alertas de ${target.name} arquivados.`;
  }

  throw new AdminError('Ação desconhecida.');
}
