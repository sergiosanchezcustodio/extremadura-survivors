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

// CENTRO DE LA LLAMA DE CADA ANTORCHA, en píxeles de la ilustración original
// (1360x768), como el resto de medidas de pantallas.js.
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
const ANTORCHAS = [
  { x: 355, y: 550 },
  { x: 975, y: 554 }
];

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
  hornear(nombre, img) {
    if (!img) return;
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

    let esc, ox, oy;
    if (Math.abs(suya - pantalla) / pantalla <= TOLERANCIA_ENCAJE) {
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

    laminas[nombre] = { lienzo, esc, ox, oy };

    prepararBrasas();
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
    antorchas(ctxMundo, estado.t, l);
    ctxMundo.restore();
  }
};

// Imagen -> lienzo del mundo, con el encaje de la lámina que se esté pintando.
function mx(l, ix) { return l.ox + ix * l.esc; }
function my(l, iy) { return l.oy + iy * l.esc; }

// --- Antorchas ---------------------------------------------------------------

function prepararBrasas() {
  estado.brasas.length = 0;
  for (let i = 0; i < NUM_BRASAS; i++) {
    estado.brasas.push({
      antorcha: i % ANTORCHAS.length,
      fase: rng(),                       // dónde empieza su vuelta, 0..1
      periodo: 2000 + rng() * 2400,      // lo que tarda en subir y apagarse
      dx: (rng() - 0.5) * 8,             // desvío horizontal, en píxeles de imagen
      vaiven: 2 + rng() * 5,
      velVaiven: 0.7 + rng() * 1.3,
      subida: 30 + rng() * 34,
      radio: 0.7 + rng() * 1.0
    });
  }
}

function antorchas(ctx, t, l) {
  // El resplandor: dos senos de períodos distintos, que es lo que hace que una
  // llama no lata como un metrónomo.
  for (let i = 0; i < ANTORCHAS.length; i++) {
    const b = ANTORCHAS[i];
    const s = t / 1000 + i * 1.7;
    const p = 0.5 + 0.30 * Math.sin(s * 3.1) + 0.20 * Math.sin(s * 7.9 + 1.3);
    const cx = mx(l, b.x), cy = my(l, b.y);
    const r = (28 + 7 * p) * l.esc;
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
    const b = ANTORCHAS[p.antorcha];
    const u = ((t / p.periodo) + p.fase) % 1;          // 0 recién salida, 1 apagada
    const ix = b.x + p.dx + Math.sin((t / 1000) * p.velVaiven + p.fase * 9) * p.vaiven * u;
    const iy = b.y - 8 - u * p.subida;
    // Se enciende de golpe al salir y se apaga despacio subiendo.
    const vida = u < 0.15 ? u / 0.15 : (1 - u) / 0.85;
    const a = vida * 0.75;
    if (a <= 0.02) continue;
    const cx = mx(l, ix), cy = my(l, iy);
    const r = p.radio * l.esc * (1.2 - u * 0.45) * 3;
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
