import type { TeamScore } from '../game-engine/game-engine.types.js';
import type { RoomState } from '../room/room.types.js';

export interface RocolaRoundResult {
  songId: string;
  titulo: string;
  artista: string;
  portadaUrl: string;
  teamId: string | null;
  playerId: string | null;
  playerName: string | null;
  puntos: 0 | 1;
  // Lo que el jugador escribió (cadena vacía si no llegó a escribir nada
  // antes de que se acabara el tiempo) — se muestra en la revelación para
  // que el resto vea qué se juzgó, ya que ahora el juicio es automático.
  respuesta: string;
}

export type LaRocolaEvent =
  | { type: 'room_state'; code: string; room: RoomState }
  | {
      type: 'rocola_ready_state';
      code: string;
      readyPlayerIds: string[];
      eligiblePlayerIds: string[];
    }
  | {
      type: 'rocola_round_started';
      code: string;
      roundNumber: number;
      totalRounds: number;
      marcador: TeamScore[];
    }
  | { type: 'rocola_countdown_tick'; code: string; remainingSeconds: number }
  | {
      type: 'rocola_audio_control';
      code: string;
      targetSocketIds: string[];
      action: 'play' | 'pause' | 'resume';
      previewUrl?: string;
    }
  | { type: 'rocola_buzzer_open'; code: string; eligibleTeamIds: string[] | null }
  | {
      type: 'rocola_buzzer_locked';
      code: string;
      playerId: string;
      playerName: string;
      teamId: string;
    }
  | { type: 'rocola_answer_tick'; code: string; remainingSeconds: number }
  | {
      type: 'rocola_robo_started';
      code: string;
      eligibleTeamIds: string[];
      eligibleTeamNames: string[];
      remainingSeconds: number;
    }
  | { type: 'rocola_round_result'; code: string; resultado: RocolaRoundResult }
  | {
      type: 'rocola_match_result';
      code: string;
      scores: TeamScore[];
      canciones: { titulo: string; artista: string; teamId: string | null }[];
    };
