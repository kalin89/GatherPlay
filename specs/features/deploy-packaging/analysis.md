# Empaquetado para despliegue — Análisis técnico

Paso 2 de la Fase 5 (ver `specs/features/production-readiness/analysis.md`). Deja el backend y el frontend en un estado en el que se pueden construir y arrancar de forma reproducible fuera de la laptop de desarrollo, sin decidir todavía en qué proveedor corren (eso es `deploy-staging`).

Depende de: los pasos 1a–1c cierran el comportamiento; este paso **puede empezar en paralelo** porque no toca lógica, pero no se despliega nada hasta que 1a–1c estén listos. Ver `specs/features/room-lifecycle/analysis.md`, `specs/features/player-reconnection/analysis.md` y `specs/features/server-hardening/analysis.md` (estos dos últimos introducen variables de entorno que este análisis lista).

## Estado actual (verificado)

- **Monorepo npm workspaces** (`apps/backend`, `apps/frontend`, `apps/e2e`), raíz con `package-lock.json`. Node 24 en CI (`.github/workflows/ci.yml`).
- **Backend:** NestJS 12, **ESM** (`"type": "module"`), `nest build` → `dist/`, `start:prod` = `node dist/main`. `main.ts` carga `dotenv/config` y escucha `process.env.PORT ?? 3000`. `tsconfig.build.json` excluye specs y tests.
- **Frontend:** Next.js 16, `next build` / `next start`. `NEXT_PUBLIC_WS_URL` y `NEXT_PUBLIC_APP_URL` se leen en **tiempo de build** (prefijo `NEXT_PUBLIC_` se incrusta en el bundle): cambiar de URL de backend exige reconstruir el frontend.
- **CI** ya corre lint + unitarias + e2e de backend, lint + tests + build del frontend, y un job `e2e` (Playwright). No hay paso de despliegue ni de construir la imagen.
- **Sin `Dockerfile`, sin `.dockerignore`, sin `/health`.** `docker-compose.yml` solo levanta Postgres para desarrollo.
- **Prisma:** `@prisma/client` y `prisma` están en `dependencies`/`devDependencies`, pero ningún archivo de `src` los usa y `schema.prisma` no tiene tablas. Ver la discrepancia sobre `content_banks` documentada en `specs/features/production-readiness/analysis.md`.
- El backend tiene `dist/` y `tsconfig.build.tsbuildinfo` locales (ignorados por git — `dist/` sí, el `.tsbuildinfo` también por `*.tsbuildinfo`).

## Decisiones de diseño

### Backend: imagen Docker multi-etapa desde la raíz del monorepo

- El contexto de build es **la raíz del repo** (no `apps/backend`), porque las dependencias se resuelven con el `package-lock.json` de la raíz. `Dockerfile` en `apps/backend/Dockerfile` con `docker build -f apps/backend/Dockerfile .`.
- Etapas:
  1. `deps`: `node:24-alpine`, copia `package.json` de la raíz y de `apps/backend` (solo manifiestos) + `package-lock.json`, `npm ci --workspace apps/backend --include-workspace-root` para aprovechar caché de capas.
  2. `build`: copia el código de `apps/backend`, corre `npm run build --workspace apps/backend`.
  3. `runtime`: `node:24-alpine`, `npm ci --omit=dev --workspace apps/backend`, copia solo `dist/`, corre como usuario no root (`USER node`), `NODE_ENV=production`, `EXPOSE` del puerto, `CMD ["node", "apps/backend/dist/main.js"]`.
- `.dockerignore` en la raíz: `node_modules`, `.next`, `dist`, `.git`, `.env*`, `apps/e2e`, `apps/frontend`, `coverage`, `specs`. Importante que **`.env` nunca entre en la imagen**: los secretos se inyectan como variables de la plataforma.
- **Prisma:** si no se usa en runtime, no se ejecuta `prisma generate` ni se incluye el cliente en la imagen. Si la tarea de `content_banks` se confirma como necesaria, se agrega `prisma generate` en la etapa `build` y `prisma migrate deploy` como paso previo al arranque (comando de release de la plataforma).
- **Ojo ESM:** los imports internos usan extensión `.js` (`'./app.module.js'`), coherente con `nest build`; verificar que `dist/main.js` arranca con `node` fuera de Nest CLI — se prueba en el propio build de la imagen (`docker run` + `/health`).
- Tamaño esperado pequeño (sin `devDependencies`, sin el frontend). Se verifica que `oxlint`, `vitest`, `prisma` CLI y `typescript` no queden en la imagen final.

### Frontend: sin contenedor, en Vercel

- Vercel construye desde el monorepo con **Root Directory = `apps/frontend`** y "Include source files outside of the Root Directory" activado (por el workspace raíz). Comando de build por defecto (`next build`).
- Variables en Vercel (entornos Production y Preview): `NEXT_PUBLIC_WS_URL` (URL **wss** pública del backend) y `NEXT_PUBLIC_APP_URL` (dominio público del frontend, para el QR de invitación; si se omite usa `window.location.origin`, que en Vercel también sirve).
- **Sin `allowedDevOrigins` en producción:** esa opción es solo de `next dev`; no molesta, pero se deja documentado que no aplica.
- Los previews de Vercel generan URLs distintas por rama: el backend debe aceptar esos orígenes (`CORS_ORIGINS`) o los previews se desactivan. Decisión en `deploy-staging`.
- Asegurar que `apps/e2e` no forme parte del build de Vercel.

