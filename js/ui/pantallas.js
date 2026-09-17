import { ANCHO_UI, ALTO_UI, ANCHO_FISICO } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { Capa, FUENTE, FUENTE_TITULO, textoBorde, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import { PERSONAJES, ORDEN_PERSONAJES } from '../datos/personajes.js';
import { ARMAS } from '../datos/armas.js';
import { COLOR_JUGADOR, dibujarIconoArma } from './hud.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { MASCOTAS, MAX_NIVEL_MASCOTA } from '../datos/mascotas.js';
import { TituloVivo } from './tituloVivo.js';
import * as Nube from '../core/nube.js';

// Pantallas de TÍTULO y de SELECCIÓN DE PERSONAJE.
//
// Las dos se apoyan en una ilustración que ha pintado Sergio y que trae ya
// horneado casi todo: el logo, las cuatro opciones del menú, el rótulo "Elige a
// tu Héroe" y la arquería. Nada de eso se vuelve a dibujar aquí — sería competir
// con el arte y perder. Lo único que se añade es lo que una imagen no puede
// tener: qué arco está elegido, de quién es cada cursor y qué hay que pulsar.
//
// CON UNA EXCEPCIÓN: QUIÉN HAY DENTRO DE CADA MARCO. La lámina de selección
// trae cuatro marcos VACÍOS a propósito —los repintó Sergio así— porque el
// catálogo pasó de cuatro héroes a ocho: son ventanas por las que corre una
// tira, no cuatro personajes. El retrato lo pone el código; ver la cabecera de
// la sección de selección, más abajo.
//
// EN DOS LIENZOS, como el resto del juego (ver ui/capa.js):
//
//   - La ilustración va en el lienzo del MUNDO, que mide 1920x1080 fijos.
//   - Los resaltados y los textos, en la CAPA DE INTERFAZ, que va a la
//     resolución real del monitor. Un "PULSA A" trazado en el lienzo del mundo
//     saldría ampliado y escalonado.
//
// Y la ilustración se dibuja CON SUAVIZADO, al revés que todo el arte del
// mundo. Es la misma decisión que el retrato de la ficha: ninguna de las dos
// imágenes encaja en 1920x1080 por un múltiplo entero —la del título pide
// 1,30x y la de selección 1,18x— así que a vecino más próximo saldrían filas de
// píxeles dobladas sí y no, que en las letras del logo se ve como un defecto.
// Son pantallas quietas: no hay hormigueo que temer, solo un pelo de blandura.

const RUTA_TITULO = 'assets/menus/titulo.jpg';

// Por dónde se recortaría la ilustración del título si hubiera que recortarla.
//
// YA NO SE RECORTA: con el dibujo nuevo, la ilustración se encaja entera a lo
// alto y los lados se rellenan por detrás (ver ui/tituloVivo.js). Recortar
// dejaba SALIR fuera de la pantalla y CONFIGURACIÓN partida por la mitad,
// porque las cuatro opciones están pintadas mucho más abajo que en el dibujo
// anterior.
//
// La constante sobrevive para el REPLIEGUE: si la imagen no carga, `cubrir` la
// sigue necesitando para pintar el fondo liso de reserva.
const ANCLA_TITULO = 0.2;
const RUTA_SELECCION = 'assets/menus/seleccion.jpg';

// Píxeles del lienzo del mundo por unidad de interfaz. Las dos rejillas cubren
// el mismo rectángulo, así que basta la proporción entre sus anchos.
const K = ANCHO_FISICO / ANCHO_UI;

// --- Medidas tomadas SOBRE las ilustraciones --------------------------------
//
// En píxeles de la imagen original, no de pantalla. Se convierten con el encaje
// que devuelve `cubrir`, así que siguen valiendo con cualquier zoom o densidad.
//
// LOS CUATRO MARCOS DE LA PANTALLA DE SELECCIÓN, y estos números NO se ponen a
// ojo: los saca `herramientas\medir-marcos.ps1` de la propia lámina, buscando
// el negro cálido del interior —que es lo único de la escena que no tira a
// azul— y midiendo el bloque de filas que queda cubierto de lado a lado. Cada
// vez que Sergio repinte `seleccion_jugador.png` se vuelve a pasar y se copian
// las cinco líneas de abajo. Un repintado que mueva los marcos no da ningún
// error: los retratos siguen saliendo, solo que fuera de su hueco.
//
// ES EL HUECO INTERIOR, no el marco con su piedra. Ahí es donde va el retrato
// del héroe, así que lo que hace falta es por dónde acaba el dibujo de Sergio y
// empieza el negro.
//
// LOS CUATRO CENTROS, UNO A UNO, y no un primero más un paso constante. Están a
// 321, 325 y 314,5 de distancia: son marcos pintados a mano y no cuadran al
// píxel. Con un paso único, el tercer retrato caía seis píxeles descentrado
// dentro de su marco — poco, pero de los que se ven cuando los cuatro están en
// fila.
const ARCO_CENTRO = [375, 696, 1021, 1335.5];
const ARCO_ANCHO = 209;
const ARCO_Y = 305;
const ARCO_ALTO = 395;

// LAS CINCO OPCIONES DEL MENÚ, medidas sobre la ilustración (Main_menu.jpg,
// 1360x768). Vienen pintadas en su marco —JUGAR, JUGAR EN RED, TIENDA,
// CONFIGURACIÓN y SALIR—, así que aquí NO se vuelven a escribir: lo único que
// falta es decir cuál está señalada, y eso se hace ILUMINANDO SU RECUADRO. Es
// el criterio de toda esta pantalla: no competir con el arte.
//
// LAS MEDIDAS NO VAN A OJO NI SE SACAN A MANO: las da
// `herramientas\medir-lapida.ps1` en una tabla de texto, y ahí están escritas
// las tres precauciones que costó descubrir —los rieles del marco, el ruido del
// JPEG y el degradado de la piedra—. Cada vez que Sergio repinte la lápida, se
// vuelve a pasar y se copian los números de abajo.
//
// El marco del menú va de x=540 a x=863, contando por dentro de los rieles.
//
// Lo medido, en píxeles de la imagen:
//
//     JUGAR            y 554..575   x 644..746   (103 de ancho)
//     JUGAR EN RED     y 589..610   x 582..806   (225)
//     TIENDA           y 624..645   x 633..756   (124)
//     CONFIGURACIÓN    y 660..680   x 567..820   (254)
//     SALIR            y 694..715   x 647..742   (96)
//
// Las cinco miden lo mismo de alto —22— y van separadas 35.
//
// LA LÁMINA CAMBIA DE TAMAÑO CADA VEZ, y ese es el peligro de esta pantalla:
// 1376x768 primero, 1672x941 después y 1360x768 ahora. La escena es la misma,
// pero todos los números de aquí son píxeles de la imagen, así que todos se
// mueven aunque no se haya movido nada del dibujo. Comprobación de que sigue
// siendo la misma escena y no una recomposición: las antorchas de tituloVivo.js
// han vuelto a caer donde caían en la de 1376x768, a tres píxeles.
//
// Repintarla al mismo tamaño no obliga a tocar nada; reexportarla más grande o
// más pequeña lo invalida todo SIN QUE APAREZCA NINGÚN ERROR: el recuadro de
// luz simplemente cae donde no hay palabra. Se vuelve a sacar con
// `herramientas\medir-lapida.ps1`.
//
// Y LA VENTANA DE ESA HERRAMIENTA TIENE QUE PISAR LOS DOS RIELES, no quedarse
// por dentro: los reconoce sola y los descarta, pero si no los ve los cuenta
// como texto y las cinco palabras salen del ancho de la ventana. Con esta
// lámina, `-X0 522 -X1 882 -Y0 505 -Y1 745`. Los anchos de arriba salieron de
// mirar las rachas de píxeles claros de cada renglón, que es lo que queda
// cuando el riel deja de contaminar.
//
// El texto está centrado en el marco: las cinco palabras caen en 694 —las cinco,
// con un píxel de diferencia entre ellas— y el hueco entre rieles tiene su
// centro en 701. Aun así el número se toma del TEXTO y no del marco, porque en
// una ilustración anterior no coincidían: las palabras iban siete píxeles a la
// izquierda del centro del marco.
const OPCION_X = 694;

// Un solo ancho para las cinco, y lo manda la más larga: CONFIGURACIÓN mide
// 254. Con 284 quedan quince píxeles de aire a cada lado de esa palabra, y el
// recuadro entra holgado en el hueco del marco (540..863).
//
// Que a SALIR —96 de ancho— le sobre sitio es deliberado: un recuadro que
// cambia de tamaño según la palabra no se lee como un cursor que se mueve, sino
// como cinco recuadros distintos.
const OPCION_ANCHO = 284;

// Alto: 22 de texto más 10 de aire. Con 35 de separación entre renglones, deja
// tres píxeles de hueco entre un recuadro y el siguiente.
const OPCIONES_TITULO = [
  { y: 564, alto: 32 },     // JUGAR
  { y: 600, alto: 32 },     // JUGAR EN RED
  { y: 634, alto: 32 },     // TIENDA
  { y: 670, alto: 32 },     // CONFIGURACIÓN
  { y: 704, alto: 32 }      // SALIR
];

const Imagenes = { titulo: null, seleccion: null };

export const Pantallas = {
  // Se llama una vez al arrancar, junto al resto de recursos. Si alguna no
  // carga, la pantalla se pinta igual sobre un fondo liso: se pierde el
  // decorado, no la posibilidad de empezar una partida.
  async cargar() {
    const [t, s] = await Promise.all([
      Recursos.cargarSuelta(RUTA_TITULO),
      Recursos.cargarSuelta(RUTA_SELECCION)
    ]);
    Imagenes.titulo = t;
    Imagenes.seleccion = s;

    // La pantalla de título se hornea aquí: la ilustración escalada una sola vez
    // a su propio lienzo. A partir de ahí cada fotograma es una copia 1:1 más el
    // fuego de las antorchas (ver tituloVivo.js).
    TituloVivo.hornear('titulo', t);
  },

  titulo(ctxMundo, ctxUi, menu, cursor) { dibujarTitulo(ctxMundo, ctxUi, menu, cursor); },
  // `foco` es el personaje que acaba de tocar alguien: es del que se lee el
  // arma y la frase al pie. -1 (o nada) no escribe nada ahí.
  seleccion(ctxMundo, ctxUi, puestos, foco) { dibujarSeleccion(ctxMundo, ctxUi, puestos, foco); },

  // EL CARRUSEL DE UN JUGADOR SE MUEVE. Lo llama main.js al cambiar de héroe,
  // con `dir` a 1 o a -1: es lo único que aquí no se puede deducir, porque con
  // la lista filtrada el índice puede saltar de 6 a 1 yendo hacia la derecha.
  deslizarPuesto(indice, dir, previo) {
    const d = deslices[indice];
    if (!d) return;
    d.previo = previo;
    d.dir = dir;
    d.t = 1;
  },

  // AL ENTRAR en la pantalla: las figuras se plantan de golpe en su sitio, sin
  // entrar deslizándose desde donde se quedó la vez anterior.
  centrarSeleccion() {
    for (let i = 0; i < deslices.length; i++) {
      deslices[i].t = 0;
      deslices[i].previo = -1;
    }
    relojDeslices = 0;
  },
  mascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas) {
    dibujarMascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas);
  }
};

