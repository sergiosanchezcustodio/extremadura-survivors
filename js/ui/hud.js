import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { ARMAS } from '../datos/armas.js';
import { Recursos } from '../core/recursos.js';
import { FUENTE, textoBorde } from './capa.js';
import { Tema } from './tema.js';
import { Director } from '../sistemas/director.js';

// Panel de información por jugador, siempre visible. Una esquina cada uno:
// P1 arriba izquierda, P2 arriba derecha, P3 abajo izquierda, P4 abajo derecha.
//
// La ficha va TEÑIDA con el color de su jugador: el nombre y el marco de las
// ocho ranuras. Con cuatro personas mirando la misma pantalla, saber cuál de las
// cuatro esquinas es la tuya tiene que costar cero: en cuanto hay que leer "P3"
// para averiguarlo, ya se ha perdido el instante que se estaba mirando.
//
// Se dibuja en la CAPA DE INTERFAZ (ver ui/capa.js), que va a resolución de
// pantalla. Las coordenadas siguen siendo las de 960x540, pero el texto se
// rasteriza a la resolución real del monitor.
//
// CAJA TRANSLÚCIDA, no opaca, y ese es el punto entero. La ficha vuelve a tener
// marco y fondo —dan cohesión y evitan que ocho elementos sueltos floten sobre
// la arena— pero se ve el juego a través de ella. Con la caja opaca, cuatro
// jugadores tapaban cuatro esquinas del anfiteatro, y en un juego donde lo que
// mata es quedar rodeado eso son cuatro sitios por los que te llegan sin verlos
// venir. Todos los rellenos van por debajo del 40% de alfa y los textos llevan
// además reborde oscuro, que es lo que les permite leerse sobre lo que sea que
// pase por debajo.
//
// LOS ICONOS YA SON DIBUJO DE VERDAD. Sergio ha entregado las dos hojas —52
// armas y 8 objetos, cada una en su hueco— y están en el atlas como
// `iconosArmas` e `iconosObjetos`. Pasó exactamente lo que decía este
// comentario cuando eran procedurales: metidos en el atlas, el resto del panel
// no se ha enterado.
//
// Los glifos vectoriales SE QUEDAN, y no por nostalgia. Son el repliegue si
// falta una hoja o si aparece un arma sin icono dibujado, y en ese caso siguen
// diciendo lo que decían: la forma agrupa por COMPORTAMIENTO —flecha para
// proyectil, anillo para orbital— así que un arma nueva sin arte se lee por su
// familia en vez de salir en blanco. Ver dibujarIconoArma.

// --- Medidas -----------------------------------------------------------------
//
// DOS BLOQUES separados por una línea vertical: a un lado la TARJETA DE
// IDENTIDAD (retrato, nombre y nivel), al otro el ESTADO (vida, experiencia y
// las ocho ranuras). Sigue el diseño de referencia que pasó Sergio.
//
// La separación no es decorativa: son dos cosas que se consultan en momentos
// distintos. Quién eres se mira una vez al empezar y luego solo de reojo para
// localizar tu esquina; cuánta vida te queda se mira cada pocos segundos. Con
// todo mezclado en una sola columna, el ojo tenía que recorrer la ficha entera
// para encontrar la barra.
//
// TRES columnas desde que la experiencia es VERTICAL: la barra de xp pegada al
// borde de casa, la tarjeta de identidad y el estado. La xp era una barra
// horizontal más, justo debajo de la vida, y las dos juntas se leían como una
// sola cosa de dos pisos —había que fijarse en el color para saber cuál era
// cuál—. De canto y separada, ya no se confunden: la que se mira en mitad de
// una horda es la de vida, y ahora está sola en su sitio.
//
// Lo pidió Sergio, y de paso deja la barra de vida más gruesa sin que la ficha
// crezca de alto.
// 180 y no 171: los NUEVE que gana la ficha van enteros a la columna de las
// ranuras, para que crezcan un 10% sin quedarse pegadas unas a otras. Robarle
// el ancho al hueco entre ranuras habría dejado el aire en 1, y cuatro
// cuadrados a 1 de distancia se leen como una tira, no como cuatro ranuras.
//
// Y DE 180 A 229 primero, y DE 229 A 201 después. El icono se queda en 13 —el
// tamaño único de todo el juego, ver ICONO_UNIFICADO— y lo que se mueve es el
// hueco que lo rodea.
//
// El 229 salía de pedirle a la ranura REDONDA de los objetos que NO cortara
// nunca el dibujo. Un icono se dibuja siempre encajado en un cuadrado de lado
// 2·r, y el dibujo LLEGA a las esquinas de ese cuadrado: medidas las dos hojas
// de 96, el píxel opaco más lejano del centro está a 64,4 en los objetos y a
// 66,5 en las armas, de una media diagonal de 67,9 —una espada se dibuja en
// diagonal y la ocupa entera—. O sea que a radio 13 el dibujo llega a
// 13·64,4/48 = 17,4 del centro, y para que el aro lo contuviera entero hacían
// falta 18,5 de radio: 37 de lado.
//
// A 201 la ranura baja a 30, que es la medida que pidió Sergio. Es una decisión
// distinta, no un cálculo: el aro ya no contiene el dibujo —15 de radio contra
// esos 17,4— y las puntas de un icono ancho asoman por las diagonales del
// medallón. A cambio el panel tapa 28 unidades menos de esquina, que en
// cooperativo a cuatro son cuatro esquinas, y las ranuras se leen como marco
// del icono y no como plato debajo.
//
// El icono NO se recorta contra el aro: si algún día molesta que asome, el
// arreglo es un clip en dibujarRanura, no encoger el dibujo —13 es el mismo
// número en las cinco pantallas y ahí está la gracia.
const ANCHO_BASE = 201;
const MARGEN = 9;              // separación al borde de la pantalla
const RELLENO_H = 5;           // margen interior horizontal
const RELLENO_V = 4;           // margen interior vertical

const ANCHO_XP = 5;            // la barra vertical de experiencia
const HUECO_XP = 4;            // aire entre esa barra y la tarjeta
const TARJETA_ANCHO = 42;      // bloque de identidad
const HUECO_SEP = 4;           // aire a cada lado de la línea separadora
// 111. Es lo único que se lleva el ensanche de la ficha: todo lo demás —la
// tarjeta de identidad, la barra de xp y los huecos— se queda con su medida.
const COLUMNA_BASE = ANCHO_BASE - RELLENO_H * 2 - ANCHO_XP - HUECO_XP
                     - TARJETA_ANCHO - HUECO_SEP * 2;
// Todo lo que la ficha mide FUERA de la columna de estado: los dos rellenos, la
// barra de xp, la tarjeta y los dos huecos del separador. Es constante, y es lo
// que permite hacer el camino al revés cuando hay ranuras de más —de columna a
// ancho— en vez de repetir la resta con otro número.
const RESTO_ANCHO = ANCHO_BASE - COLUMNA_BASE;

const HUECO_RANURA = 4;        // entre ranuras de la misma fila
const HUECO_FILA = 4;          // entre la fila de armas y la de pasivos

// TODAS las ranuras del jugador por fila, llenas o vacías, y reparten el ancho
// entero de SU columna. Las vacías no son decoración: el tope es MAX_ARMAS y
// MAX_PASIVOS —4, o 5 con Bandolera o Zurrón— así que el hueco vacío dice
// cuánto te queda por elegir, que es una decisión que se toma cada subida de
// nivel. Con las ranuras apareciendo según se llenan, la fila cambiaba de tamaño
// y no se sabía si cabía algo más.
//
// RANURAS es el CASO BASE, el de la ficha sin potenciadores de hueco: de él sale
// la medida de una ranura, y a partir de ahí es el panel el que crece. Ver
// columnaDe.
const RANURAS = 4;
// EL TAMAÑO DE UNA RANURA, UNO SOLO PARA TODO EL JUEGO, por el mismo motivo que
// ICONO_UNIFICADO: un hueco de arma no puede medir una cosa aquí y otra en la
// ficha de jugador. Se exporta porque ui/ficha.js dibuja los mismos medallones
// y hasta ahora los tenía a 41,25 —su propia medida, decidida aparte—, que es
// lo que hacía que el mismo arma se viera más grande al pulsar Tab.
//
// Sale de la ficha base y no al revés: aquí es donde el ancho del panel manda,
// y de ahí cae el lado de la ranura.
export const RANURA_UNIFICADA =
  (COLUMNA_BASE - (RANURAS - 1) * HUECO_RANURA) / RANURAS;
const RANURA_W = RANURA_UNIFICADA;

// LA FICHA CRECE A LO ANCHO, la ranura NUNCA se encoge.
//
// Bandolera y Zurrón suben `maxArmas` y `maxPasivos` de 4 a 5, y hasta aquí la
// ficha seguía dibujando cuatro huecos: el quinto arma que comprabas no salía
// en el panel, y el hueco vacío dejaba de decir cuánto te queda por elegir, que
// es justo para lo que están las ranuras vacías.
//
// De las dos salidas posibles —repartir el mismo ancho entre cinco, o ensanchar
// la ficha— se toma la segunda. Encoger la ranura rompería lo único que este
// archivo defiende en cinco sitios distintos: que un icono mide 13 en todas las
// pantallas y el hueco se hace a su medida (ver ICONO_UNIFICADO). Además la
// ficha cambiaría de aspecto a mitad de partida sin que nada lo haya pedido.
//
// Así que la ranura se queda en sus 30 y lo que se añade es un hueco más de
// ancho por cada ranura de más. Para n = 4 las dos fórmulas devuelven exactamente
// ANCHO_BASE y COLUMNA_BASE, así que la ficha de siempre no se mueve ni medio
// píxel: lo nuevo solo se nota cuando de verdad hay una ranura extra.
//
// LA BARRA DE VIDA VA POR LA MISMA COLUMNA, y por eso se ensancha con ella en
// vez de quedarse corta dejando un hueco muerto a su derecha. La barra siempre
// mide lo mismo que la fila de ranuras de debajo; ese es el único acuerdo que
// hace que la columna de estado se lea como un bloque.
//
// Las DOS FILAS COMPARTEN ANCHO, el de la más larga. Con la Bandolera comprada y
// el Zurrón no, la fila de objetos se queda en cuatro ranuras y deja su aire a
// la derecha: son filas de cosas distintas, y alinear la primera ranura de cada
// una importa más que llenar el renglón.
function columnaDe(ranuras) {
  return ranuras * RANURA_W + (ranuras - 1) * HUECO_RANURA;
}

