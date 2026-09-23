# Memoria del proyecto

Las decisiones que **no se leen en el código**: qué pidió Sergio, qué se probó y
se quitó, qué costó caro aprender. Hasta el 23/09/2026 vivían en la memoria
privada de Claude Code (`~/.claude/projects/.../memory/`), fuera del
repositorio, así que ningún otro agente —ni otra máquina— las veía. Ahora viven
aquí y **esta carpeta es la fuente de verdad**, la use Claude, Codex o una
persona.

Cada fichero es un solo hecho, con **por qué** y **cómo aplicarlo**. Antes de
proponer algo que parezca obvio sobre uno de estos temas, leer su fichero: casi
todo lo "obvio" ya se discutió.

**Mantenerla.** Si Sergio corrige una forma de trabajar o se toma una decisión
que no queda escrita en el código, se añade un fichero aquí y una línea en esta
lista. Si un fichero se queda viejo, se corrige o se borra: una memoria que
miente es peor que ninguna. Las fechas, siempre absolutas (22/09/2026, no
"ayer").

## Forma de trabajar (lo que Sergio pidió)

- [Dejar el servidor levantado](dejar-el-servidor-levantado.md) — al terminar una tarea, http://localhost:8000/ tiene que responder; Sergio va directo a probarlo.
- [Probar con teclas en el navegador](probar-en-navegador-con-teclas.md) — mover al jugador a dedo pisa `yPrev` y las pruebas mienten.
- [Dificultad: vida y densidad, no velocidad](dificultad-vida-no-velocidad.md) — los básicos deben ir lentos; los "especiales" llevan la velocidad de su versión normal.
- [La cara de un muro es pared](perspectiva-la-cara-es-pared.md) — nadie puede estar dentro de un muro; el "hundirse" se quitó el 22/09/2026 y por qué.
- [Coste: manda el contexto acumulado](coste-por-contexto-acumulado.md) — el 95% del gasto de un agente es releer contexto, y quien lo infla son las imágenes.

## Decisiones de diseño

- [Cooperativo local](cooperativo-local.md) — hasta 4 jugadores con cámara de correa; condiciona el diseño de todos los niveles.
- [Lockstep y determinismo](lockstep-determinismo.md) — el online va por lockstep; determinismo probado entre navegadores; estado en `docs/cooperativo-online.md`.
- [Visión de armas](vision-de-armas.md) — ambientación mezclada, 3 opciones al subir nivel, armas únicas por jugador.
- [Lista de armas y objetos, terminada](lista-armas-objetos-en-curso.md) — lo que es cada cosa vive en `docs/armas-y-objetos.md`; leerlo antes de tocar armas u objetos.
- [Jefe final: la loba capitolina](jefe-final-loba-capitolina.md) — cierra el nivel 1; la hidra quedó de jefe intermedio.
- [Niveles de rejilla y Tiled](niveles-de-rejilla-tiled.md) — calzadas y recintos; los recintos se dibujan en Tiled y The Lighthouse es el primero.
- [Escenario nivel 2: paredes y estanterías por tienda](escenario-nivel2-texturas.md) — arte de Sergio por tipo de tienda, suelos por anillo y por tienda, todo a escuadra.
- [Interfaz en capa nítida](interfaz-capa-nitida.md) — la UI sale del lienzo del juego; textos nunca pixelados, panel sin marco ni fondo.

## Arte y rendimiento

- [Dirección artística: todo animado](direccion-artistica-animada.md) — pixel art animado en todo; cambiar arte no toca el motor pero sí mueve las colisiones.
- [Animación de personaje](hojas-de-personaje.md) — la dibuja Sergio; GIF de 16 fotogramas; las hojas 4x3 quedaron obsoletas.
- [Arte pendiente: ninguno](arte-pendiente-ataudes.md) — ataúdes y muertes de los ocho ya son de Sergio; ataúdes sin `dominante`.
- [Rendimiento: el escalado era el cuello](rendimiento-blits-1a1.md) — los blits a 1:1; escalar sprites por frame hundía los fps.

## Historia y referencia

- [Cambio de nombre a Extremadura Survivors](cambio-de-nombre-extremadura.md) — qué se renombró el 13/09/2026 y qué se dejó con "emerita" A PROPÓSITO.
- [Lanzador `extremadura`](lanzador-emerita.md) — hace cd al repo y abre sesión nueva (Claude o Codex); `-c` retoma la anterior.
