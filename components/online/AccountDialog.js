'use client';
import { useState } from 'react';
import { closeModal, notify } from '../../game/engine/store.js';
import { login, register } from '../../game/engine/cloud.js';
import { usernameProblem, passwordProblem } from '../../game/online/progress.js';
import Modal from '../dialogs/Modal.js';
import Icon from '../ui/Icon.js';

/** Entrar ou criar conta com apelido e senha. */
export default function AccountDialog({ mode: initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const creating = mode === 'register';

  const submit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    const problem = creating
      ? usernameProblem(trimmed) ?? passwordProblem(password) ?? (password !== confirm ? 'As duas senhas não são iguais.' : null)
      : !trimmed || !password ? 'Preencha o apelido e a senha.' : null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = creating ? await register(trimmed, password) : await login(trimmed, password);
      closeModal();
      notify(creating ? `Conta criada! Bem-vindo(a), ${user.name}.` : `Olá de novo, ${user.name}!`, 'success');
    } catch (err) {
      setError(err.status ? err.message : 'Sem conexão com o servidor. Confira a internet.');
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(creating ? 'login' : 'register');
    setError(null);
  };

  return (
    <Modal title={creating ? 'Criar conta' : 'Entrar'} onClose={closeModal} className="modal-sm">
      <h2 className="modal-title">{creating ? 'Criar conta' : 'Entrar na conta'}</h2>
      <p className="small subtle">
        {creating
          ? 'Com uma conta, seu progresso fica salvo na nuvem e você aparece no ranking.'
          : 'Continue seu progresso de qualquer computador.'}
      </p>
      <form className="account-form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Apelido</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            maxLength={20}
            placeholder="ex.: maromba_do_bairro"
            data-autofocus
          />
        </label>
        <label className="field">
          <span>Senha</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={creating ? 'new-password' : 'current-password'} maxLength={100} />
        </label>
        {creating ? (
          <label className="field">
            <span>Repita a senha</span>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={100} />
          </label>
        ) : null}
        {error ? <p className="form-error" role="alert"><Icon name="alert" size={15} /> {error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="btn btn-link" onClick={switchMode}>
            {creating ? 'Já tenho conta' : 'Criar uma conta nova'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            <Icon name="user" size={15} /> {busy ? 'Aguarde…' : creating ? 'Criar conta' : 'Entrar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
