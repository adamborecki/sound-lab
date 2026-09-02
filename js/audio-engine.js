// Shared Web Audio engine. One AudioContext, one master gain stage.
// Stations borrow this instead of reinventing audio init.

const FADE_SECONDS = 0.02;

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.voices = new Set();
  }

  get isStarted() {
    return !!this.ctx;
  }

  async start() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.5;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  setMasterLevel(v) {
    if (!this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01);
  }

  get isSuspended() {
    return !!this.ctx && this.ctx.state === "suspended";
  }

  // Pauses/resumes the whole audio graph without tearing down any voices,
  // so a station's controls stay exactly where the student left them.
  async suspend() {
    if (this.ctx && this.ctx.state === "running") await this.ctx.suspend();
  }

  async resume() {
    if (this.ctx && this.ctx.state === "suspended") await this.ctx.resume();
  }

  // Creates a single oscillator voice with its own gain node for click-free
  // fades, pre-connected to the master chain.
  createVoice({ freq = 440, type = "sine", gain = 0.25 } = {}) {
    if (!this.ctx) throw new Error("AudioEngine not started");
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = 0;
    osc.connect(voiceGain);
    voiceGain.connect(this.masterGain);
    osc.start();

    const now = () => this.ctx.currentTime;
    voiceGain.gain.setTargetAtTime(gain, now(), FADE_SECONDS);

    const voice = {
      osc,
      gainNode: voiceGain,
      setFreq(hz, glide = 0.03) {
        osc.frequency.setTargetAtTime(hz, now(), glide);
      },
      setType(waveType) {
        osc.type = waveType;
      },
      setPeriodicWave(wave) {
        osc.setPeriodicWave(wave);
      },
      setGain(g, ramp = FADE_SECONDS) {
        voiceGain.gain.setTargetAtTime(g, now(), ramp);
      },
      stop: () => {
        voiceGain.gain.setTargetAtTime(0, now(), FADE_SECONDS);
        setTimeout(() => {
          try {
            osc.stop();
          } catch (e) {
            /* already stopped */
          }
          osc.disconnect();
          voiceGain.disconnect();
          this.voices.delete(voice);
        }, FADE_SECONDS * 1000 * 6);
      },
    };
    this.voices.add(voice);
    return voice;
  }

  // Same voice-with-fades pattern as createVoice, but backed by a looping
  // buffer of random samples instead of an oscillator — for aperiodic/noise
  // examples that don't fit the oscillator API (no frequency, no periodic
  // wave). color "white" (flat spectrum) or "pink" (Paul Kellet's economy
  // filter — equal energy per octave, so it leans darker/duller than white).
  createNoiseVoice({ gain = 0.2, color = "white" } = {}) {
    if (!this.ctx) throw new Error("AudioEngine not started");
    const bufferSeconds = 2;
    const buffer = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * bufferSeconds,
      this.ctx.sampleRate
    );
    const data = buffer.getChannelData(0);
    if (color === "pink") {
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.963 * b1 + white * 0.2965164;
        b2 = 0.57 * b2 + white * 1.0526913;
        const pink = (b0 + b1 + b2 + white * 0.1848) * 0.11;
        data[i] = Math.max(-1, Math.min(1, pink));
      }
    } else {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const voiceGain = this.ctx.createGain();
    voiceGain.gain.value = 0;
    src.connect(voiceGain);
    voiceGain.connect(this.masterGain);
    src.start();

    const now = () => this.ctx.currentTime;
    voiceGain.gain.setTargetAtTime(gain, now(), FADE_SECONDS);

    const voice = {
      gainNode: voiceGain,
      setGain(g, ramp = FADE_SECONDS) {
        voiceGain.gain.setTargetAtTime(g, now(), ramp);
      },
      stop: () => {
        voiceGain.gain.setTargetAtTime(0, now(), FADE_SECONDS);
        setTimeout(() => {
          try {
            src.stop();
          } catch (e) {
            /* already stopped */
          }
          src.disconnect();
          voiceGain.disconnect();
          this.voices.delete(voice);
        }, FADE_SECONDS * 1000 * 6);
      },
    };
    this.voices.add(voice);
    return voice;
  }

  stopAll() {
    for (const voice of Array.from(this.voices)) voice.stop();
  }

  // Uint8Array of time-domain samples, 0-255, 128 = zero crossing.
  getWaveformData() {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }
}

export const audioEngine = new AudioEngine();
