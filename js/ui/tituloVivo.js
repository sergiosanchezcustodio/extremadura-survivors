import { ANCHO_FISICO, ALTO_FISICO, ANCHO_UI } from '../core/constantes.js';
import { crearRng } from '../core/rng.js';

// LA PANTALLA DE TÍTULO: el fondo horneado y el fuego de las antorchas.
//
// La ilustración de Sergio es UNA SOLA IMAGEN PLANA Y OPACA: cielo, luna,
// nubes, ruinas, las dos estatuas, el estandarte, las antorchas y el logo están
// horneados en el mismo píxel. No hay capas ni alfa, así que aquí NO se puede
// mover un elemento por separado — lo que se dibuja se pinta ENCIMA, sumando
// luz, que es lo único que una imagen plana admite sin delatarse.
//
// LO QUE HUBO Y YA NO ESTÁ. Esta pantalla llegó a tener siete efectos:
// estrellas titilando, nubes cruzando el cielo, halo en la luna, un destello en
// los ojos de las estatuas, un reflejo recorriendo el logo, un relámpago lejano
// y el fuego. Sergio los quitó todos menos el fuego, y tenía razón: una
// pantalla de menú no es una postal animada, es el sitio donde se elige una
// opción, y siete cosas moviéndose a la vez le disputaban la atención a lo
// único que importa ahí, que es qué está señalado.
//
// Del mismo criterio salió antes quitar la deriva —un paneo lentísimo de la
// imagen entera— que además se leía como un tic, porque al desplazarse tan
// despacio y con saltos de un píxel entero la escena daba tirones en vez de
// moverse.
//
// Queda el fuego porque una antorcha apagada en una escena nocturna no se lee
// como quietud: se lee como que falta algo.
//
// EL FONDO SE HORNEA UNA VEZ. Antes se rehacía el blit de la ilustración a
// 1920x1080
// —con `imageSmoothingQuality = 'high'`— en CADA fotograma, para una imagen que
// no cambia nunca. Es justo lo que hundió los fps cuando el arte del mundo se
// escalaba por fotograma: aquí se escala una sola vez a un lienzo aparte y
// después cada fotograma es una copia 1:1, que es lo que el navegador hace
// rápido. Eso sigue mereciendo la pena aunque ahora encima solo vaya el fuego.
//
// CÓMO SE ENCAJA, que depende de lo que mida la ilustración.
//
// La de ahora es 1360x768 —proporción 1,7708 contra el 1,7778 de la pantalla—
// así que sobra por lo alto: `cubrir` se come un par de filas arriba y abajo.
// Sin deformar y sin bandas.
//
// Las anteriores fueron 1376x768 (1,792) y 1672x941 (1,7768), que sobraban por
// el otro lado. Da igual cuál de las tres: `cubrir` resuelve todos los casos y
// en ninguno se pierde nada que importe.
//
// Pero eso no siempre fue verdad. Una ilustración anterior era 3:2, y cubrir
// con ella se comía 130 filas: las cuatro opciones van pintadas abajo, y el
// recorte dejaba SALIR fuera de la pantalla y CONFIGURACIÓN partida. Ese caso
// se resuelve al revés, encajando la imagen ENTERA a lo alto y rellenando las
// franjas de los lados con la propia imagen apagada por detrás.
//
// De ahí que estén los dos caminos y un umbral que elige. No es generalidad
// especulativa: ya se rompió una vez, y el sintoma —una opcion del menu que no
// se ve— no aparece hasta que alguien baja hasta ella.

// Píxeles del lienzo del mundo por unidad de interfaz.
const K = ANCHO_FISICO / ANCHO_UI;

// Cuánto puede desviarse la proporción de la ilustración de la de la pantalla
// antes de dejar de recortarla. Un 5% sobre 16:9 admite desde 1,69 hasta 1,87,
// que cubre cualquier "casi 16:9" razonable y deja fuera un 3:2 (1,50), que es
// justo el caso que hay que tratar de otra manera.
const TOLERANCIA_ENCAJE = 0.05;

// EL ANCHO SOBRE EL QUE SE TOMARON TODAS LAS MEDIDAS de esta lámina: las
// antorchas de aquí abajo y las cinco opciones del menú de ui/pantallas.js.
//
// Existe porque esto se rompió tres veces. Cada vez que Sergio reexportaba la
// lámina a otro tamaño —1376x768, 1672x941, 1360x768— todos esos números, que
// son píxeles de la imagen, dejaban de valer a la vez. Y no saltaba ningún
// error: el recuadro de luz del menú caía donde no hay palabra, y el fuego
// ardía a un palmo de la antorcha. Había que acordarse de volver a medirlo
// todo, y acordarse no es un mecanismo.
//
// Ahora los números se declaran una vez sobre ESTE ancho y se escalan solos con
// lo que mida la lámina que llegue: es `hornear` quien lo aplica, plegándolo en
// la escala del encaje, así que ni estas constantes ni las de pantallas.js se
// enteran. La lámina de hoy mide 1920 —se hornea reducida desde los 2720 de
// resources/— y estos números se midieron sobre la de 1360.
//
// LO QUE SÍ SIGUE OBLIGANDO A MEDIR es que cambie el ENCUADRE: si la placa o
// las antorchas se mueven dentro del dibujo, ningún factor lo arregla.
const ANCHO_MEDIDO = 1360;

