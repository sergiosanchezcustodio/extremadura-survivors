# Escenario nivel 2: paredes y estanterías por tienda

> Nivel 2 — paredes, estanterías y suelos de Sergio (22/09/2026); todo a escuadra; un pasillo por anillo y un suelo por tienda
>
> Tipo: decisión del proyecto.

A 21/09/2026 el CC The Lighthouse lleva las PAREDES y ESTANTERÍAS de Sergio
(`resources/stages/2/pared_tipoN.png`, `estanteria_<tienda>N.png`), horneadas
a 64x224 por `herramientas/paneles-lighthouse.ps1` y asignadas por tienda en
`paredesMapa` / `escaparatesMapa` / `estanteriasMapa` de lighthouse.js. Hay
OCHO tipos de tienda (a supermercado, g regalos, t tecnologia, u alimentos, q
drogueria, j juguetes, r ropa, l libros = los ocho juegos de estanterias), cada
local de uno solo y con uno de los ocho ventanales; pared interior, escaparate y
estanterías distintos por tipo y sin repetir panel entre tipos. Mueblería y
ocio ya no se generan (siguen en la leyenda por si un mapa viejo los trae).

Reglas que pidió Sergio y que NO se negocian:
- Celda de 4 (tabique de 4 unidades, "50% más estrecho"), caras de 14 celdas = 56 u.
- Ni paredes en diagonal, ni oblicuas, ni curvas: anillos cuadrados
  (distancia de tablero) y túneles en L. El generador da 0 esquinas diagonales.
- Tiendas rectangulares, todas con el mismo trazado: paredes norte y sur forradas de
  estantería (≥50% de la pared) y filas interiores SOLO horizontales; nada en
  paredes verticales; sin mostradores ni islas de muro. 60% cerradas: techo `T`.
- La cara de un muro ES PARED y nadie puede estar dentro, ni llegando por
  arriba ni por abajo: `pie` la marca sólida y `colisionar` no tiene
  excepciones. El "hundirse" de los días 21 y 22/09/2026 se quitó entero; ver
  [La cara de un muro es pared](perspectiva-la-cara-es-pared.md). Invariante a
  comprobar con `npm run probar-nivel2`: el mapa alcanzable con los cierres
  puestos no crece.
- La tapa de un muro lleva el panel de su tienda (girado 90 en
  los verticales), no un techo gris; las tiendas cerradas, tablas y no cristalera.
- Escaparates = ventanales de cristal (pared_tiendaN.png) al 25% de opacidad,
  un color fijo por tipo de tienda (juguetes = rosa); a traves del cristal se ve
  el interior de la tienda, no el pasillo; ninguna estanteria pegada a una
  pared que de al pasillo.
- Una tienda no mezcla tipos de pared; las estanterías van solo dentro de las
  tiendas, nunca en los pasillos del centro; siempre tumbadas, en lineales con
  pasillos entre ellos en TODAS las tiendas; sin islas de muro dentro (ocio).
- Máquinas expendedoras pegadas del todo a la pared (no a estanterías), sin
  voltearse ni botar: los `esObjeto` se dibujan quietos.
- Suelos (22/09/2026): suelo1/2/3 son los pasillos de los anillos 0/1/2 (símbolos
  `.` `,` `;`), nunca en tiendas; suelo6..15 se reparten entre tiendas, uno por
  tienda (`suelosTiendas`, reparto en el motor por trozo conexo).

**Por qué:** son decisiones de arte y de trazado que condicionan cualquier retoque
del generador o del nivel.
**Cómo aplicarlo:** al tocar mapa-lighthouse.js, volver a contar esquinas
diagonales; al cambiar la pared de una tienda, es un número en lighthouse.js,
no código. Relacionado: [Niveles de rejilla y Tiled](niveles-de-rejilla-tiled.md).