// Cuántas ranuras pide este jugador. `|| RANURAS` para los sitios donde la ficha
// se dibuja sin partida detrás —galería, pruebas— y el jugador no trae tope.
function ranurasDe(j) {
  return Math.max(j.maxArmas || RANURAS, j.maxPasivos || RANURAS);
}
// RANURAS CUADRADAS. Eran 21,75 x 17,5 —achatadas— y eso tenía dos costes: el
// arma se dibujaba dentro de un rectángulo con más aire a los lados que arriba,
// y el pasivo, que se marca con esquinas redondas de radio ALTO/2, salía como
// una píldora y no como un círculo. Igualando alto y ancho, el arma queda en un
// cuadrado y el pasivo en un círculo de verdad, que es la pareja de formas con
// la que se distinguen las dos filas de un vistazo.
//
// El lado ha ido 17,5 -> 22,5 -> 24,75 -> 37 -> 30, y hoy son esos 30 que pidió
// Sergio (ver ANCHO_BASE, que es de donde salen: la columna reparte su ancho entre
// las cuatro y el aire entre ellas sigue siendo 4).
//
// EL DIBUJO DE DENTRO NO SE MUEVE CON ELLAS: lo que cambia es el marco, y el
// icono se queda en ICONO_UNIFICADO pase lo que pase con la ranura. Un icono no
// puede medir una cosa aquí y otra en la tienda; el hueco sí puede.
const RANURA_H = RANURA_W;

// EL TAMAÑO DE UN ICONO, UNO SOLO PARA TODO EL JUEGO.
//
// 13, que es el de la tienda y el de la pantalla de héroes. Lo eligió Sergio
// viéndolos los seis juntos en la galería de arte, y es la respuesta correcta a
// una pregunta que llevaba mal planteada desde el principio: cuánto mide un
// arma no puede depender de en qué ventana ha salido. Antes había cinco medidas
// distintas —9, 11,22, 13, 15,03 y 7— y cada una tenía su buena razón local;
// juntas hacían que el mismo dibujo pareciera cinco dibujos.
//
// LO IMPORTA TODO EL MUNDO desde aquí: ui/ficha.js, ui/menuNivel.js y
// ui/cofre.js. Este archivo es el sitio donde vive porque es el que ya exportaba
// las medidas de la ficha (ALTO_FICHA, MARGEN_FICHA) y del que los otros tres
// ya importaban; al revés habría hecho un ciclo.
//
// ESTÁ EN UNIDADES DE PANTALLA, a escala 1. Quien dibuje con el contexto
// escalado tiene que DIVIDIR por su escala o el icono le saldrá más grande que
// a los demás: es lo que hace ui/ficha.js con su 1,125.
//
// Y ya no hacen falta dos números para las dos formas. Las fracciones 0,82 y
// 0,66 respondían a "lo más grande que quepa en esta ranura"; ahora la ranura se
// hace a la medida del dibujo y no al revés.
export const ICONO_UNIFICADO = 13;

const ICONO_CUADRADO = ICONO_UNIFICADO;
const ICONO_REDONDO = ICONO_UNIFICADO;

// --- Alturas, medidas desde el borde superior de la ficha --------------------
//
// ALTO_VIDA baja de 12 a 8, un tercio menos. Llegó a 12 quedándose con el hueco
// que dejó la barra de xp al ponerse de canto, y era demasiado: una barra de
// vida no necesita ser gruesa para leerse —lo que se mira es su LARGO— y con 12
// competía en peso con las dos filas de ranuras, que es donde de verdad hay que
// mirar cuando se abre la ficha.
//
// Y_ARMAS sube con ella para que el aire entre la barra y la primera fila siga
// siendo el mismo 8,5 de siempre. Los cuatro que se ahorran no se quedan de
// hueco muerto: el alto total de la ficha apenas se mueve, porque lo que la
// barra suelta se lo llevan las ranuras al crecer un 10%.
const Y_VIDA = RELLENO_V, ALTO_VIDA = 8;
const Y_ARMAS = Y_VIDA + ALTO_VIDA + 8.5;
const Y_PASIVOS = Y_ARMAS + RANURA_H + HUECO_FILA;

// Alto total de la ficha, y su margen. Los exporta para que el menú de subida de
// nivel pueda colocarse por detrás sin repetir la aritmética: cuando la ficha
// cambiaba de tamaño, el menú se quedaba con el número viejo y se solapaban.
export const ALTO_FICHA = Y_PASIVOS + RANURA_H + RELLENO_V;
export const MARGEN_FICHA = MARGEN;

// Dentro de la tarjeta de identidad.
const TARJETA_ALTO = ALTO_FICHA - RELLENO_V * 2;
// 2 y no 3: el aire alrededor del retrato se recorta a la mitad para que la cara
// gane cuatro unidades de ancho. Con el marco de la tarjeta detrás, dos bastan
// para que no parezca pegado al borde.
const RETRATO_INSET = 2;
const RETRATO_ANCHO = TARJETA_ANCHO - RETRATO_INSET * 2;
// Nombre y nivel se miden DESDE ABAJO, no con dos números fijos. Con las
// ranuras cuadradas la ficha creció 10 de alto y unas coordenadas absolutas
// habrían dejado los dos textos flotando a media tarjeta con un palmo de vacío
// debajo. Anclados al pie mantienen su sitio de siempre —el nivel a 5 del
// borde interior, el nombre 9 por encima— crezca lo que crezca la ficha.
const Y_NIVEL = ALTO_FICHA - RELLENO_V - 5;
const Y_NOMBRE = Y_NIVEL - 9;
// El retrato se queda CUADRADO, del mismo lado que el ancho que le deja la
// tarjeta. Las caras del atlas son cuadradas (288x288) y dibujarCabeza encaja en
// modo "cubrir": estirar el hueco a lo alto para llenar la tarjeta más grande
// habría recortado un quinto de cabeza por cada lado. Lo que se hace con los 10
// que ha crecido la tarjeta es repartirlos como aire, centrando el retrato en el
// hueco que queda por encima del nombre.
// EL RETRATO LLENA SU HUECO, que hasta ahora no era el caso.
//
// Era CUADRADO, del mismo lado que el ancho de la tarjeta (36x36), y se
// centraba en el hueco disponible. Como el hueco mide 59 de alto, sobraban 23
// repartidos arriba y abajo: casi la mitad de la tarjeta era aire, con la cara
// flotando en medio. Lo vio Sergio.
//
// Ahora se estira a lo alto hasta comerse el hueco entero menos la banda de las
// resurrecciones. Puede hacerlo porque `dibujarCabeza` encaja en modo CUBRIR:
// escala por el lado que se quede corto y recorta el sobrante, así que un hueco
// más alto que ancho no deforma la cara, la encuadra más cerca. Es exactamente
// lo que se hizo con Helen en la ficha y en la tienda — verla hasta el pecho en
// vez de flotando dentro de un cuadrado.
//
// LA BANDA DE ABAJO SE RESERVA SIEMPRE, se tengan resurrecciones o no. Si el
// retrato creciera cuando no hay Moneda de Caronte y encogiera al comprarla, la
// ficha cambiaría de cara a mitad de partida por un objeto que no tiene nada que
// ver con el retrato.
// La banda de los corazones: su alto (9) más un poco de aire arriba y abajo.
// Se reserva SIEMPRE, se tengan vidas de más o no, porque los cinco corazones
// salen siempre; y así el retrato mide lo mismo en todas las fichas.
const ALTO_RESU = 13;
const ALTO_RETRATO = (Y_NOMBRE - 7.5) - RELLENO_V - ALTO_RESU;
const Y_RETRATO = RELLENO_V;
// Centro de la banda de resurrecciones, justo debajo del retrato.
const Y_RESU = Y_RETRATO + ALTO_RETRATO + ALTO_RESU / 2;

// Radios de esquina. Todo redondeado y en cascada: la ficha más que la tarjeta,
// la tarjeta más que las ranuras. Es lo que hace que las piezas pequeñas se lean
// como contenidas dentro de las grandes y no como pegatinas encima.
const R_FICHA = 5;
const R_TARJETA = 3;
const R_RANURA = 2.5;
const R_BARRA = 1.5;

export const COLOR_JUGADOR = ['#5aa9e6', '#e8b73a', '#8fbf5a', '#d64b8f'];
export const COLOR_PASIVO = '#9fd0e8';

// --- Colores -----------------------------------------------------------------
// TODOS los rellenos son translúcidos. La ficha tiene caja, pero se ve el juego
// a través de ella: con cuatro jugadores, cuatro cajas opacas taparían las
// cuatro esquinas del anfiteatro.
const PANEL_FONDO   = 'rgba(18,13,10,.34)';
const PANEL_BORDE   = 'rgba(236,226,206,.30)';
const HUECO_FONDO   = 'rgba(10,7,6,.26)';   // tarjeta y ranuras vacías
// Fondo de la ranura OCUPADA: blanco, para que el icono del arma o del pasivo se
// vea sobre su propio papel en vez de sobre la arena. Ligeramente translúcido
// —no es un 255 plano— porque la ficha entera deja ver el juego por debajo y un
// blanco opaco habría sido lo único macizo de toda la interfaz.
const FONDO_ICONO   = 'rgba(255,255,255,.92)';
const SEPARADOR     = 'rgba(236,226,206,.28)';
const CARRIL        = 'rgba(8,6,5,.52)';    // fondo de las barras
const CARRIL_BORDE  = 'rgba(236,226,206,.22)';

// Vida ROJA, siempre, sin cambiar de color al bajar. El semáforo verde-ámbar-
// rojo daba la misma información dos veces —la longitud de la barra ya dice
// cuánto queda— y a cambio hacía que la barra llena y la barra crítica fueran
// dos objetos distintos en pantalla, que es justo lo que no quieres cuando
// buscas tu propia ficha entre cuatro.
const COLOR_VIDA = '#c8443c';
const COLOR_VIDA_ALTO = 'rgba(255,196,186,.40)';   // filo superior, da volumen
// Escudo de la Égida, sobre la misma barra que la vida. Azul acero y no otro
// rojo: tiene que distinguirse de la vida de un vistazo, porque se pierde y se
// recupera solo mientras la vida no se mueve.
const COLOR_ESCUDO = '#6fa8d6';
const COLOR_ESCUDO_ALTO = 'rgba(220,240,255,.55)';

// Experiencia en azul oscuro e IGUAL para los cuatro: es la única barra que mide
// lo mismo para todo el mundo —cuánto falta para la siguiente elección— y
// teñirla del color de cada jugador la convertía en otra marca de identidad
// más, compitiendo con el nombre y con las ranuras.
const COLOR_XP = '#2f5aa8';
const COLOR_XP_ALTO = 'rgba(150,190,255,.35)';

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
// Precalculadas al cargar el módulo. Componer estas cadenas dentro del bucle de
// dibujado serían ocho por jugador y frame tiradas a la basura.
const BORDE_VACIA = COLOR_JUGADOR.map((c) => rgba(c, 0.26));
const BORDE_LLENA = COLOR_JUGADOR.map((c) => rgba(c, 0.55));

