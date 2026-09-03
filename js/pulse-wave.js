// Shared rectangular-pulse Fourier series, used by both the Pulse Wave
// station and Oscillator's "square → rectangle" width control.
//
// A pulse wave centered at t=0 is an even function, so it's built from
// pure cosine terms (real[]) rather than the sine terms (imag[]) Harmonics
// uses. Standard rectangular-pulse series: the nth harmonic's amplitude is
// (4/nπ)·sin(nπ·duty). At duty=0.5 this collapses exactly to a square
// wave's odd-harmonics-only, 1/n-falloff spectrum.
const HARMONIC_COUNT = 40;
export const MIN_DUTY = 2;
export const MAX_DUTY = 98;

export function buildPulseWave(ctx, dutyPercent) {
  const duty = dutyPercent / 100;
  const real = new Float32Array(HARMONIC_COUNT + 1);
  const imag = new Float32Array(HARMONIC_COUNT + 1);
  for (let n = 1; n <= HARMONIC_COUNT; n++) {
    real[n] = (4 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag);
}