### Configuración por variables de entorno

Inventario completo (todas con valor por defecto sensato en local; en producción se fijan explícitamente). Se documenta en un único `apps/backend/.env.example` ampliado y en la tabla de `deploy-staging`:

| Variable | Dónde | Origen del requisito | Notas |
|---|---|---|---|
| `PORT` | backend | ya existe | La plataforma suele inyectarla; no fijarla a mano si lo hace. |
| `ANTHROPIC_API_KEY` | backend | ya existe | Solo en el servidor. Si falta, se usa el banco de respaldo. |
| `DATABASE_URL` | backend | ya existe | Solo si se confirma Postgres (ver discrepancia). |
| `CORS_ORIGINS` | backend | `server-hardening` | Lista separada por comas. |
| `ROOM_EMPTY_TTL_MS`, `ROOM_MAX_AGE_MS`, `ROOM_HOST_GRACE_MS`, `MAX_ROOMS` | backend | `room-lifecycle` | |
| `PLAYER_GRACE_MS`, `MAX_PLAYERS_PER_ROOM` | backend | `player-reconnection`, `server-hardening` | |
| `RATE_LIMIT_*`, `AI_MAX_PER_ROOM_HOUR`, `AI_MAX_GLOBAL_HOUR` | backend | `server-hardening` | |
| `TRUST_PROXY_HOPS` | backend | `server-hardening` | Número de proxies delante del backend. |
| `LOG_LEVEL` | backend | `server-hardening` | |
| `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_APP_URL` | frontend | ya existen | Se incrustan en build. |

- **Validar la configuración al arrancar** (esquema Zod sobre `process.env` en `main.ts`): si falta algo obligatorio en producción o un valor es inválido, el proceso falla al iniciar con un mensaje claro en lugar de fallar en la primera partida. Por ejemplo: `NODE_ENV=production` sin `CORS_ORIGINS` debe abortar (no caer en `*`).
- Los `.env.example` de ambos `apps` se actualizan; los `.env` reales nunca entran al repo (`.gitignore` ya los excluye).

### Pipeline (CI/CD)

- El CI existente se mantiene como puerta: nada se despliega si lint/tests/e2e no pasan.
- Agregar un job **`docker`** que construye la imagen del backend (sin publicarla) y la arranca con `/health` como comprobación — detecta problemas de ESM, dependencias de producción o archivos faltantes antes de llegar a staging.
- El despliegue en sí lo hace la plataforma (deploy automático desde `main`) o un job posterior; se define en `deploy-staging` según el proveedor. **No se implementa aquí ningún despliegue automático a producción**: promover a producción es una acción manual de Kalin (mismo criterio que commits/push en `CLAUDE.md`).
- Verificar que Node de la imagen coincide con el de CI (24) y con `engines` en `package.json` (hoy no está declarado; se agrega para que la plataforma no elija otra versión).

## Criterios de aceptación

- **Given** el repo limpio, **when** se ejecuta `docker build -f apps/backend/Dockerfile .`, **then** termina sin errores y la imagen no contiene `devDependencies` ni archivos `.env`.
- **Given** la imagen construida y las variables requeridas, **when** se ejecuta, **then** responde `200` en `/health` y acepta una conexión de Socket.io.
- **Given** `NODE_ENV=production` y `CORS_ORIGINS` sin definir (o cualquier variable obligatoria inválida), **then** el proceso termina al iniciar con un error explícito.
- **Given** un build del frontend con `NEXT_PUBLIC_WS_URL` apuntando al backend de staging, **then** la app se conecta por `wss` sin errores de contenido mixto.
- **Given** un push a `main`, **then** el CI construye la imagen del backend y falla si no arranca.

## Pruebas

- **Unitarias:** el esquema de configuración (variables válidas, faltantes, con formato inválido, matriz por `NODE_ENV`).
- **CI:** job `docker` (build + arranque + `curl /health`).
- **Manual, local:** `docker run` con un `.env` de ejemplo y conexión desde `apps/frontend` en modo `next start` apuntando al contenedor.

## Checklist manual

Tarea de infraestructura sin UI nueva: aplica la excepción de `testing-strategy.md`. Lo único a verificar a mano es que la imagen corra localmente con `docker run` y que el frontend de desarrollo se conecte a ella; el cierre real es `deploy-staging`.

## Subtareas

- [ ] Validación de configuración al arrancar (esquema Zod de `process.env`) y `engines` de Node.
- [ ] Actualizar `.env.example` de backend y frontend con todas las variables del inventario.
- [ ] `Dockerfile` multi-etapa del backend + `.dockerignore`; comprobar arranque ESM fuera de Nest CLI.
- [ ] Job `docker` en `.github/workflows/ci.yml`.
- [ ] Documentar la configuración de Vercel (Root Directory, variables) en `deploy-staging`.
- [ ] Resolver la discrepancia de `content_banks`/Prisma (con Kalin): confirmar si Postgres entra o no en el despliegue.
