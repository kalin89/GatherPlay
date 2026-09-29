export interface RoomLifecycleConfig {
  /** Tiempo sin ninguna pantalla de host conectada antes de cerrar la sala. */
  hostGraceMs: number;
  /** Vida máxima de una sala, aunque haya gente conectada. */
  maxAgeMs: number;
  /** Tope de salas simultáneas en el proceso. */
  maxRooms: number;
  /** Cada cuánto se revisa qué salas expiraron. */
  sweepIntervalMs: number;
}

export const ROOM_LIFECYCLE_CONFIG = Symbol('ROOM_LIFECYCLE_CONFIG');

export const DEFAULT_ROOM_LIFECYCLE_CONFIG: RoomLifecycleConfig = {
  hostGraceMs: 2 * 60 * 1000,
  maxAgeMs: 12 * 60 * 60 * 1000,
  maxRooms: 200,
  sweepIntervalMs: 30 * 1000,
};

const ENV_VARIABLES = {
  hostGraceMs: 'ROOM_HOST_GRACE_MS',
  maxAgeMs: 'ROOM_MAX_AGE_MS',
  maxRooms: 'MAX_ROOMS',
  sweepIntervalMs: 'ROOM_SWEEP_INTERVAL_MS',
} as const satisfies Record<keyof RoomLifecycleConfig, string>;

// Falla al arrancar ante un valor inválido en vez de caer en silencio al
// valor por defecto: una variable mal escrita en el servidor no debe pasar
// desapercibida hasta que las salas empiecen a acumularse.
export function loadRoomLifecycleConfig(
  env: Record<string, string | undefined>,
): RoomLifecycleConfig {
  const config = { ...DEFAULT_ROOM_LIFECYCLE_CONFIG };
  for (const key of Object.keys(ENV_VARIABLES) as (keyof RoomLifecycleConfig)[]) {
    const name = ENV_VARIABLES[key];
    const raw = env[name];
    if (raw === undefined || raw.trim() === '') continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} debe ser un entero positivo, recibí "${raw}"`);
    }
    config[key] = value;
  }
  return config;
}
