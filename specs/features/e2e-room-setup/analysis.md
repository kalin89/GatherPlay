# E2E — camino feliz "crear sala → unirse → armar equipos" — Análisis técnico

Última tarea de Fase 1 (ver `tasks.md`). Depende de `specs/features/host-controls/analysis.md`
(controles de host en `/screen`, ya listo en código y pruebas) y, transitivamente, de
`specs/features/room-module/analysis.md`, `specs/features/team-assignment/analysis.md`,
`specs/features/screen-lobby/analysis.md` y `specs/features/play-lobby/analysis.md`.

No agrega ninguna capacidad de backend ni cambia comportamiento de la app — es la primera
prueba end-to-end real (Playwright) sobre lo que ya existe, con un navegador abriendo
`/screen` y `/play` en contextos paralelos, como pide `testing-strategy.md` → "E2E".
Sienta el patrón (workspace `apps/e2e`, cómo se levantan los dos servidores, cómo se
espera cada estado) que van a reutilizar las 8 suites de un archivo por minijuego de Fase 3.

## Criterios de aceptación

Cubre, en un solo camino feliz, los criterios Given/When/Then de `spec.md` de: "Motor de
sala" (crear sala, unirse, listar jugadores), "Armado de equipos" (crear/eliminar equipo,
asignar manual, randomizar), "Vista de pantalla" (no revelar sin equipos, revelar código y
QR, jugador sin equipo aparece, desconexión) y "Vista de jugador" (unirse, ver el equipo
asignado sin recargar).

## Diseño

- **`apps/e2e`** (workspace nuevo, `apps/*` de la raíz ya lo incluye): paquete propio con
  Playwright, separado de `apps/frontend` porque orquesta backend + frontend juntos, no es
  código de ninguna de las dos apps.
- **Puertos propios (3100 frontend / 3101 backend)**, distintos de los de `npm run dev`
  (3000/3001), para poder correr la suite con los servidores de desarrollo de Kalin
  también corriendo, sin pisarse.
- **Frontend con `next build` + `next start`** en vez de `next dev`: fija las variables
  `NEXT_PUBLIC_*` en el build con los valores de e2e (`localhost`, no las IPs LAN de
  `apps/frontend/.env.local`) — Playwright las pasa por `env` en `webServer`, que gana
  sobre `.env.local`. Usa un `distDir` separado (`.next-e2e`, vía `NEXT_DIST_DIR`) para no
  pisar el `.next` del dev server.
- **Backend con `nest start`** (sin watch) y `PORT=3101` — no necesita Postgres: las salas
  viven en memoria (`AppModule` no tiene Prisma todavía), así que el job de CI no levanta
  ninguna base de datos.
- **Selectores:** roles/labels/placeholders que ya existen en los componentes
  (`aria-label="Asignar a X al equipo Y"`, `Eliminar equipo X`, placeholders del
  formulario, texto de los botones). No se agrega ningún `data-testid`.
- `apps/frontend/next.config.ts`: única línea nueva, `distDir` configurable por env var
  (default `.next`, no cambia nada para `dev`/`build` normales).
- `.github/workflows/ci.yml`: job `e2e` nuevo, con `npx playwright install --with-deps chromium`
  y `npm run test:e2e --workspace apps/e2e`; sube el reporte de Playwright como artefacto
  si falla.

## Pruebas

Un solo spec, `apps/e2e/tests/room-setup.spec.ts` (Playwright), con un contexto de
navegador para la pantalla y uno por celular (Ana, Beto):

1. Crear sala desde `/` → llega a `/screen/[CODE]`.
2. Botón "Mostrar código" deshabilitado sin equipos, código/QR no visibles.
3. Crear equipo con nombre equivocado, eliminarlo (`remove_team`), confirmar que
   desaparece.
4. Crear "Rojos" y "Azules" con colores distintos → aparecen las tarjetas, se habilita
   revelar.
5. Revelar código → se ven el código y el QR, los controles de equipos siguen visibles.
6. Ana entra por `/play/[CODE]`, ve confirmación y "esperando equipo".
7. Ana aparece en "Sin equipo" en la pantalla sin recargar.
8. Asignación manual de Ana a "Rojos" desde la pantalla → su `/play` refleja el equipo sin
   recargar, sale de "Sin equipo" en la pantalla.
9. Beto entra, aparece en "Sin equipo".
10. Randomizar equipos → cada equipo queda con 1 integrante, cada celular ve su tarjeta de
    equipo actualizada sin recargar.
11. Beto cierra su pestaña → desaparece de la pantalla.

## Checklist manual

Primera tarea de Fase 1 donde aplica el checklist completo de `testing-strategy.md` (no
aplica la excepción de "puro backend" — hay UI real conectada desde `screen-lobby` y
`play-lobby`):

- [x] Probado desde al menos dos celulares reales (no solo devtools/emulador), en la misma
      red WiFi.
- [x] Pantalla compartida probada en una TV o proyector — legibilidad del texto y tamaño
      del QR a distancia.
- [x] Un jugador pierde señal WiFi un momento y vuelve a entrar con el mismo código
      (nota: reconexión conservando su lugar es Fase 4 — acá solo se verifica que hoy se
      lo trata como jugador nuevo, sin romper la sala).
- [x] El flujo completo jugado por un familiar sin contexto técnico, sin que nadie le
      explique qué hacer.
- [x] Checklist manual pendiente de `specs/features/host-controls/analysis.md` (crear sala
      con 2+ equipos, mostrar código, F5 en `/screen`, legibilidad de los controles de
      host) — se termina de verificar acá porque es la misma sesión de prueba real.

## Subtareas

- [x] `apps/e2e`: `package.json`, `playwright.config.ts`, `tsconfig.json`.
- [x] `apps/frontend/next.config.ts`: `distDir` configurable.
- [x] `tests/room-setup.spec.ts`: camino feliz completo — verificado en verde localmente,
      y que falla de verdad si se rompe una aserción (con trace generado).
- [x] `.github/workflows/ci.yml`: job `e2e`.
- [x] `.gitignore`: artefactos de Playwright y `.next-e2e/`.
- [x] Checklist manual completo (ver arriba).
