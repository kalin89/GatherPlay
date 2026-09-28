// Script de desarrollo — NO se ejecuta en CI ni en producción, ni se importa
// desde `src/`. Se corre a mano cuando se quiere ampliar `song-bank.ts` con
// canciones nuevas: resuelve el `itunesTrackId` de una lista de
// `{ titulo, artista, genero }` contra la API pública de iTunes y devuelve
// entradas listas para pegar en `song-bank.ts` (ver
// specs/features/rocola-content/analysis.md).
//
// Uso: node --experimental-strip-types scripts/resolve-rocola-track-ids.ts entrada.tsv
// (entrada.tsv: una línea por canción, columnas separadas por tab:
// `genero\ttitulo\tartista`)
//
// No auto-acepta nada: imprime el resultado para revisión manual, incluidos
// los matches ambiguos o sin preview disponible.
import { readFileSync } from 'node:fs';

interface ItunesSearchTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  previewUrl?: string;
  artworkUrl100?: string;
}

interface ItunesSearchResponse {
  results: ItunesSearchTrack[];
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

async function resolveOne(
  genero: string,
  titulo: string,
  artista: string,
): Promise<void> {
  const term = encodeURIComponent(`${titulo} ${artista}`);
  const url = `https://itunes.apple.com/search?term=${term}&country=mx&entity=song&limit=10`;
  const response = await fetch(url);
  if (!response.ok) {
    console.log(`# SIN RESOLVER (HTTP ${response.status}): ${titulo} / ${artista}`);
    return;
  }
  const data = (await response.json()) as ItunesSearchResponse;
  const wantedArtist = normalize(artista);
  const withPreview = data.results.filter((r) => r.previewUrl);
  const best =
    withPreview.find((r) => normalize(r.artistName).includes(wantedArtist)) ??
    withPreview[0];

  if (!best) {
    console.log(`# SIN RESOLVER (sin preview disponible): ${titulo} / ${artista}`);
    return;
  }

  const slug = `${genero}-${normalize(titulo).slice(0, 40)}`;
  console.log(
    `{ id: '${slug}', titulo: '${titulo}', artista: '${best.artistName}', genero: '${genero}', itunesTrackId: ${best.trackId} }, // ${best.trackName}`,
  );
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: resolve-rocola-track-ids.ts <archivo.tsv>');
    process.exit(1);
  }
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n');
  for (const line of lines) {
    const [genero, titulo, artista] = line.split('\t');
    if (!genero || !titulo || !artista) continue;
    await resolveOne(genero, titulo, artista);
    // No golpear la API demasiado rápido — devuelve 429 tras varias
    // llamadas seguidas.
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

await main();
