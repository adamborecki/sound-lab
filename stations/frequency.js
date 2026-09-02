import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "frequency";
const MIN_HZ = 80;
const MAX_HZ = 4000;
const PRESETS = [100, 200, 440, 880, 1000, 4000];
const COMPLETE_AFTER_INTERACTIONS = 6;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Make the pitch higher. Then find one that feels very low.</p>

    <div class="big-readout" id="freq-readout">440 Hz</div>

    <input
      type="range"
      id="freq-slider"
      class="big-slider"
      min="${MIN_HZ}"
      max="${MAX_HZ}"
      value="440"
      step="1"
      aria-label="Frequency in Hertz"
    />

    <div class="numeric-row">
      <label for="freq-number">Exact value:</label>
      <input type="number" id="freq-number" min="${MIN_HZ}" max="${MAX_HZ}" value="440" />
      <span>Hz</span>
    </div>

    <div class="preset-row" id="preset-row"></div>

    <canvas class="waveform-canvas" id="freq-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the current tone"></canvas>
  `;

  const readout = container.querySelector("#freq-readout");
  const slider = container.querySelector("#freq-slider");
  const numberInput = container.querySelector("#freq-number");
  const presetRow = container.querySelector("#preset-row");
  const canvas = container.querySelector("#freq-canvas");

  for (const hz of PRESETS) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = formatHz(hz);
    btn.addEventListener("click", () => setFreq(hz));
    presetRow.appendChild(btn);
  }

  let voice = null;
  let freq = 440;
  let stopViz = null;
  let interactionCount = 0;

  function setFreq(hz) {
    freq = clamp(hz, MIN_HZ, MAX_HZ);
    slider.value = String(freq);
    numberInput.value = String(freq);
    readout.textContent = formatHz(freq);
    if (voice) voice.setFreq(freq);

    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  slider.addEventListener("input", () => setFreq(Number(slider.value)));
  numberInput.addEventListener("change", () => setFreq(Number(numberInput.value)));

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({ freq, type: "sine", gain: 0.25 });
    stopViz = drawWaveform(canvas, audioEngine.analyser, { color: accent });
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
