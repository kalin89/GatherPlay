import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamBoard } from "./team-board";
import type { Team } from "@/lib/room-types";

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    name: "Rojos",
    color: "#ff0000",
    playerIds: [],
    score: 0,
    ...overrides,
  };
}

describe("TeamBoard", () => {
  it("muestra el nombre y el color del equipo", () => {
    render(<TeamBoard team={makeTeam()} players={[]} />);

    expect(screen.getByText("Rojos")).toBeInTheDocument();
  });

  it("lista a los integrantes del equipo", () => {
    render(
      <TeamBoard
        team={makeTeam()}
        players={[
          { id: "p1", name: "Ana", socketId: "s1" },
          { id: "p2", name: "Beto", socketId: "s2" },
        ]}
      />,
    );

    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Beto")).toBeInTheDocument();
  });

  it("muestra un mensaje cuando el equipo no tiene jugadores", () => {
    render(<TeamBoard team={makeTeam()} players={[]} />);

    expect(screen.getByText("Sin jugadores todavía")).toBeInTheDocument();
  });
});
