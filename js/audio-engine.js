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
