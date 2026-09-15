import { drawEnvelope, drawIdleMessage } from "../js/visualizers.js";
import { createAdsrVoice } from "../js/adsr-voice.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "adsr-release";
const MIN_RELEASE = 0.05;
const MAX_RELEASE = 3;
const DEFAULT_RELEASE = 0.6;
// Fixed so Release is the only thing changing — fast attack/decay gets you
// to the sustain level almost instantly, so nearly everything you hear
// after letting go is the release you're actually adjusting.
const FIXED_ATTACK = 0.02;
const FIXED_DECAY = 0.15;
const FIXED_SUSTAIN = 0.6;
const COMPLETE_AFTER_INTERACTIONS = 6;

function formatSeconds(s) {
  return `${s.toFixed(2)} s`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Release is how long a note takes to fade to silence <em>after</em> you let go — not while
      you're holding it. Attack and decay are fixed fast here on purpose, so nearly everything
      you hear after release is the tail you're adjusting.
    </p>

    <button class="note-pad" id="release-pad" type="button">Hold to Play</button>

    <div class="osc-control">
      <div class="osc-control-label">Release Time</div>
      <div class="big-readout" id="release-readout">${formatSeconds(DEFAULT_RELEASE)}</div>
      <input type="range" id="release-slider" class="big-slider" min="${MIN_RELEASE}" max="${MAX_RELEASE}"
        value="${DEFAULT_RELEASE}" step="0.01" aria-label="Release time in seconds" />
    </div>

    <div class="osc-control-label">Amplitude Envelope</div>
    <canvas class="spectrum-canvas" id="release-canvas" width="600" height="180"
      role="img" aria-label="Live amplitude envelope, press and hold the pad to hear it"></canvas>
  `;

  const pad = container.querySelector("#release-pad");
  const slider = container.querySelector("#release-slider");
  const readout = container.querySelector("#release-readout");
  const canvas = container.querySelector("#release-canvas");

  let release = DEFAULT_RELEASE;
  let voice = null;
  let stopViz = null;
  let interactionCount = 0;

  function applyParams() {
    if (!voice) return;
    voice.setParams({ attack: FIXED_ATTACK, decay: FIXED_DECAY, sustain: FIXED_SUSTAIN, release });
  }

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function setRelease(seconds, userInitiated) {
    release = clamp(seconds, MIN_RELEASE, MAX_RELEASE);
    slider.value = String(release);
    readout.textContent = formatSeconds(release);
    applyParams();
    if (userInitiated) registerInteraction();
  }

  slider.addEventListener("input", () => setRelease(Number(slider.value), true));

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
