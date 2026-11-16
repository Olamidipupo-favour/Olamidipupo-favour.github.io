/** Opt-in UI blips and a licensed ambient loop. Never runs unless sound is on. */
let context: AudioContext | null = null;
let ambient: HTMLAudioElement | null = null;

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

// Licensed lofi jazz loop. Created on the first gesture so autoplay policies never block it.
const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");
const AMBIENT_SRC = `${BASE}/delosound-lofi-jazz-398289.mp3`;

function startAmbient() {
  ambient ??= new Audio(AMBIENT_SRC);
  ambient.loop = true;
  ambient.volume = 0.25;
  void ambient.play().catch(() => {
    // A blocked play() is not worth a retry loop; the next toggle click starts it.
  });
}

function stopAmbient() {
  if (!ambient) return;
  ambient.pause();
  ambient.currentTime = 0;
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
