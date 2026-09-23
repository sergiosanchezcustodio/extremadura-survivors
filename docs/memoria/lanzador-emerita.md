# Lanzador `extremadura`

> Sergio arranca el proyecto con el comando `extremadura` (antes `emerita`), que hace cd al repo y abre sesión nueva; `-c` retoma la anterior.
>
> Tipo: referencia.

Existe `C:\Users\sergi\.local\bin\extremadura.cmd` (esa carpeta ya está en el PATH de usuario). Ejecutar `extremadura` desde cualquier sitio hace `cd` a `C:\ClaudeProjects\extremadura-survivors` y lanza `claude --permission-mode auto` con **sesión nueva**. Con argumentos los pasa tal cual: `extremadura -c` retoma la última sesión, `extremadura --resume` abre el selector.

**EL 13/09/2026 EL JUEGO PASÓ DE LLAMARSE "Emerita Survivors" A "Extremadura Survivors"**, y con él el comando, la carpeta del repositorio y la carpeta de sesiones de Claude. Lo anterior era `emerita.cmd`, `C:\ClaudeProjects\emerita-survivors` y `C--ClaudeProjects-emerita-survivors`. Si algo apunta todavía a un nombre con "emerita", casi seguro es de antes del cambio. Lo que NO se renombró a propósito: el worker de Cloudflare (`emerita-partidas...workers.dev`, es backend y nadie lo ve), el id del nivel `merida` (el sitio se sigue llamando Mérida) y `prompt-emerita-survivors.md` (documento histórico). Ver [Cambio de nombre a Extremadura Survivors](cambio-de-nombre-extremadura.md).

**Por qué:** hasta el 15/08/2026 el comando sin argumentos hacía `claude --continue`, así que nunca empezaba una sesión limpia: una sola sesión vivió del 2 al 14 de agosto y su contexto llegó a 940k tokens, que se releían en cada llamada. Ver [Coste: manda el contexto acumulado](coste-por-contexto-acumulado.md).

**Cómo aplicarlo:** si pregunta cómo retomar el trabajo, la respuesta es `extremadura -c` — y solo cuando de verdad necesite el hilo anterior; para una tarea nueva, `extremadura` a secas. Las sesiones en disco están en `C:\Users\sergi\.claude\projects\C--ClaudeProjects-extremadura-survivors\*.jsonl` y se pueden leer directamente para recuperar lo hablado.

## Con Codex (desde el 23/09/2026)

`herramientas\instalar-lanzador.ps1 -Agente codex` reescribe el mismo
`extremadura.cmd` para que abra el CLI de Codex en vez de Claude Code, con las
mismas costumbres: `extremadura` abre sesión nueva y `extremadura -c` retoma la
última (se traduce a `codex resume --last`, porque en Codex `-c` es otra cosa).
Para volver a Claude, se reinstala sin `-Agente`. Las sesiones de Codex viven
en `%USERPROFILE%\.codex\sessions\`. Ver `docs/migrar-a-codex.md`.
