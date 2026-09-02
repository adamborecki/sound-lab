// Local, forgiving progress tracking. No server, no PII — just enough
// state to know what's been opened/completed and let the floor show it.
const STORAGE_KEY = "soundlab.progress.v1";

function newSessionId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) return parsed;
    }
  } catch (e) {
    /* corrupt or unavailable storage — start fresh */
  }
  const now = new Date().toISOString();
  return {
    version: 1,
    sessionId: newSessionId(),
    startedAt: now,
    lastUpdatedAt: now,
    stations: {},
  };
}

const state = loadState();
const listeners = new Set();

function save() {
  state.lastUpdatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    /* storage full/unavailable — progress just won't persist */
  }
  for (const fn of listeners) fn(state);
}

function ensureStation(id) {
  if (!state.stations[id]) {
    state.stations[id] = { opened: false, completed: false, interactions: 0 };
  }
  return state.stations[id];
}

export function getState() {
  return state;
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function recordOpen(id) {
  const s = ensureStation(id);
  if (!s.opened) {
    s.opened = true;
    s.firstOpenedAt = new Date().toISOString();
  }
  save();
}

export function recordInteraction(id) {
  const s = ensureStation(id);
  s.interactions += 1;
  save();
}

export function isComplete(id) {
  return !!state.stations[id]?.completed;
}

export function markComplete(id) {
  const s = ensureStation(id);
  if (!s.completed) {
    s.completed = true;
    s.completedAt = new Date().toISOString();
    save();
  }
}

export function requiredSummary(stationIds) {
  const total = stationIds.length;
  const done = stationIds.filter((id) => isComplete(id)).length;
  return { done, total };
}
