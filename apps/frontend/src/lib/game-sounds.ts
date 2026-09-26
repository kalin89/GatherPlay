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

// Un solo tono medio, neutro — ni la envolvente ascendente de
// playCorrectSound ni el tono grave de playIncorrectSound (acá no hay
// "incorrecta", solo adivinada/paso/tiempo agotado).
export function playPassSound(): void {
  const context = getAudioContext();
  if (!context) return;
  playTone(context, 350, context.currentTime, 0.15, "sine");
}

// Jingle corto (4 notas ascendentes, C5 → E5 → G5 → C6), más largo que los
// otros dos — para el equipo ganador al terminar la partida.
export function playVictorySound(): void {
  const context = getAudioContext();
  if (!context) return;
  const now = context.currentTime;
  playTone(context, 523.25, now, 0.15, "sine");
  playTone(context, 659.25, now + 0.12, 0.15, "sine");
  playTone(context, 783.99, now + 0.24, 0.15, "sine");
  playTone(context, 1046.5, now + 0.36, 0.35, "sine");
}
