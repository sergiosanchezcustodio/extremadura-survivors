import { Recursos } from '../core/recursos.js';
import { ESCALA_ARTE } from '../core/constantes.js';
import { RejillaMapa } from './rejillaMapa.js';
import { Obstaculos } from './obstaculos.js';
import { CULL_X, CULL_Y } from '../entidades/enemigo.js';

// LAS MÁQUINAS EXPENDEDORAS DEL NIVEL 2 (y de cualquier nivel de recinto).
//
// Sergio dibujó cuatro máquinas y sus cuatro versiones rotas
// (resources/stages/2/maquinas_expendedora*.png). Van repartidas por el
// centro comercial, SIEMPRE PEGADAS A UNA PARED, en tiendas y en pasillos; se
// rompen a golpes y al romperse sueltan un consumible y se quedan ahí, rotas,
// hasta el final de la partida.
//
// Tres cosas distintas, y este módulo las junta porque las tres son "una
// máquina en un sitio":
//
//   1. DÓNDE HAY MÁQUINAS. Sale de la rejilla del mapa, no de una lista a
//      mano: una celda pisable con pared encima —la cara de un muro, que es
//      donde una máquina apoya la espalda— y espacio libre a los lados y por
//      delante. Se decide con una función de la posición, sin azar de partida,
//      así que dos máquinas de un cooperativo ven las mismas máquinas.
//   2. LA MÁQUINA ENTERA es un enemigo `esObjeto` como las antorchas de Mérida
//      (datos/enemigos.js): hereda gratis el daño de cualquier arma, el choque
//      sólido y la muerte con consumible. El pool de enemigos las recicla al
//      alejarse —como a todo— y aquí se vuelven a invocar al acercarse, con
//      memoria de cuáles siguen enteras.
//   3. LA MÁQUINA ROTA ya no es un enemigo: es decoración sólida. Va al
//      sistema de obstáculos (`fijos`), que ya sabe ordenarla por profundidad
//      con la horda y hacer que nadie la atraviese.
//
// Cero `new` durante la partida: las listas se preasignan al cargar el nivel.

// Cuántas como mucho. Sitio de sobra para el mapa entero: el reparto es una
// por parcela (ver PARCELA), y el centro comercial son unas 900 parcelas.
const MAX_MAQUINAS = 900;

// Lado de la PARCELA en unidades: una máquina como mucho por parcela, la de
// mejor hash de las que caben. 272 unidades son algo más de media pantalla de
// ancho: así salen repartidas por todo el mapa —tiendas y pasillos, arriba y
// abajo— y no amontonadas donde el recorrido empieza.
const PARCELA_UNIDADES = 272;

// Lo que ocupa una máquina, en unidades: 28 de ancho (el dibujo mide 28) y
// por delante 40 de ancho por 16 de fondo de suelo libre, para que no se
// plante en una puerta ni cierre un paso. Se pasa a celdas al repartir, sea
// cual sea la celda del nivel.
const ANCHO_MAQUINA = 28;
const DELANTE_ANCHO = 40;
const DELANTE_FONDO = 16;

// Separación mínima entre dos, en unidades lógicas. Media pantalla larga.
const SEPARACION = 190;

// Cada cuántos pasos se mira qué máquinas hay que invocar o retirar. A 60 Hz,
// diez pasos son 167 ms: nadie cruza el margen de culling en ese tiempo.
const PASOS_POR_REPASO = 10;

// A qué distancia de la cámara se invoca una máquina. Algo por dentro del
// culling del pool (CULL_X/CULL_Y), para que no oscile entre aparecer y
// reciclarse justo en el borde.
const ALCANCE_X = CULL_X * 0.85;
const ALCANCE_Y = CULL_Y * 0.85;

