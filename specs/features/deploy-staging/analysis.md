# Staging — Análisis técnico

Paso 3 de la Fase 5 (ver `specs/features/production-readiness/analysis.md`). Un entorno real, en internet, con HTTPS, donde se prueba el MVP con celulares reales antes de abrirlo al público. Es también donde se toma la decisión de proveedor.

Depende de: `specs/features/deploy-packaging/analysis.md` (imagen y variables), y de que los pasos 1a–1c estén cerrados: `specs/features/room-lifecycle/analysis.md`, `specs/features/player-reconnection/analysis.md` y `specs/features/server-hardening/analysis.md`. Desplegar antes de eso solo serviría para reproducir los problemas ya conocidos.

## Arquitectura objetivo

```
Celulares / TV  ──HTTPS──▶  Vercel (Next.js, apps/frontend)
       │
       └───────WSS──────▶  Backend NestJS + Socket.io (1 contenedor, siempre encendido)
                                   │
                                   ├──▶ api.anthropic.com   (ANTHROPIC_API_KEY, opcional)
                                   └──▶ itunes.apple.com    (previews de La Rocola)
```

- **Frontend en Vercel**, **backend en contenedor persistente**. Vercel no aloja WebSockets de larga duración ni estado en memoria; el backend necesita un proceso continuo (ver hallazgos en el índice).
- **Una sola instancia**, sin autoescalado horizontal (el estado vive en memoria). Escalar hacia arriba (más CPU/RAM) sí, hacia los lados no.
- **Sin Postgres** en staging, salvo que se resuelva a favor de necesitarlo la discrepancia de `content_banks` (ver índice).
- Frontend y backend en **dominios distintos** (p. ej. `app.dominio.com` y `api.dominio.com`, o los dominios por defecto de cada plataforma): por eso `CORS_ORIGINS` importa y por eso el WebSocket debe ir por `wss://` (un frontend HTTPS no puede abrir `ws://`).

## Elección del proveedor del backend

Criterios en orden de importancia para este proyecto: (1) **soporta WebSockets y procesos persistentes**, (2) **no duerme el proceso por inactividad** (una sala abierta sin tráfico no puede perder su estado), (3) despliegue simple desde el `Dockerfile`, (4) HTTPS/WSS automático, (5) costo bajo para pruebas.

| Opción | A favor | En contra |
|---|---|---|
| **Railway** | Despliegue desde repo/Dockerfile muy simple, variables por entorno, dominio HTTPS automático | Sin plan gratuito estable; se paga por uso |
| **Fly.io** | Control fino de región y de una sola máquina, buena latencia, WSS incluido | Más configuración (`fly.toml`); hay que fijar 1 máquina y evitar el autostop |
| **Render** | Muy simple, HTTPS automático | El plan gratuito **duerme el servicio** tras inactividad → descartado para staging; el de pago sí sirve |
| **VPS propio** (Hetzner, DigitalOcean) | Costo fijo, control total | Hay que administrar Docker, HTTPS (Caddy/Traefik) y actualizaciones |

**Recomendación:** Railway o Fly.io para staging. **Decisión abierta para Kalin** (preferencia de proveedor, presupuesto mensual, región — para México, una región cercana como `dfw`/`qro` en Fly reduce la latencia del buzz de La Rocola). El resto del análisis es independiente del proveedor elegido.

## Configuración requerida

Todas las variables del inventario de `deploy-packaging`. Específicamente para staging:

- `CORS_ORIGINS` = dominio de staging del frontend (exacto, con `https://`, sin barra final).
- `TRUST_PROXY_HOPS` = número de proxies del proveedor (típicamente 1); es lo que permite que el rate limit por IP use la IP real del cliente. Verificar con una prueba: dos IPs distintas no comparten contador.
- `ANTHROPIC_API_KEY`: **una clave dedicada a staging**, con su propio tope de gasto, separada de cualquier clave personal. Opcional: dejarla sin definir en staging para probar también el camino de respaldo.
- Frontend (Vercel, entorno Preview/Staging): `NEXT_PUBLIC_WS_URL=wss://<backend-staging>`, `NEXT_PUBLIC_APP_URL=https://<frontend-staging>`. Recordar que se incrustan en build: cambiar el backend implica un nuevo despliegue del frontend.
- Configuración del proveedor: **una** réplica/máquina, **sin autostop**, política de reinicio ante fallo, health check apuntando a `/health`, y el tiempo de espera de cierre suficiente para que el `server_restarting` de `server-hardening` llegue antes de matar el proceso.

## Puntos de riesgo propios de este paso