// Monedas acumuladas, arriba a la derecha. Sale en TODAS las pantallas de menú
// —título, selección de personaje, mascotas, tienda y configuración— porque es
// el número que decide si merece la pena entrar en la tienda, y eso hay que
// saberlo antes de entrar, no dentro.
//
// La moneda es el áureo de Augusto que dibujó Sergio. Antes era un círculo
// trazado con una "D" dentro, que era lo que había mientras no hubiera arte.
const COLOR_ORO = '#e8b73a';
// Medidas de la cartela de los denarios. La moneda ha bajado dos veces: de 21 a
// 17 y de 17 a 14. Al lado de una cifra de 13 es el tamaño en que acompaña sin
// competir, y es lo que le deja sitio a la cartela para rodearla entera en vez
// de que asome por arriba y por abajo.
const LADO_MONEDA = 14;
const HUECO_MONEDA = 5;      // entre la moneda y la cifra
const RELLENO_PLACA = 9;     // aire a cada lado del contenido
const ALTO_PLACA = 22;

export function dibujarOro(ctxUi, yPedida) {
  // Por defecto se aparta del borde SUPERIOR REAL, no del del lienzo: la capa
  // mide 540 de alto siempre, y si alguna vez se recorta (ver Capa.altoVisible)
  // una medida fija saldría descabezada.
  //
  // Las pantallas de tabla —tienda y configuración— pasan su propia `y` para que
  // la cartela caiga centrada en la fila de pestañas.
  const y = yPedida !== undefined
            ? yPedida
            : Math.max(20, (ALTO_UI - Capa.altoVisible) / 2 + 15);
  const cifra = String(MetaProgreso.denarios);

  ctxUi.save();
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `700 13px ${FUENTE}`;

  // LA CARTELA SE MIDE DESDE DENTRO. Antes se colocaba el número contra el borde
  // de la pantalla y la cartela se estiraba hacia atrás a ojo, y de ahí venían
  // las dos cosas que no encajaban: la moneda se salía por arriba y por abajo, y
  // el conjunto quedaba descentrado dentro de su óvalo.
  //
  // Ahora se mide el contenido —moneda, hueco y cifra—, se le suma el mismo aire
  // por los cuatro lados y eso ES la cartela. Todo lo que va dentro se coloca
  // respecto a ella, así que no puede descuadrarse.
  const anchoCifra = ctxUi.measureText(cifra).width;
  const anchoContenido = LADO_MONEDA + HUECO_MONEDA + anchoCifra;
  const derecha = ANCHO_UI - 16;
  const izquierda = derecha - anchoContenido - RELLENO_PLACA * 2;

  ctxUi.beginPath();
  ctxUi.roundRect(izquierda, y - ALTO_PLACA / 2, derecha - izquierda,
                  ALTO_PLACA, ALTO_PLACA / 2);
  ctxUi.fillStyle = 'rgba(10,8,12,.62)';
  ctxUi.fill();
  ctxUi.lineWidth = 1;
  ctxUi.strokeStyle = 'rgba(232,183,58,.28)';
  ctxUi.stroke();

  // La moneda, pegada al aire de la izquierda.
  const cx = izquierda + RELLENO_PLACA + LADO_MONEDA / 2;
  const meta = Recursos.meta('monedaHud');
  const img = Recursos.imagen('monedaHud');
  if (meta && img) {
    const esc = Math.min(LADO_MONEDA / meta.w, LADO_MONEDA / meta.h);
    const w = meta.w * esc;
    const h = meta.h * esc;
    ctxUi.drawImage(img, 0, 0, meta.w, meta.h, cx - w / 2, y - h / 2, w, h);
  } else {
    // Sin el dibujo cargado, un disco. No es adorno: sin moneda, el número no
    // dice de qué es.
    ctxUi.beginPath();
    ctxUi.arc(cx, y, LADO_MONEDA / 2, 0, Math.PI * 2);
    ctxUi.fillStyle = COLOR_ORO;
    ctxUi.fill();
    ctxUi.lineWidth = 1.2;
    ctxUi.strokeStyle = 'rgba(20,14,4,.65)';
    ctxUi.stroke();
  }

  // Y la cifra, pegada al de la derecha. Sin reborde: ya tiene la cartela
  // detrás, y un reborde sobre un fondo oscuro solo engorda los palos.
  ctxUi.textAlign = 'right';
  ctxUi.fillStyle = COLOR_ORO;
  ctxUi.fillText(cifra, derecha - RELLENO_PLACA, y + 0.5);
  ctxUi.restore();
}

// EL @USUARIO DE GITHUB, arriba a la IZQUIERDA —espejo de la placa de denarios,
// que va a la derecha— en toda pantalla de MENÚ. Nunca durante la partida: ahí
// no hay HUD ajeno al combate, y conectar con GitHub es un gesto de antes de
// jugar, no de en medio.
//
// No pinta nada si no hay sesión: quien no se ha conectado no tiene nada que
// ver aquí, igual que `dibujarOro` no dibuja una cartela vacía.
export function dibujarUsuarioGithub(ctxUi, yPedida) {
  const login = Nube.login();
  if (!login) return;

  const y = yPedida !== undefined
            ? yPedida
            : Math.max(20, (ALTO_UI - Capa.altoVisible) / 2 + 15);
  const texto = '@' + login;

  ctxUi.save();
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `700 12px ${FUENTE}`;

  const anchoTexto = ctxUi.measureText(texto).width;
  const izquierda = 16;
  const ancho = anchoTexto + RELLENO_PLACA * 2;

  ctxUi.beginPath();
  ctxUi.roundRect(izquierda, y - ALTO_PLACA / 2, ancho, ALTO_PLACA, ALTO_PLACA / 2);
  ctxUi.fillStyle = 'rgba(10,8,12,.62)';
  ctxUi.fill();
  ctxUi.lineWidth = 1;
  ctxUi.strokeStyle = 'rgba(232,183,58,.28)';
  ctxUi.stroke();

  ctxUi.textAlign = 'left';
  ctxUi.fillStyle = Tema.actual.texto;
  ctxUi.fillText(texto, izquierda + RELLENO_PLACA, y + 0.5);
  ctxUi.restore();
}