// Hash entero de una celda, para elegir qué sitios llevan máquina sin tirar
// del RNG de la partida. Determinista y barato; el mismo de core/rejilla.js.
function hash(cx, cy) {
  let h = (cx * 374761393 + cy * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function crearSitio() {
  return {
    x: 0, y: 0,        // pies de la máquina, en unidades lógicas
    tipo: 0,           // 0-3: cuál de las cuatro
    rota: false,
    // El enemigo que la representa mientras está entera y en pantalla, o
    // null. Se comprueba contra `expendedora` del propio enemigo antes de
    // fiarse: el pool recicla el objeto y puede ser ya otro bicho.
    entidad: null
  };
}

// Una máquina rota, con los campos que copia sistemas/obstaculos.js a sus
// instancias (ver `_colocarFijos` allí): caja sólida centrada en (cx, cy) y
// dibujo apoyado en (x, y). El dibujado lo pone el obstáculo.
function crearRota() {
  return {
    x: 0, y: 0, yVista: 0,
    cx: 0, cy: 0, hx: 0, hy: 0,
    img: null, w: 0, h: 0
  };
}

export const Expendedoras = {
  activas: false,
  sitios: null,
  n: 0,
  _rotas: null,        // instancias de obstáculo, una por sitio
  _pasos: 0,
  _vivo: null,         // Uint8Array por sitio: hay entidad activa en el pool

  // Al cargar un nivel. Sin rejilla no hay máquinas: Mérida sigue como estaba.
  iniciar() {
    this.activas = false;
    this.n = 0;
    if (!RejillaMapa.activa) return;

    if (!this.sitios) {
      this.sitios = new Array(MAX_MAQUINAS);
      this._rotas = new Array(MAX_MAQUINAS);
      this._vivo = new Uint8Array(MAX_MAQUINAS);
      for (let i = 0; i < MAX_MAQUINAS; i++) {
        this.sitios[i] = crearSitio();
        this._rotas[i] = crearRota();
      }
    }
    this._repartir();
    this.activas = this.n > 0;
    Obstaculos.fijos = this._rotas;
    Obstaculos.nFijos = 0;
    this.reiniciar();
  },

  // Al empezar cada partida: todas enteras y ninguna invocada.
  reiniciar() {
    for (let i = 0; i < this.n; i++) {
      this.sitios[i].rota = false;
      this.sitios[i].entidad = null;
    }
    if (this._vivo) this._vivo.fill(0);
    Obstaculos.nFijos = 0;
    this._pasos = 0;
  },

  // DÓNDE VAN. Se recorre la rejilla de colisión (celdas de 8) buscando sitios
  // que cumplan:
  //
  //   - la celda y sus dos vecinas laterales se pisan (ni sólidas ni pie de
  //     nada): la máquina mide tres celdas de ancho;
  //   - las tres de ENCIMA son pie de pared o pared: es donde apoya la
  //     espalda, y en la perspectiva 3/4 la parte alta de la máquina tapa esa
  //     cara, que es justo lo que hace una máquina contra un muro;
  //   - las tres de abajo, y la fila siguiente, se pisan: no se planta en una
  //     puerta ni cierra un paso de una celda;
  //   - el símbolo del suelo no es una puerta.
  //
  // De los sitios que cumplen, UNO POR PARCELA (el de mejor hash, ver
  // PARCELA), y de esos, los que quedan a más de SEPARACION de cualquier ya
  // puesto. Todo es función de la rejilla, así que el resultado es el mismo
  // en cualquier máquina.
  _repartir() {
    const R = RejillaMapa;
    const c = R.celda;
    const ancho = R.ancho, alto = R.alto;
    const solido = R.solido, pie = R.pie, tipo = R.tipo;
    const sitios = this.sitios;

    const pisable = (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= ancho || cy >= alto) return false;
      const i = cy * ancho + cx;
      return solido[i] === 0 && pie[i] === 0;
    };
    // CONTRA UNA PARED, no contra una estantería ni un mostrador: la celda de
    // encima es pie o muro, y mirando hacia arriba lo primero sólido que hay
    // es pared. Apoyada en una estantería, la máquina tapaba el género y
    // parecía parte del lineal.
    const tipoPared = R.simbolos.findIndex((ch) => R.leyenda && R.leyenda[ch] && R.leyenda[ch].nombre === 'pared');
    const respaldo = (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= ancho || cy >= alto) return false;
      const i = cy * ancho + cx;
      if (solido[i] !== 1 && pie[i] !== 1) return false;
      for (let k = 0; k <= R.alturaMax; k++) {
        const a = i - k * ancho;
        if (a < 0) return false;
        if (solido[a] === 1) return tipoPared < 0 || tipo[a] === tipoPared;
      }
      return false;
    };
    // Que lo de detrás no sea una PUERTA: empiezan cerradas y sólidas, así
    // que pasarían por pared, y al abrirlas la máquina taparía el paso. Se
    // miran las cuatro celdas de encima porque la puerta tiene dos de cara.
    const grupoDe = R.grupoDe;
    const sinPuerta = (cx, cy) => {
      for (let dy = 1; dy <= 4 * Math.max(1, 8 / c); dy++) {
        const yy = cy - dy;
        if (yy < 0) break;
        if (grupoDe && grupoDe[tipo[yy * ancho + cx]] >= 0) return false;
      }
      return true;
    };

    // Una por parcela: la de mejor hash. Se guarda la celda ganadora y su
    // hash por parcela; al cargar el nivel, así que estos dos arrays no
    // cuentan como asignación de partida.
    const PARCELA = Math.max(1, Math.round(PARCELA_UNIDADES / c));
    const semi = Math.ceil(ANCHO_MAQUINA / 2 / c);        // celdas a cada lado
    const semiDelante = Math.ceil(DELANTE_ANCHO / 2 / c);
    const fondo = Math.ceil(DELANTE_FONDO / c);
    const pAncho = Math.ceil(ancho / PARCELA), pAlto = Math.ceil(alto / PARCELA);
    const mejorCelda = new Int32Array(pAncho * pAlto).fill(-1);
    const mejorHash = new Uint32Array(pAncho * pAlto).fill(0xffffffff);

    for (let cy = 2; cy < alto - fondo - 1; cy++) {
      for (let cx = semiDelante; cx < ancho - semiDelante; cx++) {
        let vale = true;
        for (let dx = -semi; dx <= semi && vale; dx++) {
          if (!pisable(cx + dx, cy) || !respaldo(cx + dx, cy - 1) || !sinPuerta(cx + dx, cy)) vale = false;
        }
        if (!vale) continue;
        // Sitio por delante: `fondo` filas libres, DELANTE_ANCHO de ancho.
        let libre = true;
        for (let dy = 1; dy <= fondo && libre; dy++)
          for (let dx = -semiDelante; dx <= semiDelante; dx++)
            if (!pisable(cx + dx, cy + dy)) { libre = false; break; }
        if (!libre) continue;

        const h = hash(cx, cy);
        const pk = ((cy / PARCELA) | 0) * pAncho + ((cx / PARCELA) | 0);
        if (h < mejorHash[pk]) { mejorHash[pk] = h; mejorCelda[pk] = cy * ancho + cx; }
      }
    }

    let n = 0;
    for (let pk = 0; pk < mejorCelda.length && n < MAX_MAQUINAS; pk++) {
      const i = mejorCelda[pk];
      if (i < 0) continue;
      const cx = i % ancho, cy = (i / ancho) | 0;
      const x = cx * c + c / 2;
      // Los pies en el borde SUPERIOR de la celda: justo donde acaba la cara
      // del muro. Antes iban en el inferior, y como además la caja de la
      // máquina chocaba contra el pie del muro y la empujaba, quedaba una
      // celda y pico de suelo entre la máquina y la pared. Sergio quiere las
      // máquinas completamente pegadas al muro, y una máquina no se mueve en
      // toda la partida, así que ni la caja necesita chocar con la pared (ver
      // colisionarParedes en main.js).
      const y = cy * c;
      // Dos parcelas vecinas pueden dar dos sitios pegados en la costura: se
      // respeta la separación mínima igual.
      let lejos = true;
      for (let k = 0; k < n; k++) {
        const dx = sitios[k].x - x, dy = sitios[k].y - y;
        if (dx * dx + dy * dy < SEPARACION * SEPARACION) { lejos = false; break; }
      }
      if (!lejos) continue;
      const s = sitios[n++];
      s.x = x; s.y = y;
      s.tipo = hash(cy, cx) & 3;
      s.rota = false;
      s.entidad = null;
    }
    this.n = n;
  },

  // Cada pocos pasos: invocar las enteras que están cerca y no están en el
  // pool, y tener al día la lista de rotas cercanas para los obstáculos.
  actualizar(camara, enemigos) {
    if (!this.activas) return;
    if (++this._pasos < PASOS_POR_REPASO) return;
    this._pasos = 0;

    // Qué sitios tienen entidad viva AHORA. Se mira el pool y no la referencia
    // guardada porque el pool recicla objetos: la referencia puede apuntar a
    // una serpiente que nació en el mismo hueco después del culling.
    const vivo = this._vivo;
    vivo.fill(0);
    const items = enemigos.pool.items;
    const nAct = enemigos.pool.activos;
    for (let k = 0; k < nAct; k++) {
      const e = items[k];
      if (e.expendedora >= 0 && e.vida > 0) vivo[e.expendedora] = 1;
    }

    let nFijos = 0;
    const rotas = this._rotas;
    for (let i = 0; i < this.n; i++) {
      const s = this.sitios[i];
      const cerca = Math.abs(s.x - camara.x) < ALCANCE_X && Math.abs(s.y - camara.y) < ALCANCE_Y;
      if (s.rota) {
        // Rota y cerca: obstáculo sólido y dibujo. Lejos no hace falta que
        // exista para nadie.
        if (cerca) this._ponerRota(rotas[nFijos++], s);
        continue;
      }
      if (vivo[i] || !cerca) continue;
      const e = enemigos.aparecer('expendedora' + (s.tipo + 1), s.x, s.y, 1, 1);
      if (!e) break;                      // pool lleno: se reintenta al siguiente repaso
      e.expendedora = i;
      s.entidad = e;
    }
    Obstaculos.nFijos = nFijos;
  },

  _ponerRota(o, s) {
    const id = 'expendedoraRota' + (s.tipo + 1);
    const meta = Recursos.meta(id);
    o.x = s.x; o.y = s.y; o.yVista = s.y;
    o.img = Recursos.imagen(id);
    if (!meta || !o.img) { o.img = null; o.w = o.h = 0; o.hx = o.hy = 0; return; }
    o.w = meta.w; o.h = meta.h;
    // La caja sólida: casi todo el ancho del dibujo y la mitad de alto, como
    // `huellaDe` en sistemas/obstaculos.js hace con una mole baja. Una máquina
    // rota es un armatoste apoyado en la pared: se rodea, no se pisa.
    const anchoLog = meta.w / ESCALA_ARTE, altoLog = meta.h / ESCALA_ARTE;
    o.hx = anchoLog * 0.42;
    o.hy = Math.min(o.hx, altoLog * 0.5);
    o.cx = s.x;
    o.cy = s.y - o.hy;
  },

  // La ha roto alguien. Lo llama Enemigos.danyar al caer un `esObjeto` con
  // `expendedora` puesto (ver `alRomper` en main.js). A partir de aquí el sitio
  // deja de invocar máquina y pasa a poner la rota.
  romper(e) {
    const i = e.expendedora;
    if (i < 0 || i >= this.n) return;
    const s = this.sitios[i];
    s.rota = true;
    s.entidad = null;
    // Que el obstáculo aparezca YA, sin esperar al repaso: el jugador está
    // encima y podría cruzar el hueco antes de que la rota sea sólida.
    this._pasos = PASOS_POR_REPASO;
  }
};
