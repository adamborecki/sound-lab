import {
  drawWaveform,
  drawSpectrum,
  drawIdleMessage,
  logPositionForFreq,
} from "../js/visualizers.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "pulse";
const FIXED_HZ = 150;
const HARMONIC_COUNT = 40;
const MIN_DUTY = 2;
const MAX_DUTY = 98;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 20000;
const LOCAL_ANALYSER_FFT_SIZE = 8192;
const COMPLETE_AFTER_INTERACTIONS = 6;
const AXIS_LABELS = [20, 100, 1000, 10000];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

// A pulse wave centered at t=0 is an even function, so it's built from pure
// cosine terms — real[] rather than the imag[] (sine) terms Harmonics uses.
// Standard rectangular-pulse Fourier series: the nth harmonic's amplitude
// is (4/nπ)·sin(nπ·duty). At duty=0.5 this collapses to a square wave's
// odd-harmonics-only, 1/n-falloff spectrum.
function buildPulseWave(ctx, dutyPercent) {
  const duty = dutyPercent / 100;
  const real = new Float32Array(HARMONIC_COUNT + 1);
  const imag = new Float32Array(HARMONIC_COUNT + 1);
  for (let n = 1; n <= HARMONIC_COUNT; n++) {
    real[n] = (4 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Same pitch the whole time. Squeeze the pulse and listen to the timbre change.</p>

    <div class="big-readout" id="duty-readout">50%</div>

    <input
      type="range"
      id="duty-slider"
      class="big-slider"
      min="${MIN_DUTY}"
      max="${MAX_DUTY}"
      value="50"
      step="1"
      aria-label="Pulse width — percent of each cycle spent high"
    />

    <div class="preset-row" id="duty-presets">
      <button class="chip" type="button" data-duty="25">25%</button>
      <button class="chip" type="button" data-duty="50">50% (Square)</button>
      <button class="chip" type="button" data-duty="75">75%</button>
    </div>

    <div class="pulse-section">
      <div class="osc-control-label">Waveform</div>
      <canvas class="waveform-canvas" id="pulse-wave-canvas" width="600" height="150"
        role="img" aria-label="Live waveform of the pulse"></canvas>
    </div>

    <div class="pulse-section">
      <div class="osc-control-label">Spectrum</div>
      <canvas class="spectrum-canvas" id="pulse-spectrum-canvas" width="600" height="150"
        role="img" aria-label="Live frequency spectrum of the pulse"></canvas>
      <div class="spectrum-axis" id="pulse-spectrum-axis"></div>
    </div>
  `;

  const dutyReadout = container.querySelector("#duty-readout");
  const dutySlider = container.querySelector("#duty-slider");
  const waveCanvas = container.querySelector("#pulse-wave-canvas");
  const spectrumCanvas = container.querySelector("#pulse-spectrum-canvas");
  const axisEl = container.querySelector("#pulse-spectrum-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    axisEl.appendChild(tick);
  }

  let voice = null;
  let localAnalyser = null;
  let stopWaveViz = null;
  let stopSpectrumViz = null;
  let duty = 50;
  let interactionCount = 0;

  function applyDuty() {
    if (voice) voice.setPeriodicWave(buildPulseWave(audioEngine.ctx, duty));
  }

  function setDuty(pct, userInitiated = false) {
    duty = clamp(Math.round(pct), MIN_DUTY, MAX_DUTY);
    dutySlider.value = String(duty);
    dutyReadout.textContent = `${duty}%`;
    applyDuty();

    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  dutySlider.addEventListener("input", () => setDuty(Number(dutySlider.value), true));
  container.querySelector("#duty-presets").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-duty]");
    if (!btn) return;
    setDuty(Number(btn.dataset.duty), true);
  });

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({ freq: FIXED_HZ, type: "sine", gain: 0.28 });
    applyDuty();
    stopWaveViz = drawWaveform(waveCanvas, audioEngine.analyser, { color: accent });

    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = LOCAL_ANALYSER_FFT_SIZE;
    localAnalyser.smoothingTimeConstant = 0.7;
    audioEngine.masterGain.connect(localAnalyser);
    stopSpectrumViz = drawSpectrum(spectrumCanvas, localAnalyser, {
      color: accent,
      minHz: MIN_HZ_AXIS,
      maxHz: MAX_HZ_AXIS,
    });
  }

  dutyReadout.textContent = `${duty}%`;
  dutySlider.value = String(duty);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(waveCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopWaveViz) stopWaveViz();
    if (stopSpectrumViz) stopSpectrumViz();
    if (voice) voice.stop();
    if (localAnalyser) audioEngine.masterGain.disconnect(localAnalyser);
  };
}
