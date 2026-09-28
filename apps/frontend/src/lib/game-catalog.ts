import type { GameId } from "./room-types";

export interface GameCatalogEntry {
  id: GameId;
  label: string;
  description: string;
}

export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    id: "trivia",
    label: "Trivia",
    description: "Preguntas de cultura general por turnos.",
  },
  {
    id: "caras-y-gestos",
    label: "Caras y Gestos",
    description: "Mímica en equipos: adivinen tantas palabras como puedan en un minuto.",
  },
  {
    id: "adivina-palabra",
    label: "Adivina la palabra",
    description: "El Adivinador de turno adivina palabras por pistas verbales de su equipo, sin verlas.",
  },
  {
    id: "la-rocola",
    label: "La Rocola",
    description:
      'El primero en presionar "¡Me la sé!" cuando suena la canción tiene la oportunidad de adivinarla.',
  },
];

export function getGameLabel(gameId: GameId): string {
  return GAME_CATALOG.find((game) => game.id === gameId)?.label ?? gameId;
}
