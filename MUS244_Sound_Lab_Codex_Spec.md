# MUS 244 Interactive Acoustics & Synthesis Lab
## Product / Build Specification for Codex

**Working title:** Sound Lab  
**Course context:** MUS 244 — Principles of Music Technology  
**Primary use:** Interactive accompaniment / optional extended exploration for the first three class meetings on acoustics and synthesis  
**Deployment target:** GitHub Pages, under Adam Borecki's existing `adamborecki/webapps` project  
**Recommended initial path:** `webapps/musictech/sound-lab/`  
**Possible later standalone repo:** `sound-lab` or `acoustics-synthesis-lab`

---

## 1. Product vision

Build an unusually fun, immediate, museum-exhibit-style website for learning introductory acoustics and synthesis concepts.

The reference feeling is:

- Chrome Music Lab
- Ableton Learning Synths
- OMSI / hands-on science museum exhibit
- a playful music-tech installation
- NOT a conventional LMS lesson
- NOT primarily a quiz
- NOT a giant synthesizer interface
- NOT a textbook placed on a web page

The app should feel like a collection of **many small interactive stations**.

Each station should:

1. teach or reinforce one tiny idea;
2. have one obvious thing to touch immediately;
3. make sound and/or move visually;
4. use only the visualization needed for that concept;
5. allow free experimentation;
6. optionally include one or two tiny challenges or questions;
7. contribute to a lightweight completion record.

The student should be able to understand what a control does mostly by touching it.

---

## 2. Repository recommendation

### Recommended for version 1

Use the existing:

`adamborecki/webapps`

and create:

`musictech/sound-lab/`

Reason:

- `webapps` already exists specifically as a showcase of live web apps.
- It already describes itself as containing music-tech lessons, instruments, utilities, and visual experiments.
- It already has a `musictech/` directory.
- It already has a GitHub Pages deployment / landing-page workflow.
- This lets the project become usable quickly without creating additional deployment infrastructure.

### Later option

If Sound Lab becomes a significant open educational resource with many units, external contributors, issues, releases, documentation, etc., split it into its own repository and leave a launch card/link in `webapps`.

Potential standalone names:

1. `sound-lab`
2. `acoustics-synthesis-lab`
3. `interactive-sound-lab`
4. `music-tech-sound-lab`

**Preferred public-facing name:** `Sound Lab`

Avoid making the public title too course-specific. It should be useful beyond MUS 244 even though MUS 244 determines the initial curriculum.

---

## 3. Core design rule: many tiny stations

Do not build one giant synth.

The home screen should present a growing collection of small experiments, probably grouped into broad categories.

Possible top-level categories:

- Sound
- Frequency & Pitch
- Amplitude & Loudness
- Waves
- Timbre
- Oscillators
- Combining Sounds
- Harmonics
- Synthesis
- Experiments
- Challenges

Not every category needs to exist in v1.

A station should normally fit on one screen or one compact vertical section.

The student should be able to enter a station, understand the central interaction within a few seconds, play with it, and leave.

---

## 4. Curriculum boundary

The initial app should be grounded in the material actually introduced during MUS 244 Acoustics & Synthesis Days 1–3.

Use the course slide deck as the source of truth.

Important implementation rule:

> Do not silently add advanced synthesis concepts merely because they are common in synthesizers.

If a term is not yet part of the first-three-day curriculum, either omit it or place it in an explicitly labeled optional / bonus area.

The initial content should strongly emphasize foundational concepts such as:

- sound as vibration
- sound waves / pressure waves
- waveform visualization
- amplitude
- decibels where relevant to the existing course vocabulary
- frequency
- Hertz / Hz
- kilohertz / kHz
- frequency and perceived pitch
- human hearing range where covered
- octave relationships
- periodic vs. aperiodic sound
- waveshape
- timbre
- sine wave
- square wave
- triangle wave
- sawtooth wave
- oscillator
- basic synthesis concepts that have actually appeared by Day 3
- harmonics / overtones only to the depth already established in the slides

### Explicit scope guard

Do not turn omitted material into required material.

For example, if the class intentionally omits period/frequency calculations, the website should not suddenly require students to calculate period from frequency.

