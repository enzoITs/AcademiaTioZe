import { test } from 'node:test';
import assert from 'node:assert/strict';

// Armazenamento falso do navegador: as preferências ficam guardadas nele.
const storage = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
};

const {
  game, newGame, toggleSidePanel, setTab, setNotifications, setGraphics, saveNow, notifyError,
} = await import('../game/engine/store.js');
const { SETTINGS_KEY } = await import('../game/engine/persistence.js');

const saved = () => JSON.parse(storage.get(SETTINGS_KEY) ?? '{}');

test('menu lateral: esconde, guarda a escolha e volta ao abrir uma aba', () => {
  newGame();
  assert.equal(game.ui.panelHidden, false);
  toggleSidePanel();
  assert.equal(game.ui.panelHidden, true);
  assert.equal(saved().panelHidden, true);
  setTab('students');
  assert.equal(game.ui.panelHidden, false, 'ir para uma aba mostra o menu de novo');
});

test('notificações desligadas: só os erros aparecem', () => {
  newGame();
  game.ui.toasts = [];
  setNotifications(false);
  assert.equal(saved().notifications, false);
  saveNow(); // "Jogo salvo..." é aviso comum
  assert.equal(game.ui.toasts.length, 0);
  notifyError('Saldo insuficiente.');
  assert.deepEqual(game.ui.toasts.map((t) => t.tone), ['error']);
  setNotifications(true);
  saveNow();
  assert.ok(game.ui.toasts.some((t) => t.tone === 'success'));
});

test('gráficos: só aceita alta, média ou baixa', () => {
  newGame();
  assert.equal(game.ui.graphics, 'alta');
  setGraphics('baixa');
  assert.equal(game.ui.graphics, 'baixa');
  setGraphics('ultra');
  assert.equal(game.ui.graphics, 'baixa');
  assert.equal(saved().graphics, 'baixa');
});

test('preferências voltam na próxima partida', () => {
  storage.set(SETTINGS_KEY, JSON.stringify({ panelHidden: true, notifications: false, graphics: 'media', soundOn: false }));
  newGame();
  assert.equal(game.ui.panelHidden, true);
  assert.equal(game.ui.notifications, false);
  assert.equal(game.ui.graphics, 'media');
  assert.equal(game.ui.soundOn, false);
  storage.set(SETTINGS_KEY, JSON.stringify({ graphics: 'qualquer' }));
  newGame();
  assert.equal(game.ui.graphics, 'alta', 'valor estranho volta ao padrão');
});
