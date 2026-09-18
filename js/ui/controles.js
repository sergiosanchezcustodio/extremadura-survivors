import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import { rejilla, armazon, descripcion, MARGEN } from './tabla.js';
import { Recursos } from '../core/recursos.js';

// CONTROLADORES: qué hace cada botón, dibujado y no contado.
//
// Lo pidió Sergio, y el juego lo necesitaba: lo único que había era el renglón
// de atajos del pie de la página —que además está lleno de teclas de
// depuración— y la tabla del manual, que hay que abrir aparte. Quien enchufa un
// mando por primera vez no sabe que la ficha del personaje se abre con VIEW.
//
// A LA IZQUIERDA, LA SILUETA DE UN XBOX SERIES X. Es un dibujo de Sergio
// (resources/menus/silueta_mando_info.png), y sustituye al mando que había aquí
// trazado a mano con curvas. Ese sigue abajo, de repliegue, porque la regla de
// siempre: si la imagen no carga, la pantalla tiene que salir igual.
//
// LA LÁMINA ES LÍNEA NEGRA SOBRE TRANSPARENTE, así que se TIÑE antes de
// dibujarla —sobre el velo oscuro de esta pantalla, tal cual no se vería—. Se
// tiñe una vez y se guarda: repintarla en cada fotograma es hacer sesenta veces
// por segundo un trabajo cuyo resultado no cambia.
//
// Y CADA PIEZA SE ILUMINA CON SU RENGLÓN. Las líneas de guía de los diagramas
// clásicos aquí no caben: son ocho controles en un mando pequeño y saldrían
// todas cruzadas. En su lugar, sobre la pieza señalada se enciende un halo.
//
// A LA DERECHA, UNA TABLA DE TRES COLUMNAS —ACCIÓN, MANDO y TECLADO— como la
// pidió Sergio: primero lo que se quiere hacer y después cómo se hace con cada
// cosa, que es el orden en que se busca.

const RUTA_MANDO = 'assets/menus/silueta-mando.png';

// El mando, en su hueco de la izquierda.
const MANDO_X = MARGEN + 10;
const MANDO_ANCHO = 286;

// Y LA TABLA, tres columnas. La de TECLADO va alineada a la DERECHA contra el
// margen, que es lo que hace que se lea como una columna y no como una tercera
// palabra suelta detrás de la anterior.
const COL_ACCION = MANDO_X + MANDO_ANCHO + 34;
const COL_MANDO = COL_ACCION + 196;
const COL_TECLADO = ANCHO_UI - MARGEN;

// LOS CONTROLES, en el orden en que se aprenden: primero moverse, luego decidir,
// luego lo que se consulta y al final lo que interrumpe.
//
// `pieza` es lo que se enciende en el dibujo del mando. Un control que el mando
// no tiene —no hay ninguno hoy— llevaría `pieza: null` y dejaría el mando
// entero apagado, que es lo honesto: no inventarse un botón.
export const CONTROLES = [
  { pieza: 'stickIzq', mando: 'Stick izquierdo', tecla: 'WASD o flechas',
    que: 'Moverte',
    larga: 'Lo único que se hace con las manos: el arma dispara sola.' },
  { pieza: 'a', mando: 'A', tecla: 'Enter',
    que: 'Confirmar y elegir carta',
    larga: 'Al subir de nivel salen tres armas: esto elige la señalada.' },
  { pieza: 'b', mando: 'B', tecla: 'Esc',
    que: 'Atrás y cerrar',
    larga: 'Sale de cualquier pantalla y cierra la ficha y la pausa.' },
  { pieza: 'cruceta', mando: 'Cruceta', tecla: 'Flechas',
    que: 'Moverte por los menús',
    larga: 'El stick izquierdo también vale: en los menús hacen lo mismo.' },
  { pieza: 'view', mando: 'VIEW', tecla: 'Tab',
    que: 'Ficha del personaje',
    larga: 'Congela el mundo y enseña vida, características y el arsenal.' },
  { pieza: 'menu', mando: 'MENU', tecla: 'Esc',
    que: 'Pausa',
    larga: 'Desde la pausa se llega a esta misma configuración.' },
  { pieza: 'x', mando: 'X', tecla: 'F',
    que: 'Subida automática',
    larga: 'Con las ocho ranuras llenas, sube sola el arma que toque.' },
  { pieza: null, mando: 'Cualquier botón', tecla: 'Cualquier tecla',
    que: 'Saltar la presentación',
    larga: 'El relato del arranque se salta MANTENIENDO pulsado, no de un toque.' }
];

