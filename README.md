# Sound Lab

A museum-floor-style site for exploring acoustics and synthesis basics. No build step, no backend — static HTML/CSS/JS using the Web Audio API.

## Status

Milestone 5: shell, shared audio engine, progress tracking, twenty-five stations, and a Finish & Submit page. Floor groups stations by **Day 1 / Day 2 / Day 3 / Day 4** — matching the instructor's actual course sequence. Nothing is "required" to gate submission — it's free-choice exploration, and the floor's completion counter and the Finish export just report whatever a visitor actually opened, completed, and interacted with (see `js/station-registry.js` and `js/progress.js`).

- Day 1 — What Is Sound?, Frequency, Amplitude, Decibels: FS vs SPL, Periodic vs. Aperiodic, Octave Machine, Pitch × Loudness
- Day 2 — Wave Shape Gallery, Pulse Wave, Oscillator, Colors of Noise, Phase, Polarity, Constructive Interference, Destructive Interference
- Day 3 — Harmonics, Beating Patterns, Spectrum Analyzer, Spectrogram, FFT: Time ↔ Frequency
- Day 4 — Additive Synthesis vs. Subtractive Synthesis, Filters: Subtractive Synthesis, Low-Pass Filter, High-Pass Filter, Band-Pass Filter

Day 4 adds subtractive synthesis via three filter stations (Low-Pass, High-Pass, Band-Pass — cutoff only for the first two, center frequency + bandwidth for Band-Pass, with `Q = center / bandwidth`), a lighter "Filters" overview station that teases all three with an icon type selector over white noise, and an Additive Synthesis vs. Subtractive Synthesis station that runs both techniques side by side on the same target pitch. Its two panels are each other's selector: tapping a panel's own title switches audio to it, and — since a separate row of "▶ Additive"/"▶ Subtractive" buttons above the panels read as confusing extra play controls, and sat oddly far from the panels on narrow/mobile widths — turning either panel's own control (a harmonic toggle, the cutoff slider) auto-switches to it too, no separate activation step. The inactive panel visibly dims (`.ab-pane-body` opacity + desaturation) so which one you're actually hearing is unambiguous at a glance; both panels' spectra stay live regardless, via a pre-mute analyser tap — the same trick Polarity uses for its trigger reference. The three filter deep-dives default to and share a `musical loop / sawtooth tone / white noise` source picker — the loop is a short, fully-synthesized kick/snare/hihat/bass/bleep groove (`js/loop-source.js`, rendered once per AudioContext via `OfflineAudioContext` and cached) so a filter sweep has something musical, not just noise, to act on.

Every filter in Day 4 (including the Subtractive panel of Additive vs. Subtractive) runs through `js/filter-chain.js`, which cascades 4 identical BiquadFilterNodes in series instead of using one — a single biquad is only 12 dB/octave, much gentler than "filter" evokes; 4 stages gives a dramatically steeper ~48 dB/octave that reads clearly in the spectrum/spectrogram. Filters: Subtractive Synthesis's type selector and each filter station's header now show a small response-curve icon (`lowpass`/`highpass`/`bandpass` added to `js/wave-icons.js`, same pattern as the oscillator waveform icons). Also fixed along the way: `.chip.active` had no visual style at all — every `.chip`-based picker across the app (including these new ones, and FFT's pre-existing recipe buttons) was silently missing its selected-state highlight.

Additive vs. Subtractive now builds with all 9 partials instead of odd-only — its Subtractive side starts from a sawtooth (every harmonic present), so odd-only additive was converging toward a square-ish timbre instead, undercutting the "two roads to a similar tone" comparison at the heart of the station. Harmonics' fundamental moved from 110 Hz to 220 Hz (one octave up, matching Additive vs. Subtractive's existing choice) — 110 Hz was hard to hear on small built-in speakers.

The axis gridlines on those spectrum/spectrogram views were always frequency-accurate — but cascading 4 identical-frequency low/high-pass stages turned out to have a real, measured side effect (checked with `BiquadFilterNode.getFrequencyResponse`, not guessed): the RBJ digital biquad's shape puts a small bump just before the corner independent of Q (still there down to Q≈0), and stacking 4 stages compounds it into a ~7 dB peak while shifting the actual -3 dB point noticeably past the displayed cutoff (e.g. "1000 Hz" rolling off closer to 1140 Hz). `filter-chain.js` now uses a lower per-stage Q (0.3, down from 0.7071) to shrink that peak, plus empirically-measured `FREQ_COMPENSATION` ratios (1.104 for low-pass, 0.906 for high-pass — stable across the app's 100 Hz-12 kHz range) so the displayed cutoff lines up with where the spectrum actually shows it rolling off. Band-pass didn't need this — its peak stays centered on the nominal frequency regardless of Q.

Phase & Polarity split into two stations: Phase keeps the continuous 0-360° slider; Polarity is a binary invert toggle on a single tone (multiplying by -1, no sideways shift), with a flip animation and copy calling out that a lone tone's polarity is inaudible — it only matters combined with something else.

