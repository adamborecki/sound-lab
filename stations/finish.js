import { getState, setReflection, markComplete } from "../js/progress.js";
import { stations } from "../js/station-registry.js";

const STATION_ID = "finish";
const RECEIPT_SCHEMA = "sound-lab-receipt-v1";

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function mount(container) {
  const floorStations = stations.filter((s) => !s.finish);
  const requiredIds = floorStations.filter((s) => s.required).map((s) => s.id);
  const optionalIds = floorStations.filter((s) => !s.required).map((s) => s.id);

  container.innerHTML = `
    <p class="prompt">Two quick reflections, then generate a receipt you can paste into your Canvas submission.</p>

    <label class="reflection-label" for="reflection1">What is one thing you understand better after experimenting with Sound Lab?</label>
    <textarea id="reflection1" class="reflection-input" rows="3"></textarea>

    <label class="reflection-label" for="reflection2">Describe one setting or experiment where changing something produced a result you didn't expect.</label>
    <textarea id="reflection2" class="reflection-input" rows="3"></textarea>

    <button class="btn btn-start" id="generate-btn" type="button">Generate My Receipt</button>

    <div id="receipt-area" hidden>
      <pre class="receipt-block" id="receipt-text"></pre>
      <button class="btn btn-stop" id="copy-btn" type="button">Copy Submission</button>
      <p class="copy-status" id="copy-status" aria-live="polite"></p>
      <details class="receipt-details">
        <summary>Full checksum</summary>
        <code id="full-hash"></code>
      </details>
      <p class="receipt-disclaimer">
        This is a completion receipt and integrity checksum, not proof of honest work — everything
        here lives in your browser and could be edited. It gives your submission a consistent
        fingerprint and a quick standardized summary, nothing more.
      </p>
    </div>
  `;

  const initial = getState();
  const r1 = container.querySelector("#reflection1");
  const r2 = container.querySelector("#reflection2");
  r1.value = initial.reflections?.reflection1 || "";
  r2.value = initial.reflections?.reflection2 || "";
  r1.addEventListener("change", () => setReflection("reflection1", r1.value));
  r2.addEventListener("change", () => setReflection("reflection2", r2.value));

  const generateBtn = container.querySelector("#generate-btn");
  const receiptArea = container.querySelector("#receipt-area");
  const receiptText = container.querySelector("#receipt-text");
  const fullHash = container.querySelector("#full-hash");
  const copyBtn = container.querySelector("#copy-btn");
  const copyStatus = container.querySelector("#copy-status");

  generateBtn.addEventListener("click", async () => {
    setReflection("reflection1", r1.value);
    setReflection("reflection2", r2.value);
    const fresh = getState();

    const requiredCompleted = requiredIds.filter((id) => fresh.stations[id]?.completed);
    const optionalCompleted = optionalIds.filter((id) => fresh.stations[id]?.completed);

    const summary = {
      schema: RECEIPT_SCHEMA,
      sessionId: fresh.sessionId,
      startedAt: fresh.startedAt,
      reflection1: r1.value.trim(),
      reflection2: r2.value.trim(),
      requiredCompleted: requiredCompleted.length,
      requiredTotal: requiredIds.length,
      optionalCompleted: optionalCompleted.length,
      stationCompletionIds: [...requiredCompleted, ...optionalCompleted],
    };

    const canonical = JSON.stringify(summary, Object.keys(summary).sort());
    const hash = await sha256Hex(canonical);
    const shortHash = hash.slice(0, 8);

    receiptText.textContent = `MUS 244 SOUND LAB

Session: ${fresh.sessionId}
Required stations completed: ${summary.requiredCompleted}/${summary.requiredTotal}
Optional stations explored: ${summary.optionalCompleted}

Two things I noticed:
1. ${summary.reflection1 || "(not answered)"}
2. ${summary.reflection2 || "(not answered)"}

Completion receipt:
SL1:${fresh.sessionId}:${summary.requiredCompleted}-${summary.optionalCompleted}:${shortHash}`;
    fullHash.textContent = hash;
    receiptArea.hidden = false;
    copyStatus.textContent = "";
    markComplete(STATION_ID);
  });

  copyBtn.addEventListener("click", async () => {
    const text = receiptText.textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyStatus.textContent = "Copied!";
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents(receiptText);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      copyStatus.textContent = "Couldn't copy automatically — the text is selected, press Cmd/Ctrl+C.";
    }
  });

  return function unmount() {
    setReflection("reflection1", r1.value);
    setReflection("reflection2", r2.value);
  };
}
