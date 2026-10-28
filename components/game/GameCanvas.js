'use client';
import { useEffect, useRef } from 'react';
import { GameRenderer } from '../../game/render/renderer.js';
import {
  game, tick, setHover, clickCell, clickWhey, requestUnlockZone, cleanDirt, startMove, dropDrag, cancelMode,
} from '../../game/engine/store.js';
import { inBounds, cellIndex } from '../../game/grid/grid.js';

/**
 * Canvas da academia. Um único requestAnimationFrame avança a simulação
 * (por tempo real, não por quadro) e desenha. Tudo é limpo ao desmontar.
 */
export default function GameCanvas({ rendererRef }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const renderer = new GameRenderer(canvas, game);
    rendererRef.current = renderer;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      tick(dt);
      renderer.render(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // ---------------------------------------------------- entrada
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    // { button, start, last, moved, cleaning, combo, itemId, grabCell, draggingItem }
    let drag = null;
    const itemAtCell = (cell) => {
      if (!inBounds(cell.x, cell.y)) return -1;
      return game.rt.academy.access.flood.occ[cellIndex(cell.x, cell.y)];
    };

    const onDown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      const p = pos(e);
      drag = { button: e.button, start: p, last: p, moved: false, cleaning: false, combo: 0, itemId: -1, draggingItem: false };
      if (e.button !== 0 || game.ui.mode !== 'normal') return;
      const dirt = renderer.dirtAt(p.x, p.y);
      if (dirt) {
        drag.cleaning = true;
        drag.combo = 1;
        cleanDirt(dirt.id);
        return;
      }
      // Apertou em cima de um aparelho: se arrastar, ele é movido.
      const cell = renderer.cellAt(p.x, p.y);
      drag.itemId = itemAtCell(cell);
      drag.grabCell = cell;
    };

    const onMove = (e) => {
      const p = pos(e);
      const cell = renderer.cellAt(p.x, p.y);
      setHover(cell);
      if (!drag) {
        const hit = renderer.hitTest(p.x, p.y);
        const onItem = hit.kind === 'cell' && itemAtCell(cell) >= 0;
        canvas.style.cursor = game.ui.mode !== 'normal' ? 'crosshair'
          : onItem ? 'grab'
            : hit.kind === 'dirt' || hit.kind === 'whey' || hit.kind === 'zone' ? 'pointer' : 'default';
        return;
      }
      const dx = p.x - drag.last.x;
      const dy = p.y - drag.last.y;
      drag.last = p;
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.moved = true;
      if (drag.cleaning) {
        // Combo: arrastar o mouse limpa várias sujeiras seguidas.
        const dirt = renderer.dirtAt(p.x, p.y);
        if (dirt) {
          drag.combo += 1;
          cleanDirt(dirt.id);
          if (drag.combo >= 2) renderer.floaters.push({ x: dirt.x * 48, y: dirt.y * 48 - 18, text: `Combo ×${drag.combo}!`, t0: performance.now(), color: '#d9773a' });
        }
        return;
      }
      if (drag.itemId >= 0 && drag.moved) {
        if (!drag.draggingItem && game.ui.mode === 'normal') {
          drag.draggingItem = true;
          startMove(drag.itemId, drag.grabCell);
          setHover(cell);
        }
        canvas.style.cursor = 'grabbing';
        return;
      }
      const panning = drag.button === 1 || drag.button === 2 || (drag.button === 0 && game.ui.mode === 'normal');
      if (panning && drag.moved) {
        renderer.pan(dx, dy);
        canvas.style.cursor = 'grabbing';
      }
    };

    const onUp = (e) => {
      const p = pos(e);
      const d = drag;
      drag = null;
      canvas.style.cursor = 'default';
      if (d?.draggingItem) {
        dropDrag(renderer.cellAt(p.x, p.y));
        return;
      }
      if (!d || d.cleaning || d.moved || d.button !== 0) return;
      const hit = renderer.hitTest(p.x, p.y);
      if (game.ui.mode === 'normal') {
        if (hit.kind === 'whey') return clickWhey();
        if (hit.kind === 'zone') return requestUnlockZone(hit.id);
      }
      clickCell(hit.cell ?? renderer.cellAt(p.x, p.y));
    };

    // Toque interrompido pelo sistema: desiste do arrastar sem mover nada.
    const onCancel = () => {
      const d = drag;
      drag = null;
      if (d?.draggingItem) cancelMode();
    };
    const onLeave = () => setHover(null);
    const onWheel = (e) => {
      e.preventDefault();
      const p = pos(e);
      renderer.zoomAt(p.x, p.y, e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    const onContext = (e) => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
      rendererRef.current = null;
    };
  }, [rendererRef]);

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label="Academia vista de cima. Use a loja para comprar aparelhos e clique na grade para posicioná-los."
        role="img"
      />
    </div>
  );
}
