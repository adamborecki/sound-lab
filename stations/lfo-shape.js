import {
  drawWaveform,
  drawEnvelope,
  drawIdleMessage,
  createSignalSampler,
} from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { createLfo } from "../js/lfo.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "lfo-shape";
const RATE_MIN = 0.2;
const RATE_MAX = 6;
const DEFAULT_RATE = 1.5;
const MIN_DEPTH = 0;
const MAX_DEPTH = 100;
const DEFAULT_DEPTH = 80;
const LFO_HISTORY_SECONDS = 8;
const COMPLETE_AFTER_INTERACTIONS = 6;

// Rough perceived-loudness leveling, same values as Wave Shape Gallery —
// square/saw carry more harmonic energy than sine/triangle at the same
// peak amplitude.
const CARRIER_TYPES = [
  { type: "sine", label: "Sine", gain: 0.3 },
  { type: "triangle", label: "Triangle", gain: 0.26 },
  { type: "square", label: "Square", gain: 0.14 },
  { type: "sawtooth", label: "Sawtooth", gain: 0.15 },
];

const LFO_TYPES = [
  { type: "sine", label: "Sine" },
  { type: "triangle", label: "Triangle" },
  { type: "square", label: "Square" },
  { type: "sawtooth", label: "Sawtooth" },
];

