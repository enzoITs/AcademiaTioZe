'use client';
import { useEffect, useRef, useState } from 'react';
import { continueGame, newGame, importSave, askConfirm, notifyError } from '../../game/engine/store.js';
import { hasLocalSave, readLocalRaw } from '../../game/engine/persistence.js';
import { formatMoney } from '../../game/utils/format.js';
import Icon from '../ui/Icon.js';

function savePreview() {
  try {
    const data = JSON.parse(readLocalRaw() ?? 'null');
    if (!data) return null;
    return { day: data.time?.day ?? 0, money: data.money ?? 0, students: data.students?.length ?? 0 };
  } catch {
    return null;
  }
}

export default function TitleScreen() {
  const [save, setSave] = useState(null);
  const fileRef = useRef(null);

  // localStorage só é lido no cliente, depois da montagem.
  useEffect(() => {
    setSave(hasLocalSave() ? savePreview() : null);
  }, []);

  const startNew = () => {
    if (!save) return newGame();
    askConfirm({
      title: 'Começar um novo jogo?',
      text: 'Já existe uma partida salva neste navegador. Ela será apagada.',
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
        <div className="title-actions">
          {save ? (
            <button type="button" className="btn btn-primary btn-lg" onClick={continueGame} autoFocus>
              <Icon name="play" size={18} filled /> Continuar
              <span className="btn-sub">Dia {save.day + 1} · {formatMoney(save.money)} · {save.students} alunos</span>
            </button>
          ) : null}
          <button type="button" className={`btn btn-lg ${save ? '' : 'btn-primary'}`} onClick={startNew} autoFocus={!save}>
            <Icon name="door" size={18} /> Novo jogo
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} /> Importar save (JSON)
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        </div>
        <ul className="title-tips">
          <li>Compre aparelhos na loja e posicione na grade (R gira).</li>
          <li>Deixe corredor da porta até a frente de cada aparelho.</li>
          <li>Leia a caixa de sugestões: ela diz o que os alunos pedem.</li>
        </ul>
        <p className="small subtle">Protótipo da Era 1 (Garagem). Progresso salvo apenas neste navegador.</p>
      </div>
    </main>
  );
}
