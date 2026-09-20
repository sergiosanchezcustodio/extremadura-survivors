import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE, FUENTE_TITULO, textoEspaciado } from './capa.js';
import { Tema, panel } from './tema.js';
import { GestorAudio } from '../sistemas/audio.js';
import { Recursos } from '../core/recursos.js';
import {
  rejilla, armazon, resalte, puntos, descripcion, nombreFila,
  X_ICONO, X_NOMBRE, X_NIVEL, X_EFECTO, X_VALOR, RADIO_PUNTO
} from './tabla.js';

// CONFIGURACIÓN. La misma pantalla que la tienda —pantalla completa, velo sobre
// la ilustración del título, cabecera, columnas y fila resaltada— pero con los
// ajustes en vez de con lo que se compra. Lo pidió Sergio así y tiene sentido:
// son las dos únicas listas del juego que se recorren de arriba abajo, y que se
// vieran distintas era una diferencia sin motivo.
//
// El armazón entero lo pone ui/tabla.js. Aquí solo están las cuatro filas.
//
// LOS VOLÚMENES VAN EN LA COLUMNA DE NIVEL, con los mismos puntos que usa la
// tienda para los escalones de un potenciador. Encaja de suerte y encaja bien:
// el volumen se mueve de diez en diez (ver ajustarMusica en sistemas/audio.js),
// así que son exactamente diez puntos y se lee de un vistazo dónde está el
// mando sin tener que buscar el porcentaje.
const PASOS_VOLUMEN = 10;

const ALTO_FILA = 46;
const COLOR_PELIGRO = '#e8907c';

// Lo que dice cada ajuste, corto para la columna y largo para el renglón de
// abajo. Va aquí y no en datos/ porque no es contenido del juego: es la etiqueta
// de un mando de esta pantalla.
const TEXTOS = {
  musica:   { efecto: 'Banda sonora',
              larga: 'Volumen de la música del menú y de la partida.' },
  efectos:  { efecto: 'Golpes, gemas y voces',
              larga: 'Volumen de todo lo que suena al jugar, sin contar la música.' },
  pantalla: { efecto: 'Ocupa el monitor entero',
              larga: 'También se entra y se sale con el botón de la esquina.' },
  controles: { efecto: 'Qué hace cada botón',
               larga: 'Abre la lista, con el mando dibujado y la pieza señalada encendida.' },
  volver:   { efecto: 'Vuelve a donde estabas',
              larga: 'Esc o B hacen lo mismo desde cualquier punto de la lista.' }
};

// El último caso devuelve vacío A PROPÓSITO. Antes devolvía 'Borrar', que era el
// valor de "Empezar de cero"; cuando esa fila se mudó al menú del título, la que
// ocupó su sitio —Volver— heredó la palabra sin que nadie la escribiera. Un caso
// por defecto que da un valor concreto miente en cuanto cambia la lista.
function valor(id) {
  if (id === 'musica') return Math.round(GestorAudio.volumenMusica() * 100) + '%';
  if (id === 'efectos') return Math.round(GestorAudio.volumenEfectos() * 100) + '%';
  if (id === 'pantalla') return document.fullscreenElement ? 'Sí' : 'No';
  return '';                      // Volver no es un ajuste: no tiene valor
}

function nivel(id) {
  if (id === 'musica') return Math.round(GestorAudio.volumenMusica() * PASOS_VOLUMEN);
  if (id === 'efectos') return Math.round(GestorAudio.volumenEfectos() * PASOS_VOLUMEN);
  return -1;                    // sin escalones: no es un mando graduado
}

// EL ICONO DE CONTROLADORES sí es arte: un mando dibujado por Sergio
// (resources/menus/silueta_mando_xbox_icon.png). Los otros cuatro van trazados a
// mano porque son símbolos —una nota, un altavoz— que no merecen un fichero;
// este no, porque un mando trazado con cuatro curvas a quince píxeles de radio
// no se reconoce.
//
// Se TIÑE del mismo azul que los otros cuatro, que es lo que hace que la columna
// se lea como una sola cosa y no como cuatro dibujos y una foto. La lámina es
// línea sobre transparente, así que `source-in` pinta exactamente el trazo.
//
// Y SE RECORTA A SU CONTENIDO al teñirla: el PNG viene con márgenes generosos
// —1024x1024 para un dibujo de 944x684— y sin recortar, el mando saldría a la
// mitad de tamaño que los demás iconos y descentrado hacia arriba.
const RUTA_ICONO_MANDO = 'assets/menus/icono-mando.png';
const RECORTE_MANDO = { x: 41, y: 161, w: 944, h: 684 };

let _mando = null;
let _pedido = false;

function pedirIconoMando() {
  if (_pedido) return;
  _pedido = true;
  Recursos.cargarSuelta(RUTA_ICONO_MANDO).then((img) => {
    if (!img) return;
    const c = document.createElement('canvas');
    c.width = RECORTE_MANDO.w;
    c.height = RECORTE_MANDO.h;
    const x = c.getContext('2d');
    x.drawImage(img, -RECORTE_MANDO.x, -RECORTE_MANDO.y);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#9fd0e8';
    x.fillRect(0, 0, c.width, c.height);
    _mando = c;
  });
}