// CENTRO DE LA LLAMA DE CADA ANTORCHA, en píxeles de la ilustración de
// referencia (ver ANCHO_MEDIDO), como el resto de medidas de pantallas.js.
//
// No van a ojo: salen de barrer la imagen buscando naranja muy claro (r>215,
// b<110) por debajo del logo y agrupar por celdas de 50 píxeles. Los dos grupos
// salieron limpios, cada uno repartido entre dos o tres celdas contiguas a lo
// alto —una llama mide más de cincuenta píxeles—, así que se promedian por su
// peso.
//
// SE VUELVEN A MEDIR CADA VEZ QUE CAMBIE LA LÁMINA, igual que las opciones del
// menú: son píxeles de la imagen. Y sirven además de comprobación de que la
// lámina nueva es la misma escena y no otra composición: con la de 1376x768
// caían en (358,550) y (970,554), y con esta de 1360x768 caen en (355,550) y
// (975,554) — tres píxeles. Por el camino, la de 1672x941 las puso en (442,667)
// y (1193,675), que son esos mismos escalados por 1,215.
// Son ANTORCHAS, no los pebeteros de la ilustración anterior: la llama es
// bastante más pequeña, así que el resplandor y las pavesas se han encogido con
// ella. Con los números de los pebeteros, el halo se comía media estatua.
const NUM_BRASAS = 30;

// Azar de DECORADO, con su propia semilla fija. No toca el RNG de la partida ni
// lo pretende: aquí no hay simulación que reproducir, y lo que se sortea —el
// vaivén de una pavesa, lo que tarda en apagarse— se sortea una sola vez al
// cargar, no durante ningún fotograma.
const rng = crearRng(20250824);

// DOS LÁMINAS, no una: el título y la PORTADA de la intro. Son la misma escena
// —la portada es el título sin la lápida del menú— y por eso comparten las
// antorchas de arriba: medidas sobre las dos, caen en el mismo píxel.
//
// Cada una guarda su horneado, y el reloj y las pavesas son comunes: son el
// mismo fuego visto en dos pantallas seguidas, y darle a cada una sus brasas
// haría que al pasar de la portada al menú el fuego diera un salto.
const laminas = {};

const estado = {
  t: 0,
  brasas: []
};

