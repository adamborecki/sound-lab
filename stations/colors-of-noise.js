import { drawSpectrum, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "colors-of-noise";
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 20000;
const LOCAL_ANALYSER_FFT_SIZE = 8192;
const COMPLETE_AFTER_INTERACTIONS = 6;
const AXIS_LABELS = [20, 100, 1000, 10000];

const COLORS = [
  { id: "violet", label: "Violet", swatch: "#B685FF", note: "Rises fastest toward the highs." },
  { id: "blue", label: "Blue", swatch: "#6BB4FF", note: "Rises toward the highs." },
  { id: "white", label: "White", swatch: "#F3F4FB", note: "Flat — equal energy at every frequency." },
  { id: "pink", label: "Pink", swatch: "#FF9BC5", note: "Falls toward the highs. The common \"soothing\" noise." },
  { id: "red", label: "Red", swatch: "#FF6B6B", note: "Falls fastest — mostly low rumble." },
];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Named after light: violet light carries more energy than red light, and it's the same idea here — violet noise leans bright, red noise leans dark. Same randomness, different spectrum.</p>

    <div class="color-button-row" id="color-buttons"></div>

    <p class="color-note" id="color-note"></p>

    <canvas class="spectrum-canvas" id="noise-spectrum-canvas" width="600" height="220"
      role="img" aria-label="Live frequency spectrum of the selected noise color"></canvas>
    <div class="spectrum-axis" id="noise-spectrum-axis"></div>
  `;

  const buttonRow = container.querySelector("#color-buttons");
  const noteEl = container.querySelector("#color-note");
  const canvas = container.querySelector("#noise-spectrum-canvas");
  const axisEl = container.querySelector("#noise-spectrum-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    axisEl.appendChild(tick);
  }

  const buttons = new Map();
  for (const c of COLORS) {
    const btn = document.createElement("button");
    btn.className = "color-btn";
    btn.type = "button";
    btn.style.setProperty("--swatch", c.swatch);
    btn.innerHTML = `${waveIconSvg("noise")}<span>${c.label}</span>`;
    btn.addEventListener("click", () => selectColor(c));
    buttonRow.appendChild(btn);
    buttons.set(c.id, btn);
  }

  let voice = null;
  let localAnalyser = null;
  let stopViz = null;
  let current = COLORS[2]; // white
  let interactionCount = 0;
  const triedColors = new Set();

  function applySelection(c) {
    current = c;
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === c.id);
    noteEl.textContent = c.note;
    noteEl.style.color = c.swatch;
  }

  function maybeComplete() {
    if (triedColors.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function selectColor(c) {
    if (c.id === current.id && voice) return;
    applySelection(c);
    if (audioEngine.isStarted) {
      if (voice) voice.stop();
      voice = audioEngine.createNoiseVoice({ gain: 0.22, color: c.id });
    }
    triedColors.add(c.id);
    interactionCount += 1;
    recordInteraction(STATION_ID);
    maybeComplete();
  }

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createNoiseVoice({ gain: 0.22, color: current.id });
    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
    localAnalyser.smoothingTimeConstant = 0.7;
    audioEngine.masterGain.connect(localAnalyser);
    stopViz = drawSpectrum(canvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
  }

  applySelection(current);

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
    if (localAnalyser) audioEngine.masterGain.disconnect(localAnalyser);
  };
}
