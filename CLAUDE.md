# Reglas de trabajo en este repo

## Commits y push

Los commits y los `git push` los hace Kalin, no Claude — salvo que se lo pida explícitamente en ese momento puntual. Que haya aprobado o pedido algo relacionado (por ejemplo, confirmar que se suba un cambio a producción) no es pedir el commit: hay que pedirlo aparte, cada vez.

Cuando el trabajo esté listo, Claude deja los cambios en el working tree (o los deja staged si aplica) y muestra qué cambió — pero no corre `git commit` ni `git push` a menos que la instrucción lo diga explícitamente ("commitea esto", "haz push", etc.).
