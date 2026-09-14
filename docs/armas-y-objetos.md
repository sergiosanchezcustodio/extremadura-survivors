# La lista de armas y objetos: terminada

Sergio pasó en septiembre de 2026 una lista de cinco armas, cinco objetos de
tienda y veintiún objetos de gameplay. **Está toda dentro.** Este archivo se
queda como registro de qué es cada cosa y de las decisiones que se tomaron por
el camino, para no volver a discutirlas.

---

## Las cinco armas

| Arma | Qué la hace ella |
|---|---|
| **Petanca** | Única que apunta adonde MIRAS (`patron: 'rumbo'`). 1→10 bolas, abanico 0→120°, se gastan cada 3→8 enemigos |
| **Cartas de la baraja** | Familia de la Metralla. 3→22 cartas, una imagen distinta por carta sobre las diez de la lámina |
| **Cayado de San Isidro** | `bombardeoAleatorio` con el reparto encogido a un círculo alrededor del jugador |
| **Campana del Silencio** | **La única que no hace daño.** Cono que paraliza 1,5 s al 10; al paralizado se le atraviesa sin recibir |
| **Hula Hoop** (id `arosRitmica`) | Hermana de las RainbowMazas, pero **vuelven como bumerán**: pasan dos veces por el mismo sitio |

## Los veintiún objetos de gameplay

**De una línea de datos** (un campo del jugador que alguien lee en un sitio):
Campana Milagrosa, Ala de Mercurio, Amuleto de azogue, Asta del Escornao,
Lagarto de Calzadilla, Becerro de Oro y Musa.

**Que enganchan en un golpe:** Sanguijuelas del Guadiana, Capa del erizo, Cruz
del Gigante, Pira funeraria y Lágrima de la Mora.

**Que van por reloj:** Virgen Negra, Bálsamo de Fierabrás, Cencerros de San
Antón y Diadema de Aliseda.

**Solo en cooperativo** (`soloCooperativo`, no entran en el sorteo jugando
solo): Sello Templario, Corona de Espinas, El Grial de
Alconétar y La Llave del Perdón.

**Y el Libro de las Sombras de Alburquerque.**

## Los cinco de la tienda

Capa del Peregrino, Bellota de oro, Último aliento, Zurrón y Bandolera. Cuatro
de un solo nivel: son cosas que tienes o no tienes.

---

## Lo único que quedó fuera, y a propósito

**El poseído del Libro no hace daño al rozar a los suyos.** Se pasa a tu bando,
deja de perseguirte, camina hacia el enemigo más cercano con su aura verde y
revienta a los cinco segundos llevándose lo que tenga al lado.

El roce se dejó fuera porque **no existe daño de enemigo contra enemigo en
ninguna parte del motor**: un enemigo solo sabe perseguir a un jugador. Darle
ese camino por cinco segundos costaba más que todo lo demás del objeto junto, y
lo que de verdad mata es la explosión, que sí existía.

Si algún día se quiere, **se añade encima de esto sin tocar nada de lo que hay**:
el estado `poseido` ya está en el enemigo y el bucle que lo mueve ya es suyo.

---

## Arte pendiente

**Solo los ataúdes de Helen, Julie, Say y Sofi.** No existen; el juego aguanta
sin ellos (`dibujar` en `entidades/jugador.js` sigue pintando el reloj de la
reanimación), pero en cooperativo el ataúd es lo que dice a quién hay que ir a
levantar. Cuando estén, son cuatro filas más en la tabla de ATAUDES de
`herramientas/procesar-assets.ps1`, con el nombre `<Nombre>_ataud.png` en
`resources/characters/`.

Todo lo demás que fue provisional —los tres iconos de arma (Petanca, Cayado,
Campana), los veintiún iconos de pasivos y los cinco potenciadores de tienda
nuevos— **ya lo dibujó Sergio y está horneado** (septiembre de 2026). Los
pasivos entran uno por archivo en `resources/objetos/pasivos/<id>.png`, así que
añadir el número treinta sigue siendo dejar un PNG ahí con el nombre del id.

---

## Decisiones tomadas (no volver a preguntarlas)

- La **Bellota de oro** solo afecta a armas de proyectil, y un arma puede decir
  que no con `sinBellota`: hoy solo la Petanca, porque lo que la hace ella es el
  abanico y una bola de regalo desdibuja esa cuenta.
