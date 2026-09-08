import { drawSpectrum, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "additive-subtractive";
const FUNDAMENTAL_HZ = 220;
const PARTIALS = [1, 3, 5, 7, 9];
const MIN_CUTOFF = 150;
const MAX_CUTOFF = 4000;
const DEFAULT_CUTOFF = 4000;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 2000;
const AXIS_LABELS = [20, 100, 1000];
const VOICE_GAIN = 0.3;
const COMPLETE_AFTER_INTERACTIONS = 6;

const LABELS = { 1: "Fund." };
for (const k of PARTIALS) if (k !== 1) LABELS[k] = String(k);
const ARIA_LABELS = { 1: "Fundamental (1st harmonic)" };
for (const k of PARTIALS) if (k !== 1) ARIA_LABELS[k] = `${k}th harmonic`;

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Two roads to a similar kind of tone. On the left, start silent and <strong>add</strong>
      harmonics one at a time. On the right, start with a harmonically-rich sawtooth and
      <strong>subtract</strong> the highs with a filter. Toggle which one you're actually hearing —
      but watch both spectra the whole time. That's where "adding" and "subtracting" actually differ.
    </p>

    <div class="preset-row" id="as-toggle"></div>

    <div class="fft-pair">
      <div class="fft-pane">
        <div class="osc-control-label">Additive — Harmonics</div>
        <div class="harmonic-bars" id="as-add-bars"></div>
        <canvas class="spectrum-canvas" id="as-add-canvas" width="600" height="160"
          role="img" aria-label="Live frequency spectrum of the additive recipe"></canvas>
        <div class="spectrum-axis" id="as-add-axis"></div>
      </div>
      <div class="fft-pane">
        <div class="osc-control-label">Subtractive — Filtered Sawtooth</div>
        <div class="osc-control">
          <div class="big-readout" id="as-cutoff-readout">${formatHz(DEFAULT_CUTOFF)}</div>
          <input type="range" id="as-cutoff-slider" class="big-slider" min="${MIN_CUTOFF}" max="${MAX_CUTOFF}"
            value="${DEFAULT_CUTOFF}" step="1" aria-label="Low-pass cutoff frequency in Hertz" />
        </div>
        <canvas class="spectrum-canvas" id="as-sub-canvas" width="600" height="160"
          role="img" aria-label="Live frequency spectrum of the subtractive recipe"></canvas>
        <div class="spectrum-axis" id="as-sub-axis"></div>
      </div>
    </div>
  `;

  const toggleRow = container.querySelector("#as-toggle");
  const barsEl = container.querySelector("#as-add-bars");
  const addCanvas = container.querySelector("#as-add-canvas");
  const addAxisEl = container.querySelector("#as-add-axis");
  const cutoffSlider = container.querySelector("#as-cutoff-slider");
  const cutoffReadout = container.querySelector("#as-cutoff-readout");
  const subCanvas = container.querySelector("#as-sub-canvas");
  const subAxisEl = container.querySelector("#as-sub-axis");

  for (const axisEl of [addAxisEl, subAxisEl]) {
    for (const hz of AXIS_LABELS) {
      const tick = document.createElement("span");
      tick.textContent = `${formatHzLabel(hz)} Hz`;
      tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
      axisEl.appendChild(tick);
    }
  }

  const MODES = [
    { id: "additive", label: "▶ Additive" },
    { id: "subtractive", label: "▶ Subtractive" },
  ];
  const modeButtons = new Map();
  for (const m of MODES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = m.label;
    btn.addEventListener("click", () => selectMode(m.id, true));
    toggleRow.appendChild(btn);
    modeButtons.set(m.id, btn);
  }

  const active = new Set([1]);
  const bars = new Map();
  for (const k of PARTIALS) {
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
    if (k !== 1) bar.addEventListener("click", () => toggleHarmonic(k));
    barsEl.appendChild(slot);
    bars.set(k, bar);
  }

  let mode = "additive";
  let cutoff = DEFAULT_CUTOFF;
  let interactionCount = 0;
  const triedModes = new Set();

  let addOsc = null;
  let addGain = null;
  let addAnalyser = null;
  let stopAddViz = null;
  let subOsc = null;
  let subFilter = null;
  let subGain = null;
  let subAnalyser = null;
  let stopSubViz = null;

  function maybeComplete() {
    if (triedModes.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function buildAdditiveWave() {
    const real = new Float32Array(Math.max(...PARTIALS) + 1);
    const imag = new Float32Array(Math.max(...PARTIALS) + 1);
    for (const k of active) imag[k] = 1 / k;
    return audioEngine.ctx.createPeriodicWave(real, imag);
  }

  function renderBars() {
    for (const [k, bar] of bars) {
      bar.classList.toggle("active", active.has(k));
      bar.setAttribute("aria-pressed", active.has(k) ? "true" : "false");
    }
    if (addOsc) addOsc.setPeriodicWave(buildAdditiveWave());
  }

  function toggleHarmonic(k) {
    if (active.has(k)) active.delete(k);
    else active.add(k);
    renderBars();
    interactionCount += 1;
    recordInteraction(STATION_ID);
    maybeComplete();
  }

  function applyMode() {
    if (!addGain || !subGain) return; // audio not set up yet — applied once it is
    const now = audioEngine.ctx.currentTime;
    addGain.gain.setTargetAtTime(mode === "additive" ? VOICE_GAIN : 0, now, 0.03);
    subGain.gain.setTargetAtTime(mode === "subtractive" ? VOICE_GAIN : 0, now, 0.03);
  }

  function selectMode(id, userInitiated) {
    mode = id;
    for (const [mid, btn] of modeButtons) btn.classList.toggle("active", mid === id);
    applyMode();
    triedModes.add(id);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setCutoff(hz, userInitiated) {
    cutoff = clamp(Math.round(hz), MIN_CUTOFF, MAX_CUTOFF);
    cutoffSlider.value = String(cutoff);
    cutoffReadout.textContent = formatHz(cutoff);
    if (subFilter) subFilter.frequency.setTargetAtTime(cutoff, audioEngine.ctx.currentTime, 0.02);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  cutoffSlider.addEventListener("input", () => setCutoff(Number(cutoffSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || addOsc) return;
    const ctx = audioEngine.ctx;

    // Additive voice — a single oscillator whose periodic wave is rebuilt
    // from the toggled partials. Tapped for analysis before the mute gain
    // so its spectrum stays live and honest even while "Subtractive" is
    // the one actually reaching the speakers.
    addOsc = ctx.createOscillator();
    addOsc.frequency.value = FUNDAMENTAL_HZ;
    addOsc.setPeriodicWave(buildAdditiveWave());
    addGain = ctx.createGain();
    addGain.gain.value = 0;
    addOsc.connect(addGain).connect(audioEngine.masterGain);
    addAnalyser = ctx.createAnalyser();
    addAnalyser.fftSize = 8192;
    addAnalyser.smoothingTimeConstant = 0.6;
    addOsc.connect(addAnalyser);
    addOsc.start();
    stopAddViz = drawSpectrum(addCanvas, addAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });

    // Subtractive voice — a always-on sawtooth (already has every harmonic)
    // run through a low-pass filter. Same before-the-mute-gain tap trick,
    // this time reading the filter's output.
    subOsc = ctx.createOscillator();
    subOsc.type = "sawtooth";
    subOsc.frequency.value = FUNDAMENTAL_HZ;
    subFilter = ctx.createBiquadFilter();
    subFilter.type = "lowpass";
    subFilter.frequency.value = cutoff;
    subFilter.Q.value = 0.7071;
    subGain = ctx.createGain();
    subGain.gain.value = 0;
    subOsc.connect(subFilter);
    subFilter.connect(subGain).connect(audioEngine.masterGain);
    subAnalyser = ctx.createAnalyser();
    subAnalyser.fftSize = 8192;
    subAnalyser.smoothingTimeConstant = 0.6;
    subFilter.connect(subAnalyser);
    subOsc.start();
    stopSubViz = drawSpectrum(subCanvas, subAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });

    applyMode();
  }

  renderBars();
  selectMode(mode, false);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(addCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(subCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopAddViz) stopAddViz();
    if (stopSubViz) stopSubViz();
    for (const node of [addOsc, subOsc]) {
      if (!node) continue;
      try {
        node.stop();
      } catch (e) {
        /* already stopped */
      }
      node.disconnect();
    }
    if (addGain) addGain.disconnect();
    if (addAnalyser) addAnalyser.disconnect();
    if (subFilter) subFilter.disconnect();
    if (subGain) subGain.disconnect();
    if (subAnalyser) subAnalyser.disconnect();
  };
}