export const TituloVivo = {
  listo(nombre) { return !!laminas[nombre]; },

  // Se llama una vez por lámina, al cargar la ilustración. Ya no recibe ancla:
  // desde que se encaja entera en vez de recortarla, no hay nada que anclar.
  // `opciones`:
  //   modo         'auto' (por defecto), 'cubrir' o 'entera'. Ver abajo.
  //   anchoMedido  el ancho sobre el que están tomadas las medidas de quien
  //                consuma `encaje()`. Por defecto, el de la lámina del título.
  //   calavera     si esta lámina lleva la calavera del rótulo. Es lo único
  //                que sigue yendo a mano, porque es un sitio concreto de UNA
  //                ilustración y no una cosa que se pueda reconocer sola.
  hornear(nombre, img, opciones) {
    if (!img) return;
    const o = opciones || {};
    const W = ANCHO_FISICO;
    const H = ALTO_FISICO;

    const lienzo = document.createElement('canvas');
    lienzo.width = W;
    lienzo.height = H;
    const c = lienzo.getContext('2d');

    // Con suavizado: la ilustración no encaja en la pantalla por un múltiplo
    // entero, y a vecino más próximo las letras del logo salen con filas de
    // píxeles dobladas sí y no. La diferencia con antes es que ahora esto pasa
    // UNA vez y no sesenta veces por segundo.
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';

    const suya = img.width / img.height;
    const pantalla = W / H;

    // EL MODO puede venir impuesto, y hace falta que se pueda: la tolerancia de
    // abajo es una regla razonable para elegir sola, pero deja a la pantalla de
    // selección justo del lado malo —1920x1024 se desvía un 5,5%— y esa lámina
    // SÍ se quiere recortada, porque sus cuatro marcos están pintados en el
    // centro y lo que sobra por los lados es suelo. Adivinar bien en cuatro
    // casos de cinco no vale cuando el quinto sale con telón sin que nadie lo
    // pida.
    const modo = o.modo || 'auto';
    const cubrir = modo === 'cubrir' ||
      (modo === 'auto' && Math.abs(suya - pantalla) / pantalla <= TOLERANCIA_ENCAJE);

    let esc, ox, oy;
    if (cubrir) {
      // CUBRIR: llena la pantalla y lo que sobra se recorta. Con la ilustración
      // de ahora eso son siete píxeles y medio por lado, de puro escenario.
      esc = Math.max(W / img.width, H / img.height);
      ox = (W - img.width * esc) / 2;
      oy = (H - img.height * esc) / 2;
      c.drawImage(img, ox, oy, img.width * esc, img.height * esc);
    } else {
      // ENCAJAR ENTERA, con telón: la imagen no se parece a la pantalla y
      // recortarla se llevaría por delante parte del dibujo.
      c.drawImage(img, 0, 0, W, H);
      c.fillStyle = 'rgba(5,5,12,0.72)';
      c.fillRect(0, 0, W, H);
      esc = Math.min(W / img.width, H / img.height);
      ox = (W - img.width * esc) / 2;
      oy = (H - img.height * esc) / 2;
      c.drawImage(img, ox, oy, img.width * esc, img.height * esc);
    }

    // `esc` sale en píxeles de lienzo por píxel DE LA IMAGEN QUE HA LLEGADO, y
    // las medidas están en píxeles de la lámina de referencia. Multiplicando
    // aquí por la proporción entre las dos, `esc` pasa a ser "píxeles de lienzo
    // por unidad medida" y todo lo demás —mx/my, el encaje que consume
    // pantallas.js— sigue igual sin saber que esto existe.
    const k = img.width / (o.anchoMedido || ANCHO_MEDIDO);

    // LA LÁMINA SE LEE UNA SOLA VEZ y de ahí salen los cuatro reconocimientos.
    // Leer un lienzo no es gratis —y el navegador avisa por consola en cuanto se
    // hace dos veces seguidas sobre el mismo—, así que la lectura va aquí y lo
    // que baja a cada buscador son los datos, no la orden de volver a leer.
    const pix = leerLamina(c, W, H);
    laminas[nombre] = {
      lienzo, esc: esc * k, ox, oy,
      estrellas: buscarEstrellas(pix),
      cielo: mascaraCielo(pix),
      antorchas: buscarAntorchas(pix),
      luna: buscarLuna(pix),
      calavera: !!o.calavera
    };

    prepararBrasas();
  },

  // El lienzo ya horneado de una lámina. Lo pide quien todavía la dibuja por su
  // cuenta, como la placa de la historia de nivel cuando el nivel trae la suya.
  lienzo(nombre) {
    const l = laminas[nombre];
    return l ? l.lienzo : null;
  },

  // Adelanta el reloj. Hay que llamarlo ANTES que `efectos`: el resplandor de
  // una antorcha y sus pavesas tienen que leer el mismo instante, y si cada uno
  // pidiera su propio `performance.now()` irían por su lado.
  avanzar() {
    estado.t = performance.now();
  },

  // El encaje de la ilustración en UNIDADES DE INTERFAZ. Lo consume
  // pantallas.js para colocar el recuadro de la opción señalada sobre la
  // lápida. Es fijo, pero sigue saliendo de aquí y no de un `cubrir` aparte:
  // dos sitios calculando el mismo encaje es la forma segura de que un día
  // dejen de coincidir.
  encaje(nombre) {
    const l = laminas[nombre];
    if (!l) return { esc: 1 / K, x: 0, y: 0 };
    return { esc: l.esc / K, x: l.ox / K, y: l.oy / K };
  },

  // El fondo, en copia 1:1.
  fondo(ctxMundo, nombre) {
    const l = laminas[nombre];
    if (!l) return;
    ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
    ctxMundo.imageSmoothingEnabled = false;
    ctxMundo.drawImage(l.lienzo, 0, 0);
  },

  // El fuego. Va DESPUÉS del fondo y ANTES de la capa de interfaz.
  efectos(ctxMundo, nombre) {
    const l = laminas[nombre];
    if (!l) return;
    ctxMundo.setTransform(1, 0, 0, 1, 0, 0);
    ctxMundo.save();
    ctxMundo.globalCompositeOperation = 'lighter';
    // De lo ancho a lo fino: el velo baña el cielo entero, la luna es un disco,
    // las estrellas son puntos. Al revés, el velo pasaría por encima de ellas y
    // las emborronaría justo cuando destellan.
    velo(ctxMundo, estado.t, l);
    luna(ctxMundo, estado.t, l);
    estrellas(ctxMundo, estado.t, l);
    if (l.calavera) calavera(ctxMundo, estado.t, l);
    antorchas(ctxMundo, estado.t, l);
    ctxMundo.restore();
  }
};

// Imagen -> lienzo del mundo, con el encaje de la lámina que se esté pintando.
function mx(l, ix) { return l.ox + ix * l.esc; }
function my(l, iy) { return l.oy + iy * l.esc; }

// --- Estrellas ---------------------------------------------------------------
//
// El cielo estaba QUIETO, y en una pantalla que además espera pulsación sin
// reloj —la portada— eso hacía que la ilustración pareciese una foto. Ahora
// titila, y es lo único que se mueve arriba: no se mueve ni una nube ni se
// desplaza nada, solo se SUMA luz sobre las estrellas que ya pintó Sergio, que
// es lo mismo que hacen las antorchas y por el mismo motivo —sumar luz no
// obliga a tener el objeto separado del fondo—.
//
// NO VAN MEDIDAS A MANO, como sí lo están las antorchas. Se buscan solas en la
// lámina ya horneada, y eso es deliberado: son doscientas y pico, y una tabla
// de doscientas coordenadas sería justo la clase de cosa que se queda vieja el
// día que Sergio repinte el cielo, sin que salte ningún error. Repintando, las
// nuevas se encuentran solas.
//
// QUÉ CUENTA COMO ESTRELLA: un punto CLARO, FRÍO y AISLADO sobre fondo oscuro.
//
//   - Claro y frío (azul >= rojo) deja fuera las antorchas, el oro del rótulo y
//     las ventanas encendidas de la ciudad.
//   - Aislado —máximo local— deja fuera la luna, que es clara pero ancha: sus
//     píxeles del centro tienen vecinos igual de claros. Es lo que se quiere:
//     una luna que parpadea no es una luna.
//   - Y con el vecindario oscuro, que es lo que hace que no haya que decirle
//     dónde está el cielo ni dónde la piedra.
const ESTRELLA_BRILLO = 150;      // lo clara que tiene que ser
const ESTRELLA_FONDO = 62;        // lo oscuro que tiene que estar alrededor
const ESTRELLA_RADIO = 5;         // medio lado del vecindario que se mira