- La **Petanca** se gasta cada X enemigos — no atraviesa sin límite, aunque la
  petición original lo pedía: diez bolas en 120° sin gastarse dejaban el mapa
  limpio de un disparo.
- Los **Aros** vuelven como bumerán, que es lo que los separa de las Mazas.
- La **Campana** no hace daño, y paraliza 1,5 s al nivel 10 (se triplicó tras
  jugarla: medio segundo se pasaba antes de decidir por dónde salir).
- **Capa, Zurrón, Bandolera y Último aliento**: un solo nivel.
- Que haya veintiocho pasivos para cuatro ranuras **está aceptado**: hace las
  partidas muy distintas entre sí.
- El **Lagarto** quita su porcentaje ANTES que la armadura (es la piel, no la
  coraza) y el **Becerro** es del que REMATA, no del equipo.
- La **Capa del Peregrino** se come el golpe entero y regala los i-frames: sin ellos, parar
  un mordisco en medio de la horda te deja expuesto al siguiente en el mismo
  fotograma.
- Las **ranuras son del jugador**, no del juego: en cooperativo cada uno lleva
  su progreso comprado, así que en la misma partida puede haber quien tenga
  cuatro armas y quien tenga cinco.

---

## El Osito Dinamito (arma de Helen)

Un juguete con la mecha encendida que sale corriendo de entre tus pies,
culebrea, busca al enemigo más cercano y revienta encima. Sustituye al Arco como
arma inicial de Helen.

Lo que lo separa de una granada teledirigida es el **tope de giro**: no va
derecho a por nadie, corrige `persigue` radianes por segundo, y a un blanco que
se cruza de lado se le pasa de largo y tiene que volver. Eso es lo que hace que
se lea como algo que corre detrás de alguien.

Al subir de nivel sube **todo**: un osito más por nivel (de uno a diez), más
daño, más área y algo más de carrera. Por eso el daño de cada uno sube despacio:
con diez a la vez, lo que multiplica de verdad es la cantidad.

**No pasa por encima de un jugador: lo rodea, y sin tocarlo.** Un juguete con
patas cruzando un cuerpo se lee como que el dibujo está mal pegado, y en
cooperativo, con cuatro cuerpos en dos palmos, pasaría todo el rato.

Se mide contra la **silueta dibujada, no contra el círculo de colisión**. Ese
círculo tiene radio 8 y está a los PIES —ahí es donde le pegan al jugador—, pero
un personaje mide 26 de alto por unos 15 de ancho: con un círculo, el osito
cruzaba el pecho por encima sin entrar en nada. La zona que no se pisa es un
óvalo del tamaño del dibujo, centrado a media altura y con dos unidades de aire
para que las siluetas no lleguen a compartir un píxel. Vale para **todos los
jugadores, incluida Helen**, que es quien lo dispara.

Son tres piezas y hacen falta las tres: una corrección angular que crece según
se acerca —eso dibuja la curva—, un empujón de posición después de mover, que es
el "nunca" (la curva puede fallar a bocajarro; el empujón no), y el nacimiento
ya fuera de la silueta de quien lo suelta, porque el primer fotograma es
anterior a su primer paso.

**Y se mueve como se mueve todo el mundo.** Los obstáculos del escenario son
sólidos para él (`colisionarObstaculosProyectiles`, en `js/sistemas/colisiones.js`):
no atraviesa columnas, estatuas ni ruinas, y al chocar pierde la componente de
velocidad contra la pared y conserva la tangente, o sea que resbala por el canto
en vez de encallar. Es lo mismo que le pasa a un jugador contra una columna,
solo que a él lo sigue empujando su mando. Vale solo para los proyectiles que
persiguen: los otros cincuenta y nueve siguen volando por encima, que es lo
correcto para una flecha.

**Y sale corriendo de verdad**, que costó tres reglas:

- **Medio segundo de carrerilla** en línea recta antes de buscar a nadie. Sin
  ella, un osito lanzado a la derecha con un enemigo a la izquierda daba media
  vuelta en el sitio y cruzaba por delante de quien lo soltó.
- **La burbuja de salida**: dentro de 46 unidades de su dueño, el rumbo tiene
  prohibido acercarse a él —se le permite salir o irse de lado, nunca volver—.
  El tope es de 80 grados y no de 90 porque a 90 la componente radial es cero y
  el osito orbitaría eternamente a la misma distancia. Hizo falta porque la
  horda persigue al jugador, así que el enemigo más cercano casi siempre está
  pegado a él: sin esto, una de cada cuatro muestras tenía un osito a menos de
  18 unidades de su dueño. Con esto, una de cada cincuenta.
