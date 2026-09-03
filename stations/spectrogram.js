import { drawSpectrogram, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "spectrogram";
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 20000;
const MIN_TONE_HZ = 100;
const MAX_TONE_HZ = 8000;
const LOCAL_ANALYSER_FFT_SIZE = 4096;
const COMPLETE_AFTER_INTERACTIONS = 6;
const AXIS_LABELS = [20, 100, 1000, 10000];

const SOURCES = [
  { id: "sine", label: "Sine", icon: "sine" },
  { id: "triangle", label: "Triangle", icon: "triangle" },
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
    <p class="prompt">A spectrogram is frequency (up/down) vs. time (left → right), with loudness shown as brightness. Sine sweeps a single line; square, triangle, and sawtooth each sweep a whole stack of harmonics together.</p>

    <div class="wave-button-row" id="sg-sources"></div>

    <div class="sg-freq-control" id="sg-freq-control">
      <div class="big-readout" id="sg-freq-readout">440 Hz</div>
      <input type="range" id="sg-freq-slider" class="big-slider" min="${MIN_TONE_HZ}" max="${MAX_TONE_HZ}" value="440" step="1"
        aria-label="Fundamental frequency in Hertz" />
    </div>

    <canvas class="spectrum-canvas" id="sg-canvas" width="600" height="240"
      role="img" aria-label="Scrolling spectrogram — frequency vs time, brightness is loudness"></canvas>
    <div class="spectrum-axis" id="sg-axis"></div>
  `;

  const sourceRow = container.querySelector("#sg-sources");
  const freqControl = container.querySelector("#sg-freq-control");
  const freqReadout = container.querySelector("#sg-freq-readout");
  const freqSlider = container.querySelector("#sg-freq-slider");
  const canvas = container.querySelector("#sg-canvas");
  const axisEl = container.querySelector("#sg-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    axisEl.appendChild(tick);
  }

  const buttons = new Map();
  for (const s of SOURCES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(s.icon)}<span>${s.label}</span>`;
    btn.addEventListener("click", () => selectSource(s));
    sourceRow.appendChild(btn);
    buttons.set(s.id, btn);
  }

  let voice = null;
  let localAnalyser = null;
  let stopViz = null;
  let current = SOURCES[0];
  let toneFreq = 440;
  let interactionCount = 0;
  const triedSources = new Set();

  function applySelection(s) {
    current = s;
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === s.id);
    // Noise has no fundamental frequency to sweep — hide the control rather
    // than leave it visible but meaningless for those sources.
    freqControl.hidden = !!s.color;
  }

  function createVoiceFor(s) {
    if (s.color) return audioEngine.createNoiseVoice({ gain: 0.22, color: s.color });
    // Square/sawtooth pack more harmonic energy per bin than a sine, so
    // they read as noticeably louder at the same gain — trim it back to
    // keep loudness roughly matched across wave shapes.
    const gain = s.id === "sine" ? 0.28 : 0.2;
    return audioEngine.createVoice({ freq: toneFreq, type: s.id, gain });
  }

  function maybeComplete() {
    if (triedSources.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function selectSource(s) {
    if (s.id === current.id && voice) return;
    applySelection(s);
    if (audioEngine.isStarted) {
      if (voice) voice.stop();
      voice = createVoiceFor(s);
    }
    triedSources.add(s.id);
    interactionCount += 1;
    recordInteraction(STATION_ID);
    maybeComplete();
  }

  function setToneFreq(hz, userInitiated = false) {
    toneFreq = clamp(Math.round(hz), MIN_TONE_HZ, MAX_TONE_HZ);
    freqSlider.value = String(toneFreq);
    freqReadout.textContent = formatHz(toneFreq);
    if (voice && !current.color) voice.setFreq(toneFreq, 0.05);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  freqSlider.addEventListener("input", () => setToneFreq(Number(freqSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = createVoiceFor(current);
    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
    localAnalyser.smoothingTimeConstant = 0.4;
    audioEngine.masterGain.connect(localAnalyser);
    stopViz = drawSpectrogram(canvas, localAnalyser, {
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