It may visualize relationships without turning them into a math unit.

---

## 5. Experience hierarchy

There should be three levels of engagement.

### Level A — Bare minimum / required path

Clearly marked.

The student should be able to complete this path without doing everything.

Target feeling:

> “Do these few stations and you have completed today's baseline.”

Potential baseline:

- Frequency
- Amplitude
- Waveshape / Timbre
- Oscillator
- Harmonics / Combining Waves
- one synthesis station
- final reflection / submission receipt

The exact required list should be configurable in one data structure.

### Level B — Explore more

Lots of optional stations.

Students who finish early should have interesting things to continue doing.

The app should make continued exploration more attractive than leaving class early.

Examples:

- weird waveform comparisons
- beat-frequency experiments if in scope
- harmonic recipes
- random challenge generator
- “make this sound” games
- mystery waveform identification
- octave exploration
- compare spectra
- combine oscillators
- extreme settings
- listening-only experiments
- visual-only experiments

### Level C — Lab / debug / everything mode

A hidden or clearly labeled advanced page may expose many simultaneous meters and controls.

This is the one place where a big “engineering view” is acceptable.

Possible features:

- oscilloscope
- spectrum analyzer
- active oscillator settings
- current frequencies
- amplitudes
- waveform
- audio graph
- event log

This should NOT be the default student experience.

---

## 6. Visual design

### Overall

Hybrid of:

- playful
- scientific
- musical
- clean
- immediate

Large controls.

Large type.

Minimal explanatory prose.

Accurate terminology.

Avoid generic “AI-generated dashboard” aesthetics.

Avoid grids of identical corporate cards.

Use distinctive layouts for different concepts.

### Rule

Never show every visualization at once unless the station genuinely needs it.

Examples:

- Frequency station: waveform + frequency control may be enough.
- Amplitude station: waveform height + level control.
- Timbre station: waveform buttons plus sound.
- Harmonics station: spectrum bars plus resulting waveform.
- Pitch station: large frequency readout + optional keyboard relationship.
- Oscillator station: animated source plus speaker/output metaphor.

Every visualization must answer a specific question.

---

## 7. Audio architecture

Use the Web Audio API.

No backend is required.

Avoid external audio dependencies unless there is a strong reason.

### Audio initialization

Browsers require user interaction before audio begins.

Use a friendly first-run control such as:

**Start Sound**

This initializes `AudioContext`.

### Safety

- Start at conservative volume.
- Use a master gain stage.
- Fade oscillators in/out briefly to prevent clicks.
- Stop oscillators when navigating away where appropriate.
- Include a persistent mute / stop-all-sound control.
- Do not unexpectedly blast sound when loading a station.
- Warn before particularly harsh/noisy experiments.
- Normalize perceived level reasonably across waveform types.

### Suggested audio graph

`oscillator(s) -> station gain -> optional processing -> master gain -> destination`

An analyser node may branch from the relevant portion for visualization.

---

## 8. Station ideas

This is a broad backlog. Build incrementally.

### 8.1 What is sound?

Purpose:

Connect vibration to repeating pressure variation.

Interaction ideas:

- tap / pluck / move an object
- see a simplified vibrating source
- see nearby particles compress/rarefy
- hear the result

Keep the longitudinal-wave explanation scientifically responsible.

Do not imply that air particles travel all the way from speaker to listener.

---

### 8.2 Frequency

One huge frequency control.

Student hears a sine oscillator while seeing the waveform.

Show:

- Hz
- optional kHz conversion when useful
- waveform cycles becoming denser/sparser

Interactions:

- slider
- direct numerical input
- preset buttons

Examples:

- 100 Hz
- 200 Hz
- 440 Hz
- 880 Hz
- 1 kHz
- 4 kHz

Mini-prompts:

- Make the pitch higher.
- Double the frequency.
- What happens to the pitch?
- Find a frequency that feels very low.
- Find one that feels very high.

---

### 8.3 Octave machine

Start with one frequency.

Buttons:

- ÷2
- ×2
- ×4
- reset

Show frequencies as a family.

Allow students to hear each.

Potential display:

220 → 440 → 880 → 1760 Hz

