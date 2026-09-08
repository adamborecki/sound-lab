import { drawSpectrum, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { createFilterChain, bandpassQ } from "../js/filter-chain.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "filters-intro";
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 20000;
const AXIS_LABELS = [20, 100, 1000, 10000];
const MIN_FREQ = 100;
const MAX_FREQ = 8000;
const DEFAULT_FREQ = 1000;
const BANDPASS_BANDWIDTH = 600;
const COMPLETE_AFTER_INTERACTIONS = 5;

const TYPES = [
  { id: "lowpass", label: "Low-Pass", icon: "lowpass", controlLabel: "Cutoff Frequency" },
  { id: "highpass", label: "High-Pass", icon: "highpass", controlLabel: "Cutoff Frequency" },
  { id: "bandpass", label: "Band-Pass", icon: "bandpass", controlLabel: "Center Frequency" },
];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Additive synthesis (Harmonics) builds a sound up from nothing, one partial at a time.
      <strong>Subtractive synthesis works the opposite way</strong>: start with something already
      full of frequencies — noise, or a buzzy oscillator — and carve pieces away with a filter.
      A filter's <em>cutoff</em> is where it draws that line; everything past it is attenuated.
    </p>

    <div class="wave-button-row" id="fi-types"></div>
    <p class="prompt" id="fi-type-desc"></p>

    <div class="osc-control">
      <div class="osc-control-label" id="fi-control-label">Cutoff Frequency</div>
      <div class="big-readout" id="fi-readout">${formatHz(DEFAULT_FREQ)}</div>
      <input type="range" id="fi-slider" class="big-slider" min="${MIN_FREQ}" max="${MAX_FREQ}"
        value="${DEFAULT_FREQ}" step="1" aria-label="Filter frequency in Hertz" />
    </div>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="fi-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum of filtered white noise"></canvas>
    <div class="spectrum-axis" id="fi-axis"></div>

    <p class="fft-caption">
      Running white noise through the filter here on purpose — noise has energy at every frequency,
      so the filter's shape shows up directly as the spectrum's outline. Head to the three stations
      below for finer control (bandwidth on Band-Pass) and real sources: a sawtooth tone and a short
      synthesized music loop.
    </p>
  `;

  const typeRow = container.querySelector("#fi-types");
  const typeDesc = container.querySelector("#fi-type-desc");
  const controlLabel = container.querySelector("#fi-control-label");
  const slider = container.querySelector("#fi-slider");
  const readout = container.querySelector("#fi-readout");
  const canvas = container.querySelector("#fi-canvas");
  const axisEl = container.querySelector("#fi-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    axisEl.appendChild(tick);
  }

  const TYPE_DESCRIPTIONS = {
    lowpass: "Keeps frequencies below the cutoff, cuts the ones above it.",
    highpass: "Keeps frequencies above the cutoff, cuts the ones below it.",
    bandpass: "Keeps a slice around the center frequency, cuts both ends.",
  };

  const buttons = new Map();
  for (const t of TYPES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(t.icon)}<span>${t.label}</span>`;
    btn.addEventListener("click", () => selectType(t.id, true));
    typeRow.appendChild(btn);
    buttons.set(t.id, btn);
  }

  let current = "lowpass";
  let freq = DEFAULT_FREQ;
  let interactionCount = 0;
  const triedTypes = new Set();

  let filterChain = null;
  let localAnalyser = null;
  let stopViz = null;
  let noiseVoice = null;

  function maybeComplete() {
    if (triedTypes.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function applySelection(id) {
    current = id;
    const type = TYPES.find((t) => t.id === id);
    for (const [tid, btn] of buttons) btn.classList.toggle("active", tid === id);
    controlLabel.textContent = type.controlLabel;
    typeDesc.textContent = TYPE_DESCRIPTIONS[id];
  }

  function applyFilterParams() {
    if (!filterChain) return;
    filterChain.setType(current);
    const now = audioEngine.ctx.currentTime;
    filterChain.setFrequency(freq, now);
    filterChain.setQ(current === "bandpass" ? bandpassQ(freq, BANDPASS_BANDWIDTH) : 0.3, now);
  }

  function selectType(id, userInitiated) {
    if (id !== current) {
      applySelection(id);
      applyFilterParams();
    }
    triedTypes.add(id);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setFreq(hz, userInitiated) {
    freq = clamp(Math.round(hz), MIN_FREQ, MAX_FREQ);
    slider.value = String(freq);
    readout.textContent = formatHz(freq);
    applyFilterParams();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  slider.addEventListener("input", () => setFreq(Number(slider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || filterChain) return;
    const ctx = audioEngine.ctx;

    filterChain = createFilterChain(ctx, current);
    applyFilterParams();
    filterChain.output.connect(audioEngine.masterGain);

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 8192;
    localAnalyser.smoothingTimeConstant = 0.6;
    filterChain.output.connect(localAnalyser);

    noiseVoice = audioEngine.createNoiseVoice({ gain: 0, color: "white" });
    // createNoiseVoice connects straight to masterGain — mute that path and
    // tap its raw output into the filter instead, so noise reaches the
    // speakers only after being shaped.
    noiseVoice.gainNode.disconnect();
    noiseVoice.gainNode.connect(filterChain.input);
    noiseVoice.setGain(0.28);

    stopViz = drawSpectrum(canvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
  }

  applySelection(current);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (noiseVoice) noiseVoice.stop();
    if (filterChain) filterChain.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
