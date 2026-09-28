import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchScoreboard } from "./match-scoreboard";
import type { Team } from "@/lib/room-types";

function makeTeams(): Team[] {
  return [
    { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 0 },
    { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 0 },
  ];
}

describe("MatchScoreboard", () => {
  it("muestra el nombre y puntaje de cada equipo con score", () => {
    render(
      <MatchScoreboard
        teams={makeTeams()}
        scores={[
          { teamId: "t1", score: 3 },
          { teamId: "t2", score: 1 },
        ]}
      />,
    );

    expect(screen.getByText(/rojos: 3/i)).toBeInTheDocument();
    expect(screen.getByText(/azules: 1/i)).toBeInTheDocument();
  });

  it("ignora un teamId que no corresponde a ningún equipo", () => {
    render(<MatchScoreboard teams={makeTeams()} scores={[{ teamId: "inexistente", score: 5 }]} />);

    expect(screen.queryByText(/5/)).not.toBeInTheDocument();
  });
});
