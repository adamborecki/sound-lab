import { drawWaveform, drawSpectrum, drawSpectrogram, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "fft";
const FUNDAMENTAL_HZ = 220;
const HARMONIC_COUNT = 6;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 4000;
const COMPLETE_AFTER_INTERACTIONS = 6;
const AXIS_LABELS = [20, 100, 1000];

const RECIPES = [
  { id: "sine", label: "Sine (1 partial)", harmonics: [1] },
  { id: "square", label: "Square-ish (odd)", harmonics: [1, 3, 5] },
  { id: "sawtooth", label: "Sawtooth-ish (all)", harmonics: [1, 2, 3, 4, 5, 6] },
];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      The Fourier Transform: <em>decompose a function of time into the frequencies that make it up.</em>
      Think "reverse smoothie machine" — the waveform is the smoothie, the spectrum is the recipe.
      A frequency is an ingredient; its loudness (dB) is how much of that ingredient went in.
    </p>

    <div class="preset-row" id="fft-recipes"></div>

    <div class="fft-pair">
      <div class="fft-pane">
        <div class="osc-control-label">Waveform (time)</div>
        <canvas class="waveform-canvas" id="fft-wave-canvas" width="600" height="140"
          role="img" aria-label="Live waveform"></canvas>
      </div>
      <div class="fft-pane">
        <div class="osc-control-label">Spectrum (frequency)</div>
        <canvas class="spectrum-canvas" id="fft-spectrum-canvas" width="600" height="140"
          role="img" aria-label="Live frequency spectrum"></canvas>
        <div class="spectrum-axis" id="fft-axis"></div>
      </div>
    </div>

    <div class="fft-section">
      <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
      <p class="fft-caption">
        Same idea, seen a third way: the spectrum above is one instant frozen in time. Here it keeps
        scrolling — each harmonic is a horizontal line, its brightness is loudness, and switching
        recipes shows the whole line pattern change at once.
      </p>
      <canvas class="spectrum-canvas" id="fft-spectrogram-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram of the combined harmonics"></canvas>
      <div class="spectrum-axis" id="fft-spectrogram-axis"></div>
    </div>
  `;

  const recipeRow = container.querySelector("#fft-recipes");
  const waveCanvas = container.querySelector("#fft-wave-canvas");
  const spectrumCanvas = container.querySelector("#fft-spectrum-canvas");
  const axisEl = container.querySelector("#fft-axis");
  const spectrogramCanvas = container.querySelector("#fft-spectrogram-canvas");
  const spectrogramAxisEl = container.querySelector("#fft-spectrogram-axis");

  for (const el of [axisEl, spectrogramAxisEl]) {
    for (const hz of AXIS_LABELS) {
      const tick = document.createElement("span");
      tick.textContent = `${formatHzLabel(hz)} Hz`;
      tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
      el.appendChild(tick);
    }
  }

  const buttons = new Map();
  for (const r of RECIPES) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = r.label;
    btn.addEventListener("click", () => selectRecipe(r, true));
    recipeRow.appendChild(btn);
    buttons.set(r.id, btn);
  }

  let voice = null;
  let localAnalyser = null;
  let stopWaveViz = null;
  let stopSpectrumViz = null;
  let stopSpectrogramViz = null;
  let current = RECIPES[0];
  let interactionCount = 0;
  const triedRecipes = new Set();

  function buildWave() {
    const real = new Float32Array(HARMONIC_COUNT + 1);
    const imag = new Float32Array(HARMONIC_COUNT + 1);
    for (const k of current.harmonics) imag[k] = 1 / k;
    return audioEngine.ctx.createPeriodicWave(real, imag);
  }

  function maybeComplete() {
    if (triedRecipes.size >= 2 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function selectRecipe(r, userInitiated = false) {
    current = r;
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === r.id);
    if (voice) voice.setPeriodicWave(buildWave());
    if (userInitiated) {
      triedRecipes.add(r.id);
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({ freq: FUNDAMENTAL_HZ, type: "sine", gain: 0.26 });
    voice.setPeriodicWave(buildWave());
    stopWaveViz = drawWaveform(waveCanvas, audioEngine.analyser, { color: accent });

    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = 8192;
    localAnalyser.smoothingTimeConstant = 0.7;
    audioEngine.masterGain.connect(localAnalyser);
    stopSpectrumViz = drawSpectrum(spectrumCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
    stopSpectrogramViz = drawSpectrogram(spectrogramCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
  }

  selectRecipe(current);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(waveCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrogramCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopWaveViz) stopWaveViz();
    if (stopSpectrumViz) stopSpectrumViz();
    if (stopSpectrogramViz) stopSpectrogramViz();
    if (voice) voice.stop();
    if (localAnalyser) audioEngine.masterGain.disconnect(localAnalyser);
  };
}