// Sombra de las formas. Para el texto se usa textoBorde, que da un contorno más
// duro; para los glifos basta con esto y no hay que pelearse con los grosores de
// línea que cada uno se pone por su cuenta.
//
// No hace falta apagarla a mano: la sombra sí entra en la pila de save/restore
// del canvas —al contrario que letterSpacing, ver ui/capa.js— y todos los sitios
// que la ponen están dentro de un save.
function sombraDura(ctx) {
  ctx.shadowColor = 'rgba(5,4,9,.95)';
  ctx.shadowBlur = 2.5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;
}

// --- Iconos -----------------------------------------------------------------
// Cada comportamiento tiene su glifo. Todos caben en una casilla de 15x15 y se
// dibujan centrados en (0,0) tras trasladar, para no repetir la aritmética.
export function glifoArma(ctx, comportamiento, r) {
  ctx.beginPath();
  switch (comportamiento) {
    case 'proyectilDirigido':          // punta de flecha: busca blanco
      ctx.moveTo(-r * 0.7, r * 0.6); ctx.lineTo(r * 0.8, 0); ctx.lineTo(-r * 0.7, -r * 0.6);
      ctx.closePath(); ctx.fill();
      break;
    case 'arcoMelee':                  // arco de corte
      ctx.arc(-r * 0.3, 0, r * 0.9, -1.0, 1.0);
      ctx.stroke();
      break;
    case 'conoCorto':                  // cono abierto de perdigones
      ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(r * 0.8, -r * 0.75); ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(r * 0.8, 0); ctx.moveTo(-r * 0.8, 0);
      ctx.lineTo(r * 0.8, r * 0.75);
      ctx.stroke();
      break;
    case 'direccionFija':              // dos flechas opuestas
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(r * 0.9, 0);
      ctx.moveTo(r * 0.9, 0); ctx.lineTo(r * 0.3, -r * 0.45);
      ctx.moveTo(r * 0.9, 0); ctx.lineTo(r * 0.3, r * 0.45);
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * 0.3, -r * 0.45);
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(-r * 0.3, r * 0.45);
      ctx.stroke();
      break;
    case 'direccionAleatoria':         // chispas dispersas
      for (let i = 0; i < 5; i++) {
        const a = i * 1.257;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
      }
      ctx.stroke();
      break;
    case 'proyectilExplosivo':         // proyectil con estallido delante
      ctx.moveTo(-r * 0.9, 0); ctx.lineTo(0, 0); ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.047;
        ctx.moveTo(r * 0.35, 0);
        ctx.lineTo(r * 0.35 + Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      }
      ctx.stroke();
      break;
    case 'bombardeoAleatorio':         // tres impactos cayendo
      for (let i = 0; i < 3; i++) {
        const x = -r * 0.7 + i * r * 0.7;
        ctx.moveTo(x, -r * 0.9); ctx.lineTo(x, r * 0.1);
        ctx.moveTo(x - r * 0.3, r * 0.5); ctx.lineTo(x + r * 0.3, r * 0.5);
      }
      ctx.stroke();
      break;
    case 'ondaCircular':               // dos anillos concéntricos
      ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'auraPasiva':                 // disco relleno tenue con borde
      ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
      ctx.globalAlpha *= 0.35; ctx.fill(); ctx.globalAlpha /= 0.35;
      ctx.stroke();
      break;
    case 'zonaPersistente':            // charco irregular
      ctx.ellipse(0, r * 0.15, r * 0.9, r * 0.55, 0, 0, Math.PI * 2);
      ctx.globalAlpha *= 0.4; ctx.fill(); ctx.globalAlpha /= 0.4;
      ctx.stroke();
      break;
    case 'rayoPerforante':             // haz recto que cruza entero
      ctx.moveTo(-r, -r * 0.25); ctx.lineTo(r, -r * 0.25);
      ctx.moveTo(-r, r * 0.25); ctx.lineTo(r, r * 0.25);
      ctx.stroke();
      break;
    case 'orbital':                    // órbita con dos cuentas
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.arc(-r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'orbitalPulsante':            // la misma órbita, pero a trazos: va y viene
      for (let i = 0; i < 4; i++) {
        const a0 = i * (Math.PI / 2) + 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.7, a0, a0 + 0.8);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.arc(-r * 0.7, 0, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
  }
}

// Los pasivos se distinguen por el campo que tocan, no por su nombre: así un
// pasivo nuevo que suba la velocidad hereda el glifo de velocidad sin tocar nada.
export function glifoPasivo(ctx, campo, r) {
  ctx.beginPath();
  switch (campo) {
    case 'velocidad':                  // ala
      ctx.moveTo(-r * 0.8, r * 0.4); ctx.lineTo(r * 0.8, -r * 0.5);
      ctx.lineTo(r * 0.1, r * 0.5); ctx.closePath(); ctx.fill();
      break;
    case 'armadura':                   // escudo
      ctx.moveTo(0, -r * 0.9); ctx.lineTo(r * 0.75, -r * 0.4);
      ctx.lineTo(r * 0.5, r * 0.8); ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.5, r * 0.8); ctx.lineTo(-r * 0.75, -r * 0.4);
      ctx.closePath(); ctx.fill();
      break;
    case 'bonusDanyo':                 // anillo
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.lineWidth = 2.5; ctx.stroke();
      break;
    case 'reduccionRecarga':           // reloj
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.55);
      ctx.moveTo(0, 0); ctx.lineTo(r * 0.4, 0); ctx.stroke();
      break;
    case 'regeneracion':               // cruz
      ctx.fillRect(-r * 0.22, -r * 0.85, r * 0.44, r * 1.7);
      ctx.fillRect(-r * 0.85, -r * 0.22, r * 1.7, r * 0.44);
      break;
    case 'bonusArea':                  // llama
      ctx.moveTo(0, -r); ctx.quadraticCurveTo(r * 0.9, 0, 0, r * 0.85);
      ctx.quadraticCurveTo(-r * 0.9, 0, 0, -r); ctx.fill();
      break;
    case 'radioRecogida':              // imán
      ctx.arc(0, r * 0.2, r * 0.75, Math.PI, 0); ctx.lineWidth = 3; ctx.stroke();
      break;
    case 'vidaMaxima':                 // ánfora
      ctx.moveTo(-r * 0.4, -r * 0.8); ctx.lineTo(r * 0.4, -r * 0.8);
      ctx.lineTo(r * 0.6, r * 0.5); ctx.lineTo(0, r * 0.95);
      ctx.lineTo(-r * 0.6, r * 0.5); ctx.closePath(); ctx.fill();
      break;
    default:
      ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
  }
}

// --- Iconos en PIXEL ART real -------------------------------------------
//
// Los glifos de arriba son trazos vectoriales: limpios a cualquier tamaño,
// pero lisos, y este juego es pixel art en todo lo demás (sección 13 del
// plan). Sin encargar 58 ilustraciones —una por arma y por pasivo—, la forma
// de que el icono hable el mismo idioma que el resto del arte es rasterizar
// cada glifo UNA VEZ a una rejilla pequeña y clavarlo luego a cualquier
// tamaño sin suavizado, igual que ESCALA_ARTE hace con el mundo: se ven los
// bloques de píxel en vez de una curva perfecta reducida.
//
// SE CACHEA POR (tipo, color). Con doce comportamientos de arma y ocho
// campos de pasivo, y bastantes colores repetidos entre armas del catálogo
// de 50, son como mucho unas pocas docenas de lienzos diminutos — creados la
// PRIMERA vez que hace falta cada combinación, nunca en el bucle de dibujado.
// No es el "cero `new` durante la partida" de las entidades del mundo (eso es
// para el bucle de 60 pasos por segundo con la pantalla llena); esto son unos
// pocos lienzos de 20x20 que se crean una vez, normalmente en la primera
// subida de nivel, y se reutilizan el resto de la partida.
const REJILLA_ICONO = 20;
const _cacheIconos = new Map();

function rasterizarIcono(pintar, color) {
  const c = document.createElement('canvas');
  c.width = c.height = REJILLA_ICONO;
  const cx = c.getContext('2d');
  cx.translate(REJILLA_ICONO / 2, REJILLA_ICONO / 2);
  cx.strokeStyle = color;
  cx.fillStyle = color;
  cx.lineWidth = 1.7;
  cx.lineJoin = 'round';
  cx.lineCap = 'round';
  pintar(cx, REJILLA_ICONO * 0.34);
  return c;
}

// Blit sin suavizado a cualquier tamaño. `imageSmoothingEnabled` se restaura
// al valor que traía el contexto: la capa de interfaz lo deja encendido para
// el retrato y el texto (ver ui/capa.js), y este es el único rincón que lo
// quiere apagado un instante.
function blitIcono(ctx, canvasIcono, x, y, r) {
  const suavizado = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const d = r * 2;
  ctx.drawImage(canvasIcono, x - r, y - r, d, d);
  ctx.imageSmoothingEnabled = suavizado;
}

// --- Reparto de las hojas de iconos --------------------------------------
//
// Cada hoja es una tira horizontal de fotogramas cuadrados y trae en el atlas
// su propio `orden`: la lista de ids, hueco por hueco, tal como la escribió
// herramientas/procesar-assets.ps1. Se le da la vuelta UNA vez, la primera vez
// que hace falta un icono, y a partir de ahí buscar el hueco de un arma es
// mirar un Map. Se hace tarde y no al cargar el módulo porque en ese momento
// el atlas todavía no existe: lo llena Recursos.cargar() antes del primer
// frame, y este archivo se importa mucho antes.
const _huecos = new Map();          // 'iconosArmas' -> Map(id -> fotograma)

function repartoDe(idHoja) {
  let mapa = _huecos.get(idHoja);
  if (mapa) return mapa;

  mapa = new Map();
  _huecos.set(idHoja, mapa);
  const meta = Recursos.meta(idHoja);
  // Sin imagen no hay reparto: el mapa se queda vacío y todo cae al glifo.
  if (!meta || !meta.orden || !Recursos.imagen(idHoja)) return mapa;
  for (let i = 0; i < meta.orden.length; i++) mapa.set(meta.orden[i], i);

  // Las EVOLUCIONES no llevan icono propio en la hoja: heredan el del arma de
  // la que salen. Quién evoluciona en qué ya está en datos/armas.js, así que
  // pedir cinco dibujos más habría sido duplicar en el arte algo que los datos
  // ya dicen. Además se lee bien en la ficha: el Pilum de Júpiter enseña el
  // pilum, que es de donde viene.
  if (idHoja === 'iconosArmas') {
    for (const id of Object.keys(ARMAS)) {
      const evo = ARMAS[id].evolucion;
      if (evo && mapa.has(id) && !mapa.has(evo.arma)) mapa.set(evo.arma, mapa.get(id));
    }
  }
  return mapa;
}

