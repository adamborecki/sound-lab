import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { recordInteraction, markComplete, recordCheck } from "../js/progress.js";

const STATION_ID = "harmonics";
const FUNDAMENTAL_HZ = 110;
const PARTIAL_COUNT = 6;
const COMPLETE_AFTER_INTERACTIONS = 6;
const LABELS = { 1: "1st (fund.)", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th" };

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Start with the fundamental. Add harmonics one at a time and listen — the pitch won't move, only the timbre will.</p>

    <div class="predict-box" id="predict-box">
      <p class="predict-question">Quick guess: adding the 2nd harmonic changes...</p>
      <div class="predict-buttons">
        <button class="chip" type="button" data-guess="pitch">The pitch</button>
        <button class="chip" type="button" data-guess="timbre">The timbre</button>
      </div>
      <p class="predict-reveal" id="predict-reveal" hidden></p>
    </div>

    <div class="harmonic-bars" id="harmonic-bars"></div>

    <div class="preset-row" id="harmonic-presets">
      <button class="chip" type="button" data-recipe="fundamental">Fundamental only</button>
      <button class="chip" type="button" data-recipe="square">Square-ish</button>
      <button class="chip" type="button" data-recipe="saw">Sawtooth-ish</button>
    </div>

    <canvas class="waveform-canvas" id="harmonics-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the combined harmonics"></canvas>
  `;

  const predictBox = container.querySelector("#predict-box");
  const predictReveal = container.querySelector("#predict-reveal");
  const barsEl = container.querySelector("#harmonic-bars");
  const canvas = container.querySelector("#harmonics-canvas");

  predictBox.querySelectorAll("[data-guess]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const guess = btn.dataset.guess;
      recordCheck("harmonics-predict", guess);
      predictReveal.hidden = false;
      predictReveal.textContent =
        guess === "timbre"
          ? "Right — the fundamental frequency doesn't move, so the pitch stays put. Only the timbre shifts."
          : "Actually the pitch stays put — the fundamental frequency doesn't change. It's the timbre that shifts.";
      predictBox.querySelectorAll("[data-guess]").forEach((b) => (b.disabled = true));
    });
  });

  const active = new Set([1]);
  const bars = new Map();
  let voice = null;
  let stopViz = null;
  let interactionCount = 0;

  for (let k = 1; k <= PARTIAL_COUNT; k++) {
    const slot = document.createElement("div");
    slot.className = "harmonic-slot";
    slot.innerHTML = `
      <button class="harmonic-bar${k === 1 ? " locked" : ""}" type="button"
        style="--bar-height:${Math.round(100 / k)}%" ${k === 1 ? "disabled" : ""}
        aria-pressed="${k === 1 ? "true" : "false"}" aria-label="${LABELS[k]} harmonic">
        <span class="harmonic-bar-fill"></span>
      </button>
      <span class="harmonic-bar-label">${LABELS[k]}</span>
    `;
    const bar = slot.querySelector(".harmonic-bar");
    if (k !== 1) bar.addEventListener("click", () => toggle(k));
    barsEl.appendChild(slot);
    bars.set(k, bar);
  }

  function buildWave() {
    const real = new Float32Array(PARTIAL_COUNT + 1);
    const imag = new Float32Array(PARTIAL_COUNT + 1);
    for (const k of active) imag[k] = 1 / k;
    return audioEngine.ctx.createPeriodicWave(real, imag);
  }

  function render() {
    for (const [k, bar] of bars) {
      bar.classList.toggle("active", active.has(k));
      bar.setAttribute("aria-pressed", active.has(k) ? "true" : "false");
    }
    if (voice) voice.setPeriodicWave(buildWave());
  }

  function registerInteraction() {
    interactionCount += 1;
    recordInteraction(STATION_ID);
    if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
  }

  function toggle(k) {
    if (active.has(k)) active.delete(k);
    else active.add(k);
    render();
    registerInteraction();
  }

  function applyRecipe(name) {
    active.clear();
    if (name === "fundamental") active.add(1);
    else if (name === "square") [1, 3, 5].forEach((k) => active.add(k));
    else if (name === "saw") for (let k = 1; k <= PARTIAL_COUNT; k++) active.add(k);
    render();
    registerInteraction();
  }

  container.querySelector("#harmonic-presets").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-recipe]");
    if (!btn) return;
    applyRecipe(btn.dataset.recipe);
  });

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({ freq: FUNDAMENTAL_HZ, type: "sine", gain: 0.28 });
    voice.setPeriodicWave(buildWave());
    stopViz = drawWaveform(canvas, audioEngine.analyser, { color: accent });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  render();

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (voice) voice.stop();
  };
}
