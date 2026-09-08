// Tiny inline icon per oscillator waveform, shared by any station that
// lets a student pick a wave shape. Also doubles as a home for filter
// frequency-response shapes (lowpass/highpass/bandpass) — same viewBox and
// stroke style, just tracing a response curve instead of an oscillation.
const PATHS = {
  sine: "M0 10 Q5 1 10 10 T20 10 T30 10 T40 10",
  triangle: "M0 18 L10 2 L20 18 L30 2 L40 18",
  square: "M0 4 L10 4 L10 16 L20 16 L20 4 L30 4 L30 16 L40 16",
  sawtooth: "M0 16 L10 2 L10 16 L20 2 L20 16 L30 2 L30 16 L40 2",
  noise: "M0 10 L4 4 L8 16 L12 2 L16 18 L20 6 L24 14 L28 4 L32 16 L36 8 L40 12",
  lowpass: "M0 5 L14 5 Q20 5 24 11 Q28 17 40 17",
  highpass: "M0 17 Q12 17 16 11 Q20 5 26 5 L40 5",
  bandpass: "M0 17 Q8 17 12 9 Q16 3 20 3 Q24 3 28 9 Q32 17 40 17",
};

export function waveIconSvg(type) {
  return `<svg class="wave-icon" viewBox="0 0 40 20" aria-hidden="true">
    <path d="${PATHS[type]}" fill="none" stroke="currentColor" stroke-width="2.5"
      stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}
