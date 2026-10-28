'use client';
import dynamic from 'next/dynamic';

// O jogo roda só no cliente: canvas, áudio e localStorage não existem no servidor.
const GameApp = dynamic(() => import('./GameApp.js'), {
  ssr: false,
  loading: () => (
    <div className="loading" role="status">
      <span className="loading-dot" />
      Abrindo o portão da garagem…
    </div>
  ),
});

export default function ClientGame() {
  return <GameApp />;
}
