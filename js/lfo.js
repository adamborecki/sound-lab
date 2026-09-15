// A low-frequency oscillator for modulating another AudioParam — connect
// `.output` directly to the target param (osc.frequency, gain.gain, a
// filter's frequency, ...). Web Audio sums a direct param connection with
// whatever value setTargetAtTime/etc. already put there, so the LFO output
// is the *deviation* around whatever base value the caller sets separately.
export function createLfo(ctx, { rate = 4, depth = 0, type = "sine" } = {}) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = rate;

  const depthGain = ctx.createGain();
  depthGain.gain.value = depth;
  osc.connect(depthGain);
  osc.start();

  return {
    output: depthGain,
    setRate(hz, time, ramp = 0.05) {
      osc.frequency.setTargetAtTime(hz, time, ramp);
    },
    setDepth(d, time, ramp = 0.05) {
      depthGain.gain.setTargetAtTime(d, time, ramp);
    },
    stop() {
      try {
        osc.stop();
      } catch (e) {
        /* already stopped */
      }
      osc.disconnect();
      depthGain.disconnect();
    },
  };
}
