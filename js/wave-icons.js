// Tiny inline icon per oscillator waveform, shared by any station that
// lets a student pick a wave shape.
const PATHS = {
  sine: "M0 10 Q5 1 10 10 T20 10 T30 10 T40 10",
  triangle: "M0 18 L10 2 L20 18 L30 2 L40 18",
  square: "M0 4 L10 4 L10 16 L20 16 L20 4 L30 4 L30 16 L40 16",
  sawtooth: "M0 16 L10 2 L10 16 L20 2 L20 16 L30 2 L30 16 L40 2",
};

export function waveIconSvg(type) {
  return `<svg class="wave-icon" viewBox="0 0 40 20" aria-hidden="true">
    <path d="${PATHS[type]}" fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}
