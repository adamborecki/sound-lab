import {
  drawSpectrogram,
  drawIdleMessage,
  buildSpectrogramFreqAxis,
} from "../js/visualizers.js";
import { createLfo } from "../js/lfo.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "lfo-vibrato";
const BASE_FREQ = 220;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 2000;
const AXIS_LABELS = [20, 100, 1000];
const RATE_MIN = 0.5;
const RATE_MAX = 10;
const DEFAULT_RATE = 5;
const MIN_DEPTH = 0;
const MAX_DEPTH = 60;
const DEFAULT_DEPTH = 20;
const COMPLETE_AFTER_INTERACTIONS = 6;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Vibrato is an LFO wobbling <strong>pitch</strong> — connected straight to the oscillator's
      frequency. Watch the whole harmonic stack rise and fall together in the spectrogram; that's
      the same fundamental-plus-harmonics relationship from Harmonics, just moving now.
    </p>

    <div class="osc-control">
      <div class="osc-control-label">Rate</div>
      <div class="big-readout" id="vib-rate-readout">${DEFAULT_RATE.toFixed(1)} Hz</div>
      <input type="range" id="vib-rate-slider" class="big-slider" min="${RATE_MIN}" max="${RATE_MAX}"
        step="0.1" value="${DEFAULT_RATE}" aria-label="Vibrato rate in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Depth</div>
      <div class="big-readout" id="vib-depth-readout">${DEFAULT_DEPTH} Hz</div>
      <input type="range" id="vib-depth-slider" class="big-slider" min="${MIN_DEPTH}" max="${MAX_DEPTH}"
        step="1" value="${DEFAULT_DEPTH}" aria-label="Vibrato depth in Hertz" />
    </div>

    <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
    <div class="spectrogram-row">
      <div class="spectrogram-freq-axis" id="vib-axis"></div>
      <canvas class="spectrum-canvas" id="vib-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram showing pitch vibrato"></canvas>
    </div>
  `;

  const rateSlider = container.querySelector("#vib-rate-slider");
  const rateReadout = container.querySelector("#vib-rate-readout");
  const depthSlider = container.querySelector("#vib-depth-slider");
  const depthReadout = container.querySelector("#vib-depth-readout");
  const canvas = container.querySelector("#vib-canvas");
  const axisEl = container.querySelector("#vib-axis");

  buildSpectrogramFreqAxis(axisEl, AXIS_LABELS, MIN_HZ_AXIS, MAX_HZ_AXIS);

  let rate = DEFAULT_RATE;
  let depth = DEFAULT_DEPTH;
  let interactionCount = 0;

  let osc = null;
  let voiceGain = null;
  let lfo = null;
  let localAnalyser = null;
  let stopViz = null;

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function setRate(hz, userInitiated) {
    rate = clamp(hz, RATE_MIN, RATE_MAX);
    rateSlider.value = String(rate);
    rateReadout.textContent = `${rate.toFixed(1)} Hz`;
    if (lfo) lfo.setRate(rate, audioEngine.ctx.currentTime);
    if (userInitiated) registerInteraction();
  }

  function setDepth(hz, userInitiated) {
    depth = clamp(Math.round(hz), MIN_DEPTH, MAX_DEPTH);
    depthSlider.value = String(depth);
    depthReadout.textContent = `${depth} Hz`;
    if (lfo) lfo.setDepth(depth, audioEngine.ctx.currentTime);
    if (userInitiated) registerInteraction();
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
    voiceGain.gain.value = 0.22;
    osc.connect(voiceGain).connect(audioEngine.masterGain);
    osc.start();

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 4096;
    localAnalyser.smoothingTimeConstant = 0.4;
    voiceGain.connect(localAnalyser);

    lfo = createLfo(ctx, { rate, depth });
    lfo.output.connect(osc.frequency);

    stopViz = drawSpectrogram(canvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
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
    if (localAnalyser) localAnalyser.disconnect();
  };
}
