import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GameSelectionPanel } from "./game-selection-panel";
import { GAME_CATALOG } from "@/lib/game-catalog";

describe("GameSelectionPanel", () => {
  it("lista un botón por cada juego del catálogo", () => {
    render(<GameSelectionPanel onSelect={() => {}} />);

    for (const game of GAME_CATALOG) {
      expect(screen.getByRole("button", { name: new RegExp(game.label, "i") })).toBeInTheDocument();
    }
  });

  it("al hacer click en un juego, llama a onSelect con su id", () => {
    const onSelect = vi.fn();
    render(<GameSelectionPanel onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /trivia/i }));

    expect(onSelect).toHaveBeenCalledWith("trivia");
  });
});
