import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "destructive-interference";
const FIXED_HZ = 220;
const VOICE_GAIN = 0.2;
const FADE_SECONDS = 0.02;
const COMPLETE_AFTER_INTERACTIONS = 4;

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Same two waves as Constructive Interference — but Wave B is inverted (upside down). Add it and the sum should vanish.</p>

    <div class="big-readout" id="di-readout">1× amplitude</div>
    <button class="btn btn-start" id="di-toggle" type="button">Add Inverted Wave B</button>

    <div class="pp-section">
      <div class="osc-control-label pp-label-a">Wave A (always on)</div>
      <canvas class="waveform-canvas pp-canvas" id="di-canvas-a" width="600" height="90" role="img" aria-label="Wave A"></canvas>
    </div>
    <div class="pp-section">
      <div class="osc-control-label pp-label-b">Wave B (inverted polarity)</div>
      <canvas class="waveform-canvas pp-canvas" id="di-canvas-b" width="600" height="90" role="img" aria-label="Wave B, inverted"></canvas>
    </div>
    <div class="pp-section">
      <div class="osc-control-label">Sum</div>
      <canvas class="waveform-canvas pp-canvas" id="di-canvas-sum" width="600" height="120" role="img" aria-label="Sum of A and B"></canvas>
    </div>
  `;

  const readout = container.querySelector("#di-readout");
  const toggleBtn = container.querySelector("#di-toggle");
  const canvasA = container.querySelector("#di-canvas-a");
  const canvasB = container.querySelector("#di-canvas-b");
  const canvasSum = container.querySelector("#di-canvas-sum");

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
    readout.textContent = on ? "≈0× amplitude" : "1× amplitude";
    toggleBtn.textContent = on ? "Remove Wave B" : "Add Inverted Wave B";
    // Negative gain on an identical sine is mathematically the same as a
    // 180° phase shift — inverted polarity, no delay node needed.
    if (gainB) gainB.gain.setTargetAtTime(on ? -VOICE_GAIN : 0, ctx.currentTime, FADE_SECONDS);
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

    // Shared trigger reference (A's) — otherwise each canvas independently
    // re-syncing to its own zero-crossing hides B's inversion entirely.
    stopVizA = drawWaveform(canvasA, analyserA, { color: "#7CE0FF", ampScale: 4 });
    stopVizB = drawWaveform(canvasB, analyserB, {
      color: "#FF9B7C",
      ampScale: 4,
      triggerSource: analyserA,
    });
    stopVizSum = drawWaveform(canvasSum, audioEngine.analyser, {
      color: accent,
      ampScale: 4,
      triggerSource: analyserA,
    });
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
