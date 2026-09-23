@AGENTS.md

## Solo para Claude Code

Las instrucciones del proyecto están en `AGENTS.md` (importado arriba), que es
la fuente única para Claude y para Codex. Aquí va solo lo específico de Claude:

- **La memoria del proyecto vive en `docs/memoria/`**, no en la memoria privada
  de `~/.claude/projects/.../memory/`. Lo que haya que recordar se escribe ahí,
  para que lo vea también Codex (ver `docs/memoria/README.md`).
- Para comprobar hechos en el navegador, `javascript_tool` o
  `read_console_messages` en vez de capturas; los lotes de imágenes, a un
  subagente; y `/clear` al cerrar cada tarea.