// Un fotograma de la hoja, centrado en (x,y) con radio r y sin suavizado.
// `ctx.shadowBlur`/`shadowColor` puestos por quien llama SÍ afectan al blit
// —drawImage respeta la sombra del contexto igual que fill/stroke— así que el
// resplandor de "al máximo" de ui/ficha.js sigue funcionando igual.
// A partir de este radio se tira de la hoja GRANDE.
//
// Las ranuras de la ficha piden 8 o 9 y ahí la hoja de 32 va casi a uno por uno.
// La ruleta del cofre pide 13, que en un monitor de densidad doble son más de
// cien píxeles reales: ampliar 32 hasta ahí es multiplicar por más de tres, y a
// vecino más próximo eso son bloques de tres y de cuatro píxeles mezclados. Es
// lo que se veía como iconos sucios y descuadrados en la ruleta.
//
// SE HA IDO A CERO: la hoja grande AHORA VALE PARA TODO. El 11 de antes partía
// los sitios en dos —el cofre y la tienda salían del arte de 96, la ficha y la
// carta de subida de nivel del de 32— y se veía: puestos uno al lado del otro en
// la galería, los de 32 son otra arma peor dibujada. Lo pidió Sergio y es lo
// correcto: quien decide cómo se ve un icono es el DIBUJO, no en qué pantalla
// ha salido.
//
// El razonamiento de arriba sigue en pie y es justo el que lleva al cero:
// ampliar tiene un techo —el arte de 32 no da más de sí— y reducir no lo tiene.
// Reducir 96 a los 9 de una ranura del HUD son diez píxeles de origen por cada
// uno de destino, promediados con el suavizado encendido: exactamente lo que
// hace una miniatura buena.
//
// Y NO SE BORRA la constante ni la elección de hoja: un icono sin gemela de 96
// —hoy no queda ninguno, pero mañana puede entrar uno— sigue cayendo solo a su
// hoja de 32 por el `Recursos.meta(idHoja + 'Hd')` de abajo.
const RADIO_HD = 0;

// `escala` es el aumento que quien llama tenga puesto en el contexto. NO se usa
// para dibujar —de eso ya se encarga la transformación— sino solo para ELEGIR
// HOJA: el radio que llega aquí está en las unidades de quien llama, y sin
// saber su escala no se puede saber cuánto va a ocupar el icono de verdad.
//
// Se pasa a mano en vez de leerlo con ctx.getTransform() porque eso devuelve
// una DOMMatrix NUEVA en cada llamada, y por aquí pasan ocho iconos por jugador
// y fotograma: es justo el `new` en bucle de partida que el proyecto no quiere.
function blitHoja(ctx, idHoja, hueco, x, y, r, escala) {
  // Con la hoja grande hay que SUAVIZAR: viene a 96 y se dibuja a menos, o sea
  // que se reduce, y reducir a vecino más próximo tira filas enteras. Es el caso
  // contrario al de la hoja pequeña, que se amplía y ahí el suavizado es lo que
  // emborrona.
  const grande = r * escala >= RADIO_HD && Recursos.meta(idHoja + 'Hd');
  const id = grande ? idHoja + 'Hd' : idHoja;
  const img = Recursos.imagen(id);
  const meta = Recursos.meta(id);
  if (!img || !meta) return;
  const suavizado = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = !!grande;
  const d = r * 2;
  ctx.drawImage(img, hueco * meta.w, 0, meta.w, meta.h, x - r, y - r, d, d);
  ctx.imageSmoothingEnabled = suavizado;
}

// Icono de un arma, centrado en (x,y) con radio r.
//
// `color` es el del arma en sus datos y ya SOLO se usa en el repliegue: los
// iconos dibujados traen su propia paleta y teñirlos sería taparla.
export function dibujarIconoArma(ctx, x, y, r, idArma, color, escala = 1) {
  const hueco = repartoDe('iconosArmas').get(idArma);
  if (hueco !== undefined) return blitHoja(ctx, 'iconosArmas', hueco, x, y, r, escala);

  const def = ARMAS[idArma];
  const comportamiento = def ? def.comportamiento : '';
  const llave = 'a:' + comportamiento + '|' + color;
  let c = _cacheIconos.get(llave);
  if (!c) { c = rasterizarIcono((cx, rr) => glifoArma(cx, comportamiento, rr), color); _cacheIconos.set(llave, c); }
  blitIcono(ctx, c, x, y, r);
}

// EL OBJETO DE PARTIDA Y EL POTENCIADOR DE LA TIENDA, EL MISMO DIBUJO.
//
// Son la misma cosa contada dos veces —el Ánfora sube la vida y la Vitalidad
// sube la vida— y hasta ahora tenían dibujos distintos: el objeto salía de la
// hoja de iconos de 32 y el potenciador del PNG grande que dibujó Sergio para la
// tienda. Lo pidió él y tiene razón; además el PNG está a 112 y se ve mucho
// mejor allí donde el icono se dibuja grande.
//
// Los dos que no tienen pareja —la Égida y la Moneda de Caronte son mecánicas
// que no existen como objeto de partida— no aparecen aquí porque nunca se piden
// por este camino.
const ARTE_PASIVO = {
  anfora: 'potVitalidad',
  sandalias: 'potPremura',
  lorica: 'potCoraza',
  piedraIman: 'potCodicia',
  anilloAugusto: 'potFuria',
  clepsidra: 'potClepsidra',
  antorcha: 'potOnda',
  coronaLaurel: 'potPanacea'
};

export function dibujarIconoPasivo(ctx, x, y, r, idPasivo, color, escala = 1) {
  const arte = ARTE_PASIVO[idPasivo];
  if (arte) {
    const meta = Recursos.meta(arte);
    const img = Recursos.imagen(arte);
    if (meta && img) {
      const esc = Math.min(r * 2 / meta.w, r * 2 / meta.h);
      const w = meta.w * esc;
      const h = meta.h * esc;
      const suavizado = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;     // se reduce desde 112: ver blitHoja
      ctx.drawImage(img, 0, 0, meta.w, meta.h, x - w / 2, y - h / 2, w, h);
      ctx.imageSmoothingEnabled = suavizado;
      return;
    }
  }
  const hueco = repartoDe('iconosObjetos').get(idPasivo);
  if (hueco !== undefined) return blitHoja(ctx, 'iconosObjetos', hueco, x, y, r, escala);

  const def = PASIVOS[idPasivo];
  const campo = def ? def.campo : '';
  const llave = 'p:' + campo + '|' + color;
  let c = _cacheIconos.get(llave);
  if (!c) { c = rasterizarIcono((cx, rr) => glifoPasivo(cx, campo, rr), color); _cacheIconos.set(llave, c); }
  blitIcono(ctx, c, x, y, r);
}

// Retrato del personaje: un BUSTO —cabeza, hombros y pecho— recortado de la
// ILUSTRACIÓN ORIGINAL por la herramienta (ver RecortarCabeza en
// procesar-assets.ps1) y guardado en el atlas como `<id>Cara` a 264x438.
//
// CUADRADO: de los hombros a la cabeza y nada más. El busto largo que llegaba al
// pecho encajaba en la columna vertical del diseño anterior, pero aquí el
// retrato va en un recuadro casi cuadrado dentro de su tarjeta, y ahí un busto
// obliga a alejar la cámara: la cara —lo único que identifica al jugador de un
// vistazo— se quedaba pequeña para dejar sitio a una camiseta que no dice nada.
//
// 288x288 y no 192x192, que es lo que había: esta capa dibuja a la resolución
// real del monitor, así que con zoom de pantalla 3x y densidad 2x un retrato de
// 36 unidades pide 216 píxeles de verdad. Desde 192 había que AMPLIARLO, y por
// eso se veía blando pese a venir de una ilustración de 650x1492.
//
// Se dibuja CON suavizado, al revés que el mundo. El juego es pixel art y va a
// vecino más próximo; el retrato es interfaz y puede permitirse todo el detalle
// que tenga la ilustración.
//
// `jugador.personaje` y no `jugador.id`: el id dice QUIÉN es —quinto— y
// `personaje` dice de qué DIBUJO sale, que es `def.sprite`. Mientras un héroe
// lleve arte prestada (ver `provisional` en datos/personajes.js) los dos no
// coinciden, y preguntando por el id el retrato salía vacío.
// --- Vidas: cinco corazones ---------------------------------------------------
//
// Debajo del retrato, SIEMPRE CINCO, lleno el que tienes y hueco el que no. Los
// dibujos son de Sergio (resources/characters/corazon_vida.png y
// corazon_muerte.png), redimensionados a 32 de alto para el atlas.
//
// SIEMPRE CINCO, y ese es el punto entero. Un contador que solo enseña lo que
// tienes no dice nada: ves tres corazones y no sabes si te sobran o si te
// faltan. Con las cinco casillas puestas desde el principio, el hueco vacío dice
// cuánto te queda por comprar y el corazón apagado dice cuánto has perdido, que
// son las dos cosas que se preguntan. Es la misma regla que las ranuras vacías
// de armas y objetos de esta misma ficha.
//
// QUÉ CUENTA COMO VIDA: la que estás viviendo más las resurrecciones que te
// queden. O sea que sin Moneda de Caronte se ve UN corazón lleno y cuatro
// huecos, no cinco huecos: estás vivo, y un jugador en pie con cero corazones
// diría lo contrario de lo que pasa. Al caer abatido se apagan todos.
//
// Sustituyen al círculo con un número que hubo aquí antes. El número era exacto
// y se leía peor: hay que pararse a leerlo, y esto se mira de reojo sin dejar de
// esquivar. Cinco siluetas se cuentan de un vistazo.
const VIDAS_MAX = 5;
// 7 y no 9: cinco corazones de 9 con su aire suman 51 y la tarjeta mide 42, así
// que se salían por los dos lados. A 7 con un punto de hueco son 39 y entran con
// margen. Es pequeño, pero lo que hay que contar de un vistazo son CINCO
// siluetas, no el detalle de cada una.
const CORAZON_ALTO = 7;
const CORAZON_HUECO = 1;

// LA MINI EXPLOSIÓN AL PERDER UNA. Medio segundo: el corazón se hincha, se parte
// en ocho esquirlas que salen en estrella y detrás queda el hueco.
//
// No es adorno. Perder una vida es el suceso más importante que le puede pasar a
// un jugador y hasta ahora pasaba en silencio en una esquina de 42 píxeles: el
// número bajaba y ya. Lo que hace falta no es informar —el corazón apagado ya
// informa— sino que el ojo VAYA ahí, y para eso tiene que moverse algo.
//
// El estado vive en el propio HUD y no en el jugador, con una entrada por
// jugador: es puramente visual, no entra en la simulación y por tanto no puede
// desincronizar el cooperativo online.
const EXPLOSION_VIDA = 0.5;
const ESQUIRLAS = 8;
const COLOR_CORAZON = '#e0443c';
const COLOR_ESQUIRLA = '#ff8a7a';

