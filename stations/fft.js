import { drawWaveform, drawSpectrum, drawIdleMessage, logPositionForFreq } from "../js/visualizers.js";
import { clamp, prefersReducedMotion } from "../js/utils.js";
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
      <div class="osc-control-label">Unroll the overtones</div>
      <p class="fft-caption">
        Same idea, seen a third way: each overtone is really its own sine wave. Drag the slider to
        pull them apart — fully unrolled, this <em>is</em> the spectrum above, just redrawn one
        partial at a time.
      </p>
      <input type="range" id="fft-unroll-slider" class="big-slider" min="0" max="100" value="0" step="1"
        aria-label="Unroll the overtones from stacked to spread out" />
      <canvas class="fft-3d-canvas" id="fft-3d-canvas" width="600" height="220"
        role="img" aria-label="Each overtone drawn as its own wave, spreading apart as you unroll"></canvas>
    </div>
  `;

  const recipeRow = container.querySelector("#fft-recipes");
  const waveCanvas = container.querySelector("#fft-wave-canvas");
  const spectrumCanvas = container.querySelector("#fft-spectrum-canvas");
  const axisEl = container.querySelector("#fft-axis");
  const unrollSlider = container.querySelector("#fft-unroll-slider");
  const canvas3d = container.querySelector("#fft-3d-canvas");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    axisEl.appendChild(tick);
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
  let unrollRaf = null;
  let unroll = 0;
  let phase = 0;
  let lastT = null;
  let current = RECIPES[0];
  let interactionCount = 0;
  const triedRecipes = new Set();
  const reduced = prefersReducedMotion();

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

  function setUnroll(pct, userInitiated = false) {
    unroll = clamp(pct, 0, 100);
    unrollSlider.value = String(unroll);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  unrollSlider.addEventListener("input", () => setUnroll(Number(unrollSlider.value), true));

  function draw3d() {
    const ctx = canvas3d.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas3d.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas3d.width !== w || canvas3d.height !== h) {
      canvas3d.width = w;
      canvas3d.height = h;
    }
    ctx.clearRect(0, 0, w, h);

    const t = unroll / 100;
    const centerY = h * 0.5;
    const maxDepthShift = h * 0.32;
    const laneWidth = w * (0.55 + t * 0.4);

    current.harmonics.forEach((k, idx) => {
      const amp = 1 / k;
      const spread = current.harmonics.length > 1 ? idx / (current.harmonics.length - 1) : 0.5;
      const y = centerY + (spread - 0.5) * 2 * maxDepthShift * t;
      const x0 = w / 2 - laneWidth / 2;

      ctx.beginPath();
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.35 + 0.65 * amp;
      ctx.lineWidth = 2.5 * dpr;
      ctx.lineJoin = "round";
      const cycles = k;
      const steps = 120;
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const x = x0 + frac * laneWidth;
        const yy = y + Math.sin(frac * cycles * 2 * Math.PI + phase) * (h * 0.09) * amp * (0.5 + 0.5 * t);
        if (i === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (t > 0.15) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = `${11 * dpr}px system-ui, sans-serif`;
        ctx.textAlign = "left";
        ctx.globalAlpha = clamp((t - 0.15) / 0.3, 0, 1);
        ctx.fillText(`${k}× (${(FUNDAMENTAL_HZ * k).toFixed(0)} Hz)`, x0 + laneWidth + 6 * dpr, y + 4 * dpr);
        ctx.globalAlpha = 1;
      }
    });
  }

  function unrollLoop(t) {
    if (lastT == null) lastT = t;
    const dt = (t - lastT) / 1000;
    lastT = t;
    if (!reduced) phase += dt * 1.2;
    draw3d();
    unrollRaf = requestAnimationFrame(unrollLoop);
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
  }

  selectRecipe(current);

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(waveCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  unrollRaf = requestAnimationFrame(unrollLoop);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (unrollRaf) cancelAnimationFrame(unrollRaf);
    if (stopWaveViz) stopWaveViz();
    if (stopSpectrumViz) stopSpectrumViz();
    if (voice) voice.stop();
    if (localAnalyser) audioEngine.masterGain.disconnect(localAnalyser);
  };
}
