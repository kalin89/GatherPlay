import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchWinnerBanner } from "./match-winner-banner";
import type { Team } from "@/lib/room-types";

function makeTeams(): Team[] {
  return [
    { id: "t1", name: "Rojos", color: "#ef4444", playerIds: ["p1"], score: 0 },
    { id: "t2", name: "Azules", color: "#3b82f6", playerIds: ["p2"], score: 0 },
    { id: "t3", name: "Verdes", color: "#22c55e", playerIds: ["p3"], score: 0 },
  ];
}

describe("MatchWinnerBanner", () => {
  it("muestra el equipo con más puntaje como ganador único", () => {
    render(
      <MatchWinnerBanner
        teams={makeTeams()}
        scores={[
          { teamId: "t1", score: 5 },
          { teamId: "t2", score: 3 },
        ]}
      />,
    );

    expect(screen.getByText(/el ganador de este juego es el equipo/i)).toBeInTheDocument();
    expect(screen.getByText("Rojos")).toBeInTheDocument();
  });

  it("muestra Empate cuando dos o más equipos comparten el puntaje más alto", () => {
    render(
      <MatchWinnerBanner
        teams={makeTeams()}
        scores={[
          { teamId: "t1", score: 4 },
          { teamId: "t2", score: 4 },
          { teamId: "t3", score: 2 },
        ]}
      />,
    );

    expect(screen.getByText(/empate/i)).toBeInTheDocument();
    expect(screen.queryByText(/el ganador de este juego/i)).not.toBeInTheDocument();
  });

  it("con los 3 equipos empatados en el máximo, también muestra Empate", () => {
    render(
      <MatchWinnerBanner
        teams={makeTeams()}
        scores={[
          { teamId: "t1", score: 0 },
          { teamId: "t2", score: 0 },
          { teamId: "t3", score: 0 },
        ]}
      />,
    );

    expect(screen.getByText(/empate/i)).toBeInTheDocument();
  });
});
