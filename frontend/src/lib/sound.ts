let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Unlock audio on the first user gesture (browsers block autoplay). */
export function primeAudio() {
  audio();
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.18) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + start);
  g.gain.setValueAtTime(gain, a.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + start + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + start);
  o.stop(a.currentTime + start + dur + 0.05);
}

export const chime = () => {
  tone(880, 0, 0.18);
  tone(1320, 0.16, 0.25);
};

export const alertBeep = () => {
  tone(660, 0, 0.2, "square", 0.12);
  tone(660, 0.3, 0.2, "square", 0.12);
};

export const sirenCycle = () => {
  for (let i = 0; i < 4; i++) {
    tone(720, i * 0.5, 0.24, "sawtooth", 0.12);
    tone(960, i * 0.5 + 0.25, 0.24, "sawtooth", 0.12);
  }
};
