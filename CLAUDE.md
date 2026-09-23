# Reglas de trabajo en este repo

## Commits y push

Los commits y los `git push` los hace Kalin, no Claude — salvo que se lo pida explícitamente en ese momento puntual. Que haya aprobado o pedido algo relacionado (por ejemplo, confirmar que se suba un cambio a producción) no es pedir el commit: hay que pedirlo aparte, cada vez.

Cuando el trabajo esté listo, Claude deja los cambios en el working tree (o los deja staged si aplica) y muestra qué cambió — pero no corre `git commit` ni `git push` a menos que la instrucción lo diga explícitamente ("commitea esto", "haz push", etc.).

## Tamaño de las tareas

Antes de implementar una tarea de `specs/tasks.md`: si el plan requiere tocar
tanto `apps/backend` como `apps/frontend`, o agregar al backend una
capacidad que todavía no existe (endpoint, evento WS), proponerle a Kalin
dividirla en sub-tareas secuenciales — primero el cambio de backend
(cerrable y probable solo), después el consumo desde frontend — antes de
escribir código. No dividir mecánicamente si, al revisar, una de las dos
partes no implica trabajo real (ej. el backend ya expone lo necesario).

Esto aplica solo hacia adelante: no se reescriben tareas ya cerradas de
`tasks.md` para acomodarlas a esta regla.

### Dependencias entre sub-tareas

Cuando una tarea grande queda dividida en varias más chicas (por la regla de
arriba o por cualquier otra razón), la dependencia entre ellas se deja
explícita, no implícita en el orden de la lista:

- En `specs/tasks.md`: la línea de la sub-tarea que depende de otra lo dice,
  mencionando la ruta de su `analysis.md` (ej. "Depende de:
  `specs/features/remove-team/analysis.md`").
- En el propio `specs/features/<nombre>/analysis.md`: al principio, qué
  tarea(s) previa(s) necesita, con su ruta exacta — mismo patrón que ya usan
  `team-assignment` y `screen-lobby` al mencionar `room-module`.

## Mensaje de cierre al terminar una tarea

Al terminar de implementar una tarea (código + pruebas automatizadas en
verde), el mensaje final a Kalin dice explícitamente:

1. Que quedó lista (o qué falta, si algo no se pudo cerrar).
2. El nombre/ruta del `specs/features/<nombre>/analysis.md` correspondiente.
3. Los puntos de la checklist manual que Kalin todavía tiene que verificar
   él mismo — si la tarea es de puro backend sin UI conectada (excepción de
   `testing-strategy.md`), decirlo explícitamente en vez de listar puntos
   que no aplican.
