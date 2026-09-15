// A single held-note voice shaped by an ADSR (Attack/Decay/Sustain/Release)
// envelope — the standard "how loud, over time, from press to release"
// model behind almost every synthesizer voice. Params are seconds for
// attack/decay/release and a 0-1 fraction of peak for sustain.
export function createAdsrVoice(ctx, { freq = 330, type = "triangle", peak = 0.3 } = {}) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;

  const envGain = ctx.createGain();
  envGain.gain.value = 0;
  osc.connect(envGain);
  osc.start();

  let params = { attack: 0.02, decay: 0.15, sustain: 0.6, release: 0.3 };

  function noteOn() {
    const now = ctx.currentTime;
    const g = envGain.gain;
    // Anchor at the current (possibly mid-ramp) value before scheduling new
    // ramps — otherwise a fast re-press while still releasing would snap
    // the level instead of continuing smoothly from where it actually is.
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(peak, now + Math.max(0.001, params.attack));
    g.linearRampToValueAtTime(
      peak * params.sustain,
      now + Math.max(0.001, params.attack) + Math.max(0.001, params.decay),
    );
  }

  function noteOff() {
    const now = ctx.currentTime;
    const g = envGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + Math.max(0.001, params.release));
  }

  return {
    output: envGain,
    setParams(next) {
      params = { ...params, ...next };
    },
    getLevel: () => envGain.gain.value / peak,
    noteOn,
    noteOff,
    stop() {
      try {
        osc.stop();
      } catch (e) {
        /* already stopped */
      }
      osc.disconnect();
      envGain.disconnect();
    },
  };
}
