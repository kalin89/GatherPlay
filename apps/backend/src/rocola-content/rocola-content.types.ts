export const ROCOLA_GENEROS = [
  'cumbia',
  'merengue',
  'salsa',
  'balada',
  'ranchera',
  'pop',
  'rock',
  'popular',
] as const;
export type RocolaGenero = (typeof ROCOLA_GENEROS)[number];

// Entrada del banco curado — sin preview/portada todavía, se resuelven en
// runtime con un solo lookup por partida (ver rocola-content.service.ts).
export interface RocolaBankEntry {
  id: string;
  titulo: string;
  artista: string;
  genero: RocolaGenero;
  itunesTrackId: number;
}

// Entrada del banco de respaldo — preview/portada ya embebidos a mano, sin
// llamada de red (se usa solo si el lookup a iTunes falla por completo).
export interface RocolaFallbackEntry extends RocolaBankEntry {
  previewUrl: string;
  portadaUrl: string;
}

// Lo que consume LaRocolaService: una canción lista para sonar.
export interface RocolaSong {
  id: string;
  titulo: string;
  artista: string;
  genero: RocolaGenero;
  previewUrl: string;
  portadaUrl: string;
}

export const MAX_SAME_GENERO_PER_MATCH = 2;

// Filtro opcional elegido por el host antes de arrancar la partida — nunca
// ambos a la vez (spec.md → "Filtro opcional por género o artista").
export type RocolaFiltro =
  | { tipo: 'genero'; genero: RocolaGenero }
  | { tipo: 'artista'; artista: string };
