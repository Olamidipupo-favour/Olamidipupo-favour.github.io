/** Opt-in UI blips and a small violin-style loop. Never runs unless sound is on. */
let context: AudioContext | null = null;
let ambientTimer: number | null = null;
let ambientGain: GainNode | null = null;

function audioContext(): AudioContext | null {
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return null;
    context ??= new AudioCtor();
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function blip(frequency = 520, duration = 0.06, gain = 0.08) {
  if (document.documentElement.dataset.sound !== "on") return;
  const ctx = audioContext();
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const volume = ctx.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, ctx.currentTime);
    volume.gain.exponentialRampToValueAtTime(
      0.0001,
      ctx.currentTime + duration,
    );
    oscillator.connect(volume);
    volume.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Sound is an enhancement; a blocked AudioContext must never break the page.
  }
}

// A minor pentatonic phrase. Two oscillators per note give the bowed, violin-ish timbre.
const NOTES = [440, 523.25, 659.25, 587.33, 493.88, 659.25, 783.99, 587.33];
const NOTE_MS = 1100;

function ambientNote(ctx: AudioContext, output: GainNode, frequency: number) {
  const now = ctx.currentTime;
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(0.5, now + 0.12);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
  envelope.connect(output);

  const fundamental = ctx.createOscillator();
  fundamental.type = "triangle";
  fundamental.frequency.value = frequency;

  const harmonic = ctx.createOscillator();
  harmonic.type = "sine";
  harmonic.frequency.value = frequency * 2;
  const harmonicGain = ctx.createGain();
  harmonicGain.gain.value = 0.18;

  fundamental.connect(envelope);
  harmonic.connect(harmonicGain).connect(envelope);
  fundamental.start(now);
  harmonic.start(now);
  fundamental.stop(now + 1);
  harmonic.stop(now + 1);
}

function startAmbient() {
  if (ambientTimer !== null) return;
  const ctx = audioContext();
  if (!ctx) return;
  const output = ctx.createGain();
  output.gain.value = 0.22;
  output.connect(ctx.destination);
  ambientGain = output;

  let step = 0;
  const tick = () => {
    ambientNote(ctx, output, NOTES[step % NOTES.length]);
    step += 1;
  };
  tick();
  ambientTimer = window.setInterval(tick, NOTE_MS);
}

function stopAmbient() {
  if (ambientTimer !== null) {
    window.clearInterval(ambientTimer);
    ambientTimer = null;
  }
  ambientGain?.disconnect();
  ambientGain = null;
}

export function setSound(on: boolean) {
  document.documentElement.dataset.sound = on ? "on" : "off";
  localStorage.setItem("dipo-sound", on ? "on" : "off");
  if (!on) {
    stopAmbient();
    return;
  }
  blip(660, 0.08);
  startAmbient();
}
