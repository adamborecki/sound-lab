import { clamp, formatHz } from "../js/utils.js";
import { recordInteraction, markComplete } from "../js/progress.js";

const STATION_ID = "frequency-amplitude";
const MIN_HZ = 110;
const MAX_HZ = 1760;
const MAX_GAIN = 0.4;
const START_X = 0.5;
const START_Y = 0.5;
const CHALLENGE_THRESHOLD = 0.18;

function freqFromX(x) {
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, x);
}

export function mount(container, { audioEngine, accent }) {
  container.innerHTML = `
    <p class="prompt">Drag anywhere in the box — the corners tell you what each direction does.</p>

    <div class="xy-readouts">
      <div><span class="xy-label">Pitch</span><span class="xy-value" id="xy-freq">440 Hz</span></div>
      <div><span class="xy-label">Loudness</span><span class="xy-value" id="xy-amp">50%</span></div>
    </div>

    <div class="xy-pad" id="xy-pad" tabindex="0" role="application"
      aria-label="Pitch and loudness pad. Left and right arrow keys change pitch, up and down arrow keys change loudness.">
      <div class="xy-grid" aria-hidden="true"></div>
      <div class="xy-crosshair xy-crosshair-h" aria-hidden="true"></div>
      <div class="xy-crosshair xy-crosshair-v" aria-hidden="true"></div>
      <span class="xy-corner xy-corner-tl" aria-hidden="true">loud<br>low</span>
      <span class="xy-corner xy-corner-tr" aria-hidden="true">loud<br>high</span>
      <span class="xy-corner xy-corner-bl" aria-hidden="true">quiet<br>low</span>
      <span class="xy-corner xy-corner-br" aria-hidden="true">quiet<br>high</span>
      <div class="xy-dot" id="xy-dot" style="--accent-local: ${accent}">
        <span class="xy-hint" id="xy-hint">drag</span>
      </div>
    </div>

    <div class="challenge-row">
      <div class="challenge-chip" id="challenge-hq">
        <span class="challenge-check">○</span> Reach quiet · high
      </div>
      <div class="challenge-chip" id="challenge-lq">
        <span class="challenge-check">○</span> Reach loud · low
      </div>
    </div>
  `;

  const freqOut = container.querySelector("#xy-freq");
  const ampOut = container.querySelector("#xy-amp");
  const pad = container.querySelector("#xy-pad");
  const dot = container.querySelector("#xy-dot");
  const hint = container.querySelector("#xy-hint");
  const chipHQ = container.querySelector("#challenge-hq");
  const chipLQ = container.querySelector("#challenge-lq");

  let voice = null;
  let x = START_X;
  let y = START_Y;
  let dragging = false;
  let hqAchieved = false;
  let lqAchieved = false;

  const freq0 = freqFromX(START_X);
  const amp0 = 1 - START_Y;

  function render() {
    dot.style.left = `${x * 100}%`;
    dot.style.top = `${y * 100}%`;
    const freq = freqFromX(x);
    const amp = 1 - y;
    freqOut.textContent = formatHz(freq);
    ampOut.textContent = `${Math.round(amp * 100)}%`;
    if (voice) {
      voice.setFreq(freq, 0.03);
      voice.setGain(amp * MAX_GAIN);
    }
    return { freq, amp };
  }

  function checkChallenges(freq, amp) {
    const freqUp = freq > freq0 * (1 + CHALLENGE_THRESHOLD);
    const freqDown = freq < freq0 * (1 - CHALLENGE_THRESHOLD);
    const ampUp = amp > amp0 + CHALLENGE_THRESHOLD;
    const ampDown = amp < amp0 - CHALLENGE_THRESHOLD;

    if (!hqAchieved && freqUp && ampDown) {
      hqAchieved = true;
      chipHQ.classList.add("achieved");
      chipHQ.querySelector(".challenge-check").textContent = "✓";
    }
    if (!lqAchieved && freqDown && ampUp) {
      lqAchieved = true;
      chipLQ.classList.add("achieved");
      chipLQ.querySelector(".challenge-check").textContent = "✓";
    }
    if (hqAchieved && lqAchieved) markComplete(STATION_ID);
  }

  function updateFromXY(nx, ny, userInitiated) {
    x = clamp(nx, 0, 1);
    y = clamp(ny, 0, 1);
    const { freq, amp } = render();
    if (userInitiated) {
      if (hint) hint.remove();
      recordInteraction(STATION_ID);
      checkChallenges(freq, amp);
    }
  }

  function xyFromEvent(e) {
    const rect = pad.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  pad.addEventListener("pointerdown", (e) => {
    dragging = true;
    pad.setPointerCapture(e.pointerId);
    pad.focus();
    const p = xyFromEvent(e);
    updateFromXY(p.x, p.y, true);
  });
  pad.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const p = xyFromEvent(e);
    updateFromXY(p.x, p.y, true);
  });
  pad.addEventListener("pointerup", () => {
    dragging = false;
  });
  pad.addEventListener("pointercancel", () => {
    dragging = false;
  });

  pad.addEventListener("keydown", (e) => {
    const step = 0.04;
    let nx = x;
    let ny = y;
    if (e.key === "ArrowLeft") nx -= step;
    else if (e.key === "ArrowRight") nx += step;
    else if (e.key === "ArrowUp") ny -= step;
    else if (e.key === "ArrowDown") ny += step;
    else return;
    e.preventDefault();
    updateFromXY(nx, ny, true);
  });

  function setupAudio() {
    if (!audioEngine.isStarted || voice) return;
    const { freq, amp } = render();
    voice = audioEngine.createVoice({ freq, type: "sine", gain: amp * MAX_GAIN });
  }

  if (audioEngine.isStarted) setupAudio();
  window.addEventListener("soundlab:started", setupAudio);

  render();

  return function unmount() {
    window.removeEventListener("soundlab:started", setupAudio);
    if (voice) voice.stop();
  };
}
