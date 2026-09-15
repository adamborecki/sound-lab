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

const STATION_ID = "filter-lowshelf";
const MIN_CORNER = 100;
const MAX_CORNER = 4000;
const DEFAULT_CORNER = 400;
const MIN_GAIN = -18;
const MAX_GAIN = 18;
const DEFAULT_GAIN = 12;
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
      A low shelf boosts or cuts <strong>everything below</strong> a corner frequency by one flat
      amount — a "bass knob." Above the corner, the signal is untouched. Unlike Low-Pass, nothing
      gets removed, just turned up or down.
    </p>

    <div class="filter-shape-badge">${waveIconSvg("lowshelf")}<span>Low Shelf Response</span></div>

    <div class="preset-row" id="ls-sources"></div>

    <div class="osc-control">
      <div class="osc-control-label">Corner Frequency</div>
      <div class="big-readout" id="ls-corner-readout">${formatHz(DEFAULT_CORNER)}</div>
      <input type="range" id="ls-corner-slider" class="big-slider" min="${MIN_CORNER}" max="${MAX_CORNER}"
        value="${DEFAULT_CORNER}" step="1" aria-label="Low shelf corner frequency in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Gain</div>
      <div class="big-readout" id="ls-gain-readout">${formatDb(DEFAULT_GAIN)}</div>
      <input type="range" id="ls-gain-slider" class="big-slider" min="${MIN_GAIN}" max="${MAX_GAIN}"
        value="${DEFAULT_GAIN}" step="0.5" aria-label="Boost or cut in decibels" />
    </div>

    <div class="osc-control-label">Filter Response (gain vs. frequency)</div>
    <canvas class="spectrum-canvas" id="ls-filter-canvas" width="600" height="200"
      role="img" aria-label="Live filter response curve — the exact shape this filter is applying right now"></canvas>
    <div class="spectrum-axis" id="ls-filter-axis"></div>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="ls-spectrum-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum after the filter"></canvas>
    <div class="spectrum-axis" id="ls-spectrum-axis"></div>
  `;

  const sourceRow = container.querySelector("#ls-sources");
  const cornerSlider = container.querySelector("#ls-corner-slider");
  const cornerReadout = container.querySelector("#ls-corner-readout");
  const gainSlider = container.querySelector("#ls-gain-slider");
  const gainReadout = container.querySelector("#ls-gain-readout");
  const spectrumCanvas = container.querySelector("#ls-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#ls-spectrum-axis");
  const filterCanvas = container.querySelector("#ls-filter-canvas");
  const filterAxisEl = container.querySelector("#ls-filter-axis");

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
  let corner = DEFAULT_CORNER;
  let gain = DEFAULT_GAIN;
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
    filterNode.frequency.setTargetAtTime(corner, now, 0.02);
    filterNode.gain.setTargetAtTime(gain, now, 0.02);
  }

  function setCorner(hz, userInitiated) {
    corner = clamp(Math.round(hz), MIN_CORNER, MAX_CORNER);
    cornerSlider.value = String(corner);
    cornerReadout.textContent = formatHz(corner);
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

  cornerSlider.addEventListener("input", () => setCorner(Number(cornerSlider.value), true));
  gainSlider.addEventListener("input", () => setGain(Number(gainSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || filterNode) return;
    const ctx = audioEngine.ctx;

    filterNode = ctx.createBiquadFilter();
    filterNode.type = "lowshelf";
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
