'use client';
import { useEffect, useRef, useState } from 'react';
import {
  continueGame, continueFromCloud, newGame, importSave, askConfirm, notifyError, openModal,
} from '../../game/engine/store.js';
import { hasLocalSave, readLocalRaw, localOwner } from '../../game/engine/persistence.js';
import { account, refreshMe, fetchCloudSave, logout } from '../../game/engine/cloud.js';
import { formatMoney } from '../../game/utils/format.js';
import { useAccount } from '../../hooks/useAccount.js';
import Icon from '../ui/Icon.js';

function previewOf(data) {
  if (!data) return null;
  const branches = data.network?.branches ?? [];
  const members = Math.round(branches.reduce((s, b) => s + (b.members ?? 0), 0));
  return {
    day: data.time?.day ?? 0,
    money: data.money ?? 0,
    students: (data.students?.length ?? 0) + members,
    savedAt: data.savedAt ?? 0,
  };
}

function readLocal() {
  if (!hasLocalSave()) return null;
  try {
    return { ...previewOf(JSON.parse(readLocalRaw())), owner: localOwner() || '' };
  } catch {
    return null;
  }
}

const sub = (p) => `Dia ${Math.floor(p.day) + 1} · ${formatMoney(p.money)} · ${p.students} alunos`;
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** O que mostrar na tela inicial a partir do progresso local, da nuvem e da conta. */
function decide(user, local, cloud) {
  const out = { primary: null, extra: null, hint: null, hasProgress: false };
  if (!user) {
    if (local && !local.owner) {
      out.primary = { label: 'Continuar', preview: local, run: () => continueGame() };
      out.hasProgress = true;
    } else if (local) out.hint = `Este navegador guarda o progresso de ${local.owner}. Entre nessa conta para continuar.`;
    return out;
  }
  const mine = local && same(local.owner, user.name);
  const guest = local && !local.owner;
  if (cloud.status === 'loading') {
    out.primary = { label: 'Buscando seu progresso…', disabled: true };
    return out;
  }
  if (cloud.status === 'error') {
    if (mine || guest) {
      out.primary = { label: 'Continuar', preview: local, run: () => continueGame() };
      out.hasProgress = true;
    }
    out.hint = `Sem conexão com o servidor (${cloud.message}). O jogo salva aqui e envia quando voltar.`;
    return out;
  }
  const remote = cloud.save ? previewOf(cloud.save) : null;
  out.hasProgress = !!(remote || mine || guest);
  if (remote && mine) {
    const localNewer = local.savedAt > remote.savedAt + 1000;
    out.primary = localNewer
      ? { label: 'Continuar', preview: local, run: () => continueGame() }
      : { label: 'Continuar', preview: remote, run: () => continueFromCloud(cloud.save) };
  } else if (remote) {
    out.primary = { label: 'Continuar', preview: remote, run: () => continueFromCloud(cloud.save) };
    if (guest) {
      out.extra = {
        label: 'Usar o progresso deste navegador',
        preview: local,
        run: () => askConfirm({
          title: 'Trocar o progresso da conta?',
          text: `O progresso da conta (${sub(remote)}) será substituído pelo deste navegador (${sub(local)}).`,
          confirmLabel: 'Usar o deste navegador',
          danger: true,
          onConfirm: () => continueGame(),
        }),
      };
    }
  } else if (mine || guest) {
    out.primary = { label: guest ? 'Continuar e salvar na conta' : 'Continuar', preview: local, run: () => continueGame() };
  } else if (local) {
    out.hint = `O progresso deste navegador é de ${local.owner}. Ele continua salvo na conta dessa pessoa.`;
  }
  return out;
}

