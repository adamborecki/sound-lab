import { drawEnvelope, drawIdleMessage } from "../js/visualizers.js";
import { createAdsrVoice } from "../js/adsr-voice.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "adsr-attack";
const MIN_ATTACK = 0.01;
const MAX_ATTACK = 2;
const DEFAULT_ATTACK = 0.3;
// Fixed so Attack is the only thing changing.
const FIXED_DECAY = 0.15;
const FIXED_SUSTAIN = 0.6;
const FIXED_RELEASE = 0.3;
const COMPLETE_AFTER_INTERACTIONS = 6;

function formatSeconds(s) {
  return `${s.toFixed(2)} s`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Attack is how long a note takes to reach full volume <em>after</em> you press — near-zero
      sounds like a pluck or a drum hit, longer sounds like a slow swell or a bowed string. Decay,
      sustain, and release are fixed here so attack is the only thing changing.
    </p>

    <button class="note-pad" id="attack-pad" type="button">Hold to Play</button>

    <div class="osc-control">
      <div class="osc-control-label">Attack Time</div>
      <div class="big-readout" id="attack-readout">${formatSeconds(DEFAULT_ATTACK)}</div>
      <input type="range" id="attack-slider" class="big-slider" min="${MIN_ATTACK}" max="${MAX_ATTACK}"
        value="${DEFAULT_ATTACK}" step="0.01" aria-label="Attack time in seconds" />
    </div>

    <div class="osc-control-label">Amplitude Envelope</div>
    <canvas class="spectrum-canvas" id="attack-canvas" width="600" height="180"
      role="img" aria-label="Live amplitude envelope, press and hold the pad to hear it"></canvas>
  `;

  const pad = container.querySelector("#attack-pad");
  const slider = container.querySelector("#attack-slider");
  const readout = container.querySelector("#attack-readout");
  const canvas = container.querySelector("#attack-canvas");

  let attack = DEFAULT_ATTACK;
  let voice = null;
  let stopViz = null;
  let interactionCount = 0;

  function applyParams() {
    if (!voice) return;
    voice.setParams({ attack, decay: FIXED_DECAY, sustain: FIXED_SUSTAIN, release: FIXED_RELEASE });
  }

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function setAttack(seconds, userInitiated) {
    attack = clamp(seconds, MIN_ATTACK, MAX_ATTACK);
    slider.value = String(attack);
    readout.textContent = formatSeconds(attack);
    applyParams();
    if (userInitiated) registerInteraction();
  }

  slider.addEventListener("input", () => setAttack(Number(slider.value), true));

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