// EL CORAZÓN APAGADO, ACLARADO Y HORNEADO UNA VEZ.
//
// El dibujo de Sergio es un contorno rojo muy oscuro, que es lo correcto para un
// corazón vacío pero desaparece sobre el relleno translúcido del panel: en
// pantalla se veían los llenos y un hueco negro donde deberían estar los otros,
// o sea justo la mitad de la información que estos corazones existen para dar.
//
// Se aclara con un `source-atop` de blanco a media opacidad: pinta solo donde ya
// hay dibujo, así que respeta la silueta y no la ensucia por fuera. El arte no
// se toca; lo que cambia es cómo se presenta sobre este fondo.
//
// UNA SOLA VEZ y en un lienzo aparte, no por frame. Un `ctx.filter` por dibujo
// serían veinte filtros por fotograma con cuatro jugadores, y este es el archivo
// que se pinta sesenta veces por segundo.
let _corazonApagado = null;
function corazonApagado(img, meta) {
  if (_corazonApagado) return _corazonApagado;
  const c = document.createElement('canvas');
  c.width = meta.w; c.height = meta.h;
  const cc = c.getContext('2d');
  cc.drawImage(img, 0, 0);
  cc.globalCompositeOperation = 'source-atop';
  cc.fillStyle = 'rgba(226,216,200,.55)';
  cc.fillRect(0, 0, meta.w, meta.h);
  _corazonApagado = c;
  return c;
}

// Cuántas vidas se le vieron por última vez a cada jugador, para detectar el
// FLANCO de perder una. Comparar con el frame anterior es lo único que hace
// falta: nadie tiene que avisar al HUD de nada.
const VIDAS_VISTAS = [0, 0, 0, 0];
// Cuándo empezó la explosión de cada jugador, en milisegundos de RELOJ DE PARED.
//
// De pared y no del paso de simulación, igual que el pulso de furia de la barra
// de jefe de más abajo y por el mismo motivo: esto es adorno puro, no altera
// nada de lo que se simula, y así el HUD no necesita que nadie le pase un `dt`
// —el bucle solo le da el alpha de interpolación—. Un cero significa que no hay
// animación en marcha.
const EXPLOSION_DESDE = [0, 0, 0, 0];
const EXPLOSION_INDICE = [-1, -1, -1, -1];  // qué corazón reventó

// Vidas que le quedan a un jugador, contando la que está viviendo.
function vidasDe(j) {
  if (j.abatido) return 0;
  const extra = Math.max(0, (j.resurreccionesMax || 0) - (j.resurreccionesUsadas || 0));
  return Math.min(VIDAS_MAX, 1 + extra);
}

// OLVIDAR LO QUE SE VIO LA PARTIDA PASADA. Lo llama main.js al empezar una.
//
// Sin esto, `VIDAS_VISTAS` cruzaba de una partida a la siguiente y el flanco
// saltaba solo: quien terminara una partida con cuatro vidas y empezara la
// siguiente sin Moneda de Caronte veía tres corazones reventar en el primer
// fotograma, con sus esquirlas y todo. Es el mismo fallo de estado con memoria
// que ya se cazó en los obstáculos y en los pools.
export function reiniciarVidasHud() {
  for (let i = 0; i < VIDAS_VISTAS.length; i++) {
    VIDAS_VISTAS[i] = 0;
    EXPLOSION_DESDE[i] = 0;
    EXPLOSION_INDICE[i] = -1;
  }
}

function dibujarVidas(ctx, cx, cy, jugador, indice) {
  const vidas = vidasDe(jugador);
  const ahora = performance.now();

  // --- Flanco: ¿acaba de perder una? -------------------------------------
  // Se detecta comparando con lo que se vio el frame anterior. No hace falta que
  // nadie avise al HUD: el número ya está en el jugador y mirarlo cuesta una
  // resta.
  // El cero significa "todavía no se ha visto a este jugador", así que la
  // primera vuelta solo apunta y no compara: sin esto, la ficha del primer
  // fotograma de la partida ya vendría de un 0 y todo sería una pérdida.
  const antes = VIDAS_VISTAS[indice];
  if (antes > 0 && vidas < antes) {
    // Revienta el que se acaba de apagar, que es el último que estaba lleno.
    EXPLOSION_INDICE[indice] = vidas;
    EXPLOSION_DESDE[indice] = ahora;
  }
  VIDAS_VISTAS[indice] = vidas;

  // Cuánto le queda a la animación, en segundos. Cero o menos: no hay.
  const restante = EXPLOSION_DESDE[indice] > 0
    ? EXPLOSION_VIDA - (ahora - EXPLOSION_DESDE[indice]) / 1000
    : 0;

  const imgVida = Recursos.imagen('corazonVida');
  const imgMuerte = Recursos.imagen('corazonMuerte');
  const metaVida = Recursos.meta('corazonVida');
  const metaMuerte = Recursos.meta('corazonMuerte');
  if (!imgVida || !imgMuerte || !metaVida || !metaMuerte) return;

  // CELDAS FIJAS, dibujo centrado dentro. Los dos corazones no tienen la misma
  // proporción —el hueco es más ancho y más bajo— así que dibujarlos a su aire
  // haría bailar la fila cada vez que uno cambia de estado. Con la celda fija,
  // cada uno conserva su forma y la fila no se mueve.
  const celda = CORAZON_ALTO + CORAZON_HUECO;
  const x0 = cx - (VIDAS_MAX * celda - CORAZON_HUECO) / 2;

  ctx.save();
  for (let i = 0; i < VIDAS_MAX; i++) {
    const vivo = i < vidas;
    const meta = vivo ? metaVida : metaMuerte;
    const img = vivo ? imgVida : corazonApagado(imgMuerte, metaMuerte);
    const w = CORAZON_ALTO * meta.w / meta.h;
    let x = x0 + i * celda + (CORAZON_ALTO - w) / 2;
    let y = cy - CORAZON_ALTO / 2;
    let lado = CORAZON_ALTO;

    // El que está reventando se HINCHA antes de quedarse hueco: crece de golpe
    // y vuelve. Es lo que hace que el ojo lo pille aunque estuviera mirando al
    // centro de la pantalla.
    if (restante > 0 && i === EXPLOSION_INDICE[indice]) {
      const u = restante / EXPLOSION_VIDA;      // 1 al empezar, 0 al acabar
      const crece = 1 + 0.9 * u * u;
      lado = CORAZON_ALTO * crece;
      x = x0 + i * celda + (CORAZON_ALTO - w * crece) / 2;
      y = cy - lado / 2;
      ctx.globalAlpha = 0.35 + 0.65 * u;
    }

    ctx.drawImage(img, x, y, lado * meta.w / meta.h, lado);
    ctx.globalAlpha = 1;
  }

  // --- Las esquirlas -----------------------------------------------------
  // Salen en estrella desde el corazón que ha reventado, frenando y apagándose.
  // Van POR CÓDIGO y no por partículas del juego: el sistema de partículas vive
  // en coordenadas del mundo y esto pasa en la capa de interfaz, que tiene sus
  // propias unidades y su propia resolución.
  if (restante > 0 && EXPLOSION_INDICE[indice] >= 0) {
    const u = 1 - restante / EXPLOSION_VIDA;    // 0 al empezar, 1 al acabar
    const ccx = x0 + EXPLOSION_INDICE[indice] * celda + CORAZON_ALTO / 2;
    // Raíz cuadrada: salen disparadas y frenan, en vez de ir a velocidad
    // constante como una rueda de feria.
    const dist = 11 * Math.sqrt(u);
    const r = 1.6 * (1 - u);
    ctx.globalAlpha = 1 - u;
    ctx.fillStyle = u < 0.4 ? COLOR_ESQUIRLA : COLOR_CORAZON;
    for (let k = 0; k < ESQUIRLAS; k++) {
      const ang = (k / ESQUIRLAS) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.arc(ccx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist * 0.85,
              r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function dibujarCabeza(ctx, x, y, ancho, alto, jugador) {
  const img = Recursos.imagen(jugador.personaje + 'Cara');
  if (!img) return;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ancho, alto, R_TARJETA);
  ctx.clip();

  // Encaje "cubrir": se escala por el lado que se quede corto y se centra, así
  // que el hueco queda lleno pase lo que pase con la proporción de la fuente.
  // Recortar unas décimas por los lados es invisible; una banda vacía, no.
  const escala = Math.max(ancho / img.width, alto / img.height);
  const w = img.width * escala;
  const h = img.height * escala;
  ctx.drawImage(img, x + (ancho - w) / 2, y + (alto - h) / 2, w, h);
  ctx.restore();
}

// Rectángulo redondeado, relleno y/o con borde. Se repite en la ficha, la
// tarjeta, las ranuras y las barras, y siempre con las mismas tres decisiones.
function caja(ctx, x, y, w, h, r, relleno, borde, grosor = 1) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
  if (borde) { ctx.lineWidth = grosor; ctx.strokeStyle = borde; ctx.stroke(); }
}

// Barra con carril, relleno redondeado y un filo claro arriba que le da volumen.
// El carril oscuro no es "fondo del panel": es parte de la barra, y sin él no se
// distingue lo que falta de lo que directamente no hay.
// Barra VERTICAL, que se llena de abajo arriba. Es la de experiencia, y va
// aparte de dibujarBarra en vez de con un parámetro `vertical` porque de común
// solo tienen el carril: el relleno crece por el otro extremo, el mínimo que
// evita la astilla se mide en el otro eje y el filo de volumen va en el canto
// que mira a la luz, no arriba.
//
// De abajo arriba y no de arriba abajo porque es lo que hace un depósito que se
// llena. Al revés se leería como algo que se agota, que es justo lo contrario
// de lo que cuenta la experiencia.
function dibujarBarraVertical(ctx, x, y, w, h, frac, color, filo) {
  caja(ctx, x, y, w, h, R_BARRA, CARRIL, CARRIL_BORDE);
  if (frac <= 0) return;

  const h2 = Math.max(w * 0.5, h * frac);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, R_BARRA);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y + h - h2, w, h2, R_BARRA);
  ctx.fill();
  ctx.fillStyle = filo;
  ctx.fillRect(x + 0.5, y + h - h2, 1, h2);
  ctx.restore();
}

