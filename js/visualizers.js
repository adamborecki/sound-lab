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

  // When several canvases show related signals (e.g. wave A, wave B, and
  // their sum) that must stay phase-comparable, each one finding its *own*
  // trigger point independently would silently re-sync every wave to its
  // own zero-crossing — erasing whatever real phase relationship existed
  // between them. Passing the same triggerSource analyser to all of them
  // anchors every draw to one shared reference instant instead.
  const triggerSource = options.triggerSource || analyser;
  const usesOwnData = triggerSource === analyser;
  const triggerData = usesOwnData ? data : new Uint8Array(triggerSource.fftSize);

  // Without this, each animation frame samples a different, uncorrelated
  // slice of phase, so a perfectly periodic tone looks like it's jittering
  // in place. Locking the draw window to a rising zero-crossing (the way a
  // hardware oscilloscope triggers) makes the shape hold still instead.
  function findTriggerOffset(searchLimit) {
    for (let i = 1; i < searchLimit; i++) {
      if (triggerData[i - 1] < 128 && triggerData[i] >= 128) return i;
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
    // A hidden canvas (display:none, e.g. a station toggling between two
    // visualizations) has no layout box, so its rect — and therefore w/h
    // here — is 0. drawImage throws on a zero-size source/destination, and
    // there's nothing to usefully draw anyway, so just wait for it to come
    // back rather than erroring every frame.
    if (w === 0 || h === 0) {
      raf = requestAnimationFrame(render);
      return;
    }

    analyser.getByteTimeDomainData(data);
    if (!usesOwnData) triggerSource.getByteTimeDomainData(triggerData);

    const requestedWindow = getWindowSamples();
    // A requested window is a desired *draw* length, with an equal budget
    // set aside before it for trigger search — capped by the real buffer.
    const totalWindow =
      requestedWindow == null
        ? data.length
        : Math.max(4, Math.min(Math.round(requestedWindow) * 2, data.length));
    // Clamped to triggerData's own length too, in case a caller pairs
    // analysers of different fftSizes.
    const searchLimit = Math.min(Math.floor(totalWindow / 2), triggerData.length);
    const drawLength = totalWindow - Math.floor(totalWindow / 2);

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

// Fraction (0..1) of the way from minHz to maxHz on a log scale — shared
// between drawSpectrum and any station that draws its own frequency-axis
// labels, so the two always agree on where a given Hz value sits.
export function logPositionForFreq(freq, minHz, maxHz) {
  const t =
    (Math.log(freq) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz));
  return clamp(t, 0, 1);
}

// Builds vertical frequency-axis tick labels for a drawSpectrogram canvas.
// A spectrogram's horizontal axis is time (it scrolls), not frequency —
// frequency is vertical (top = highest, per drawSpectrogram's own mapping)
// — so this is deliberately not just logPositionForFreq reused sideways;
// mixing the two up mislabels a time axis with Hz values.
export function buildSpectrogramFreqAxis(axisEl, labels, minHz, maxHz) {
  axisEl.innerHTML = "";
  for (const hz of labels) {
    const topPct = (1 - logPositionForFreq(hz, minHz, maxHz)) * 100;
    const tick = document.createElement("span");
    tick.textContent = hz >= 1000 ? `${hz / 1000}k Hz` : `${hz} Hz`;
    tick.style.top = `${topPct}%`;
    if (hz <= minHz) tick.style.transform = "translateY(-100%)";
    axisEl.appendChild(tick);
  }
}

// Draws a live frequency-domain bar chart from an AnalyserNode (magnitude
// per bin, log-scaled x-axis so octaves get equal screen space — the way
// real spectrum analyzers read). Same stop-function contract as
// drawWaveform. Generic over whatever's connected to the analyser, so any
// future station (colored noise, a 3D view, etc.) can reuse this as-is.
export function drawSpectrum(canvas, analyser, options = {}) {
  const ctx = canvas.getContext("2d");
  const color = options.color || "#7CE0FF";
  const minHz = options.minHz || 20;
  const maxHz = options.maxHz || Math.min(20000, analyser.context.sampleRate / 2);
  let raf = null;
  let stopped = false;
  const reduced = prefersReducedMotion();
  const frameGap = reduced ? 200 : 0;
  let lastDraw = 0;

  const data = new Uint8Array(analyser.frequencyBinCount);
  const binHz = analyser.context.sampleRate / analyser.fftSize;

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
    // A hidden canvas (display:none, e.g. a station toggling between two
    // visualizations) has no layout box, so its rect — and therefore w/h
    // here — is 0. drawImage throws on a zero-size source/destination, and
    // there's nothing to usefully draw anyway, so just wait for it to come
    // back rather than erroring every frame.
    if (w === 0 || h === 0) {
      raf = requestAnimationFrame(render);
      return;
    }

    analyser.getByteFrequencyData(data);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;

    const barWidth = Math.max(1.5 * dpr, 1);
    for (let i = 1; i < data.length; i++) {
      const freq = i * binHz;
      if (freq < minHz || freq > maxHz) continue;
      const x = logPositionForFreq(freq, minHz, maxHz) * w;
      const amp = data[i] / 255;
      const barHeight = amp * h * 0.95;
      ctx.fillRect(x, h - barHeight, barWidth, barHeight);
    }

    raf = requestAnimationFrame(render);
  }

  raf = requestAnimationFrame(render);

  return function stop() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Scrolling frequency-vs-time waterfall (a real spectrogram): each frame
// shifts the existing image one column left and draws a fresh column at
// the right, colored by amplitude at each log-scaled frequency. Same
// stop-function contract as drawWaveform/drawSpectrum.
export function drawSpectrogram(canvas, analyser, options = {}) {
  const ctx = canvas.getContext("2d");
  const { r, g, b } = hexToRgb(options.color || "#7CE0FF");
  const minHz = options.minHz || 20;
  const maxHz = options.maxHz || Math.min(20000, analyser.context.sampleRate / 2);
  const fps = options.fps || 20;
  const frameGap = 1000 / fps;
  let raf = null;
  let stopped = false;
  let lastDraw = 0;
  let initialized = false;

  const data = new Uint8Array(analyser.frequencyBinCount);
  const binHz = analyser.context.sampleRate / analyser.fftSize;

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
    // A hidden canvas (display:none, e.g. a station toggling between two
    // visualizations) has no layout box, so its rect — and therefore w/h
    // here — is 0. drawImage throws on a zero-size source/destination, and
    // there's nothing to usefully draw anyway, so just wait for it to come
    // back rather than erroring every frame.
    if (w === 0 || h === 0) {
      raf = requestAnimationFrame(render);
      return;
    }

    if (!initialized) {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      initialized = true;
    }

    // Shift everything left by exactly one physical pixel (source = canvas
    // itself), then draw the newest spectrum slice into that same
    // one-pixel-wide column — the shift and the new column must match
    // widths exactly or the image smears at high pixel-density displays.
    ctx.drawImage(canvas, 1, 0, w - 1, h, 0, 0, w - 1, h);

    // The shift above only touches columns [0, w-2] — the new rightmost
    // column still holds whatever was drawn there last frame. Without
    // clearing it first, the alpha-blended fillRect below blends onto that
    // stale pixel instead of black, so quiet bins never fully fade and old
    // bright spots (e.g. a swept sine's previous pitch) linger for many
    // frames instead of vanishing on the next silent one.
    ctx.fillStyle = "#000";
    ctx.fillRect(w - 1, 0, 1, h);

    analyser.getByteFrequencyData(data);
    for (let y = 0; y < h; y++) {
      const frac = 1 - y / h; // top of canvas = highest frequency
      const freq = minHz * Math.pow(maxHz / minHz, frac);
      const binIndex = Math.min(data.length - 1, Math.round(freq / binHz));
      const amp = data[binIndex] / 255;
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${amp})`;
      ctx.fillRect(w - 1, y, 1, 1);
    }

    raf = requestAnimationFrame(render);
  }

  raf = requestAnimationFrame(render);

  return function stop() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
}

// Scrolling level-vs-time line — for anything that moves too slowly to see
// in a normal waveform (an ADSR envelope's attack/decay/release ramps, or a
// tremolo LFO's amplitude wobble). drawWaveform's window is capped at the
// analyser's fftSize (a few dozen milliseconds at most), far too short to
// show a change that plays out over whole seconds; this instead samples a
// plain 0-1 level getter once per frame and redraws the whole scrolling
// history each time, so it works for anything, not just audio nodes. Same
// stop-function contract as the others.
export function drawEnvelope(canvas, getLevel, options = {}) {
  const ctx = canvas.getContext("2d");
  const color = options.color || "#7CE0FF";
  const fps = options.fps || 30;
  const frameGap = 1000 / fps;
  const historySeconds = options.historySeconds || 3;
  const maxPoints = Math.max(2, Math.round(historySeconds * fps));
  const history = new Array(maxPoints).fill(0);
  let raf = null;
  let stopped = false;
  let lastDraw = 0;

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
    // A hidden canvas (display:none, e.g. a station toggling between two
    // visualizations) has no layout box, so its rect — and therefore w/h
    // here — is 0. drawImage throws on a zero-size source/destination, and
    // there's nothing to usefully draw anyway, so just wait for it to come
    // back rather than erroring every frame.
    if (w === 0 || h === 0) {
      raf = requestAnimationFrame(render);
      return;
    }

    history.shift();
    history.push(clamp(getLevel(), 0, 1));

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(0, h - 1);
    ctx.lineTo(w, h - 1);
    ctx.stroke();

    const topMargin = 8 * dpr;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * dpr;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const x = (i / (history.length - 1)) * w;
      const y = h - 1 - history[i] * (h - topMargin - 1);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
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

// A crude but necessary envelope follower: peak amplitude of an analyser's
// current time-domain buffer. AudioParam.value only reflects *scripted*
// automation (setValueAtTime/linearRampToValueAtTime/etc.) — a signal
// connected directly to a param as audio-rate modulation (an LFO driving a
// gain, say) is summed in at the audio-thread level and never shows up in
// a JS-side .value read, so reading the param directly for a drawEnvelope
// getLevel would just report a flat, wrong number. This instead measures
// the real, already-summed output from actual samples. Assumes whatever
// oscillator feeds the chain has amplitude ±1 (true for a plain
// oscillator), so the returned peak equals the instantaneous gain — scale
// it yourself against whatever "1.0" should mean for your station.
export function createLevelFollower(analyser) {
  const data = new Uint8Array(analyser.fftSize);
  return function getLevel() {
    analyser.getByteTimeDomainData(data);
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i] / 128 - 1);
      if (v > peak) peak = v;
    }
    return peak;
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
