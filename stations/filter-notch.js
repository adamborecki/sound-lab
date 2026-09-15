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

const STATION_ID = "filter-notch";
const MIN_CENTER = 100;
const MAX_CENTER = 8000;
const DEFAULT_CENTER = 1000;
const MIN_BANDWIDTH = 20;
const MAX_BANDWIDTH = 4000;
const DEFAULT_BANDWIDTH = 300;
const MIN_Q = 0.1;
const MAX_Q = 400;
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
      A notch is Band-Pass's evil twin: instead of keeping a slice and cutting everything else, it
      cuts a narrow slice and keeps everything else. Narrow the bandwidth down and it becomes a
      surgical strike on one frequency — useful for zapping a single whine or hum out of a signal.
    </p>

    <div class="filter-shape-badge">${waveIconSvg("notch")}<span>Notch Response</span></div>

    <div class="preset-row" id="nt-sources"></div>

    <div class="osc-control">
      <div class="osc-control-label">Center Frequency</div>
      <div class="big-readout" id="nt-center-readout">${formatHz(DEFAULT_CENTER)}</div>
      <input type="range" id="nt-center-slider" class="big-slider" min="${MIN_CENTER}" max="${MAX_CENTER}"
        value="${DEFAULT_CENTER}" step="1" aria-label="Notch filter center frequency in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Bandwidth</div>
      <div class="big-readout" id="nt-bw-readout">${formatHz(DEFAULT_BANDWIDTH)}</div>
      <input type="range" id="nt-bw-slider" class="big-slider" min="${MIN_BANDWIDTH}" max="${MAX_BANDWIDTH}"
        value="${DEFAULT_BANDWIDTH}" step="1" aria-label="Notch bandwidth in Hertz" />
    </div>

    <div class="osc-control-label">Filter Response (gain vs. frequency)</div>
    <canvas class="spectrum-canvas" id="nt-filter-canvas" width="600" height="200"
      role="img" aria-label="Live filter response curve — the exact shape this filter is applying right now"></canvas>
    <div class="spectrum-axis" id="nt-filter-axis"></div>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="nt-spectrum-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum after the filter"></canvas>
    <div class="spectrum-axis" id="nt-spectrum-axis"></div>
  `;

  const sourceRow = container.querySelector("#nt-sources");
  const centerSlider = container.querySelector("#nt-center-slider");
  const centerReadout = container.querySelector("#nt-center-readout");
  const bwSlider = container.querySelector("#nt-bw-slider");
  const bwReadout = container.querySelector("#nt-bw-readout");
  const spectrumCanvas = container.querySelector("#nt-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#nt-spectrum-axis");
  const filterCanvas = container.querySelector("#nt-filter-canvas");
  const filterAxisEl = container.querySelector("#nt-filter-axis");

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
  let bandwidth = DEFAULT_BANDWIDTH;
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

  // A single notch node isn't cascaded (see filter-chain.js's bandpassQ for
  // why a 4-stage chain needs compensation), and Q = center / bandwidth
  // tracks the actual -3 dB width reasonably (measured with
  // getFrequencyResponse: within ~20% across this station's range, tighter
  // near the middle) -- BUT the old MIN_Q/MAX_Q clamp (0.3-40) was far too
  // narrow for the slider's real extremes: at a high center with a narrow
  // requested bandwidth, the naive Q needed is much higher than 40 (e.g.
  // center 8000 / bandwidth 20 wants Q=400), so it got clamped and the
  // actual notch came out up to ~8x WIDER than the number on screen. Widened
  // to 0.1-400, which covers the slider's real range; only the degenerate
  // corner (a low center asked for a bandwidth wider than the center itself
  // — center 100 / bandwidth 4000 — stays inaccurate, since no Q makes a
  // notch's -3 dB skirts extend below 0 Hz).
  function notchQ(centerHz, bandwidthHz) {
    return clamp(centerHz / bandwidthHz, MIN_Q, MAX_Q);
  }

  function applyFilterParams() {
    if (!filterNode) return;
    const now = audioEngine.ctx.currentTime;
    filterNode.frequency.setTargetAtTime(center, now, 0.02);
    filterNode.Q.setTargetAtTime(notchQ(center, bandwidth), now, 0.02);
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

  function setBandwidth(hz, userInitiated) {
    bandwidth = clamp(Math.round(hz), MIN_BANDWIDTH, MAX_BANDWIDTH);
    bwSlider.value = String(bandwidth);
    bwReadout.textContent = formatHz(bandwidth);
    applyFilterParams();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  centerSlider.addEventListener("input", () => setCenter(Number(centerSlider.value), true));
  bwSlider.addEventListener("input", () => setBandwidth(Number(bwSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || filterNode) return;
    const ctx = audioEngine.ctx;

    filterNode = ctx.createBiquadFilter();
    filterNode.type = "notch";
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