// --- Encaje de la ilustración -----------------------------------------------
//
// "Cubrir": se escala por el lado que se quede corto, así que la imagen llena
// la pantalla entera y lo que sobra del otro lado se sale. Nunca hay bandas
// negras, que en una pantalla de título se leen como que algo ha fallado.
//
// `anclaY` decide POR DÓNDE se recorta lo que sobra en vertical. La del título
// va anclada arriba (0) y no centrada: la ilustración es más cuadrada que la
// pantalla y le sobran 200 píxeles de alto, y recortando por el centro se
// perdía la punta de la espada y media luna del remate. Por abajo lo que sobra
// es empedrado, que no lo echa nadie de menos.
//
// Devuelve el encaje en UNIDADES DE INTERFAZ, que es donde se colocan después
// los resaltados; el lienzo del mundo solo tiene que multiplicar por K.
function cubrir(img, anclaY) {
  const esc = Math.max(ANCHO_UI / img.width, ALTO_UI / img.height);
  const ancho = img.width * esc;
  const alto = img.height * esc;
  return { esc, x: (ANCHO_UI - ancho) / 2, y: (ALTO_UI - alto) * anclaY, ancho, alto };
}

// Rectángulo de la imagen -> rectángulo en unidades de interfaz.
function enUi(e, x, y, ancho, alto) {
  return { x: e.x + x * e.esc, y: e.y + y * e.esc, w: ancho * e.esc, h: alto * e.esc };
}

function fondo(ctxMundo, img, e) {
  ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
  if (!img) {
    // Sin ilustración: piedra del tema. Fea, pero jugable.
    ctxMundo.fillStyle = Tema.actual.fondoBajo;
    ctxMundo.fillRect(0, 0, ANCHO_UI * K, ALTO_UI * K);
    return;
  }
  ctxMundo.imageSmoothingEnabled = true;
  ctxMundo.imageSmoothingQuality = 'high';
  ctxMundo.drawImage(img, e.x * K, e.y * K, e.ancho * K, e.alto * K);
  ctxMundo.imageSmoothingEnabled = false;
}

// La ilustración del título, sola, para que otra pantalla la use de decorado.
// La pide la TIENDA, que desde que ocupa el lienzo entero ya no es un panel
// flotando sobre lo que hubiera detrás: sin fondo propio se quedaba sobre el
// último fotograma dibujado, que podía ser la partida anterior.
//
// Vive aquí y no en tienda.js porque el encaje de la ilustración (`cubrir`, el
// ancla vertical, el repliegue sin imagen) ya está resuelto en este módulo, y
// dos sitios calculándolo por su cuenta es la forma segura de que un día dejen
// de coincidir.
export function fondoTitulo(ctxMundo) {
  if (TituloVivo.listo('titulo')) { TituloVivo.fondo(ctxMundo, 'titulo'); return; }
  const img = Imagenes.titulo;
  fondo(ctxMundo, img, cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, ANCLA_TITULO));
}

// Latido lento para lo que pide una pulsación. Va con performance.now() y no
// con el reloj de la simulación a propósito: estas pantallas no simulan nada,
// y el criterio 10 (misma semilla, misma partida) no se toca porque aquí
// todavía no ha empezado ninguna partida.
function latido(periodo, minimo) {
  const t = (performance.now() % periodo) / periodo;
  return minimo + (1 - minimo) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2));
}

// --- Título ------------------------------------------------------------------
// El menú entero viene pintado en la lápida de la ilustración. Lo único que se
// añade aquí es el recuadro encendido de la opción señalada y la línea de
// ayuda: ver OPCIONES_TITULO arriba.
function dibujarTitulo(ctxMundo, ctxUi, menu, cursor) {
  const img = Imagenes.titulo;

  // El encuadre es FIJO: la ilustración no se mueve ni un píxel (ver la cabecera
  // de tituloVivo.js). Lo único que cambia de un fotograma a otro es la luz que
  // se suma encima.
  let e;
  if (TituloVivo.listo('titulo')) {
    TituloVivo.avanzar();
    TituloVivo.fondo(ctxMundo, 'titulo');
    TituloVivo.efectos(ctxMundo, 'titulo');
    e = TituloVivo.encaje('titulo');
  } else {
    e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, ANCLA_TITULO);
    fondo(ctxMundo, img, e);
  }

  dibujarOro(ctxUi);
  dibujarUsuarioGithub(ctxUi);
  if (!img || !menu) return;

  // EL BOTÓN DE LA ESQUINA. Va con los demás en la lista del menú —se llega
  // bajando desde SALIR, porque un botón al que no se llega con el mando no es
  // un botón— pero se dibuja abajo a la derecha y aparte, que es donde lo quería
  // Sergio: borrar el progreso de todas las partidas no se pulsa por error si no
  // está donde se pulsa lo de todos los días.
  const esquina = menu.findIndex((m) => m.esquina);
  if (esquina >= 0) dibujarBotonEsquina(ctxUi, menu[esquina], cursor === esquina);
  if (cursor === esquina) return;

  const i = Math.max(0, Math.min(OPCIONES_TITULO.length - 1, cursor));
  const o = OPCIONES_TITULO[i];
  const r = enUi(e, OPCION_X - OPCION_ANCHO / 2, o.y - o.alto / 2, OPCION_ANCHO, o.alto);

  ctxUi.save();

  // EL RECUADRO ENCENDIDO. Va con 'lighter', es decir SUMANDO luz sobre la
  // piedra, no pintando un color encima: sobre una lápida gris cualquier relleno
  // opaco se lee como un parche, y sumando luz parece que la propia piedra está
  // iluminada. El latido lento es lo que hace que se vea que ESO es lo que se
  // mueve cuando cambias de opción.
  //
  // AZUL ELÉCTRICO, por decisión de Sergio. Antes era un ámbar cálido que salía
  // de las antorchas de la ilustración; el azul no sale de ninguna parte de la
  // escena, y eso es justo lo que lo hace saltar: en una lápida de piedra a la
  // luz del fuego, el único frío de la pantalla es el cursor.
  //
  // El relleno va más claro que el trazo —casi blanco azulado— porque sumado
  // sobre piedra oscura un azul puro se apaga y deja la mancha sucia en vez de
  // encendida. El color lo pone el borde; el relleno solo aclara.
  const pulso = latido(1500, 0.45);
  ctxUi.globalCompositeOperation = 'lighter';
  ctxUi.globalAlpha = 0.17 * pulso;
  ctxUi.fillStyle = '#a8dcff';
  ctxUi.beginPath();
  ctxUi.roundRect(r.x, r.y, r.w, r.h, 6);
  ctxUi.fill();
  ctxUi.restore();

  // SIN LÍNEA DE AYUDA. La quitó Sergio y tiene razón: cuatro opciones en una
  // lápida con una de ellas encendida no necesitan que nadie explique que se
  // sube, se baja y se pulsa. Donde sí sigue estando es en las pantallas que
  // tienen atajos que no se adivinan —la tienda, la selección—.
  //
  // EL BORDE, MÁS FINO QUE ANTES —de 2 a 1,3— y azul eléctrico. Lo pidió Sergio
  // y le sienta bien al azul: un trazo frío y saturado pesa más que uno cálido
  // al mismo grosor, así que con los 2 de antes el marco se comía la palabra
  // que enmarca. Adelgazándolo se lee como un filo encendido y no como una caja.
  //
  // No baja de 1: por debajo, el suavizado lo reparte entre dos filas de píxeles
  // y el borde deja de verse como una línea para verse como una mancha.
  ctxUi.save();
  ctxUi.lineWidth = 1.3;
  ctxUi.strokeStyle = `rgba(64, 176, 255, ${0.6 + 0.4 * pulso})`;
  ctxUi.beginPath();
  ctxUi.roundRect(r.x, r.y, r.w, r.h, 6);
  ctxUi.stroke();
  ctxUi.restore();
}

// Botón de la esquina inferior derecha. Apagado y rojo: tiene que verse que
// está y a la vez que no es de los que se pulsan.
function dibujarBotonEsquina(ctxUi, opcion, elegido) {
  const t = Tema.actual;
  const recorte = Math.max(0, (ALTO_UI - Capa.altoVisible) / 2);
  ctxUi.save();
  ctxUi.textAlign = 'right';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `500 11px ${FUENTE}`;

  const y = ALTO_UI - recorte - 20;
  const x = ANCHO_UI - 18;
  const ancho = ctxUi.measureText(opcion.texto).width + 26;

  ctxUi.beginPath();
  ctxUi.roundRect(x - ancho, y - 11, ancho, 22, 11);
  ctxUi.fillStyle = elegido ? 'rgba(64,20,18,.9)' : 'rgba(10,8,12,.6)';
  ctxUi.fill();
  ctxUi.lineWidth = elegido ? 1.8 : 1;
  ctxUi.strokeStyle = elegido ? '#e8907c' : 'rgba(232,144,124,.35)';
  ctxUi.stroke();

  ctxUi.fillStyle = elegido ? '#ffd9d0' : 'rgba(232,144,124,.75)';
  ctxUi.fillText(opcion.texto, x - 13, y + 0.5);
  ctxUi.restore();
}

