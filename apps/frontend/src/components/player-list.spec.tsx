import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerList } from "./player-list";

describe("PlayerList", () => {
  it("lista los nombres de los jugadores", () => {
    render(
      <PlayerList
        title="Sin equipo"
        players={[
          { id: "p1", name: "Ana", socketId: "s1" },
          { id: "p2", name: "Beto", socketId: "s2" },
        ]}
        emptyMessage="Nadie sin equipo"
      />,
    );

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
  });

  it("muestra el mensaje de espera cuando no hay jugadores", () => {
    render(
      <PlayerList title="Sin equipo" players={[]} emptyMessage="Nadie sin equipo" />,
    );

    expect(screen.getByText("Nadie sin equipo")).toBeInTheDocument();
  });
});
