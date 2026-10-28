'use client';
import { useGame } from '../../hooks/useGame.js';
import { CHARACTERS } from '../../game/systems/characters.js';

export function Avatar({ who, size = 34 }) {
  const c = CHARACTERS[who];
  const initials = c.name.split(' ').map((p) => p[0]).slice(0, 2).join('');
  return (
    <span className="avatar" style={{ background: c.color, width: size, height: size }} aria-hidden="true">
      {initials}
    </span>
  );
}

export default function MessagesPanel() {
  const { state } = useGame();
  return (
    <section className="panel-section" aria-label="Mural">
      <h2 className="section-title">Mural de recados</h2>
      {state.messages.length === 0 ? (
        <p className="empty small">Nenhum recado ainda. Toque no Whey para ganhar a dica do dia.</p>
      ) : (
        <ul className="msg-list">
          {state.messages.map((m, i) => (
            <li key={`${m.day}-${i}`} className="msg">
              <Avatar who={m.from} />
              <div>
                <strong>{CHARACTERS[m.from].name}</strong>
                <span className="small subtle"> · dia {m.day + 1}</span>
                <p>{m.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
