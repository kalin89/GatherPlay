import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdivinaPalabraWord } from "./adivina-palabra-word";

describe("AdivinaPalabraWord", () => {
  it("muestra la palabra actual", () => {
    render(<AdivinaPalabraWord palabra="Elefante" />);

    expect(screen.getByText("Elefante")).toBeInTheDocument();
  });

  it("con palabra null (pool agotado) muestra un mensaje en vez de romper", () => {
    render(<AdivinaPalabraWord palabra={null} />);

    expect(screen.getByText("Sin más palabras…")).toBeInTheDocument();
  });
});
