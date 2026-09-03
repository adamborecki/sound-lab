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

  // Web Audio unconditionally zeroes the DC term (real[0]/imag[0] are
  // ignored per spec), but a true bipolar pulse away from 50% duty has a
  // nonzero DC bias (2*duty - 1) — stripping it shifts the whole
  // reconstructed wave's baseline by that same amount. Left uncorrected,
  // the entire shape visibly translates up/down as duty changes, not just
  // changes shape. There's no way to keep *both* plateaus at a fixed
  // level once DC is forced to 0 (that's a real constraint, not a bug),
  // so instead we lock whichever plateau is narrower — the more visually
  // prominent "spike" — to a constant peak, letting only the wide, flatter
  // baseline drift. This is also what a real pulse wave looks like on an
  // AC-coupled scope.
  const scale = 1 / (2 * Math.max(duty, 1 - duty));
  for (let n = 1; n <= HARMONIC_COUNT; n++) {
    real[n] = scale * (4 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: true });
}
