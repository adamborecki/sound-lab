export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function formatHz(hz) {
  if (hz >= 1000) {
    const khz = hz / 1000;
    return `${khz % 1 === 0 ? khz.toFixed(0) : khz.toFixed(2)} kHz`;
  }
  return `${Math.round(hz)} Hz`;
}

export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Small helper for wiring a <input type="range"> + numeric readout together.
export function bindSlider(slider, onChange) {
  slider.addEventListener("input", () => onChange(Number(slider.value)));
}
