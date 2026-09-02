# Sound Lab

A museum-floor-style site for exploring acoustics and synthesis basics. No build step, no backend — static HTML/CSS/JS using the Web Audio API.

## Status

Milestone 3+: shell, shared audio engine, progress tracking, eight stations (Frequency, Amplitude, Wave Shape Gallery, Oscillator, Pitch × Loudness, Harmonics, Octave Machine, Decibels: FS vs SPL), and a Finish & Submit page. Floor groups stations into Start Here / Explore / Finish and shows a baseline-complete banner once all required stations are done. Finish collects two reflections and generates a Canvas submission receipt with a SHA-256 completion checksum (Web Crypto), copyable to the clipboard with a manual-select fallback. Also fixed: double-tap-to-zoom on mobile, and Stop All Sound is now a real suspend/resume toggle instead of a one-way kill switch.

## Running locally

Any static file server works, since the app uses ES modules (which browsers block over `file://`):

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Adding a station

1. Add an entry to [`js/station-registry.js`](js/station-registry.js) with an `id`, `title`, `purpose`, `accent` color, and a `module` path.
2. Create `stations/<id>.js` exporting `mount(container, { audioEngine, accent })`, which builds the station's DOM into `container` and returns an `unmount()` function that stops any voices/animation loops it started.
3. Use `audioEngine.createVoice(...)` for oscillators and `drawWaveform(canvas, audioEngine.analyser, ...)` from [`js/visualizers.js`](js/visualizers.js) for the live waveform. Both handle click-free fades and animation-loop cleanup for you.
4. The station only gets a live analyser once the visitor has pressed **Start Sound**; listen for the `soundlab:started` window event if you need to create audio lazily.
5. Report engagement with `recordInteraction(id)` on meaningful control changes and call `markComplete(id)` once your station's own completion rule is met (see [`js/progress.js`](js/progress.js)) — keep the bar forgiving, it's engagement evidence, not a test. Set `required: true/false` in the registry entry to control whether it counts toward the baseline and which floor section it lands in.

## Structure

```
index.html
css/
  base.css        shell, layout, top bar, start overlay
  stations.css    station cards + shared control styles
js/
  app.js              hash router, mounts/unmounts stations, floor rendering
  audio-engine.js      one AudioContext, one master gain, voice helpers
  audio-start.js        shared "start audio" gesture entry point
  progress.js            localStorage-backed completion tracking, reflections, checks
  station-registry.js  station metadata list
  visualizers.js        waveform canvas rendering
  wave-icons.js          shared oscillator waveform SVG icons
  utils.js               small shared helpers
stations/
  frequency.js
  amplitude.js
  waveforms.js
  oscillator.js
  frequency-amplitude.js
  harmonics.js
  octave.js
  decibels.js         live dBFS meter + static dB SPL reference chart
  finish.js           reflections + Canvas receipt + SHA-256 checksum
```

A station entry can also set `finish: true` instead of `required`/optional — it renders in its own "Finish" floor section and is excluded from the baseline count (see `finish.js`).
