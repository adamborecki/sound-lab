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
  // These coefficients are already the exact ones for a true ±1 bipolar
  // pulse — createPeriodicWave's default auto-normalization would instead
  // rescale to the peak of our *finite*, 40-harmonic approximation, which
  // includes a Gibbs-phenomenon overshoot spike whose size shifts with
  // duty cycle. Normalizing to that shifting peak was dragging the whole
  // wave's visible/audible level along with it — the shape changed
  // correctly, but so did the height, which wasn't the point. Disabling
  // normalization keeps the flat body at a consistent level throughout;
  // the overshoot is left to briefly exceed ±1 by a few percent, same as
  // any band-limited square/pulse approximation.
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}
