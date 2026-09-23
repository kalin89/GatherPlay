# Controles de host en `/screen` — Análisis técnico

Tarea de Fase 1 (ver `tasks.md`), sobre `RoomModule`, armado de equipos y `/screen` ya existentes (`specs/features/room-module/analysis.md`, `specs/features/team-assignment/analysis.md`, `specs/features/screen-lobby/analysis.md`). Depende de: `specs/features/remove-team/analysis.md` (evento `remove_team`, ya listo). Alcance: darle al host una forma real de armar equipos desde la pantalla compartida (TV/iPad/compu) antes de revelar el código, y de seguir ajustándolos mientras entran los jugadores. El host nunca es un jugador.

No incluye ningún cambio de backend — los cuatro eventos que se usan (`create_team`, `remove_team`, `assign_team`, `randomize_teams`) ya existían. 100% frontend.

## Criterios de aceptación

Ver `spec.md` → "Motor de sala" → "Vista de pantalla (lobby y controles de host)".

## Diseño

- `src/hooks/use-room-state.ts` (extendido): expone `actions` (`createTeam`, `removeTeam`, `assignPlayerToTeam`, `randomizeTeams`) que reutilizan el mismo socket ya abierto para `watch_room` — no hace falta una segunda conexión. También distingue `error` (fatal, antes del primer `room_state` — sala no encontrada) de `actionError` (después de ya tener `state` — un fallo puntual de una acción, no reemplaza la vista).
- `src/lib/team-colors.ts` (nuevo): paleta fija de 8 colores en vez de un selector libre.
- `src/components/create-team-form.tsx` (nuevo): nombre + grilla de swatches + botón, llama a `onCreate(name, color)`.
- `src/components/team-board.tsx` (extendido): prop opcional `onRemove` — sin ella, se comporta igual que antes.
- `src/app/screen/[roomCode]/team-manager.tsx` (nuevo): orquesta `CreateTeamForm`, la lista de equipos (con `onRemove`), los jugadores sin equipo (con un swatch por equipo para asignarlos con un click) y el botón de randomizar.
- `src/app/screen/[roomCode]/screen-lobby.tsx` (reestructurado): `revealed` es estado local, nunca viaja al backend. Se muestra un botón "Mostrar código a los jugadores" (deshabilitado sin equipos) en vez del QR hasta que el host lo activa. Para sobrevivir un F5 sin fricción: si el primer `room_state` que llega ya trae equipos, arranca revelado directo (se ajusta durante el render, no en un efecto, para no violar `react-hooks/set-state-in-effect`).
- `src/components/player-list.tsx` se eliminó — quedó sin uso, reemplazado por la lista de "sin equipo" con swatches de `TeamManager`.

## Pruebas

Vitest + Testing Library, mismo patrón de doble de socket ya usado en el resto del frontend:

- `use-room-state.spec.ts` (nuevo): cada acción emite el evento correcto; error antes del primer estado es fatal, error después es `actionError`.
- `create-team-form.spec.tsx`: botón deshabilitado sin nombre; nombre recortado + color elegido.
- `team-board.spec.tsx` (ampliado): con/sin `onRemove`.
- `team-manager.spec.tsx` (nuevo): crear/eliminar/asignar/randomizar disparan las acciones correctas.
- `screen-lobby.spec.tsx` (ampliado): botón deshabilitado sin equipos, se habilita y revela con un equipo, auto-revelado si el primer estado ya trae equipos, `actionError` no reemplaza la vista, crear equipo desde el formulario emite el evento.

## Checklist manual

Tercera tarea de Fase 1 con UI real — aplica el checklist completo de `testing-strategy.md`:

- [ ] Crear sala, armar 2+ equipos (incluyendo corregir uno con el botón de eliminar), mostrar código.
- [ ] Dos celulares reales entran por `/play` con su nombre.
- [x] Asignación manual de un jugador a un equipo desde `/screen` (swatch por equipo) — confirmado que se refleja en su `/play` sin recargar.
- [x] Botón de randomizar equipos — confirmado que reparte a los jugadores y se refleja en cada `/play` sin recargar.
- [ ] F5 en `/screen` con equipos ya creados: no vuelve a pedir "mostrar código", salta directo al QR.
- [ ] Legibilidad de los controles (swatches, botones de eliminar/randomizar) a la distancia típica desde la que el host los toca (TV con control remoto/puntero, o iPad/laptop de cerca).

## Subtareas

- [x] `use-room-state`: acciones de host + distinción `error`/`actionError` + pruebas.
- [x] `team-colors`, `create-team-form` + pruebas.
- [x] `team-board`: prop `onRemove` + pruebas.
- [x] `team-manager` (crear, eliminar, asignar, randomizar) + pruebas.
- [x] `screen-lobby`: gating de revelado + auto-revelado + pruebas.
- [x] Limpieza: `player-list` eliminado (sin uso).
- [ ] Checklist manual completo (ver arriba) — pendiente: requiere celulares reales y una TV/proyector.
