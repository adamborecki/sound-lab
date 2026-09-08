import {
  drawSpectrum,
  drawSpectrogram,
  drawIdleMessage,
  logPositionForFreq,
  buildSpectrogramFreqAxis,
} from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { createFilterChain, bandpassQ } from "../js/filter-chain.js";
import { getLoopBuffer } from "../js/loop-source.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "filter-bandpass";
const MIN_CENTER = 100;
const MAX_CENTER = 8000;
const DEFAULT_CENTER = 1000;
const MIN_BANDWIDTH = 20;
const MAX_BANDWIDTH = 4000;
const DEFAULT_BANDWIDTH = 600;
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
      A band-pass filter combines both: it only lets a slice of frequencies through, centered on one
      value, and cuts everything above <em>and</em> below it. Bandwidth controls how wide that slice
      is — narrow it down and only a thin, almost whistle-like band survives.
    </p>

    <div class="filter-shape-badge">${waveIconSvg("bandpass")}<span>Band-Pass Response</span></div>

    <div class="preset-row" id="bp-sources"></div>

    <div class="osc-control">
      <div class="osc-control-label">Center Frequency</div>
      <div class="big-readout" id="bp-center-readout">${formatHz(DEFAULT_CENTER)}</div>
      <input type="range" id="bp-center-slider" class="big-slider" min="${MIN_CENTER}" max="${MAX_CENTER}"
        value="${DEFAULT_CENTER}" step="1" aria-label="Band-pass center frequency in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Bandwidth</div>
      <div class="big-readout" id="bp-bw-readout">${formatHz(DEFAULT_BANDWIDTH)}</div>
      <input type="range" id="bp-bw-slider" class="big-slider" min="${MIN_BANDWIDTH}" max="${MAX_BANDWIDTH}"
        value="${DEFAULT_BANDWIDTH}" step="1" aria-label="Band-pass bandwidth in Hertz" />
    </div>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="bp-spectrum-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum after the filter"></canvas>
    <div class="spectrum-axis" id="bp-spectrum-axis"></div>

    <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
    <div class="spectrogram-row">
      <div class="spectrogram-freq-axis" id="bp-spectrogram-axis"></div>
      <canvas class="spectrum-canvas" id="bp-spectrogram-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram after the filter — frequency on the vertical axis, time on the horizontal axis"></canvas>
    </div>
  `;

  const sourceRow = container.querySelector("#bp-sources");
  const centerSlider = container.querySelector("#bp-center-slider");
  const centerReadout = container.querySelector("#bp-center-readout");
  const bwSlider = container.querySelector("#bp-bw-slider");
  const bwReadout = container.querySelector("#bp-bw-readout");
  const spectrumCanvas = container.querySelector("#bp-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#bp-spectrum-axis");
  const spectrogramCanvas = container.querySelector("#bp-spectrogram-canvas");
  const spectrogramAxisEl = container.querySelector("#bp-spectrogram-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    spectrumAxisEl.appendChild(tick);
  }
  buildSpectrogramFreqAxis(spectrogramAxisEl, AXIS_LABELS, MIN_HZ_AXIS, MAX_HZ_AXIS);

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

  let filterChain = null;
  let localAnalyser = null;
  let stopSpectrumViz = null;
  let stopSpectrogramViz = null;
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
    gain.connect(filterChain.input);

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
    // Band-pass already concentrates energy into a slice, so a noisy/rich
    // source needs a bit more gain than low/high-pass to stay audible.
    const targetGain = id === "white" ? 0.35 : id === "saw" ? 0.3 : 0.4;
    gain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.03);
  }

  function selectSource(id, userInitiated) {
    const changed = id !== current;
    if (changed) {
      applySelection(id);
      if (filterChain) {
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
    if (!filterChain) return;
    const now = audioEngine.ctx.currentTime;
    filterChain.setFrequency(center, now);
    filterChain.setQ(bandpassQ(center, bandwidth), now);
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
    if (!audioEngine.isStarted || filterChain) return;
    const ctx = audioEngine.ctx;

    filterChain = createFilterChain(ctx, "bandpass");
    filterChain.setFrequency(center, ctx.currentTime, 0);
    filterChain.setQ(bandpassQ(center, bandwidth), ctx.currentTime, 0);
    filterChain.output.connect(audioEngine.masterGain);

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 8192;
    localAnalyser.smoothingTimeConstant = 0.6;
    filterChain.output.connect(localAnalyser);

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

    loopBufferPromise = getLoopBuffer(ctx);
    startSource(current);
  }

  applySelection(current);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrogramCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopSpectrumViz) stopSpectrumViz();
    if (stopSpectrogramViz) stopSpectrogramViz();
    stopCurrentSource();
    if (filterChain) filterChain.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
