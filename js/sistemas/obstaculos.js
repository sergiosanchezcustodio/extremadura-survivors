import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { ENEMIGOS } from '../datos/enemigos.js';

// Objetos sólidos del escenario: columnas, antorchas, estatuas y ruinas a los
// lados de la calzada (datos/niveles/merida.js, campo `decoracion`). Bloquean
// tanto a jugadores como a enemigos (ver sistemas/colisiones.js,
// `colisionarObstaculos`).
//
// Son ESTÁTICOS y pocos —una decena por pantalla como mucho—, así que no
// llevan Pool ni entran en la rejilla espacial de enemigos: un array
// preasignado que se reescribe EN EL SITIO cuando la fila de tile visible
// cambia. Cero asignación durante la partida salvo al cargar el nivel.
//
// La plantilla del nivel está en coordenadas LOCALES a un tile de suelo (0 al
// ancho/alto de `niveles/<mapa>.png` ya procesado); este módulo la repite
// hacia arriba y hacia abajo igual que el propio suelo se repite por hash.

function dibujarObstaculo(ctx) {
  if (!this.img) return;
  // Mismo cuadre a píxel físico entero que usa Enemigos.dibujar: sin esto el
  // sprite tiembla al desplazarse la cámara aunque el objeto no se mueva.
  const cxF = Math.round(this.x * ESCALA_ARTE);
  const cyF = Math.round(this.y * ESCALA_ARTE);
  ctx.drawImage(this.img,
    (cxF - (this.w >> 1)) / ESCALA_ARTE, (cyF - this.h) / ESCALA_ARTE,
    this.w / ESCALA_ARTE, this.h / ESCALA_ARTE);
}

function crearInstancia() {
  return {
    x: 0, y: 0, yVista: 0,
    // HUELLA: caja (hx, hy) centrada en (cx, cy). `cy` no es `y`: la posición
    // de un obstáculo es la línea donde se apoya su dibujo, y la huella sube
    // desde ahí. Ver `huellaDe`.
    cx: 0, cy: 0, hx: 0, hy: 0,
    img: null, w: 0, h: 0,
    dibujar: dibujarObstaculo
  };
}

// De qué tamaño es lo sólido de un obstáculo, a partir de su dibujo. Es una
// CAJA (media anchura, media altura) centrada en (x, cy) — ver `empujarFueraDe`
// en sistemas/colisiones.js para por qué caja y no círculo ni elipse.
//
// UNA SOLA REGLA para cosas que no se parecen en nada, y esa es la gracia:
//
//   hx = 0.47 del ancho    — lo sólido es casi tan ancho como el dibujo.
//   hy = la mitad del alto, PERO NUNCA MÁS QUE hx.
//
// Léase: *una mole ancha y baja es sólida de arriba abajo; una cosa alta y
// estrecha solo ocupa su base*. Que es exactamente la diferencia entre unas
// ruinas —124x110 de escombro tirado por el suelo— y una columna —26x80, de la
// que solo estorba el pie mientras el fuste se te va por encima del hombro—.
//
// Y EL TAMAÑO SALE DEL DIBUJO MEDIDO, no de su recuadro.
//
// Ese fue el fallo de la versión anterior: se bloqueaba el recuadro entero del
// sprite, pero una ruina solo llena el 60-69% del suyo. El resto son esquinas
// vacías y flecos transparentes, y ahí no hay piedra que estorbe — se bloqueaba
// aire, y bastante.
//
// La herramienta mide en frío qué filas y columnas del sprite tienen masa de
// verdad y publica ese recorte en el atlas como `solido` (ver el paso 7 de
// `Procesar` en herramientas/procesar-assets.ps1). Aquí solo se traduce a
// unidades lógicas. Sin ese campo —un sprite que llena su recuadro— se usa el
// recuadro, que entonces es la respuesta correcta.
//
// `meta.solido` viene en píxeles FÍSICOS del sprite y relativo a su esquina
// superior izquierda; el sprite se dibuja centrado en x y apoyado en y, así que
// hay que llevar ese recorte al mismo sitio.
function huellaDe(inst, meta, anchoLog, altoLog) {
  const s = meta.solido;
  if (s) {
    const escala = anchoLog / meta.w;          // físico -> lógico
    inst.hx = (s[2] * escala) / 2;
    inst.hy = Math.min((s[3] * escala) / 2, inst.hx);
    // El centro de la CAJA no tiene por qué caer en la posición del obstáculo:
    // si la masa está descentrada dentro del sprite, la caja se descentra con
    // ella. Va en `cx`/`cy` propios y NO en `x`/`y`, que son los del dibujo.
    inst.cx = inst.x + (s[0] + s[2] / 2 - meta.w / 2) * escala;
    // Borde inferior de la masa, respecto a la línea de base del sprite.
    const baseY = inst.y - (meta.h - (s[1] + s[3])) * escala;
    inst.cy = baseY - inst.hy;
  } else {
    inst.hx = 0.47 * anchoLog;
    inst.hy = Math.min(0.5 * altoLog, inst.hx);
    inst.cx = inst.x;
    inst.cy = inst.y - inst.hy;
  }
}