// Un icono por ajuste, trazado a mano. No hay arte para esto y tampoco hace
// falta: son cuatro símbolos que se reconocen por la silueta —una nota, un
// altavoz, un marco y una flecha— y a este tamaño un dibujo detallado se
// vería peor que una forma limpia.
//
// Cada id lleva su rama EXPLÍCITA y no hay caso por defecto: un id desconocido
// no dibuja nada, que es el fallo seguro. Con un `else` genérico, la fila que
// sustituyó a "Empezar de cero" se quedó con su calavera roja.
function icono(ctx, id, cx, cy, r) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (id === 'musica') {
    // Corchea: cabeza, plica y banderola.
    ctx.fillStyle = '#9fd0e8';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.25, cy + r * 0.45, r * 0.34, r * 0.26, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9fd0e8';
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.06, cy + r * 0.45);
    ctx.lineTo(cx + r * 0.06, cy - r * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.06, cy - r * 0.7);
    ctx.quadraticCurveTo(cx + r * 0.8, cy - r * 0.45, cx + r * 0.5, cy - r * 0.02);
    ctx.stroke();

  } else if (id === 'efectos') {
    // Altavoz con dos ondas.
    ctx.fillStyle = '#9fd0e8';
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.75, cy - r * 0.28);
    ctx.lineTo(cx - r * 0.36, cy - r * 0.28);
    ctx.lineTo(cx + r * 0.04, cy - r * 0.72);
    ctx.lineTo(cx + r * 0.04, cy + r * 0.72);
    ctx.lineTo(cx - r * 0.36, cy + r * 0.28);
    ctx.lineTo(cx - r * 0.75, cy + r * 0.28);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#9fd0e8';
    ctx.lineWidth = Math.max(1.4, r * 0.14);
    for (let k = 1; k <= 2; k++) {
      ctx.beginPath();
      ctx.arc(cx + r * 0.1, cy, r * (0.2 + k * 0.28), -0.9, 0.9);
      ctx.stroke();
    }

  } else if (id === 'pantalla') {
    // Marco con las cuatro esquinas marcadas: el mismo gesto que el botón de la
    // esquina de la página.
    ctx.strokeStyle = '#9fd0e8';
    ctx.lineWidth = Math.max(1.4, r * 0.14);
    ctx.strokeRect(cx - r * 0.72, cy - r * 0.56, r * 1.44, r * 1.12);
    ctx.lineWidth = Math.max(2, r * 0.22);
    const b = r * 0.34;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, cy - r * 0.56 + b); ctx.lineTo(cx - r * 0.72, cy - r * 0.56); ctx.lineTo(cx - r * 0.72 + b, cy - r * 0.56);
    ctx.moveTo(cx + r * 0.72 - b, cy - r * 0.56); ctx.lineTo(cx + r * 0.72, cy - r * 0.56); ctx.lineTo(cx + r * 0.72, cy - r * 0.56 + b);
    ctx.moveTo(cx - r * 0.72, cy + r * 0.56 - b); ctx.lineTo(cx - r * 0.72, cy + r * 0.56); ctx.lineTo(cx - r * 0.72 + b, cy + r * 0.56);
    ctx.moveTo(cx + r * 0.72 - b, cy + r * 0.56); ctx.lineTo(cx + r * 0.72, cy + r * 0.56); ctx.lineTo(cx + r * 0.72, cy + r * 0.56 - b);
    ctx.stroke();

  } else if (id === 'controles') {
    // Encajado POR EL ANCHO y un pelo mayor que el radio: un mando es más ancho
    // que alto, y al alto de los demás iconos se quedaría en una pastilla.
    if (_mando) {
      const w = r * 2.25;
      const h = w * (RECORTE_MANDO.h / RECORTE_MANDO.w);
      ctx.drawImage(_mando, cx - w / 2, cy - h / 2, w, h);
    }
  } else if (id === 'volver') {
    // Flecha a la izquierda: se vuelve por donde se vino. Mismo trazo azul que
    // los otros tres, porque esta fila ya no es la peligrosa de la pantalla.
    ctx.strokeStyle = '#9fd0e8';
    ctx.lineWidth = Math.max(1.6, r * 0.16);
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.66, cy);
    ctx.lineTo(cx - r * 0.46, cy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.04, cy - r * 0.44);
    ctx.lineTo(cx - r * 0.56, cy);
    ctx.lineTo(cx - r * 0.04, cy + r * 0.44);
    ctx.stroke();
  }
  ctx.restore();
}