function dibujarBarra(ctx, x, y, w, h, frac, color, filo) {
  caja(ctx, x, y, w, h, R_BARRA, CARRIL, CARRIL_BORDE);
  if (frac <= 0) return;

  // El relleno se recorta contra el carril, así que a fracciones bajas conserva
  // la esquina redondeada de la izquierda y no se convierte en una astilla.
  const w2 = Math.max(h * 0.5, w * frac);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, R_BARRA);
  ctx.clip();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w2, h, R_BARRA);
  ctx.fill();
  ctx.fillStyle = filo;
  ctx.fillRect(x, y + 0.5, w2, 1);
  ctx.restore();
}

// Ranura: marco suave siempre, y dentro el glifo y el nivel si está ocupada.
// `marco` es el borde ya teñido con el color del jugador.
// `redonda` distingue objetos de armas también aquí, con la misma regla que la
// ficha de jugador: cuadrado el arma, redondo el objeto. Que las dos pantallas
// usen la misma forma para la misma cosa es la mitad de lo que hace que se
// puedan leer de reojo.
function dibujarRanura(ctx, x, y, marco, color, nivel, pintarGlifo, redonda) {
  const r = redonda ? RANURA_H / 2 : R_RANURA;
  // FONDO BLANCO en las ranuras OCUPADAS. Los iconos son pixel art con la
  // transparencia recortada al filo del dibujo, y sobre el relleno oscuro del
  // panel las siluetas oscuras de varias armas se comían el trazo. El blanco es
  // el mismo que usa la ficha de jugador, así que un arma se reconoce igual en
  // las dos pantallas. Las VACÍAS siguen en el hueco oscuro: son ausencia, y
  // cuatro cuadrados blancos vacíos pedirían la vista sin tener nada que contar.
  caja(ctx, x + 0.5, y + 0.5, RANURA_W - 1, RANURA_H - 1, r,
       pintarGlifo === null ? HUECO_FONDO : FONDO_ICONO, marco);

  if (pintarGlifo === null) return;

  ctx.save();
  // El píxel de subida es solo de la ranura CUADRADA: ahí el icono deja sitio
  // al pie de la cifra de nivel y el marco recto no se le echa encima. En la
  // redonda ese píxel se paga carísimo —acerca las dos esquinas de arriba al
  // arco, que es justo por donde se sale el dibujo— así que va centrado.
  ctx.translate(x + RANURA_W / 2, y + RANURA_H / 2 - (redonda ? 0 : 1));
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  sombraDura(ctx);
  pintarGlifo(ctx, redonda ? ICONO_REDONDO : ICONO_CUADRADO);
  ctx.restore();

  // El nivel va en la esquina inferior derecha, PISANDO el borde de la ranura.
  // Dentro tendría que competir con el glifo por el mismo hueco; encima del
  // borde, con su propio reborde oscuro, se lee sin quitarle sitio a nada.
  ctx.font = `700 7px ${FUENTE}`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  textoBorde(ctx, String(nivel), x + RANURA_W - 0.5, y + RANURA_H, '#ffffff', 2.4);
}

// --- Cinta de partida: reloj y denarios ---------------------------------------
// El tiempo que llevas es el dato más importante que hay en pantalla después de
// tu vida: la curva de dificultad está escrita contra el reloj, así que saber
// que quedan dos minutos para el minuto 10 es saber lo que viene.
//
// Arriba en el centro, la única franja que ni las fichas ni los menús usan.
//
// LOS DENARIOS SE HAN VENIDO AQUÍ desde la esquina superior derecha, donde en
// cooperativo caían justo encima de la ficha del P2. Lo vio Sergio jugando. Y
// una vez juntos, comparten CAJA TRANSLÚCIDA —la misma receta que la ficha de
// jugador: relleno por debajo del 40% de alfa, borde tenue y los textos con su
// reborde oscuro—. Antes el reloj iba sin caja, a pelo sobre la arena, y con dos
// datos sueltos en la misma franja parecían dos cosas que se habían encontrado
// ahí por casualidad. Encerrados, se leen como lo que son: el marcador de la
// partida.
//
// Debajo cuelgan los AVISOS del director —élites y hitos de jefe—, que duran
// unos segundos y desaparecen. Es lo único de la interfaz que aparece y se va, y
// por eso puede permitirse el amarillo: no compite con nada porque no está casi
// nunca.
const COLOR_AVISO = '#ffd45a';

const Y_CINTA = 6;             // separación al borde superior
const ALTO_CINTA = 26;
const RELLENO_CINTA = 11;      // margen interior a izquierda y derecha
const HUECO_CINTA = 9;         // aire a cada lado del separador
const TAM_RELOJ = 16;
const TAM_DENARIOS = 15;
const LADO_MONEDA = 15;

