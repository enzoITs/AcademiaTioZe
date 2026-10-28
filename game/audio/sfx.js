// Efeitos sonoros sintetizados com WebAudio. O som mais importante é o
// "encaixe" do aparelho na grade.
let ctx = null;
let enabled = true;

export function setSoundEnabled(value) {
  enabled = value;
}

function audio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, duration, { type = 'sine', gain = 0.15, delay = 0, slide = 0 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function noise(duration, { gain = 0.08, delay = 0, freq = 2000 } = {}) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const buffer = a.createBuffer(1, Math.floor(a.sampleRate * duration), a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

const SOUNDS = {
  place: () => { tone(140, 0.12, { type: 'triangle', gain: 0.25, slide: -60 }); tone(880, 0.06, { type: 'square', gain: 0.05, delay: 0.05 }); },
  buy: () => { tone(988, 0.08, { type: 'square', gain: 0.06 }); tone(1319, 0.14, { type: 'square', gain: 0.06, delay: 0.07 }); },
  sell: () => { tone(660, 0.08, { type: 'triangle', gain: 0.1 }); tone(440, 0.12, { type: 'triangle', gain: 0.1, delay: 0.06 }); },
  error: () => { tone(180, 0.18, { type: 'sawtooth', gain: 0.06 }); },
  rotate: () => { tone(520, 0.05, { type: 'triangle', gain: 0.08 }); },
  clean: () => { noise(0.18, { gain: 0.12, freq: 3500 }); tone(1600, 0.08, { gain: 0.04, delay: 0.08 }); },
  repair: () => { [0, 0.12, 0.24].forEach((d) => tone(300 + d * 400, 0.06, { type: 'square', gain: 0.05, delay: d })); noise(0.1, { delay: 0.3, freq: 1200 }); },
  meow: () => { tone(700, 0.35, { type: 'sine', gain: 0.1, slide: 300 }); tone(950, 0.25, { type: 'sine', gain: 0.06, delay: 0.25, slide: -400 }); },
  notify: () => { tone(784, 0.1, { gain: 0.08 }); tone(1046, 0.2, { gain: 0.08, delay: 0.1 }); },
  celebrate: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.15, { type: 'triangle', gain: 0.08, delay: i * 0.08 })); },
  click: () => { tone(1200, 0.03, { type: 'square', gain: 0.03 }); },
};

export function playSound(name) {
  if (!enabled) return;
  try {
    SOUNDS[name]?.();
  } catch {
    /* áudio indisponível: o jogo segue sem som */
  }
}
