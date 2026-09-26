import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Countdown } from "./countdown";

describe("Countdown", () => {
  it("muestra el número de segundos restantes", () => {
    render(<Countdown seconds={42} />);

    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("por encima del umbral urgente, no marca la clase urgent", () => {
    render(<Countdown seconds={10} />);

    expect(screen.getByText("10").className).not.toMatch(/urgent/);
  });

  it("en o por debajo del umbral urgente, marca la clase urgent", () => {
    render(<Countdown seconds={5} />);

    expect(screen.getByText("5").className).toMatch(/urgent/);
  });
});
