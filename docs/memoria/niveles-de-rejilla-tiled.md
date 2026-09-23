# Niveles de rejilla y Tiled

> Desde el 19/09/2026 hay dos clases de nivel (calzada y recinto); los recintos se dibujan en Tiled y The Lighthouse es el primero
>
> Tipo: decisión del proyecto.

A 19/09/2026 el motor admite DOS clases de nivel, y las distingue el campo
`mapa` del archivo de datos: sin él es una CALZADA (Mérida, mundo infinito hacia
el norte) y con él un RECINTO cerrado con paredes de rejilla
(`js/sistemas/rejillaMapa.js`). El CC The Lighthouse es el primer recinto y está
en estado de PROTOTIPO: geometría real, colores planos, oleadas sin ajustar.

Los mapas de recinto se dibujan en **Tiled** (mapeditor.org), que NO es una
dependencia del juego: `herramientas/mapa-lighthouse.js` va en los dos sentidos
—`generar` traza el mapa y escribe el `.tmj`, `importar` lee lo que Sergio haya
retocado con el ratón y reescribe `datos/niveles/<nivel>-mapa.js`—. Sergio puede
editar el mapa sin pasar por el código.

Decisiones tomadas para no volver a discutirlas:
- Se gana **venciendo al jefe final**, que entra reventando la fachada. Las
  cuatro salidas son señalización, no casilla de meta. Eso evitó inventar reglas
  de victoria nuevas. (Lo de reventar la pared está pendiente.)
- Mapa **enorme, una sola planta**: 112x72 celdas ≈ 64 pantallas. Se le advirtió
  del riesgo de pasillos vacíos y lo eligió igual.
- Todo colisiona con las paredes, **también lo que vuela**: un centro comercial
  tiene techo, y si una arpía atraviesa la fachada se rompe la única regla que el
  jugador puede leer del mapa. Distinguir estantería de muro pide un símbolo más
  en la leyenda y es trabajo de cuando haya arte.

**Por qué:** son decisiones de diseño que no están en el código y que condicionan
todo lo que se haga con los niveles 3 a 7.
**Cómo aplicarlo:** antes de tocar un nivel nuevo, leer `docs/anadir-un-nivel.md`
(sección "Dos clases de nivel") y decidir primero si es calzada o recinto. Ver
también [Lista de armas y objetos, terminada](lista-armas-objetos-en-curso.md) y [Jefe final: la loba capitolina](jefe-final-loba-capitolina.md).