export function dibujarReloj(ctx, ganados) {
  if (!Director.nivel) return;
  const t = Tema.actual;
  const cx = ANCHO_UI / 2;

  ctx.save();
  ctx.textBaseline = 'middle';

  // --- Medir antes de pintar --------------------------------------------
  ctx.font = `600 ${TAM_RELOJ}px ${FUENTE}`;
  const anchoReloj = ctx.measureText(Director.reloj).width;

  ctx.font = `700 ${TAM_DENARIOS}px ${FUENTE}`;
  // ANCHO RESERVADO, no el que mide la cifra de ahora. Si la caja se ajustara
  // al número, cada denario que cambia de dígitos la ensancharía y el reloj se
  // correría un par de píxeles: un reloj que se mueve mientras lo miras es
  // exactamente lo que no se quiere de un reloj. Con el hueco de cuatro cifras
  // reservado, la caja no se toca en toda la partida.
  const anchoCifra = Math.max(ctx.measureText(String(ganados)).width,
                              ctx.measureText('9999').width);
  const anchoMonedas = LADO_MONEDA + 5 + anchoCifra;

  const anchoCaja = RELLENO_CINTA * 2 + anchoReloj + HUECO_CINTA * 2 + 1 + anchoMonedas;
  const x0 = cx - anchoCaja / 2;
  const cyCaja = Y_CINTA + ALTO_CINTA / 2;

  caja(ctx, x0 + 0.5, Y_CINTA + 0.5, anchoCaja - 1, ALTO_CINTA - 1, R_FICHA,
       PANEL_FONDO, PANEL_BORDE);

  // --- Reloj --------------------------------------------------------------
  const xReloj = x0 + RELLENO_CINTA;
  ctx.textAlign = 'left';
  ctx.font = `600 ${TAM_RELOJ}px ${FUENTE}`;
  textoBorde(ctx, Director.reloj, xReloj, cyCaja,
             Director.activo ? t.titulo : t.apagado, 3);

  // --- Separador ----------------------------------------------------------
  // El mismo de la ficha de jugador, y por el mismo motivo: a un lado va el
  // tiempo, que manda en lo que viene, y al otro el botín, que solo dice cómo
  // ha ido. Son dos cosas distintas dentro de una misma cinta.
  const xSep = xReloj + anchoReloj + HUECO_CINTA;
  ctx.beginPath();
  ctx.moveTo(xSep, Y_CINTA + 5);
  ctx.lineTo(xSep, Y_CINTA + ALTO_CINTA - 5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = SEPARADOR;
  ctx.stroke();

  // --- Denarios de ESTA partida -------------------------------------------
  // Los de la partida y no el montón acumulado, que es lo que pidió Sergio y es
  // lo correcto: el total ya sale en todos los menús y ahí es donde sirve —para
  // decidir qué comprar—. Mientras se juega, lo que dice algo es cuánto llevas
  // sacado en esta partida, porque es lo que se pierde si te matan pronto.
  //
  // Estaban arriba a la DERECHA y se han venido al centro: en cooperativo caían
  // justo encima de la ficha del P2. Aquí no estorban a nadie, porque la franja
  // de arriba en el centro es la única que ni las fichas ni los menús usan.
  const xMoneda = xSep + HUECO_CINTA + LADO_MONEDA / 2;
  const meta = Recursos.meta('monedaHud');
  const img = Recursos.imagen('monedaHud');
  if (meta && img) {
    const esc = Math.min(LADO_MONEDA / meta.w, LADO_MONEDA / meta.h);
    const w = meta.w * esc;
    const h = meta.h * esc;
    const suavizado = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, 0, 0, meta.w, meta.h, xMoneda - w / 2, cyCaja - h / 2, w, h);
    ctx.imageSmoothingEnabled = suavizado;
  }
  ctx.textAlign = 'right';
  ctx.font = `700 ${TAM_DENARIOS}px ${FUENTE}`;
  textoBorde(ctx, String(ganados), x0 + anchoCaja - RELLENO_CINTA, cyCaja,
             '#e8b73a', 3.5);

  // --- Avisos del director, colgando de la cinta ---------------------------
  if (Director.avisoRestante > 0) {
    // Se desvanece al final en vez de cortarse en seco: un texto que se apaga
    // no roba la vista, y en este juego la vista hace falta en otro sitio.
    ctx.globalAlpha = Math.min(1, Director.avisoRestante / 1.2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = `600 11px ${FUENTE}`;
    textoBorde(ctx, Director.aviso, cx, Y_CINTA + ALTO_CINTA + 5, COLOR_AVISO, 3);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}


export function dibujarPaneles(ctx, jugadores) {
  ctx.save();

  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    const armas = j.arsenal ? j.arsenal.equipadas : [];
    const idsPasivos = Object.keys(j.pasivos);
    const indice = i % COLOR_JUGADOR.length;
    const color = COLOR_JUGADOR[indice];

    // Esquinas: 0 arriba-izq, 1 arriba-der, 2 abajo-izq, 3 abajo-der. Los de la
    // derecha van ESPEJADOS —tarjeta de identidad hacia el borde de pantalla—
    // para que las dos fichas de arriba se lean como un par simétrico y no como
    // la misma pieza repetida y descolgada.
    const derecha = (i % 2) === 1;
    const abajo = i >= 2;
    // El ancho es de ESTE jugador: quien lleve Bandolera o Zurrón tiene una
    // ranura más por fila y su ficha crece lo justo para ella. En cooperativo
    // las cuatro esquinas pueden medir distinto, y está bien: cada ficha dice
    // los huecos que tiene su dueño, no los del que más haya comprado.
    const nRanuras = ranurasDe(j);
    const columna = columnaDe(nRanuras);
    const ancho = columna + RESTO_ANCHO;
    const x = derecha ? ANCHO_UI - ancho - MARGEN : MARGEN;
    const y = abajo ? ALTO_UI - ALTO_FICHA - MARGEN : MARGEN;

    // --- Caja de la ficha -------------------------------------------------
    caja(ctx, x + 0.5, y + 0.5, ancho - 1, ALTO_FICHA - 1, R_FICHA,
         PANEL_FONDO, PANEL_BORDE);

    // --- Tarjeta de identidad: retrato, nombre y nivel --------------------
    // La barra de xp va pegada al BORDE DE CASA, o sea al lado por el que la
    // ficha toca la pantalla, igual que la tarjeta de identidad y por el mismo
    // motivo: en las fichas espejadas todo lo de identidad mira hacia fuera.
    const xXp = derecha ? x + ancho - RELLENO_H - ANCHO_XP : x + RELLENO_H;
    const xTarjeta = derecha ? xXp - HUECO_XP - TARJETA_ANCHO
                             : xXp + ANCHO_XP + HUECO_XP;

    // A la misma altura exacta que la tarjeta: son las dos piezas altas de la
    // ficha y cualquier desajuste entre ellas se ve como una torcida.
    const fracXp = j.xpNecesaria > 0 ? Math.min(1, j.xp / j.xpNecesaria) : 0;
    dibujarBarraVertical(ctx, xXp, y + RELLENO_V, ANCHO_XP, TARJETA_ALTO,
                         fracXp, COLOR_XP, COLOR_XP_ALTO);
    caja(ctx, xTarjeta, y + RELLENO_V, TARJETA_ANCHO, TARJETA_ALTO, R_TARJETA,
         HUECO_FONDO, null);
    dibujarCabeza(ctx, xTarjeta + RETRATO_INSET, y + Y_RETRATO,
                  RETRATO_ANCHO, ALTO_RETRATO, j);
    dibujarVidas(ctx, xTarjeta + TARJETA_ANCHO / 2, y + Y_RESU, j, indice);

    const cxTarjeta = xTarjeta + TARJETA_ANCHO / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 9px ${FUENTE}`;
    textoBorde(ctx, `P${i + 1} ${j.def.nombre}`, cxTarjeta, y + Y_NOMBRE,
               j.abatido ? '#c0453f' : color, 2.6);
    ctx.font = `700 8.5px ${FUENTE}`;
    textoBorde(ctx, `LV ${j.nivel}`, cxTarjeta, y + Y_NIVEL, '#f0e8d8', 2.6);

    // --- Línea separadora -------------------------------------------------
    // Marca que a un lado está QUIÉN eres y al otro CÓMO estás. Son dos cosas
    // que se consultan en momentos distintos.
    const xSep = derecha ? xTarjeta - HUECO_SEP : xTarjeta + TARJETA_ANCHO + HUECO_SEP;
    ctx.beginPath();
    ctx.moveTo(xSep, y + RELLENO_V + 1);
    ctx.lineTo(xSep, y + ALTO_FICHA - RELLENO_V - 1);
    ctx.lineWidth = 1;
    ctx.strokeStyle = SEPARADOR;
    ctx.stroke();

    // --- Columna de estado -------------------------------------------------
    const bx = derecha ? x + RELLENO_H : xSep + HUECO_SEP;

    const fracVida = Math.max(0, j.vida / j.vidaMaxima);
    dibujarBarra(ctx, bx, y + Y_VIDA, columna, ALTO_VIDA, fracVida,
                 COLOR_VIDA, COLOR_VIDA_ALTO);

    // ESCUDO (potenciador Égida) POR ENCIMA de la barra de vida, en azul y sin
    // carril propio. Compartir la barra y no tener una suya es lo correcto:
    // ocupa lo que le toca sobre la MISMA escala que la vida, así que se lee de
    // un vistazo cuánto aguantas en total. Una segunda barra debajo obligaría a
    // sumar dos números en mitad de una horda.
    //
    // Solo aparece si hay escudo que enseñar: quien no haya comprado la Égida
    // no ve un hueco vacío pidiendo ser rellenado.
    if (j.escudo > 0) {
      const fracEscudo = Math.min(1, j.escudo / j.vidaMaxima);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(bx, y + Y_VIDA, columna, ALTO_VIDA, R_BARRA);
      ctx.clip();
      ctx.fillStyle = COLOR_ESCUDO;
      ctx.fillRect(bx, y + Y_VIDA, columna * fracEscudo, ALTO_VIDA);
      ctx.fillStyle = COLOR_ESCUDO_ALTO;
      ctx.fillRect(bx, y + Y_VIDA + 0.5, columna * fracEscudo, 1);
      ctx.restore();
    }

    // SIN CIFRAS. La barra dice cuánta vida queda con su longitud y eso es todo
    // lo que hace falta mientras esquivas; el "83 / 115" encima obligaba a leer
    // un número en el peor momento posible para leer nada. Las cifras exactas
    // están en la ficha de jugador (ui/ficha.js), que se abre a propósito y con
    // el mundo parado, que es cuando de verdad se quieren mirar.
    // --- Filas de ranuras -----------------------------------------------
    // Se colocan de fuera hacia dentro: en las fichas espejadas, la primera
    // ranura queda pegada al borde de pantalla, que es el borde "de casa".
    const vacia = BORDE_VACIA[indice];
    const llena = BORDE_LLENA[indice];
    const paso = RANURA_W + HUECO_RANURA;
    const colocar = (k) => derecha
      ? bx + columna - RANURA_W - k * paso
      : bx + k * paso;

    for (let k = 0; k < (j.maxArmas || RANURAS); k++) {
      const a = armas[k];
      dibujarRanura(ctx, colocar(k), y + Y_ARMAS, a ? llena : vacia,
        a ? a.def.color : null, a ? a.nivel : 0,
        a ? ((c, r) => dibujarIconoArma(c, 0, 0, r, a.id, a.def.color)) : null, false);
    }

    for (let k = 0; k < (j.maxPasivos || RANURAS); k++) {
      const id = idsPasivos[k];
      const def = id ? PASIVOS[id] : null;
      dibujarRanura(ctx, colocar(k), y + Y_PASIVOS, def ? llena : vacia,
        def ? COLOR_PASIVO : null, def ? j.pasivos[id] : 0,
        def ? ((c, r) => dibujarIconoPasivo(c, 0, 0, r, id, COLOR_PASIVO)) : null, true);
    }
  }

  ctx.restore();
}

// --- Cuenta atrás del Reloj de Emerita ---------------------------------------
//
// Mientras la horda está parada, abajo en el centro, con la pinta de un reloj
// digital de los de toda la vida: dígitos de SIETE SEGMENTOS, dos puntos que
// parpadean y los segmentos apagados visibles por detrás en un azul casi negro.
//
// Los segmentos apagados son la mitad del truco. Un display de cristal líquido
// se reconoce porque se le ven los palitos que NO están encendidos —es lo que
// distingue un 1 de un 7 de un vistazo, y lo que hace que el conjunto parezca
// una pantalla y no un texto—. Sin ellos, esto serían cuatro cifras raras.
//
// SE DIBUJAN A MANO y no con una tipografía. No hay dependencias externas en
// este proyecto (ver CLAUDE.md), y una fuente de sistema con aire digital no
// existe en todas las máquinas: el mismo juego se vería de dos maneras según
// quién lo abra. Siete polígonos por cifra es más barato que esa lotería, y
// además caen justo donde se les dice.
//
// EN ROJO, y se llegó ahí por descarte. Empezó en azul apagado por una razón que
// parecía buena —el Reloj ya tiñe de hielo a la horda y vuelca un velo azul
// sobre la pantalla (ver VFX.helar), así que la cuenta atrás compartía color con
// lo que estaba contando— y en pantalla era justo lo que la hundía: ESE VELO ES
// EL FONDO. Un dígito azul sobre un velo azul se funde por claro y por oscuro, y
// se probaron los dos antes de aceptarlo.
//
// El rojo es lo contrario del velo en la rueda de color, así que se recorta solo
// sin necesidad de subir brillos ni engordar el halo. Se pierde el guiño de
// "esto es el mismo efecto que ves teñido de azul", y a cambio se lee. Lo pidió
// Sergio después de verlo dos veces.
// GRANDE de verdad: la cifra mide 60 de alto sobre una pantalla de 540, o sea
// un noveno de alto. Empezó en 46 y se quedaba en un marcador discreto de
// esquina; esto es lo único que hay que mirar mientras dura, y se mira de reojo
// sin dejar de correr.
const RELOJ_DIGITO_W = 34;
const RELOJ_DIGITO_H = 60;
const RELOJ_GROSOR = 8;            // ancho de un segmento
const RELOJ_HUECO = 9;             // aire entre cifras
// Desde el borde de abajo hasta la base de las cifras. Sube lo justo para NO
// pisar la barra de jefe ni su nombre: el peor momento de la partida —que es
// para lo que se coge este objeto— suele tener un jefe encima, así que las dos
// cosas se ven a la vez o no sirve ninguna.
const RELOJ_ABAJO = 62;

// El rojo del LED de toda la vida, que además es el que llevan los displays de
// siete segmentos de verdad. Ha ido #6f9fd0 -> #7fb0dd -> #4a7fb5 (tres azules,
// los tres se fundían con el velo) -> este.
const RELOJ_ENCENDIDO = '#e2372b';
// El brillo del cristal, y va CORTO a propósito. Con un halo ancho los
// segmentos se desbordaban unos sobre otros y el display salía desenfocado: el
// hueco en uve entre segmentos vecinos es lo que hace que se lea como cristal
// líquido, y un halo generoso es exactamente lo que lo rellena.
const RELOJ_FILO = 'rgba(255,140,120,.40)';
// LOS APAGADOS, GRIS MUY CLARO Y CASI TRANSPARENTE, que es lo que pidió Sergio.
//
// Estuvieron en el mismo rojo que los encendidos pero oscurecido, imitando a un
// display real, donde el segmento en reposo es el mismo cristal sin encender. En
// pantalla no funciona: SON EL MISMO TONO, así que a la velocidad a la que se
// mira esto —de reojo, sin dejar de esquivar— un segmento apagado se lee como
// uno encendido y las cifras se confunden unas con otras.
//
// Gris y al 20% de opacidad se separan del rojo por color Y por peso, que son
// dos señales en vez de una. Siguen cumpliendo su papel —dibujar el ocho de
// fondo que hace que esto parezca una pantalla y no dos cifras sueltas— pero ya
// no compiten por ser la cifra.
const RELOJ_APAGADO = 'rgba(232,236,240,.20)';

// Qué segmentos enciende cada cifra, en el orden a b c d e f g: arriba,
// arriba-derecha, abajo-derecha, abajo, abajo-izquierda, arriba-izquierda y el
// travesaño del medio. Es la numeración de siempre de los siete segmentos.
const RELOJ_SEGMENTOS = [
  0b0111111, // 0
  0b0000110, // 1
  0b1011011, // 2
  0b1001111, // 3
  0b1100110, // 4
  0b1101101, // 5
  0b1111101, // 6
  0b0000111, // 7
  0b1111111, // 8
  0b1101111  // 9
];

// Un segmento HORIZONTAL: un hexágono, no un rectángulo. Las puntas en pico son
// lo que deja el hueco en uve entre dos segmentos vecinos, y ese hueco es la
// firma del display de cristal líquido.
function segmentoH(ctx, x, y, w, t) {
  ctx.beginPath();
  ctx.moveTo(x + t / 2, y);
  ctx.lineTo(x + t, y - t / 2);
  ctx.lineTo(x + w - t, y - t / 2);
  ctx.lineTo(x + w - t / 2, y);
  ctx.lineTo(x + w - t, y + t / 2);
  ctx.lineTo(x + t, y + t / 2);
  ctx.closePath();
  ctx.fill();
}

function segmentoV(ctx, x, y, h, t) {
  ctx.beginPath();
  ctx.moveTo(x, y + t / 2);
  ctx.lineTo(x + t / 2, y + t);
  ctx.lineTo(x + t / 2, y + h - t);
  ctx.lineTo(x, y + h - t / 2);
  ctx.lineTo(x - t / 2, y + h - t);
  ctx.lineTo(x - t / 2, y + t);
  ctx.closePath();
  ctx.fill();
}

// Una cifra entera, con sus siete segmentos: los encendidos en rojo y el resto
// —siempre los siete, encendida o no— en el gris del cristal en reposo.
//
// `cifra` puede ser -1, y entonces la CELDA SE QUEDA A OSCURAS: los siete
// segmentos apagados y ninguno encendido. No es lo mismo que no dibujar nada, y
// tampoco es un cero. Ver la supresión del cero de la izquierda en
// dibujarCuentaAtrasReloj.
function dibujarCifra(ctx, x, y, cifra) {
  const w = RELOJ_DIGITO_W, h = RELOJ_DIGITO_H, t = RELOJ_GROSOR;
  const mitad = h / 2;
  const mascara = cifra < 0 ? 0 : RELOJ_SEGMENTOS[cifra];

  // Cada entrada es [encendido?, cómo se pinta]. Se recorre dos veces —primero
  // los apagados y luego los encendidos— para que el brillo de uno encendido
  // caiga siempre POR ENCIMA del vecino apagado y no al revés según el orden.
  const trazos = [
    [1 << 0, () => segmentoH(ctx, x, y, w, t)],                       // a
    [1 << 1, () => segmentoV(ctx, x + w, y, mitad, t)],               // b
    [1 << 2, () => segmentoV(ctx, x + w, y + mitad, mitad, t)],       // c
    [1 << 3, () => segmentoH(ctx, x, y + h, w, t)],                   // d
    [1 << 4, () => segmentoV(ctx, x, y + mitad, mitad, t)],           // e
    [1 << 5, () => segmentoV(ctx, x, y, mitad, t)],                   // f
    [1 << 6, () => segmentoH(ctx, x, y + mitad, w, t)]                // g
  ];

  ctx.fillStyle = RELOJ_APAGADO;
  for (let i = 0; i < trazos.length; i++) {
    if (!(mascara & trazos[i][0])) trazos[i][1]();
  }
  ctx.fillStyle = RELOJ_ENCENDIDO;
  for (let i = 0; i < trazos.length; i++) {
    if (mascara & trazos[i][0]) trazos[i][1]();
  }
}

// `restante` son los segundos que le quedan a la parálisis (enemigos
// .paralisisRestante, que es el único reloj de esto y vale para toda la horda).
// Con cero o menos no se dibuja nada: el objeto no está activo.
export function dibujarCuentaAtrasReloj(ctx, restante) {
  if (!(restante > 0)) return;

  // CEIL y no floor. Con floor, un reloj de diez segundos arranca marcando 09
  // —la cifra que se anunció no llega a verse— y se pasa el último segundo
  // entero en 00, que es justo cuando hace falta saber que todavía queda algo.
  // Redondeando hacia arriba empieza en 10 y el 00 aparece en el instante en
  // que la horda vuelve a moverse.
  const seg = Math.ceil(restante);

  // SOLO LOS SEGUNDOS, sin minutos y sin los dos puntos. Lo pidió Sergio y el
  // objeto le da la razón: esto dura diez segundos, así que el 0: de la
  // izquierda era una cifra que nunca cambiaba y unos puntos que separaban algo
  // de nada. Quitados, las dos cifras que sí importan salen más centradas y no
  // hay que saltarse nada para leerlas.
  //
  // DOS CELDAS SIEMPRE, para que el display no cambie de ancho al bajar de diez:
  // eso movería las cifras de sitio a mitad de cuenta, justo cuando más se están
  // mirando.
  //
  // Pero de nueve para abajo la celda de la izquierda se queda APAGADA en vez de
  // encender un cero. Un cero encendido es una cifra: se lee, y durante nueve de
  // los diez segundos de este objeto está diciendo algo que no significa nada. Un
  // reloj de verdad hace justo esto —suprime el cero a la izquierda y deja el
  // hueco con sus segmentos en reposo—, así que además es lo que se espera ver.
  //
  // El -1 es esa celda a oscuras, y no es lo mismo que no dibujarla: el ocho
  // fantasma sigue ahí y la cifra de las unidades no se mueve del sitio.
  //
  // El tope de 99 es teórico —hoy entra en 10— pero deja el dibujo definido si
  // algún día alguien sube PARALISIS_RELOJ por encima del minuto y medio.
  const decenas = Math.floor((seg % 100) / 10);
  const cifras = [decenas > 0 ? decenas : -1, seg % 10];

  const ancho = RELOJ_DIGITO_W * 2 + RELOJ_HUECO;
  let x = (ANCHO_UI - ancho) / 2;
  const y = ALTO_UI - RELOJ_ABAJO - RELOJ_DIGITO_H;

  ctx.save();

  // ENTRA Y SALE CON UN FUNDIDO de medio segundo por cada punta. Aparecer de
  // golpe delante de las narices, y encima grande, roba la vista justo en el
  // frame en el que acabas de recoger el objeto y estás mirando a la horda
  // quedarse quieta. Y al desaparecer avisa de que se acaba sin necesidad de
  // ponerse a parpadear en rojo.
  ctx.globalAlpha = Math.min(1, restante / 0.5);

  // El brillo del cristal, una sola vez para todo el display. Es flojo a
  // propósito: un display real no ilumina la habitación.
  ctx.shadowColor = RELOJ_FILO;
  ctx.shadowBlur = 3;

  dibujarCifra(ctx, x + RELOJ_GROSOR / 2, y, cifras[0]);
  x += RELOJ_DIGITO_W + RELOJ_HUECO;
  dibujarCifra(ctx, x + RELOJ_GROSOR / 2, y, cifras[1]);

  ctx.restore();
}

// --- Barra de jefe (Fase 6, sección 14 del plan) -----------------------------
// A lo ancho de la parte inferior, solo mientras un jefe sigue en pie. Lo
// alimenta sistemas/jefes.js con Jefes.info(): este archivo no sabe nada de
// Cerbero ni de la Loba, solo pinta una fracción, un nombre y, si le llegan,
// unas marcas de fase o un aviso de furia.
const ANCHO_BARRA_JEFE = 300;
const ALTO_BARRA_JEFE = 9;
const MARGEN_BARRA_JEFE = 15;

const COLOR_JEFE = '#8a2f3a';          // púrpura-sangre, distinto del rojo de vida
const COLOR_JEFE_ALTO = 'rgba(255,180,170,.35)';
const COLOR_JEFE_FURIA = '#ff5a3a';
const COLOR_JEFE_FURIA_ALTO = 'rgba(255,220,180,.55)';
const COLOR_REGEN = '#e8c23a';         // dorado: se está curando, no pierdas el tiempo en su cuerpo

export function dibujarBarraJefe(ctx, info) {
  if (!info) return;
  const x = (ANCHO_UI - ANCHO_BARRA_JEFE) / 2;
  const y = ALTO_UI - MARGEN_BARRA_JEFE - ALTO_BARRA_JEFE;
  const t = Tema.actual;

  ctx.save();

  // Nombre encima, centrado. Reborde oscuro y ya, como el reloj: no hace
  // falta caja propia, con la barra de abajo el conjunto ya se lee como una
  // sola pieza.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 10px ${FUENTE}`;
  const titulo = info.furia ? `${info.nombre} · FURIA` : info.nombre;
  textoBorde(ctx, titulo, ANCHO_UI / 2, y - 4,
             info.furia ? COLOR_JEFE_FURIA : t.titulo, 3);

  // Pulso suave de la furia. Es puramente cosmético —no altera nada de la
  // simulación, así que tirar de performance.now() no rompe la
  // reproducibilidad del criterio 10— y es lo que hace que "furia" se lea
  // como un estado activo y no como un simple cambio de color fijo.
  const pulso = info.furia ? 0.75 + 0.25 * Math.sin(performance.now() * 0.012) : 1;

  caja(ctx, x + 0.5, y + 0.5, ANCHO_BARRA_JEFE - 1, ALTO_BARRA_JEFE - 1, R_BARRA,
       CARRIL, CARRIL_BORDE);

  const color = info.furia ? COLOR_JEFE_FURIA : COLOR_JEFE;
  const filo = info.furia ? COLOR_JEFE_FURIA_ALTO : COLOR_JEFE_ALTO;
  const w2 = Math.max(ALTO_BARRA_JEFE * 0.5, ANCHO_BARRA_JEFE * Math.max(0, info.frac));

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, ANCHO_BARRA_JEFE, ALTO_BARRA_JEFE, R_BARRA);
  ctx.clip();
  ctx.globalAlpha = pulso;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w2, ALTO_BARRA_JEFE, R_BARRA);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = filo;
  ctx.fillRect(x, y + 0.5, w2, 1);
  ctx.restore();

  // Marcas de fase (Cerbero): una raya fina en cada tercio de vida en el que
  // cambia de comportamiento. Es la única pista de que "cuando baje de aquí,
  // pasa algo distinto" sin tener que memorizar el plan.
  if (info.marcas) {
    ctx.strokeStyle = 'rgba(10,7,6,.75)';
    ctx.lineWidth = 1;
    for (let i = 0; i < info.marcas.length; i++) {
      const mx = Math.round(x + ANCHO_BARRA_JEFE * info.marcas[i]) + 0.5;
      ctx.beginPath();
      ctx.moveTo(mx, y + 1);
      ctx.lineTo(mx, y + ALTO_BARRA_JEFE - 1);
      ctx.stroke();
    }
  }

  // Regenerando (la Loba, con algún gemelo vivo): un filo dorado en vez de
  // dejar que la barra suba sola sin que se entienda por qué.
  if (info.regenerando) {
    ctx.strokeStyle = COLOR_REGEN;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.roundRect(x + 0.75, y + 0.75, ANCHO_BARRA_JEFE - 1.5, ALTO_BARRA_JEFE - 1.5, R_BARRA);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = PANEL_BORDE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, ANCHO_BARRA_JEFE - 1, ALTO_BARRA_JEFE - 1, R_BARRA);
  ctx.stroke();

  ctx.restore();
}
