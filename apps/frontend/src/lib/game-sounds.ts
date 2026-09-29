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
  peakGain = 0.3,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);

  // Envolvente corta (attack/decay) para evitar el "click" de un tono que
  // arranca/termina de golpe.
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.01);
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

// Tic corto y seco, pensado para repetirse una vez por segundo durante un
// conteo regresivo (La Rocola) sin cansar el oído — distinto de los otros
// tres, que marcan un resultado, no el paso del tiempo.
export function playTickSound(): void {
  const context = getAudioContext();
  if (!context) return;
  playTone(context, 880, context.currentTime, 0.06, "square");
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

// Música de fondo mientras se juega — mismo criterio que el resto del
// archivo: sintetizada, sin archivos ni tema de licencias. Un arpegio corto y
// alegre en pentatónica de Do (C4 D4 E4 G4 A4 G4 E4 D4) con un bajo suave
// cada dos notas, en loop. Volumen bajo (`peakGain` bien por debajo del 0.3
// de los efectos) para no tapar los sonidos de acierto/error/tick.
const MUSIC_NOTE_SECONDS = 0.27;
const MUSIC_MELODY = [261.63, 293.66, 329.63, 392.0, 440.0, 392.0, 329.63, 293.66];
const MUSIC_BASS: (number | null)[] = [130.81, null, 196.0, null, 130.81, null, 196.0, null];
const MUSIC_LOOP_MS = MUSIC_MELODY.length * MUSIC_NOTE_SECONDS * 1000;

let musicPlaying = false;
let musicTimeoutId: ReturnType<typeof setTimeout> | null = null;

function scheduleMusicLoop(context: AudioContext, startTime: number): void {
  MUSIC_MELODY.forEach((frequency, i) => {
    const noteStart = startTime + i * MUSIC_NOTE_SECONDS;
    playTone(context, frequency, noteStart, MUSIC_NOTE_SECONDS * 0.85, "triangle", 0.06);
    const bassFrequency = MUSIC_BASS[i];
    if (bassFrequency) {
      playTone(context, bassFrequency, noteStart, MUSIC_NOTE_SECONDS * 1.8, "sine", 0.05);
    }
  });

  musicTimeoutId = setTimeout(() => {
    if (!musicPlaying) return;
    scheduleMusicLoop(context, context.currentTime);
  }, MUSIC_LOOP_MS);
}

// No pasa nada si ya está sonando (idempotente) — quien la usa no tiene que
// llevar la cuenta de si ya la arrancó.
export function startBackgroundMusic(): void {
  const context = getAudioContext();
  if (!context || musicPlaying) return;
  musicPlaying = true;
  scheduleMusicLoop(context, context.currentTime);
}

// Corta la siguiente vuelta del loop — las notas de la vuelta actual, ya
// agendadas en el AudioContext, terminan de sonar solas (cola de ≤ 2.2s en
// vez de un corte seco).
export function stopBackgroundMusic(): void {
  musicPlaying = false;
  if (musicTimeoutId !== null) {
    clearTimeout(musicTimeoutId);
    musicTimeoutId = null;
  }
}
