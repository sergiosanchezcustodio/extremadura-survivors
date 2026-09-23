# Lockstep y determinismo

> El cooperativo online por lockstep está funcionando hasta cuatro jugadores; el estado y lo que queda vive en docs/cooperativo-online.md.
>
> Tipo: decisión del proyecto.

El cooperativo online (ver [Cooperativo local](cooperativo-local.md)) va por **lockstep**: solo
viajan las pulsaciones y cada máquina simula la partida entera.

A 27 de agosto de 2026 **funciona hasta cuatro jugadores**, en estrella: cada
invitado habla solo con el anfitrión y él reenvía. Malla no, porque la
señalización es a mano y cuatro en malla serían seis intercambios de código.

**La señalización no tiene servidor y no lo va a tener** — los jugadores se
pasan un código. Pero los **servidores STUN sí se usan** (decidido el 26 de
agosto de 2026): la restricción de "nada externo" era sobre la señalización, y
sin STUN solo se puede jugar dentro de la misma casa. No confundirlas ni volver
a apagarlos creyendo que se respeta una restricción.

**Por qué:** el lockstep exige que dos máquinas produzcan la misma partida bit a
bit; todo el trabajo de `mate.js`, los reinicios de estado y las firmas existe
para eso.

**Cómo aplicarlo:** leer `docs/cooperativo-online.md` antes de retomar — tiene el
estado, las pruebas y las trampas ya pagadas, incluidas las seis
"desincronizaciones" que no lo eran. La regla que más se ha repetido: **todo lo
que para el mundo y es entrada del jugador tiene que ir por el canal fiable**,
porque mientras el mundo está parado el búfer de pulsaciones no fluye.

Sigue **sin probarse entre dos casas de verdad**: `EMERITA.red.camino()` tiene
que decir `publica` y hasta hoy solo ha dicho `local`.
