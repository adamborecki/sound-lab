import {
  drawSpectrum,
  drawSpectrogram,
  drawIdleMessage,
  logPositionForFreq,
  buildSpectrogramFreqAxis,
} from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { createFilterChain } from "../js/filter-chain.js";
import { getLoopBuffer } from "../js/loop-source.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "filter-highpass";
const MIN_CUTOFF = 20;
const MAX_CUTOFF = 8000;
const DEFAULT_CUTOFF = 200;
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
      A high-pass filter is the mirror image: it lets frequencies above its cutoff through and cuts
      the ones below it. Drag the cutoff up and watch the spectrum's bottom disappear — the sound
      gets thinner as the low end is subtracted away.
    </p>

    <div class="filter-shape-badge">${waveIconSvg("highpass")}<span>High-Pass Response</span></div>

    <div class="preset-row" id="hp-sources"></div>

    <div class="osc-control">
      <div class="osc-control-label">Cutoff Frequency</div>
      <div class="big-readout" id="hp-readout">${formatHz(DEFAULT_CUTOFF)}</div>
      <input type="range" id="hp-slider" class="big-slider" min="${MIN_CUTOFF}" max="${MAX_CUTOFF}"
        value="${DEFAULT_CUTOFF}" step="1" aria-label="High-pass cutoff frequency in Hertz" />
    </div>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="hp-spectrum-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum after the filter"></canvas>
    <div class="spectrum-axis" id="hp-spectrum-axis"></div>

    <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
    <div class="spectrogram-row">
      <div class="spectrogram-freq-axis" id="hp-spectrogram-axis"></div>
      <canvas class="spectrum-canvas" id="hp-spectrogram-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram after the filter — frequency on the vertical axis, time on the horizontal axis"></canvas>
    </div>
  `;

  const sourceRow = container.querySelector("#hp-sources");
  const slider = container.querySelector("#hp-slider");
  const readout = container.querySelector("#hp-readout");
  const spectrumCanvas = container.querySelector("#hp-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#hp-spectrum-axis");
  const spectrogramCanvas = container.querySelector("#hp-spectrogram-canvas");
  const spectrogramAxisEl = container.querySelector("#hp-spectrogram-axis");

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
  let cutoff = DEFAULT_CUTOFF;
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
    const targetGain = id === "white" ? 0.25 : id === "saw" ? 0.22 : 0.35;
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

  function setCutoff(hz, userInitiated) {
    cutoff = clamp(Math.round(hz), MIN_CUTOFF, MAX_CUTOFF);
    slider.value = String(cutoff);
    readout.textContent = formatHz(cutoff);
    if (filterChain) filterChain.setFrequency(cutoff, audioEngine.ctx.currentTime);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  slider.addEventListener("input", () => setCutoff(Number(slider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || filterChain) return;
    const ctx = audioEngine.ctx;

    filterChain = createFilterChain(ctx, "highpass");
    filterChain.setFrequency(cutoff, ctx.currentTime, 0);
    filterChain.setQ(0.7071, ctx.currentTime, 0); // Butterworth-ish — flat passband, no resonant peak
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
