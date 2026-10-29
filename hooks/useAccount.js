'use client';
import { useSyncExternalStore } from 'react';
import { account, subscribeAccount, getAccountVersion } from '../game/engine/cloud.js';

const serverSnapshot = () => 0;

/** Re-renderiza quando a conta ou o envio para a nuvem mudam. */
export function useAccount() {
  useSyncExternalStore(subscribeAccount, getAccountVersion, serverSnapshot);
  return account;
}
