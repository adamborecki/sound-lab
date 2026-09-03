// Rough time-on-task tracking, one active station at a time. Not fussy: it
// pauses while the tab is hidden (Page Visibility API) so backgrounded tabs
// don't inflate the numbers, but it can't detect an idle-but-visible tab —
// good enough for an approximate homework-engagement signal, not a precise
// stopwatch.
import { addActiveTime } from "./progress.js";

let currentId = null;
let segmentStart = null;

function commit() {
  if (currentId && segmentStart != null) {
    addActiveTime(currentId, Date.now() - segmentStart);
  }
  segmentStart = null;
}

function resumeSegment() {
  if (currentId && !document.hidden) segmentStart = Date.now();
}

export function setActiveStation(id) {
  commit();
  currentId = id;
  resumeSegment();
}

export function clearActiveStation() {
  commit();
  currentId = null;
}

document.addEventListener("visibilitychange", () => {
  commit();
  resumeSegment();
});

// Best-effort flush before the tab actually closes/unloads.
window.addEventListener("pagehide", commit);