// Solo la franja de ARRIBA. Por debajo empiezan las ruinas, la ciudad y el
// rótulo, y ahí hay reflejos que cumplen las tres condiciones sin ser estrellas
// —chispas en la hierba, un brillo en el filo de la espada—. Medido sobre la
// lámina de hoy: de las 224 que encuentra en toda la imagen, 205 están aquí
// arriba y las 19 de abajo son suelo.
const ESTRELLA_CIELO = 0.40;

// Tope de seguridad. Con la lámina de hoy salen 205, pero un repintado con más
// grano podría disparar el número, y esto se dibuja en cada fotograma: si
// aparecen más, se quedan las más claras.
const ESTRELLA_MAX = 400;

// Lo que tarda una en ir y volver. Cada una coge el suyo dentro de este margen
// y además arranca por un punto distinto del ciclo, que es lo que impide que el
// cielo entero lata a la vez —eso no parece un cielo, parece un fallo—.
const ESTRELLA_CICLO_MIN = 1400;
const ESTRELLA_CICLO_MAX = 4200;

// Cuántas sacan halo además del punto. Ver dónde se reparte, más abajo.
const ESTRELLA_DESTACADAS = 1 / 6;

// El horneado entero, crudo. Lo piden los cuatro reconocimientos —estrellas,
// máscara del velo, antorchas y luna— y por eso se lee aparte en vez de dentro
// de cada uno.
//
// Si el lienzo no se puede leer se devuelve null y lo que se pierde es el cielo
// vivo, nada más. Pasa cuando el navegador lo da por contaminado por haberse
// dibujado en él una imagen de otro origen. Hoy no ocurre en ninguna de las dos
// formas de jugar —servido por http, mismo origen; y empaquetado, porque el
// manifiesto de NW.js ya arranca con `--allow-file-access-from-files`— pero el
// guarda se queda: es una línea, y sin ella lo que se cae no es el cielo, es la
// pantalla entera con una excepción.
function leerLamina(ctx, W, H) {
  try {
    return {
      datos: ctx.getImageData(0, 0, W, H).data,
      W, H,
      // Hasta dónde llega el cielo. Lo usan las estrellas, la máscara del velo
      // y la luna; las antorchas miran la lámina entera, que es donde están.
      alto: Math.floor(H * ESTRELLA_CIELO)
    };
  } catch {
    return null;
  }
}

// Busca las estrellas en el lienzo YA HORNEADO, una sola vez por lámina.
//
// Sobre el horneado y no sobre la imagen original a propósito: así las
// coordenadas ya son píxeles del lienzo del mundo y no hay que convertir nada
// al dibujarlas, y el resultado se adapta solo a cualquier tamaño de lámina.
//
// EN DOS PASADAS, porque la ingenua no vale: mirar el vecindario de cada píxel
// del cielo son cien millones de comparaciones y se notarían en la carga. La
// primera pasada es una criba tonta y rapidísima —claro y frío— que deja unos
// pocos miles; solo a esos se les mira alrededor.
//
function buscarEstrellas(cielo) {
  if (!cielo) return [];        // lienzo no legible: cielo quieto y a otra cosa
  const { datos, W, alto } = cielo;

  const lum = new Uint8Array(W * alto);
  const candidatos = [];
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const o = i * 4;
      const r = datos[o], g = datos[o + 1], b = datos[o + 2];
      const l = (r * 299 + g * 587 + b * 114) / 1000;
      lum[i] = l;
      if (l >= ESTRELLA_BRILLO && b >= r) candidatos.push(i);
    }
  }

  const hallazgos = [];
  for (let c = 0; c < candidatos.length; c++) {
    const i = candidatos[c];
    const x = i % W, y = (i / W) | 0;
    if (x < ESTRELLA_RADIO || y < ESTRELLA_RADIO ||
        x >= W - ESTRELLA_RADIO || y >= alto - ESTRELLA_RADIO) continue;
    const mio = lum[i];
    let suma = 0, n = 0, esMaximo = true;
    for (let dy = -ESTRELLA_RADIO; dy <= ESTRELLA_RADIO && esMaximo; dy++) {
      for (let dx = -ESTRELLA_RADIO; dx <= ESTRELLA_RADIO; dx++) {
        if (dx === 0 && dy === 0) continue;
        const v = lum[(y + dy) * W + (x + dx)];
        if (v > mio) { esMaximo = false; break; }
        suma += v; n++;
      }
    }
    if (!esMaximo || suma / n > ESTRELLA_FONDO) continue;
    hallazgos.push({ x, y, brillo: mio });
  }

  // Las más claras primero, por si hay que recortar por el tope.
  hallazgos.sort((a, b) => b.brillo - a.brillo);
  hallazgos.length = Math.min(hallazgos.length, ESTRELLA_MAX);

  // Y a cada una su ritmo. Con el RNG de decorado, que tiene semilla fija: el
  // cielo titila igual en dos partidas, como el resto de esta pantalla.
  for (let i = 0; i < hallazgos.length; i++) {
    const e = hallazgos[i];
    e.fase = rng();
    e.periodo = ESTRELLA_CICLO_MIN + rng() * (ESTRELLA_CICLO_MAX - ESTRELLA_CICLO_MIN);
    // Las más claras destellan más, que es lo que da profundidad al cielo: si
    // todas suben lo mismo, se ve una rejilla de puntos y no un firmamento.
    e.fuerza = 0.45 + 0.55 * Math.min(1, (e.brillo - ESTRELLA_BRILLO) / 90);
    // Y las muy claras ocupan un píxel más al destellar.
    e.lado = e.brillo > 215 ? 3 : 2;
    // UNA DE CADA SEIS DESTACA. No es que brille más fuerte —eso ya lo decide su
    // brillo pintado—, es que además saca HALO: un disco de luz blanda alrededor
    // del punto. Es lo que hace que el cielo tenga unas cuantas estrellas de las
    // que se miran y doscientas de fondo, en vez de doscientas iguales.
    //
    // Y las destacadas van MÁS LENTAS, con el ciclo estirado a la mitad más: una
    // estrella grande que parpadea rápido parece un piloto, no una estrella.
    e.destacada = rng() < ESTRELLA_DESTACADAS;
    if (e.destacada) e.periodo *= 1.5;
  }
  return hallazgos;
}

