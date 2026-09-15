import {
  drawSpectrum,
  drawSpectrogram,
  drawIdleMessage,
  logPositionForFreq,
  buildSpectrogramFreqAxis,
} from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "vowel-formants";
const MIN_FREQ = 150;
const MAX_FREQ = 5000;
const DEFAULT_FREQ = 1000;
const MIN_Q = 2;
const MAX_Q = 15;
const DEFAULT_Q = 6;
const FORMANT_GAIN_DB = 20;
const VOICE_HZ = 110;
const MIN_HZ_AXIS = 20;
const MAX_HZ_AXIS = 8000;
const AXIS_LABELS = [20, 100, 1000, 8000];
const COMPLETE_AFTER_INTERACTIONS = 5;

// Simplified single-formant mapping — a real vowel is shaped by two or
// three resonances at once (F1, F2, F3), but sweeping just one strong
// peak through these regions is already enough for the ear to hear the
// buzz turn into something vowel-like.
const VOWELS = [
  { id: "oo", label: "oo", example: "boot", hz: 250 },
  { id: "o", label: "o", example: "boat", hz: 500 },
  { id: "ah", label: "ah", example: "caught", hz: 1000 },
  { id: "a", label: "a", example: "cat", hz: 2000 },
  { id: "ee", label: "ee", example: "seat", hz: 4000 },
];

