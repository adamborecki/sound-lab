import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "periodic";
const FIXED_HZ = 300;
const MIN_WINDOW = 200; // samples — zoomed in: a couple of cycles, clean shape
const MAX_WINDOW = 16000; // samples — zoomed out: dozens of cycles, reads as a blur
// The shared analyser (used everywhere else) is sized for a handful of
// cycles and can't hold a window this wide, so this station taps its own.
const LOCAL_ANALYSER_FFT_SIZE = 32768;
const COMPLETE_AFTER_INTERACTIONS = 6;

const SOURCES = [
  { id: "sine", label: "Sine", periodic: true, icon: "sine" },
  { id: "square", label: "Square", periodic: true, icon: "square" },
  { id: "white", label: "White Noise", periodic: false, icon: "noise", color: "white" },
  { id: "pink", label: "Pink Noise", periodic: false, icon: "noise", color: "pink" },
];

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Zoom into the waveform. Does it repeat?</p>

    <div class="wave-button-row" id="source-buttons"></div>

    <p class="periodic-status" id="periodic-status"></p>

    <div class="numeric-row">
      <span id="zoom-label">Zoom</span>
      <span id="zoom-readout">— ms</span>
    </div>
    <input
      type="range"
      id="zoom-slider"
      class="big-slider"
      min="0"
      max="100"
      value="0"
      step="1"
      aria-label="Zoom into the waveform"
    />

    <canvas class="waveform-canvas" id="periodic-canvas" width="600" height="180"
      role="img" aria-label="Waveform of the selected sound"></canvas>

    <div class="periodic-definitions">
      <div class="periodic-def-card">
        <h3>Periodic</h3>
        <ul>
          <li>Repeats (zoom in to see it)</li>
          <li>Has a pitch</li>
        </ul>
      </div>
      <div class="periodic-def-card periodic-def-card-noise">
        <h3>Aperiodic</h3>
        <ul>
          <li>Never repeats</li>
          <li>No pitch — "noise"</li>
        </ul>
      </div>
    </div>
  `;

  const buttonRow = container.querySelector("#source-buttons");
  const statusEl = container.querySelector("#periodic-status");
  const zoomSlider = container.querySelector("#zoom-slider");
  const zoomReadout = container.querySelector("#zoom-readout");
  const canvas = container.querySelector("#periodic-canvas");

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
  let windowSamples = MAX_WINDOW;
  let interactionCount = 0;
  const triedSources = new Set();

  function updateStatus() {
    statusEl.textContent = current.periodic ? "Periodic" : "Aperiodic — noise";
    statusEl.classList.toggle("aperiodic", !current.periodic);
  }

  function applySelection(src) {
    current = src;
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === src.id);
    updateStatus();
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

  function updateZoomReadout() {
    const sampleRate = audioEngine.ctx ? audioEngine.ctx.sampleRate : 44100;
    const ms = (windowSamples / sampleRate) * 1000;
    zoomReadout.textContent = `${ms.toFixed(1)} ms`;
  }

  function setZoom(pct, userInitiated = false) {
    const clamped = clamp(pct, 0, 100);
    zoomSlider.value = String(clamped);
    // Log-interpolated: the range spans 80x (200 to 16000 samples), so a
    // linear slider would spend nearly its whole travel at "very zoomed
    // out" with all the actual zooming crammed into the last few percent.
    const t = clamped / 100;
    windowSamples = Math.round(MAX_WINDOW * Math.pow(MIN_WINDOW / MAX_WINDOW, t));
    updateZoomReadout();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  zoomSlider.addEventListener("input", () => setZoom(Number(zoomSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = createVoiceFor(current);
    // Tapped from the master chain (not any one voice) so it keeps working
    // across source switches without needing to be rewired each time.
    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
    audioEngine.masterGain.connect(localAnalyser);
    stopViz = drawWaveform(canvas, localAnalyser, {
      color: accent,
      windowSamples: () => windowSamples,
    });
  }

  applySelection(current);
  setZoom(0);

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
