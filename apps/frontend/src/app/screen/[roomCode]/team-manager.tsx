"use client";

import type { RoomActions } from "@/hooks/use-room-state";
import type { RoomState } from "@/lib/room-types";
import { splitPlayersByTeam } from "@/lib/room-selectors";
import { CreateTeamForm } from "@/components/create-team-form";
import { TeamBoard } from "@/components/team-board";
import styles from "./team-manager.module.css";

export function TeamManager({
  state,
  actions,
}: {
  state: RoomState;
  actions: RoomActions;
}) {
  const { teams, unassigned } = splitPlayersByTeam(state);

  return (
    <section className={styles.wrapper}>
      <CreateTeamForm onCreate={actions.createTeam} />

      {teams.length > 0 && (
        <div className={styles.teams}>
          {teams.map(({ team, players }) => (
            <TeamBoard
              key={team.id}
              team={team}
              players={players}
              onRemove={() => actions.removeTeam(team.id)}
            />
          ))}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className={styles.unassigned}>
          <h2 className={styles.unassignedTitle}>Sin equipo</h2>
          <ul className={styles.unassignedList}>
            {unassigned.map((player) => (
              <li key={player.id} className={styles.unassignedRow}>
                <span className={styles.playerName}>{player.name}</span>
                {teams.length > 0 && (
                  <span className={styles.assignSwatches}>
                    {teams.map(({ team }) => (
                      <button
                        key={team.id}
                        type="button"
                        className={styles.assignSwatch}
                        style={{ background: team.color }}
                        aria-label={`Asignar a ${player.name} al equipo ${team.name}`}
                        onClick={() => actions.assignPlayerToTeam(player.id, team.id)}
                      />
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        className={styles.randomize}
        disabled={teams.length === 0}
        onClick={actions.randomizeTeams}
      >
        Randomizar equipos
      </button>
    </section>
  );
}
