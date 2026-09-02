// Central list of stations. Add a new station by adding one entry here and
// a module in /stations that exports mount(container, ctx) -> unmount().
export const stations = [
  {
    id: "frequency",
    title: "Frequency",
    category: "sound",
    purpose: "Turn one big knob and hear pitch go up and down.",
    required: true,
    module: "../stations/frequency.js",
    accent: "#7CE0FF",
  },
  {
    id: "amplitude",
    title: "Amplitude",
    category: "sound",
    purpose: "Change loudness without touching pitch.",
    required: true,
    module: "../stations/amplitude.js",
    accent: "#FF7CD6",
  },
  {
    id: "waveforms",
    title: "Wave Shape Gallery",
    category: "timbre",
    purpose: "Same pitch, four different shapes. Why does it sound different?",
    required: true,
    module: "../stations/waveforms.js",
    accent: "#FFC96B",
  },
  {
    id: "oscillator",
    title: "Oscillator",
    category: "oscillators",
    purpose: "The thing that makes the wave in the first place.",
    required: true,
    module: "../stations/oscillator.js",
    accent: "#B48CFF",
  },
  {
    id: "frequency-amplitude",
    title: "Pitch × Loudness",
    category: "sound",
    purpose: "Two dimensions, one pad. Prove they're independent.",
    required: true,
    module: "../stations/frequency-amplitude.js",
    accent: "#6BFFB0",
  },
  {
    id: "octave",
    title: "Octave Machine",
    category: "frequency",
    purpose: "Double it, halve it. Meet the family a note belongs to.",
    required: false,
    module: "../stations/octave.js",
    accent: "#FF9B7C",
  },
];

export function getStation(id) {
  return stations.find((s) => s.id === id);
}
