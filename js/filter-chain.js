// A single BiquadFilterNode is only 2nd-order (12 dB/octave) — a real
// filter, but much gentler-looking/sounding than what "low-pass" or
// "band-pass" evokes for most students. Cascading several identical
// stages in series multiplies the roll-off (4 stages = 8th-order, ~48
// dB/octave) for a dramatically steeper, more recognizable shape. This is
// a deliberate simplification, not a textbook Butterworth cascade (which
// would stagger each stage's Q) — good enough for a visual/pedagogical
// demo, not fussy.
const STAGES = 4;

export function createFilterChain(ctx, type, stageCount = STAGES) {
  const nodes = [];
  for (let i = 0; i < stageCount; i++) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    nodes.push(node);
  }
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);

  return {
    input: nodes[0],
    output: nodes[nodes.length - 1],
    setType(t) {
      for (const n of nodes) n.type = t;
    },
    setFrequency(hz, time, ramp = 0.02) {
      for (const n of nodes) n.frequency.setTargetAtTime(hz, time, ramp);
    },
    setQ(q, time, ramp = 0.02) {
      for (const n of nodes) n.Q.setTargetAtTime(q, time, ramp);
    },
    disconnect() {
      for (const n of nodes) n.disconnect();
    },
  };
}
