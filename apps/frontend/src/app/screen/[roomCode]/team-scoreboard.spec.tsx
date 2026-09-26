import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamScoreboard } from "./team-scoreboard";
import type { Team } from "@/lib/room-types";

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    name: "Rojos",
    color: "#ef4444",
    playerIds: [],
    score: 0,
    ...overrides,
  };
}

describe("TeamScoreboard", () => {
  it("muestra nombre y puntaje de cada equipo, con 2 equipos", () => {
    const teams = [
      makeTeam({ id: "t1", name: "Rojos", score: 300 }),
      makeTeam({ id: "t2", name: "Azules", score: 150 }),
    ];

    render(<TeamScoreboard teams={teams} />);

    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
    expect(screen.getByText("150")).toBeInTheDocument();
  });

  it("muestra los 3 equipos cuando hay más de 2", () => {
    const teams = [
      makeTeam({ id: "t1", name: "Rojos", score: 100 }),
      makeTeam({ id: "t2", name: "Azules", score: 50 }),
      makeTeam({ id: "t3", name: "Verdes", score: 0 }),
    ];

    render(<TeamScoreboard teams={teams} />);

    expect(screen.getByText("Rojos")).toBeInTheDocument();
    expect(screen.getByText("Azules")).toBeInTheDocument();
    expect(screen.getByText("Verdes")).toBeInTheDocument();
  });

  it("muestra 0 antes de jugar nada", () => {
    render(<TeamScoreboard teams={[makeTeam({ score: 0 })]} />);

    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
