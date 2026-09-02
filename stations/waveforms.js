import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "waveforms";
const FIXED_HZ = 220;

// Rough perceived-loudness leveling: square/saw carry more harmonic energy
// than sine/triangle at the same peak amplitude, so they get less gain.
const WAVE_TYPES = [
  { type: "sine", label: "Sine", gain: 0.3 },
  { type: "triangle", label: "Triangle", gain: 0.26 },
  { type: "square", label: "Square", gain: 0.14 },
  { type: "sawtooth", label: "Sawtooth", gain: 0.15 },
];

// The waveforms play at different gains for perceived-loudness matching,
// but that made the quieter ones (square/saw) look flatter on the canvas
// than the pitch/amplitude stations. This target is a display-only gain —
// each shape is drawn as if it were playing at this level, independent of
// what it actually plays at.
const TARGET_VISUAL_GAIN = 0.55;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Frequency stays locked at ${FIXED_HZ} Hz the whole time. Only the shape changes.</p>

    <div class="wave-button-row" id="wave-buttons"></div>

    <div class="reveal" id="wave-reveal">This is called <strong>timbre</strong> (also: waveshape).</div>

    <canvas class="waveform-canvas" id="wave-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the selected wave shape"></canvas>
  `;

  const buttonRow = container.querySelector("#wave-buttons");
  const canvas = container.querySelector("#wave-canvas");

  let voice = null;
  let stopViz = null;
  let current = WAVE_TYPES[0];
  let ampScale = TARGET_VISUAL_GAIN / current.gain;
  const buttons = new Map();
  const visited = new Set();

  for (const wave of WAVE_TYPES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(wave.type)}<span>${wave.label}</span>`;
    btn.addEventListener("click", () => selectWave(wave, true));
    buttonRow.appendChild(btn);
    buttons.set(wave.type, btn);
  }

  function selectWave(wave, userInitiated = false) {
    current = wave;
    ampScale = TARGET_VISUAL_GAIN / wave.gain;
    for (const [type, btn] of buttons) {
      btn.classList.toggle("active", type === wave.type);
    }
    if (voice) {
      voice.setType(wave.type);
      voice.setGain(wave.gain);
    }
    if (userInitiated) {
      recordInteraction(STATION_ID);
      visited.add(wave.type);
      if (visited.size === WAVE_TYPES.length) markComplete(STATION_ID);
    }
  }

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({
      freq: FIXED_HZ,
      type: current.type,
      gain: current.gain,
    });
    stopViz = drawWaveform(canvas, audioEngine.analyser, {
      color: accent,
      ampScale: () => ampScale,
    });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  selectWave(current);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (voice) voice.stop();
  };
}