// Lo que mide el halo de una destacada, en píxeles del lienzo.
const ESTRELLA_HALO = 7;

// --- Reconocer antorchas y luna ----------------------------------------------
//
// Las dos ESTABAN MEDIDAS A MANO, y las dos eran números de la lámina del
// título y solo de ella. Al entrar el splash, la placa de la historia y la
// pantalla de héroes —que también tienen luna, estrellas y antorchas— había que
// elegir: tres tablas más de coordenadas, o reconocerlas.
//
// Se reconocen, por lo mismo que las estrellas: una tabla por lámina es una
// tabla que se queda vieja el día que se repinte, sin que salte ningún error.
// Y el método no es nuevo: es EXACTAMENTE el que se usó a mano para sacar los
// números que había, así que en la lámina del título devuelve los mismos.
//
// Las coordenadas que salen son PÍXELES DEL LIENZO, no de la lámina medida: se
// leen del horneado, que ya está a tamaño de pantalla. Por eso lo que se dibuja
// sobre ellas no pasa por mx/my y sus tamaños van en píxeles de lienzo.

// UNA ANTORCHA es naranja MUY claro. El umbral es alto a propósito: la piedra
// iluminada por la llama también tira a naranja, y lo que se busca es el
// corazón del fuego, no su luz.
const FUEGO_ROJO = 215;
const FUEGO_AZUL = 110;

// Se agrupa por celdas porque una llama ocupa decenas de píxeles y no hace
// falta una por píxel. Cincuenta es más pequeño que la separación entre dos
// antorchas de cualquiera de estas láminas y más grande que una chispa suelta.
const FUEGO_CELDA = 50;

// Cuántos píxeles de fuego tiene que tener una celda para contar. Por debajo es
// un reflejo en un casco o el filo de una espada cogiendo la luz.
const FUEGO_MINIMO = 60;

// Y cuánto puede separarse una celda de otra para ser la misma llama. Una llama
// alta cae en dos celdas contiguas a lo alto, y si no se juntan salen dos
// antorchas donde hay una, la de arriba flotando.
const FUEGO_JUNTAR = 70;

function buscarAntorchas(pix) {
  if (!pix) return [];
  const { datos, W, H } = pix;
  const cw = Math.ceil(W / FUEGO_CELDA);
  const celdas = new Map();

  // DE DOS EN DOS. Una llama mide decenas de píxeles, así que mirar uno de cada
  // cuatro la encuentra igual y cuesta la cuarta parte — y esto se hace sobre
  // la lámina ENTERA, que es cuatro veces lo que miran las estrellas.
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      const o = (y * W + x) * 4;
      if (datos[o] < FUEGO_ROJO || datos[o + 2] > FUEGO_AZUL) continue;
      const k = ((y / FUEGO_CELDA) | 0) * cw + ((x / FUEGO_CELDA) | 0);
      let c = celdas.get(k);
      if (!c) { c = { n: 0, sx: 0, sy: 0 }; celdas.set(k, c); }
      c.n++; c.sx += x; c.sy += y;
    }
  }

  // Celdas con fuego de verdad, de la más encendida a la menos.
  const vivas = [];
  for (const c of celdas.values()) {
    if (c.n * 4 < FUEGO_MINIMO) continue;      // *4: se miró uno de cada cuatro
    vivas.push({ x: c.sx / c.n, y: c.sy / c.n, n: c.n });
  }
  vivas.sort((a, b) => b.n - a.n);

  // Y se juntan las que son la misma llama, promediando por peso.
  const focos = [];
  for (let i = 0; i < vivas.length; i++) {
    const v = vivas[i];
    let junta = null;
    for (let j = 0; j < focos.length; j++) {
      const f = focos[j];
      if (Math.hypot(f.x - v.x, f.y - v.y) < FUEGO_JUNTAR) { junta = f; break; }
    }
    if (junta) {
      const n = junta.n + v.n;
      junta.x = (junta.x * junta.n + v.x * v.n) / n;
      junta.y = (junta.y * junta.n + v.y * v.n) / n;
      junta.n = n;
    } else {
      focos.push({ x: v.x, y: v.y, n: v.n });
    }
  }
  return focos;
}

