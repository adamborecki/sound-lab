# Sound Lab

A museum-floor-style site for exploring acoustics and synthesis basics. No build step, no backend — static HTML/CSS/JS using the Web Audio API.

## Status

Milestone 8: shell, shared audio engine, progress tracking, forty-one stations, and a Finish & Submit page. Floor groups stations by **Day 1 / Day 2 / Day 3 / Day 4**, then Day 5 splits into four named sections — **EQ: Peak, Shelf & Notch**, **Formants: Vowels as Frequency**, **Modulation: LFOs**, and **Modulation: ADSR** — instead of one flat "Day 5" (a station's `section` field overrides the default "Day N" heading; see `js/station-registry.js`'s header comment and `js/app.js`'s `renderFloor`, which groups stations by first-appearance order of `section || "Day N"` rather than a fixed day list). Nothing is "required" to gate submission — it's free-choice exploration, and the floor's completion counter and the Finish export just report whatever a visitor actually opened, completed, and interacted with (see `js/station-registry.js` and `js/progress.js`).

A station's "← Home" link (`js/app.js`) used to be a plain `href="#/"` — that always worked, but returning to a floor scrolled deep into, say, the EQ section landed back at the top, since a link click is a forward navigation and only a real back-navigation gets the browser's native scroll restoration. Fixed by tracking whether the floor has actually been rendered this session (`floorRendered`, set the first time `route()` takes the non-station branch) and, when a station was reached that way, intercepting the link's click to call `history.back()` instead — same destination, but scroll comes back for free. A station opened via a direct/deep link (no floor render behind it yet) keeps the plain `href="#/"` fallback, so the link never risks calling `history.back()` off the site entirely.

- Day 1 — What Is Sound?, Frequency, Amplitude, Decibels: FS vs SPL, Periodic vs. Aperiodic, Octave Machine, Pitch × Loudness
- Day 2 — Wave Shape Gallery, Pulse Wave, Oscillator, Colors of Noise, Phase, Polarity, Constructive Interference, Destructive Interference
- Day 3 — Harmonics, Beating Patterns, Spectrum Analyzer, Spectrogram, FFT: Time ↔ Frequency
- Day 4 — Additive Synthesis vs. Subtractive Synthesis, Filters: Subtractive Synthesis, Low-Pass Filter, High-Pass Filter, Band-Pass Filter
- Day 5, EQ: Peak, Shelf & Notch — EQ: Peak, Shelf & Notch, Parametric EQ (Peak / Bell), Low Shelf, High Shelf, Notch Filter
- Day 5, Formants: Vowels as Frequency — Vowels as Frequency
- Day 5, Modulation: LFOs — LFO: Low-Frequency Oscillator, Vibrato, Tremolo, Auto-Wah, LFO Shape
- Day 5, Modulation: ADSR — Release, Attack, Sustain, Decay, ADSR: Putting It Together

Day 5 opens with EQ: unlike Day 4's Low-Pass/High-Pass/Band-Pass, which draw a hard line and remove everything past it, `peaking`/`lowshelf`/`highshelf`/`notch` are natively-implemented `BiquadFilterNode` types with a built-in gain param — boost or cut a region instead of cutting it outright. That also means none of Day 4's cascade-and-compensate machinery applies: a single node's Q and gain already match the number a student sets, since there's no 4-stage chain compounding them (see the comment atop `stations/eq-intro.js`). EQ: Peak, Shelf & Notch is an overview station mirroring Filters: Subtractive Synthesis's shape (a type selector over white noise, swapping which controls are visible — Gain for the three boost/cut types, Width (Q) for Peak and Notch, neither for the shelves); four deep-dives follow, each with the same `musical loop / sawtooth tone / white noise` source picker as Day 4's filter stations. Notch reuses Band-Pass's "Bandwidth in Hz" framing rather than exposing raw Q, converting with the plain `center / bandwidth` formula — no `bandpassQ()`-style compensation needed since a single notch node isn't cascaded. Vowels as Frequency follows as its own section: a simplified single-formant demo (a real vowel is shaped by two or three resonances at once) that runs a buzzy low sawtooth through one strong peaking boost and lets a student sweep it through five preset frequencies (250 Hz-4 kHz, roughly "oo" through "ee") to hear a plain buzz turn vowel-like — proof that vowel identity rides on where a spectral peak sits, not on pitch.

Day 5 continues into modulation and envelopes, LFOs first. LFO is 5 stations: an overview with a target selector (Vibrato/Tremolo/Auto-Wah sharing Rate + Depth controls, swapping between a spectrogram and an envelope-graph visualization depending on target), one deep-dive per target, and LFO Shape. `js/lfo.js` is a tiny shared oscillator-plus-depth-gain pair — connect `.output` straight to whatever AudioParam you want wobbled (frequency for vibrato, gain for tremolo, a filter's frequency for auto-wah); Web Audio sums a direct param connection with whatever base value is already there. Vibrato and Auto-Wah reuse the spectrogram (a slow pitch or cutoff wobble is exactly what a multi-second scrolling frequency-vs-time view is for — vibrato shows the whole harmonic stack riding the wobble together); Auto-Wah runs it over the same synthesized loop from the Day 4 filter stations, through a single resonant bandpass (not the steep 4-stage `filter-chain.js` — that was built for static-cutoff clarity, and modulating it would fight the frequency-compensation math meant for a fixed target). Tremolo needed real work: `AudioParam.value` only reflects *scripted* automation, not an incoming audio-rate connection, so reading the gain node's `.value` for the graph (as ADSR correctly does, since it's pure scripted automation) always reported a flat, wrong number for an LFO-driven gain. Fixed with `createLevelFollower()` in `js/visualizers.js`, a small envelope follower that reads the peak of an analyser's actual samples instead.

LFO Shape addresses a specific confusion: "waveform" names two unrelated things in this app — the carrier oscillator's shape (its timbre, what you hear) and the LFO's own shape (how the modulation moves, felt rather than heard directly). The station puts independent Sine/Triangle/Square/Sawtooth pickers on each and shows both live at once: `drawWaveform` on an analyser tapped straight off the carrier oscillator (before the tremolo gain node, so it stays a clean, unmodulated view of the carrier's own shape regardless of depth) and `drawEnvelope` on the LFO's own output. The LFO view needed a new visualizer helper: `createLevelFollower()` returns peak *magnitude*, which is exactly wrong here — `Math.abs()` folds a sawtooth's falling half on top of its rising half (making it look like a triangle) and makes a bipolar square wave indistinguishable from a unipolar one. `createSignalSampler()` (also in `js/visualizers.js`) returns the raw *signed* instantaneous sample instead, read straight off a small analyser tapped onto the LFO's depth-gain output before it reaches the target param — one sample per frame is plenty for something this slow, no windowed analysis needed.

ADSR is 5 stations: Release, Attack, Sustain, and Decay each isolate one parameter (the other three held at fixed, sensible defaults) and are meant to be visited in that order, then "Putting It Together" combines all four with presets (Pluck, Slow Pad, Organ, Bowed Swell). Every ADSR station uses a press-and-hold "note pad" (Pointer Events with `setPointerCapture` so a drag off the button still releases cleanly) driving `js/adsr-voice.js`, a shared voice that schedules the attack→decay ramp on press and the release ramp on note-off via `linearRampToValueAtTime`, always anchored to the gain's actual current value first (`setValueAtTime(g.value, now)`) so a fast re-press mid-release doesn't snap. The envelope itself is drawn by `drawEnvelope` in `js/visualizers.js` — a scrolling level-vs-time line that samples a plain 0-1 getter once per frame, for anything that moves too slowly for a normal waveform view (which is capped at the analyser's fftSize, a few dozen milliseconds at most) to show at all — Tremolo above reuses this same function.

Two CSS bugs surfaced while wiring LFO's target-swapped visualizations: `.spectrogram-row` and `.spectrum-canvas` both set their own `display` property, which — being an *author* rule — silently wins over the browser's built-in `[hidden] { display: none }` even though neither rule is more specific; toggling `.hidden` on either did nothing until an explicit `.spectrogram-row[hidden]` / `.spectrum-canvas[hidden]` override was added (matching the existing `.sg-freq-control[hidden]` pattern from Spectrogram). Also hardened all four `visualizers.js` draw loops (`drawWaveform`/`drawSpectrum`/`drawSpectrogram`/`drawEnvelope`) to skip a frame instead of erroring when their canvas has zero size — exactly what a hidden, `display:none` canvas measures as, which `drawSpectrogram`'s `drawImage` call throws on outright.

Day 4 adds subtractive synthesis via three filter stations (Low-Pass, High-Pass, Band-Pass — cutoff only for the first two, center frequency + bandwidth for Band-Pass via `bandpassQ()` in `js/filter-chain.js`), a lighter "Filters" overview station that teases all three with an icon type selector over white noise, and an Additive Synthesis vs. Subtractive Synthesis station that runs both techniques side by side on the same target pitch. Its two panels are each other's selector: tapping a panel's own title switches audio to it, and — since a separate row of "▶ Additive"/"▶ Subtractive" buttons above the panels read as confusing extra play controls, and sat oddly far from the panels on narrow/mobile widths — turning either panel's own control (a harmonic toggle, the cutoff slider) auto-switches to it too, no separate activation step. The inactive panel visibly dims (`.ab-pane-body` opacity + desaturation) so which one you're actually hearing is unambiguous at a glance; both panels' spectra stay live regardless, via a pre-mute analyser tap — the same trick Polarity uses for its trigger reference. The three filter deep-dives default to and share a `musical loop / sawtooth tone / white noise` source picker — the loop is a short, fully-synthesized kick/snare/hihat/bass/bleep groove (`js/loop-source.js`, rendered once per AudioContext via `OfflineAudioContext` and cached) so a filter sweep has something musical, not just noise, to act on.

Every filter in Day 4 (including the Subtractive panel of Additive vs. Subtractive) runs through `js/filter-chain.js`, which cascades 4 identical BiquadFilterNodes in series instead of using one — a single biquad is only 12 dB/octave, much gentler than "filter" evokes; 4 stages gives a dramatically steeper ~48 dB/octave that reads clearly in the spectrum/spectrogram. Filters: Subtractive Synthesis's type selector and each filter station's header now show a small response-curve icon (`lowpass`/`highpass`/`bandpass` added to `js/wave-icons.js`, same pattern as the oscillator waveform icons). Also fixed along the way: `.chip.active` had no visual style at all — every `.chip`-based picker across the app (including these new ones, and FFT's pre-existing recipe buttons) was silently missing its selected-state highlight.

Additive vs. Subtractive now builds with all 9 partials instead of odd-only — its Subtractive side starts from a sawtooth (every harmonic present), so odd-only additive was converging toward a square-ish timbre instead, undercutting the "two roads to a similar tone" comparison at the heart of the station. Harmonics' fundamental moved from 110 Hz to 220 Hz (one octave up, matching Additive vs. Subtractive's existing choice) — 110 Hz was hard to hear on small built-in speakers.

Band-Pass's bandwidth had the same category of bug as the low/high-pass cutoff mismatch above: cascading 4 identical-frequency bandpass stages at the same Q narrows the cascade's actual -3 dB width to less than half of what a single stage's `Q = center / bandwidth` implies (measured ~2.2x narrower, stable across the practical range). `bandpassQ()` in `js/filter-chain.js` compensates so the displayed bandwidth roughly matches what's actually audible/visible — used by both Band-Pass Filter and Filters: Subtractive Synthesis's band-pass mode.

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
5. Report engagement with `recordInteraction(id)` on meaningful control changes and call `markComplete(id)` once your station's own completion rule is met (see [`js/progress.js`](js/progress.js)) — keep the bar forgiving, it's engagement evidence, not a test, and nothing is "required" to gate anything. Set `day: 1/2/3/4/5` to place it on the floor; add `hidden: true` to pull a station off the floor without deleting it (module/route still work, just not listed — see the `finish` entry for the pattern).
6. If you toggle `hidden` on an element via JS, check it actually disappears — a class that sets its own `display` (`.spectrum-canvas`, `.spectrogram-row`, flex/grid containers in general) silently beats the browser's default `[hidden] { display: none }` since both are author-vs-UA-stylesheet, not a specificity fight. Add an explicit `.your-class[hidden] { display: none; }` rule (see `.sg-freq-control[hidden]` for the existing pattern) rather than assuming `hidden = true` always works.
7. `drawEnvelope(canvas, getLevel, options)` in `js/visualizers.js` is for anything that changes too slowly for a normal waveform view to show (that one's capped at the analyser's fftSize — a few dozen milliseconds). Pass it a plain `() => 0..1` getter. If the value you're graphing comes from an `AudioParam` being driven by scripted automation (`linearRampToValueAtTime` etc., as ADSR does), reading `.value` directly is fine and exact. If it's being modulated by a *direct audio-rate connection* instead (an LFO wired straight into a gain or frequency param, as `js/lfo.js` does), `.value` won't reflect that — it only ever reports the scripted/intrinsic value, never what's summed in from a connected node — so use `createLevelFollower(analyser)` instead, which measures the real, already-mixed samples. That one returns a peak *magnitude* (`Math.abs()`'d, always ≥ 0) — fine for a level/envelope, wrong if you need the signal's actual sign (a bipolar LFO's own waveform, say, where `abs()` would fold a sawtooth into looking like a triangle). Use `createSignalSampler(analyser)` instead for that — same idea, but returns the raw signed sample.
8. For anything beyond a single oscillator voice — two voices summed (interference/beating), a custom periodic wave (Harmonics/Pulse), a dedicated wide/high-resolution analyser (Periodic's zoom, Spectrum Analyzer, Spectrogram) — drop to `audioEngine.ctx`/`audioEngine.masterGain` directly rather than fighting `createVoice`'s single-oscillator shape. Several stations do this; it's the established pattern, not a workaround.
9. `.big-readout`/`.big-slider` (a giant number + full-width slider) are sized for *one* headline control per station — stack 3 or 4 of them and the page is mostly scrolling before any visualization shows, which is what happened to EQ's Peak/Bell station and ADSR's "Putting It Together" before it was caught. If a station needs more than one control, give the single most important one the big treatment and put the rest in a `.control-row` of `.control-compact` items (smaller `.compact-readout`/`.compact-slider`, 2+ side by side, stacking to one column under 480px) — see `stations/eq-intro.js` or `stations/adsr-combined.js`.

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
  lfo.js                  shared low-frequency oscillator — connect .output to any AudioParam
  adsr-voice.js           shared press/hold voice driven by an Attack/Decay/Sustain/Release envelope
  wave-icons.js          shared oscillator waveform + filter-response SVG icons
  utils.js               small shared helpers (clamp, formatHz, formatDb, ...)
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
  eq-intro.js              EQ: Peak, Shelf & Notch overview — type selector, conditional Gain/Q controls
  filter-peak.js           parametric peak/bell: center + gain + Q, same 3 sources
  filter-lowshelf.js       low shelf: corner + gain, same 3 sources
  filter-highshelf.js      high shelf: corner + gain, same 3 sources
  filter-notch.js          notch: center + bandwidth (Band-Pass's evil twin), same 3 sources
  vowel-formants.js        single-formant sweep over a buzzy tone, 5 vowel presets
  lfo-intro.js             Modulation: LFOs overview — target selector, swaps spectrogram/envelope-graph viz
  lfo-vibrato.js           LFO -> pitch, spectrogram shows the whole harmonic stack wobble
  lfo-tremolo.js           LFO -> amplitude, envelope graph (waveform view is too fast to show it)
  lfo-autowah.js           LFO -> filter cutoff, over the same synthesized loop as the filter stations
  lfo-shape.js             carrier vs. LFO waveform, independent pickers, both shown live at once
  adsr-release.js          isolates Release, others fixed
  adsr-attack.js           isolates Attack, others fixed
  adsr-sustain.js          isolates Sustain level, others fixed
  adsr-decay.js            isolates Decay, others fixed
  adsr-combined.js         all four together, plus presets
  finish.js           reflections + JSON export (per-station data, totals, SHA-256 checksum)
```

A station entry can also set `finish: true` instead of `day` — it renders in its own "Finish" floor section and is excluded from the floor's completion count (see `finish.js`).
