import {
  drawSpectrum,
  drawFilterCurve,
  drawIdleMessage,
  logPositionForFreq,
} from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { getLoopBuffer } from "../js/loop-source.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "filter-resonance";
const MIN_CUTOFF = 100;
const MAX_CUTOFF = 8000;
const DEFAULT_CUTOFF = 1000;
const MIN_Q = 0.5;
const MAX_Q = 20;
const DEFAULT_Q = 6;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 20000;
const AXIS_LABELS = [20, 100, 1000, 10000];
const TONE_HZ = 110;
const COMPLETE_AFTER_INTERACTIONS = 6;

const TYPES = [
  { id: "lowpass", label: "Low-Pass", icon: "lowpass" },
  { id: "highpass", label: "High-Pass", icon: "highpass" },
];

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
      Low-Pass and High-Pass (Day 4) only let you set the cutoff. Here's the control they were
      missing: <strong>Resonance</strong> (Q) — turn it up and the filter emphasizes frequencies
      right at the cutoff instead of rolling off cleanly, making a sweep sound sharper and more
      dramatic. Plenty of synths just label this knob "Q."
    </p>

    <div class="wave-button-row" id="rs-types"></div>

    <div class="preset-row" id="rs-sources"></div>

    <div class="osc-control">
      <div class="osc-control-label">Cutoff Frequency</div>
      <div class="big-readout" id="rs-cutoff-readout">${formatHz(DEFAULT_CUTOFF)}</div>
      <input type="range" id="rs-cutoff-slider" class="big-slider" min="${MIN_CUTOFF}" max="${MAX_CUTOFF}"
        value="${DEFAULT_CUTOFF}" step="1" aria-label="Cutoff frequency in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Resonance (Q)</div>
      <div class="big-readout" id="rs-q-readout">${DEFAULT_Q.toFixed(1)}</div>
      <input type="range" id="rs-q-slider" class="big-slider" min="${MIN_Q}" max="${MAX_Q}"
        value="${DEFAULT_Q}" step="0.1" aria-label="Resonance, higher is more emphasis at the cutoff" />
    </div>

    <div class="osc-control-label">Filter Response (gain vs. frequency)</div>
    <canvas class="spectrum-canvas" id="rs-filter-canvas" width="600" height="200"
      role="img" aria-label="Live filter response curve showing the resonant peak at the cutoff"></canvas>
    <div class="spectrum-axis" id="rs-filter-axis"></div>

    <p class="fft-caption">
      Watch the bump grow right at the cutoff as you raise Resonance — try sweeping Cutoff with
      Resonance low, then again with it cranked, and compare.
    </p>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="rs-spectrum-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum after the filter"></canvas>
    <div class="spectrum-axis" id="rs-spectrum-axis"></div>
  `;

  const typeRow = container.querySelector("#rs-types");
  const sourceRow = container.querySelector("#rs-sources");
  const cutoffSlider = container.querySelector("#rs-cutoff-slider");
  const cutoffReadout = container.querySelector("#rs-cutoff-readout");
  const qSlider = container.querySelector("#rs-q-slider");
  const qReadout = container.querySelector("#rs-q-readout");
  const filterCanvas = container.querySelector("#rs-filter-canvas");
  const filterAxisEl = container.querySelector("#rs-filter-axis");
  const spectrumCanvas = container.querySelector("#rs-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#rs-spectrum-axis");

  for (const axis of [filterAxisEl, spectrumAxisEl]) {
    for (const hz of AXIS_LABELS) {
      const tick = document.createElement("span");
      tick.textContent = `${formatHzLabel(hz)} Hz`;
      tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
      axis.appendChild(tick);
    }
  }

  const typeButtons = new Map();
  for (const t of TYPES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(t.icon)}<span>${t.label}</span>`;
    btn.addEventListener("click", () => selectType(t.id, true));
    typeRow.appendChild(btn);
    typeButtons.set(t.id, btn);
  }

  const sourceButtons = new Map();
  for (const s of SOURCES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = s.label;
    btn.addEventListener("click", () => selectSource(s.id, true));
    sourceRow.appendChild(btn);
    sourceButtons.set(s.id, btn);
  }

  let currentType = "lowpass";
  let currentSource = "loop";
  let cutoff = DEFAULT_CUTOFF;
  let q = DEFAULT_Q;
  let interactionCount = 0;
  const triedTypes = new Set();
  const triedSources = new Set();

  let filterNode = null;
  let localAnalyser = null;
  let stopSpectrumViz = null;
  let stopFilterViz = null;
  let sourceNode = null;
  let sourceGain = null;
  let loopBufferPromise = null;

  function maybeComplete() {
    if (triedTypes.size >= 2 && triedSources.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function applyTypeSelection(id) {
    currentType = id;
    for (const [tid, btn] of typeButtons) btn.classList.toggle("active", tid === id);
  }

  function applySourceSelection(id) {
    currentSource = id;
    for (const [sid, btn] of sourceButtons) btn.classList.toggle("active", sid === id);
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

  function selectType(id, userInitiated) {
    if (id !== currentType) {
      applyTypeSelection(id);
      applyFilterParams();
    }
    triedTypes.add(id);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function selectSource(id, userInitiated) {
    const changed = id !== currentSource;
    if (changed) {
      applySourceSelection(id);
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
    filterNode.type = currentType;
    filterNode.frequency.setTargetAtTime(cutoff, now, 0.02);
    filterNode.Q.setTargetAtTime(q, now, 0.02);
  }

  function setCutoff(hz, userInitiated) {
    cutoff = clamp(Math.round(hz), MIN_CUTOFF, MAX_CUTOFF);
    cutoffSlider.value = String(cutoff);
    cutoffReadout.textContent = formatHz(cutoff);
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

  cutoffSlider.addEventListener("input", () => setCutoff(Number(cutoffSlider.value), true));
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

    // A resonant peak at high Q can run well above a typical boost/cut
    // EQ's ±18 dB range, so this station widens the Filter Response view's
    // vertical range rather than clipping the bump off the top.
    stopFilterViz = drawFilterCurve(filterCanvas, filterNode, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
      minDb: -30,
      maxDb: 30,
    });
    stopSpectrumViz = drawSpectrum(spectrumCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });

    loopBufferPromise = getLoopBuffer(ctx);
    startSource(currentSource);
  }

  applyTypeSelection(currentType);
  applySourceSelection(currentSource);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(filterCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopFilterViz) stopFilterViz();
    if (stopSpectrumViz) stopSpectrumViz();
    stopCurrentSource();
    if (filterNode) filterNode.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