Finish collects two reflections and generates a copy-pasteable JSON export for the Canvas submission: per-station opened/completed/interaction-count/active-time, session totals, the reflections, and a SHA-256 integrity checksum (Web Crypto) over the payload — copyable to the clipboard with a manual-select fallback. Per-station "active time" is tracked by `js/time-tracker.js`, a single choke point in the router that starts/stops a timer per station and pauses it while the tab is hidden (Page Visibility API) — a rough, not-fussy time-on-task signal, not a precise stopwatch. Also fixed: double-tap-to-zoom on mobile, and Stop All Sound is now a real suspend/resume toggle instead of a one-way kill switch.

Oscillator's Square waveform now has a Width control that morphs it into a rectangle wave — same Fourier technique as the standalone Pulse Wave station, shared via `js/pulse-wave.js`.

Spectrum Analyzer now has Frequency (80 Hz – 4 kHz) and Amplitude controls for the tone sources; Frequency hides itself for the noise sources, which have no single fundamental to tune.

Spectrogram now sweeps Sine, Triangle, Square, and Sawtooth (alongside White/Pink Noise) so a visitor can see a sine as a single moving line versus the others' harmonic stacks (odd-only for triangle/square, full series for sawtooth) all sweeping together. Also fixed a rendering bug where the newest scrolling column blended onto the previous frame's leftover pixels instead of starting from black, causing swept tones to leave stale trails and noise sources to smear into a solid blob.

Harmonics now adds a Spectrum and a Spectrogram below its waveform, so toggling partials shows the same change three ways at once. FFT's old "unroll the overtones" 3D view is gone, replaced with a Spectrogram (caption now reads below the canvas, not above) — the same frequency-vs-time visualization now recurs across Harmonics, FFT, Spectrum Analyzer, and Spectrogram itself, reinforcing one shared visual language for "spectrum = one instant, spectrogram = that instant scrolling through time." Spectrogram's sweepable tone now defaults to 220 Hz and tops out at 4 kHz (was 8 kHz — the top end got shrill without adding much pedagogically).

## Running locally

Any static file server works, since the app uses ES modules (which browsers block over `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Adding a station

1. Add an entry to [`js/station-registry.js`](js/station-registry.js) with an `id`, `title`, `purpose`, `accent` color, and a `module` path.
2. Create `stations/<id>.js` exporting `mount(container, { audioEngine, accent })`, which builds the station's DOM into `container` and returns an `unmount()` function that stops any voices/animation loops it started.
3. Use `audioEngine.createVoice(...)` for oscillators and `drawWaveform(canvas, audioEngine.analyser, ...)` from [`js/visualizers.js`](js/visualizers.js) for the live waveform. Both handle click-free fades and animation-loop cleanup for you. `drawSpectrum` and `drawSpectrogram` are the frequency-domain equivalents. For `drawSpectrum` (frequency is the horizontal axis), pair it with `logPositionForFreq` to build matching axis labels in a `.spectrum-axis` element below the canvas. For `drawSpectrogram` (frequency is the *vertical* axis — the horizontal axis is time, which scrolls and isn't labeled), use `buildSpectrogramFreqAxis` instead and lay the canvas out inside a `.spectrogram-row` next to a `.spectrogram-freq-axis` element — mixing these two up mislabels a time axis with Hz values, which happened to all three spectrogram views here before it was caught and fixed. If a station shows two or more related waveforms that need to stay phase-comparable (or a single wave whose *sign* needs to stay visible, like Polarity), pass the same `triggerSource` analyser to every `drawWaveform` call — each canvas independently self-triggering to its own zero-crossing will otherwise silently erase whatever real phase/sign relationship you're trying to show.
4. The station only gets a live analyser once the visitor has pressed **Start Sound**; listen for the `soundlab:started` window event if you need to create audio lazily.
5. Report engagement with `recordInteraction(id)` on meaningful control changes and call `markComplete(id)` once your station's own completion rule is met (see [`js/progress.js`](js/progress.js)) — keep the bar forgiving, it's engagement evidence, not a test, and nothing is "required" to gate anything. Set `day: 1/2/3/4` to place it on the floor; add `hidden: true` to pull a station off the floor without deleting it (module/route still work, just not listed — see the `finish` entry for the pattern).
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
  time-tracker.js        rough per-station active-time tracking (pauses when tab is hidden)
  station-registry.js  station metadata list
  visualizers.js        waveform / spectrum / spectrogram canvas rendering
  pulse-wave.js          shared rectangular-pulse Fourier series (Oscillator + Pulse Wave)
  loop-source.js          synthesized drum/bass/bleep loop, rendered once via OfflineAudioContext
  filter-chain.js         cascades N identical BiquadFilterNodes for a steeper roll-off
  wave-icons.js          shared oscillator waveform + filter-response SVG icons
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
  fft.js               waveform + spectrum + spectrogram, three views of the same recipes
  additive-subtractive.js  same target tone, built two ways, side by side
  filters-intro.js         Day 4 overview: type selector + one shared cutoff/center slider
  filter-lowpass.js        cutoff-only low-pass, 3 sources (noise/saw/loop)
  filter-highpass.js       cutoff-only high-pass, same 3 sources
  filter-bandpass.js       center + bandwidth band-pass, same 3 sources
  finish.js           reflections + JSON export (per-station data, totals, SHA-256 checksum)
```

A station entry can also set `finish: true` instead of `day` — it renders in its own "Finish" floor section and is excluded from the floor's completion count (see `finish.js`).
