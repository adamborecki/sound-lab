import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "phase";
const FIXED_HZ = 220;
const FADE_SECONDS = 0.02;
const COMPLETE_AFTER_INTERACTIONS = 6;
const PRESETS = [
  { deg: 0, label: "0°" },
  { deg: 90, label: "90°" },
  { deg: 180, label: "180°" },
  { deg: 270, label: "270°" },
];

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Two identical tones. Slide B's timing and watch what the sum does — 0° stacks them up, 180° cancels them out. Nothing here changes B's shape or size, only when it starts.</p>

    <div class="big-readout" id="ph-readout">0°</div>
    <input type="range" id="ph-slider" class="big-slider" min="0" max="360" value="0" step="1"
      aria-label="Phase offset of wave B, in degrees" />

    <div class="preset-row" id="ph-presets">
      ${PRESETS.map((p) => `<button class="chip" type="button" data-deg="${p.deg}">${p.label}</button>`).join("")}
    </div>

    <div class="pp-section">
      <div class="osc-control-label pp-label-a">Wave A</div>
      <canvas class="waveform-canvas pp-canvas" id="ph-canvas-a" width="600" height="90" role="img" aria-label="Wave A"></canvas>
    </div>
    <div class="pp-section">
      <div class="osc-control-label pp-label-b">Wave B (phase-shifted)</div>
      <canvas class="waveform-canvas pp-canvas" id="ph-canvas-b" width="600" height="90" role="img" aria-label="Wave B"></canvas>
    </div>
    <div class="pp-section">
      <div class="osc-control-label">Sum (what you hear)</div>
      <canvas class="waveform-canvas pp-canvas" id="ph-canvas-sum" width="600" height="120" role="img" aria-label="Sum of A and B"></canvas>
    </div>
  `;

  const readout = container.querySelector("#ph-readout");
  const slider = container.querySelector("#ph-slider");
  const canvasA = container.querySelector("#ph-canvas-a");
  const canvasB = container.querySelector("#ph-canvas-b");
  const canvasSum = container.querySelector("#ph-canvas-sum");

  let ctx = null;
  let oscA = null;
  let gainA = null;
  let oscB = null;
  let gainB = null;
  let delayNode = null;
  let analyserA = null;
  let analyserB = null;
  let stopVizA = null;
  let stopVizB = null;
  let stopVizSum = null;
  let deg = 0;
  let interactionCount = 0;

  function setPhase(newDeg, userInitiated = false) {
    deg = clamp(Math.round(newDeg), 0, 360);
    slider.value = String(deg);
    readout.textContent = `${deg}°`;
    if (delayNode) {
      const delaySeconds = (deg / 360) * (1 / FIXED_HZ);
      delayNode.delayTime.setTargetAtTime(delaySeconds, ctx.currentTime, 0.02);
    }
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  slider.addEventListener("input", () => setPhase(Number(slider.value), true));
  container.querySelector("#ph-presets").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-deg]");
    if (!btn) return;
    setPhase(Number(btn.dataset.deg), true);
  });

  function setupAudio() {
    if (!audioEngine.isStarted || oscA) return;
    ctx = audioEngine.ctx;
    const now = ctx.currentTime;

    oscA = ctx.createOscillator();
    oscA.type = "sine";
    oscA.frequency.value = FIXED_HZ;
    gainA = ctx.createGain();
    gainA.gain.value = 0;
    oscA.connect(gainA);
    gainA.connect(audioEngine.masterGain);
    oscA.start();
    gainA.gain.setTargetAtTime(0.2, now, FADE_SECONDS);

    oscB = ctx.createOscillator();
    oscB.type = "sine";
    oscB.frequency.value = FIXED_HZ;
    gainB = ctx.createGain();
    gainB.gain.value = 0;
    delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = (deg / 360) * (1 / FIXED_HZ);
    oscB.connect(gainB);
    gainB.connect(delayNode);
    delayNode.connect(audioEngine.masterGain);
    oscB.start();
    gainB.gain.setTargetAtTime(0.2, now, FADE_SECONDS);

    analyserA = ctx.createAnalyser();
    analyserA.fftSize = 2048;
    gainA.connect(analyserA);

    analyserB = ctx.createAnalyser();
    analyserB.fftSize = 2048;
    delayNode.connect(analyserB);

    // A/B are tapped pre-master (raw 0.2 gain); Sum is tapped post-master
    // (the shared analyser), so at most 0.4 * masterGain(0.5) = 0.2. Both
    // need boosting to read clearly on a -1..1 canvas. All three canvases
    // trigger off the SAME reference point (A's), or each independently
    // re-syncing to its own zero-crossing would erase the phase
    // relationship this station exists to show.
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
        delayNode.disconnect();
        analyserA.disconnect();
        analyserB.disconnect();
      }, FADE_SECONDS * 1000 * 6);
    }
  };
}
