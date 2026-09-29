import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WordBoard } from "./word-board";
import type { Team } from "@/lib/room-types";
import type { MemorizaBoardItemPublic } from "@/lib/memoriza-objetos-types";

const TEAMS: Team[] = [
  { id: "t1", name: "Rojos", color: "#ff0000", playerIds: [], score: 0 },
  { id: "t2", name: "Azules", color: "#0000ff", playerIds: [], score: 0 },
];

describe("WordBoard", () => {
  it("muestra la pista, no la palabra ni la imagen, mientras el objeto está oculto", () => {
    const items: MemorizaBoardItemPublic[] = [
      {
        id: "obj-1",
        imagenUrl: "https://example.com/1.svg",
        pista: "M _ _ _ _ _ _",
        estado: "oculta",
        equipoQueAcerto: null,
        palabra: null,
      },
    ];
    const { container } = render(<WordBoard items={items} teams={TEAMS} />);

    expect(screen.getByText("M _ _ _ _ _ _")).toBeInTheDocument();
    expect(screen.queryByText("manzana")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("muestra la palabra completa y la imagen en el color del equipo que acertó", () => {
    const items: MemorizaBoardItemPublic[] = [
      {
        id: "obj-1",
        imagenUrl: "https://example.com/1.svg",
        pista: "M _ _ _ _ _ _",
        estado: "revelada",
        equipoQueAcerto: "t2",
        palabra: "manzana",
      },
    ];
    const { container } = render(<WordBoard items={items} teams={TEAMS} />);

    const palabra = screen.getByText("manzana");
    expect(palabra).toBeInTheDocument();
    expect(palabra).toHaveStyle({ color: "rgb(0, 0, 255)" });
    expect(container.querySelector("img")).toHaveAttribute("src", "https://example.com/1.svg");
  });

  it("un objeto revelado pero sin adivinar (equipoQueAcerto null) muestra la imagen y la palabra marcada como no adivinada", () => {
    const items: MemorizaBoardItemPublic[] = [
      {
        id: "obj-1",
        imagenUrl: "https://example.com/1.svg",
        pista: "M _ _ _ _ _ _",
        estado: "revelada",
        equipoQueAcerto: null,
        palabra: "manzana",
      },
    ];
    const { container } = render(<WordBoard items={items} teams={TEAMS} />);

    const palabra = screen.getByText("manzana");
    expect(palabra).toBeInTheDocument();
    expect(palabra.className).toMatch(/noAdivinada/);
    expect(palabra).not.toHaveAttribute("style");
    expect(container.querySelector("img")).not.toBeNull();
  });
});
