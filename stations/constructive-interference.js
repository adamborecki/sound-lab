import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "constructive-interference";
const FIXED_HZ = 220;
const VOICE_GAIN = 0.2;
const FADE_SECONDS = 0.02;
const COMPLETE_AFTER_INTERACTIONS = 4;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Two identical waves — same frequency, same amplitude, same phase. Add the second one and watch the amplitude exactly double.</p>

    <div class="big-readout" id="ci-readout">1× amplitude</div>
    <button class="btn btn-start" id="ci-toggle" type="button">Add Wave B</button>

    <div class="pp-section">
      <div class="osc-control-label pp-label-a">Wave A (always on)</div>
      <canvas class="waveform-canvas pp-canvas" id="ci-canvas-a" width="600" height="90" role="img" aria-label="Wave A"></canvas>
    </div>
    <div class="pp-section">
      <div class="osc-control-label pp-label-b">Wave B</div>
      <canvas class="waveform-canvas pp-canvas" id="ci-canvas-b" width="600" height="90" role="img" aria-label="Wave B"></canvas>
    </div>
    <div class="pp-section">
      <div class="osc-control-label">Sum</div>
      <canvas class="waveform-canvas pp-canvas" id="ci-canvas-sum" width="600" height="120" role="img" aria-label="Sum of A and B"></canvas>
    </div>
  `;

  const readout = container.querySelector("#ci-readout");
  const toggleBtn = container.querySelector("#ci-toggle");
  const canvasA = container.querySelector("#ci-canvas-a");
  const canvasB = container.querySelector("#ci-canvas-b");
  const canvasSum = container.querySelector("#ci-canvas-sum");

  let ctx = null;
  let oscA = null;
  let gainA = null;
  let oscB = null;
  let gainB = null;
  let analyserA = null;
  let analyserB = null;
  let stopVizA = null;
  let stopVizB = null;
  let stopVizSum = null;
  let on = false;
  let interactionCount = 0;

  function setOn(next, userInitiated = false) {
    on = next;
    readout.textContent = on ? "2× amplitude" : "1× amplitude";
    toggleBtn.textContent = on ? "Remove Wave B" : "Add Wave B";
    if (gainB) gainB.gain.setTargetAtTime(on ? VOICE_GAIN : 0, ctx.currentTime, FADE_SECONDS);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  toggleBtn.addEventListener("click", () => setOn(!on, true));

  function setupAudio() {
    if (!audioEngine.isStarted || oscA) return;
    ctx = audioEngine.ctx;
    const startAt = ctx.currentTime + 0.05;

    oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = FIXED_HZ;
    gainA = ctx.createGain();
    gainA.gain.value = 0;
    oscA.connect(gainA);
    gainA.connect(audioEngine.masterGain);
    oscA.start(startAt);
    gainA.gain.setTargetAtTime(VOICE_GAIN, startAt, FADE_SECONDS);

    // Same frequency, started at the exact same instant as A, so the two
    // stay perfectly in phase forever — gain is the only thing this
    // station ever touches.
    oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = FIXED_HZ;
    gainB = ctx.createGain();
    gainB.gain.value = 0;
    oscB.connect(gainB);
    gainB.connect(audioEngine.masterGain);
    oscB.start(startAt);

    analyserA = ctx.createAnalyser();
    analyserA.fftSize = 2048;
    gainA.connect(analyserA);

    analyserB = ctx.createAnalyser();
    analyserB.fftSize = 2048;
    gainB.connect(analyserB);

    // A/B are tapped pre-master (raw 0.2 gain); Sum is tapped post-master
    // (the shared analyser), so at most 0.4 * masterGain(0.5) = 0.2. Both
    // need boosting to read clearly on a -1..1 canvas.
    stopVizA = drawWaveform(canvasA, analyserA, { color: "#7CE0FF", ampScale: 4 });
    stopVizB = drawWaveform(canvasB, analyserB, { color: "#FF9B7C", ampScale: 4 });
    stopVizSum = drawWaveform(canvasSum, audioEngine.analyser, { color: accent, ampScale: 4 });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvasA, "Tap Start Sound to hear it");
    drawIdleMessage(canvasB, "Tap Start Sound to hear it");
    drawIdleMessage(canvasSum, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopVizA) stopVizA();
    if (stopVizB) stopVizB();
    if (stopVizSum) stopVizSum();
    if (oscA) {
      const now = ctx.currentTime;
      gainA.gain.setTargetAtTime(0, now, FADE_SECONDS);
      gainB.gain.setTargetAtTime(0, now, FADE_SECONDS);
      setTimeout(() => {
        try {
          oscA.stop();
          oscB.stop();
        } catch (e) {
          /* already stopped */
        }
        oscA.disconnect();
        gainA.disconnect();
        oscB.disconnect();
        gainB.disconnect();
        analyserA.disconnect();
        analyserB.disconnect();
      }, FADE_SECONDS * 1000 * 6);
    }
  };
}
