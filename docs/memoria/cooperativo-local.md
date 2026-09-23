# Cooperativo local

> El juego es cooperativo local de hasta 4; la cámara usa correa y eso condiciona el diseño de niveles
>
> Tipo: decisión del proyecto.

El juego es **cooperativo local de hasta 4 jugadores**, cada uno con su mando. Decidido el 2026-08-03 y construido antes de la Fase 4, no después.

**Por qué:** la progresión (XP, niveles, armas equipadas) se construye encima del jugador. Hacerla para uno y multiplicarla por cuatro después habría obligado a rehacerla entera. Hacer el motor agnóstico al número de jugadores antes salía mucho más barato.

**Cómo aplicarlo:**
- **Cámara con correa**, elegida sobre alejar el zoom y sobre la pantalla partida. El juego corre a 480x270 con escalado ENTERO: alejar rompería la rejilla de píxeles y partir en cuatro daría viewports de 240x135. La cámara sigue al centro del grupo y nadie puede pasar del borde (`Camara.sujetar`, margen 22).
- **Consecuencia de diseño**: el grupo no puede separarse más de una pantalla. Cualquier nivel, patrón de oleada o jefe futuro tiene que asumirlo.
- Reparto de entrada: **teclado siempre al jugador 1; el mando k al jugador k**. No hay pantalla de asignación hasta los menús de la Fase 7.
- Los enemigos persiguen al **jugador más cercano** (`masCercano` en `entidades/enemigo.js`), y el mismo criterio lo usa el tope de acercamiento de colisiones: si usaran objetivos distintos, un enemigo perseguiría a uno y mordería a otro.
- Solo se pierde cuando caen **todos**.
- Un jugador entra al enchufar un mando, o a mano con **J** (y sale con **H**) para poder probar sin cuatro mandos.

Relacionado: [Visión de armas](vision-de-armas.md).
