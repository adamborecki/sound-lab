import { audioEngine } from "./audio-engine.js";
import { requestStart } from "./audio-start.js";
import { stations, getStation } from "./station-registry.js";
import { recordOpen, isComplete, completionSummary } from "./progress.js";
import { setActiveStation, clearActiveStation } from "./time-tracker.js";

const floorEl = document.getElementById("floor");
const stageEl = document.getElementById("stage");
const overlay = document.getElementById("start-overlay");
const overlayStartBtn = document.getElementById("overlay-start-btn");
const stopBtn = document.getElementById("stop-all");

let currentUnmount = null;
// Has renderFloor() actually run this session? Guards against treating a
// fresh deep link straight into a station as "came from floor" — that would
// send the back link's history.back() off the site entirely, since there's
// no real floor entry behind it in session history.
let floorRendered = false;

function sectionHeading(text) {
  const h = document.createElement("h2");
  h.className = "floor-section-heading";
  h.textContent = text;
  return h;
}

function stationGrid(list) {
  const grid = document.createElement("div");
  grid.className = "station-grid";
  for (const station of list) {
    const complete = isComplete(station.id);
    const card = document.createElement("a");
    card.className = "station-card";
    card.href = `#/station/${station.id}`;
    card.style.setProperty("--accent", station.accent);
    const badge = complete ? '<span class="badge badge-complete">✓ Done</span>' : "";
    card.innerHTML = `
      ${badge}
      <h3>${station.title}</h3>
      <p>${station.purpose}</p>
      <span class="enter-hint">Enter →</span>
    `;
    grid.appendChild(card);
  }
  return grid;
}

function renderFloor() {
  floorEl.innerHTML = "";

  // Grouped in the order sections first appear in station-registry.js, not
  // a fixed day list — so a day can split into multiple named sections
  // (see Day 5's "Modulation: LFOs" / "Modulation: ADSR") just by giving
  // some of its stations a `section` override, no changes needed here.
  const sections = new Map();
  const finishStations = [];
  for (const s of stations) {
    if (s.hidden) continue;
    if (s.finish) {
      finishStations.push(s);
      continue;
    }
    if (!s.day) continue;
    const heading = s.section || `Day ${s.day}`;
    if (!sections.has(heading)) sections.set(heading, []);
    sections.get(heading).push(s);
  }

  const floorIds = stations.filter((s) => !s.finish && !s.hidden).map((s) => s.id);
  const { done, total } = completionSummary(floorIds);

  const intro = document.createElement("p");
  intro.className = "floor-intro";
  intro.textContent = "Pick a station. Touch things. See what happens.";
  floorEl.appendChild(intro);

  const soundHelp = document.createElement("details");
  soundHelp.className = "sound-help";
  soundHelp.innerHTML = `
    <summary>Not hearing anything?</summary>
    <ul>
      <li>On iPhone, check that Silent Mode isn't on — Sound Lab won't play through it.</li>
      <li>Check your volume is turned up and no other app has it muted.</li>
      <li>Make sure you tapped "Start Sound" at least once this visit.</li>
      <li>Try headphones — some laptop speakers roll off the low end used at low frequencies.</li>
    </ul>
  `;
  floorEl.appendChild(soundHelp);

  if (total > 0) {
    const summary = document.createElement("p");
    summary.className = "floor-summary";
    summary.textContent =
      done >= total ? `All ${total} stations explored ✓` : `${done}/${total} stations completed`;
    floorEl.appendChild(summary);
  }

  for (const [heading, list] of sections) {
    floorEl.appendChild(sectionHeading(heading));
    floorEl.appendChild(stationGrid(list));
  }
  if (finishStations.length) {
    floorEl.appendChild(sectionHeading("Finish"));
    floorEl.appendChild(stationGrid(finishStations));
  }
}

async function renderStation(id, cameFromFloor) {
  const station = getStation(id);
  if (!station) {
    location.hash = "#/";
    return;
  }

  if (currentUnmount) {
    currentUnmount();
    currentUnmount = null;
  }

  stageEl.innerHTML = "";
  stageEl.style.setProperty("--accent", station.accent);

  const header = document.createElement("div");
  header.className = "stage-header";
  header.innerHTML = `
    <a class="back-link" href="#/">← Home</a>
    <h2>${station.title}</h2>
  `;
  stageEl.appendChild(header);

  // A plain hash link always works, but it can't restore the floor's scroll
  // position the way a real back-navigation does. When we know this station
  // was reached by clicking a card (not a direct/deep link), intercept the
  // click and use history.back() instead — same destination, but the
  // browser's native scroll restoration puts the floor back where it was.
  if (cameFromFloor) {
    header.querySelector(".back-link").addEventListener("click", (e) => {
      e.preventDefault();
      history.back();
    });
  }

  const body = document.createElement("div");
  body.className = "stage-body";
  stageEl.appendChild(body);

  recordOpen(station.id);
  setActiveStation(station.id);
  const mod = await import(station.module);
  currentUnmount = mod.mount(body, { audioEngine, accent: station.accent });
}

function route() {
  const hash = location.hash || "#/";
  const stationMatch = hash.match(/^#\/station\/([\w-]+)/);

  if (stationMatch) {
    const cameFromFloor = floorRendered;
    floorEl.hidden = true;
    stageEl.hidden = false;
    renderStation(stationMatch[1], cameFromFloor);
  } else {
    if (currentUnmount) {
      currentUnmount();
      currentUnmount = null;
    }
    clearActiveStation();
    renderFloor();
    floorRendered = true;
    floorEl.hidden = false;
    stageEl.hidden = true;
  }
}

overlayStartBtn.addEventListener("click", async () => {
  await requestStart();
  overlay.classList.add("dismissed");
  setTimeout(() => {
    overlay.hidden = true;
  }, 300);
  stopBtn.hidden = false;
});

function setStoppedUI() {
  stopBtn.textContent = "▶ Resume Sound";
  stopBtn.classList.remove("btn-stop");
  stopBtn.classList.add("btn-start");
}

function setRunningUI() {
  stopBtn.textContent = "■ Stop All Sound";
  stopBtn.classList.remove("btn-start");
  stopBtn.classList.add("btn-stop");
}

stopBtn.addEventListener("click", async () => {
  if (audioEngine.isSuspended) {
    await audioEngine.resume();
    setRunningUI();
  } else {
    await audioEngine.suspend();
    setStoppedUI();
  }
});

window.addEventListener("hashchange", route);
route();
