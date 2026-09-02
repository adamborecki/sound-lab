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
    id: "harmonics",
    title: "Harmonics",
    category: "harmonics",
    purpose: "Add overtones to a fundamental and watch the waveform build up.",
    required: true,
    module: "../stations/harmonics.js",
    accent: "#FFE066",
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
  {
    id: "decibels",
    title: "Decibels: FS vs SPL",
    category: "amplitude",
    purpose: "Two different meanings of \"dB\" — one digital, one physical.",
    required: false,
    module: "../stations/decibels.js",
    accent: "#4DD9C5",
  },
  {
    id: "finish",
    title: "Finish & Submit",
    category: "finish",
    purpose: "Reflect, then generate your Canvas submission receipt.",
    finish: true,
    module: "../stations/finish.js",
    accent: "#38BDF8",
  },
];

export function getStation(id) {
  return stations.find((s) => s.id === id);
}
