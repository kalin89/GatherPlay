import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamClocks } from "./team-clocks";
import type { Team } from "@/lib/room-types";

const TEAMS: Team[] = [
  { id: "t1", name: "Rojos", color: "#ff0000", playerIds: [], score: 0 },
  { id: "t2", name: "Azules", color: "#0000ff", playerIds: [], score: 0 },
];

describe("TeamClocks", () => {
  it("muestra el tiempo en formato mm:ss para cada equipo", () => {
    render(
      <TeamClocks
        teams={TEAMS}
        clocks={[
          { teamId: "t1", remainingSeconds: 90 },
          { teamId: "t2", remainingSeconds: 65 },
        ]}
        equipoActivoId="t1"
      />,
    );

    expect(screen.getByText("1:30")).toBeInTheDocument();
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("nunca muestra segundos negativos", () => {
    render(
      <TeamClocks teams={TEAMS} clocks={[{ teamId: "t1", remainingSeconds: -1 }]} equipoActivoId={null} />,
    );

    expect(screen.getByText("0:00")).toBeInTheDocument();
  });
});