The point is the relationship, not arithmetic drills.

---

### 8.4 Amplitude

One stable frequency.

Large amplitude slider.

Waveform height changes visibly.

Sound level changes.

Frequency remains visibly unchanged.

Prompt:

> Change amplitude without changing frequency.

Possible toggle:

- show waveform
- show simple dB-ish meter if appropriate to course framing

Avoid making an overly literal claim that screen height equals a specific physical pressure amplitude unless calibrated.

---

### 8.5 Frequency vs. amplitude

A two-control experiment.

Horizontal control = frequency.

Vertical control = amplitude.

Minimal visualization.

Goal:

Make students independently manipulate the two basic dimensions and see/hear that they are different.

Possible micro-challenge:

> Make it higher in pitch but quieter.

> Make it lower in pitch but louder.

This is probably a core required station.

---

### 8.6 Periodic vs. aperiodic

Two or more sound examples.

Possible sources:

- sine wave
- repeating complex oscillator
- noise
- irregular impulses

Display short waveform windows.

Student sorts or toggles between periodic / aperiodic.

Avoid requiring period calculations.

---

### 8.7 Wave shape gallery

Four big controls:

- sine
- square
- triangle
- sawtooth

Same frequency.

Similar perceived loudness.

Large visual waveform.

Students can instantly switch.

Prompt:

> Frequency stayed the same. Why did the sound change?

Reveal / label:

**Timbre / waveshape**

---

### 8.8 Same pitch, different timbre

A more focused version of the waveform gallery.

Lock frequency.

Only change waveform.

Optional “eyes closed” listening mode hides the label until guessed.

---

### 8.9 Oscillator

Very simple diagram:

OSCILLATOR → SOUND

Controls:

- frequency
- waveform
- amplitude

This station explicitly teaches the word **oscillator**.

Do not turn it into a huge synthesizer.

---

### 8.10 Add two oscillators

Oscillator A + Oscillator B.

Each has:

- frequency
- level
- waveform if in scope

Start with safe presets.

Visualization may show:

- A
- B
- SUM

Goal:

Show that waveforms can combine.

This can overlap intentionally with harmonics later.

---

### 8.11 Wave addition

A visual-first station.

Two simple sine waves.

Show:

- Wave A
- Wave B
- Result

Allow frequency/amplitude adjustments.

Could initially be silent, with a Play Result button.

Use mathematically generated visualization based on actual summed samples.

---

### 8.12 Harmonic ladder

Fundamental frequency plus harmonic partials.

Controls:

- fundamental
- partial 1
- partial 2
- partial 3
- partial 4
- etc.

Each partial represented as a large vertical bar.

A student can turn harmonics on/off.

Show resulting waveform.

Optional spectrum view is useful here.

Possible prompts:

- Listen to the fundamental alone.
- Add the second harmonic.
- Add several harmonics.
- What changes: pitch, timbre, or both?

---

### 8.13 Build a waveform from harmonics

A museum-exhibit station.

Start with sine.

Add harmonics.

Show resulting waveform becoming more complex.

Potential guided recipes:

- square-ish
- saw-ish

Only use Fourier-style recipes to the depth appropriate for MUS 244.

This should feel magical rather than mathematical.

---

### 8.14 Mystery waveform

Play one of:

- sine
- square
- triangle
- sawtooth

Student guesses.

Immediate feedback.

Not primarily a scored quiz.

Keep replay available.

---

### 8.15 Match the sound

Target oscillator is played.

Student adjusts one or two parameters.

Simple closeness indicator.

Examples:

- match frequency
- match amplitude
- match waveform

This can become a highly replayable optional station.

---

### 8.16 Make it weird

A creative free-play station.

Give a tiny set of parameters and an instruction:

> Make the strangest sound you can.

At the end:

> What did you change?

This encourages exploration rather than answer hunting.

---

### 8.17 Human hearing explorer

Only if aligned with slides.

A frequency slider spanning the classroom discussion range.

Label broad regions conservatively.

Do NOT claim that every student can or should hear exactly 20 Hz–20 kHz.

Use wording such as:

> A commonly cited approximate range for young human hearing is 20 Hz–20 kHz, but real hearing varies.

