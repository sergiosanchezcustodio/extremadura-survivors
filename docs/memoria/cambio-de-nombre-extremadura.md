# Cambio de nombre a Extremadura Survivors

> El juego se renombró de Emerita Survivors a Extremadura Survivors el 13/09/2026; qué cambió y qué se dejó a propósito con el nombre viejo.
>
> Tipo: decisión del proyecto.

El 13/09/2026 el juego pasó de **Emerita Survivors** a **Extremadura Survivors**. Se hizo entonces porque no lo usaba nadie salvo el hermano de Sergio, y ese era el momento más barato: sin enlaces repartidos y sin progreso ajeno que romper.

Cambió el nombre visible (22 sitios), el identificador `emerita-survivors` → `extremadura-survivors` (repo, Pages, itch, `package.json`, herramientas), el comando del lanzador (`emerita` → `extremadura`) y las claves de `localStorage`, **con migración que copia lo viejo a lo nuevo sin borrarlo** (ver `migrarClaves` en `js/core/metaProgreso.js`, y lo mismo en `audio.js` y `nube.js`).

**SE DEJÓ CON EL NOMBRE VIEJO A PROPÓSITO**, y no es un descuido:

- **El worker de Cloudflare** (`emerita-partidas.sergiosanchezcustodio.workers.dev`). Es backend, no lo ve nadie, y renombrarlo obliga a recrearlo y a cambiar la URL de callback de la app de OAuth de GitHub: trabajo real que se rompe en silencio a cambio de nada visible.
- **El id del nivel `merida`** y todo lo que cuelga de él (`assets/voz/merida.mp3`, su historia, el desbloqueo). Ese sitio se sigue llamando Mérida.
- **`prompt-emerita-survivors.md`**, el prompt original del proyecto: es un documento histórico.
- El comentario de `manual/recortar-sprites.ps1` sobre una ruta antigua, que narra un bug pasado.

**Por qué:** sin esto, cualquiera que vea "emerita" en el código dentro de unos meses pensará que se olvidó de renombrar y lo "arreglará", rompiendo el login de la nube o la narración del nivel.

**Cómo aplicarlo:** al tocar algo que contenga "emerita", comprobar primero si está en esta lista antes de cambiarlo. Y las claves viejas de `localStorage` no se borran nunca: son el paracaídas de la migración. Ver [Lanzador `extremadura`](lanzador-emerita.md).
