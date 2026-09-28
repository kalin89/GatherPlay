import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GameInstructions } from "./game-instructions";

describe("GameInstructions", () => {
  it("muestra el título y cada bullet como un ítem de lista", () => {
    render(<GameInstructions title="La Rocola" bullets={["Regla uno", "Regla dos"]} />);

    expect(screen.getByText("La Rocola")).toBeInTheDocument();
    expect(screen.getByText("Regla uno")).toBeInTheDocument();
    expect(screen.getByText("Regla dos")).toBeInTheDocument();
  });
});
