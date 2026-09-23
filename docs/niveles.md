# Los siete niveles

Sergio cerró en septiembre de 2026 el recorrido completo del juego: **siete
sitios, en este orden**. De ellos hay uno escrito y jugable —Emerita— y seis por
escribir. Este archivo es el registro de qué es cada uno, para que escribirlos
sea rellenar datos y no volver a inventarlos.

Lo que aquí se dice **no está implementado** salvo donde se indique. Un nivel
existe cuando tiene su archivo en `js/datos/niveles/` y su `import` en
`indice.js`; hasta entonces solo es un nombre apagado en la pantalla de elegir
sitio (ver `PROXIMOS` en ese mismo archivo).

---

## El recorrido

| # | Sitio | De qué va | Jefe final |
|---|---|---|---|
| 1 | **Emerita** | Las ruinas del Imperio, de noche | La Loba Capitolina |
| 2 | **CC The Lighthouse** | Atrapados en el centro comercial, buscando una salida | — |
| 3 | **Monfragüe** | Animales poseídos | **El Jancano** |
| 4 | **Necrópolis** | Zombis a mogollón, saliendo de criptas y tumbas | — |
| 5 | **Casas del Turuñuelo** | Espíritus de guerreros tartésicos sin descanso | — |
| 6 | **Granadilla** | Villa medieval amurallada y rodeada de agua | **El Gran Maestre "FFF"** |
| 7 | **Las Hurdes** | Espíritus, duendes malignos y luces populares | **El Macho Cabrío / El Brujo del Monte** |

---

## Nivel 1 — Emerita

**El único escrito.** Está en `js/datos/niveles/merida.js`: treinta minutos, un
jefe cada diez —Cerbero, la Hidra y la Loba Capitolina— y su historia contada en
la placa de piedra.

Conserva el id `merida` a propósito, y con él la voz del narrador
(`assets/voz/merida.mp3`) y el desbloqueo. Ver la nota del cambio de nombre: hay
cosas que se dejaron con el nombre viejo porque renombrarlas rompe cosas y no
arregla ninguna.

## Nivel 2 — CC The Lighthouse

Atrapados dentro del centro comercial, hay que **encontrar una salida**. Es el
único de los siete que no es un sitio abierto, y el único cuyo planteamiento no
es solo aguantar: hay un objetivo.

> **Pendiente de Sergio:** la frase que lo describe se quedó a medias —"antes de
> que la…"—. Falta saber **antes de qué**: qué es lo que corre en contra, y si
> eso cambia la regla de la partida (un tiempo límite en vez de los treinta
> minutos de aguante) o es solo ambientación. También falta jefe final.

Los doce enemigos ya están registrados en el bestiario y aparecen en la curva
del nivel 2. Sus valores de vida, velocidad y daño de contacto son provisionales;
siguen pendientes de decidir sus ataques propios y los jefes del centro
comercial.

## Nivel 3 — Monfragüe

**Animales poseídos.** El parque como escenario, con la fauna vuelta en contra:
es el nivel donde los enemigos no son humanos ni muertos, sino bichos.

Jefe final: **El Jancano**, el gigante de un solo ojo del folclore extremeño.

## Nivel 4 — Necrópolis

**Zombis a mogollón**, y la gracia está en de dónde salen: criptas, tumbas,
nichos. El escenario mismo es el generador —las bocas de spawn son parte del
decorado, no un borde de pantalla—, que es lo que lo distingue de los demás.

> **Pendiente:** jefe final.

## Nivel 5 — Casas del Turuñuelo

Los **espíritus de los guerreros tartésicos** que no descansaron en paz **por no
haber defendido con honor a su pueblo**. Esa vergüenza es el motivo de que sigan
ahí, y es lo que da tono al sitio.

> **Pendiente:** jefe final.

## Nivel 6 — Granadilla

La villa medieval **amurallada y rodeada de agua por todos lados**. Su gente
tuvo que huir cuando la atacaron **templarios malditos y adoradores de la
oscuridad**: monjes, curas y monjas entregados al mal.

Jefe final: el **Gran Maestre templario "FFF"**, por sus siglas — *Führer Franz
Frank*.

> **Nota práctica, no una objeción:** el título alemán en el nombre del jefe se
> lee como una referencia deliberada, y las tiendas —itch y sobre todo Steam—
> tienen revisión automática para eso. No impide publicar, pero conviene que la
> ficha del juego deje claro que es el villano, no el reclamo. La decisión es de
> Sergio y el nombre queda como lo pidió.

Del encierro por agua sale lo mejor del sitio: **un mapa sin salidas**. Es el
opuesto exacto del nivel 2, donde lo que se busca es precisamente la salida.

## Nivel 7 — Las Hurdes

**Espíritus, duendes malignos y luces populares** que atacan a quien se adentra
donde no debe. El último sitio, y el más folclórico de los siete.

Jefe final: **El Macho Cabrío**, también llamado **El Brujo del Monte**.

---

## Lo que hace falta antes de escribir cualquiera de los seis

Ninguno se puede escribir solo con esto. Falta, por cada uno:

- **Duración y curva de oleadas**, o la decisión de copiar la de Emerita.
- **Paleta y tema de interfaz** — los dos bloques de color que lleva todo nivel.
- **El suelo pintado**, que es arte de Sergio y lo único que pesa de un nivel.
- **La historia**, en renglones partidos a mano como los de Emerita: el corte de
  cada línea es parte del ritmo al que se lee.
- **Los jefes que faltan** (niveles 2, 4 y 5) y los enemigos propios de cada
  sitio.
- **`requiere`**, si se quiere que uno abra a otro. Hoy solo Emerita está
  abierta de entrada.

El cómo está en [anadir-un-nivel.md](anadir-un-nivel.md), que es el contrato:
si para meter un nivel hay que tocar algo fuera de `js/datos/niveles/`, el
diseño está mal.
