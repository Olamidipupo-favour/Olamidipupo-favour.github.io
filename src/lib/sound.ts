/** Tiny opt-in UI blips. Never runs unless the visitor turned sound on. */
let context: AudioContext | null = null;

export function blip(frequency = 520, duration = 0.06, gain = 0.035) {
  if (document.documentElement.dataset.sound !== "on") return;
  try {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtor) return;
    context ??= new AudioCtor();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(
      0.0001,
      context.currentTime + duration,
    );
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  } catch {
    // Sound is an enhancement; a blocked AudioContext must never break the page.
  }
}

export function setSound(on: boolean) {
  document.documentElement.dataset.sound = on ? "on" : "off";
  localStorage.setItem("dipo-sound", on ? "on" : "off");
  if (on) blip(660, 0.08);
}