Avoid encouraging dangerously loud listening.

---

## 9. Intentional overlap

Overlap is desirable.

Students should encounter frequency repeatedly in different contexts:

- pure sine
- octave relationships
- amplitude comparison
- waveform comparison
- oscillator
- harmonics
- matching challenge

Likewise, “timbre” should appear in multiple stations.

Do not optimize away repetition.

Repetition through different interactions is part of the pedagogy.

---

## 10. Navigation model

Home page should feel like a museum floor rather than a lesson-management system.

Possible layout:

### START HERE

Three to six required stations.

### EXPLORE

Many optional experiments.

### CHALLENGES

Replayable activities.

### FINISH / SUBMIT

Completion receipt + reflection.

Each station gets:

- title
- one-sentence purpose
- interaction
- completion state
- optional star / discovery marker

Avoid linear Previous / Next navigation as the only navigation method.

Students should be able to wander.

---

## 11. Progress model

Store progress locally in the browser.

Use `localStorage` for persistence between accidental refreshes.

Possible state:

```js
{
  version: 1,
  sessionId: "...",
  startedAt: "...",
  lastUpdatedAt: "...",
  stations: {
    frequency: {
      opened: true,
      completed: true,
      interactions: 14,
      firstOpenedAt: "...",
      completedAt: "..."
    }
  },
  checks: {},
  reflections: {}
}
```

### What counts as completion?

Do not mark a station complete merely because the page was opened.

Use a tiny meaningful interaction requirement.

Examples:

- frequency slider changed several times
- student used both ×2 and ÷2
- student auditioned all four waveforms
- student changed both frequency and amplitude
- student added at least two harmonics

Keep requirements forgiving.

The goal is engagement evidence, not surveillance.

---

## 12. Lightweight usage logging

No server-side analytics are required for the classroom deliverable.

Track only local, educationally useful interaction summaries.

Examples:

- stations visited
- stations completed
- approximate interaction count
- challenge attempts
- challenge successes
- time between first and last activity
- final reflection

Do NOT record every mouse movement.

Do NOT collect personally identifying information.

Do NOT require student names in the web app unless explicitly added later.

---

## 13. Embedded questions

Use sparingly.

Question types may include:

- tiny multiple choice
- predict then test
- “which changed?”
- matching
- short reflection
- choose one of two interpretations

Better pattern:

1. ask a prediction;
2. let the student perform the experiment;
3. let them revise;
4. reveal concise explanation.

Avoid turning the site into Canvas quizzes in disguise.

---

## 14. Final Canvas deliverable

At the end, generate a compact **Canvas Submission Receipt** that the student can copy/paste into a Canvas text-entry assignment.

Possible format:

```text
MUS 244 SOUND LAB

Session: SL-8F3A7C
Required stations completed: 6/6
Optional stations explored: 7
Challenges attempted: 5
Challenges completed: 4

Two things I noticed:
1. [student reflection]
2. [student reflection]

Completion receipt:
SL1:8F3A7C:6-7-5-4:4db3...
```

Include a **Copy Submission** button.

Also allow manual selection/copy if Clipboard API is unavailable.

---

## 15. Integrity hash / completion receipt

The user requested an integrity hash or similar mechanism.

Implement a SHA-256 digest using the browser Web Crypto API.

Canonicalize a summary object before hashing.

Example:

```js
{
  schema: "sound-lab-receipt-v1",
  sessionId,
  startedAt,
  requiredCompleted,
  optionalVisited,
  challengeAttempts,
  challengeSuccesses,
  stationCompletionIds,
  reflection1,
  reflection2
}
```

Then:

```js
crypto.subtle.digest("SHA-256", encodedCanonicalJSON)
```

Display a shortened version in the Canvas receipt and optionally include the full hash in an expandable details area.

### Important limitation

This is **not cryptographic proof that the student completed the work honestly** because all app code and state live client-side.

A technically skilled user can manipulate browser state or source code.

Therefore describe it as:

- completion receipt
- integrity checksum
- submission fingerprint

Do NOT describe it as cheating-proof or secure authentication.

Its useful purposes are:

