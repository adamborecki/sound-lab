import { drawWaveform, drawIdleMessage } from "../js/visualizers.js";
import { clamp, formatHz, prefersReducedMotion } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "sound-waves";
const MIN_HZ = 80;
const MAX_HZ = 1000;
const DEFAULT_HZ = 220;
const PARTICLE_COUNT = 36;
const COMPLETE_AFTER_INTERACTIONS = 6;

// The particle animation's speed is NOT the real acoustic wavelength/speed
// (which would be far too fast to see) — it's a slowed-down stand-in, the
// same trick Chrome Music Lab's Sound Waves demo uses. Only the pitch you
// actually hear is the real frequency.
function visualHzFor(freq) {
  const t = (freq - MIN_HZ) / (MAX_HZ - MIN_HZ);
  return 0.4 + t * 3.6;
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Sound is really a <strong>longitudinal</strong> wave — particles pushed together and pulled apart, in the direction the wave travels. We usually draw it as a <strong>transverse</strong> (up/down) wave instead, because that's easier to read. Same sound, two pictures.</p>

    <div class="big-readout" id="sw-freq-readout">220 Hz</div>
    <input type="range" id="sw-freq-slider" class="big-slider"
      min="${MIN_HZ}" max="${MAX_HZ}" value="${DEFAULT_HZ}" step="1"
      aria-label="Frequency in Hertz" />

    <div class="sw-section">
      <div class="osc-control-label">Longitudinal (the real thing)</div>
      <canvas class="particle-canvas" id="sw-particle-canvas" width="600" height="120"
        role="img" aria-label="Animated particles compressing and spreading as the wave passes"></canvas>
      <p class="sw-caption">Dots bunch together = <strong>compression</strong>. Dots spread apart = <strong>rarefaction</strong>.</p>
    </div>

    <div class="sw-section">
      <div class="osc-control-label">Transverse (how we usually draw it)</div>
      <canvas class="waveform-canvas" id="sw-wave-canvas" width="600" height="120"
        role="img" aria-label="Live waveform, the usual up-and-down picture"></canvas>
    </div>
  `;

  const freqReadout = container.querySelector("#sw-freq-readout");
  const freqSlider = container.querySelector("#sw-freq-slider");
  const particleCanvas = container.querySelector("#sw-particle-canvas");
  const waveCanvas = container.querySelector("#sw-wave-canvas");

  let voice = null;
  let stopWaveViz = null;
  let particleRaf = null;
  let freq = DEFAULT_HZ;
  let phase = 0;
  let lastT = null;
  let interactionCount = 0;
  const reduced = prefersReducedMotion();

  function setFreq(hz, userInitiated = false) {
    freq = clamp(Math.round(hz), MIN_HZ, MAX_HZ);
    freqSlider.value = String(freq);
    freqReadout.textContent = formatHz(freq);
    if (voice) voice.setFreq(freq);
    if (userInitiated) {
      interactionCount += 1;
      recordInteraction(STATION_ID);
      if (interactionCount >= COMPLETE_AFTER_INTERACTIONS) markComplete(STATION_ID);
    }
  }

  freqSlider.addEventListener("input", () => setFreq(Number(freqSlider.value), true));

  function drawParticles() {
    const ctx = particleCanvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const rect = particleCanvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (particleCanvas.width !== w || particleCanvas.height !== h) {
      particleCanvas.width = w;
      particleCanvas.height = h;
    }

    const wavelengthPx = w / 3;
    const k = (2 * Math.PI) / wavelengthPx;
    const amplitude = wavelengthPx * 0.22;
    const midY = h / 2;
    const margin = amplitude + 10 * dpr;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = accent;

    const spacing = (w - 2 * margin) / (PARTICLE_COUNT - 1);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const restX = margin + i * spacing;
      const displacement = amplitude * Math.sin(k * restX - phase);
      const x = restX + displacement;
      ctx.beginPath();
      ctx.arc(x, midY, 4.5 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function particleLoop(t) {
    if (lastT == null) lastT = t;
    const dt = (t - lastT) / 1000;
    lastT = t;
    if (!reduced) phase += dt * visualHzFor(freq) * 2 * Math.PI;
    drawParticles();
    particleRaf = requestAnimationFrame(particleLoop);
  }

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    voice = audioEngine.createVoice({ freq, type: "sine", gain: 0.25 });
    stopWaveViz = drawWaveform(waveCanvas, audioEngine.analyser, { color: accent });
  }

  if (audioEngine.isStarted) {
    setupAudio();
  } else {
    drawIdleMessage(waveCanvas, "Tap Start Sound to hear it");
  }
  window.addEventListener("soundlab:started", setupAudio);

  drawParticles();
  particleRaf = requestAnimationFrame(particleLoop);

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (particleRaf) cancelAnimationFrame(particleRaf);
    if (stopWaveViz) stopWaveViz();
    if (voice) voice.stop();
  };
}
