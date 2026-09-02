// Single shared entry point for the "start audio" gesture. Anything that
// wants to trigger sound (the entry overlay, a station's inline prompt)
// calls this instead of touching the audio engine directly, so there's one
// place that owns the started-event contract.
import { audioEngine } from "./audio-engine.js";

export async function requestStart() {
  if (audioEngine.isStarted) return;
  await audioEngine.start();
  window.dispatchEvent(new CustomEvent("soundlab:started"));
}
