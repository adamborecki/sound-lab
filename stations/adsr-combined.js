import { drawEnvelope, drawIdleMessage } from "../js/visualizers.js";
import { createAdsrVoice } from "../js/adsr-voice.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "adsr-combined";
const DEFAULTS = { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.4 };
const RANGES = {
  attack: { min: 0.01, max: 2, step: 0.01 },
  decay: { min: 0.05, max: 2, step: 0.01 },
  sustain: { min: 0, max: 100, step: 1 }, // percent in the UI, fraction in the voice
  release: { min: 0.05, max: 3, step: 0.01 },
};
const PRESETS = [
  { id: "pluck", label: "Pluck", values: { attack: 0.01, decay: 0.15, sustain: 0.1, release: 0.2 } },
  { id: "pad", label: "Slow Pad", values: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 1.5 } },
  { id: "organ", label: "Organ", values: { attack: 0.02, decay: 0.05, sustain: 1, release: 0.1 } },
  { id: "swell", label: "Bowed Swell", values: { attack: 1.2, decay: 0.3, sustain: 0.7, release: 0.8 } },
];
const COMPLETE_AFTER_INTERACTIONS = 8;

function formatSeconds(s) {
  return `${s.toFixed(2)} s`;
}

const FIELDS = [
  { key: "attack", label: "Attack", unit: "s" },
  { key: "decay", label: "Decay", unit: "s" },
  { key: "sustain", label: "Sustain", unit: "%" },
  { key: "release", label: "Release", unit: "s" },
];

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">
      Now all four together. Try the presets, then adjust freely — every envelope shape is just
      these four numbers.
    </p>

    <button class="note-pad" id="combined-pad" type="button">Hold to Play</button>

    <div class="preset-row" id="combined-presets"></div>

    <div class="control-row">
      ${FIELDS.slice(0, 2)
        .map(
          (f) => `
        <div class="control-compact">
          <div class="osc-control-label">${f.label}</div>
          <div class="compact-readout" id="combined-${f.key}-readout"></div>
          <input type="range" id="combined-${f.key}-slider" class="compact-slider"
            min="${RANGES[f.key].min}" max="${RANGES[f.key].max}" step="${RANGES[f.key].step}"
            aria-label="${f.label}${f.unit === "%" ? " percent" : " in seconds"}" />
        </div>
      `,
        )
        .join("")}
    </div>
    <div class="control-row">
      ${FIELDS.slice(2, 4)
        .map(
          (f) => `
        <div class="control-compact">
          <div class="osc-control-label">${f.label}</div>
          <div class="compact-readout" id="combined-${f.key}-readout"></div>
          <input type="range" id="combined-${f.key}-slider" class="compact-slider"
            min="${RANGES[f.key].min}" max="${RANGES[f.key].max}" step="${RANGES[f.key].step}"
            aria-label="${f.label}${f.unit === "%" ? " percent" : " in seconds"}" />
        </div>
      `,
        )
        .join("")}
    </div>

    <div class="osc-control-label">Amplitude Envelope</div>
    <canvas class="spectrum-canvas" id="combined-canvas" width="600" height="200"
      role="img" aria-label="Live amplitude envelope, press and hold the pad to hear it"></canvas>
  `;

  const pad = container.querySelector("#combined-pad");
  const presetRow = container.querySelector("#combined-presets");
  const canvas = container.querySelector("#combined-canvas");
  const controls = {};
  for (const f of FIELDS) {
    controls[f.key] = {
      slider: container.querySelector(`#combined-${f.key}-slider`),
      readout: container.querySelector(`#combined-${f.key}-readout`),
    };
  }

  const values = { ...DEFAULTS };
  let voice = null;
  let stopViz = null;
  let interactionCount = 0;

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function applyParams() {
    if (!voice) return;
    voice.setParams(values);
  }

  function refreshUI() {
    for (const f of FIELDS) {
      const uiValue = f.key === "sustain" ? Math.round(values.sustain * 100) : values[f.key];
      controls[f.key].slider.value = String(uiValue);
      controls[f.key].readout.textContent = f.key === "sustain" ? `${uiValue}%` : formatSeconds(uiValue);
    }
  }

  function setField(key, rawValue, userInitiated) {
    const range = RANGES[key];
    const clamped = clamp(rawValue, range.min, range.max);
    values[key] = key === "sustain" ? clamped / 100 : clamped;
    refreshUI();
    applyParams();
    if (userInitiated) registerInteraction();
  }

  for (const f of FIELDS) {
    controls[f.key].slider.addEventListener("input", () =>
      setField(f.key, Number(controls[f.key].slider.value), true),
    );
  }

  const presetButtons = new Map();
  for (const p of PRESETS) {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.type = "button";
    btn.textContent = p.label;
    btn.addEventListener("click", () => applyPreset(p, true));
    presetRow.appendChild(btn);
    presetButtons.set(p.id, btn);
  }

  function applyPreset(p, userInitiated) {
    Object.assign(values, p.values);
    for (const [id, btn] of presetButtons) btn.classList.toggle("active", id === p.id);
    refreshUI();
    applyParams();
    if (userInitiated) registerInteraction();
  }

  function press(e) {
    if (!audioEngine.isStarted || !voice) return;
    pad.setPointerCapture(e.pointerId);
    pad.classList.add("held");
    voice.noteOn();
    registerInteraction();
  }

  function release_(e) {
    pad.classList.remove("held");
    if (voice) voice.noteOff();
  }

  pad.addEventListener("pointerdown", press);
  pad.addEventListener("pointerup", release_);
  pad.addEventListener("pointercancel", release_);

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = createAdsrVoice(audioEngine.ctx, { peak: 0.3 });
    applyParams();
    voice.output.connect(audioEngine.masterGain);
    stopViz = drawEnvelope(canvas, voice.getLevel, { color: accent });
  }

  refreshUI();

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
