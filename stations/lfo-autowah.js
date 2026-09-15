import {
  drawSpectrogram,
  drawIdleMessage,
  buildSpectrogramFreqAxis,
} from "../js/visualizers.js";
import { createLfo } from "../js/lfo.js";
import { getLoopBuffer } from "../js/loop-source.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "lfo-autowah";
const WAH_CENTER = 1200;
const WAH_Q = 5;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 8000;
const AXIS_LABELS = [20, 100, 1000, 10000].filter((hz) => hz <= MAX_HZ_AXIS);
const RATE_MIN = 0.1;
const RATE_MAX = 4;
const DEFAULT_RATE = 0.5;
const MIN_DEPTH = 0;
const MAX_DEPTH = 1000;
const DEFAULT_DEPTH = 800;
const COMPLETE_AFTER_INTERACTIONS = 6;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Auto-wah is an LFO wobbling a <strong>filter's cutoff</strong> — the classic funk-guitar
      "wah" pedal, but with the pedal rocking back and forth on its own. Running it over the same
      synthesized loop from the filter stations so there's real rhythmic material for it to sweep.
    </p>

    <div class="osc-control">
      <div class="osc-control-label">Rate</div>
      <div class="big-readout" id="wah-rate-readout">${DEFAULT_RATE.toFixed(1)} Hz</div>
      <input type="range" id="wah-rate-slider" class="big-slider" min="${RATE_MIN}" max="${RATE_MAX}"
        step="0.1" value="${DEFAULT_RATE}" aria-label="Auto-wah rate in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Depth</div>
      <div class="big-readout" id="wah-depth-readout">${DEFAULT_DEPTH} Hz</div>
      <input type="range" id="wah-depth-slider" class="big-slider" min="${MIN_DEPTH}" max="${MAX_DEPTH}"
        step="10" value="${DEFAULT_DEPTH}" aria-label="Auto-wah depth in Hertz" />
    </div>

    <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
    <div class="spectrogram-row">
      <div class="spectrogram-freq-axis" id="wah-axis"></div>
      <canvas class="spectrum-canvas" id="wah-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram showing the wah filter sweep"></canvas>
    </div>
  `;

  const rateSlider = container.querySelector("#wah-rate-slider");
  const rateReadout = container.querySelector("#wah-rate-readout");
  const depthSlider = container.querySelector("#wah-depth-slider");
  const depthReadout = container.querySelector("#wah-depth-readout");
  const canvas = container.querySelector("#wah-canvas");
  const axisEl = container.querySelector("#wah-axis");

  buildSpectrogramFreqAxis(axisEl, AXIS_LABELS, MIN_HZ_AXIS, MAX_HZ_AXIS);

  let rate = DEFAULT_RATE;
  let depth = DEFAULT_DEPTH;
  let interactionCount = 0;

  let loopSource = null;
  let filterNode = null;
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
    if (!audioEngine.isStarted || loopSource) return;
    const ctx = audioEngine.ctx;

    filterNode = ctx.createBiquadFilter();
    filterNode.type = "bandpass";
    filterNode.Q.value = WAH_Q;
    filterNode.frequency.value = WAH_CENTER;
    filterNode.connect(audioEngine.masterGain);

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 4096;
    localAnalyser.smoothingTimeConstant = 0.4;
    filterNode.connect(localAnalyser);

    loopSource = ctx.createBufferSource();
    loopSource.loop = true;
    loopSource.connect(filterNode);
    getLoopBuffer(ctx).then((buffer) => {
      if (!loopSource) return; // unmounted before it loaded
      loopSource.buffer = buffer;
      loopSource.start();
    });

    lfo = createLfo(ctx, { rate, depth });
    lfo.output.connect(filterNode.frequency);

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
    if (loopSource) {
      try {
        loopSource.stop();
      } catch (e) {
        /* never started, or already stopped */
      }
      loopSource.disconnect();
    }
    if (filterNode) filterNode.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