export const Obstaculos = {
  items: [],
  activos: 0,
  _plantilla: null,
  _filaBase: NaN,     // fuerza el primer cálculo
  _dePlantilla: 0,    // cuántos `items` son de la plantilla; detrás van los fijos
  _filasConTorchas: null,  // filas cuyo destruible ya está invocado y sigue cerca

  // OBSTÁCULOS FIJOS DE OTRO SISTEMA: hoy, las máquinas expendedoras rotas
  // del nivel 2 (sistemas/expendedoras.js). Quien los pone rellena `fijos`
  // con instancias de la misma forma que `crearInstancia` y dice cuántas
  // valen en `nFijos`; aquí se cuelan al final de `items` en cada repaso, y a
  // partir de ahí son un obstáculo más: los ordena por profundidad
  // Enemigos.dibujar y los hace sólidos colisionarObstaculos. Es lo que
  // permite que otro sistema tenga cosas sólidas sin duplicar nada de esto.
  fijos: null,
  nFijos: 0,
  _capFijos: 80,

  iniciar(nivel) {
    this._plantilla = nivel.decoracion || [];
    // Tres filas de tile (la central más un margen arriba y abajo) por
    // entrada de plantilla: de sobra para cubrir el viewport sin recalcular
    // cada frame según el usuario avanza. Y sitio para los fijos.
    const capacidad = Math.max(1, this._plantilla.length) * 3 + this._capFijos;
    this.items = new Array(capacidad);
    for (let i = 0; i < capacidad; i++) this.items[i] = crearInstancia();
    this.fijos = null;
    this.nFijos = 0;
    this.activos = 0;
    this._filasConTorchas = new Set();
    this.reiniciar();
  },

  // DEJAR EL MAPA COMO RECIÉN CARGADO, al empezar cada partida.
  //
  // Sin esto, la decoración solo salía en la PRIMERA partida de cada sesión.
  // `_filaBase` recuerda sobre qué fila de tiles se calculó el reparto: al
  // empezar la segunda partida la cámara vuelve al mismo sitio, `filaCentro`
  // coincide con lo que quedó apuntado y `actualizar` se va por la primera
  // línea dando el trabajo por hecho. Y `_filasConTorchas` es peor todavía,
  // porque su propósito es no repetir una fila NUNCA: las antorchas y los
  // enemigos colocados en el mapa se invocaban una vez en la vida de la
  // pestaña y no volvían a aparecer.
  //
  // Jugando se ve como "la segunda partida tiene el mapa pelado". Lo encontró
  // la prueba de determinismo, no el ojo: la primera partida tras recargar
  // soltaba 18 enemigos en el primer fotograma y la segunda ninguno.
  reiniciar() {
    this.activos = 0;
    this._filaBase = NaN;              // NaN nunca es igual a nada: fuerza el recálculo
    if (this._filasConTorchas) this._filasConTorchas.clear();
  },

  // Una vez por paso de lógica. Si la fila de tile bajo la cámara no ha
  // cambiado desde el último cálculo, las instancias activas siguen siendo
  // válidas y no se toca nada.
  //
  // `enemigos` es opcional y solo hace falta para las entradas DESTRUIBLES de
  // la plantilla (antorchas): esas no se guardan aquí como Obstaculo de solo
  // dibujo, se dan de alta en el pool de enemigos (ver datos/enemigos.js,
  // `esObjeto`) para heredar gratis el daño de cualquier arma, el choque
  // sólido y la muerte con su efecto. El resto de la decoración (columnas,
  // estatuas, ruinas) sigue el camino de siempre.
  // Saca a `e` de cualquier obstáculo en el que haya caído dentro.
  //
  // Lo usan los objetos del suelo: un consumible que aparece detrás de una
  // columna o dentro de unas ruinas es un objeto que no se puede recoger, porque
  // el jugador no puede llegar hasta él —el obstáculo le frena antes—. Sergio se
  // encontró varios así.
  //
  // Recorre los obstáculos activos y no la rejilla porque son una decena por
  // pantalla como mucho (ver la nota de arriba), y esto se llama unas pocas
  // veces por segundo, no por entidad y frame.
  apartar(e, margen) {
    const items = this.items;
    for (let k = 0; k < this.activos; k++) {
      const o = items[k];
      // MISMA CAJA que usa la física (ver `huellaDe` y `empujarFueraDe` en
      // sistemas/colisiones.js). Tiene que ser la misma forma: si aquí se
      // usara otra, un objeto podría quedar fuera del apartado pero dentro de
      // lo sólido — que es exactamente el fallo que esta función evita.
      const hx = o.hx + margen;
      const hy = o.hy + margen;
      const dx = e.x - o.cx;
      const dy = e.y - o.cy;
      if (dx < -hx || dx > hx || dy < -hy || dy > hy) continue;
      // Dentro: se sale por el lado más cercano.
      const izq = dx + hx, der = hx - dx;
      const arr = dy + hy, aba = hy - dy;
      let m = izq;
      if (der < m) m = der;
      if (arr < m) m = arr;
      if (aba < m) m = aba;
      if (m === izq)      e.x -= izq;
      else if (m === der) e.x += der;
      else if (m === arr) e.y -= arr;
      else                e.y += aba;
    }
  },

  // POR QUÉ LAS ANTORCHAS VUELVEN A CRECER.
  //
  // Esto era un Set que no se vaciaba nunca: una fila de tile invocaba sus
  // antorchas la primera vez que la cámara pasaba por ella y no volvía a
  // hacerlo en toda la partida. Y en un juego de horda no se avanza, se DA
  // VUELTAS por la misma zona: rompías las antorchas de tu tramo en el primer
  // minuto y ya no salía ni una más donde estabas jugando. Visto desde fuera es
  // exactamente lo que contaba Sergio —"aparecen casi todas al inicio y luego
  // apenas se muestran"—, y no era una cuestión de cuántas hay, sino de que el
  // mapa se quedaba pelado por detrás.
  //
  // Ahora una fila se OLVIDA cuando la cámara se va lo bastante lejos, así que
  // al volver está otra vez poblada, igual que el suelo, que también se repite
  // por hash y no recuerda por dónde se ha pasado.
  //
  // DOS FILAS DE DISTANCIA, y el número no es de gusto. El peligro que había
  // que evitar es duplicar antorchas VIVAS: repoblar una fila cuyas antorchas
  // siguen en pie pondría dos en cada sitio. A dos filas, lo más cerca que
  // puede quedar una antorcha de esa fila son 430 unidades (un tile entero), y
  // el culling se lleva cualquier enemigo no persistente pasadas 405 (CULL_Y en
  // entidades/enemigo.js). O sea que cuando una fila se olvida, lo que había en
  // ella ya no existe. Con una sola fila de margen no se cumpliría, y oscilar
  // sobre una costura llenaría el tramo de teas dobles.
  _olvidarFilasLejanas(filaCentro) {
    const filas = this._filasConTorchas;
    for (const fila of filas) {
      if (Math.abs(fila - filaCentro) >= 2) filas.delete(fila);
    }
  },

  // Los fijos van detrás de lo que haya puesto la plantilla. `desde` es
  // cuántos hay de plantilla; se llama en cada repaso, también cuando la
  // fila no ha cambiado, porque una máquina puede romperse sin que la cámara
  // cambie de fila.
  _colocarFijos(desde) {
    let k = desde;
    const n = this.fijos ? Math.min(this.nFijos, this._capFijos) : 0;
    // Se COPIAN los campos a las instancias propias en vez de meter la
    // referencia ajena: `items` es un pool que la plantilla reescribe en el
    // sitio, y con la referencia dentro acabaría escribiendo en el objeto de
    // otro sistema.
    for (let i = 0; i < n && k < this.items.length; i++) {
      const f = this.fijos[i], o = this.items[k++];
      o.x = f.x; o.y = f.y; o.yVista = f.yVista;
      o.cx = f.cx; o.cy = f.cy; o.hx = f.hx; o.hy = f.hy;
      o.img = f.img; o.w = f.w; o.h = f.h;
    }
    this.activos = k;
  },

  actualizar(camaraY, enemigos) {
    const altoTile = Recursos.altoSuelo;
    if (!altoTile || !this._plantilla || this._plantilla.length === 0) {
      this._colocarFijos(0);
      return;
    }

    const filaCentro = Math.floor(camaraY / altoTile);
    if (filaCentro === this._filaBase) { this._colocarFijos(this._dePlantilla); return; }
    this._filaBase = filaCentro;
    this._olvidarFilasLejanas(filaCentro);

    let k = 0;
    for (let fila = filaCentro - 1; fila <= filaCentro + 1; fila++) {
      const origenY = fila * altoTile;
      // Una fila se invoca una vez MIENTRAS SIGA CERCA, no una vez en toda la
      // partida. Ver `_olvidarFilasLejanas`: la diferencia es la razón entera
      // de que las antorchas parecieran salir casi todas al principio.
      const yaInvocadaFila = this._filasConTorchas.has(fila);

      for (let i = 0; i < this._plantilla.length; i++) {
        const entrada = this._plantilla[i];

        if (ENEMIGOS[entrada.tipo]) {
          if (!yaInvocadaFila && enemigos) {
            enemigos.aparecer(entrada.tipo, entrada.x, origenY + entrada.y, 1, 1);
          }
          continue;
        }

        if (k >= this.items.length) continue;
        const meta = Recursos.meta(entrada.tipo);
        if (!meta) continue;    // atlas sin esa entrada: se omite, no rompe

        const inst = this.items[k++];
        const anchoLog = meta.w / ESCALA_ARTE;
        const altoLog = meta.h / ESCALA_ARTE;
        inst.x = entrada.x;
        inst.y = origenY + entrada.y;
        inst.yVista = inst.y;
        huellaDe(inst, meta, anchoLog, altoLog);
        inst.img = Recursos.imagen(entrada.tipo);
        inst.w = meta.w;
        inst.h = meta.h;
      }
      this._filasConTorchas.add(fila);
    }
    this._dePlantilla = k;
    this._colocarFijos(k);
  }
};
