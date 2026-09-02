import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "octave";
// A fixed family of octave-related frequencies, anchored on 220 Hz (A3).
const LADDER = [55, 110, 220, 440, 880, 1760, 3520];
const START_INDEX = 2; // 220 Hz

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Start on a note. Double it, halve it, and listen to the family it belongs to.</p>

    <div class="big-readout" id="octave-readout">220 Hz</div>

    <div class="preset-row" id="octave-buttons">
      <button class="chip" type="button" data-action="halve">÷2</button>
      <button class="chip" type="button" data-action="double">×2</button>
      <button class="chip" type="button" data-action="quadruple">×4</button>
      <button class="chip" type="button" data-action="reset">Reset</button>
    </div>

    <div class="octave-ladder" id="octave-ladder" role="list" aria-label="Octave family"></div>

    <canvas class="waveform-canvas" id="octave-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the current note"></canvas>
  `;

  const readout = container.querySelector("#octave-readout");
  const ladderEl = container.querySelector("#octave-ladder");
  const canvas = container.querySelector("#octave-canvas");
  const rungs = new Map();

  for (const hz of LADDER) {
    const rung = document.createElement("div");
    rung.className = "octave-rung";
    rung.setAttribute("role", "listitem");
    rung.textContent = formatHz(hz);
    ladderEl.appendChild(rung);
    rungs.set(hz, rung);
  }

  let voice = null;
  let stopViz = null;
  let index = START_INDEX;
  let usedDouble = false;
  let usedHalve = false;

  function render() {
    const hz = LADDER[index];
    readout.textContent = formatHz(hz);
    for (const [rungHz, el] of rungs) {
      el.classList.toggle("current", rungHz === hz);
    }
    if (voice) voice.setFreq(hz, 0.06);
  }

  function goTo(newIndex, action) {
    const clamped = Math.max(0, Math.min(LADDER.length - 1, newIndex));
    if (clamped === index && action !== "reset") return;
    index = clamped;
    render();

    recordInteraction(STATION_ID);
    if (action === "double") usedDouble = true;
    if (action === "halve") usedHalve = true;
    if (usedDouble && usedHalve) markComplete(STATION_ID);
  }

  container.querySelector("#octave-buttons").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === "halve") goTo(index - 1, "halve");
    else if (action === "double") goTo(index + 1, "double");
    else if (action === "quadruple") goTo(index + 2, "double");
    else if (action === "reset") goTo(START_INDEX, "reset");
  });

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({ freq: LADDER[index], type: "sine", gain: 0.25 });
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
