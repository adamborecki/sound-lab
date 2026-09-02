import { clamp, prefersReducedMotion } from "./utils.js";

function fitCanvasToDisplaySize(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  const targetW = Math.round(width * dpr);
  const targetH = Math.round(height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }
  return dpr;
}

// Draws a live time-domain waveform from an AnalyserNode. Returns a stop
// function; the caller must invoke it when the station is hidden/unmounted
// so no animation loop keeps running in the background.
export function drawWaveform(canvas, analyser, options = {}) {
  const ctx = canvas.getContext("2d");
  const color = options.color || "#7CE0FF";
  const lineWidth = options.lineWidth || 3;
  // A caller-supplied display gain, separate from the voice's actual audio
  // gain — lets a station keep waveforms visually consistent even when
  // different waveform types are deliberately mixed at different playback
  // levels for perceived-loudness matching. Number or a () => number getter
  // for callers that need it to change live (e.g. switching wave shape).
  const ampScaleOpt = options.ampScale;
  const getAmpScale = () =>
    typeof ampScaleOpt === "function" ? ampScaleOpt() : ampScaleOpt ?? 1;
  // Optional "zoom": how many samples to draw across the canvas width.
  // Number or a () => number getter for a live zoom slider. Defaults to
  // roughly half the buffer, same as before this option existed.
  const windowOpt = options.windowSamples;
  const getWindowSamples = () =>
    typeof windowOpt === "function" ? windowOpt() : windowOpt ?? null;
  let raf = null;
  let stopped = false;
  const reduced = prefersReducedMotion();
  const frameGap = reduced ? 200 : 0; // ms between redraws when reduced motion is requested
  let lastDraw = 0;

  const data = new Uint8Array(analyser.fftSize);

  // Without this, each animation frame samples a different, uncorrelated
  // slice of phase, so a perfectly periodic tone looks like it's jittering
  // in place. Locking the draw window to a rising zero-crossing (the way a
  // hardware oscilloscope triggers) makes the shape hold still instead.
  function findTriggerOffset(searchLimit) {
    for (let i = 1; i < searchLimit; i++) {
      if (data[i - 1] < 128 && data[i] >= 128) return i;
    }
    return 0;
  }

  function render(t) {
    if (stopped) return;
    if (t - lastDraw < frameGap) {
      raf = requestAnimationFrame(render);
      return;
    }
    lastDraw = t;

    const dpr = fitCanvasToDisplaySize(canvas);
    const w = canvas.width;
    const h = canvas.height;

    analyser.getByteTimeDomainData(data);

    const requestedWindow = getWindowSamples();
    // A requested window is a desired *draw* length, with an equal budget
    // set aside before it for trigger search — capped by the real buffer.
    const totalWindow =
      requestedWindow == null
        ? data.length
        : Math.max(4, Math.min(Math.round(requestedWindow) * 2, data.length));
    const searchLimit = Math.floor(totalWindow / 2);
    const drawLength = totalWindow - searchLimit;

    const offset = findTriggerOffset(searchLimit);
    const ampScale = getAmpScale();

    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = lineWidth * dpr;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();

    const sliceWidth = w / drawLength;
    let x = 0;
    for (let i = 0; i < drawLength; i++) {
      const raw = data[offset + i] / 128.0 - 1; // -1..1
      const v = clamp(raw * ampScale, -1, 1);
      const y = h / 2 + v * (h / 2) * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();

    raf = requestAnimationFrame(render);
  }

  raf = requestAnimationFrame(render);

  return function stop() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

// Renders a static "not playing yet" waveform placeholder, no animation loop.
export function drawIdleMessage(canvas, message) {
  const ctx = canvas.getContext("2d");
  const dpr = fitCanvasToDisplaySize(canvas);
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `${14 * dpr}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(message, w / 2, h / 2 - 12 * dpr);
}
