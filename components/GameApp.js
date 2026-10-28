'use client';
import { useEffect, useRef } from 'react';
import { useGame } from '../hooks/useGame.js';
import {
  game, togglePause, rotate, toggleMaintenanceView, toggleEditMode, cancelMode, undo, setSpeed, saveNow, isModalOpen, nudgeSelected,
} from '../game/engine/store.js';
import TopBar from './hud/TopBar.js';
import SidePanel from './hud/SidePanel.js';
import Toasts from './hud/Toasts.js';
import GameCanvas from './game/GameCanvas.js';
import CanvasToolbar from './game/CanvasToolbar.js';
import PlacementBar from './game/PlacementBar.js';
import ItemInspector from './equipment/ItemInspector.js';
import Dialogs from './dialogs/Dialogs.js';
import TitleScreen from './screens/TitleScreen.js';

const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

function useKeyboard() {
  useEffect(() => {
    const onKey = (e) => {
      if (game.ui.screen !== 'game' || !game.state) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (isModalOpen()) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (key === ' ') {
        // Espaço em um botão focado não deve clicar nele.
        e.preventDefault();
        togglePause();
      } else if (key === 'r') rotate();
      else if (key === 'm') toggleMaintenanceView();
      else if (key === 'e') toggleEditMode();
      else if (key === 'escape') cancelMode();
      else if (key === '1' || key === '2' || key === '3') setSpeed(Number(key));
      else if (ARROWS[e.key] && game.ui.selectedId && game.ui.mode === 'normal') {
        e.preventDefault();
        nudgeSelected(...ARROWS[e.key]);
      }
    };
    // Botões ativam com Espaço no keyup; bloqueamos para o Espaço só pausar.
    const onKeyUp = (e) => {
      const tag = e.target?.tagName;
      if (e.key === ' ' && game.ui.screen === 'game' && !isModalOpen() && tag !== 'INPUT' && tag !== 'TEXTAREA') e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}

function useAutosaveOnExit() {
  useEffect(() => {
    const save = () => {
      if (game.ui.screen === 'game') saveNow(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
}

export default function GameApp() {
  const { ui } = useGame();
  const rendererRef = useRef(null);
  useKeyboard();
  useAutosaveOnExit();

  if (ui.screen !== 'game') {
    return (
      <>
        <TitleScreen />
        <Dialogs />
        <Toasts />
      </>
    );
  }

  return (
    <div className="game-layout">
      <TopBar />
      <main className="game-main">
        <section className="stage" aria-label="Academia">
          <GameCanvas rendererRef={rendererRef} />
          <CanvasToolbar rendererRef={rendererRef} />
          <PlacementBar />
          <ItemInspector />
        </section>
        <SidePanel />
      </main>
      <Dialogs />
      <Toasts />
    </div>
  );
}
