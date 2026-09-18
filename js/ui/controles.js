import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, textoEspaciado } from './capa.js';
import { Tema } from './tema.js';
import { rejilla, armazon, descripcion, MARGEN } from './tabla.js';

// CONTROLADORES: qué hace cada botón, dibujado y no contado.
//
// Lo pidió Sergio, y el juego lo necesitaba: lo único que había era el renglón
// de atajos del pie de la página —que además está lleno de teclas de
// depuración— y la tabla del manual, que hay que abrir aparte. Quien enchufa un
// mando por primera vez no sabe que la ficha del personaje se abre con VIEW.
//
// A LA IZQUIERDA, UN MANDO DE VERDAD. Es un Xbox Series X trazado a mano con
// rectángulos redondeados y círculos: no hay arte para esto y tampoco hace
// falta, porque un mando se reconoce por su silueta —dos empuñaduras, dos
// sticks a distinta altura, la cruceta abajo a la izquierda y los cuatro
// botones arriba a la derecha— antes de que se lea una sola letra. Va en la
// capa de interfaz, así que sale nítido a la resolución del monitor.
//
// Y CADA PIEZA SE ILUMINA CON SU RENGLÓN. Las líneas de guía de los diagramas
// clásicos aquí no caben: son ocho controles en un mando de doscientos píxeles
// y saldrían todas cruzadas. En su lugar, la pieza señalada se enciende y las
// demás se quedan en gris, que dice lo mismo sin una sola línea.
//
// A LA DERECHA, EL TECLADO, con la misma lista y en el mismo orden: quien juega
// con uno u otro lee la misma fila. Los dos se recorren con el mismo cursor.

// El mando, en una caja propia. Se dibuja en coordenadas 0..1 dentro de ella,
// así que moverlo o cambiarlo de tamaño es tocar estos cuatro números.
const MANDO_X = MARGEN + 18;
const MANDO_ANCHO = 330;

// La lista de la derecha empieza donde acaba el mando.
const LISTA_X = MANDO_X + MANDO_ANCHO + 44;

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

// --- El mando -----------------------------------------------------------------
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

  ctx.save();
  armazon(ctxMundo, ctx, r, ['CONTROLADORES'], 0,
          ['MANDO', '', '', 'TECLADO'],
          { x: [LISTA_X, 0, 0, ANCHO_UI - MARGEN], derecha: ANCHO_UI - MARGEN });

  const c = CONTROLES[Math.max(0, Math.min(CONTROLES.length - 1, cursor))];

  // El mando, centrado a lo alto del hueco de las filas.
  const alto = MANDO_ANCHO * MANDO_ALTO;
  trazar(ctx, MANDO_X, r.filas + (r.alto * CONTROLES.length - alto) / 2,
         MANDO_ANCHO, t.titulo, c.pieza);

  for (let i = 0; i < CONTROLES.length; i++) {
    const f = CONTROLES[i];
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    // El resalte NO ocupa el ancho entero: se queda en la lista, porque a la
    // izquierda está el mando y una banda encendida por debajo de él lo
    // convertiría en un dibujo tachado.
    if (elegida) {
      ctx.fillStyle = 'rgba(168,220,255,.16)';
      ctx.beginPath();
      ctx.roundRect(LISTA_X - 10, y + 1, ANCHO_UI - MARGEN - LISTA_X + 20,
                    r.alto - 2, 5);
      ctx.fill();
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `700 12px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : t.titulo;
    ctx.fillText(f.mando, LISTA_X, yc - 6);

    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = t.texto;
    ctx.fillText(f.que, LISTA_X, yc + 8);

    ctx.textAlign = 'right';
    ctx.font = `700 12px ${FUENTE}`;
    ctx.fillStyle = elegida ? '#ffffff' : t.titulo;
    ctx.fillText(f.tecla, ANCHO_UI - MARGEN, yc - 6);
  }

  // El pie del cooperativo, justo encima del renglón de descripción.
  ctx.textAlign = 'center';
  ctx.font = `600 10px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  ctx.fillText(PIE, ANCHO_UI / 2, r.desc - 16);

  descripcion(ctx, r, c.larga);
  ctx.restore();
}
