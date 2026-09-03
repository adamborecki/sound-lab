import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "beating";
const BASE_HZ = 300;
const MIN_DIFF = 0.5;
const MAX_DIFF = 12;
const VOICE_GAIN = 0.2;
const FADE_SECONDS = 0.02;
const LOCAL_ANALYSER_FFT_SIZE = 32768;
const WINDOW_SAMPLES = 14000; // wide enough to show a few beat cycles
const COMPLETE_AFTER_INTERACTIONS = 6;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Two notes, almost the same pitch. Too close to hear as separate notes — instead you hear one note pulsing in loudness. That pulse rate is the beat frequency: the difference between the two.</p>

    <div class="big-readout" id="beat-readout">3.0 beats/sec</div>
    <input type="range" id="beat-slider" class="big-slider" min="${MIN_DIFF * 10}" max="${MAX_DIFF * 10}" value="30" step="1"
      aria-label="Frequency difference between the two tones, in Hertz" />

    <p class="beat-freqs" id="beat-freqs">300.0 Hz + 303.0 Hz</p>

    <canvas class="waveform-canvas" id="beat-canvas" width="600" height="180"
      role="img" aria-label="Live waveform showing the beating pattern"></canvas>
  `;

  const readout = container.querySelector("#beat-readout");
  const slider = container.querySelector("#beat-slider");
  const freqsEl = container.querySelector("#beat-freqs");
  const canvas = container.querySelector("#beat-canvas");

  let ctx = null;
  let oscA = null;
  let gainA = null;
  let oscB = null;
  let gainB = null;
  let localAnalyser = null;
  let stopViz = null;
  let diff = 3;
  let interactionCount = 0;

  function updateReadout() {
    readout.textContent = `${diff.toFixed(1)} beats/sec`;
    freqsEl.textContent = `${BASE_HZ.toFixed(1)} Hz + ${(BASE_HZ + diff).toFixed(1)} Hz`;
  }

  function setDiff(tenths, userInitiated = false) {
    diff = clamp(tenths, MIN_DIFF * 10, MAX_DIFF * 10) / 10;
    slider.value = String(Math.round(diff * 10));
    updateReadout();
    if (oscB) oscB.frequency.setTargetAtTime(BASE_HZ + diff, ctx.currentTime, 0.05);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  slider.addEventListener("input", () => setDiff(Number(slider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || oscA) return;
    ctx = audioEngine.ctx;
    const now = ctx.currentTime;

    oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = BASE_HZ;
    gainA = ctx.createGain();
    gainA.gain.value = 0;
    oscA.connect(gainA);
    gainA.connect(audioEngine.masterGain);
    oscA.start();
    gainA.gain.setTargetAtTime(VOICE_GAIN, now, FADE_SECONDS);

    oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = BASE_HZ + diff;
    gainB = ctx.createGain();
    gainB.gain.value = 0;
    oscB.connect(gainB);
    gainB.connect(audioEngine.masterGain);
    oscB.start();
    gainB.gain.setTargetAtTime(VOICE_GAIN, now, FADE_SECONDS);

    // A wide dedicated analyser — the shared one is sized for a handful of
    // audio cycles, but a beat pattern needs a window wide enough to show
    // multiple *beat* cycles (each lasting a fraction of a second).
    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
    audioEngine.masterGain.connect(localAnalyser);
    stopViz = drawWaveform(canvas, localAnalyser, {
      color: accent,
      ampScale: 4,
      windowSamples: WINDOW_SAMPLES,
    });
  }

  updateReadout();

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (localAnalyser) audioEngine.masterGain.disconnect(localAnalyser);
    if (oscA) {
      const now = ctx.currentTime;
      gainA.gain.setTargetAtTime(0, now, FADE_SECONDS);
      gainB.gain.setTargetAtTime(0, now, FADE_SECONDS);
      setTimeout(() => {
        try {
          oscA.stop();
          oscB.stop();
        } catch (e) {
          /* already stopped */
        }
        oscA.disconnect();
        gainA.disconnect();
        oscB.disconnect();
        gainB.disconnect();
      }, FADE_SECONDS * 1000 * 6);
    }
  };
}