const LFO_TYPE_NOTES = {
  sine: "A smooth, symmetric wobble — eases up, eases back down.",
  triangle: "A straight-line ramp both ways — linear up, linear down.",
  square: "No easing at all — snaps between two levels, a hard chop.",
  sawtooth: "Ramps one direction, then drops (or jumps) instantly back.",
};

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      "Waveform" means two different things at once here. The <strong>carrier</strong> is the
      oscillator you actually hear — its shape is the tone's timbre. The <strong>LFO</strong> is a
      second, much slower oscillator with its own separate shape — modulating the carrier's
      volume. Change each independently and watch both views below.
    </p>

    <div class="osc-control-label">Carrier Waveform (what you hear)</div>
    <div class="wave-button-row" id="shape-carrier-types"></div>

    <div class="osc-control-label">LFO Waveform (the shape of the wobble)</div>
    <div class="wave-button-row" id="shape-lfo-types"></div>
    <p class="prompt" id="shape-lfo-note"></p>

    <div class="control-row">
      <div class="control-compact">
        <div class="osc-control-label">Rate</div>
        <div class="compact-readout" id="shape-rate-readout">${DEFAULT_RATE.toFixed(1)} Hz</div>
        <input type="range" id="shape-rate-slider" class="compact-slider" min="${RATE_MIN}" max="${RATE_MAX}"
          step="0.1" value="${DEFAULT_RATE}" aria-label="LFO rate in Hertz" />
      </div>

      <div class="control-compact">
        <div class="osc-control-label">Depth</div>
        <div class="compact-readout" id="shape-depth-readout">${DEFAULT_DEPTH}%</div>
        <input type="range" id="shape-depth-slider" class="compact-slider" min="${MIN_DEPTH}" max="${MAX_DEPTH}"
          step="1" value="${DEFAULT_DEPTH}" aria-label="LFO depth percent" />
      </div>
    </div>

    <div class="osc-control-label">Carrier Waveform — audio-rate, a few milliseconds</div>
    <canvas class="waveform-canvas" id="shape-carrier-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the carrier oscillator, unaffected by the LFO"></canvas>

    <div class="osc-control-label">LFO Waveform — several seconds, the wobble itself</div>
    <canvas class="spectrum-canvas" id="shape-lfo-canvas" width="600" height="200"
      role="img" aria-label="The LFO's own waveform, scrolling over several seconds"></canvas>
  `;

  const carrierRow = container.querySelector("#shape-carrier-types");
  const lfoRow = container.querySelector("#shape-lfo-types");
  const lfoNote = container.querySelector("#shape-lfo-note");
  const rateSlider = container.querySelector("#shape-rate-slider");
  const rateReadout = container.querySelector("#shape-rate-readout");
  const depthSlider = container.querySelector("#shape-depth-slider");
  const depthReadout = container.querySelector("#shape-depth-readout");
  const carrierCanvas = container.querySelector("#shape-carrier-canvas");
  const lfoCanvas = container.querySelector("#shape-lfo-canvas");

  const carrierButtons = new Map();
  for (const c of CARRIER_TYPES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(c.type)}<span>${c.label}</span>`;
    btn.addEventListener("click", () => selectCarrier(c, true));
    carrierRow.appendChild(btn);
    carrierButtons.set(c.type, btn);
  }

  const lfoButtons = new Map();
  for (const l of LFO_TYPES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(l.type)}<span>${l.label}</span>`;
    btn.addEventListener("click", () => selectLfoType(l, true));
    lfoRow.appendChild(btn);
    lfoButtons.set(l.type, btn);
  }

  let carrier = CARRIER_TYPES[0];
  let lfoType = LFO_TYPES[0];
  let rate = DEFAULT_RATE;
  let depthPct = DEFAULT_DEPTH;
  let interactionCount = 0;
  const triedCarriers = new Set();
  const triedLfoTypes = new Set();

  let osc = null;
  let voiceGain = null;
  let lfo = null;
  let carrierAnalyser = null;
  let lfoAnalyser = null;
  let stopCarrierViz = null;
  let stopLfoViz = null;

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (triedCarriers.size >= 2 && triedLfoTypes.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function depthValue() {
    return (depthPct / 100) * carrier.gain;
  }

  function applyDepth() {
    if (lfo) lfo.setDepth(depthValue(), audioEngine.ctx.currentTime);
  }

  function selectCarrier(c, userInitiated) {
    carrier = c;
    for (const [type, btn] of carrierButtons) btn.classList.toggle("active", type === c.type);
    if (voiceGain) voiceGain.gain.setTargetAtTime(carrier.gain, audioEngine.ctx.currentTime, 0.02);
    if (osc) osc.type = carrier.type;
    applyDepth();
    triedCarriers.add(c.type);
    if (userInitiated) registerInteraction();
  }

  function selectLfoType(l, userInitiated) {
    lfoType = l;
    for (const [type, btn] of lfoButtons) btn.classList.toggle("active", type === l.type);
    lfoNote.textContent = LFO_TYPE_NOTES[l.type];
    if (osc && lfo) {
      // Swap the LFO oscillator's type by rebuilding it — createLfo doesn't
      // expose a live type setter, and this only happens on a deliberate
      // button press, not per-frame.
      lfo.stop();
      lfo = createLfo(audioEngine.ctx, { rate, depth: depthValue(), type: lfoType.type });
      lfo.output.connect(voiceGain.gain);
      lfo.output.connect(lfoAnalyser);
    }
    triedLfoTypes.add(l.type);
    if (userInitiated) registerInteraction();
  }

  function setRate(hz, userInitiated) {
    rate = clamp(hz, RATE_MIN, RATE_MAX);
    rateSlider.value = String(rate);
    rateReadout.textContent = `${rate.toFixed(1)} Hz`;
    if (lfo) lfo.setRate(rate, audioEngine.ctx.currentTime);
    if (userInitiated) registerInteraction();
  }

  function setDepth(pct, userInitiated) {
    depthPct = clamp(Math.round(pct), MIN_DEPTH, MAX_DEPTH);
    depthSlider.value = String(depthPct);
    depthReadout.textContent = `${depthPct}%`;
    applyDepth();
    if (userInitiated) registerInteraction();
  }

  rateSlider.addEventListener("input", () => setRate(Number(rateSlider.value), true));
  depthSlider.addEventListener("input", () => setDepth(Number(depthSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || osc) return;
    const ctx = audioEngine.ctx;

    osc = ctx.createOscillator();
    osc.type = carrier.type;
    osc.frequency.value = 220;

    voiceGain = ctx.createGain();
    voiceGain.gain.value = carrier.gain;
    osc.connect(voiceGain).connect(audioEngine.masterGain);
    osc.start();

    // Tapped straight off the oscillator, before the tremolo gain — so the
    // carrier view always shows the pure, unmodulated shape, regardless of
    // how deep the LFO is currently wobbling the volume.
    carrierAnalyser = ctx.createAnalyser();
    carrierAnalyser.fftSize = 2048;
    osc.connect(carrierAnalyser);

    lfoAnalyser = ctx.createAnalyser();
    lfoAnalyser.fftSize = 256;

    lfo = createLfo(ctx, { rate, depth: depthValue(), type: lfoType.type });
    lfo.output.connect(voiceGain.gain);
    lfo.output.connect(lfoAnalyser);

    stopCarrierViz = drawWaveform(carrierCanvas, carrierAnalyser, { color: accent });

    const sampleLfo = createSignalSampler(lfoAnalyser);
    stopLfoViz = drawEnvelope(
      lfoCanvas,
      () => {
        const d = depthValue();
        return d > 0 ? sampleLfo() / d / 2 + 0.5 : 0.5;
      },
      { color: accent, historySeconds: LFO_HISTORY_SECONDS },
    );
  }

  selectCarrier(carrier, false);
  selectLfoType(lfoType, false);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(carrierCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(lfoCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopCarrierViz) stopCarrierViz();
    if (stopLfoViz) stopLfoViz();
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
    if (carrierAnalyser) carrierAnalyser.disconnect();
    if (lfoAnalyser) lfoAnalyser.disconnect();
  };
}
