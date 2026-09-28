// Compara la respuesta escrita por el jugador contra el título real de la
// canción, tolerando errores de tipeo, tildes faltantes y alguna palabra de
// más/menos — sin IA ni red (constitution.md, principio 5: la lógica de
// turnos nunca depende de una llamada de IA en caliente). Ver
// specs/features/la-rocola-module/analysis.md → "Juicio de la respuesta
// escrita".

const STOPWORDS = new Set([
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'y',
  'a',
  'un',
  'una',
  'en',
  'al',
  'es',
]);

function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ') // subtítulos entre paréntesis, ej. "Waka Waka (Esto Es África)"
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes/diacríticos
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0 && !STOPWORDS.has(word));
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => Array.from<number>({ length: cols }).fill(0));
  for (let i = 0; i < rows; i++) dp[i]![0] = i;
  for (let j = 0; j < cols; j++) dp[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dp[rows - 1]![cols - 1]!;
}

function wordsMatch(guessWord: string, titleWord: string): boolean {
  if (guessWord === titleWord) return true;
  const maxLen = Math.max(guessWord.length, titleWord.length);
  const tolerance = maxLen <= 4 ? 1 : Math.max(1, Math.floor(maxLen * 0.3));
  return levenshtein(guessWord, titleWord) <= tolerance;
}

// Cada palabra clave del título debe tener una palabra correspondiente en la
// respuesta (tolerando typos vía `wordsMatch`); títulos de 3+ palabras clave
// toleran que falte una. Sin ninguna palabra en común, o con más ausencias
// de las toleradas, se considera incorrecta.
export function isFuzzyMatch(guess: string, titulo: string): boolean {
  const guessWords = normalizeWords(guess);
  const titleWords = normalizeWords(titulo);
  if (guessWords.length === 0 || titleWords.length === 0) return false;

  const usedGuessIndexes = new Set<number>();
  let unmatched = 0;
  for (const titleWord of titleWords) {
    const matchIndex = guessWords.findIndex(
      (guessWord, i) => !usedGuessIndexes.has(i) && wordsMatch(guessWord, titleWord),
    );
    if (matchIndex === -1) {
      unmatched++;
    } else {
      usedGuessIndexes.add(matchIndex);
    }
  }

  const allowedMisses = titleWords.length >= 3 ? 1 : 0;
  return unmatched <= allowedMisses;
}
