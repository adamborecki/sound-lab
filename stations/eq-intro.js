import { drawSpectrum, drawFilterCurve, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { clamp, formatHz, formatDb } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "eq-intro";
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 20000;
const AXIS_LABELS = [20, 100, 1000, 10000];
const MIN_FREQ = 100;
const MAX_FREQ = 8000;
const DEFAULT_FREQ = 1000;
const MIN_GAIN = -18;
const MAX_GAIN = 18;
const DEFAULT_GAIN = 12;
const MIN_Q = 0.3;
const MAX_Q = 10;
const DEFAULT_Q = 1.5;
const COMPLETE_AFTER_INTERACTIONS = 5;

// Peaking, low-shelf, high-shelf, and notch are all natively-implemented
// BiquadFilterNode types with a built-in gain param — unlike lowpass/
// highpass/bandpass (see filter-chain.js), a single node here already
// matches the number a student sets, so there's no cascade or
// compensation trick needed.
const TYPES = [
  { id: "peaking", label: "Peak / Bell", icon: "peaking", hasGain: true, hasQ: true },
  { id: "lowshelf", label: "Low Shelf", icon: "lowshelf", hasGain: true, hasQ: false },
  { id: "highshelf", label: "High Shelf", icon: "highshelf", hasGain: true, hasQ: false },
  { id: "notch", label: "Notch", icon: "notch", hasGain: false, hasQ: true },
];

const TYPE_DESCRIPTIONS = {
  peaking: "Boosts or cuts a bell-shaped band around one frequency — everything else is untouched.",
  lowshelf: "Boosts or cuts everything below a corner frequency by a flat amount, like a bass knob.",
  highshelf: "Boosts or cuts everything above a corner frequency by a flat amount, like a treble knob.",
  notch: "The opposite of Band-Pass: cuts a narrow slice out and leaves everything else alone.",
};

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Low-Pass, High-Pass, and Band-Pass all draw a hard line and cut everything past it. This family
      is gentler: <strong>boost or cut</strong> a region instead of removing it outright — the tools
      behind an EQ knob on a mixer.
    </p>

    <div class="wave-button-row" id="eq-types"></div>
    <p class="prompt" id="eq-type-desc"></p>

    <div class="osc-control">
      <div class="osc-control-label" id="eq-freq-label">Frequency</div>
      <div class="big-readout" id="eq-freq-readout">${formatHz(DEFAULT_FREQ)}</div>
      <input type="range" id="eq-freq-slider" class="big-slider" min="${MIN_FREQ}" max="${MAX_FREQ}"
        value="${DEFAULT_FREQ}" step="1" aria-label="Filter frequency in Hertz" />
    </div>

    <div class="control-row">
      <div class="control-compact" id="eq-gain-control">
        <div class="osc-control-label">Gain</div>
        <div class="compact-readout" id="eq-gain-readout">${formatDb(DEFAULT_GAIN)}</div>
        <input type="range" id="eq-gain-slider" class="compact-slider" min="${MIN_GAIN}" max="${MAX_GAIN}"
          value="${DEFAULT_GAIN}" step="0.5" aria-label="Boost or cut in decibels" />
      </div>

      <div class="control-compact" id="eq-q-control">
        <div class="osc-control-label">Width (Q)</div>
        <div class="compact-readout" id="eq-q-readout">${DEFAULT_Q.toFixed(1)}</div>
        <input type="range" id="eq-q-slider" class="compact-slider" min="${MIN_Q}" max="${MAX_Q}"
          value="${DEFAULT_Q}" step="0.1" aria-label="Filter width, higher is narrower" />
      </div>
    </div>

    <div class="osc-control-label">Filter Response (gain vs. frequency)</div>
    <canvas class="spectrum-canvas" id="eq-filter-canvas" width="600" height="200"
      role="img" aria-label="Live filter response curve — the exact shape this filter is applying right now"></canvas>
    <div class="spectrum-axis" id="eq-filter-axis"></div>

    <p class="fft-caption">
      This is the filter's actual shape — computed directly from its settings, not from whatever's
      playing. Watch it redraw live as you drag Frequency, Gain, or Width.
    </p>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="eq-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum of filtered white noise"></canvas>
    <div class="spectrum-axis" id="eq-axis"></div>

    <p class="fft-caption">
      White noise again — flat energy at every frequency, so any boost or cut shows up directly as a
      bump or dip in the spectrum's outline.
    </p>
  `;

  const typeRow = container.querySelector("#eq-types");
  const typeDesc = container.querySelector("#eq-type-desc");
  const freqLabel = container.querySelector("#eq-freq-label");
  const freqSlider = container.querySelector("#eq-freq-slider");
  const freqReadout = container.querySelector("#eq-freq-readout");
  const gainControl = container.querySelector("#eq-gain-control");
  const gainSlider = container.querySelector("#eq-gain-slider");
  const gainReadout = container.querySelector("#eq-gain-readout");
  const qControl = container.querySelector("#eq-q-control");
  const qSlider = container.querySelector("#eq-q-slider");
  const qReadout = container.querySelector("#eq-q-readout");
  const canvas = container.querySelector("#eq-canvas");
  const axisEl = container.querySelector("#eq-axis");
  const filterCanvas = container.querySelector("#eq-filter-canvas");
  const filterAxisEl = container.querySelector("#eq-filter-axis");

  for (const axis of [axisEl, filterAxisEl]) {
    for (const hz of AXIS_LABELS) {
      const tick = document.createElement("span");
      tick.textContent = `${formatHzLabel(hz)} Hz`;
      tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
      axis.appendChild(tick);
    }
  }

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

  let current = "peaking";
  let freq = DEFAULT_FREQ;
  let gain = DEFAULT_GAIN;
  let q = DEFAULT_Q;
  let interactionCount = 0;
  const triedTypes = new Set();

  let filterNode = null;
  let localAnalyser = null;
  let stopViz = null;
  let stopFilterViz = null;
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
    freqLabel.textContent = id === "lowshelf" || id === "highshelf" ? "Corner Frequency" : "Center Frequency";
    typeDesc.textContent = TYPE_DESCRIPTIONS[id];
    gainControl.hidden = !type.hasGain;
    qControl.hidden = !type.hasQ;
  }

  function applyFilterParams() {
    if (!filterNode) return;
    const now = audioEngine.ctx.currentTime;
    filterNode.type = current;
    filterNode.frequency.setTargetAtTime(freq, now, 0.02);
    const type = TYPES.find((t) => t.id === current);
    filterNode.gain.setTargetAtTime(type.hasGain ? gain : 0, now, 0.02);
    filterNode.Q.setTargetAtTime(type.hasQ ? q : 1, now, 0.02);
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
    freqSlider.value = String(freq);
    freqReadout.textContent = formatHz(freq);
    applyFilterParams();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setGain(db, userInitiated) {
    gain = clamp(db, MIN_GAIN, MAX_GAIN);
    gainSlider.value = String(gain);
    gainReadout.textContent = formatDb(gain);
    applyFilterParams();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setQ(value, userInitiated) {
    q = clamp(value, MIN_Q, MAX_Q);
    qSlider.value = String(q);
    qReadout.textContent = q.toFixed(1);
    applyFilterParams();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  freqSlider.addEventListener("input", () => setFreq(Number(freqSlider.value), true));
  gainSlider.addEventListener("input", () => setGain(Number(gainSlider.value), true));
  qSlider.addEventListener("input", () => setQ(Number(qSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || filterNode) return;
    const ctx = audioEngine.ctx;

    filterNode = ctx.createBiquadFilter();
    applyFilterParams();
    filterNode.connect(audioEngine.masterGain);

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 8192;
    localAnalyser.smoothingTimeConstant = 0.6;
    filterNode.connect(localAnalyser);

    noiseVoice = audioEngine.createNoiseVoice({ gain: 0, color: "white" });
    // createNoiseVoice connects straight to masterGain — mute that path and
    // tap its raw output into the filter instead, so noise reaches the
    // speakers only after being shaped.
    noiseVoice.gainNode.disconnect();
    noiseVoice.gainNode.connect(filterNode);
    noiseVoice.setGain(0.28);

    stopViz = drawSpectrum(canvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
    stopFilterViz = drawFilterCurve(filterCanvas, filterNode, {
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
    drawIdleMessage(filterCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (stopFilterViz) stopFilterViz();
    if (noiseVoice) noiseVoice.stop();
    if (filterNode) filterNode.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
