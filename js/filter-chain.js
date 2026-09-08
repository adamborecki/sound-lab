// A single BiquadFilterNode is only 2nd-order (12 dB/octave) — a real
// filter, but much gentler-looking/sounding than what "low-pass" or
// "band-pass" evokes for most students. Cascading several identical
// stages in series multiplies the roll-off (4 stages = 8th-order, ~48
// dB/octave) for a dramatically steeper, more recognizable shape.
//
// Cascading identical-frequency lowpass/highpass sections has a real
// side effect, though: the RBJ digital biquad's shape (from its fixed
// numerator zeros, independent of Q — verified with getFrequencyResponse
// down to Q≈0, where the bump is still there) puts a small bump just
// before the corner, and stacking N identical stages compounds it in dB.
// A low per-stage Q keeps that bump as small as practical, and the
// FREQ_COMPENSATION ratios below (measured the same way, stable across
// 100 Hz-12 kHz) pull the actual -3 dB point back to line up with the
// frequency a station displays — without them, "cutoff: 1000 Hz" would
// visibly cut off closer to ~1100 Hz. Band-pass's *peak position* doesn't
// need this — it stays essentially centered regardless of Q — but its
// *bandwidth* has the same kind of compounding problem: 4 identical
// bandpass stages at the same Q narrow the cascade's actual -3 dB width
// to less than half of what a single stage's Q = center/bandwidth would
// give (measured ~2.2x narrower, stable across the practical range) —
// see bandpassQ below.
const STAGES = 4;
const STAGE_Q = 0.3;
const BANDPASS_BW_COMPENSATION = 2.2;
const FREQ_COMPENSATION = {
  lowpass: 1.104,
  highpass: 0.906,
  bandpass: 1,
};

// The Q to feed a 4-stage bandpass chain so its actual -3 dB bandwidth
// matches `bandwidth`, not the ~2.2x-narrower result naive Q = center /
// bandwidth would give once cascaded.
export function bandpassQ(center, bandwidth, min = 0.15, max = 40) {
  const q = center / (bandwidth * BANDPASS_BW_COMPENSATION);
  return Math.min(max, Math.max(min, q));
}

export function createFilterChain(ctx, type, stageCount = STAGES) {
  const nodes = [];
  for (let i = 0; i < stageCount; i++) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.Q.value = STAGE_Q;
    nodes.push(node);
  }
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);

  let currentType = type;
  let lastHz = null;

  function compensate(hz) {
    return hz / (FREQ_COMPENSATION[currentType] || 1);
  }

  return {
    input: nodes[0],
    output: nodes[nodes.length - 1],
    setType(t) {
      currentType = t;
      for (const n of nodes) n.type = t;
      if (lastHz != null) this.setFrequency(lastHz, ctx.currentTime, 0);
    },
    setFrequency(hz, time, ramp = 0.02) {
      lastHz = hz;
      const compensated = compensate(hz);
      for (const n of nodes) n.frequency.setTargetAtTime(compensated, time, ramp);
    },
    setQ(q, time, ramp = 0.02) {
      // Band-pass's Q is the student-facing bandwidth control and isn't
      // touched by the peaking workaround above.
      for (const n of nodes) n.Q.setTargetAtTime(q, time, ramp);
    },
    disconnect() {
      for (const n of nodes) n.disconnect();
    },
  };
}