// Despedida, cuando "Salir" no ha podido cerrar la pestaña. Ver salirDelJuego()
// en main.js: el navegador solo deja cerrar ventanas que ha abierto un script.
export function dibujarDespedida(ctxUi) {
  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.85)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `28px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = Tema.actual.titulo;
  textoEspaciado(ctxUi, 'HASTA LA PRÓXIMA', ANCHO_UI / 2, ALTO_UI / 2 - 16, 6);
  ctxUi.font = `400 12px ${FUENTE}`;
  ctxUi.fillStyle = Tema.actual.texto;
  ctxUi.fillText('Tu progreso está guardado. Ya puedes cerrar la pestaña.',
                 ANCHO_UI / 2, ALTO_UI / 2 + 18);
  ctxUi.restore();
}

// --- Selección de personaje --------------------------------------------------
//
// `puestos` es un array de MAX_JUGADORES con un hueco por control: null si ese
// jugador no se ha sumado, y si no `{ personaje, listo }`. El array lo lleva
// main.js —es estado de partida, no de dibujo— y aquí solo se pinta.
//
// UN MARCO POR JUGADOR, Y SIEMPRE EL MISMO. El primer marco es P1, el segundo
// P2 y así: los cuatro huecos que pintó Sergio dejan de ser el catálogo de
// héroes y pasan a ser los cuatro sitios en la mesa. Lo pidió él y arregla de
// raíz lo que la tira compartida hacía mal — que la ventana la mandara el
// último que se hubiera movido y a los demás se les fuera el personaje de la
// pantalla, con una chapita en el borde diciendo por dónde andaba.
//
// EL MARCO DE UN JUGADOR QUE NO ESTÁ, SE VE VACÍO. No se rellena con nadie: un
// hueco apagado que dice "pulsa A o Start" cuenta a la vez cuántos podéis ser y
// qué hay que hacer para entrar, que es justo lo que había que explicar en el
// renglón del pie.
//
// Y CADA MARCO TIENE SU PROPIO CARRUSEL. Cambiar de héroe desliza SU figura
// dentro de SU hueco, sin mover nada de los demás. La lista que recorre cada
// uno se filtra: un héroe que ya lleva otro jugador no aparece en el carrusel
// del resto —no es que esté y no se pueda coger, es que no está— porque cada
// personaje tiene su arma exclusiva y dos jugadores no pueden llevar la misma
// (ver `personajeLibre` en main.js, que es quien aplica la regla al moverse).
const VISIBLES = 4;
const VELO_ARCO = 'rgba(6,5,10,.35)';

// Lo que se le suma encima a la figura de un héroe que no es tuyo todavía, y a
// los marcos de los jugadores que no se han sumado.
const VELO_BLOQUEADO = 'rgba(6,5,10,.60)';
const VELO_VACIO = 'rgba(6,5,10,.55)';

// Cuánta luz se le suma al héroe elegido, y cuánta se reparte alrededor para
// que parezca que la figura alumbra en vez de estar simplemente más clara.
//
// Se subieron a 0,20 y 0,09 y Sergio las mandó volver: con la luz alta, un
// personaje de ropa clara —Lucy y su vestido blanco— se quemaba y perdía los
// pliegues. Lo que hay que ver es que ESE es el elegido, no un foco de teatro.
const LUZ_SILUETA = 0.08;
const LUZ_HALO = 0.035;
const HALO_PX = 3;

// La misma luz, en el filo del cartel del nombre y del cuadro del arma.
const LUZ_FILO = 0.28;

// EL CARRUSEL DE CADA MARCO, uno por jugador.
//
// `t` va de 1 a 0 mientras la figura entra: a 1 acaba de pulsarse y la nueva
// está fuera del marco; a 0 está en su sitio. `dir` es hacia dónde se movió el
// jugador, y lo manda main.js al mover el cursor (`Pantallas.deslizarPuesto`)
// porque es lo único que aquí no se puede deducir: con la lista filtrada, el
// índice puede saltar de 6 a 1 yendo hacia la derecha.
//
// Vive en el módulo y no en `puestos` porque es estado de DIBUJO: la partida no
// cambia porque una figura esté a medio entrar, y metiéndolo en `puestos` se
// habría colado en el saludo de la red.
const deslices = [];
for (let i = 0; i < VISIBLES; i++) deslices.push({ previo: -1, t: 0, dir: 1 });

function avanzarDeslices() {
  const ahora = performance.now();
  const dt = relojDeslices ? Math.min(0.1, (ahora - relojDeslices) / 1000) : 0;
  relojDeslices = ahora;
  // Acercamiento exponencial, medido en TIEMPO y no en fotogramas: esta
  // pantalla no simula nada y el monitor puede ir a 60 o a 144 (mismo criterio
  // que `latido`). Con 0,0005 de constante, una figura entra en algo más de un
  // tercio de segundo: se ve moverse y no se hace esperar.
  for (let i = 0; i < deslices.length; i++) {
    const d = deslices[i];
    if (d.t <= 0) continue;
    d.t *= Math.pow(0.0005, dt);
    if (d.t < 0.002) { d.t = 0; d.previo = -1; }
  }
}
let relojDeslices = 0;

// El hueco del jugador `s`, que es fijo: lo pintó Sergio ahí.
function ventanaDe(e, s) {
  return enUi(e, ARCO_CENTRO[s] - ARCO_ANCHO / 2, ARCO_Y, ARCO_ANCHO, ARCO_ALTO);
}

// El mismo rectángulo corrido `dx`, para la figura que entra y la que sale.
function corrido(r, dx) {
  return { x: r.x + dx, y: r.y, w: r.w, h: r.h };
}

function dibujarSeleccion(ctxMundo, ctxUi, puestos, foco = -1) {
  const img = Imagenes.seleccion;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0.5);
  fondo(ctxMundo, img, e);

  dibujarOro(ctxUi);
  dibujarUsuarioGithub(ctxUi);
  const t = Tema.actual;
  avanzarDeslices();
  ctxUi.save();

  for (let i = 0; i < VISIBLES; i++) {
    const v = ventanaDe(e, i);
    ctxUi.save();
    // EL RECORTE SE ESTIRA HACIA ARRIBA lo que ocupa el nombre. La ventana
    // medida es el HUECO del marco (ver medir-marcos.ps1) y el cartel del
    // nombre asoma por encima de su borde; sin este estirón, el recorte le
    // cortaba la fila de arriba. A lo ancho no se toca: por los lados sigue
    // mandando la pilastra, y es lo que hace que la figura que entra o sale
    // pase por DETRÁS de la piedra en vez de por delante.
    ctxUi.beginPath();
    ctxUi.rect(v.x, v.y - ASOMO_NOMBRE, v.w, v.h + ASOMO_NOMBRE);
    ctxUi.clip();

    // EL VELO EMPIEZA DEBAJO DEL NOMBRE, no en el borde del hueco: es el
    // sombreado de LA IMAGEN del personaje, así que sombrea la imagen y nada
    // más. El nombre queda fuera, sobre la piedra del arco.
    ctxUi.fillStyle = VELO_ARCO;
    ctxUi.fillRect(v.x, v.y + BANDA_NOMBRE, v.w, v.h - BANDA_NOMBRE);

    const puesto = puestos[i];
    if (!puesto) {
      dibujarHuecoVacio(ctxUi, v, i, t);
      ctxUi.restore();
      continue;
    }

    // La figura que entra y, mientras dura el deslizamiento, la que sale.
    const d = deslices[i];
    const dxNuevo = d.t > 0 ? d.dir * v.w * d.t : 0;
    if (d.t > 0 && d.previo >= 0) {
      const rViejo = corrido(v, dxNuevo - d.dir * v.w);
      dibujarHeroe(ctxUi, rViejo, d.previo, i, false, t);
    }
    dibujarHeroe(ctxUi, corrido(v, dxNuevo), puesto.personaje, i, puesto.listo, t);

    // Y las flechas, DESPUÉS y sin deslizarse: son del marco, no de la figura.
    // Si viajaran con ella se irían detrás de la pilastra justo cuando están
    // diciendo que se puede seguir moviendo.
    dibujarFlechasPuesto(ctxUi, v, i, puesto, puestos);

    ctxUi.restore();
  }

  // El héroe que se está mirando, con letra: su arma y su frase.
  if (foco >= 0 && foco < ORDEN_PERSONAJES.length) {
    dibujarPieHeroe(ctxUi, foco, ALTO_UI - 36, t);
  }

  // Pie: qué se puede hacer, en UNA sola línea.
  //
  // Una sola porque más renglones debajo de cuatro marcos ya no son ayuda, son
  // ruido — y porque el lienzo mide 1080 de alto FIJOS: en una ventana más baja
  // se recorta centrado (ver ESCALA_ARTE en core/constantes.js), así que el
  // segundo renglón sería lo primero que dejaría de verse.
  //
  // Lo de sumarse con A o Start ya no se dice aquí: lo dice cada marco vacío,
  // que es donde se mira cuando alguien pregunta si puede jugar.
  const presentes = puestos.filter(Boolean);
  const faltan = presentes.some((q) => !q.listo);
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `600 11px ${FUENTE}`;
  const enBloqueado = presentes.some(
    (q) => !q.listo && !MetaProgreso.heroeDesbloqueado(ORDEN_PERSONAJES[q.personaje]));
  let pie = '';
  if (enBloqueado) pie = 'Ese héroe se compra en la tienda';
  else if (!faltan) pie = 'Empezando...';
  if (pie) {
    ctxUi.globalAlpha = faltan ? 0.9 : latido(700, 0.4);
    textoBorde(ctxUi, pie, ANCHO_UI / 2, ALTO_UI - 20, t.texto, 3.5);
  }
  ctxUi.restore();
}

// UN HÉROE DENTRO DE SU MARCO: figura, nombre y arma. Todo lo que se desliza.
function dibujarHeroe(ctxUi, r, personaje, jugador, listo, t) {
  dibujarRetrato(ctxUi, r, personaje, jugador, t);
  dibujarTarjeta(ctxUi, r, personaje, jugador, listo, t);
}

// LAS FLECHAS DE UN JUGADOR, a los lados de su personaje y de su color.
//
// Las pidió Sergio y resuelven algo que la pantalla no decía en ninguna parte
// desde que cada jugador tiene su propio marco: que ahí dentro hay más héroes y
// que se pasa con izquierda y derecha. Antes lo contaban las flechas de los
// lados de la tira y la fila de puntos, pero las dos hablaban del carrusel
// compartido, que ya no existe.
//
// DEL COLOR DEL JUGADOR, que es lo que las ata a quien puede usarlas: con
// cuatro marcos en fila, unas flechas neutras serían cuatro pares iguales y
// cada uno tendría que averiguar cuáles son las suyas.
//
// PARPADEAN, y las dos a la vez. Se probó alternándolas —una y luego la otra—
// y se lee como una instrucción de "primero aquí y luego allí" en vez de como
// "por los dos lados hay más".
//
// NO SALEN SI YA HA CONFIRMADO: quien ha pulsado A ya no se mueve, y una flecha
// encendida al lado de un héroe cerrado invita a algo que no va a pasar.
// Tampoco si no hay a dónde ir — con todos los demás cogidos por otros, este
// jugador tiene un solo héroe posible y las flechas mentirían.
const FLECHA_ANCHO = 6;
const FLECHA_ALTO = 9;
const FLECHA_MARGEN = 11;     // desde el borde del hueco hasta la punta

function dibujarFlechasPuesto(ctxUi, v, indice, puesto, puestos) {
  if (puesto.listo) return;

  // ¿Hay más de uno al que ir? Cuenta los que no lleva OTRO jugador, que es la
  // misma lista que recorre el cursor (ver `personajeLibre` en main.js).
  let disponibles = 0;
  for (let p = 0; p < ORDEN_PERSONAJES.length; p++) {
    const oc = ocupantePersonaje(puestos, p);
    if (oc < 0 || oc === indice) disponibles++;
    if (disponibles > 1) break;
  }
  if (disponibles < 2) return;

  const color = COLOR_JUGADOR[indice % COLOR_JUGADOR.length];
  const cy = v.y + BANDA_NOMBRE + (v.h - BANDA_NOMBRE - BANDA_ARMA) * 0.5;
  const pulso = latido(900, 0.15);

  flecha(ctxUi, v.x + FLECHA_MARGEN, cy, -1, pulso, color);
  flecha(ctxUi, v.x + v.w - FLECHA_MARGEN, cy, 1, pulso, color);
}

// Punta maciza CON RIBETE. El ribete no es adorno: dentro del marco hay una
// figura y detrás piedra, y una punta lisa se perdía contra las dos. Con el
// contorno oscuro se lee esté delante lo que esté.
function flecha(ctxUi, x, y, sentido, pulso, color) {
  ctxUi.save();
  ctxUi.globalAlpha = pulso;
  ctxUi.beginPath();
  ctxUi.moveTo(x + FLECHA_ANCHO * sentido, y);
  ctxUi.lineTo(x - FLECHA_ANCHO * sentido, y - FLECHA_ALTO);
  ctxUi.lineTo(x - FLECHA_ANCHO * sentido, y + FLECHA_ALTO);
  ctxUi.closePath();
  ctxUi.lineWidth = 3;
  ctxUi.lineJoin = 'round';
  ctxUi.strokeStyle = 'rgba(6,5,10,.8)';
  ctxUi.stroke();
  ctxUi.fillStyle = color;
  ctxUi.fill();
  ctxUi.restore();
}

// EL MARCO DE UN JUGADOR QUE TODAVÍA NO ESTÁ.
//
// Apagado y con la instrucción dentro. No se deja del todo negro —el arco se
// vería roto en la fila de cuatro— sino velado: se lee que ahí cabe alguien.
function dibujarHuecoVacio(ctxUi, v, indice, t) {
  ctxUi.save();
  ctxUi.fillStyle = VELO_VACIO;
  ctxUi.fillRect(v.x, v.y + BANDA_NOMBRE, v.w, v.h - BANDA_NOMBRE);

  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  const cx = v.x + v.w / 2;

  // El número del puesto, arriba y donde va el nombre de los que sí están: los
  // cuatro rótulos caen a la misma altura y se cuenta de un vistazo quién falta.
  ctxUi.font = `700 12px ${FUENTE_TITULO}`;
  ctxUi.globalAlpha = 0.45;
  textoBorde(ctxUi, `P${indice + 1}`, cx, v.y - 1 + ALTO_CARTEL / 2, t.titulo, 3);
  ctxUi.globalAlpha = 1;

  // Y la invitación, en mitad del hueco, latiendo despacio.
  ctxUi.globalAlpha = latido(1600, 0.5);
  ctxUi.font = `700 10px ${FUENTE}`;
  textoEspaciado(ctxUi, 'PULSA A o START', cx, v.y + v.h * 0.46, 1.2);
  ctxUi.globalAlpha = 0.55;
  ctxUi.font = `500 9px ${FUENTE}`;
  ctxUi.fillStyle = t.apagado;
  ctxUi.fillText('para sumarte', cx, v.y + v.h * 0.46 + 14);
  ctxUi.restore();
}

// LA ESTATURA DE UN HÉROE, DE 0 A 1, con la más alta valiendo 1.
//
// Sale del alto de su sprite del mundo, que es donde vive la estatura de
// verdad (`alto` en la tabla $PERSONAJES de herramientas/procesar-assets.ps1:
// Helen 23, Julie 25, Say y los cuatro de siempre 26, Sofi 28). No se escribe
// aquí una segunda tabla con las mismas ocho alturas: dos listas de lo mismo
// se separan a la primera que se toque una.
//
// Se normaliza contra la MÁS ALTA y no contra un número fijo para que la más
// alta llene su hueco entera. Con un valor fijo, el día que alguien crezca por
// encima de él se saldría del marco.
let _estaturaMayor = 0;

function factorEstatura(def) {
  const meta = Recursos.meta(def.sprite);
  if (!meta) return 1;
  if (!_estaturaMayor) {
    for (let i = 0; i < ORDEN_PERSONAJES.length; i++) {
      const otro = Recursos.meta(PERSONAJES[ORDEN_PERSONAJES[i]].sprite);
      if (otro && otro.h > _estaturaMayor) _estaturaMayor = otro.h;
    }
  }
  return _estaturaMayor ? meta.h / _estaturaMayor : 1;
}

function dibujarRetrato(ctxUi, r, p, ocupante, t) {
  const id = ORDEN_PERSONAJES[p];
  const def = PERSONAJES[id];
  const bloqueado = !MetaProgreso.heroeDesbloqueado(id);
  const img = Recursos.imagen(def.sprite + 'Cuerpo');

  // EL ELEGIDO ENCENDIDO Y LOS DEMÁS APAGADOS, que es lo que pidió Sergio.
  //
  // No basta con bajarle el alfa al retrato: sobre la piedra oscura del marco,
  // una figura al 55% sigue leyéndose casi igual de brillante que al 100%, y lo
  // que se pierde es el contraste, no la atención. Lo que de verdad enciende un
  // marco es que los OTROS TRES se oscurezcan, así que cada héroe sin dueño se
  // pinta bajo su propio velo — el suyo, del ancho de su hueco, no el del arco,
  // porque mientras la tira se desliza el velo tiene que viajar con él.
  //
  // Los huecos van a 320 de distancia y miden 209: nunca se solapan, así que
  // dos velos no pueden sumarse sobre el mismo píxel.
  // El velo se levanta solo para el elegido, y solo si es SUYO: al bloqueado se
  // le deja el suyo aunque tenga el cursor encima, un punto más suave.
  if (ocupante < 0 || bloqueado) {
    ctxUi.save();
    ctxUi.fillStyle = bloqueado
      ? (ocupante >= 0 ? 'rgba(6,5,10,.38)' : VELO_BLOQUEADO)
      : VELO_LIBRE;
    // Desde `BANDA_NOMBRE` hacia abajo, igual que el velo del arco: lo que se
    // apaga es la figura, no su nombre.
    ctxUi.fillRect(r.x, r.y + BANDA_NOMBRE, r.w, r.h - BANDA_NOMBRE);
    ctxUi.restore();
  }

  if (img) {
    // APOYADO EN EL SUELO del hueco que le queda, que no es el marco entero:
    // arriba manda el nombre y abajo el cuadro del arma (ver dibujarTarjeta).
    //
    // Y CADA UNA CON SU ESTATURA. Antes se encajaba el lienzo del retrato en el
    // hueco, y eso igualaba a las ocho: el lienzo mide 340x760 para todas, así
    // que todas salían llenándolo. Con Helen —que es la más baja de las ocho—
    // puesta al lado de Sofi —la más alta— la pantalla decía lo contrario de lo
    // que dice el juego.
    //
    // Peor todavía: lo que decidía el tamaño no era la estatura, era LO ANCHA
    // que fuera cada una. El recorte encaja la figura en el lienzo por el lado
    // que se quede corto, así que a una figura ancha manda su ancho y le sobra
    // aire arriba: Sara ocupaba 680 de los 760 y salía un 10% más baja que las
    // demás sin que nadie lo hubiera decidido.
    //
    // Se arregla con los dos datos de verdad, los dos del atlas: `alto` de la
    // entrada Cuerpo dice cuánto mide la FIGURA dentro del lienzo, y el alto
    // del sprite del mundo es la estatura. La más alta llena el hueco y las
    // demás bajan en proporción.
    const hueco = r.h - BANDA_NOMBRE - BANDA_ARMA;
    const metaCuerpo = Recursos.meta(def.sprite + 'Cuerpo');
    const figura = (metaCuerpo && metaCuerpo.alto) || img.height;
    let esc = hueco * factorEstatura(def) / figura;
    // Y que no se salga por los lados. Con estas ilustraciones no llega a
    // pasar —son todas más altas que anchas— pero un dibujo futuro más ancho
    // se estrecharía solo en vez de invadir el marco de al lado.
    esc = Math.min(esc, r.w * 0.94 / img.width);
    const w = img.width * esc;
    const h = img.height * esc;
    const x = r.x + (r.w - w) / 2;
    // El lienzo del retrato trae la figura apoyada en su borde de abajo, así
    // que el borde de abajo del lienzo ES la línea del suelo.
    const y = r.y + BANDA_NOMBRE + hueco - h;

    ctxUi.save();
    ctxUi.imageSmoothingEnabled = true;
    ctxUi.imageSmoothingQuality = 'high';

    // LA LUZ VA EN LA SILUETA, NO EN EL RECUADRO.
    //
    // Antes al elegido se le sumaba un baño de color sobre todo su hueco, y eso
    // es un rectángulo de luz encima de una hornacina con el arco redondo: se
    // veía el canto recto de la luz sobre la piedra. Lo dijo Sergio y tiene
    // razón. Ahora se enciende SU FIGURA, dibujando el mismo retrato otra vez
    // en `lighter` —sumando luz— así que lo único que se aclara son los píxeles
    // que el dibujo tiene pintados: el alfa del PNG hace de máscara y no hay
    // que recortar ninguna silueta a mano.
    //
    // El halo son cuatro copias desplazadas tres píxeles, cada una a un tercio
    // de la luz. Es lo que separa "esta figura está más clara" de "esta figura
    // alumbra": sin él, un personaje de ropa oscura —Vicky, Julie— apenas se
    // encendía, porque sumar luz sobre un píxel oscuro sigue dando oscuro. El
    // halo lo pone alrededor, contra la piedra, que es donde se ve.
    // A MEDIA LUZ SI NO ES TUYO. Un héroe de pago con el cursor encima tiene que
    // verse —es donde estás mirando— pero no puede encenderse igual que uno que
    // ya es tuyo: la pantalla estaría diciendo "elegido" de algo que no se puede
    // elegir, con su propio precio pintado al lado.
    const luz = ocupante >= 0 ? (bloqueado ? 0.5 : 1) : 0;

    if (luz > 0) {
      ctxUi.globalCompositeOperation = 'lighter';
      ctxUi.globalAlpha = LUZ_HALO * luz;
      ctxUi.drawImage(img, x - HALO_PX, y, w, h);
      ctxUi.drawImage(img, x + HALO_PX, y, w, h);
      ctxUi.drawImage(img, x, y - HALO_PX, w, h);
      ctxUi.drawImage(img, x, y + HALO_PX, w, h);
      ctxUi.globalCompositeOperation = 'source-over';
    }

    ctxUi.globalAlpha = bloqueado ? (ocupante >= 0 ? 0.55 : 0.34)
                                  : (ocupante >= 0 ? 1 : 0.62);
    ctxUi.drawImage(img, x, y, w, h);

    if (luz > 0) {
      ctxUi.globalCompositeOperation = 'lighter';
      ctxUi.globalAlpha = LUZ_SILUETA * luz;
      ctxUi.drawImage(img, x, y, w, h);
    }
    ctxUi.restore();
  }



  // EL AVISO DE ARTE PRESTADA, dentro del arco y a media voz. Mientras un héroe
  // salga con el dibujo de otro (ver `provisional` en datos/personajes.js) hay
  // que decirlo donde se le mira: si no, dos arcos con la misma figura se leen
  // como un fallo del juego.
  if (def.provisional) {
    ctxUi.save();
    ctxUi.textAlign = 'center';
    ctxUi.textBaseline = 'middle';
    ctxUi.font = `600 8px ${FUENTE}`;
    ctxUi.fillStyle = t.apagado;
    ctxUi.fillText('ARTE PROVISIONAL', r.x + r.w / 2, r.y + r.h - BANDA_ARMA - 6);
    ctxUi.restore();
  }

  if (bloqueado) placaBloqueo(ctxUi, r, def.coste, t);
}

// LO QUE CUESTA, en el sitio donde se le mira. Misma cartela que la de los
// denarios de la esquina —moneda y cifra— porque es el mismo concepto: si el
// número de arriba llega al de aquí, es tuyo en dos pulsaciones.
function placaBloqueo(ctxUi, r, coste, t) {
  const cx = r.x + r.w / 2;
  const cy = r.y + BANDA_NOMBRE + (r.h - BANDA_NOMBRE - BANDA_ARMA) * 0.44;
  const cifra = String(coste);

  ctxUi.save();
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `700 14px ${FUENTE}`;
  const contenido = LADO_MONEDA + HUECO_MONEDA + ctxUi.measureText(cifra).width;
  const ancho = contenido + RELLENO_PLACA * 2;

  ctxUi.beginPath();
  ctxUi.roundRect(cx - ancho / 2, cy - ALTO_PLACA / 2, ancho, ALTO_PLACA, ALTO_PLACA / 2);
  ctxUi.fillStyle = 'rgba(10,8,12,.8)';
  ctxUi.fill();
  ctxUi.lineWidth = 1;
  ctxUi.strokeStyle = 'rgba(232,183,58,.42)';
  ctxUi.stroke();

  const xMoneda = cx - contenido / 2 + LADO_MONEDA / 2;
  const meta = Recursos.meta('monedaHud');
  const img = Recursos.imagen('monedaHud');
  if (meta && img) {
    const esc = Math.min(LADO_MONEDA / meta.w, LADO_MONEDA / meta.h);
    const w = meta.w * esc;
    const h = meta.h * esc;
    ctxUi.drawImage(img, 0, 0, meta.w, meta.h, xMoneda - w / 2, cy - h / 2, w, h);
  }

  ctxUi.textAlign = 'left';
  ctxUi.fillStyle = COLOR_ORO;
  ctxUi.fillText(cifra, xMoneda + LADO_MONEDA / 2 + HUECO_MONEDA, cy + 0.5);

  ctxUi.textAlign = 'center';
  ctxUi.font = `700 9px ${FUENTE}`;
  ctxUi.fillStyle = t.apagado;
  textoEspaciado(ctxUi, 'EN LA TIENDA', cx, cy + ALTO_PLACA / 2 + 11, 1.2);
  ctxUi.restore();
}

// Índice del puesto que tiene cogido el personaje `p`, o -1.
export function ocupantePersonaje(puestos, p) {
  for (let i = 0; i < puestos.length; i++) {
    if (puestos[i] && puestos[i].personaje === p) return i;
  }
  return -1;
}

// QUIÉN ES Y CON QUÉ PELEA, TODO DENTRO DEL MARCO.
//
// Antes esto eran dos cartelas negras colgadas FUERA: el nombre sobre la
// cornisa y el arma bajo el zócalo. Con la lámina vieja daba igual, pero la
// nueva trae coronas de calaveras encima de cada marco y coronas de laurel con
// su medallón debajo, y las dos cartelas caían justo encima de las dos cosas.
// Tapar con una caja negra lo que Sergio acaba de dibujar es competir con el
// arte y perder, que es el criterio de toda esta pantalla.
//
// Dentro no hace falta caja: el interior del marco YA es piedra oscura, así que
// basta el texto con reborde. Y el hueco da de sobra — 395 píxeles de lámina,
// unos 233 de interfaz — para el nombre arriba, el arma abajo y el retrato
// entre los dos.
//
// LA FRASE NO CABE AQUÍ, y se ha ido al pie: ver `dibujarPieHeroe`. Son cien
// caracteres en un hueco de 123 unidades de ancho, o sea seis renglones. Y
// cuatro frases a la vez tampoco eran cuatro frases: eran ruido. Abajo se lee
// la del que se está mirando, entera y de un tirón.
const BANDA_NOMBRE = 22;      // lo que se reserva arriba, dentro del marco
const BANDA_ARMA = 38;        // y abajo, para el cuadro del arma
const LADO_ARMA = 30;

// EL CARTEL DEL JUGADOR: un rectángulo de esquinas redondeadas alrededor del
// NOMBRE, y su número dentro.
//
// Antes el color del jugador era un marco que rodeaba al héroe ENTERO, de la
// cabeza a los pies, y la etiqueta "P1" iba suelta por debajo. Lo cambió
// Sergio: el recuadro se acota al nombre y se lleva el número dentro. Sale
// ganando el dibujo —un rectángulo de 230 unidades de alto alrededor de una
// ilustración es una jaula— y sale ganando la lectura, porque el color y el
// número quedan pegados al único sitio donde ya estabas mirando para saber
// quién es.
//
// CONFIRMAR ES RELLENARLO. Mientras se elige, el cartel es un contorno que
// late; al confirmar se rellena del color del jugador y deja de latir. Es la
// diferencia que hay que ver desde el otro lado del sofá sin leer nada, y ocupa
// lo mismo — que es lo que permitió quitar la palabra "LISTO" de la etiqueta y
// que quepa el nombre entero al lado del número.
const ALTO_CARTEL = 17;
const AIRE_CARTEL = 9;        // a cada lado del texto

// Lo que el cartel del nombre asoma por encima del hueco del marco, y por tanto
// lo que hay que estirar el recorte de la ventana para que no se lo coma. Sobra
// un poco a propósito: si algún día el cartel crece de alto, sigue cabiendo.
const ASOMO_NOMBRE = 14;

function dibujarTarjeta(ctxUi, r, p, ocupante, listo, t) {
  const def = PERSONAJES[ORDEN_PERSONAJES[p]];
  const arma = ARMAS[def.arma];
  const cx = r.x + r.w / 2;
  const color = ocupante >= 0 ? COLOR_JUGADOR[ocupante % COLOR_JUGADOR.length] : null;

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  // CINCO ARRIBA Y FUERA DEL SOMBREADO. El cartel colgaba dentro del hueco, a
  // cuatro del borde; ahora se apoya en ese borde y asoma por encima, que es
  // donde acaba el sombreado de la figura (ver ASOMO_NOMBRE y el velo, arriba).
  const yNombre = r.y - 1 + ALTO_CARTEL / 2;
  const nombre = def.nombre.toUpperCase();

  if (color) {
    // CON DUEÑO: número y nombre dentro del cartel.
    //
    // La letra se encoge hasta que el conjunto quepa en el marco. "P4 · OCTAVIA"
    // es el peor caso del catálogo de hoy y entra a 11; si algún día llega un
    // nombre más largo, se apretará solo en vez de desbordarse por los lados.
    const texto = `P${ocupante + 1}  ·  ${nombre}`;
    let tam = 11;
    let ancho = 0;
    while (tam >= 8) {
      ctxUi.font = `700 ${tam}px ${FUENTE_TITULO}`;
      ancho = ctxUi.measureText(texto).width;
      if (ancho + AIRE_CARTEL * 2 <= r.w - 6) break;
      tam -= 0.5;
    }
    const anchoCartel = Math.min(r.w - 6, ancho + AIRE_CARTEL * 2);

    ctxUi.beginPath();
    ctxUi.roundRect(cx - anchoCartel / 2, yNombre - ALTO_CARTEL / 2,
                    anchoCartel, ALTO_CARTEL, ALTO_CARTEL / 2);
    if (listo) {
      ctxUi.fillStyle = color;
      ctxUi.fill();
    } else {
      ctxUi.fillStyle = 'rgba(6,5,10,.78)';
      ctxUi.fill();
      ctxUi.globalAlpha = latido(900, 0.45);
    }
    ctxUi.lineWidth = listo ? 1.6 : 1.4;
    ctxUi.strokeStyle = listo ? 'rgba(255,255,255,.55)' : color;
    ctxUi.stroke();
    ctxUi.globalAlpha = 1;

    // Y EL FILO ENCENDIDO, del color del jugador y sumando luz. Es la misma luz
    // que lleva la silueta, puesta en el borde para que el cartel pertenezca al
    // mismo foco: el nombre, el número y el arma son lo que Sergio pidió que se
    // iluminara, y los tres se encienden igual.
    ctxUi.save();
    ctxUi.globalCompositeOperation = 'lighter';
    ctxUi.globalAlpha = LUZ_FILO;
    ctxUi.lineWidth = 2.4;
    ctxUi.strokeStyle = color;
    ctxUi.stroke();
    ctxUi.restore();

    // Relleno claro sobre el color, oscuro cuando el color es el relleno: en
    // los dos casos el que manda es el contraste, no el color del jugador.
    ctxUi.fillStyle = listo ? '#0b0a10' : color;
    ctxUi.fillText(texto, cx, yNombre + 0.5);
  } else {
    // SIN DUEÑO: el nombre solo, con reborde y a media luz. Apagado como el
    // retrato que hay debajo — es el mismo héroe, y encender su nombre mientras
    // su figura está en penumbra contaría dos cosas distintas.
    ctxUi.font = `700 12px ${FUENTE_TITULO}`;
    const espaciado = 1.5;
    let ancho = -espaciado;
    for (const c of nombre) ancho += ctxUi.measureText(c).width + espaciado;
    let x = cx - ancho / 2;
    ctxUi.globalAlpha = 0.72;
    // `textoEspaciado` no acepta reborde, así que el espaciado se hace a mano
    // aquí: se mide el conjunto y se pinta letra a letra, cada una con su borde.
    for (const c of nombre) {
      const w = ctxUi.measureText(c).width;
      textoBorde(ctxUi, c, x + w / 2, yNombre, t.titulo, 3);
      x += w + espaciado;
    }
    ctxUi.globalAlpha = 1;
  }

  // EL ARMA, abajo: su dibujo sobre el mismo cuadro blanco que en la ficha y en
  // el menú de subida de nivel. Sin el nombre escrito al lado —no cabe sin
  // pisar al personaje— porque el del héroe que se está mirando ya sale en el
  // pie, con su frase.
  if (arma) {
    const yArma = r.y + r.h - BANDA_ARMA + 3;
    // El de un héroe apagado se apaga con él: es un cuadro BLANCO sobre piedra
    // oscura, o sea lo más brillante del marco, y a plena luz los cuatro se
    // leían como cuatro faroles en fila.
    ctxUi.globalAlpha = ocupante >= 0 ? 1 : 0.72;
    ctxUi.beginPath();
    ctxUi.roundRect(cx - LADO_ARMA / 2, yArma, LADO_ARMA, LADO_ARMA, 4);
    ctxUi.fillStyle = 'rgba(255,255,255,.92)';
    ctxUi.fill();
    ctxUi.lineWidth = 1;
    ctxUi.strokeStyle = color || 'rgba(255,255,255,.28)';
    ctxUi.stroke();
    // 13 de radio, por encima del umbral de la hoja grande (ver blitHoja en
    // ui/hud.js): por debajo saldría de la hoja de 32 ampliada y con el canto
    // roto, que es lo que se veía en el menú de subida de nivel.
    dibujarIconoArma(ctxUi, cx, yArma + LADO_ARMA / 2, 13, def.arma, arma.color);
    ctxUi.globalAlpha = 1;

    // El mismo filo encendido que el cartel del nombre. No se toca el relleno
    // blanco: sumarle luz a un blanco no lo enciende, lo revienta y se lleva por
    // delante el dibujo del arma, que es justo lo que hay que poder reconocer.
    if (color) {
      ctxUi.save();
      ctxUi.globalCompositeOperation = 'lighter';
      ctxUi.globalAlpha = LUZ_FILO;
      ctxUi.lineWidth = 2.4;
      ctxUi.strokeStyle = color;
      ctxUi.stroke();
      ctxUi.restore();
    }
  }

  ctxUi.restore();
}

// EL PIE DEL HÉROE QUE SE ESTÁ MIRANDO: su arma con nombre y su frase.
//
// Uno solo y no cuatro. Es el que tiene el foco del carrusel —el último que ha
// movido alguien, ver `encuadrar`—, que es exactamente el que se está mirando.
function dibujarPieHeroe(ctxUi, foco, y, t) {
  const id = ORDEN_PERSONAJES[foco];
  if (!id) return;
  const def = PERSONAJES[id];
  const arma = ARMAS[def.arma];

  ctxUi.save();
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';

  // ENTRECOMILLADA. Es lo que el personaje DICE, no una descripción escrita por
  // el juego —"Coraje y Corazón" es el lema de Eric, no una etiqueta que le
  // hayamos puesto—, y las comillas son lo que separa una cosa de la otra sin
  // gastar una línea en explicarlo. Se añaden aquí y no en datos/personajes.js:
  // los datos guardan la frase, y cómo se puntúa al pintarla es de quien pinta.
  //
  // Se encoge hasta que quepa en una línea, sin partirla: aquí hay 900 unidades
  // de ancho y la frase más larga son cien caracteres, así que no baja de 10.
  const frase = `“${def.descripcion}”`;
  let tam = 12;
  while (tam > 8) {
    ctxUi.font = `500 ${tam}px ${FUENTE}`;
    if (ctxUi.measureText(frase).width <= ANCHO_UI - 120) break;
    tam -= 0.5;
  }
  textoBorde(ctxUi, frase, ANCHO_UI / 2, y, t.texto, 3.5);

  if (arma) {
    ctxUi.font = `700 10px ${FUENTE}`;
    textoBorde(ctxUi, arma.nombre.toUpperCase(), ANCHO_UI / 2, y - 15, t.apagado, 3);
  }
  ctxUi.restore();
}

// --- Elección de mascota ------------------------------------------------------
//
// Va DESPUÉS de elegir personaje y solo si hay alguna comprada. Cada jugador
// elige por turnos, y no se puede repetir: main.js ya filtra las que lleva otro
// (ver mascotasDisponibles), así que aquí solo llegan las que este puede coger.
//
// Sin ilustración propia: se reutiliza el fondo de la selección de personaje,
// oscurecido. Son el mismo momento —montar la partida— y cambiar de decorado
// entre dos pasos seguidos se lee como haber salido a otro sitio.
const CARTA_MASCOTA = 84;
const HUECO_MASCOTA = 10;

function dibujarMascotas(ctxMundo, ctxUi, disponibles, cursor, turno, puestos, elegidas) {
  const img = Imagenes.seleccion;
  const e = cubrir(img || { width: ANCHO_UI, height: ALTO_UI }, 0.5);
  fondo(ctxMundo, img, e);

  const t = Tema.actual;
  ctxUi.save();
  ctxUi.fillStyle = 'rgba(6,5,10,.72)';
  ctxUi.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  dibujarOro(ctxUi);
  dibujarUsuarioGithub(ctxUi);

  // Cabecera: de quién es el turno. En cooperativo es lo primero que hay que
  // saber, porque los cuatro miran la misma pantalla.
  const color = COLOR_JUGADOR[turno % COLOR_JUGADOR.length];
  const def = puestos[turno] ? PERSONAJES[ORDEN_PERSONAJES[puestos[turno].personaje]] : null;
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'middle';
  ctxUi.font = `26px ${FUENTE_TITULO}`;
  ctxUi.fillStyle = t.titulo;
  textoEspaciado(ctxUi, 'ELIGE TU MASCOTA', ANCHO_UI / 2, 84, 4);

  ctxUi.font = `600 13px ${FUENTE}`;
  ctxUi.fillStyle = color;
  ctxUi.fillText(`P${turno + 1}${def ? '  ·  ' + def.nombre : ''}`, ANCHO_UI / 2, 110);

  // Una carta por mascota disponible, más una final de "ninguna".
  const n = disponibles.length + 1;
  const anchoTotal = n * CARTA_MASCOTA + (n - 1) * HUECO_MASCOTA;
  const x0 = (ANCHO_UI - anchoTotal) / 2;
  const yCarta = 150;

  for (let i = 0; i < n; i++) {
    const x = x0 + i * (CARTA_MASCOTA + HUECO_MASCOTA);
    const elegida = i === cursor;
    const id = i < disponibles.length ? disponibles[i] : '';
    const dm = id ? MASCOTAS[id] : null;
    const nivel = id ? MetaProgreso.nivelMascota(id) : 0;

    ctxUi.beginPath();
    ctxUi.roundRect(x, yCarta, CARTA_MASCOTA, CARTA_MASCOTA + 30, 6);
    ctxUi.fillStyle = elegida ? 'rgba(40,44,52,.95)' : 'rgba(16,16,20,.8)';
    ctxUi.fill();
    ctxUi.lineWidth = elegida ? 2.2 : 1;
    ctxUi.strokeStyle = elegida ? color : 'rgba(238,240,243,.16)';
    ctxUi.stroke();

    if (dm) {
      // El RETRATO del bicho (`mascota<Id>Ficha`), no el sprite que corre por el
      // mundo: aquí no hace falta animar, hace falta reconocerlo. Y el sprite
      // del mundo mide once unidades de alto, así que meterlo en un hueco de 52
      // era AMPLIARLO por 1,18 —un factor roto— y el pixel art salía con filas
      // dobladas sí y no. El retrato viene a 160 y siempre se reduce.
      const idAtlas = 'mascota' + id.charAt(0).toUpperCase() + id.slice(1) + 'Ficha';
      const meta = Recursos.meta(idAtlas);
      const imgM = Recursos.imagen(idAtlas);
      if (meta && imgM) {
        const esc = Math.min((CARTA_MASCOTA - 12) / meta.w, 52 / meta.h);
        const w = meta.w * esc, h = meta.h * esc;
        ctxUi.drawImage(imgM, 0, 0, meta.w, meta.h,
                        x + (CARTA_MASCOTA - w) / 2, yCarta + 12 + (52 - h) / 2, w, h);
      }
      ctxUi.font = `600 9px ${FUENTE}`;
      ctxUi.fillStyle = elegida ? '#ffffff' : t.texto;
      ctxUi.fillText(dm.corto, x + CARTA_MASCOTA / 2, yCarta + 78);

      // Nivel en puntos: se lee de un vistazo cuánto le queda por mejorar.
      for (let k = 0; k < MAX_NIVEL_MASCOTA; k++) {
        ctxUi.beginPath();
        ctxUi.arc(x + CARTA_MASCOTA / 2 + (k - 2) * 8, yCarta + 96, 2.4, 0, Math.PI * 2);
        ctxUi.fillStyle = k < nivel ? t.filo : 'rgba(255,255,255,.15)';
        ctxUi.fill();
      }
    } else {
      ctxUi.font = `600 11px ${FUENTE}`;
      ctxUi.fillStyle = elegida ? '#ffffff' : t.apagado;
      ctxUi.fillText('SIN', x + CARTA_MASCOTA / 2, yCarta + 44);
      ctxUi.fillText('MASCOTA', x + CARTA_MASCOTA / 2, yCarta + 58);
    }
  }

  // Descripción de la señalada, debajo. Solo la de una: la lista se lee
  // recorriéndola, no leyendo ocho párrafos a la vez.
  const idSel = cursor < disponibles.length ? disponibles[cursor] : '';
  ctxUi.font = `400 11px ${FUENTE}`;
  ctxUi.fillStyle = t.texto;
  ctxUi.fillText(idSel ? MASCOTAS[idSel].descripcion : 'Jugarás sin mascota.',
                 ANCHO_UI / 2, yCarta + CARTA_MASCOTA + 62);

  // Lo ya elegido por los demás, para que nadie tenga que preguntar cuál se ha
  // llevado el otro.
  const yaElegidas = [];
  for (let i = 0; i < elegidas.length; i++) {
    if (i !== turno && elegidas[i]) {
      yaElegidas.push(`P${i + 1}: ${MASCOTAS[elegidas[i]].corto}`);
    }
  }
  if (yaElegidas.length) {
    ctxUi.font = `500 10px ${FUENTE}`;
    ctxUi.fillStyle = t.apagado;
    ctxUi.fillText(yaElegidas.join('     '), ANCHO_UI / 2, yCarta + CARTA_MASCOTA + 84);
  }

  ctxUi.restore();
}

