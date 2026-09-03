import { getState, setReflection, markComplete } from "../js/progress.js";
import { stations } from "../js/station-registry.js";

const STATION_ID = "finish";
const RECEIPT_SCHEMA = "sound-lab-receipt-v2";

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Decimal minutes, one place — this is a rough time-on-task figure (see
// js/time-tracker.js), not a precise stopwatch.
function toMinutes(ms) {
  return Math.round((ms / 60000) * 10) / 10;
}

export function mount(container) {
  const floorStations = stations.filter((s) => !s.finish && !s.hidden);

  container.innerHTML = `
    <p class="prompt">
      Two quick reflections, then generate a data export you can paste into your Canvas submission.
      It's a plain summary of which stations you opened, how much you interacted with each, and
      roughly how long you spent — nothing is required or graded on completion, this just records
      what you actually did.
    </p>

    <label class="reflection-label" for="reflection1">What is one thing you understand better after experimenting with Sound Lab?</label>
    <textarea id="reflection1" class="reflection-input" rows="3"></textarea>

    <label class="reflection-label" for="reflection2">Describe one setting or experiment where changing something produced a result you didn't expect.</label>
    <textarea id="reflection2" class="reflection-input" rows="3"></textarea>

    <button class="btn btn-start" id="generate-btn" type="button">Generate My Export</button>

    <div id="receipt-area" hidden>
      <p class="receipt-summary" id="receipt-summary"></p>
      <pre class="receipt-block" id="receipt-text"></pre>
      <button class="btn btn-stop" id="copy-btn" type="button">Copy Submission</button>
      <p class="copy-status" id="copy-status" aria-live="polite"></p>
      <p class="receipt-disclaimer">
        This is an engagement summary and integrity checksum, not proof of honest work — everything
        here lives in your browser and could be edited. It gives your instructor a consistent,
        parseable record of what you opened and roughly how long you spent, nothing more.
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
  const receiptSummary = container.querySelector("#receipt-summary");
  const receiptText = container.querySelector("#receipt-text");
  const copyBtn = container.querySelector("#copy-btn");
  const copyStatus = container.querySelector("#copy-status");

  generateBtn.addEventListener("click", async () => {
    setReflection("reflection1", r1.value);
    setReflection("reflection2", r2.value);
    const fresh = getState();

    const stationReports = floorStations.map((s) => {
      const st = fresh.stations[s.id] || {};
      return {
        id: s.id,
        title: s.title,
        day: s.day || null,
        opened: !!st.opened,
        completed: !!st.completed,
        interactions: st.interactions || 0,
        activeMinutes: toMinutes(st.activeMs || 0),
      };
    });

    const stationsOpened = stationReports.filter((s) => s.opened).length;
    const stationsCompleted = stationReports.filter((s) => s.completed).length;
    const totalInteractions = stationReports.reduce((sum, s) => sum + s.interactions, 0);
    const totalActiveMs = floorStations.reduce(
      (sum, s) => sum + (fresh.stations[s.id]?.activeMs || 0),
      0,
    );
    const totalActiveMinutes = toMinutes(totalActiveMs);

    const payload = {
      schema: RECEIPT_SCHEMA,
      sessionId: fresh.sessionId,
      startedAt: fresh.startedAt,
      generatedAt: new Date().toISOString(),
      stationsTotal: floorStations.length,
      stationsOpened,
      stationsCompleted,
      totalInteractions,
      totalActiveMinutes,
      reflection1: r1.value.trim(),
      reflection2: r2.value.trim(),
      stations: stationReports,
    };

    const hash = await sha256Hex(JSON.stringify(payload));
    const final = { ...payload, checksum: `sha256:${hash}` };

    receiptSummary.textContent = `Opened ${stationsOpened}/${floorStations.length} stations · ${totalInteractions} interactions · ~${totalActiveMinutes} min tracked`;
    receiptText.textContent = JSON.stringify(final, null, 2);
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