// Ya no recibe `confirmando`: el aviso de borrar se mudó a la pantalla de
// partidas cuando dejó de haber un "empezar de cero" que afectara a todo. Aquí
// no queda nada que confirmar.
export function dibujarConfig(ctxMundo, ctx, opciones, cursor) {
  const t = Tema.actual;
  pedirIconoMando();
  const r = rejilla(opciones.length, ALTO_FILA);

  ctx.save();
  armazon(ctxMundo, ctx, r, ['CONFIGURACIÓN'], 0,
          ['AJUSTE', 'NIVEL', 'QUÉ CAMBIA', 'VALOR']);

  const radio = Math.min(15, r.alto * 0.34);
  for (let i = 0; i < opciones.length; i++) {
    const o = opciones[i];
    const txt = TEXTOS[o.id] || { efecto: '', larga: '' };
    const elegida = i === cursor;
    const y = r.filas + i * r.alto;
    const yc = y + r.alto / 2 - 2;

    if (elegida) resalte(ctx, y, r.alto);

    icono(ctx, o.id, X_ICONO, yc, radio);

    nombreFila(ctx, o.texto, X_NOMBRE, yc, elegida ? '#ffffff' : t.titulo);

    const n = nivel(o.id);
    if (n >= 0) puntos(ctx, X_NIVEL + RADIO_PUNTO, yc, n, PASOS_VOLUMEN, elegida);

    ctx.textAlign = 'left';
    ctx.font = `600 11px ${FUENTE}`;
    ctx.fillStyle = t.texto;
    ctx.fillText(txt.efecto, X_EFECTO, yc);

    ctx.textAlign = 'right';
    ctx.font = `700 13px ${FUENTE}`;
    ctx.fillStyle = t.titulo;
    ctx.fillText(valor(o.id), X_VALOR, yc);
  }

  descripcion(ctx, r, (TEXTOS[opciones[cursor].id] || { larga: '' }).larga);
  ctx.restore();

}

// Ventana de confirmar el borrado. Esta SÍ se queda como panel pequeño en el
// centro y con sus dos teclas escritas: es lo contrario de una lista que se
// recorre —es una pregunta que hay que contestar— y aquí las teclas no son una
// ayuda que sobre, son los dos botones del diálogo.
// LOS DOS BOTONES, en el orden en que se recorren. CANCELAR primero, y por eso
// a la izquierda: el cursor arranca ahí y para llegar a BORRAR hay que moverse
// a propósito. Una pulsación de más no puede caer en el que no se deshace.
const CONFIRMAR = [
  { texto: 'CANCELAR', peligro: false },
  { texto: 'BORRAR', peligro: true }
];

// `aviso` es { titulo, lineas }. Lo pasa quien abre la ventana porque el texto
// dejó de ser uno solo: borrar una de tres partidas tiene que decir CUÁL, y eso
// no lo sabe esta función.
export function dibujarConfirmacion(ctx, cursor = 0, aviso = null) {
  const t = Tema.actual;
  const ancho = 330, alto = 128;
  const px = (ANCHO_UI - ancho) / 2;
  const py = (ALTO_UI - alto) / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(6,5,10,.78)';
  ctx.fillRect(0, 0, ANCHO_UI, ALTO_UI);
  panel(ctx, px, py, ancho, alto, '#a04a3c');

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `18px ${FUENTE_TITULO}`;
  ctx.fillStyle = '#e8b0a4';
  const titulo = (aviso && aviso.titulo) || '¿EMPEZAR DE CERO?';
  const lineas = (aviso && aviso.lineas) || [
    'Se pierden TODAS las monedas, las mejoras',
    'y las mascotas. No se puede deshacer.'
  ];
  textoEspaciado(ctx, titulo, ANCHO_UI / 2, py + 26, 3);

  ctx.font = `400 11px ${FUENTE}`;
  ctx.fillStyle = t.texto;
  for (let i = 0; i < lineas.length; i++) {
    ctx.fillText(lineas[i], ANCHO_UI / 2, py + 58 + i * 16);
  }

  // Antes esto eran dos rótulos que decían qué tecla hacía qué. Ahora son dos
  // BOTONES que se recorren, porque la pregunta se contesta con el mando igual
  // que todo lo demás del menú, y porque un aviso de "no se puede deshacer"
  // que solo entiende el teclado deja al del mando adivinando.
  const anchoBoton = 116, altoBoton = 26, hueco = 18;
  const x0 = (ANCHO_UI - (anchoBoton * 2 + hueco)) / 2;
  const yBoton = py + 104 - altoBoton / 2;

  for (let i = 0; i < CONFIRMAR.length; i++) {
    const o = CONFIRMAR[i];
    const bx = x0 + i * (anchoBoton + hueco);
    const elegido = i === cursor;
    const color = o.peligro ? COLOR_PELIGRO : t.titulo;

    ctx.beginPath();
    ctx.roundRect(bx, yBoton, anchoBoton, altoBoton, 5);
    if (elegido) {
      // Sumando luz sobre la piedra del panel, como el recuadro del menú del
      // título: un relleno opaco sobre un panel oscuro se lee como un parche.
      ctx.fillStyle = 'rgba(255,255,255,.10)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,.14)';
    }
    ctx.stroke();

    ctx.font = `600 12px ${FUENTE}`;
    ctx.fillStyle = elegido ? color : t.apagado;
    ctx.fillText(o.texto, bx + anchoBoton / 2, yBoton + altoBoton / 2 + 0.5);
  }

  ctx.restore();
}
