import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { waveIconSvg } from "../js/wave-icons.js";
import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";
import { buildPulseWave, MIN_DUTY, MAX_DUTY } from "../js/pulse-wave.js";

const STATION_ID = "oscillator";
const MIN_HZ = 80;
const MAX_HZ = 2000;
const MAX_GAIN = 0.4;
const WAVE_TYPES = ["sine", "triangle", "square", "sawtooth"];

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">An oscillator is the thing making the wave in the first place. Change it and the sound changes. Pick Square to unlock a width control — squeeze it into a rectangle.</p>

    <div class="osc-diagram" aria-hidden="true">
      <div class="osc-box">Oscillator</div>
      <div class="osc-arrow">→</div>
      <div class="osc-box osc-box-sound">🔊 Sound</div>
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Frequency</div>
      <div class="big-readout" id="osc-freq-readout">440 Hz</div>
      <input type="range" id="osc-freq-slider" class="big-slider"
        min="${MIN_HZ}" max="${MAX_HZ}" value="440" step="1" aria-label="Oscillator frequency in Hertz" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Waveform</div>
      <div class="wave-button-row" id="osc-wave-buttons"></div>
    </div>

    <div class="osc-control" id="osc-width-control" hidden>
      <div class="osc-control-label">Width (square → rectangle)</div>
      <div class="big-readout" id="osc-width-readout">50%</div>
      <input type="range" id="osc-width-slider" class="big-slider"
        min="${MIN_DUTY}" max="${MAX_DUTY}" value="50" step="1"
        aria-label="Pulse width — percent of each cycle spent high" />
    </div>

    <div class="osc-control">
      <div class="osc-control-label">Amplitude</div>
      <div class="big-readout" id="osc-amp-readout">60%</div>
      <input type="range" id="osc-amp-slider" class="big-slider"
        min="0" max="100" value="60" step="1" aria-label="Oscillator amplitude percent" />
    </div>

    <canvas class="waveform-canvas" id="osc-canvas" width="600" height="180"
      role="img" aria-label="Live waveform of the oscillator"></canvas>
  `;

  const freqReadout = container.querySelector("#osc-freq-readout");
  const freqSlider = container.querySelector("#osc-freq-slider");
  const waveButtons = container.querySelector("#osc-wave-buttons");
  const widthControl = container.querySelector("#osc-width-control");
  const widthReadout = container.querySelector("#osc-width-readout");
  const widthSlider = container.querySelector("#osc-width-slider");
  const ampReadout = container.querySelector("#osc-amp-readout");
  const ampSlider = container.querySelector("#osc-amp-slider");
  const canvas = container.querySelector("#osc-canvas");

  const buttons = new Map();
  for (const type of WAVE_TYPES) {
    const btn = document.createElement("button");
    btn.className = "wave-btn";
    btn.type = "button";
    btn.innerHTML = `${waveIconSvg(type)}<span>${type[0].toUpperCase()}${type.slice(1)}</span>`;
    btn.addEventListener("click", () => setWave(type, true));
    waveButtons.appendChild(btn);
    buttons.set(type, btn);
  }

  let voice = null;
  let stopViz = null;
  let freq = 440;
  let waveType = "sine";
  let amp = 60;
  let width = 50;
  const touched = { freq: false, wave: false, amp: false };

  function applyWave() {
    if (!voice) return;
    if (waveType === "square") {
      voice.setPeriodicWave(buildPulseWave(audioEngine.ctx, width));
    } else {
      voice.setType(waveType);
    }
  }

  function maybeComplete() {
    recordInteraction(STATION_ID);
    if (touched.freq && touched.wave && touched.amp) markComplete(STATION_ID);
  }

  function setFreq(hz, userInitiated = false) {
    freq = clamp(hz, MIN_HZ, MAX_HZ);
    freqSlider.value = String(freq);
    freqReadout.textContent = formatHz(freq);
    if (voice) voice.setFreq(freq);
    if (userInitiated) {
      touched.freq = true;
      maybeComplete();
    }
  }

  function setWave(type, userInitiated = false) {
    waveType = type;
    for (const [t, btn] of buttons) btn.classList.toggle("active", t === type);
    widthControl.hidden = type !== "square";
    applyWave();
    if (userInitiated) {
      touched.wave = true;
      maybeComplete();
    }
  }

  function setWidth(pct, userInitiated = false) {
    width = clamp(pct, MIN_DUTY, MAX_DUTY);
    widthSlider.value = String(width);
    widthReadout.textContent = `${width}%`;
    applyWave();
    if (userInitiated) {
      recordInteraction(STATION_ID);
    }
  }

  function setAmp(pct, userInitiated = false) {
    amp = clamp(pct, 0, 100);
    ampSlider.value = String(amp);
    ampReadout.textContent = `${amp}%`;
    if (voice) voice.setGain((amp / 100) * MAX_GAIN);
    if (userInitiated) {
      touched.amp = true;
      maybeComplete();
    }
  }

  freqSlider.addEventListener("input", () => setFreq(Number(freqSlider.value), true));
  ampSlider.addEventListener("input", () => setAmp(Number(ampSlider.value), true));
  widthSlider.addEventListener("input", () => setWidth(Number(widthSlider.value), true));

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({
      freq,
      type: waveType,
      gain: (amp / 100) * MAX_GAIN,
    });
    applyWave();
    stopViz = drawWaveform(canvas, audioEngine.analyser, { color: accent });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(canvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  setWave(waveType);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (stopViz) stopViz();
    if (voice) voice.stop();
  };
}
