// A short, fully-synthesized drum-and-bass loop (no audio files) for the
// filter stations — noise and a single sawtooth make a filter's shape easy
// to see, but a filter sweep on an actual groove is what makes the effect
// click by ear. Rendered once per AudioContext via OfflineAudioContext and
// cached, then played back with a normal looping AudioBufferSourceNode.

const BPM = 120;
const STEPS_PER_BEAT = 4; // 16th-note grid
const BEATS_PER_BAR = 4;
const BARS = 2;
const STEPS_PER_BAR = STEPS_PER_BEAT * BEATS_PER_BAR;
const TOTAL_STEPS = STEPS_PER_BAR * BARS;
const SECONDS_PER_STEP = 60 / BPM / STEPS_PER_BEAT;
export const LOOP_DURATION_SECONDS = TOTAL_STEPS * SECONDS_PER_STEP;

const KICK_STEPS = [0, 4, 8, 12, 16, 20, 24, 28];
const SNARE_STEPS = [4, 12, 20, 28];
const HIHAT_STEPS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
const OPEN_HIHAT_STEPS = new Set([30]);

// A1/E2/A2 — a small, funky root/fifth/octave riff, two bars.
const ROOT = 55.0;
const FIFTH = 82.41;
const OCTAVE = 110.0;
const BASS_NOTES = [
  { step: 0, freq: ROOT, steps: 3 },
  { step: 3, freq: FIFTH, steps: 1 },
  { step: 6, freq: ROOT, steps: 2 },
  { step: 10, freq: OCTAVE, steps: 2 },
  { step: 14, freq: FIFTH, steps: 2 },
  { step: 16, freq: ROOT, steps: 3 },
  { step: 19, freq: FIFTH, steps: 1 },
  { step: 22, freq: ROOT, steps: 2 },
  { step: 26, freq: OCTAVE, steps: 2 },
  { step: 30, freq: FIFTH, steps: 2 },
];

// Sparse high synth stabs — light EDM sparkle, and useful high-frequency
// content for the high-pass station to reveal.
const BLEEP_EVENTS = [
  { step: 7, freq: 880 },
  { step: 15, freq: 1174.66 },
  { step: 23, freq: 880 },
  { step: 31, freq: 1318.51 },
];

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function scheduleKick(ctx, dest, time) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.3);
}

function scheduleSnare(ctx, dest, time) {
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, 0.2);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1000;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.5, time);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  noise.connect(hp).connect(noiseGain).connect(dest);
  noise.start(time);
  noise.stop(time + 0.2);

  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = 180;
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(0.3, time);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
  body.connect(bodyGain).connect(dest);
  body.start(time);
  body.stop(time + 0.15);
}

function scheduleHihat(ctx, dest, time, open) {
  const dur = open ? 0.3 : 0.06;
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer(ctx, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.22, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  noise.connect(hp).connect(gain).connect(dest);
  noise.start(time);
  noise.stop(time + dur + 0.02);
}

function scheduleBassNote(ctx, dest, time, freq, dur) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.value = freq;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 800;
  filter.Q.value = 1;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.5, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
  osc.connect(filter).connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + dur + 0.02);
}

function scheduleBleep(ctx, dest, time, freq) {
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(0.3, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.18);
  osc.connect(gain).connect(dest);
  osc.start(time);
  osc.stop(time + 0.2);
}

const cache = new WeakMap();

// Returns a Promise<AudioBuffer> for the loop, rendered once per
// AudioContext (keyed by sample rate stays consistent for a given ctx) and
// cached from then on.
export function getLoopBuffer(ctx) {
  if (cache.has(ctx)) return cache.get(ctx);

  const promise = (async () => {
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(LOOP_DURATION_SECONDS * ctx.sampleRate),
      ctx.sampleRate,
    );
    const master = offline.createGain();
    master.gain.value = 0.85;
    master.connect(offline.destination);

    for (const step of KICK_STEPS) scheduleKick(offline, master, step * SECONDS_PER_STEP);
    for (const step of SNARE_STEPS) scheduleSnare(offline, master, step * SECONDS_PER_STEP);
    for (const step of HIHAT_STEPS) {
      scheduleHihat(offline, master, step * SECONDS_PER_STEP, OPEN_HIHAT_STEPS.has(step));
    }
    for (const note of BASS_NOTES) {
      scheduleBassNote(offline, master, note.step * SECONDS_PER_STEP, note.freq, note.steps * SECONDS_PER_STEP * 0.9);
    }
    for (const bleep of BLEEP_EVENTS) scheduleBleep(offline, master, bleep.step * SECONDS_PER_STEP, bleep.freq);

    return offline.startRendering();
  })();

  cache.set(ctx, promise);
  return promise;
}