// LA LUNA es el único disco claro y frío grande que hay en el cielo. Las
// estrellas cumplen lo de claro y frío pero miden dos píxeles, así que lo que
// la distingue es el TAMAÑO del grupo.
const LUNA_BRILLO = 185;
const LUNA_CERCA = 120;      // radio en el que se cuenta el disco
const LUNA_MINIMO = 800;     // menos que esto es un puñado de estrellas, no una luna

function buscarLuna(pix) {
  if (!pix) return null;
  const { datos, W, alto } = pix;
  const xs = [], ys = [];
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const r = datos[o], g = datos[o + 1], b = datos[o + 2];
      if (b < r) continue;
      if ((r * 299 + g * 587 + b * 114) / 1000 < LUNA_BRILLO) continue;
      xs.push(x); ys.push(y);
    }
  }
  if (xs.length < LUNA_MINIMO) return null;

  // LA MEDIANA y no la media: hay estrellas claras repartidas por todo el
  // cielo, y una media las tendría en cuenta y sacaría el centro del disco.
  const mx0 = mediana(xs), my0 = mediana(ys);

  // El RADIO es hasta dónde llega el disco, no la raíz de su área: la luna
  // tiene manchas oscuras dentro que no pasan el umbral, y por área sale menos
  // de la mitad de lo que mide. Se toma la distancia más lejana del grupo, algo
  // recortada para no contar un brillo pegado al borde.
  let n = 0, lejos = 0;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.hypot(xs[i] - mx0, ys[i] - my0);
    if (d > LUNA_CERCA) continue;
    n++;
    if (d > lejos) lejos = d;
  }
  if (n < LUNA_MINIMO) return null;
  return { x: mx0, y: my0, radio: lejos * 0.95 };
}

function mediana(v) {
  const c = v.slice().sort((a, b) => a - b);
  return c[c.length >> 1];
}

