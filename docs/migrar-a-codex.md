# Trabajar con Codex

El 23/09/2026 se preparó el repositorio para trabajar con **Codex** (OpenAI) igual
que con Claude Code, sin perder nada de lo aprendido. Este documento cuenta qué
se hizo, cómo se arranca y qué se queda por el camino.

## Qué se hizo

**Todo lo que el agente necesita saber está ahora DENTRO del repositorio.**
Antes había dos sitios que Codex no podía ver:

1. **Las instrucciones** estaban en `CLAUDE.md`. Ahora la fuente única es
   **`AGENTS.md`**, que es lo que lee Codex al arrancar. `CLAUDE.md` se ha
   quedado en una línea que lo importa (`@AGENTS.md`) más tres notas propias de
   Claude, así que los dos agentes leen lo mismo y no hay dos copias que se
   separen.
2. **La memoria** —diecinueve decisiones y formas de trabajar que no están en el
   código— vivía en `~/.claude/projects/.../memory/`, fuera del repo y solo en
   esta máquina. Ahora está en **`docs/memoria/`**, versionada, con un índice.
   Al pasarla se corrigió lo que se había quedado viejo (el "hundirse" en los
   muros del nivel 2, ya quitado; la capa nítida y `personajes.js`, ya hechos;
   ropa y libros, que volvieron como tipos de tienda).

Además:

- **`docs/arquitectura.md`**, nuevo: el mapa del código que antes solo estaba
  en la cabeza de quien lo había leído, con el orden de un paso de partida y
  la tabla de todas las pruebas.
- **`.codex/config.toml`** trae el servidor MCP de **Playwright**, el mismo que
  usaba Claude para mirar el juego en un navegador. `.codex/hooks.json` hace los
  pitidos al terminar, como `.claude/settings.json`.
- **`herramientas/instalar-lanzador.ps1 -Agente codex`** deja el comando
  `extremadura` abriendo Codex en el repo.

## Arrancar

```powershell
npm install -g @openai/codex       # una vez
codex login                        # una vez, con la cuenta de ChatGPT
.\herramientas\instalar-lanzador.ps1 -Agente codex
extremadura                        # sesión nueva en el repo
extremadura -c                     # retomar la última (codex resume --last)
```

La primera vez que Codex abra el repositorio preguntará si se confía en él;
hace falta decir que sí para que cargue `.codex/config.toml`.

Para las pruebas de navegador, una sola vez: `npm install` y
`npx playwright install chromium`.

Los tokens de Replicate y ElevenLabs siguen en `.env`, que no se versiona: en
una máquina nueva hay que volver a crearlo a mano.

## Lo que NO se lleva

- **El historial de conversaciones de Claude.** Las sesiones están en
  `C:\Users\sergi\.claude\projects\C--ClaudeProjects-extremadura-survivors\*.jsonl`.
  Lo que importaba de ellas ya está en `docs/memoria/` y en los comentarios del
  código; si hace falta recuperar una conversación concreta, esos ficheros se
  pueden leer.
- **Las herramientas propias de Claude**: artifacts, subagentes con nombre,
  skills. Donde `AGENTS.md` habla de "subagente" o de evaluar JavaScript en la
  página, en Codex se hace con lo que tenga (otra tarea, o Playwright por MCP).
- **Los permisos y el modo automático**, que son de cada herramienta. En Codex
  se eligen con `/approvals` dentro de la sesión.

## Volver a Claude o usar los dos

No hay nada que deshacer: `CLAUDE.md` importa `AGENTS.md`, así que Claude lee las
mismas instrucciones. Para que `extremadura` vuelva a abrir Claude, se ejecuta
`.\herramientas\instalar-lanzador.ps1` sin `-Agente`.

**Regla para los dos:** lo que se aprenda se escribe en `docs/memoria/` y las
instrucciones se cambian en `AGENTS.md`. Nada en memorias privadas de una sola
herramienta.
