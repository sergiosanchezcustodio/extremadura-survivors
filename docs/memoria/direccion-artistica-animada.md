# Dirección artística: todo animado

> El proyecto va hacia pixel art animado en todo; cambiar arte no toca el motor pero sí mueve las colisiones y el balance
>
> Tipo: decisión del proyecto.

Sergio decidió el 2026-08-03 que **todo lleve animación**, personajes y enemigos. Los enemigos se irán sustituyendo por pixel art nativo animado (empezando por la gárgola, un GIF de 48x48 ampliado 8x); los cuatro personajes usan tiras generadas offline desde su única pose por `AnimarPersonaje` en `herramientas/procesar-assets.ps1`.

**Por qué:** las ilustraciones grandes reducidas 20x quedan blandas al lado del pixel art nativo, y se notaba que eran de familias distintas. Además los personajes son propios (Eric lleva la camiseta del Atleti), así que ningún pack los cubre: o se animan a mano en Aseprite, o se hornean desde la pose estática.

**Cómo aplicarlo:** sustituir arte es trabajo de datos —archivo en `resources/`, línea en el catálogo, ejecutar el script— y no toca JavaScript. Pero **sí mueve el balance**: `radioCuerpo` se deriva del ancho del sprite, así que un sprite más estrecho hace que la horda se empaquete más densa y sube el coste por frame (con la gárgola pasó de 3,47 a 5,35 ms). Por eso el grueso de los cambios de arte debe estar hecho **antes de la Fase 8**, que es la de perfilado y ajuste.

El 23/09/2026 se añadieron las doce ilustraciones de enemigos de CC The
Lighthouse. `procesar-assets.ps1` conserva cada PNG original, hornea una tira de
diez fotogramas desde su pose (`andarCadera`) y publica la hoja en el atlas.
Después se registraron en `datos/enemigos.js` y se distribuyeron en las oleadas
del nivel 2. Su vida, velocidad y daño de contacto son provisionales; no tienen
ataques a distancia todavía. Revisar los ciclos en
`herramientas/ver-animaciones-enemigos-nivel2.html`.