function estrellas(ctx, t, l) {
  const es = l.estrellas;
  if (!es || es.length === 0) return;
  // El punto va con `fillRect` y no con un degradado: son doscientas y pico en
  // cada fotograma, y un radial por cada una es crear doscientos objetos por
  // frame para pintar tres píxeles. El degradado se lo queda la sexta parte que
  // saca halo, que son unas treinta: eso sí se puede pagar.
  for (let i = 0; i < es.length; i++) {
    const e = es[i];
    // Coseno alzado, igual que el aviso de la portada: va y vuelve sin picos.
    const ciclo = 0.5 - 0.5 * Math.cos((t / e.periodo + e.fase) * Math.PI * 2);
    const a = e.fuerza * ciclo;
    if (a <= 0.02) continue;

    // EL HALO de las destacadas, debajo del punto. Va antes para que el núcleo
    // quede encima y la estrella siga teniendo centro; al revés se ve una mancha.
    if (e.destacada) {
      const r = ESTRELLA_HALO * (0.6 + 0.4 * ciclo);
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      g.addColorStop(0, 'rgba(190,220,255,' + (a * 0.45).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = a;
    ctx.fillStyle = '#dceeff';
    const lado = e.lado + (ciclo > 0.75 ? 1 : 0);
    ctx.fillRect(e.x - (lado >> 1), e.y - (lado >> 1), lado, lado);
    ctx.globalAlpha = 1;
  }
}

// --- La luna ------------------------------------------------------------------
//
// Un halo que respira alrededor del disco. Medida igual que las antorchas: es
// un sitio concreto y son tres números.
//
// EL RADIO NO ES EL DEL ÁREA. La primera medida contó los píxeles muy claros y
// dio 36, menos de la mitad de lo que mide: la luna tiene sus manchas oscuras
// dentro y esas no pasaban el umbral. Lo que vale es el BORDE del disco, que
// son 65 en píxeles de lámina — 46 aquí.
// El halo sale por fuera del disco. Y se suma también ENCIMA, flojo, porque una
// luna con un anillo alrededor y el disco igual de apagado no parece que
// brille: parece que tenga un aro.
const LUNA_HALO = 1.75;
const LUNA_CICLO = 7400;
const LUNA_ALFA = 0.17;

function luna(ctx, t, l) {
  const m = l.luna;
  if (!m) return;
  const u = 0.5 - 0.5 * Math.cos((t / LUNA_CICLO) * Math.PI * 2);
  const a = LUNA_ALFA * (0.35 + 0.65 * u);
  const cx = m.x, cy = m.y;
  const r = m.radio * LUNA_HALO * (0.94 + 0.06 * u);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, 'rgba(225,238,255,' + (a * 0.55).toFixed(3) + ')');
  g.addColorStop(0.57, 'rgba(190,220,255,' + a.toFixed(3) + ')');
  g.addColorStop(1, 'rgba(120,170,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

// --- El velo que cruza las nubes ----------------------------------------------
//
// Una franja de luz que recorre el cielo de un lado a otro, muy despacio, y que
// enciende las NUBES más que el cielo de detrás. Es lo que hace que el cielo
// parezca que se mueve sin mover un solo píxel de la lámina.
//
// EL TRUCO ESTÁ EN LA MÁSCARA. Una franja de luz sumada a secas sobre la mitad
// de arriba encendería también las ruinas, la muralla y la catedral, y eso no se
// lee como una nube pasando: se lee como un fallo. Así que al hornear se saca un
// mapa de DÓNDE HAY CIELO —lo que tira a azul— y CUÁNTO recibe cada punto, que
// va con lo claro que ya es: una nube coge mucho y el fondo de la noche casi
// nada. El velo se pinta a través de ese mapa.
//
// La luna queda fuera del mapa a propósito: ya tiene su propio halo, y sumarle
// el velo por encima la dejaría reventada de blanco al pasar.
//
// A UN CUARTO DE RESOLUCIÓN. El velo es una mancha blanda y la máscara también,
// así que no se pierde nada visible, y en cambio las tres operaciones que hacen
// falta por fotograma pasan de 830.000 píxeles a 52.000. Al dibujarlo sobre el
// mundo se amplía con suavizado, que es lo que termina de fundirlo.
const VELO_ESCALA = 4;
const VELO_AZUL = 18;             // cuánto tiene que tirar a azul para ser cielo
const VELO_TECHO = 175;           // por encima de esto es la luna: fuera
const VELO_CICLO = 34000;         // lo que tarda en cruzar de lado a lado
const VELO_ANCHO = 0.38;          // media franja, en anchos de pantalla
const VELO_ALFA = 0.17;

let _velo = null;                 // lienzo de trabajo, uno para todas las láminas

// El mapa de cielo de una lámina, sacado del horneado.
function mascaraCielo(cielo) {
  if (!cielo) return null;
  const { datos, W, alto } = cielo;
  const w = Math.ceil(W / VELO_ESCALA);
  const h = Math.ceil(alto / VELO_ESCALA);
  const mapa = document.createElement('canvas');
  mapa.width = w;
  mapa.height = h;
  const m = mapa.getContext('2d');
  const img = m.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Una muestra por celda: la máscara es blanda y promediar dieciséis
      // píxeles para difuminarlos después no cambia nada que se vea.
      const o = ((y * VELO_ESCALA) * W + x * VELO_ESCALA) * 4;
      const r = datos[o], g = datos[o + 1], b = datos[o + 2];
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      const p = (y * w + x) * 4;
      img.data[p] = 255; img.data[p + 1] = 255; img.data[p + 2] = 255;
      img.data[p + 3] = (b - r >= VELO_AZUL && lum < VELO_TECHO)
        ? Math.min(255, Math.round(lum * 1.9))     // lo claro coge más luz
        : 0;
    }
  }
  m.putImageData(img, 0, 0);
  return { mapa, alto };
}

function velo(ctx, t, l) {
  const c = l.cielo;
  if (!c) return;
  const w = c.mapa.width, h = c.mapa.height;
  if (!_velo) _velo = document.createElement('canvas');
  if (_velo.width !== w || _velo.height !== h) { _velo.width = w; _velo.height = h; }
  const v = _velo.getContext('2d');

  // De un lado al otro, y con margen por los dos extremos para que entre y
  // salga en vez de aparecer y desaparecer en el borde.
  const u = (t % VELO_CICLO) / VELO_CICLO;
  const media = w * VELO_ANCHO;
  const cx = -media + u * (w + media * 2);

  v.setTransform(1, 0, 0, 1, 0, 0);
  v.globalCompositeOperation = 'source-over';
  v.clearRect(0, 0, w, h);
  const g = v.createLinearGradient(cx - media, 0, cx + media, 0);
  g.addColorStop(0, 'rgba(210,230,255,0)');
  g.addColorStop(0.5, 'rgba(210,230,255,1)');
  g.addColorStop(1, 'rgba(210,230,255,0)');
  v.fillStyle = g;
  v.fillRect(0, 0, w, h);

  // Y por el mapa: lo que no es cielo se cae aquí.
  v.globalCompositeOperation = 'destination-in';
  v.drawImage(c.mapa, 0, 0);

  ctx.globalAlpha = VELO_ALFA;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(_velo, 0, 0, l.lienzo.width, c.alto);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = false;
}

// --- La calavera del rótulo ---------------------------------------------------
//
// LOS DOS OJOS de la calavera de bronce que hay bajo el escudo, en la cima del
// rótulo del juego. Se encienden de rojo muy despacio y se vuelven a apagar,
// una y otra vez.
//
// Van MEDIDOS, como las antorchas y al revés que las estrellas, y por el motivo
// contrario: son dos y son un sitio concreto del dibujo. Buscarlos solos —"las
// dos manchas oscuras dentro de la cosa clara del centro"— sería más código y
// más frágil que escribir dos pares de números.
//
// Y MEDIDOS DE VERDAD, que la primera vez se pusieron a ojo sobre la lámina
// ampliada y el derecho salió seis píxeles corrido: se ve enseguida, porque el
// resplandor se sale de la cuenca por un lado y dentro queda sombra por el
// otro. Lo que vale es el CENTRO DE MASAS de lo oscuro de cada cuenca, acotado
// a la caja del hueso —si la caja se pasa de los bordes del cráneo, el fondo
// negro de alrededor se cuela en la cuenta y arrastra el centro hacia fuera,
// que es exactamente lo que había pasado—.
//
// En unidades de ANCHO_MEDIDO. Comprobación de que están donde se cree: el eje
// entre los dos cae en 689, y el puente nasal del propio dibujo está en ese
// mismo sitio; el emblema de arriba está centrado en 693 y las palabras del
// menú en 694, así que la calavera va un pelo a la izquierda del eje del marco,
// y así está pintada.
const CALAVERA_OJOS = [
  { x: 681.5, y: 247.4 },
  { x: 696.7, y: 247.4 }
];

// La cuenca mide unos 11 de ancho. El resplandor sale algo mayor para que se lea
// como luz que SALE de dentro y no como dos puntos pegados encima.
const CALAVERA_RADIO = 7;

// LENTO, que es lo que pidió Sergio. Cinco segundos y pico de ida y vuelta.
const CALAVERA_CICLO = 5200;

// Y el exponente es lo que hace que esté APAGADA la mayor parte del tiempo. Con
// el coseno alzado a secas pasa tanto rato encendida como apagada, y eso no es
// una calavera que se enciende: es una calavera roja que a veces se apaga. Con
// 1,8 la subida tarda, el rojo se queda un momento arriba y baja, y entre vez y
// vez el rótulo vuelve a ser solo bronce.
const CALAVERA_CURVA = 1.8;
const CALAVERA_ALFA = 0.9;

function calavera(ctx, t, l) {
  const u = 0.5 - 0.5 * Math.cos((t / CALAVERA_CICLO) * Math.PI * 2);
  const a = CALAVERA_ALFA * Math.pow(u, CALAVERA_CURVA);
  if (a <= 0.01) return;
  const r = CALAVERA_RADIO * l.esc * (0.75 + 0.25 * u);
  for (let i = 0; i < CALAVERA_OJOS.length; i++) {
    const o = CALAVERA_OJOS[i];
    const cx = mx(l, o.x), cy = my(l, o.y);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    // Del naranja del centro al rojo de fuera: un rojo plano sumado sobre
    // bronce oscuro se queda sucio, y con el centro caliente parece una brasa.
    g.addColorStop(0, 'rgba(255,120,60,' + a.toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(235,30,20,' + (a * 0.8).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(150,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Antorchas ---------------------------------------------------------------

// Lo que mide el halo de una llama en su punto bajo, en píxeles de lienzo.
const HALO_LLAMA = 40;

// LAS PAVESAS SON COMUNES a todas las láminas y se preparan una sola vez, no
// una tanda por cada una. Son decorado: que la misma brasa suba por la antorcha
// izquierda del título y por la de la placa de la historia no lo nota nadie, y
// en cambio evita que el fuego dé un salto al pasar de una pantalla a otra.
//
// `antorcha` se reparte por módulo al dibujar (ver antorchas), así que esto no
// necesita saber cuántas hay en ninguna lámina.
//
// Todas las medidas van en PÍXELES DE LIENZO, como las antorchas que ahora se
// reconocen solas.
function prepararBrasas() {
  if (estado.brasas.length) return;
  for (let i = 0; i < NUM_BRASAS; i++) {
    estado.brasas.push({
      antorcha: i,
      fase: rng(),                       // dónde empieza su vuelta, 0..1
      periodo: 2000 + rng() * 2400,      // lo que tarda en subir y apagarse
      dx: (rng() - 0.5) * 11,            // desvío horizontal
      vaiven: 3 + rng() * 7,
      velVaiven: 0.7 + rng() * 1.3,
      subida: 42 + rng() * 48,
      radio: 1.0 + rng() * 1.4
    });
  }
}

function antorchas(ctx, t, l) {
  const ant = l.antorchas;
  if (!ant || ant.length === 0) return;
  // El resplandor: dos senos de períodos distintos, que es lo que hace que una
  // llama no lata como un metrónomo.
  for (let i = 0; i < ant.length; i++) {
    const b = ant[i];
    const s = t / 1000 + i * 1.7;
    const p = 0.5 + 0.30 * Math.sin(s * 3.1) + 0.20 * Math.sin(s * 7.9 + 1.3);
    const cx = b.x, cy = b.y;
    const r = HALO_LLAMA + 10 * p;
    const a = 0.11 + 0.08 * p;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,186,92,' + a.toFixed(3) + ')');
    g.addColorStop(0.4, 'rgba(232,124,40,' + (a * 0.45).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(180,70,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Las pavesas. Sin pool que rellenar ni objetos que crear en marcha: cada
  // brasa es un ciclo continuo y su posición SALE DEL RELOJ. Cuando su vuelta
  // se acaba vuelve a empezar abajo, y como cada una tiene su período y su
  // fase, ninguna sube a la vez que otra.
  for (let i = 0; i < estado.brasas.length; i++) {
    const p = estado.brasas[i];
    // Las pavesas son COMUNES a todas las láminas —ver prepararBrasas— así que
    // se reparten por el número de antorchas que tenga esta.
    const b = ant[p.antorcha % ant.length];
    const u = ((t / p.periodo) + p.fase) % 1;          // 0 recién salida, 1 apagada
    const cx = b.x + p.dx + Math.sin((t / 1000) * p.velVaiven + p.fase * 9) * p.vaiven * u;
    const cy = b.y - 11 - u * p.subida;
    // Se enciende de golpe al salir y se apaga despacio subiendo.
    const vida = u < 0.15 ? u / 0.15 : (1 - u) / 0.85;
    const a = vida * 0.75;
    if (a <= 0.02) continue;
    const r = p.radio * (1.2 - u * 0.45) * 3;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    // La ceniza va tirando a rojo según sube: el verde y el azul se apagan
    // antes que el rojo, que es lo que hace una brasa de verdad.
    g.addColorStop(0, 'rgba(255,' + Math.round(210 - u * 110) + ',' +
                      Math.round(140 - u * 110) + ',' + a.toFixed(3) + ')');
    g.addColorStop(0.35, 'rgba(240,' + Math.round(130 - u * 70) + ',40,' +
                         (a * 0.4).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(200,60,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
