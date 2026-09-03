import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "polarity";
const FIXED_HZ = 220;
const VOICE_GAIN = 0.25;
// Slow on purpose — this is the whole demonstration. A quick snap would
// just look like a click; a ~1s glide through zero makes it obvious this
// is a continuous multiply-by-negative-one, not a sideways shift.
const FLIP_RAMP_SECONDS = 0.35;
const COMPLETE_AFTER_INTERACTIONS = 4;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Flipping polarity means multiplying the whole wave by −1 — same shape, same size, just upside down.
      No sideways shift like the Phase station; it just shrinks through silence and grows back inverted.
    </p>

    <button class="btn btn-start polarity-toggle" id="polarity-toggle" type="button">
      <span class="polarity-icon" id="polarity-icon" aria-hidden="true">▲</span>
      <span id="polarity-toggle-label">Invert Polarity</span>
    </button>

    <p class="polarity-state" id="polarity-state">Normal (×1)</p>

    <canvas class="waveform-canvas" id="polarity-canvas" width="600" height="180"
      role="img" aria-label="Live waveform, flips upside down when polarity is inverted"></canvas>

    <p class="polarity-note">
      Notice you can't hear any difference — a single tone's polarity is inaudible on its own. It only
      matters once you combine it with something else (see Constructive / Destructive Interference).
    </p>
  `;

  const toggleBtn = container.querySelector("#polarity-toggle");
  const icon = container.querySelector("#polarity-icon");
  const label = container.querySelector("#polarity-toggle-label");
  const stateEl = container.querySelector("#polarity-state");
  const canvas = container.querySelector("#polarity-canvas");

  let voice = null;
  let stopViz = null;
  let refOsc = null;
  let refGain = null;
  let refAnalyser = null;
  let inverted = false;
  let interactionCount = 0;

  function setInverted(next, userInitiated = false) {
    inverted = next;
    icon.classList.toggle("flipped", inverted);
    label.textContent = inverted ? "Restore Normal Polarity" : "Invert Polarity";
    stateEl.textContent = inverted ? "Inverted (×−1)" : "Normal (×1)";
    stateEl.classList.toggle("inverted", inverted);
    toggleBtn.setAttribute("aria-pressed", inverted ? "true" : "false");
    if (voice) {
      voice.setGain(inverted ? -VOICE_GAIN : VOICE_GAIN, FLIP_RAMP_SECONDS);
    }
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  toggleBtn.addEventListener("click", () => setInverted(!inverted, true));

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    const ctx = audioEngine.ctx;

    voice = audioEngine.createVoice({
      freq: FIXED_HZ,
      type: "sine",
      gain: inverted ? -VOICE_GAIN : VOICE_GAIN,
    });

    // A silent (not connected to the output), always-normal-polarity
    // reference tone at the same frequency, started in the same instant —
    // used only to find a stable trigger point. Without this, drawWaveform
    // self-triggers to whatever rising zero-crossing IT finds in the
    // (possibly inverted) signal, and a sine's shape from its own trigger
    // point looks identical whether the sign is + or -, so the entire
    // flip would be invisible on screen despite being real in the audio.
    refOsc = ctx.createOscillator();
    refOsc.type = "sine";
    refOsc.frequency.value = FIXED_HZ;
    refGain = ctx.createGain();
    refGain.gain.value = 0.3;
    refOsc.connect(refGain);
    refAnalyser = ctx.createAnalyser();
    refAnalyser.fftSize = 2048;
    refGain.connect(refAnalyser);
    refOsc.start();

    stopViz = drawWaveform(canvas, audioEngine.analyser, {
      color: accent,
      ampScale: 3,
      triggerSource: refAnalyser,
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
    if (voice) voice.stop();
    if (refOsc) {
      try {
        refOsc.stop();
      } catch (e) {
        /* already stopped */
      }
      refOsc.disconnect();
      refGain.disconnect();
      refAnalyser.disconnect();
    }
  };
}
