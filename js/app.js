import { audioEngine } from "./audio-engine.js";
import { requestStart } from "./audio-start.js";
import { stations, getStation } from "./station-registry.js";
import { recordOpen, isComplete, requiredSummary } from "./progress.js";

const floorEl = document.getElementById("floor");
const stageEl = document.getElementById("stage");
const overlay = document.getElementById("start-overlay");
const overlayStartBtn = document.getElementById("overlay-start-btn");
const stopBtn = document.getElementById("stop-all");

let currentUnmount = null;

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
    card.innerHTML = `
      ${complete ? '<span class="badge badge-complete">✓ Done</span>' : ""}
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

  const requiredStations = stations.filter((s) => s.required && !s.finish);
  const optionalStations = stations.filter((s) => !s.required && !s.finish);
  const finishStations = stations.filter((s) => s.finish);
  const { done, total } = requiredSummary(requiredStations.map((s) => s.id));

  const intro = document.createElement("p");
  intro.className = "floor-intro";
  intro.textContent = "Pick a station. Touch things. See what happens.";
  floorEl.appendChild(intro);

  if (total > 0) {
    if (done >= total) {
      const banner = document.createElement("div");
      banner.className = "baseline-banner";
      banner.innerHTML =
        "<strong>Baseline complete ✓</strong> You have enough for the Canvas submission. Keep exploring if you want — there's more below.";
      floorEl.appendChild(banner);
    } else {
      const summary = document.createElement("p");
      summary.className = "floor-summary";
      summary.textContent = `${done}/${total} required stations complete`;
      floorEl.appendChild(summary);
    }
  }

  if (requiredStations.length) {
    floorEl.appendChild(sectionHeading("Start Here"));
    floorEl.appendChild(stationGrid(requiredStations));
  }
  if (optionalStations.length) {
    floorEl.appendChild(sectionHeading("Explore"));
    floorEl.appendChild(stationGrid(optionalStations));
  }
  if (finishStations.length) {
    floorEl.appendChild(sectionHeading("Finish"));
    floorEl.appendChild(stationGrid(finishStations));
  }
}

async function renderStation(id) {
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
    <a class="back-link" href="#/">← Floor</a>
    <h2>${station.title}</h2>
  `;
  stageEl.appendChild(header);

  const body = document.createElement("div");
  body.className = "stage-body";
  stageEl.appendChild(body);

  recordOpen(station.id);
  const mod = await import(station.module);
  currentUnmount = mod.mount(body, { audioEngine, accent: station.accent });
}

function route() {
  const hash = location.hash || "#/";
  const stationMatch = hash.match(/^#\/station\/([\w-]+)/);

  if (stationMatch) {
    floorEl.hidden = true;
    stageEl.hidden = false;
    renderStation(stationMatch[1]);
  } else {
    if (currentUnmount) {
      currentUnmount();
      currentUnmount = null;
    }
    renderFloor();
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

stopBtn.addEventListener("click", () => {
  audioEngine.stopAll();
});

window.addEventListener("hashchange", route);
route();
