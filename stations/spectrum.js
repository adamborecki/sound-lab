import { drawSpectrum, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "spectrum";
const FIXED_HZ = 220;
const MIN_HZ = 20;
const MAX_HZ = 20000;
const LOCAL_ANALYSER_FFT_SIZE = 8192;
const COMPLETE_AFTER_INTERACTIONS = 6;
const AXIS_LABELS = [20, 100, 1000, 10000];

const SOURCES = [
  { id: "sine", label: "Sine", icon: "sine" },
  { id: "square", label: "Square", icon: "square" },
  { id: "sawtooth", label: "Sawtooth", icon: "sawtooth" },
  { id: "white", label: "White Noise", icon: "noise", color: "white" },
  { id: "pink", label: "Pink Noise", icon: "noise", color: "pink" },
];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Same sounds, a different view: frequency instead of time. Each bar is one pitch — its height is how much of that pitch is present.</p>

    <div class="wave-button-row" id="source-buttons"></div>

    <canvas class="spectrum-canvas" id="spectrum-canvas" width="600" height="220"
      role="img" aria-label="Live frequency spectrum of the selected sound"></canvas>

    <div class="spectrum-axis" id="spectrum-axis"></div>
  `;

  const buttonRow = container.querySelector("#source-buttons");
  const canvas = container.querySelector("#spectrum-canvas");
  const axisEl = container.querySelector("#spectrum-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ, MAX_HZ) * 100}%`;
    axisEl.appendChild(tick);
  }

  const buttons = new Map();
  for (const src of SOURCES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(src.icon)}<span>${src.label}</span>`;
    btn.addEventListener("click", () => selectSource(src));
    buttonRow.appendChild(btn);
    buttons.set(src.id, btn);
  }

  let voice = null;
  let localAnalyser = null;
  let stopViz = null;
  let current = SOURCES[0];
  let interactionCount = 0;
  const triedSources = new Set();

  function applySelection(src) {
    current = src;
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === src.id);
  }

  function createVoiceFor(src) {
    if (src.color) return audioEngine.createNoiseVoice({ gain: 0.2, color: src.color });
    return audioEngine.createVoice({ freq: FIXED_HZ, type: src.id, gain: 0.25 });
  }

  function maybeComplete() {
    if (triedSources.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function selectSource(src) {
    if (src.id === current.id && voice) return;
    applySelection(src);
    if (audioEngine.isStarted) {
      if (voice) voice.stop();
      voice = createVoiceFor(src);
    }
    triedSources.add(src.id);
    interactionCount += 1;
    recordInteraction(STATION_ID);
    maybeComplete();
  }

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = createVoiceFor(current);
    // Own analyser (not the shared one) so its fftSize/smoothing can be
    // tuned for frequency resolution without affecting every other
    // station's time-domain view.
    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
    localAnalyser.smoothingTimeConstant = 0.7;
    audioEngine.masterGain.connect(localAnalyser);
    stopViz = drawSpectrum(canvas, localAnalyser, { color: accent, minHz: MIN_HZ, maxHz: MAX_HZ });
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
