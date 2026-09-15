import {
  drawSpectrum,
  drawFilterCurve,
  drawIdleMessage,
  logPositionForFreq,
} from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { getLoopBuffer } from "../js/loop-source.js";
import { clamp, formatHz, formatDb } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "filter-peak";
const MIN_CENTER = 100;
const MAX_CENTER = 8000;
const DEFAULT_CENTER = 1000;
const MIN_GAIN = -18;
const MAX_GAIN = 18;
const DEFAULT_GAIN = 12;
const MIN_Q = 0.3;
const MAX_Q = 10;
const DEFAULT_Q = 1.5;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 20000;
const AXIS_LABELS = [20, 100, 1000, 10000];
const TONE_HZ = 110;
const COMPLETE_AFTER_INTERACTIONS = 6;

const SOURCES = [
  { id: "white", label: "White Noise" },
  { id: "saw", label: "Sawtooth Tone" },
  { id: "loop", label: "Musical Loop" },
];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      A parametric peak (or "bell") filter boosts or cuts a bell-shaped band around one center
      frequency, without touching anything outside it. Turn Gain up and that band gets louder; turn
      it below zero and it gets quieter. Width (Q) controls how narrow the bell is.
    </p>

    <div class="filter-shape-badge">${waveIconSvg("peaking")}<span>Peak / Bell Response</span></div>

    <div class="preset-row" id="pk-sources"></div>

    <div class="osc-control">
      <div class="osc-control-label">Center Frequency</div>
      <div class="big-readout" id="pk-center-readout">${formatHz(DEFAULT_CENTER)}</div>
      <input type="range" id="pk-center-slider" class="big-slider" min="${MIN_CENTER}" max="${MAX_CENTER}"
        value="${DEFAULT_CENTER}" step="1" aria-label="Peak filter center frequency in Hertz" />
    </div>

    <div class="control-row">
      <div class="control-compact">
        <div class="osc-control-label">Gain</div>
        <div class="compact-readout" id="pk-gain-readout">${formatDb(DEFAULT_GAIN)}</div>
        <input type="range" id="pk-gain-slider" class="compact-slider" min="${MIN_GAIN}" max="${MAX_GAIN}"
          value="${DEFAULT_GAIN}" step="0.5" aria-label="Boost or cut in decibels" />
      </div>

      <div class="control-compact">
        <div class="osc-control-label">Width (Q)</div>
        <div class="compact-readout" id="pk-q-readout">${DEFAULT_Q.toFixed(1)}</div>
        <input type="range" id="pk-q-slider" class="compact-slider" min="${MIN_Q}" max="${MAX_Q}"
          value="${DEFAULT_Q}" step="0.1" aria-label="Filter width, higher is narrower" />
      </div>
    </div>

    <div class="osc-control-label">Filter Response (gain vs. frequency)</div>
    <canvas class="spectrum-canvas" id="pk-filter-canvas" width="600" height="200"
      role="img" aria-label="Live filter response curve — the exact shape this filter is applying right now"></canvas>
    <div class="spectrum-axis" id="pk-filter-axis"></div>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="pk-spectrum-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum after the filter"></canvas>
    <div class="spectrum-axis" id="pk-spectrum-axis"></div>
  `;

  const sourceRow = container.querySelector("#pk-sources");
  const centerSlider = container.querySelector("#pk-center-slider");
  const centerReadout = container.querySelector("#pk-center-readout");
  const gainSlider = container.querySelector("#pk-gain-slider");
  const gainReadout = container.querySelector("#pk-gain-readout");
  const qSlider = container.querySelector("#pk-q-slider");
  const qReadout = container.querySelector("#pk-q-readout");
  const spectrumCanvas = container.querySelector("#pk-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#pk-spectrum-axis");
  const filterCanvas = container.querySelector("#pk-filter-canvas");
  const filterAxisEl = container.querySelector("#pk-filter-axis");

  for (const axis of [spectrumAxisEl, filterAxisEl]) {
    for (const hz of AXIS_LABELS) {
      const tick = document.createElement("span");
      tick.textContent = `${formatHzLabel(hz)} Hz`;
      tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
      axis.appendChild(tick);
    }
  }

  const buttons = new Map();
  for (const s of SOURCES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = s.label;
    btn.addEventListener("click", () => selectSource(s.id, true));
    sourceRow.appendChild(btn);
    buttons.set(s.id, btn);
  }

  let current = "loop";
  let center = DEFAULT_CENTER;
  let gain = DEFAULT_GAIN;
  let q = DEFAULT_Q;
  let interactionCount = 0;
  const triedSources = new Set();

  let filterNode = null;
  let localAnalyser = null;
  let stopSpectrumViz = null;
  let stopFilterViz = null;
  let sourceNode = null;
  let sourceGain = null;
  let loopBufferPromise = null;

  function applySelection(id) {
    current = id;
    for (const [sid, btn] of buttons) btn.classList.toggle("active", sid === id);
  }

  function maybeComplete() {
    if (triedSources.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function stopCurrentSource() {
    if (!sourceGain) return;
    const gain = sourceGain;
    const node = sourceNode;
    gain.gain.setTargetAtTime(0, audioEngine.ctx.currentTime, 0.02);
    setTimeout(() => {
      try {
        node.stop();
      } catch (e) {
        /* never started, or already stopped */
      }
      node.disconnect();
      gain.disconnect();
    }, 150);
    sourceNode = null;
    sourceGain = null;
  }

  function startSource(id) {
    const ctx = audioEngine.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(filterNode);

    if (id === "white") {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(gain);
      src.start();
      sourceNode = src;
    } else if (id === "saw") {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = TONE_HZ;
      osc.connect(gain);
      osc.start();
      sourceNode = osc;
    } else {
      const src = ctx.createBufferSource();
      src.loop = true;
      src.connect(gain);
      sourceNode = src;
      loopBufferPromise.then((buffer) => {
        if (sourceNode !== src) return; // superseded before it loaded
        src.buffer = buffer;
        src.start();
      });
    }

    sourceGain = gain;
    const targetGain = id === "white" ? 0.3 : id === "saw" ? 0.28 : 0.4;
    gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.03);
  }

  function selectSource(id, userInitiated) {
    const changed = id !== current;
    if (changed) {
      applySelection(id);
      if (filterNode) {
        stopCurrentSource();
        startSource(id);
      }
    }
    triedSources.add(id);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function applyFilterParams() {
    if (!filterNode) return;
    const now = audioEngine.ctx.currentTime;
    filterNode.frequency.setTargetAtTime(center, now, 0.02);
    filterNode.gain.setTargetAtTime(gain, now, 0.02);
    filterNode.Q.setTargetAtTime(q, now, 0.02);
  }

  function setCenter(hz, userInitiated) {
    center = clamp(Math.round(hz), MIN_CENTER, MAX_CENTER);
    centerSlider.value = String(center);
    centerReadout.textContent = formatHz(center);
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

  centerSlider.addEventListener("input", () => setCenter(Number(centerSlider.value), true));
  gainSlider.addEventListener("input", () => setGain(Number(gainSlider.value), true));
  qSlider.addEventListener("input", () => setQ(Number(qSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || filterNode) return;
    const ctx = audioEngine.ctx;

    filterNode = ctx.createBiquadFilter();
    filterNode.type = "peaking";
    applyFilterParams();
    filterNode.connect(audioEngine.masterGain);

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 8192;
    localAnalyser.smoothingTimeConstant = 0.6;
    filterNode.connect(localAnalyser);

    stopSpectrumViz = drawSpectrum(spectrumCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
    stopFilterViz = drawFilterCurve(filterCanvas, filterNode, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });

    loopBufferPromise = getLoopBuffer(ctx);
    startSource(current);
  }

  applySelection(current);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(filterCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopSpectrumViz) stopSpectrumViz();
    if (stopFilterViz) stopFilterViz();
    stopCurrentSource();
    if (filterNode) filterNode.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
