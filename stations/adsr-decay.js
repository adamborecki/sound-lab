import { drawEnvelope, drawIdleMessage } from "../js/visualizers.js";
import { createAdsrVoice } from "../js/adsr-voice.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "adsr-decay";
const MIN_DECAY = 0.05;
const MAX_DECAY = 2;
const DEFAULT_DECAY = 0.4;
// Fixed so Decay is the only thing changing — sustain is well below peak
// here so the drop from peak to sustain is actually visible/audible,
// instead of decay ending too close to peak to notice.
const FIXED_ATTACK = 0.02;
const FIXED_SUSTAIN = 0.4;
const FIXED_RELEASE = 0.3;
const COMPLETE_AFTER_INTERACTIONS = 6;

function formatSeconds(s) {
  return `${s.toFixed(2)} s`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Decay is how long a note takes to fall from its peak down to the sustain level, right after
      attack finishes. Attack, sustain, and release are fixed here so decay is the only thing
      changing.
    </p>

    <button class="note-pad" id="decay-pad" type="button">Hold to Play</button>

    <div class="osc-control">
      <div class="osc-control-label">Decay Time</div>
      <div class="big-readout" id="decay-readout">${formatSeconds(DEFAULT_DECAY)}</div>
      <input type="range" id="decay-slider" class="big-slider" min="${MIN_DECAY}" max="${MAX_DECAY}"
        value="${DEFAULT_DECAY}" step="0.01" aria-label="Decay time in seconds" />
    </div>

    <div class="osc-control-label">Amplitude Envelope</div>
    <canvas class="spectrum-canvas" id="decay-canvas" width="600" height="180"
      role="img" aria-label="Live amplitude envelope, press and hold the pad to hear it"></canvas>
  `;

  const pad = container.querySelector("#decay-pad");
  const slider = container.querySelector("#decay-slider");
  const readout = container.querySelector("#decay-readout");
  const canvas = container.querySelector("#decay-canvas");

  let decay = DEFAULT_DECAY;
  let voice = null;
  let stopViz = null;
  let interactionCount = 0;

  function applyParams() {
    if (!voice) return;
    voice.setParams({ attack: FIXED_ATTACK, decay, sustain: FIXED_SUSTAIN, release: FIXED_RELEASE });
  }

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function setDecay(seconds, userInitiated) {
    decay = clamp(seconds, MIN_DECAY, MAX_DECAY);
    slider.value = String(decay);
    readout.textContent = formatSeconds(decay);
    applyParams();
    if (userInitiated) registerInteraction();
  }

  slider.addEventListener("input", () => setDecay(Number(slider.value), true));

  function press(e) {
    if (!audioEngine.isStarted || !voice) return;
    pad.setPointerCapture(e.pointerId);
    pad.classList.add("held");
    voice.noteOn();
    registerInteraction();
  }

  function release_(e) {
    pad.classList.remove("held");
    if (voice) voice.noteOff();
  }

  pad.addEventListener("pointerdown", press);
  pad.addEventListener("pointerup", release_);
  pad.addEventListener("pointercancel", release_);

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = createAdsrVoice(audioEngine.ctx, { peak: 0.3 });
    applyParams();
    voice.output.connect(audioEngine.masterGain);
    stopViz = drawEnvelope(canvas, voice.getLevel, { color: accent });
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
    if (voice) voice.stop();
  };
}
