import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TriviaOptions } from "./trivia-options";

const OPCIONES = ["3", "4", "5", "6"];

describe("TriviaOptions", () => {
  it("sin onSelect, los botones están deshabilitados", () => {
    render(<TriviaOptions opciones={OPCIONES} />);

    expect(screen.getByRole("button", { name: /4/ })).toBeDisabled();
  });

  it("con onSelect, tocar una opción llama con el índice correcto", () => {
    const onSelect = vi.fn();
    render(<TriviaOptions opciones={OPCIONES} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /5/ }));

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("una vez elegida una opción, las 4 quedan deshabilitadas", () => {
    render(<TriviaOptions opciones={OPCIONES} onSelect={() => {}} selectedIndex={1} />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("resalta la opción correcta en verde", () => {
    render(<TriviaOptions opciones={OPCIONES} selectedIndex={0} correctIndex={1} />);

    expect(screen.getByRole("button", { name: /4/ }).className).toMatch(/correct/);
  });

  it("resalta la opción elegida incorrecta en rojo, sin marcar la correcta como elegida", () => {
    render(<TriviaOptions opciones={OPCIONES} selectedIndex={0} correctIndex={1} />);

    expect(screen.getByRole("button", { name: /3/ }).className).toMatch(/incorrect/);
    expect(screen.getByRole("button", { name: /4/ }).className).not.toMatch(/incorrect/);
  });

  it("disabled fuerza a que ningún botón sea clickeable aunque haya onSelect", () => {
    render(<TriviaOptions opciones={OPCIONES} onSelect={() => {}} disabled />);

    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });
});
