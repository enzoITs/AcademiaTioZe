'use client';
import { useSyncExternalStore } from 'react';
import { game, subscribe, getVersion } from '../game/engine/store.js';

const serverSnapshot = () => 0;

/** Re-renderiza quando o store emite; retorna o objeto único do jogo. */
export function useGame() {
  useSyncExternalStore(subscribe, getVersion, serverSnapshot);
  return game;
}
