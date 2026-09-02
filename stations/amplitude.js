import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "amplitude";
const FIXED_HZ = 300;
const MAX_GAIN = 0.4; // keep headroom below the master's own ceiling
const COMPLETE_AFTER_INTERACTIONS = 6;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Change the loudness without changing the pitch. Frequency stays locked at ${FIXED_HZ} Hz.</p>

    <div class="big-readout" id="amp-readout">70%</div>

    <input
      type="range"
      id="amp-slider"
      class="big-slider"
      min="0"
      max="100"
      value="70"
      step="1"
      aria-label="Amplitude percent"
    />

    <div class="meter-track" aria-hidden="true">
      <div class="meter-fill" id="amp-meter"></div>
    </div>

    <canvas class="waveform-canvas" id="amp-canvas" width="600" height="180"
      role="img" aria-label="Live waveform showing amplitude as wave height"></canvas>
  `;

  const readout = container.querySelector("#amp-readout");
  const slider = container.querySelector("#amp-slider");
  const meter = container.querySelector("#amp-meter");
  const canvas = container.querySelector("#amp-canvas");

  let voice = null;
  let stopViz = null;
  let level = 70;
  let interactionCount = 0;

  function setLevel(pct, userInitiated = false) {
    level = clamp(pct, 0, 100);
    slider.value = String(level);
    readout.textContent = `${level}%`;
    meter.style.width = `${level}%`;
    if (voice) voice.setGain((level / 100) * MAX_GAIN);

    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  slider.addEventListener("input", () => setLevel(Number(slider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({
      freq: FIXED_HZ,
      type: "sine",
      gain: (level / 100) * MAX_GAIN,
    });
    stopViz = drawWaveform(canvas, audioEngine.analyser, { color: accent });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  setLevel(level);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (voice) voice.stop();
  };
}