// EN COOPERATIVO, CADA MANDO ES UN JUGADOR. Va de pie de la pantalla y no como
// una fila más, porque no es un control: es cómo se entra.
const PIE = 'Cada mando enchufado es un jugador. Pulsa A o MENU para entrar.';

// DÓNDE ESTÁ CADA PIEZA EN LA LÁMINA, en fracciones de su ancho y de su alto.
// Van en fracciones y no en píxeles porque así siguen valiendo si Sergio
// reexporta el dibujo a otro tamaño, que es la lección de la lámina del título.
const PIEZAS = {
  stickIzq: { x: 0.250, y: 0.273 },
  stickDer: { x: 0.625, y: 0.493 },
  cruceta:  { x: 0.363, y: 0.505 },
  y:        { x: 0.752, y: 0.204 },
  x:        { x: 0.691, y: 0.292 },
  b:        { x: 0.820, y: 0.292 },
  a:        { x: 0.752, y: 0.380 },
  view:     { x: 0.428, y: 0.283 },
  menu:     { x: 0.573, y: 0.278 }
};

// El halo que marca la pieza. Generoso a propósito: marca un sitio, no dibuja
// un contorno, y así un par de píxeles de desvío en las medidas no se notan.
const HALO = 0.055;              // en anchos de la lámina

// --- La lámina ----------------------------------------------------------------

let _lamina = null;          // la silueta ya teñida, o null mientras no esté
let _pedida = false;         // para no pedirla otra vez en cada fotograma

// Se pide LA PRIMERA VEZ que se dibuja esta pantalla, y no al arrancar el juego
// con el resto: a esta pantalla se entra a propósito y desde un menú, así que un
// fotograma con el mando de repliegue no lo ve nadie, y a cambio el arranque no
// carga una imagen que la mayoría de las partidas no van a abrir.
function pedirLamina() {
  if (_pedida) return;
  _pedida = true;
  Recursos.cargarSuelta(RUTA_MANDO).then((img) => {
    if (img) _lamina = tenyir(img, '#c9cede');
  });
}

// Deja la línea del color que se le diga, conservando el alfa. `source-in`
// pinta solo donde YA hay algo, que en esta lámina es exactamente el trazo.
function tenyir(img, color) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = color;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

