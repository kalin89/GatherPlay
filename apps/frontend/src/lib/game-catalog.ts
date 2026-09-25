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
];

export function getGameLabel(gameId: GameId): string {
  return GAME_CATALOG.find((game) => game.id === gameId)?.label ?? gameId;
}