- gives each submission a distinctive structured receipt;
- helps detect accidental edits to copied completion data;
- gives instructor a quick standardized completion summary;
- makes the activity feel finished.

A later version could use server-side signed receipts if real verification becomes necessary.

---

## 16. Reflection prompts

End with one or two.

Potential defaults:

### Reflection 1

> What is one thing you understand better after experimenting with Sound Lab?

### Reflection 2

> Describe one setting or experiment where changing something produced a result you did not expect.

Optional alternate:

> Pick two terms from class that became more connected in your mind while using the site. Explain the connection.

Keep these editable in a configuration file.

---

## 17. “I’m done” behavior

When baseline requirements are satisfied:

Do NOT make the app scream “YOU ARE FINISHED, LEAVE.”

Instead show:

> Baseline complete ✓  
> You have enough for the Canvas submission. Keep exploring if you want — there are more experiments below.

Then highlight optional stations.

This directly supports the classroom goal of allowing a minimum while making continued exploration attractive.

---

## 18. Configuration-driven content

Do not hard-code every station into navigation manually.

Create a station registry.

Example:

```js
const stations = [
  {
    id: "frequency",
    title: "Frequency",
    category: "sound",
    required: true,
    estimatedMinutes: 3,
    module: "./stations/frequency.js"
  }
];
```

Benefits:

- easily add stations later;
- easily change which stations are required;
- reuse architecture for later MUS 244 topics;
- possible future Unit 1 review mode.

---

## 19. Possible future expansion

The architecture should support later stations for concepts outside Day 1–3.

Do not build all of these now.

Potential future content:

- phase
- polarity
- constructive / destructive interference
- comb filtering
- filters
- low-pass / high-pass
- cutoff frequency
- resonance
- ADSR
- subtractive synthesis
- MIDI
- digital audio
- sampling rate
- bit depth
- aliasing
- stereo
- pan
- basic EQ
- compression
- delay
- reverb

This could eventually become the interactive version of MUS 244 Unit 1 review, but it should remain playful rather than become a giant test-prep page.

---

## 20. Debug / instructor mode

Add an optional query parameter:

`?debug=1`

or

`?instructor=1`

Possible features:

- reset progress
- mark all required complete
- inspect local state
- show all analyser displays
- visualize audio graph
- mute all
- station jump menu
- test receipt generation
- show completion rules
- clear localStorage

Do not expose clutter from this mode during normal use.

---

## 21. Technical architecture

Prefer simple static technology.

### Recommended

- HTML
- modern CSS
- vanilla JavaScript ES modules
- Web Audio API
- Canvas 2D and/or SVG for visualizations
- Web Crypto API for checksum
- localStorage for progress

No build step is required unless clearly beneficial.

No framework is necessary for v1.

Avoid React/Vue/etc. unless the project becomes complex enough to justify them.

### Suggested structure

```text
musictech/
  sound-lab/
    index.html
    README.md
    css/
      base.css
      stations.css
    js/
      app.js
      audio-engine.js
      progress.js
      receipt.js
      station-registry.js
      visualizers.js
      utils.js
    stations/
      frequency.js
      amplitude.js
      frequency-amplitude.js
      octave.js
      waveforms.js
      oscillator.js
      combine-waves.js
      harmonics.js
      mystery-waveform.js
    assets/
      icons/
    tests/
```

---

## 22. Shared audio engine

Create one AudioContext and one master output chain.

Expose safe helper methods.

Example conceptual API:

```js
SoundLab.audio.start()
SoundLab.audio.stopAll()
SoundLab.audio.createOscillator({...})
SoundLab.audio.setMasterLevel(...)
SoundLab.audio.getAnalyser(...)
```

Station modules should not each reinvent browser audio initialization.

---

## 23. Shared visualization utilities

Create reusable primitives, but do not force identical station designs.

Potential utilities:

- waveform renderer
- spectrum bars
- frequency readout
- simple particle pressure visualization
- oscillator icon
- amplitude meter
- axes/labels

A station can use only what it needs.

---

## 24. Responsive requirements

Must work well on:

- classroom desktop computers
- laptops
- tablets
- phones

Primary classroom target may be desktop, but mobile should remain functional.

Touch targets should be large.