function formatHzLabel(hz) {
  return hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Vowels aren't really about pitch. Say "ah" then "ee" on the same note and the pitch doesn't
      move — but a resonance in your vocal tract (a <strong>formant</strong>) does, and that's what
      your ear latches onto. Here, a single peaking filter (from the last station) plays that
      resonance's role on top of a plain buzzy tone.
    </p>

    <div class="filter-shape-badge">${waveIconSvg("peaking")}<span>One Formant, Sweeping</span></div>

    <div class="preset-row" id="vf-presets"></div>

    <div class="osc-control">
      <div class="osc-control-label">Formant Frequency</div>
      <div class="big-readout" id="vf-freq-readout">${formatHz(DEFAULT_FREQ)}</div>
      <input type="range" id="vf-freq-slider" class="big-slider" min="${MIN_FREQ}" max="${MAX_FREQ}"
        value="${DEFAULT_FREQ}" step="1" aria-label="Formant frequency in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Resonance (Q)</div>
      <div class="big-readout" id="vf-q-readout">${DEFAULT_Q.toFixed(1)}</div>
      <input type="range" id="vf-q-slider" class="big-slider" min="${MIN_Q}" max="${MAX_Q}"
        value="${DEFAULT_Q}" step="0.5" aria-label="How narrow and pronounced the resonance is" />
    </div>

    <p class="prompt">
      Drag the slider slowly between presets — there's no hard border between vowels, just a peak
      sliding through the spectrum.
    </p>

    <div class="osc-control-label">Spectrum (frequency)</div>
    <canvas class="spectrum-canvas" id="vf-spectrum-canvas" width="600" height="200"
      role="img" aria-label="Live frequency spectrum of the formant-shaped tone"></canvas>
    <div class="spectrum-axis" id="vf-spectrum-axis"></div>

    <div class="osc-control-label">Spectrogram (frequency vs. time)</div>
    <div class="spectrogram-row">
      <div class="spectrogram-freq-axis" id="vf-spectrogram-axis"></div>
      <canvas class="spectrum-canvas" id="vf-spectrogram-canvas" width="600" height="220"
        role="img" aria-label="Scrolling spectrogram of the formant-shaped tone — frequency on the vertical axis, time on the horizontal axis"></canvas>
    </div>
  `;

  const presetRow = container.querySelector("#vf-presets");
  const freqSlider = container.querySelector("#vf-freq-slider");
  const freqReadout = container.querySelector("#vf-freq-readout");
  const qSlider = container.querySelector("#vf-q-slider");
  const qReadout = container.querySelector("#vf-q-readout");
  const spectrumCanvas = container.querySelector("#vf-spectrum-canvas");
  const spectrumAxisEl = container.querySelector("#vf-spectrum-axis");
  const spectrogramCanvas = container.querySelector("#vf-spectrogram-canvas");
  const spectrogramAxisEl = container.querySelector("#vf-spectrogram-axis");

  for (const hz of AXIS_LABELS) {
    const tick = document.createElement("span");
    tick.textContent = `${formatHzLabel(hz)} Hz`;
    tick.style.left = `${logPositionForFreq(hz, MIN_HZ_AXIS, MAX_HZ_AXIS) * 100}%`;
    spectrumAxisEl.appendChild(tick);
  }
  buildSpectrogramFreqAxis(spectrogramAxisEl, AXIS_LABELS, MIN_HZ_AXIS, MAX_HZ_AXIS);

  const buttons = new Map();
  for (const v of VOWELS) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.innerHTML = `“${v.label}” <span class="vf-example">(${v.example})</span>`;
    btn.addEventListener("click", () => selectVowel(v.id, true));
    presetRow.appendChild(btn);
    buttons.set(v.id, btn);
  }

  let freq = DEFAULT_FREQ;
  let q = DEFAULT_Q;
  let interactionCount = 0;
  const triedVowels = new Set();

  let filterNode = null;
  let voiceOsc = null;
  let voiceGain = null;
  let localAnalyser = null;
  let stopSpectrumViz = null;
  let stopSpectrogramViz = null;

  function maybeComplete() {
    if (triedVowels.size >= 3 && interactionCount >= COMPLETE_AFTER_INTERACTIONS) {
      markComplete(STATION_ID);
    }
  }

  function highlightNearest() {
    let nearest = null;
    let nearestDist = Infinity;
    for (const v of VOWELS) {
      const dist = Math.abs(Math.log(v.hz) - Math.log(freq));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = v.id;
      }
    }
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === nearest);
  }

  function applyFilterParams() {
    if (!filterNode) return;
    const now = audioEngine.ctx.currentTime;
    filterNode.frequency.setTargetAtTime(freq, now, 0.03);
    filterNode.Q.setTargetAtTime(q, now, 0.03);
  }

  function setFreq(hz, userInitiated) {
    freq = clamp(Math.round(hz), MIN_FREQ, MAX_FREQ);
    freqSlider.value = String(freq);
    freqReadout.textContent = formatHz(freq);
    highlightNearest();
    applyFilterParams();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function setQ(value, userInitiated) {
    q = clamp(value, MIN_Q, MAX_Q);
    qSlider.value = String(q);
    qReadout.textContent = q.toFixed(1);
    applyFilterParams();
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      maybeComplete();
    }
  }

  function selectVowel(id, userInitiated) {
    const vowel = VOWELS.find((v) => v.id === id);
    triedVowels.add(id);
    setFreq(vowel.hz, userInitiated);
  }

  freqSlider.addEventListener("input", () => setFreq(Number(freqSlider.value), true));
  qSlider.addEventListener("input", () => setQ(Number(qSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || filterNode) return;
    const ctx = audioEngine.ctx;

    filterNode = ctx.createBiquadFilter();
    filterNode.type = "peaking";
    filterNode.gain.value = FORMANT_GAIN_DB;
    applyFilterParams();
    filterNode.connect(audioEngine.masterGain);

    voiceOsc = ctx.createOscillator();
    voiceOsc.type = "sawtooth";
    voiceOsc.frequency.value = VOICE_HZ;
    voiceGain = ctx.createGain();
    voiceGain.gain.value = 0;
    voiceOsc.connect(voiceGain);
    voiceGain.connect(filterNode);
    voiceOsc.start();
    voiceGain.gain.setTargetAtTime(0.22, ctx.currentTime, 0.05);

    localAnalyser = ctx.createAnalyser();
    localAnalyser.fftSize = 8192;
    localAnalyser.smoothingTimeConstant = 0.6;
    filterNode.connect(localAnalyser);

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

  highlightNearest();

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(spectrumCanvas, "Tap Start Sound to hear it");
    drawIdleMessage(spectrogramCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopSpectrumViz) stopSpectrumViz();
    if (stopSpectrogramViz) stopSpectrogramViz();
    if (voiceGain) {
      const g = voiceGain;
      const osc = voiceOsc;
      g.gain.setTargetAtTime(0, audioEngine.ctx.currentTime, 0.02);
      setTimeout(() => {
        try {
          osc.stop();
        } catch (e) {
          /* already stopped */
        }
        osc.disconnect();
        g.disconnect();
      }, 150);
    }
    if (filterNode) filterNode.disconnect();
    if (localAnalyser) localAnalyser.disconnect();
  };
}
