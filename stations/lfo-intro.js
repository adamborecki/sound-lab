import {
  drawSpectrogram,
  drawEnvelope,
  drawIdleMessage,
  buildSpectrogramFreqAxis,
  createLevelFollower,
} from "../js/visualizers.js";
import { createLfo } from "../js/lfo.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "lfo-intro";
const BASE_FREQ = 220;
const BASE_GAIN = 0.25;
const WAH_CENTER = 1200;
const WAH_Q = 4;
const BYPASS_CUTOFF = 18000;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 4000;
const AXIS_LABELS = [20, 100, 1000];
const RATE_MIN = 0.2;
const RATE_MAX = 8;
const DEFAULT_RATE = 3;
const COMPLETE_AFTER_INTERACTIONS = 6;

const TARGETS = [
  { id: "vibrato", label: "Vibrato (Pitch)", unit: "Hz", min: 0, max: 40, def: 15, viz: "spectrogram" },
  { id: "tremolo", label: "Tremolo (Amplitude)", unit: "%", min: 0, max: 100, def: 60, viz: "envelope" },
  { id: "autowah", label: "Auto-Wah (Filter)", unit: "Hz", min: 0, max: 1000, def: 800, viz: "spectrogram" },
];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      An LFO — <em>low-frequency oscillator</em> — is just another oscillator, but too slow to
      hear as a pitch (usually under ~10 Hz). Instead of listening to it directly, you use it to
      wobble some <em>other</em> parameter: pitch, volume, or a filter's cutoff. Rate is how fast
      it wobbles; depth is how far.
    </p>

    <div class="preset-row" id="lfo-targets"></div>

    <div class="osc-control">
      <div class="osc-control-label">Rate</div>
      <div class="big-readout" id="lfo-rate-readout">${DEFAULT_RATE.toFixed(1)} Hz</div>
      <input type="range" id="lfo-rate-slider" class="big-slider" min="${RATE_MIN}" max="${RATE_MAX}"
        step="0.1" value="${DEFAULT_RATE}" aria-label="LFO rate in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label" id="lfo-depth-label">Depth</div>
      <div class="big-readout" id="lfo-depth-readout"></div>
      <input type="range" id="lfo-depth-slider" class="big-slider" step="1" aria-label="LFO depth" />
    </div>

    <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
    <div class="spectrogram-row" id="lfo-spectrogram-wrap">
      <div class="spectrogram-freq-axis" id="lfo-spectrogram-axis"></div>
      <canvas class="spectrum-canvas" id="lfo-spectrogram-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram showing the LFO's effect over time"></canvas>
    </div>

    <div class="osc-control-label" id="lfo-envelope-label" hidden>Amplitude Envelope</div>
    <canvas class="spectrum-canvas" id="lfo-envelope-canvas" width="600" height="220" hidden
      role="img" aria-label="Live amplitude level showing the tremolo wobble"></canvas>
  `;

  const targetRow = container.querySelector("#lfo-targets");
  const rateSlider = container.querySelector("#lfo-rate-slider");
  const rateReadout = container.querySelector("#lfo-rate-readout");
  const depthLabel = container.querySelector("#lfo-depth-label");
  const depthSlider = container.querySelector("#lfo-depth-slider");
  const depthReadout = container.querySelector("#lfo-depth-readout");
  const spectrogramWrap = container.querySelector("#lfo-spectrogram-wrap");
  const spectrogramCanvas = container.querySelector("#lfo-spectrogram-canvas");
  const spectrogramAxisEl = container.querySelector("#lfo-spectrogram-axis");
  const envelopeLabel = container.querySelector("#lfo-envelope-label");
  const envelopeCanvas = container.querySelector("#lfo-envelope-canvas");

  buildSpectrogramFreqAxis(spectrogramAxisEl, AXIS_LABELS, MIN_HZ_AXIS, MAX_HZ_AXIS);

  const buttons = new Map();
  for (const t of TARGETS) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = t.label;
    btn.addEventListener("click", () => selectTarget(t.id, true));
    targetRow.appendChild(btn);
    buttons.set(t.id, btn);
  }

  let current = TARGETS[0];
  let rate = DEFAULT_RATE;
  const depthByTarget = {};
  for (const t of TARGETS) depthByTarget[t.id] = t.def;
  let interactionCount = 0;
  const triedTargets = new Set();

  let osc = null;
  let voiceGain = null;
  let filterNode = null;
  let lfo = null;
  let localAnalyser = null;
  let stopSpectrogramViz = null;
  let stopEnvelopeViz = null;

  function maybeComplete() {
    if (triedTargets.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function applySelectionUI(t) {
    current = t;
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === t.id);
    depthLabel.textContent = `Depth (${t.label.split(" ")[0]})`;
    depthSlider.min = String(t.min);
    depthSlider.max = String(t.max);
    const d = depthByTarget[t.id];
    depthSlider.value = String(d);
    depthReadout.textContent = t.unit === "%" ? `${d}%` : `${d} Hz`;
    spectrogramWrap.hidden = t.viz !== "spectrogram";
    spectrogramWrap.previousElementSibling.hidden = t.viz !== "spectrogram";
    envelopeLabel.hidden = t.viz !== "envelope";
    envelopeCanvas.hidden = t.viz !== "envelope";
  }

  function applyAudioGraph() {
    if (!osc) return;
    const ctx = audioEngine.ctx;
    const now = ctx.currentTime;

    if (current.id === "autowah") {
      filterNode.type = "bandpass";
      filterNode.Q.setTargetAtTime(WAH_Q, now, 0.02);
      filterNode.frequency.setTargetAtTime(WAH_CENTER, now, 0.02);
    } else {
      filterNode.type = "lowpass";
      filterNode.Q.setTargetAtTime(0.7071, now, 0.02);
      filterNode.frequency.setTargetAtTime(BYPASS_CUTOFF, now, 0.02);
    }

    lfo.output.disconnect();
    if (current.id === "vibrato") lfo.output.connect(osc.frequency);
    else if (current.id === "tremolo") lfo.output.connect(voiceGain.gain);
    else lfo.output.connect(filterNode.frequency);

    lfo.setRate(rate, now);
    const d = depthByTarget[current.id];
    const scaledDepth = current.id === "tremolo" ? (d / 100) * BASE_GAIN : d;
    lfo.setDepth(scaledDepth, now);
  }

  function selectTarget(id, userInitiated) {
    const t = TARGETS.find((x) => x.id === id);
    applySelectionUI(t);
    applyAudioGraph();
    triedTargets.add(id);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setRate(hz, userInitiated) {
    rate = clamp(hz, RATE_MIN, RATE_MAX);
    rateSlider.value = String(rate);
    rateReadout.textContent = `${rate.toFixed(1)} Hz`;
    if (lfo) lfo.setRate(rate, audioEngine.ctx.currentTime);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setDepth(value, userInitiated) {
    const d = clamp(Math.round(value), current.min, current.max);
    depthByTarget[current.id] = d;
    depthSlider.value = String(d);
    depthReadout.textContent = current.unit === "%" ? `${d}%` : `${d} Hz`;
    if (lfo) {
      const scaledDepth = current.id === "tremolo" ? (d / 100) * BASE_GAIN : d;
      lfo.setDepth(scaledDepth, audioEngine.ctx.currentTime);
    }
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  rateSlider.addEventListener("input", () => setRate(Number(rateSlider.value), true));
  depthSlider.addEventListener("input", () => setDepth(Number(depthSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || osc) return;
    const ctx = audioEngine.ctx;

    osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = BASE_FREQ;

    voiceGain = ctx.createGain();
    voiceGain.gain.value = BASE_GAIN;

    filterNode = ctx.createBiquadFilter();
    filterNode.type = "lowpass";
    filterNode.frequency.value = BYPASS_CUTOFF;

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 4096;
    localAnalyser.smoothingTimeConstant = 0.4;

    osc.connect(voiceGain).connect(filterNode);
    filterNode.connect(audioEngine.masterGain);
    filterNode.connect(localAnalyser);
    osc.start();

    lfo = createLfo(ctx, { rate });

    stopSpectrogramViz = drawSpectrogram(spectrogramCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
    // See createLevelFollower's own comment: voiceGain.gain.value can't
    // reflect the LFO's audio-rate contribution (only scripted automation
    // shows up there), so the envelope graph needs real samples instead.
    const getLevel = createLevelFollower(localAnalyser);
    stopEnvelopeViz = drawEnvelope(envelopeCanvas, () => getLevel() / (BASE_GAIN * 2), {
      color: accent,
    });

    applyAudioGraph();
  }

  applySelectionUI(current);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(spectrogramCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(envelopeCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopSpectrogramViz) stopSpectrogramViz();
    if (stopEnvelopeViz) stopEnvelopeViz();
    if (lfo) lfo.stop();
    if (osc) {
      try {
        osc.stop();
      } catch (e) {
        /* already stopped */
      }
      osc.disconnect();
    }
    if (voiceGain) voiceGain.disconnect();
    if (filterNode) filterNode.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
