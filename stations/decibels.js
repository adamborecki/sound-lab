import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { clamp } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "decibels";
const FIXED_HZ = 300;
const COMPLETE_AFTER_INTERACTIONS = 6;
const DEFAULT_PERCENT = 25;
const SILENCE_FLOOR_DBFS = -60;

const SPL_REFERENCE = [
  ["Threshold of hearing", "0 dB SPL"],
  ["Whisper", "~30 dB SPL"],
  ["Quiet room", "~40 dB SPL"],
  ["Normal conversation", "~60 dB SPL"],
  ["City traffic", "~85 dB SPL"],
  ["Rock concert", "~110 dB SPL"],
  ["Threshold of pain", "~130 dB SPL"],
];

function ampToDbfs(amp) {
  if (amp <= 0) return -Infinity;
  return 20 * Math.log10(amp);
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Turn it up and watch the number climb. 0 dBFS is the loudest a digital sample can ever be — turn it up carefully.</p>

    <div class="big-readout" id="dbfs-readout">— dBFS</div>

    <input
      type="range"
      id="db-slider"
      class="big-slider"
      min="0"
      max="100"
      value="${DEFAULT_PERCENT}"
      step="1"
      aria-label="Signal amplitude, percent of full scale"
    />

    <div class="numeric-row">
      <span id="db-percent">${DEFAULT_PERCENT}% of full scale</span>
    </div>

    <canvas class="waveform-canvas" id="db-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the tone"></canvas>

    <div class="spl-chart">
      <h3 class="spl-chart-title">dB SPL — real-world loudness</h3>
      <p class="spl-chart-note">
        This is a different scale entirely: dB Sound Pressure Level measures actual air
        pressure at your ear. A webpage has no way to know your speaker volume, distance,
        or hardware, so there's no honest live number to show here — only a calibrated
        microphone can measure that. Free "sound meter" / "dB meter" apps exist for iOS and
        Android if you want a real reading of the room you're in.
      </p>
      <ul class="spl-list">
        ${SPL_REFERENCE.map(([label, value]) => `<li><span>${label}</span><span>${value}</span></li>`).join("")}
      </ul>
    </div>
  `;

  const readout = container.querySelector("#dbfs-readout");
  const slider = container.querySelector("#db-slider");
  const percentEl = container.querySelector("#db-percent");
  const canvas = container.querySelector("#db-canvas");

  let voice = null;
  let localAnalyser = null;
  let meterBuf = null;
  let meterRaf = null;
  let stopViz = null;
  let amp = DEFAULT_PERCENT / 100;
  let interactionCount = 0;

  function setAmp(pct, userInitiated = false) {
    amp = clamp(pct, 0, 100) / 100;
    slider.value = String(Math.round(amp * 100));
    percentEl.textContent = `${Math.round(amp * 100)}% of full scale`;
    if (voice) voice.setGain(amp);

    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  slider.addEventListener("input", () => setAmp(Number(slider.value), true));

  function meterLoop() {
    if (!localAnalyser) return;
    localAnalyser.getFloatTimeDomainData(meterBuf);
    let peak = 0;
    for (let i = 0; i < meterBuf.length; i++) {
      const v = Math.abs(meterBuf[i]);
      if (v > peak) peak = v;
    }
    const dbfs = ampToDbfs(peak);
    let label;
    if (dbfs === -Infinity || dbfs < SILENCE_FLOOR_DBFS) {
      label = "−∞ dBFS";
    } else {
      // A peak sampled just shy of true 1.0 rounds to "-0.0", which reads
      // like a bug rather than "basically 0 dBFS".
      const fixed = dbfs.toFixed(1);
      label = `${fixed === "-0.0" ? "0.0" : fixed} dBFS`;
    }
    readout.textContent = label;
    meterRaf = requestAnimationFrame(meterLoop);
  }

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    // The tone's own gain node is tapped directly (before the shared master
    // volume stage) so the reading reflects the actual digital signal, not
    // whatever the app's separate playback-safety attenuation happens to be.
    voice = audioEngine.createVoice({ freq: FIXED_HZ, type: "sine", gain: amp });
    localAnalyser = audioEngine.ctx.createAnalyser();
    localAnalyser.fftSize = 2048;
    meterBuf = new Float32Array(localAnalyser.fftSize);
    voice.gainNode.connect(localAnalyser);
    meterRaf = requestAnimationFrame(meterLoop);
    stopViz = drawWaveform(canvas, audioEngine.analyser, { color: accent });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (meterRaf) cancelAnimationFrame(meterRaf);
    if (stopViz) stopViz();
    if (voice) voice.stop();
  };
}