export default function TitleScreen() {
  const acc = useAccount();
  const [local, setLocal] = useState(null);
  const [cloud, setCloud] = useState({ status: 'idle' });
  const fileRef = useRef(null);
  const userName = acc.user?.name ?? null;

  // localStorage e a conta só existem no cliente, depois da montagem.
  useEffect(() => {
    setLocal(readLocal());
    if (!account.checked) refreshMe();
  }, []);

  useEffect(() => {
    if (!userName) {
      setCloud({ status: 'idle' });
      return undefined;
    }
    let alive = true;
    setCloud({ status: 'loading' });
    fetchCloudSave()
      .then((r) => alive && setCloud({ status: 'ready', save: r.save }))
      .catch((err) => alive && setCloud({ status: 'error', message: err.status ? err.message : 'sem internet' }));
    return () => {
      alive = false;
    };
  }, [userName]);

  const choice = decide(acc.user, local, cloud);

  const startNew = () => {
    if (!choice.hasProgress) return newGame();
    askConfirm({
      title: 'Começar um novo jogo?',
      text: acc.user
        ? 'O progresso da sua conta será apagado e você recomeça na garagem do Tio Zé.'
        : 'Já existe um progresso salvo neste navegador. Ele será apagado.',
      confirmLabel: 'Apagar e recomeçar',
      danger: true,
      onConfirm: newGame,
    });
    return undefined;
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) return notifyError('Arquivo grande demais para ser um save do jogo.');
    return importSave(await file.text());
  };

  const { primary, extra } = choice;
  return (
    <main className="title-screen">
      <div className="title-card">
        <div className="title-logo" aria-hidden="true">
          <svg viewBox="0 0 120 90" width="120" height="90">
            <rect x="10" y="30" width="100" height="52" rx="8" fill="#ece4d6" stroke="#3d3550" strokeWidth="3" />
            <rect x="22" y="44" width="40" height="38" rx="3" fill="#9aa0b5" stroke="#3d3550" strokeWidth="3" />
            <path d="M22 52h40M22 60h40M22 68h40" stroke="#3d3550" strokeWidth="1.5" opacity="0.4" />
            <path d="M5 34 L60 8 L115 34" fill="#f29a8e" stroke="#3d3550" strokeWidth="3" strokeLinejoin="round" />
            <rect x="72" y="46" width="28" height="12" rx="4" fill="#f2cd5c" stroke="#3d3550" strokeWidth="2.5" />
            <circle cx="72" cy="52" r="7" fill="#59546e" stroke="#3d3550" strokeWidth="2" />
            <circle cx="100" cy="52" r="7" fill="#59546e" stroke="#3d3550" strokeWidth="2" />
            <circle cx="42" cy="40" r="3.5" fill="#fff3b0" stroke="#3d3550" strokeWidth="1.5" />
          </svg>
        </div>
        <h1>Academia do Tio Zé</h1>
        <p className="tagline">Transforme a garagem herdada na academia mais querida do bairro.</p>

        <div className="account-bar">
          {!acc.checked ? (
            <span className="small subtle">Conectando…</span>
          ) : acc.user ? (
            <>
              <span className="account-who"><Icon name="cloud" size={16} /> <strong>{acc.user.name}</strong></span>
              <button type="button" className="btn btn-sm btn-link" onClick={() => logout()}><Icon name="logout" size={14} /> Sair</button>
            </>
          ) : (
            <>
              <span className="small subtle">Jogando como convidado</span>
              <button type="button" className="btn btn-sm" onClick={() => openModal({ kind: 'account', mode: 'login' })}><Icon name="user" size={14} /> Entrar</button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => openModal({ kind: 'account', mode: 'register' })}>Criar conta</button>
            </>
          )}
        </div>

        <div className="title-actions">
          {primary ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={primary.run} disabled={primary.disabled} autoFocus>
              <Icon name="play" size={18} filled /> {primary.label}
              {primary.preview ? <span className="btn-sub">{sub(primary.preview)}</span> : null}
            </button>
          ) : null}
          {extra ? (
            <button type="button" className="btn" onClick={extra.run}>
              <Icon name="upload" size={16} /> {extra.label}
              <span className="btn-sub">{sub(extra.preview)}</span>
            </button>
          ) : null}
          <button type="button" className={`btn btn-lg ${primary ? '' : 'btn-primary'}`} onClick={startNew} disabled={primary?.disabled} autoFocus={!primary}>
            <Icon name="door" size={18} /> Novo jogo
          </button>
          <div className="title-row">
            <button type="button" className="btn" onClick={() => openModal({ kind: 'ranking' })}>
              <Icon name="trophy" size={16} /> Ranking
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> Importar save
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        </div>
        {choice.hint ? <p className="small title-hint"><Icon name="alert" size={14} /> {choice.hint}</p> : null}
        <ul className="title-tips">
          <li>Compre aparelhos na loja e posicione na grade (R gira).</li>
          <li>Deixe corredor da porta até a frente de cada aparelho.</li>
          <li>Leia a caixa de sugestões: ela diz o que os alunos pedem.</li>
        </ul>
        <p className="small subtle">
          {acc.user
            ? 'Seu progresso fica salvo na nuvem: continue de qualquer computador.'
            : 'Como convidado, o progresso fica só neste navegador e fora do ranking.'}
        </p>
      </div>
    </main>
  );
}
