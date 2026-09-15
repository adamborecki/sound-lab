import { drawEnvelope, drawIdleMessage, createLevelFollower } from "../js/visualizers.js";
import { createLfo } from "../js/lfo.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "lfo-tremolo";
const TONE_HZ = 330;
const BASE_GAIN = 0.28;
const RATE_MIN = 0.5;
const RATE_MAX = 10;
const DEFAULT_RATE = 4;
const MIN_DEPTH = 0;
const MAX_DEPTH = 100;
const DEFAULT_DEPTH = 70;
const COMPLETE_AFTER_INTERACTIONS = 6;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Tremolo is an LFO wobbling <strong>volume</strong> — connected to the voice's gain instead
      of its pitch. A normal waveform view is too fast to show this (it only shows a few
      milliseconds); this graph instead tracks the actual level over several seconds so the
      wobble itself is visible.
    </p>

    <div class="osc-control">
      <div class="osc-control-label">Rate</div>
      <div class="big-readout" id="trem-rate-readout">${DEFAULT_RATE.toFixed(1)} Hz</div>
      <input type="range" id="trem-rate-slider" class="big-slider" min="${RATE_MIN}" max="${RATE_MAX}"
        step="0.1" value="${DEFAULT_RATE}" aria-label="Tremolo rate in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Depth</div>
      <div class="big-readout" id="trem-depth-readout">${DEFAULT_DEPTH}%</div>
      <input type="range" id="trem-depth-slider" class="big-slider" min="${MIN_DEPTH}" max="${MAX_DEPTH}"
        step="1" value="${DEFAULT_DEPTH}" aria-label="Tremolo depth percent" />
    </div>

    <div class="osc-control-label">Amplitude Level</div>
    <canvas class="spectrum-canvas" id="trem-canvas" width="600" height="200"
      role="img" aria-label="Live amplitude level showing the tremolo wobble"></canvas>
  `;

  const rateSlider = container.querySelector("#trem-rate-slider");
  const rateReadout = container.querySelector("#trem-rate-readout");
  const depthSlider = container.querySelector("#trem-depth-slider");
  const depthReadout = container.querySelector("#trem-depth-readout");
  const canvas = container.querySelector("#trem-canvas");

  let rate = DEFAULT_RATE;
  let depthPct = DEFAULT_DEPTH;
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

  function setDepth(pct, userInitiated) {
    depthPct = clamp(Math.round(pct), MIN_DEPTH, MAX_DEPTH);
    depthSlider.value = String(depthPct);
    depthReadout.textContent = `${depthPct}%`;
    if (lfo) lfo.setDepth((depthPct / 100) * BASE_GAIN, audioEngine.ctx.currentTime);
    if (userInitiated) registerInteraction();
  }

  rateSlider.addEventListener("input", () => setRate(Number(rateSlider.value), true));
  depthSlider.addEventListener("input", () => setDepth(Number(depthSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || osc) return;
    const ctx = audioEngine.ctx;

    osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = TONE_HZ;
    voiceGain = ctx.createGain();
    voiceGain.gain.value = BASE_GAIN;
    osc.connect(voiceGain).connect(audioEngine.masterGain);
    osc.start();

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 2048;
    voiceGain.connect(localAnalyser);

    lfo = createLfo(ctx, { rate, depth: (depthPct / 100) * BASE_GAIN });
    lfo.output.connect(voiceGain.gain);

    // BASE_GAIN * 2 is the loudest the gain can swing to (100% depth), so
    // dividing by it keeps the graph in 0-1 with the resting level at the
    // middle — wobbling visibly both up and down, not just off a 0 floor.
    const getLevel = createLevelFollower(localAnalyser);
    stopViz = drawEnvelope(canvas, () => getLevel() / (BASE_GAIN * 2), { color: accent });
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
