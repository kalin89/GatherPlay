"use client";

import { useRoomState } from "@/hooks/use-room-state";
import { buildJoinUrl } from "@/lib/join-url";
import { splitPlayersByTeam } from "@/lib/room-selectors";
import { RoomCode } from "@/components/room-code";
import { JoinQr } from "@/components/join-qr";
import { PlayerList } from "@/components/player-list";
import { TeamBoard } from "@/components/team-board";
import styles from "./screen-lobby.module.css";

export function ScreenLobby({ roomCode }: { roomCode: string }) {
  const { state, error, connecting } = useRoomState(roomCode);

  if (error) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>
          No encontramos la sala <strong>{roomCode}</strong>. Verificá el
          código o creá una sala nueva.
        </p>
      </main>
    );
  }

  if (connecting || !state) {
    return (
      <main className={styles.page}>
        <p className={styles.message}>Conectando con la sala…</p>
      </main>
    );
  }

  const { teams, unassigned } = splitPlayersByTeam(state);

  return (
    <main className={styles.page}>
      <section className={styles.invite}>
        <RoomCode code={state.code} />
        <JoinQr url={buildJoinUrl(state.code)} />
      </section>

      <section className={styles.lobby}>
        {teams.length > 0 && (
          <div className={styles.teams}>
            {teams.map(({ team, players }) => (
              <TeamBoard key={team.id} team={team} players={players} />
            ))}
          </div>
        )}
        <PlayerList
          title="Sin equipo"
          players={unassigned}
          emptyMessage="Escaneá el QR o entrá con el código desde tu celular"
        />
      </section>
    </main>
  );
}
