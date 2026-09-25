export class NotEnoughTeamsError extends Error {
  constructor() {
    super('Se necesitan al menos dos equipos con integrantes para repartir turnos');
    this.name = 'NotEnoughTeamsError';
  }
}

export interface TurnAssignment {
  teamId: string;
  playerId: string;
}

interface TeamWithPlayers {
  id: string;
  playerIds: string[];
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function distributeTurns(
  teams: TeamWithPlayers[],
  roundsPerPlayer: number,
  random: () => number = Math.random,
): TurnAssignment[] {
  const participating = teams.filter((team) => team.playerIds.length > 0);
  if (participating.length < 2) {
    throw new NotEnoughTeamsError();
  }

  const maxTeamSize = Math.max(...participating.map((team) => team.playerIds.length));
  const totalTurnsPerTeam = roundsPerPlayer * maxTeamSize;

  const teamQueues = participating.map((team) => {
    const shuffledPlayers = shuffle(team.playerIds, random);
    const queue: TurnAssignment[] = [];
    for (let i = 0; i < totalTurnsPerTeam; i++) {
      queue.push({
        teamId: team.id,
        playerId: shuffledPlayers[i % shuffledPlayers.length],
      });
    }
    return queue;
  });

  const startIndex = Math.floor(random() * teamQueues.length);
  const rotatedQueues = [
    ...teamQueues.slice(startIndex),
    ...teamQueues.slice(0, startIndex),
  ];

  const turns: TurnAssignment[] = [];
  for (let i = 0; i < totalTurnsPerTeam; i++) {
    for (const queue of rotatedQueues) {
      turns.push(queue[i]);
    }
  }

  return turns;
}
