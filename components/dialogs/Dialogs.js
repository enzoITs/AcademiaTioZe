'use client';
import { useRef } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { POSTCARDS } from '../../game/systems/characters.js';
import { formatMoney, formatNumber } from '../../game/utils/format.js';
import {
  resolveConfirm, dismissNotice, closeModal, dismissPending, saveNow, exportSave, importSave, askConfirm, newGame, backToTitle, notifyError, openModal,
} from '../../game/engine/store.js';
import { LedgerTable } from '../reports/FinancePanel.js';
import { Avatar } from '../hud/MessagesPanel.js';
import Stars from '../hud/Stars.js';
import Modal from './Modal.js';
import ExpansionsDialog from './ExpansionsDialog.js';
import DecorDialog from './DecorDialog.js';
import { EraMoveDialog, EraCeremony } from './EraDialogs.js';
import { CityDialog, OpenBranchDialog, BranchDialog } from '../network/NetworkDialogs.js';
import Icon from '../ui/Icon.js';
import AccountDialog from '../online/AccountDialog.js';
import RankingDialog from '../online/RankingDialog.js';
import { useAccount } from '../../hooks/useAccount.js';
import { logout } from '../../game/engine/cloud.js';

/** Aviso da administração ou do servidor (multa, advertência, progresso recarregado, banimento). */
function NoticeDialog({ notice }) {
  return (
    <Modal title={notice.title} onClose={dismissNotice} className="modal-sm notice-dialog">
      <h2 className="modal-title"><Icon name="alert" size={20} /> {notice.title}</h2>
      {notice.lines.map((line, i) => <p key={i}>{line}</p>)}
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={dismissNotice} data-autofocus>Entendi</button>
      </div>
    </Modal>
  );
}

function ConfirmDialog({ confirm }) {
  return (
    <Modal title={confirm.title} onClose={() => resolveConfirm(false)} className="modal-sm">
      <h2 className="modal-title">{confirm.title}</h2>
      <p>{confirm.text}</p>
      {confirm.disabled ? <p className="neg small">Saldo insuficiente.</p> : null}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={() => resolveConfirm(false)} data-autofocus>Cancelar</button>
        <button type="button" className={`btn ${confirm.danger ? 'btn-danger' : 'btn-primary'}`} disabled={confirm.disabled} onClick={() => resolveConfirm(true)}>
          {confirm.confirmLabel ?? 'Confirmar'}
        </button>
      </div>
    </Modal>
  );
}

function Postcard({ id }) {
  const card = POSTCARDS[id];
  return (
    <Modal title={card.title} onClose={dismissPending} className="postcard">
      <div className="postcard-photo" aria-hidden="true">
        <svg viewBox="0 0 200 120" width="100%" height="100%">
          <rect width="200" height="120" fill="#bfe3f5" />
          <circle cx="160" cy="30" r="16" fill="#f2cd5c" stroke="#3d3550" strokeWidth="2" />
          <path d="M0 85 Q50 75 100 85 T200 85 V120 H0Z" fill="#8ec5e8" stroke="#3d3550" strokeWidth="2" />
          <path d="M0 100 Q60 95 120 102 T200 100 V120 H0Z" fill="#f2e2b8" />
          <circle cx="62" cy="54" r="12" fill="#eac0a0" stroke="#3d3550" strokeWidth="2" />
          <path d="M54 58 Q62 64 70 58" stroke="#5a3a28" strokeWidth="4" fill="none" strokeLinecap="round" />
          <rect x="50" y="66" width="24" height="22" rx="6" fill="#f2cd5c" stroke="#3d3550" strokeWidth="2" />
          <path d="M74 72 L120 40" stroke="#8a5a3c" strokeWidth="3" strokeLinecap="round" />
          <path d="M120 40 Q126 60 124 84" stroke="#3d3550" strokeWidth="1" fill="none" />
        </svg>
        <span className="postcard-caption">{card.caption}</span>
      </div>
      <div className="postcard-text">
        <span className="postcard-stamp">Postal do Tio Zé</span>
        <h2 className="modal-title">{card.title}</h2>
        <p>{card.text}</p>
        <p className="postcard-sign">— Tio Zé, Mister Bairro 1987</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={dismissPending} data-autofocus>Valeu, tio!</button>
        </div>
      </div>
    </Modal>
  );
}

function VovoDialog({ debt }) {
  return (
    <Modal title="Vovó Dalva ajudou" onClose={dismissPending} className="modal-sm">
      <div className="char-head"><Avatar who="vovo" size={48} /><h2 className="modal-title">Vovó Dalva chegou com um bolo</h2></div>
      <p>“Meu bem, vi que o caixa apertou. A Vovó cobriu os <strong>{formatMoney(debt)}</strong>. Não precisa devolver, só me visita no domingo.”</p>
      <p className="small subtle">A dívida foi perdoada e registrada nas finanças como “Ajuda da Vovó Dalva”. Não existe game over.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={dismissPending} data-autofocus>Obrigado, vó!</button>
      </div>
    </Modal>
  );
}

function OfflineDialog({ summary }) {
  return (
    <Modal title="Bem-vindo(a) de volta" onClose={closeModal} className="modal-sm">
      <div className="char-head"><Avatar who="whey" size={48} /><h2 className="modal-title">Enquanto você esteve fora…</h2></div>
      <ul className="summary-list">
        <li>Passaram <strong>{formatNumber(summary.days)} dias</strong> de jogo{summary.capped ? ' (máximo de 3 dias offline)' : ''}.</li>
        <li>Saldo: <strong className={summary.moneyDelta >= 0 ? 'pos' : 'neg'}>{summary.moneyDelta >= 0 ? '+' : ''}{formatMoney(summary.moneyDelta)}</strong></li>
        <li>Alunos: {summary.joined} entraram, {summary.cancels} saíram.</li>
        {summary.rusted ? <li>O Whey avisa: “o ferro enferrujou um pouco”. Nada quebrou sozinho.</li> : null}
      </ul>
      <div className="modal-actions">
        <button type="button" className="btn btn-primary" onClick={closeModal} data-autofocus>Bora treinar!</button>
      </div>
    </Modal>
  );
}