- **Menos azar en la salida**: los ositos se reparten el círculo en partes
  iguales y salen por el centro de la suya, con un desvío máximo de un cuarto de
  sector. Antes el desvío era de un sector entero y dos podían salir pegados.

Decisiones de números, para no volver a discutirlas:

- **Velocidad 69**: un 20% menos de los 115 con que entró, y otro 25% después.
  Un osito que corre menos que la horda se ve llegar, y verlo llegar es medio
  chiste del arma. Baja la velocidad de SALIDA; los nueve escalones siguen dando
  6 cada uno, así que al 10 corre 123.
- **El daño subió dos veces**: un 25% a lo que trae de fábrica, y después un 50%
  a todo, base y escalones. La onda queda en **29 al nivel 1 y 83 al 10**, contra
  los 15 y 45 con que entró el arma. El golpe directo se queda siempre en torno a
  la sexta parte de la onda: lo que mata es reventar encima.
- **Lo que cada nivel SUMA al radio sube un 20%**: 14 puntos del 1 al 10 en vez
  de 12, o sea radio 31 al máximo. Sube lo que suma cada nivel, no la explosión
  en compuesto — un 20% por nivel serían 5,2 veces al llegar al 10, con el radio
  de 17 a 88: media pantalla por osito y diez ositos a la vez. Sube lo que suma cada nivel, no la explosión en
  compuesto — un 20% por nivel serían 5,2 veces al llegar al 10, con el radio de
  17 a 88: media pantalla por osito y diez ositos a la vez.

Lo que hizo falta en el motor, y sirve para cualquier arma futura:

- `persigue`, `zigzag` y `zigFrec` en el proyectil (`js/entidades/proyectil.js`).
  El culebreo se aplica al RUMBO, no a la posición: desviar el punto dejaría al
  bicho corriendo de lado. La fase es propia de cada osito, sorteada del rng de
  la partida, o los cuatro culebrearían como un solo cuerpo.
- `animFps`, para que un proyectil tenga ciclo propio —el osito corre— y
  `sinRotar`, para que se plante de pie y solo se espeje: rotarlo con el rumbo lo
  dejaría boca abajo yendo hacia la izquierda.
- `cazar(x, y, radio)`, que fija `js/main.js` por el mismo camino que
  `alEstallar`. Buscar al más cercano vive en `sistemas/colisiones.js`, que ya
  importa del archivo de proyectiles: importarlo al revés cerraría un ciclo de
  módulos por una sola llamada.

Y el sprite sale del GIF de 16 fotogramas por la misma rama del horneado que los
enemigos: un proyectil que corre necesita su ciclo de carrera igual que ellos.

## Armas apartadas, que no borradas

Sergio sacó siete del juego: **Lanzas gemelas, Artillería, Lluvia de agujas,
Pistola, Escopeta, Lanzagranadas y Honda balear**.

No se han borrado, y ahí está la gracia: llevan `retirada: true` en
`js/datos/armas.js` y lo único que mira esa bandera es el sorteo de subida de
nivel (`js/sistemas/progresion.js`). La entrada sigue entera —números, dibujo y
comportamiento—, así que **devolver un arma al juego es borrar esa línea**. Se
hizo así porque un arma arrancada hay que reescribirla, y con ella se van los
números que costaron tardes de ajuste.

Siguen saliendo en el ciclador de desarrollo (tecla **M**), que es justo donde
hacen falta: para volver a mirar una y decidir si vuelve.

## Nombres que cambiaron

Cambia el nombre VISIBLE; el identificador interno no se toca, porque de él
cuelgan el icono, el atlas y las partidas guardadas.

| Antes | Ahora | id (sin tocar) |
|---|---|---|
| Ballista | **Ballesta** | `ballista` |
| Lanzacohetes | **Bazooka** | `lanzacohetes` |
| Rayo de Júpiter | **Rayos de Júpiter** | `rayoHorizontal` |
| Arco corto | **Arco** | `arcoCorto` |
| Sello de los Caballeros de Magacela | **Sello Templario** | `selloMagacela` |
| Manto del Peregrino | **Capa del Peregrino** | `mantoPeregrino` |
