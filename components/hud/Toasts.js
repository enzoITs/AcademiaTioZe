'use client';
import { useEffect } from 'react';
import { useGame } from '../../hooks/useGame.js';
import { dismissToast } from '../../game/engine/store.js';

function Toast({ toast }) {
  useEffect(() => {
    const id = setTimeout(() => dismissToast(toast.id), toast.tone === 'error' ? 4200 : 3400);
    return () => clearTimeout(id);
  }, [toast.id, toast.tone]);
  return (
    <li className={`toast toast-${toast.tone}`}>
      <span>{toast.text}</span>
      <button type="button" className="toast-close" onClick={() => dismissToast(toast.id)} aria-label="Fechar aviso">×</button>
    </li>
  );
}

export default function Toasts() {
  const { ui } = useGame();
  return (
    <ul className="toasts" aria-live="polite" aria-relevant="additions">
      {ui.toasts.map((t) => <Toast key={t.id} toast={t} />)}
    </ul>
  );
}
