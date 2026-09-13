# La ficha de itch.io

Todo lo de este documento es **para pegar a mano** en
[itch.io/game/edit/…](https://sergiosanchezcustodio.itch.io/extremadura-survivors),
y no por pereza: itch.io **no tiene API de escritura** para la ficha de un
juego. Se puede subir la build —eso lo hace `herramientas/publicar-itch.ps1` con
butler— pero el título, la descripción, los tags, la portada y el tamaño del
embed solo se tocan por el formulario web. Además, la clave que butler deja
guardada está limitada a subir builds: pedirle `/profile` responde
`api key does not permit`.

---

## Ajustes

| Campo | Valor |
|---|---|
| **Kind of project** | HTML |
| **Embed** | 960 × 540, *Click to launch in fullscreen* activado |
| **Mobile friendly** | no |
| **Genre** | Action |
| **Release status** | Released |
| **Pricing** | Free / No payments |

El embed a **960 × 540** y no a otro número: el juego calcula en 480 × 270 y se
amplía por múltiplos ENTEROS. Cualquier tamaño que no sea múltiplo de 480 × 270
deja bandas o obliga al navegador a escalar por un factor roto, y eso emborrona
el pixel art — que es justo lo que el juego evita por todas partes. 960 × 540 es
el ×2; 1440 × 810 el ×3.

---

## Portada

`docs/itch/portada.jpg` — 630 × 500, que es lo que pide itch. Sale de recortar
la ilustración del menú por el centro, así que lleva el logo y las dos
antorchas.

## Capturas

De `docs/capturas/`, en este orden, que va de lo que engancha a lo que explica:

1. `gameplay_un_jugador.jpg` — la horda encima
2. `gameplay_multiplayer_coop.jpg` — los cuatro a la vez
3. `main_menu.jpg` — la portada en movimiento
4. `tienda_potenciadores.jpg` — lo que sobrevive a la muerte
5. `ficha_jugador.jpg` — los números

---

## Descripción

> Un survivors-like en la Extremadura romana.
>
> Aguanta treinta minutos entre las ruinas de Emerita Augusta mientras la horda
> crece. Te mueves; las armas disparan solas. Cada gema te acerca al siguiente
> nivel, y cada nivel son tres armas u objetos entre los que elegir. Al minuto
> 16 hay cientos de cuerpos en pantalla a la vez.
>
> Tres jefes por el camino, y al final la Loba Capitolina.
>
> **Cooperativo local, hasta cuatro.** En la misma pantalla, cada uno con su
> panel en una esquina. Quien cae deja un ataúd y un contador, y cualquiera
> puede ir a levantarlo. Cada mando que se enchufa suma un jugador con la
> partida en marcha.
>
> **57 armas**, con evoluciones que piden un arma al máximo más su pasivo y un
> cofre de élite. La ambientación va mezclada a propósito: honda balear junto a
> subfusil. Mérida es una ciudad romana en la que vive gente hoy.
>
> **Ocho mascotas** que suben de nivel contigo, y una tienda donde los denarios
> sobreviven a la muerte: una mala partida no es una partida perdida.
>
> ---
>
> **Controles**
>
> Mando recomendado, teclado igual de jugable.
>
> - Moverte: `WASD` / flechas, o el stick
> - Ficha del personaje: `Tab` / `Select`
> - Pausa: `Esc` / `Start`
>
> Las armas disparan solas: no hay botón de ataque.
>
> ---
>
> **Cómo está hecho**
>
> HTML5 Canvas 2D y módulos ES6 nativos. Cero dependencias, ningún paso de
> build, ni una línea de framework. 480 × 270 con escalado entero.
>
> Código abierto bajo GPL-3.0:
> [github.com/sergiosanchezcustodio/extremadura-survivors](https://github.com/sergiosanchezcustodio/extremadura-survivors)
>
> Creado con ayuda de inteligencia artificial.

---

## Tags

Diez como mucho, que es el tope de itch:

```
survivors-like, bullet-hell, roguelite, pixel-art, local-multiplayer,
co-op, arena, singleplayer, open-source, roman
```

`survivors-like` y `bullet-hell` son los dos por los que se busca este género en
itch. `open-source` no es decorativo: filtra a quien viene a mirar el código, que
en un juego sin dependencias ni build es parte de lo que se enseña.
