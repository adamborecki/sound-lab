import { drawEnvelope, drawIdleMessage } from "../js/visualizers.js";
import { createAdsrVoice } from "../js/adsr-voice.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "adsr-sustain";
const MIN_SUSTAIN_PCT = 0;
const MAX_SUSTAIN_PCT = 100;
const DEFAULT_SUSTAIN_PCT = 50;
// Fixed so Sustain is the only thing changing — decay is long enough here
// that you can clearly see (and hear) the level settle onto whatever
// sustain you pick, instead of it happening too fast to notice.
const FIXED_ATTACK = 0.02;
const FIXED_DECAY = 0.4;
const FIXED_RELEASE = 0.3;
const COMPLETE_AFTER_INTERACTIONS = 6;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Sustain isn't a time — it's the level a held note settles at once decay finishes, for as
      long as you keep holding. Attack, decay, and release are fixed here so sustain level is the
      only thing changing.
    </p>

    <button class="note-pad" id="sustain-pad" type="button">Hold to Play</button>

    <div class="osc-control">
      <div class="osc-control-label">Sustain Level</div>
      <div class="big-readout" id="sustain-readout">${DEFAULT_SUSTAIN_PCT}%</div>
      <input type="range" id="sustain-slider" class="big-slider" min="${MIN_SUSTAIN_PCT}" max="${MAX_SUSTAIN_PCT}"
        value="${DEFAULT_SUSTAIN_PCT}" step="1" aria-label="Sustain level percent" />
    </div>

    <div class="osc-control-label">Amplitude Envelope</div>
    <canvas class="spectrum-canvas" id="sustain-canvas" width="600" height="180"
      role="img" aria-label="Live amplitude envelope, press and hold the pad to hear it"></canvas>
  `;

  const pad = container.querySelector("#sustain-pad");
  const slider = container.querySelector("#sustain-slider");
  const readout = container.querySelector("#sustain-readout");
  const canvas = container.querySelector("#sustain-canvas");

  let sustainPct = DEFAULT_SUSTAIN_PCT;
  let voice = null;
  let stopViz = null;
  let interactionCount = 0;

  function applyParams() {
    if (!voice) return;
    voice.setParams({
      attack: FIXED_ATTACK,
      decay: FIXED_DECAY,
      sustain: sustainPct / 100,
      release: FIXED_RELEASE,
    });
  }

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function setSustain(pct, userInitiated) {
    sustainPct = clamp(Math.round(pct), MIN_SUSTAIN_PCT, MAX_SUSTAIN_PCT);
    slider.value = String(sustainPct);
    readout.textContent = `${sustainPct}%`;
    applyParams();
    if (userInitiated) registerInteraction();
  }

  slider.addEventListener("input", () => setSustain(Number(slider.value), true));

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
