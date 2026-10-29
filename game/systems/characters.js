// Personagens: Tio Zé (postais), Whey (mascote/indicador), Vovó Dalva,
// Valéria Leão (rival amigável) e Seu Armando (vizinho). Só falas curtas.
import { getEquipmentDef, CONFIG } from '../config.js';
import { formatMoney } from '../utils/format.js';
import { EQUIPMENT_SHORT, CATEGORY_SHORT, WHEY_TIPS } from '../content/lines.js';
import { averageSatisfaction } from '../simulation/students.js';

export const CHARACTERS = {
  tioze: { name: 'Tio Zé', color: '#f2cd5c' },
  whey: { name: 'Whey', color: '#f29a5c' },
  vovo: { name: 'Vovó Dalva', color: '#d8a8e0' },
  valeria: { name: 'Valéria Leão', color: '#8ec5e8' },
  armando: { name: 'Seu Armando', color: '#b8b0c8' },
};

export const POSTCARDS = {
  welcome: {
    title: 'Bem-vindo(a) à garagem!',
    caption: 'Foto: eu pescando um robalo (era um chinelo).',
    text: 'Sobrinho(a), a garagem agora é sua. Regra única: faça o bairro inteiro treinar! Comece com uma esteira e uns colchonetes, e leia o que a turma pede na caixa de sugestões. Deixei R$ 1.500 na lata de biscoito.',
  },
  first_purchase: {
    title: 'Primeiro ferro!',
    caption: 'Foto: pôr do sol (a câmera estava de cabeça pra baixo).',
    text: 'Bonito! Lembra: aparelho precisa de corredor da porta até a frente dele, senão ninguém usa. Aperta R pra girar antes de colocar.',
  },
  students_20: {
    title: '20 alunos!',
    caption: 'Foto: eu e o Mister Bairro 1988 (ele ainda não aceitou).',
    text: 'Vinte alunos! Agora fica de olho na fila da noite: 55% da turma aparece depois do trabalho. Se a fila crescer, outra unidade ou um upgrade resolve.',
  },
  first_month: {
    title: 'Primeiro mês fechado',
    caption: 'Foto: meu caderno de contas (molhado de água salgada).',
    text: 'Fecha o caixa todo mês, sobrinho(a). Mensalidade paga o próximo aparelho. Confere o relatório na aba Finanças.',
  },
  first_expansion: {
    title: 'A garagem cresceu!',
    caption: 'Foto: eu derrubando parede em 1991 (sem permissão).',
    text: 'Mais espaço é mais quebra-cabeça. Deixa um corredor largo da porta até o fundo, senão vira labirinto.',
  },
  five_stars: {
    title: 'Cinco estrelas!',
    caption: 'Foto: troféu do Mister Bairro 1987, polido.',
    text: 'Cinco estrelas na garagem! Nem eu consegui. O bairro inteiro já sabe seu nome. Estou orgulhoso.',
  },
  first_broken: {
    title: 'Ferro velho reclama',
    caption: 'Foto: minha vara de pescar consertada com fita.',
    text: 'Aparelho quebrado não conta pra nada. Clica nele e conserta: custa 6% do preço. Revisão antes de quebrar sai pela metade disso.',
  },
};

function pushMessage(state, from, text) {
  state.messages.unshift({ day: state.time.day, from, text });
  if (state.messages.length > 40) state.messages.length = 40;
}

function postcard(state, id) {
  if (state.milestones[id]) return;
  state.milestones[id] = true;
  state.pendingModals.push({ kind: 'postcard', id });
}

function once(state, id, fn) {
  if (state.milestones[id]) return;
  state.milestones[id] = true;
  fn();
}

/** Verifica marcos e reações. Chamado após ações e no fim de cada dia. */
export function checkMilestones(state, academy) {
  const n = state.students.length;
  if (state.items.length > 0) postcard(state, 'first_purchase');
  if (n >= 20) postcard(state, 'students_20');
  if (state.reports.length >= 1) postcard(state, 'first_month');
  if (state.unlockedZones.length > 1) postcard(state, 'first_expansion');
  if (state.reputation >= 4.75) postcard(state, 'five_stars');
  if (academy?.brokenItems.length) postcard(state, 'first_broken');

  if (n >= 10) once(state, 'valeria_10', () => pushMessage(state, 'valeria',
    'Oi, vizinho(a)! Vi a fila na sua garagem. Fofo! A MegaFit manda um abraço e um vale-smoothie.'));
  if (state.reputation >= 3.5) once(state, 'valeria_35', () => pushMessage(state, 'valeria',
    'Três estrelas e meia? Hum. Vou ter que caprichar no meu café da recepção.'));

  const noisy = state.items.filter((i) => getEquipmentDef(i.type).noisy).length;
  if (noisy >= 2) once(state, 'armando_noise', () => pushMessage(state, 'armando',
    'Que barulheira de ferro é essa? No meu tempo garagem era pra guardar Fusca!'));
  if (state.unlockedZones.length > 1) once(state, 'armando_obra', () => pushMessage(state, 'armando',
    'Obra de novo?! ...Tá, ficou bonitinho. Mas não conta pra ninguém que eu disse.'));
  if (state.reputation >= 4) once(state, 'armando_fan', () => pushMessage(state, 'armando',
    'O movimento até que é bom pro bairro. Minha neta treina aí. Só não aumenta o som.'));
}

export function vovoMessage(state, debt) {
  pushMessage(state, 'vovo', `Meu bem, a Vovó cobriu os ${formatMoney(debt)}. Come direitinho e não conta pro seu tio.`);
  state.pendingModals.push({ kind: 'vovo', debt });
}

export function addMessage(state, from, text) {
  pushMessage(state, from, text);
}

/** Estado do Whey: dorme quando tudo vai bem, encara aparelho quebrado. */
export function wheyMood(state, academy, blockStats) {
  if (academy.brokenItems.length) return { mood: 'alert', target: academy.brokenItems[0] };
  if (academy.unreachableItems.length) return { mood: 'alert', target: academy.unreachableItems[0] };
  const avg = averageSatisfaction(state.students);
  const worstQueue = blockStats ? Math.max(...Object.values(blockStats.queuePct)) : 0;
  if (state.dirt.length >= 5 || (state.students.length && avg < 50) || worstQueue > 0.3) return { mood: 'worried', target: null };
  return { mood: 'sleep', target: null };
}

/** Dica do Whey, baseada no pior problema real do momento. */
export function wheyTip(state, academy, blockStats, suggestions) {
  if (academy.brokenItems.length) return WHEY_TIPS.broken(EQUIPMENT_SHORT[academy.brokenItems[0].type]);
  if (academy.unreachableItems.length) return WHEY_TIPS.unreachable(EQUIPMENT_SHORT[academy.unreachableItems[0].type]);
  if (!state.items.length) return WHEY_TIPS.empty;
  if (state.dirt.length >= 4) return WHEY_TIPS.dirty;
  const missing = suggestions.find((s) => s.kind === 'missing');
  if (missing && missing.count >= 2) return WHEY_TIPS.missing(EQUIPMENT_SHORT[missing.type]);
  if (blockStats) {
    const [cat, q] = Object.entries(blockStats.queuePct).sort((a, b) => b[1] - a[1])[0];
    if (q > 0.15) return WHEY_TIPS.queue(CATEGORY_SHORT[cat]);
  }
  if (state.fee > academy.fairRange[1]) return WHEY_TIPS.price;
  return WHEY_TIPS.happy;
}