1. **Timeouts del proxy.** Algunos proxies cierran conexiones inactivas (30–60 s). `pingInterval: 25_000` (definido en `server-hardening`) mantiene el tráfico por debajo de ese umbral. Verificar con una sala inactiva de 5 minutos.
2. **Transporte de Socket.io.** El frontend fuerza `transports: ['websocket']` (`apps/frontend/src/lib/socket.ts`), lo que evita el polling HTTP y la necesidad de sticky sessions con una sola instancia. Correcto para v1; si el proveedor o una red restrictiva (WiFi de oficina) bloquea WebSocket, no hay caída a polling. Anotar como riesgo a observar en la prueba real, no cambiar preventivamente.
3. **Contenido mixto y HTTPS en el celular.** El QR de invitación se arma con `NEXT_PUBLIC_APP_URL` o `window.location.origin`: en staging debe apuntar al dominio HTTPS público, no a una IP LAN. Probar escaneando el QR desde un celular con **datos móviles**, no con el WiFi de la casa.
4. **Reinicio del proceso = todas las salas se pierden.** Es consecuencia de la decisión de estado en memoria (constitución, principio 3). Con esta configuración, un deploy en mitad de una partida la termina. Mitigación de v1: avisar a los clientes (`server_restarting`), desplegar solo cuando no haya salas activas (se consulta el contador de `/health`) y documentar el comportamiento. No se busca persistencia de sala en v1.
5. **Límite de iTunes desde la IP del servidor.** En local la consulta a `itunes.apple.com` sale desde una IP doméstica; en el proveedor sale desde una IP de datacenter compartida, con riesgo de limitación. Si falla, aplican la caché/resolución previa descrita en `server-hardening`.
6. **Recursos externos de los juegos.** Las imágenes de Memoriza los objetos se sirven desde `cdn.jsdelivr.net` (OpenMoji) y el audio de La Rocola desde las `previewUrl` de Apple: dependen de que los celulares las alcancen. Comprobar en la prueba real que no hay bloqueos en redes móviles.
7. **Zona horaria y reloj.** Los temporizadores usan `setInterval` en el servidor, no la hora del sistema; sin riesgo, pero confirmar que ningún cálculo usa `Date.now()` con cliente y servidor mezclados.

## Criterios de aceptación

- **Given** el frontend y el backend desplegados en staging, **when** un celular con datos móviles escanea el QR de una sala creada desde la TV, **then** llega a `/play/<codigo>` por HTTPS y se une sin errores.
- **Given** una sala en staging, **when** pasan 10 minutos sin actividad con sockets conectados, **then** la sala y los sockets siguen vivos (no hay corte por inactividad del proxy).
- **Given** un origen distinto al configurado, **when** intenta conectar, **then** el handshake falla.
- **Given** el contenedor del backend reiniciado, **then** el health check lo detecta y los clientes reciben `server_restarting` antes del corte.
- **Given** una clave de Anthropic inválida o ausente, **then** Trivia, Gestos y Adivina la palabra siguen funcionando con el banco de respaldo.
- **Given** dos clientes desde IPs distintas, **then** el rate limit los cuenta por separado (prueba de `TRUST_PROXY_HOPS`).

## Pruebas

- **Smoke test automatizado post-despliegue:** un script (Vitest o Playwright, en `apps/e2e`) que crea una sala contra la URL de staging, une dos clientes Socket.io, arma equipos e inicia un juego. Corre a demanda contra una URL pasada por variable de entorno; **no** forma parte del CI normal, para que ese siga sin depender de infraestructura externa.
- **Manual:** la prueba real del paso 4 del índice (checklist completa en `specs/features/production-readiness/analysis.md`), ejecutada sobre este entorno.

## Checklist manual

Se hace en este entorno y es la parte más importante del paso 4 (no se puede automatizar): escanear el QR con datos móviles, bloquear/desbloquear celulares, cambio WiFi↔datos, recargar `/screen`, jugar los seis minijuegos completos con 4–6 celulares (audio de La Rocola incluido), dejar una sala abandonada y comprobar en `/health` que baja el contador tras el TTL. Los defectos que aparezcan se registran como tareas nuevas en `tasks.md`; no se corrigen dentro de este paso.

## Subtareas

- [ ] Decidir el proveedor del backend (con Kalin) y crear el proyecto/entorno de staging.
- [ ] Configurar el servicio del backend: imagen del `Dockerfile`, variables, una réplica sin autostop, health check `/health`, reinicio ante fallo, tiempo de cierre ordenado.
- [ ] Configurar Vercel: proyecto sobre `apps/frontend` (Root Directory + archivos fuera de la raíz), variables de entorno de staging, decidir si los previews por rama se permiten (afecta `CORS_ORIGINS`).
- [ ] Dominio(s) y HTTPS/WSS; comprobar que no hay contenido mixto.
- [ ] Clave de Anthropic dedicada a staging con tope de gasto.
- [ ] Script de smoke test post-despliegue en `apps/e2e`.
- [ ] Ejecutar la checklist manual completa (paso 4) y registrar los hallazgos como tareas.
