import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameSelectionPanel } from "./game-selection-panel";
import { GAME_CATALOG } from "@/lib/game-catalog";
import type { Team } from "@/lib/room-types";

const TEAMS: Team[] = [
  { id: "t1", name: "Rojos", color: "#ef4444", playerIds: [], score: 300 },
  { id: "t2", name: "Azules", color: "#3b82f6", playerIds: [], score: 150 },
];

describe("GameSelectionPanel", () => {
  it("lista un botón por cada juego del catálogo", () => {
    render(<GameSelectionPanel onSelect={() => {}} teams={TEAMS} />);

    for (const game of GAME_CATALOG) {
      expect(screen.getByRole("button", { name: new RegExp(game.label, "i") })).toBeInTheDocument();
    }
  });

  it("al hacer click en un juego, llama a onSelect con su id", () => {
    const onSelect = vi.fn();
    render(<GameSelectionPanel onSelect={onSelect} teams={TEAMS} />);

    fireEvent.click(screen.getByRole("button", { name: /trivia/i }));

    expect(onSelect).toHaveBeenCalledWith("trivia");
  });

  it("muestra el nombre y el puntaje acumulado de cada equipo", () => {
    render(<GameSelectionPanel onSelect={() => {}} teams={TEAMS} />);

    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });
});