function ReportDialog({ report }) {
  return (
    <Modal title={`Relatório de ${report.label}`} onClose={closeModal} className="modal-sm">
      <h2 className="modal-title">Relatório de {report.label}</h2>
      <LedgerTable totals={report.totals} opening={report.opening} closing={report.closing} />
      <p className="small subtle">
        Fechou com {report.students} alunos · reputação <Stars value={report.reputation} size={12} />
      </p>
      <div className="modal-actions"><button type="button" className="btn btn-primary" onClick={closeModal} data-autofocus>Fechar</button></div>
    </Modal>
  );
}

function MenuDialog() {
  const fileRef = useRef(null);
  const acc = useAccount();
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000) {
      notifyError('Arquivo grande demais para ser um save do jogo.');
      return;
    }
    importSave(await file.text());
  };
  return (
    <Modal title="Menu" onClose={closeModal} className="modal-sm">
      <h2 className="modal-title">Menu</h2>
      <div className="menu-grid">
        <button type="button" className="btn btn-primary" onClick={closeModal} data-autofocus><Icon name="play" size={15} filled /> Continuar jogando</button>
        <button type="button" className="btn" onClick={() => saveNow()}><Icon name="save" size={15} /> Salvar agora</button>
        <button type="button" className="btn" onClick={exportSave}><Icon name="download" size={15} /> Exportar save (JSON)</button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" size={15} /> Importar save (JSON)</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        <button type="button" className="btn" onClick={() => openModal({ kind: 'ranking' })}><Icon name="trophy" size={15} /> Ranking</button>
        {acc.user ? (
          <button type="button" className="btn" onClick={() => { backToTitle(); logout(); }}><Icon name="logout" size={15} /> Sair da conta ({acc.user.name})</button>
        ) : (
          <button type="button" className="btn" onClick={() => { backToTitle(); openModal({ kind: 'account', mode: 'login' }); }}><Icon name="user" size={15} /> Entrar na conta</button>
        )}
        <button type="button" className="btn" onClick={backToTitle}><Icon name="door" size={15} /> Tela inicial</button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => askConfirm({
            title: 'Começar um novo jogo?',
            text: acc.user
              ? 'O progresso da sua conta será apagado e você recomeça na garagem. Exporte antes se quiser guardar.'
              : 'O progresso salvo neste navegador será apagado. Exporte antes se quiser guardar.',
            confirmLabel: 'Apagar e recomeçar',
            danger: true,
            onConfirm: newGame,
          })}
        >
          <Icon name="trash" size={15} /> Novo jogo
        </button>
      </div>
      <h3 className="section-title">Atalhos</h3>
      <ul className="shortcuts">
        <li><kbd>Espaço</kbd> pausar/retomar</li>
        <li><kbd>R</kbd> girar aparelho</li>
        <li>Arrastar aparelho: mover (grátis)</li>
        <li><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd> empurrar o selecionado</li>
        <li><kbd>M</kbd> visão de manutenção</li>
        <li><kbd>E</kbd> modo edição</li>
        <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> desfazer (mesmo dia)</li>
        <li><kbd>Esc</kbd> cancelar</li>
        <li><kbd>1</kbd>–<kbd>3</kbd> velocidade ×1/×2/×4</li>
        <li>Roda do mouse: zoom · arrastar: mover câmera</li>
      </ul>
      <p className="small subtle">
        O jogo salva sozinho a cada 15 segundos e ao fechar a aba{acc.user ? `, na nuvem da conta ${acc.user.name}` : ', só neste navegador (entre numa conta para salvar na nuvem)'}.
      </p>
    </Modal>
  );
}

export default function Dialogs() {
  const { ui, state } = useGame();
  if (ui.notice) return <NoticeDialog notice={ui.notice} />;
  if (ui.confirm) return <ConfirmDialog confirm={ui.confirm} />;
  if (ui.modal?.kind === 'menu') return <MenuDialog />;
  if (ui.modal?.kind === 'account') return <AccountDialog key={ui.modal.mode} mode={ui.modal.mode} />;
  if (ui.modal?.kind === 'ranking') return <RankingDialog profile={ui.modal.profile ?? null} />;
  if (ui.modal?.kind === 'offline') return <OfflineDialog summary={ui.modal.summary} />;
  if (ui.modal?.kind === 'report') return <ReportDialog report={ui.modal.report} />;
  if (ui.modal?.kind === 'expansions') return <ExpansionsDialog />;
  if (ui.modal?.kind === 'decor') return <DecorDialog />;
  if (ui.modal?.kind === 'eraMove') return <EraMoveDialog />;
  if (ui.modal?.kind === 'city') return <CityDialog />;
  if (ui.modal?.kind === 'openBranch') return <OpenBranchDialog key={ui.modal.lotId} lotId={ui.modal.lotId} />;
  if (ui.modal?.kind === 'branch') return <BranchDialog key={ui.modal.branchId} branchId={ui.modal.branchId} />;
  const pending = state?.pendingModals[0];
  if (pending?.kind === 'postcard') return <Postcard id={pending.id} />;
  if (pending?.kind === 'vovo') return <VovoDialog debt={pending.debt} />;
  if (pending?.kind === 'era') return <EraCeremony era={pending.era} />;
  return null;
}
