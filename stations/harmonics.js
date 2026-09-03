import {
  drawWaveform,
  drawSpectrum,
  drawSpectrogram,
  drawIdleMessage,
  logPositionForFreq,
  buildSpectrogramFreqAxis,
} from "../js/visualizers.js";
import { recordInteraction, markComplete, recordCheck } from "../js/progress.js";

const STATION_ID = "harmonics";
const FUNDAMENTAL_HZ = 110;
const PARTIAL_COUNT = 9;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 2000;
const COMPLETE_AFTER_INTERACTIONS = 6;
const AXIS_LABELS = [20, 100, 1000];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}
// Short labels keep every slot the same width so the row doesn't wrap
// early on narrow screens; the fuller wording lives in aria-label instead.
const LABELS = { 1: "Fund." };
for (let k = 2; k <= PARTIAL_COUNT; k++) LABELS[k] = String(k);

const ARIA_LABELS = { 1: "Fundamental (1st harmonic)" };
for (let k = 2; k <= PARTIAL_COUNT; k++) ARIA_LABELS[k] = `${k}th harmonic`;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Start with the fundamental. Add harmonics one at a time and listen — the pitch won't move, only the timbre will.</p>

    <div class="predict-box" id="predict-box">
      <p class="predict-question">Quick guess: adding the 2nd harmonic changes...</p>
      <div class="predict-buttons">
        <button class="chip" type="button" data-guess="pitch">The pitch</button>
        <button class="chip" type="button" data-guess="timbre">The timbre</button>
      </div>
      <p class="predict-reveal" id="predict-reveal" hidden></p>
    </div>

    <div class="harmonic-bars" id="harmonic-bars"></div>

    <div class="preset-row" id="harmonic-presets">
      <button class="chip" type="button" data-recipe="fundamental">Fundamental only</button>
      <button class="chip" type="button" data-recipe="square">Square-ish</button>
      <button class="chip" type="button" data-recipe="saw">Sawtooth-ish</button>
    </div>

    <canvas class="waveform-canvas" id="harmonics-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the combined harmonics"></canvas>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="harmonics-spectrum-canvas" width="600" height="180"
      role="img" aria-label="Live frequency spectrum of the combined harmonics"></canvas>
    <div class="spectrum-axis" id="harmonics-spectrum-axis"></div>

    <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
    <div class="spectrogram-row">
      <div class="spectrogram-freq-axis" id="harmonics-spectrogram-axis"></div>
      <canvas class="spectrum-canvas" id="harmonics-spectrogram-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram of the combined harmonics — frequency on the vertical axis, time on the horizontal axis"></canvas>
    </div>
  `;

  const predictBox = container.querySelector("#predict-box");
  const predictReveal = container.querySelector("#predict-reveal");
  const barsEl = container.querySelector("#harmonic-bars");
  const canvas = container.querySelector("#harmonics-canvas");
  const spectrumCanvas = container.querySelector("#harmonics-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#harmonics-spectrum-axis");
  const spectrogramCanvas = container.querySelector("#harmonics-spectrogram-canvas");
  const spectrogramAxisEl = container.querySelector("#harmonics-spectrogram-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    spectrumAxisEl.appendChild(tick);
  }
  buildSpectrogramFreqAxis(spectrogramAxisEl, AXIS_LABELS, MIN_HZ_AXIS, MAX_HZ_AXIS);

  predictBox.querySelectorAll("[data-guess]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const guess = btn.dataset.guess;
      recordCheck("harmonics-predict", guess);
      predictReveal.hidden = false;
      predictReveal.textContent =
        guess === "timbre"
          ? "Right — the fundamental frequency doesn't move, so the pitch stays put. Only the timbre shifts."
          : "Actually the pitch stays put — the fundamental frequency doesn't change. It's the timbre that shifts.";
      predictBox.querySelectorAll("[data-guess]").forEach((b) => (b.disabled = true));
    });
  });

  const active = new Set([1]);
  const bars = new Map();
  let voice = null;
  let stopViz = null;
  let localAnalyser = null;
  let stopSpectrumViz = null;
  let stopSpectrogramViz = null;
  let interactionCount = 0;

  for (let k = 1; k <= PARTIAL_COUNT; k++) {
    const slot = document.createElement("div");
    slot.className = "harmonic-slot";
    slot.innerHTML = `
      <button class="harmonic-bar${k === 1 ? " locked" : ""}" type="button"
        style="--bar-height:${Math.round(100 / k)}%" ${k === 1 ? "disabled" : ""}
        aria-pressed="${k === 1 ? "true" : "false"}" aria-label="${ARIA_LABELS[k]}">
        <span class="harmonic-bar-fill"></span>
      </button>
      <span class="harmonic-bar-label">${LABELS[k]}</span>
    `;
    const bar = slot.querySelector(".harmonic-bar");
    if (k !== 1) bar.addEventListener("click", () => toggle(k));
    barsEl.appendChild(slot);
    bars.set(k, bar);
  }

  function buildWave() {
    const real = new Float32Array(PARTIAL_COUNT + 1);
    const imag = new Float32Array(PARTIAL_COUNT + 1);
    for (const k of active) imag[k] = 1 / k;
    return audioEngine.ctx.createPeriodicWave(real, imag);
  }

  function render() {
    for (const [k, bar] of bars) {
      bar.classList.toggle("active", active.has(k));
      bar.setAttribute("aria-pressed", active.has(k) ? "true" : "false");
    }
    if (voice) voice.setPeriodicWave(buildWave());
  }

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function toggle(k) {
    if (active.has(k)) active.delete(k);
    else active.add(k);
    render();
    registerInteraction();
  }

  function applyRecipe(name) {
    active.clear();
    if (name === "fundamental") active.add(1);
    else if (name === "square") {
      for (let k = 1; k <= PARTIAL_COUNT; k += 2) active.add(k);
    }
    else if (name === "saw") for (let k = 1; k <= PARTIAL_COUNT; k++) active.add(k);
    render();
    registerInteraction();
  }

  container.querySelector("#harmonic-presets").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-recipe]");
    if (!btn) return;
    applyRecipe(btn.dataset.recipe);
  });

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({ freq: FUNDAMENTAL_HZ, type: "sine", gain: 0.28 });
    voice.setPeriodicWave(buildWave());
    stopViz = drawWaveform(canvas, audioEngine.analyser, { color: accent });

    // Own analyser (not the shared one) so its fftSize/smoothing can be
    // tuned for the frequency-domain views without affecting every other
    // station's time-domain waveform.
    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = 8192;
    localAnalyser.smoothingTimeConstant = 0.6;
    audioEngine.masterGain.connect(localAnalyser);
    stopSpectrumViz = drawSpectrum(spectrumCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
    stopSpectrogramViz = drawSpectrogram(spectrogramCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrogramCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  render();

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (stopSpectrumViz) stopSpectrumViz();
    if (stopSpectrogramViz) stopSpectrogramViz();
    if (voice) voice.stop();
    if (localAnalyser) audioEngine.masterGain.disconnect(localAnalyser);
  };
}