No hover-only interactions.

---

## 25. Accessibility

- keyboard-accessible controls
- real labels
- visible focus state
- strong contrast
- do not communicate meaning using color alone
- reduced-motion support
- pause visual animation if requested
- textual value readouts for sliders
- no essential concept dependent solely on hearing
- no essential concept dependent solely on vision

For audio-centric stations, describe the relevant visual relationship.

For visual-centric stations, provide text labels and values.

---

## 26. Performance

Target fast loading on classroom computers.

Avoid:

- huge libraries
- large video files
- excessive audio assets
- continuous expensive FFT rendering when station is hidden
- multiple animation loops left running in background

Pause / destroy station animation and audio when no longer needed.

---

## 27. Tone / writing

Use Borecki/MUS 244 vocabulary and approachable language.

Good:

> Make it higher.

> Double the frequency.

> What changed?

> Try something ridiculous.

> Can you make the sound quieter without making the pitch lower?

Avoid:

> In this module, learners will demonstrate competency in identifying the psychoacoustic correlates of periodic waveform frequency.

The site can be funny and playful without sacrificing accuracy.

---

## 28. V1 build priority

### Must-have

1. landing / station map
2. audio initialization + master stop
3. progress framework
4. Frequency station
5. Amplitude station
6. Frequency vs. Amplitude station
7. Wave Shape / Timbre station
8. Octave station
9. Oscillator station
10. Harmonics or Combine Waves station
11. final reflections
12. Canvas receipt
13. SHA-256 checksum
14. local progress persistence
15. baseline-complete state

### Strong next additions

16. periodic vs. aperiodic
17. mystery waveform
18. match frequency
19. build waveform
20. “make it weird”
21. instructor/debug mode

---

## 29. Development strategy

Do not attempt to perfect the entire museum in one pass.

### Milestone 1

Build shell + audio + 3 stations:

- Frequency
- Amplitude
- Waveforms

Confirm:

- audio works;
- visualizations are smooth;
- controls feel immediate;
- navigation feels playful.

### Milestone 2

Add:

- octave
- oscillator
- frequency/amplitude challenge
- progress tracking

### Milestone 3

Add:

- harmonics / wave addition
- embedded questions
- completion receipt
- reflection

### Milestone 4

Add optional replayable stations until the site feels rich enough that students naturally keep exploring.

---

## 30. Acceptance criteria

The project succeeds if:

- a student can open the website and make sound within seconds;
- no installation or login is required;
- each basic acoustics concept gets a focused experiment;
- frequency and amplitude are clearly distinguished;
- waveform/timbre differences can be heard immediately;
- the website does not resemble a giant conventional synthesizer;
- students can complete a short baseline;
- curious students can keep exploring for much longer;
- progress survives an accidental refresh;
- the final page creates a copy/paste Canvas submission;
- the submission includes reflections and a checksum;
- the app works entirely as a static GitHub Pages site;
- new stations can be added without rewriting the whole app.

---

## 31. Source of truth for course content

Before implementing station wording and required concepts, inspect the current MUS 244 Acoustics & Synthesis slide deck.

Current deck supplied by instructor:

`https://docs.google.com/presentation/d/1yzrWPgIc64du9zZ72sW79Cd_H7U2lnbrskM5rtLAPeM/edit?usp=drivesdk`

Use the actual first-three-day terminology and scope.

If the code agent cannot access the deck, ask for an exported PDF/text rather than inventing curricular details.

---

## 32. Immediate Codex task

Start by inspecting the existing `adamborecki/webapps` repository.

Then:

1. create `musictech/sound-lab/`;
2. preserve the existing site and deployment;
3. build a functional shell;
4. implement the shared Web Audio engine;
5. implement Frequency, Amplitude, and Wave Shape stations;
6. add local progress tracking;
7. ensure direct GitHub Pages compatibility;
8. make the visual design playful and museum-like rather than dashboard-like;
9. test on desktop and narrow mobile widths;
10. leave a README explaining how to add future station modules.

Do not implement advanced topics until the Day 1–3 source material has been checked.

---

## 33. Design mantra

**One idea. One delightful interaction. Immediate feedback. Then let them mess with it.**
