# Sound Lab

A museum-floor-style site for exploring acoustics and synthesis basics. No build step, no backend — static HTML/CSS/JS using the Web Audio API.

## Status

Milestone 4: shell, shared audio engine, progress tracking, twenty stations, and a Finish & Submit page. Floor groups stations by **Day 1 / Day 2 / Day 3** — matching the instructor's actual course sequence rather than an arbitrary required/optional split — with a single overall "baseline complete" banner once all required stations are done (Pitch × Loudness is currently the only deliberate bonus/optional station, tagged with a "Bonus" badge instead of being segregated into its own section).

- Day 1 — What Is Sound?, Frequency, Amplitude, Decibels: FS vs SPL, Periodic vs. Aperiodic, Octave Machine, Pitch × Loudness (bonus)
- Day 2 — Wave Shape Gallery, Pulse Wave, Oscillator, Colors of Noise, Phase, Polarity, Constructive Interference, Destructive Interference
- Day 3 — Harmonics, Beating Patterns, Spectrum Analyzer, Spectrogram, FFT: Time ↔ Frequency

Phase & Polarity split into two stations: Phase keeps the continuous 0-360° slider; Polarity is a binary invert toggle on a single tone (multiplying by -1, no sideways shift), with a flip animation and copy calling out that a lone tone's polarity is inaudible — it only matters combined with something else.

Finish collects two reflections and generates a Canvas submission receipt with a SHA-256 completion checksum (Web Crypto), copyable to the clipboard with a manual-select fallback. Also fixed: double-tap-to-zoom on mobile, and Stop All Sound is now a real suspend/resume toggle instead of a one-way kill switch.

Oscillator's Square waveform now has a Width control that morphs it into a rectangle wave — same Fourier technique as the standalone Pulse Wave station, shared via `js/pulse-wave.js`.

## Running locally

Any static file server works, since the app uses ES modules (which browsers block over `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Adding a station

1. Add an entry to [`js/station-registry.js`](js/station-registry.js) with an `id`, `title`, `purpose`, `accent` color, and a `module` path.
2. Create `stations/<id>.js` exporting `mount(container, { audioEngine, accent })`, which builds the station's DOM into `container` and returns an `unmount()` function that stops any voices/animation loops it started.
3. Use `audioEngine.createVoice(...)` for oscillators and `drawWaveform(canvas, audioEngine.analyser, ...)` from [`js/visualizers.js`](js/visualizers.js) for the live waveform. Both handle click-free fades and animation-loop cleanup for you. `drawSpectrum` and `drawSpectrogram` are the frequency-domain equivalents; `logPositionForFreq` keeps a station's own axis labels aligned with either. If a station shows two or more related waveforms that need to stay phase-comparable (or a single wave whose *sign* needs to stay visible, like Polarity), pass the same `triggerSource` analyser to every `drawWaveform` call — each canvas independently self-triggering to its own zero-crossing will otherwise silently erase whatever real phase/sign relationship you're trying to show.
4. The station only gets a live analyser once the visitor has pressed **Start Sound**; listen for the `soundlab:started` window event if you need to create audio lazily.
5. Report engagement with `recordInteraction(id)` on meaningful control changes and call `markComplete(id)` once your station's own completion rule is met (see [`js/progress.js`](js/progress.js)) — keep the bar forgiving, it's engagement evidence, not a test. Set `day: 1/2/3` to place it on the floor and `required: true/false` to control whether it counts toward the baseline banner (false gets a "Bonus" badge instead of being segregated into its own section).
6. For anything beyond a single oscillator voice — two voices summed (interference/beating), a custom periodic wave (Harmonics/Pulse), a dedicated wide/high-resolution analyser (Periodic's zoom, Spectrum Analyzer, Spectrogram) — drop to `audioEngine.ctx`/`audioEngine.masterGain` directly rather than fighting `createVoice`'s single-oscillator shape. Several stations do this; it's the established pattern, not a workaround.

## Structure

```
index.html
css/
  base.css        shell, layout, top bar, start overlay
  stations.css    station cards + shared control styles
js/
  app.js              hash router, mounts/unmounts stations, floor rendering
  audio-engine.js      one AudioContext, one master gain, voice + noise-voice helpers
  audio-start.js        shared "start audio" gesture entry point
  progress.js            localStorage-backed completion tracking, reflections, checks
  station-registry.js  station metadata list
  visualizers.js        waveform / spectrum / spectrogram canvas rendering
  pulse-wave.js          shared rectangular-pulse Fourier series (Oscillator + Pulse Wave)
  wave-icons.js          shared oscillator waveform SVG icons
  utils.js               small shared helpers
stations/
  sound-waves.js       longitudinal (particles) vs. transverse, compression/rarefaction
  frequency.js
  amplitude.js
  decibels.js         live dBFS meter + static dB SPL reference chart
  periodic.js         zoomable waveform: periodic vs. aperiodic (noise)
  octave.js
  frequency-amplitude.js
  waveforms.js
  pulse.js            variable-duty-cycle pulse wave, waveform + spectrum
  oscillator.js
  colors-of-noise.js   white/pink/red/violet/blue, live spectrum per color
  phase.js              continuous phase slider, A/B/Sum waveforms
  polarity.js            binary invert toggle, single tone, flip animation
  constructive-interference.js
  destructive-interference.js
  harmonics.js
  beating.js           two near-equal frequencies, the beat envelope
  spectrum.js          live frequency-domain view of the same sources
  spectrogram.js       scrolling frequency-vs-time waterfall
  fft.js               waveform + spectrum + experimental "unrolled overtones" view
  finish.js           reflections + Canvas receipt + SHA-256 checksum
```

A station entry can also set `finish: true` instead of `day`/`required` — it renders in its own "Finish" floor section and is excluded from the baseline count (see `finish.js`).