// La silueta, con el halo de la pieza señalada debajo. El halo VA DEBAJO para
// que la línea del dibujo siga leyéndose por encima de él.
function lamina(ctx, x, y, w, piezaViva) {
  const h = w * (_lamina.height / _lamina.width);
  const p = PIEZAS[piezaViva];
  if (p) {
    const cx = x + p.x * w, cy = y + p.y * h, r = HALO * w;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(168,220,255,.60)');
    g.addColorStop(0.55, 'rgba(120,190,255,.22)');
    g.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.drawImage(_lamina, x, y, w, h);
  return h;
}

// --- El mando de repliegue ----------------------------------------------------
//
// Todo en coordenadas 0..1 de su caja, para que el tamaño salga de una sola
// constante. `u` convierte a lo ancho y `v` a lo alto.
const MANDO_ALTO = 0.72;          // proporción alto/ancho del dibujo

function apagado(t) { return t.texto; }

function trazar(ctx, x, y, w, encendida, piezaViva) {
  const t = Tema.actual;
  const h = w * MANDO_ALTO;
  const u = (a) => x + a * w;
  const v = (b) => y + b * h;
  const r = (a) => a * w;                       // radios y grosores, a escala

  const viva = (nombre) => (piezaViva === nombre ? encendida : apagado(t));

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // EL CUERPO, de una sola curva. Dos empuñaduras que caen y un lomo que las
  // une: es la silueta que hace que se lea "mando" y no "mesa".
  ctx.beginPath();
  ctx.moveTo(u(0.20), v(0.15));
  ctx.bezierCurveTo(u(0.34), v(0.03), u(0.66), v(0.03), u(0.80), v(0.15));
  ctx.bezierCurveTo(u(0.95), v(0.26), u(1.00), v(0.48), u(0.96), v(0.76));
  ctx.bezierCurveTo(u(0.93), v(0.98), u(0.79), v(1.01), u(0.73), v(0.84));
  // LA CINTURA, bien abajo. Antes cerraba en 0,62 y el stick derecho la
  // cruzaba: el dibujo se leía como un mando roto por la mitad.
  ctx.bezierCurveTo(u(0.66), v(0.76), u(0.60), v(0.72), u(0.50), v(0.72));
  ctx.bezierCurveTo(u(0.40), v(0.72), u(0.34), v(0.76), u(0.27), v(0.84));
  ctx.bezierCurveTo(u(0.21), v(1.01), u(0.07), v(0.98), u(0.04), v(0.76));
  ctx.bezierCurveTo(u(0.00), v(0.48), u(0.05), v(0.26), u(0.20), v(0.15));
  ctx.closePath();
  ctx.fillStyle = 'rgba(10,9,16,.72)';
  ctx.fill();
  ctx.lineWidth = Math.max(1, r(0.006));
  ctx.strokeStyle = t.texto;
  ctx.stroke();

  // Los parachoques, asomando por detrás del lomo. ANCHOS Y APLASTADOS: con un
  // arco de circunferencia salían dos orejas, que es lo que se veía.
  ctx.lineWidth = Math.max(1.5, r(0.013));
  ctx.strokeStyle = apagado(t);
  for (const lado of [-1, 1]) {
    const cx = 0.5 + lado * 0.255;
    ctx.beginPath();
    ctx.ellipse(u(cx), v(0.12), r(0.105), r(0.055), 0, Math.PI, 0);
    ctx.stroke();
  }

  // Sticks: el izquierdo arriba y el derecho abajo, que es lo que distingue a un
  // Xbox de un mando de PlayStation de un vistazo.
  const stick = (cx, cy, nombre) => {
    ctx.beginPath();
    ctx.arc(u(cx), v(cy), r(0.082), 0, Math.PI * 2);
    ctx.strokeStyle = viva(nombre);
    ctx.lineWidth = Math.max(1.5, r(0.012));
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(u(cx), v(cy), r(0.045), 0, Math.PI * 2);
    ctx.fillStyle = viva(nombre);
    ctx.fill();
  };
  stick(0.235, 0.325, 'stickIzq');
  stick(0.605, 0.545, 'stickDer');

  // La cruceta, abajo a la izquierda. LOS DOS BRAZOS SE MIDEN EN PÍXELES, no uno
  // en fracción de ancho y otro de alto: mezclarlos fue lo que la primera vez la
  // dejó en forma de T, con el brazo vertical corrido y más corto.
  const cx = u(0.385), cy = v(0.545);
  const brazo = r(0.072), grueso = r(0.028);
  ctx.fillStyle = viva('cruceta');
  ctx.beginPath();
  ctx.rect(cx - brazo, cy - grueso, brazo * 2, grueso * 2);
  ctx.rect(cx - grueso, cy - brazo, grueso * 2, brazo * 2);
  ctx.fill();

  // Los cuatro botones, arriba a la derecha. Cada uno con su letra dentro: sin
  // ellas son cuatro círculos, y con ellas es un mando de Xbox.
  const boton = (dx, dy, nombre, letra) => {
    const bx = u(0.745 + dx), by = v(0.325 + dy);
    const rad = r(0.043);
    ctx.beginPath();
    ctx.arc(bx, by, rad, 0, Math.PI * 2);
    ctx.fillStyle = piezaViva === nombre ? encendida : 'rgba(0,0,0,0)';
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, r(0.010));
    ctx.strokeStyle = viva(nombre);
    ctx.stroke();
    ctx.fillStyle = piezaViva === nombre ? '#14121c' : apagado(t);
    ctx.font = `700 ${Math.round(rad * 1.25)}px ${FUENTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letra, bx, by + rad * 0.06);
  };
  boton(0, -0.105, 'y', 'Y');
  boton(-0.070, 0, 'x', 'X');
  boton(0.070, 0, 'b', 'B');
  boton(0, 0.105, 'a', 'A');

  // VIEW y MENU, los dos botoncitos del centro. Ya no se llaman Select y Start
  // —eso era la generación anterior— y este mando es un Series X.
  const chico = (bx, nombre, etiqueta) => {
    const by = v(0.265);
    ctx.beginPath();
    ctx.arc(u(bx), by, r(0.020), 0, Math.PI * 2);
    ctx.fillStyle = viva(nombre);
    ctx.fill();
    // La etiqueta ENCIMA del botón, no debajo: debajo caía sobre la cruceta y
    // sobre el stick derecho, que es la zona más llena del dibujo.
    ctx.font = `700 ${Math.max(7, Math.round(r(0.036)))}px ${FUENTE}`;
    ctx.fillStyle = viva(nombre);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(etiqueta, u(bx), by - r(0.032));
  };
  chico(0.425, 'view', 'VIEW');
  chico(0.575, 'menu', 'MENU');

  ctx.restore();
}

export function dibujarControles(ctxMundo, ctx, cursor) {
  const t = Tema.actual;
  const r = rejilla(CONTROLES.length, 34);
  pedirLamina();

  ctx.save();
  armazon(ctxMundo, ctx, r, ['CONTROLADORES'], 0,
          ['ACCIÓN', 'MANDO', '', 'TECLADO'],
          { x: [COL_ACCION, COL_MANDO, 0, COL_TECLADO], derecha: COL_TECLADO });

  const c = CONTROLES[Math.max(0, Math.min(CONTROLES.length - 1, cursor))];

  // El mando, centrado a lo alto del hueco de las filas. Si la lámina todavía no
  // está —o no ha cargado— sale el de repliegue, trazado a mano.
  const bloque = r.alto * CONTROLES.length;
  if (_lamina) {
    const alto = MANDO_ANCHO * (_lamina.height / _lamina.width);
    lamina(ctx, MANDO_X, r.filas + (bloque - alto) / 2, MANDO_ANCHO, c.pieza);
  } else {
    const alto = MANDO_ANCHO * MANDO_ALTO;
    trazar(ctx, MANDO_X, r.filas + (bloque - alto) / 2,
           MANDO_ANCHO, t.titulo, c.pieza);
  }

  for (let i = 0; i < CONTROLES.length; i++) {
    const f = CONTROLES[i];
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 1;

    // El resalte NO ocupa el ancho entero: se queda en la tabla, porque a la
    // izquierda está el mando y una banda encendida por debajo de él lo
    // convertiría en un dibujo tachado.
    if (elegida) {
      ctx.fillStyle = 'rgba(168,220,255,.16)';
      ctx.beginPath();
      ctx.roundRect(COL_ACCION - 10, y + 1, COL_TECLADO - COL_ACCION + 20,
                    r.alto - 2, 5);
      ctx.fill();
    }

    ctx.textBaseline = 'middle';

    // ACCIÓN. Es la columna por la que se busca, así que va la primera y en el
    // color de los títulos aunque no esté señalada.
    ctx.textAlign = 'left';
    ctx.font = `700 12px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : t.titulo;
    ctx.fillText(f.que, COL_ACCION, yc);

    // MANDO y TECLADO, las dos formas de hacerlo. En el color del texto normal:
    // lo que se lee primero es QUÉ se hace, y estas dos son la respuesta.
    ctx.font = `600 12px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#dfe6f5' : t.texto;
    ctx.fillText(f.mando, COL_MANDO, yc);

    ctx.textAlign = 'right';
    ctx.fillText(f.tecla, COL_TECLADO, yc);
  }

  // El pie del cooperativo, justo encima del renglón de descripción.
  ctx.textAlign = 'center';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(PIE, ANCHO_UI / 2, r.desc - 16);

  descripcion(ctx, r, c.larga);
  ctx.restore();
}
