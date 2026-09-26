// Sonidos de acierto/error sintetizados con la Web Audio API — sin archivos
// externos, sin tema de licencias. Un solo AudioContext, creado recién en el
// primer uso (los navegadores no dejan crearlo antes de una interacción del
// usuario).
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

function playTone(
  context: AudioContext,
  frequency: number,
  startTime: number,
  durationSeconds: number,
  type: OscillatorType,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  // Envolvente corta (attack/decay) para evitar el "click" de un tono que
  // arranca/termina de golpe.
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSeconds);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + durationSeconds);
}

export function playCorrectSound(): void {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  // Dos notas ascendentes cortas (C5 → E5).
  playTone(context, 523.25, now, 0.12, "sine");
  playTone(context, 659.25, now + 0.1, 0.18, "sine");
}

export function playIncorrectSound(): void {
  const context = getAudioContext();
  if (!context) return;
  playTone(context, 150, context.currentTime, 0.3, "sawtooth");
}
