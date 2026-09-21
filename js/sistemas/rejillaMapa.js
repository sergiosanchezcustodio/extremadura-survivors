// LA REJILLA DEL MAPA: paredes, persecución por pasillos y dónde se puede
// aparecer. Es lo que convierte un nivel en un sitio con forma.
//
// Mérida no lo usa y no lo necesita: allí el mundo es una calzada que repite
// sin límite hacia el norte, con una docena de columnas sueltas que ya lleva
// sistemas/obstaculos.js. Este módulo es para el otro tipo de nivel —el CC The
// Lighthouse—: un recinto CERRADO, de tamaño conocido, con cientos de paredes.
//
// POR QUÉ NO SIRVE `obstaculos.js` PARA ESTO. Aquel guarda una lista de cajas y
// las recorre entera por cada jugador: correcto con quince columnas, ruina con
// las ~2100 celdas de pared de un centro comercial. Aquí no hay lista que
// recorrer: la posición DICE en qué celda estás, y mirar si hay pared es un
// acceso a un array. El coste no depende de cuántas paredes tenga el mapa.
//
// Todo lo de aquí es DETERMINISTA y no toca el azar: las mismas posiciones dan
// el mismo campo de flujo en las dos máquinas de un cooperativo. No hay una sola
// llamada a Math.random ni al RNG de la partida.

// Cada cuántos pasos de simulación se rehace el campo de flujo. A 60 Hz, 6 pasos
// son 100 ms: más que suficiente para que la horda no note el desfase —nadie
// cruza un pasillo en una décima— y seis veces más barato que hacerlo cada paso.
const PASOS_POR_CAMPO = 6;

// Celdas de cara que enseña cada cosa con altura en la perspectiva 3/4, por el
// `nombre` de la leyenda. Un nivel lo cambia con `alturasMapa`. Lo que no esté
// aquí ni allí es plano: solo tapa, y su pie no ocupa nada.
export const ALTURA_POR_NOMBRE = { pared: 2, 'estantería': 3, mostrador: 2, puerta: 2 };

// Distancia "infinita" del campo: una celda a la que no se llega. Cabe en el
// Uint16Array y ninguna distancia real se le acerca (el mapa entero son 8064
// celdas, así que el camino más largo posible es mucho menor).
const LEJOS = 0xffff;

// Los ocho vecinos, empezando por los cuatro rectos. El orden importa para que
// dos máquinas elijan el MISMO vecino cuando hay empate de distancia.
const VX = [1, -1, 0, 0, 1, 1, -1, -1];
const VY = [0, 0, 1, -1, 1, -1, 1, -1];

// Hasta dónde se descubre el mapa alrededor de cada jugador, en celdas de
// navegación (16 unidades cada una). 19 celdas son 304 unidades: algo más que la
// media diagonal del visor, o sea "lo que da tiempo a ver de pasada".
const RADIO_VISTA = 19;

// HASTA DÓNDE LLEGA EL CAMPO DE FLUJO, en celdas de navegación. 110 celdas son
// 1760 unidades: entre tres y cuatro pantallas en todas las direcciones.
//
// Sin este tope, la búsqueda recorre el mapa ENTERO cada vez que se rehace, y el
// mapa ha pasado de 64 pantallas a 509: eran 32.000 celdas y son 258.000. Con el
// tope, el coste deja de depender del tamaño del mapa para siempre —da igual que
// mañana sean mil pantallas— y no se pierde nada, porque a más de tres pantallas
// no hay enemigos: el reciclado por lejanía se los ha llevado antes.
//
// A quien quede fuera del alcance le contesta `direccionEn` que no hay camino, y
// entonces persigue en línea recta como en Mérida. Está a tres pantallas y a
// nadie le importa lo que haga.
const ALCANCE_CAMPO = 110;

// DESCOMPRIMIR UNA FILA guardada por tramos (ver `codificacion` en el fichero de
// datos): el símbolo y detrás cuántas celdas iguales van seguidas, nada si va
// una sola. Los símbolos nunca son dígitos, así que basta con mirar si lo que
// viene detrás lo es.
function descomprimirFila(tramos, ancho) {
  let fila = '';
  let i = 0;
  while (i < tramos.length) {
    const ch = tramos[i++];
    let n = 0;
    while (i < tramos.length && tramos[i] >= '0' && tramos[i] <= '9') {
      n = n * 10 + (tramos.charCodeAt(i++) - 48);
    }
    fila += ch.repeat(n || 1);
  }
  // Una fila corta o larga es un fichero de datos corrupto, y es mejor que se
  // note aquí que tres pantallas más adelante con las paredes descuadradas.
  if (fila.length !== ancho) {
    throw new Error(`fila de mapa de ${fila.length} celdas, se esperaban ${ancho}`);
  }
  return fila;
}

export const RejillaMapa = {
  activa: false,

  celda: 32,
  ancho: 0,           // en celdas
  alto: 0,
  anchoMundo: 0,      // en unidades lógicas
  altoMundo: 0,

  solido: null,       // Uint8Array: 1 pared, 0 transitable
  tipo: null,         // Uint8Array: índice en `simbolos`, para pintar
  simbolos: null,     // los caracteres de la leyenda, en el orden del índice

  inicio: { x: 0, y: 0 },      // en unidades lógicas
  salidas: [],                 // en unidades lógicas

  // LAS PUERTAS QUE ABREN LOS JEFES. Cada grupo trae su nombre ('gris', 'azul',
  // 'verde'), quién lo abre ('10min', '20min', 'final'), si ya está abierto y la
  // lista de celdas que ocupa. Es lo que divide el centro comercial en tres
  // anillos: al empezar solo se juega el de dentro.
  puertas: null,
  grupoDe: null,               // índice de símbolo -> grupo de puerta, o -1

  // Campo de flujo hacia los jugadores, sobre la REJILLA DE NAVEGACIÓN (ver
  // `_prepararNavegacion`), que es más basta que la de colisión.
  navAncho: 0,
  navAlto: 0,
  navCelda: 0,
  navSolido: null,
  _dist: null,
  navSolidoAncho: null,   // la rejilla con las paredes engordadas una celda más
  _distAncho: null,       // y su campo de flujo, para los cuerpos grandes
  _fin: 0,                // cuántos orígenes sembró el último BFS
  _cola: null,
  _pasos: 0,

  // LO QUE SE HA VISTO, por celda de navegación. Es la niebla del mapa: el
  // centro comercial no se enseña entero, se descubre andando.
  //
  // Va en la rejilla de navegación y no en la fina por dos razones: 32.256
  // celdas son la resolución justa para un minimapa de 224x144 píxeles, y
  // marcar un disco de veinte celdas de radio cuesta cuatro veces menos.
  visto: null,
  celdasVistas: 0,        // cualquiera: sirve para saber si hay que repintar
  // Cuántas veces ha cambiado LO QUE SE PINTA del suelo: sube al abrir o cerrar
  // puertas. Lo mira el caché por trozos de sistemas/sueloRejilla.js para saber
  // qué trozos tiene que volver a componer.
  versionSuelo: 0,
  transitablesVistas: 0,  // solo las pisables: es el "explorado" que se enseña
  navTransitables: 0,     // cuántas hay en total, para el porcentaje

  // A qué celda transitable se corre lo que aparezca dentro de una pared.
  _refugio: null,

  // APAGARLA, que es el estado de todo nivel que no traiga mapa de rejilla.
  // Se llama SIEMPRE al cargar un nivel, también al cargar Mérida: sin esto,
  // volver a Mérida después de jugar The Lighthouse dejaría las paredes del
  // centro comercial puestas en la calzada.
  apagar() {
    this.activa = false;
    this.solido = null;
    this.tipo = null;
    this.anchoMundo = 0;
    this.altoMundo = 0;
    this.salidas.length = 0;
  },

  // `mapa` es el objeto de datos/niveles/<nivel>-mapa.js tal cual.
  // `alturas` es símbolo → celdas de CARA que enseña lo sólido de ese símbolo
  // en la perspectiva 3/4 (ver `pie`). Lo que no venga usa lo de su nombre.
  iniciar(mapa, leyenda, celda, alturas = {}) {
    this.celda = celda;
    this.ancho = mapa.ancho;
    this.alto = mapa.alto;
    this.anchoMundo = mapa.ancho * celda;
    this.altoMundo = mapa.alto * celda;

    const n = this.ancho * this.alto;
    this.solido = new Uint8Array(n);
    this.tipo = new Uint8Array(n);
    this.simbolos = Object.keys(leyenda);
    this.leyenda = leyenda;       // quien quiera saber qué es un símbolo (expendedoras)

    // LA ALTURA DE CADA SÍMBOLO, en celdas de cara. Es dato de SIMULACIÓN y no
    // solo de dibujo: la cara de una pared no se pisa (ver `pie`), así que
    // tiene que salir de la leyenda y del nivel, nunca de una imagen que
    // pueda no cargar — dos máquinas de un cooperativo han de coincidir.
    this.altura = new Uint8Array(this.simbolos.length);
    this.alturaMax = 0;
    for (let k = 0; k < this.simbolos.length; k++) {
      const ch = this.simbolos[k];
      const def = leyenda[ch];
      if (!def || !def.solido) continue;
      const h = alturas[ch] !== undefined ? alturas[ch]
        : (def.puerta ? ALTURA_POR_NOMBRE.puerta : (ALTURA_POR_NOMBRE[def.nombre] || 0));
      this.altura[k] = h;
      if (h > this.alturaMax) this.alturaMax = h;
    }

    // Qué grupo de puerta es cada símbolo, resuelto UNA vez a un número por
    // índice de símbolo. Durante la partida se pregunta por celda, y ahí no se
    // buscan claves en un objeto.
    this.grupoDe = new Int8Array(this.simbolos.length).fill(-1);
    this.puertas = [];
    for (let k = 0; k < this.simbolos.length; k++) {
      const def = leyenda[this.simbolos[k]];
      if (!def || !def.puerta) continue;
      let g = this.puertas.findIndex((p) => p.nombre === def.puerta);
      if (g < 0) {
        g = this.puertas.length;
        this.puertas.push({ nombre: def.puerta, abre: def.abre || '', abierta: false, celdas: [] });
      }
      this.grupoDe[k] = g;
    }

    const porTramos = mapa.codificacion === 'tramos';
    for (let y = 0; y < this.alto; y++) {
      const fila = porTramos ? descomprimirFila(mapa.filas[y], this.ancho) : mapa.filas[y];
      for (let x = 0; x < this.ancho; x++) {
        const ch = fila[x];
        const i = y * this.ancho + x;
        const def = leyenda[ch];
        // Un carácter que no esté en la leyenda es pared. Es lo seguro: un
        // símbolo desconocido tratado como suelo abre un agujero al vacío.
        this.solido[i] = !def || def.solido ? 1 : 0;
        const t = this.simbolos.indexOf(ch);
        this.tipo[i] = t < 0 ? 0 : t;
        // Las celdas de cada puerta se apuntan al cargar: abrirla es recorrer su
        // lista, no barrer el millón de celdas del mapa buscándolas.
        const g = t < 0 ? -1 : this.grupoDe[t];
        if (g >= 0) this.puertas[g].celdas.push(i);
      }
    }

    // EL PIE DE LO QUE TIENE ALTURA. En 3/4 la cara de una pared se pinta sobre
    // las celdas de suelo que tiene al sur, y esa franja NO SE PISA: es la
    // pared vista de frente, no suelo. `pie[i] = 1` marca esas celdas y
    // `solidoEnCelda` las trata como pared para todo —jugadores, horda,
    // disparos, apariciones y navegación—, mientras `solido` sigue diciendo
    // qué es muro de verdad, que es lo que mira el dibujo para poner tapa o
    // cara. Se calcula una vez aquí y se rehace al abrir o cerrar puertas,
    // que es lo único que cambia lo sólido en partida.
    this.pie = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.pie[i] = this._pieDe(i);
    // Y, por puerta, las celdas de pie que dependen de ella: las de debajo de
    // cada una de sus celdas hasta la altura máxima. Se apuntan aquí para no
    // reservar nada al abrirla.
    for (const p of this.puertas) {
      p.celdasPie = [];
      for (const i of p.celdas) {
        for (let k = 1; k <= this.alturaMax; k++) {
          const b = i + k * this.ancho;
          if (b < n) p.celdasPie.push(b);
        }
      }
    }

    this._cola = new Int32Array(n);      // el mayor de los dos usos: los refugios
    this._pasos = 0;
    this._calcularRefugios();
    this._prepararNavegacion();

    // Al CENTRO de la celda, no a su esquina: nacer en la esquina de una celda
    // es nacer medio cuerpo dentro de la pared de al lado.
    const mitad = celda / 2;
    this.inicio.x = mapa.inicio.x * celda + mitad;
    this.inicio.y = mapa.inicio.y * celda + mitad;
    this.salidas.length = 0;
    for (const s of mapa.salidas) {
      this.salidas.push({ x: s.x * celda + mitad, y: s.y * celda + mitad });
    }

    this.activa = true;
  },

  // OLVIDAR EL MAPA, al empezar cada partida. Se descubre andando, y eso incluye
  // la segunda partida: heredar lo explorado de la anterior le quitaría al nivel
  // justo lo que lo hace un laberinto.
  //
  // No se vuelve a reservar el array —eso sería asignar memoria al empezar—: se
  // pone a cero el que ya hay.
  // VOLVER A CERRARLO TODO, al empezar cada partida. Las puertas son progreso de
  // la partida en curso, no del jugador: la segunda partida se juega otra vez
  // desde el anillo de dentro.
  cerrarPuertas() {
    if (!this.puertas) return;
    for (const p of this.puertas) {
      if (!p.abierta) continue;
      p.abierta = false;
      for (const i of p.celdas) this.solido[i] = 1;
      this._rehacerPies(p);
    }
    this.versionSuelo++;
  },

  // Si la celda `i` es pie de algo con altura: se mira hacia arriba hasta
  // alturaMax celdas y lo primero sólido que hay decide — si su altura llega
  // hasta aquí, es pie; si no llega, o es suelo hasta el final, no. Es la
  // misma regla con la que el dibujo decide dónde pinta cara, y tiene que
  // serlo: lo que se ve como pared es lo que no se pisa.
  _pieDe(i) {
    if (this.solido[i] === 1) return 0;
    for (let k = 1; k <= this.alturaMax; k++) {
      const a = i - k * this.ancho;
      if (a < 0) return 0;
      if (this.solido[a] !== 1) continue;
      return k <= this.altura[this.tipo[a]] ? 1 : 0;
    }
    return 0;
  },

  // Al abrir o cerrar una puerta cambia su pie: se rehace el de sus celdas y
  // el de las de debajo, y la navegación de todas ellas.
  _rehacerPies(p) {
    for (const i of p.celdas) this.pie[i] = this._pieDe(i);
    for (const i of p.celdasPie) this.pie[i] = this._pieDe(i);
    this._rehacerNavegacionDe(p.celdas);
    this._rehacerNavegacionDe(p.celdasPie);
  },

  // ABRIR UN GRUPO DE PUERTAS. `quien` es lo que dice la leyenda en `abre`:
  // '10min', '20min' o 'final'. Devuelve true si ha abierto algo — false si ese
  // grupo ya estaba abierto o no existe en este mapa.
  //
  // Es la única cosa de todo el módulo que cambia el mapa una vez empezada la
  // partida, y por eso deja detrás dos cosas: la rejilla de navegación al día
  // —si no, la horda seguiría dando la vuelta por donde ya hay paso— y un sello
  // nuevo para que el plano se vuelva a pintar.
  abrirPuertas(quien) {
    if (!this.activa || !this.puertas) return false;
    let algo = false;
    for (const p of this.puertas) {
      if (p.abierta || p.abre !== quien) continue;
      p.abierta = true;
      for (const i of p.celdas) this.solido[i] = 0;
      this._rehacerPies(p);
      algo = true;
    }
    if (algo) { this.celdasVistas++; this.versionSuelo++; }   // repintar plano y suelo
    return algo;
  },

  // Rehacer SOLO las celdas de navegación que tocan las celdas dadas. Rehacer la
  // rejilla entera son 258.000 celdas y un tirón perceptible justo cuando acaba
  // de caer un jefe, que es el peor momento posible para dar un tirón.
  _rehacerNavegacionDe(celdas) {
    if (!this.navSolido) return;
    const P = 2;
    for (const i of celdas) {
      const nx = ((i % this.ancho) / P) | 0;
      const ny = (((i / this.ancho) | 0) / P) | 0;
      const ni = ny * this.navAncho + nx;
      let solido = 0;
      for (let oy = 0; oy < P && !solido; oy++) {
        for (let ox = 0; ox < P; ox++) {
          if (this.solidoEnCelda(nx * P + ox, ny * P + oy)) { solido = 1; break; }
        }
      }
      if (this.navSolido[ni] === solido) continue;
      this.navSolido[ni] = solido;
      this.navTransitables += solido ? -1 : 1;
    }
  },

  olvidarLoVisto() {
    if (!this.visto) return;
    this.visto.fill(0);
    this.celdasVistas = 0;
    this.transitablesVistas = 0;
  },

  // LO QUE ALCANZA LA VISTA desde donde está cada jugador, marcado en la niebla.
  //
  // Es un disco, no un cono ni una línea de visión: lo que se quiere contar es
  // "por aquí he pasado", y con la visión bloqueada por paredes la tienda en la
  // que estás metido se descubriría a trozos según andas por ella, que se lee
  // como un fallo. El radio es algo más que media pantalla.
  //
  // Se llama con la misma cadencia que el campo de flujo: en seis pasos nadie
  // recorre veinte celdas, así que no deja agujeros.
  mirarAlrededor(jugadores) {
    if (!this.activa || !this.visto) return;
    const R = RADIO_VISTA;
    const R2 = R * R;
    for (let k = 0; k < jugadores.length; k++) {
      const j = jugadores[k];
      // Un caído SIGUE viendo: sigue ahí tirado, y borrarle el mapa mientras
      // espera a que lo levanten no ayuda a nadie.
      const cx = (j.x / this.navCelda) | 0;
      const cy = (j.y / this.navCelda) | 0;
      for (let oy = -R; oy <= R; oy++) {
        const ny = cy + oy;
        if (ny < 0 || ny >= this.navAlto) continue;
        const fila = ny * this.navAncho;
        for (let ox = -R; ox <= R; ox++) {
          if (ox * ox + oy * oy > R2) continue;
          const nx = cx + ox;
          if (nx < 0 || nx >= this.navAncho) continue;
          const i = fila + nx;
          if (this.visto[i]) continue;
          this.visto[i] = 1;
          this.celdasVistas++;
          // El "explorado" que se le enseña al jugador cuenta SOLO lo pisable:
          // "he visto el 40%" tiene que querer decir 40% de lo que se puede
          // andar, no del solar entero contando los muros.
          if (this.navSolido[i] === 0) this.transitablesVistas++;
        }
      }
    }
  },

  // --- Consultas básicas ------------------------------------------------------

  celdaX(x) { return (x / this.celda) | 0; },
  celdaY(y) { return (y / this.celda) | 0; },

  // FUERA DEL MAPA ES PARED. No es un detalle: es lo que impide salirse del
  // recinto por una salida de la fachada, que está en el borde y es transitable.
  solidoEnCelda(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.ancho || cy >= this.alto) return true;
    const i = cy * this.ancho + cx;
    return this.solido[i] === 1 || this.pie[i] === 1;
  },

  solidoEn(x, y) {
    return this.solidoEnCelda((x / this.celda) | 0, (y / this.celda) | 0);
  },

  // --- Colisión contra las paredes -------------------------------------------
  //
  // La entidad es una CAJA de lado 2r, igual que en sistemas/colisiones.js, y se
  // resuelve por el eje de MENOR penetración: es lo que deja resbalar a lo largo
  // de una pared en vez de frenar en seco contra ella.
  //
  // Y con una regla que no es evidente: UNA CARA CUYO VECINO TAMBIÉN ES PARED NO
  // EMPUJA. Sin ella, recorrer una pared de diez celdas es tropezar diez veces
  // con los cantos interiores, que no existen —son juntas entre dos bloques del
  // mismo muro—. Con ella, diez celdas de pared se comportan como un muro liso.
  //
  // `ry` es el semialto de la caja, y por defecto es `r`. Los JUGADORES pasan
  // uno más chico: su `y` es la línea de pies, y con la caja cuadrada de radio
  // 8 los pies se paraban a ocho unidades del muro de abajo —un hueco de aire
  // entre las botas y la pared que se leía como un fallo—. Con el semialto en
  // dos, los pies llegan a tocar el muro. Por arriba el cuerpo se mete en la
  // pared, pero eso es lo que hace un personaje delante de un muro visto desde
  // arriba: taparlo. Los enemigos siguen con la caja cuadrada, que es la que
  // los reparte por los pasillos sin apelotonarse en las esquinas.
  colisionar(e, r, ry = r) {
    if (!this.activa) return;
    const c = this.celda;
    const cx0 = ((e.x - r) / c) | 0, cx1 = ((e.x + r) / c) | 0;
    const cy0 = ((e.y - ry) / c) | 0, cy1 = ((e.y + ry) / c) | 0;

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.solidoEnCelda(cx, cy)) continue;

        const mx = cx * c + c / 2;              // centro de la celda
        const my = cy * c + c / 2;
        const dx = e.x - mx;
        const dy = e.y - my;
        const px = c / 2 + r - (dx < 0 ? -dx : dx);   // penetración en X
        if (px <= 0) continue;
        const py = c / 2 + ry - (dy < 0 ? -dy : dy);
        if (py <= 0) continue;

        const sx = dx < 0 ? -1 : 1;
        const sy = dy < 0 ? -1 : 1;
        const libreX = !this.solidoEnCelda(cx + sx, cy);
        const libreY = !this.solidoEnCelda(cx, cy + sy);

        if (px < py) {
          if (libreX) e.x = mx + sx * (c / 2 + r);
          else if (libreY) e.y = my + sy * (c / 2 + ry);
        } else {
          if (libreY) e.y = my + sy * (c / 2 + ry);
          else if (libreX) e.x = mx + sx * (c / 2 + r);
        }
        // Si no queda ninguna cara libre, la entidad está EMPAREDADA y se la
        // deja quieta: moverla sería empujarla a otra pared. La saca de ahí
        // `sacarDePared`, que se llama al aparecer, no cada paso.
      }
    }
  },

  // El tope duro contra el borde del recinto, equivalente a `clamparXNivel` de
  // Mérida. La colisión por celdas ya lo hace, pero esto es la red por debajo:
  // una entidad teletransportada (un jefe, una carga) puede saltarse la pared en
  // un solo paso, y fuera del mapa no hay rejilla que la devuelva.
  sujetar(e, margen) {
    const m = margen || 0;
    if (e.x < m) e.x = m; else if (e.x > this.anchoMundo - m) e.x = this.anchoMundo - m;
    if (e.y < m) e.y = m; else if (e.y > this.altoMundo - m) e.y = this.altoMundo - m;
  },

  // --- Aparecer donde se pueda estar ------------------------------------------
  //
  // Los patrones del director reparten en anillo alrededor de la cámara sin
  // saber que aquí hay tiendas: la mitad de los enemigos caerían dentro de una
  // pared o en el hueco macizo entre dos locales.
  //
  // Se resuelve con una tabla calculada UNA VEZ al cargar el nivel: para cada
  // celda de pared, cuál es la celda transitable más cercana. Es un BFS con
  // TODAS las celdas libres como origen —una sola pasada sobre el mapa— y deja
  // la respuesta en O(1) para cada aparición. Las apariciones son cientos por
  // partida; el mapa se carga una vez.
  _calcularRefugios() {
    const n = this.ancho * this.alto;
    const refugio = new Int32Array(n).fill(-1);
    const cola = this._cola;
    let fin = 0, ini = 0;

    for (let i = 0; i < n; i++) {
      if (this.solido[i] === 0 && this.pie[i] === 0) { refugio[i] = i; cola[fin++] = i; }
    }
    while (ini < fin) {
      const c = cola[ini++];
      const cx = c % this.ancho, cy = (c / this.ancho) | 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + VX[k], ny = cy + VY[k];
        if (nx < 0 || ny < 0 || nx >= this.ancho || ny >= this.alto) continue;
        const ni = ny * this.ancho + nx;
        if (refugio[ni] !== -1) continue;
        refugio[ni] = refugio[c];
        cola[fin++] = ni;
      }
    }
    this._refugio = refugio;
  },

  // Correr una entidad recién aparecida hasta suelo pisable. Devuelve false si
  // el mapa no tiene ni una celda libre, que no puede pasar.
  sacarDePared(e) {
    if (!this.activa) return true;
    let cx = (e.x / this.celda) | 0;
    let cy = (e.y / this.celda) | 0;
    // Un punto de fuera del recinto se mete dentro antes de preguntar.
    if (cx < 0) cx = 0; else if (cx >= this.ancho) cx = this.ancho - 1;
    if (cy < 0) cy = 0; else if (cy >= this.alto) cy = this.alto - 1;

    const i = cy * this.ancho + cx;
    if (this.solido[i] === 0 && this.pie[i] === 0) {
      // Ya estaba en sitio bueno: no se le toca la posición, solo se le mete
      // dentro del recinto si andaba justo en el canto.
      this.sujetar(e, this.celda / 2);
      return true;
    }

    const destino = this._refugio[i];
    if (destino < 0) return false;
    e.x = (destino % this.ancho) * this.celda + this.celda / 2;
    e.y = ((destino / this.ancho) | 0) * this.celda + this.celda / 2;
    return true;
  },

  // DOS REJILLAS, Y NO ES UN CAPRICHO.
  //
  // La de COLISIÓN es fina —celdas de 8 unidades— porque el grosor de una pared
  // es el tamaño de la celda: con celdas grandes no hay tabiques finos, y un
  // centro comercial con muros de 32 parece un búnker.
  //
  // La de NAVEGACIÓN es el doble de basta. El campo de flujo recorre el mapa
  // ENTERO cada vez que se rehace, y sobre la rejilla fina eso son 129.024
  // celdas y 7,8 ms: amortizado entre seis pasos sale barato de media, pero es
  // un pico de 7,8 ms cada décima de segundo, y un pico así se come un
  // fotograma. Sobre la basta son 32.256 celdas y cuatro veces menos.
  //
  // Una celda de navegación es sólida si lo es CUALQUIERA de las cuatro finas
  // que la forman. Eso engorda las paredes 8 unidades a efectos de ruta —los
  // enemigos pasan un poco despegados del muro, que es justo lo que uno quiere
  // de una horda— y no cierra ningún paso: la puerta más estrecha del mapa mide
  // 64 unidades, cuatro celdas de navegación.
  _prepararNavegacion() {
    // Celdas finas por celda de navegación: las que hagan falta para que la
    // de navegación mida 16 unidades, sea cual sea la fina. Con la celda de 8
    // eran dos; con la de 4 del CC The Lighthouse son cuatro, y el campo de
    // flujo sigue costando lo mismo.
    const P = Math.max(1, Math.round(16 / this.celda));
    this.navAncho = Math.ceil(this.ancho / P);
    this.navAlto = Math.ceil(this.alto / P);
    this.navCelda = this.celda * P;

    const n = this.navAncho * this.navAlto;
    this.navSolido = new Uint8Array(n);
    this.navSolidoAncho = new Uint8Array(n);
    this._distAncho = new Uint16Array(n);
    this.navTransitables = 0;
    this._dist = new Uint16Array(n);

    for (let ny = 0; ny < this.navAlto; ny++) {
      for (let nx = 0; nx < this.navAncho; nx++) {
        let solido = 0;
        for (let oy = 0; oy < P && !solido; oy++) {
          for (let ox = 0; ox < P; ox++) {
            if (this.solidoEnCelda(nx * P + ox, ny * P + oy)) { solido = 1; break; }
          }
        }
        this.navSolido[ny * this.navAncho + nx] = solido;
        if (!solido) this.navTransitables++;
      }
    }
    this._dist.fill(LEJOS);
    this._distAncho.fill(LEJOS);
    // LA REJILLA ANCHA: sólida también toda celda que TOQUE una sólida (los
    // ocho vecinos). Es la que usan los cuerpos grandes —jefes, cíclope,
    // mantícora— para encontrar camino: ver `actualizarCampo`.
    for (let ny = 0; ny < this.navAlto; ny++) {
      for (let nx = 0; nx < this.navAncho; nx++) {
        let s = this.navSolido[ny * this.navAncho + nx];
        for (let k = 0; k < 8 && !s; k++) {
          if (this.navSolidoEn(nx + VX[k], ny + VY[k])) s = 1;
        }
        this.navSolidoAncho[ny * this.navAncho + nx] = s;
      }
    }
    this.visto = new Uint8Array(n);
    this.celdasVistas = 0;
    this.transitablesVistas = 0;
  },

  navSolidoEn(nx, ny) {
    if (nx < 0 || ny < 0 || nx >= this.navAncho || ny >= this.navAlto) return true;
    return this.navSolido[ny * this.navAncho + nx] === 1;
  },

  // --- Campo de flujo ---------------------------------------------------------
  //
  // EL PROBLEMA: los enemigos de este juego persiguen en línea recta
  // (entidades/enemigo.js). En una calzada abierta eso es exactamente lo que se
  // quiere; dentro de un centro comercial es una horda entera apelotonada contra
  // la pared del hipermercado mientras el jugador la mira desde el pasillo de
  // al lado.
  //
  // LA SOLUCIÓN, y por qué esta y no A*: un A* por enemigo son ochocientas
  // búsquedas por paso. Un campo de flujo es UNA búsqueda en anchura desde los
  // jugadores que deja, en cada celda del mapa, hacia dónde hay que ir para
  // acercarse a ellos. Se calcula una vez cada 6 pasos y la consulta de cada
  // enemigo es leer dos números. Da igual que haya ochocientos o cinco mil.
  //
  // Y de regalo resuelve el cooperativo: con los cuatro jugadores como origen,
  // cada celda apunta al MÁS CERCANO POR PASILLOS, que no es el más cercano en
  // línea recta. Un enemigo al otro lado de una pared deja de intentar
  // atravesarla y se va por la puerta.
  // DOS CAMPOS, UNO POR ANCHURA DE CUERPO.
  //
  // El campo normal va sobre la rejilla de navegación tal cual: sus paredes
  // están engordadas 8 unidades y eso le vale a la horda, que es menuda. A un
  // jefe no. Cerbero mide 16 de radio y la Loba 24, y el campo normal los
  // lleva por caminos que pasan a 8 de una esquina: el centro del cuerpo puede
  // pisar ese camino, el cuerpo no, y la pared lo para justo donde el campo le
  // dice que siga. Lo vio Sergio: el jefe atascado en un paso estrecho sin
  // buscar otro camino, porque para el campo ESE era el camino.
  //
  // El campo ANCHO se calcula sobre `navSolidoAncho`, la rejilla con las
  // paredes engordadas una celda más (24 de holgura): por él solo van rutas
  // en las que cabe un cuerpo de hasta 24 de radio, y un paso que no da para
  // el jefe sencillamente no existe para él, así que rodea. Los pasos más
  // estrechos del mapa —las puertas, 64— siguen abiertos: quedan dos celdas
  // libres en medio. Cuesta un segundo BFS cada seis pasos; medido, el campo
  // normal anda por el medio milisegundo, así que es asumible.
  actualizarCampo(jugadores, forzar) {
    if (!this.activa) return;
    if (!forzar && this._pasos++ % PASOS_POR_CAMPO !== 0) return;
    if (this._sembrar(jugadores, this.navSolido, this._dist)) this._inundar(this.navSolido, this._dist);
    if (this._sembrar(jugadores, this.navSolidoAncho, this._distAncho)) this._inundar(this.navSolidoAncho, this._distAncho);
  },

  // Los orígenes del BFS: la celda de cada jugador en pie. Devuelve cuántos
  // ha sembrado; con cero, el campo anterior se deja como estaba.
  _sembrar(jugadores, solido, dist) {
    const ancho = this.navAncho, alto = this.navAlto;
    const cola = this._cola;
    let fin = 0;
    dist.fill(LEJOS);

    for (let k = 0; k < jugadores.length; k++) {
      const j = jugadores[k];
      if (j.abatido) continue;          // un caído no atrae a la horda
      const cx = (j.x / this.navCelda) | 0;
      const cy = (j.y / this.navCelda) | 0;
      if (cx < 0 || cy < 0 || cx >= ancho || cy >= alto) continue;
      const i = cy * ancho + cx;
      // Dentro de una pared no puede ser origen: el BFS no saldría de ahí. Pasa
      // de verdad —la celda de navegación es sólida si CUALQUIERA de sus cuatro
      // finas lo es, así que un jugador pegado a un muro cae en una—, y por eso
      // se prueba con los vecinos antes de rendirse: primero los cuatro rectos,
      // luego las diagonales y luego a dos celdas, que es lo que hace falta en
      // la rejilla ancha, donde pegarse a un muro deja al jugador a dos celdas
      // de la primera libre.
      if (dist[i] === 0) continue;
      if (solido[i] === 0) { dist[i] = 0; cola[fin++] = i; continue; }
      let puesto = false;
      for (let r = 1; r <= 2 && !puesto; r++) {
        for (let dy = -r; dy <= r && !puesto; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
            const ni = ny * ancho + nx;
            if (solido[ni] === 1 || dist[ni] === 0) continue;
            dist[ni] = 0; cola[fin++] = ni;
            puesto = true;
            break;
          }
        }
      }
    }
    this._fin = fin;
    return fin;
  },

  _inundar(solido, dist) {
    const ancho = this.navAncho, alto = this.navAlto;
    const cola = this._cola;
    let ini = 0, fin = this._fin;
    while (ini < fin) {
      const c = cola[ini++];
      const d = dist[c] + 1;
      // EL TOPE DE ALCANCE. Se corta por distancia ANDANDO, no por un rectángulo
      // alrededor del jugador: en un laberinto, "a treinta metros en línea recta"
      // y "a treinta metros andando" son sitios distintos, y el que importa es el
      // segundo.
      if (d > ALCANCE_CAMPO) continue;
      const cx = c % ancho, cy = (c / ancho) | 0;
      // Solo los cuatro rectos: en diagonal se cortarían las esquinas y los
      // enemigos se meterían de canto por juntas de pared que no son huecos.
      for (let k = 0; k < 4; k++) {
        const nx = cx + VX[k], ny = cy + VY[k];
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const ni = ny * ancho + nx;
        if (solido[ni] === 1 || dist[ni] !== LEJOS) continue;
        dist[ni] = d;
        cola[fin++] = ni;
      }
    }
  },

  // Hacia dónde tirar desde un punto del mundo: hacia el vecino que menos dista.
  // Escribe en `salida` para no asignar un objeto por enemigo y por paso (cero
  // `new` en partida). Devuelve false si desde ahí no se llega a ningún jugador.
  //
  // LA DIRECCIÓN SE CALCULA AQUÍ, NO AL REHACER EL CAMPO. Precalcularla para
  // todas las celdas eran ocho consultas por cada una de las 32.256, y de esas
  // celdas se preguntan unos cientos —una por enemigo vivo—. Mirar los ocho
  // vecinos en el momento cuesta lo mismo por consulta y ahorra el 99% de ellas.
  //
  // Las diagonales entran aquí y no en el BFS: en la búsqueda cortarían esquinas
  // y meterían a la horda de canto por juntas de pared que no son huecos, y aquí
  // son lo que hace que el recorrido se vea andado y no a escuadra.
  // `cuerpoAncho`: consultar el campo ANCHO (ver `actualizarCampo`). Lo piden
  // los enemigos de más de 9 de radio.
  direccionEn(x, y, salida, cuerpoAncho = false) {
    if (!this.activa) return false;
    const ancho = this.navAncho, alto = this.navAlto;
    const cx = (x / this.navCelda) | 0;
    const cy = (y / this.navCelda) | 0;
    if (cx < 0 || cy < 0 || cx >= ancho || cy >= alto) return false;

    const dist = cuerpoAncho ? this._distAncho : this._dist;
    const solido = cuerpoAncho ? this.navSolidoAncho : this.navSolido;
    let aqui = dist[cy * ancho + cx];

    // PEGADO A LA PARED NO ES ESTAR PERDIDO. La celda de navegación es sólida si
    // lo es cualquiera de sus cuatro finas, así que un enemigo que roza un muro
    // —que son muchos, en un sitio hecho de pasillos— cae en una celda sin
    // distancia y se quedaría sin ruta justo cuando más falta le hace. Antes de
    // rendirse se mira a los cuatro vecinos y se sale hacia el mejor de ellos.
    if (aqui === LEJOS) {
      // Los cuatro rectos primero; si ninguno vale, el anillo de a dos, que
      // es lo que hace falta en la rejilla ANCHA: ahí un cuerpo pegado a un
      // muro está a dos celdas de la primera con distancia. Se sale hacia la
      // mejor, normalizado, para que el paso no sea el doble de largo.
      let mejorD = LEJOS, bx = 0, by = 0;
      for (let r = 1; r <= (cuerpoAncho ? 2 : 1) && mejorD === LEJOS; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
            const ni = ny * ancho + nx;
            if (solido[ni] === 1 || dist[ni] === LEJOS) continue;
            if (dist[ni] < mejorD) { mejorD = dist[ni]; bx = dx; by = dy; }
          }
        }
      }
      if (mejorD === LEJOS) return false;   // ahora sí: desde aquí no se llega
      const m = Math.sqrt(bx * bx + by * by) || 1;
      salida.x = bx / m; salida.y = by / m;
      return true;
    }
    if (aqui === 0) return false;       // ya se está encima: manda la recta

    let mejor = aqui, mx = 0, my = 0;
    for (let k = 0; k < 8; k++) {
      const nx = cx + VX[k], ny = cy + VY[k];
      if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
      const ni = ny * ancho + nx;
      if (solido[ni] === 1) continue;
      // Una diagonal solo vale si los dos rectos que la forman están libres: si
      // no, es pasar por el vértice de dos paredes.
      if (k >= 4 && (solido[cy * ancho + nx] === 1 || solido[ny * ancho + cx] === 1)) continue;
      if (dist[ni] < mejor) { mejor = dist[ni]; mx = VX[k]; my = VY[k]; }
    }
    if (mx === 0 && my === 0) return false;
    // UN CUERPO ANCHO VA AL CENTRO DE LA CELDA SIGUIENTE, no en la dirección
    // del vecino a secas. La dirección a secas lo deja donde esté dentro de su
    // celda —pegado al canto, si venía de rozar una pared— y desde ahí el
    // siguiente paso lo engancha en la esquina. Apuntando al centro de la
    // celda a la que va, se recentra solo en el pasillo, que es lo que hace
    // andar por en medio a algo que no cabe por los lados.
    if (cuerpoAncho) {
      const c = this.navCelda;
      let tx = (cx + mx) * c + c / 2 - x, ty = (cy + my) * c + c / 2 - y;
      const m = Math.sqrt(tx * tx + ty * ty);
      if (m > 0.001) { salida.x = tx / m; salida.y = ty / m; return true; }
    }
    if (mx !== 0 && my !== 0) { salida.x = mx * 0.7071068; salida.y = my * 0.7071068; }
    else { salida.x = mx; salida.y = my; }
    return true;
  },

  // --- Por dónde entra un jefe ------------------------------------------------
  //
  // En Mérida un jefe aparece en cualquier punto del perímetro de la cámara,
  // como todo lo demás. Aquí eso lo dejaba en la tienda de al lado —fuera de
  // pantalla, sí, pero al otro lado de una pared—, y el jugador se enteraba de
  // que había jefe por el letrero y por el rugido, sin verlo llegar. Sergio lo
  // quiere de otra manera: que entre por un lado ACCESIBLE de la pantalla, en
  // el mismo pasillo o la misma sala que el personaje, y que se le vea venir.
  //
  // Se busca una celda de navegación que cumpla, por orden: que se pueda pisar
  // y tenga camino hasta los jugadores (`_dist`, el campo de flujo); que esté
  // FUERA del visor, para que no aparezca de la nada; y que se vea desde el
  // jugador en línea recta —`lineaLibre`—, que es lo que quiere decir "en la
  // misma sala". Si ninguna cumple lo último (un pasillo con esquina), vale
  // la que menos rodeo dé: camino por pasillos no mucho mayor que la recta.
  // Entre las que empatan en distancia de camino elige el rng de la partida,
  // que es lo que la hace reproducible.
  //
  // `salida` recibe x/y en unidades lógicas. Devuelve false si no hay dónde,
  // y entonces el director cae al perímetro de siempre.
  puntoDeEntradaJefe(jx, jy, camX, camY, semiX, semiY, rng, salida) {
    if (!this.activa || !this._dist) return false;
    const ancho = this.navAncho, alto = this.navAlto, c = this.navCelda;
    const dist = this._dist, solido = this.navSolido;
    // Hasta pantalla y media del jugador: más lejos no es "su sala".
    const maxR = Math.max(semiX, semiY) * 3;
    const cx0 = Math.max(0, ((jx - maxR) / c) | 0), cx1 = Math.min(ancho - 1, ((jx + maxR) / c) | 0);
    const cy0 = Math.max(0, ((jy - maxR) / c) | 0), cy1 = Math.min(alto - 1, ((jy + maxR) / c) | 0);

    // Dos rondas: con línea de visión, y si no la hay, por rodeo.
    for (let ronda = 0; ronda < 2; ronda++) {
      let mejor = LEJOS, n = 0;
      let ex = 0, ey = 0;
      for (let ny = cy0; ny <= cy1; ny++) {
        for (let nx = cx0; nx <= cx1; nx++) {
          const i = ny * ancho + nx;
          if (solido[i] === 1) continue;
          const d = dist[i];
          if (d === LEJOS || d === 0) continue;
          const x = nx * c + c / 2, y = ny * c + c / 2;
          // Fuera del visor, pero no lejos: la banda justo detrás del borde.
          const fx = Math.abs(x - camX) - semiX, fy = Math.abs(y - camY) - semiY;
          if (fx <= 0 && fy <= 0) continue;
          if (fx > c * 2 || fy > c * 2) continue;
          const dx = x - jx, dy = y - jy;
          const recta = Math.sqrt(dx * dx + dy * dy);
          if (recta > maxR) continue;
          if (ronda === 0) {
            if (!this.lineaLibre(jx, jy, x, y)) continue;
          } else {
            // Camino por pasillos no más de un tercio más largo que la recta.
            if (d * c > recta * 1.35 + c * 2) continue;
          }
          // La más cercana por camino; entre las que empatan (a dos celdas),
          // una al azar por muestreo de reservorio.
          if (d + 2 < mejor) { mejor = d; n = 1; ex = x; ey = y; }
          else if (d <= mejor + 2) {
            n++;
            if (rng() * n < 1) { ex = x; ey = y; }
            if (d < mejor) mejor = d;
          }
        }
      }
      if (n > 0) { salida.x = ex; salida.y = ey; return true; }
    }
    return false;
  },

  // --- Línea de visión --------------------------------------------------------
  //
  // Para qué: mientras se VE al jugador, el enemigo va a por él en línea recta,
  // como en Mérida. El campo de flujo solo entra cuando hay una pared de por
  // medio. Así el bicho que te tiene delante no describe la curva suave del
  // campo —que se lee como que pasa de ti— sino que se te echa encima.
  //
  // Recorrido por celdas al estilo Amanatides–Woo: pisa TODAS las celdas que
  // toca el segmento, sin saltarse ninguna en las diagonales.
  lineaLibre(x0, y0, x1, y1) {
    if (!this.activa) return true;
    const c = this.celda;
    let cx = (x0 / c) | 0, cy = (y0 / c) | 0;
    const cx1 = (x1 / c) | 0, cy1 = (y1 / c) | 0;
    if (this.solidoEnCelda(cx, cy)) return false;

    const dx = x1 - x0, dy = y1 - y0;
    const pasoX = dx > 0 ? 1 : -1;
    const pasoY = dy > 0 ? 1 : -1;
    const tDeltaX = dx === 0 ? Infinity : Math.abs(c / dx);
    const tDeltaY = dy === 0 ? Infinity : Math.abs(c / dy);
    let tMaxX = dx === 0 ? Infinity
      : ((dx > 0 ? (cx + 1) * c - x0 : x0 - cx * c) / Math.abs(dx));
    let tMaxY = dy === 0 ? Infinity
      : ((dy > 0 ? (cy + 1) * c - y0 : y0 - cy * c) / Math.abs(dy));

    // Tope de seguridad: el diámetro del mapa en celdas. Sin él, un segmento
    // degenerado colgaría el bucle del juego.
    const tope = this.ancho + this.alto + 4;
    for (let k = 0; k < tope; k++) {
      if (cx === cx1 && cy === cy1) return true;
      if (tMaxX < tMaxY) { cx += pasoX; tMaxX += tDeltaX; }
      else { cy += pasoY; tMaxY += tDeltaY; }
      if (this.solidoEnCelda(cx, cy)) return false;
      if (tMaxX > 1 && tMaxY > 1) return true;    // se pasó del destino
    }
    return false;
  },

  // HASTA DÓNDE LLEGA UN RAYO. Desde (x0, y0) en la dirección unitaria (ux, uy),
  // cuántas unidades se recorren antes de tocar pared, con tope en `max`. Sin
  // rejilla activa —Mérida— es siempre `max`.
  //
  // Es la misma marcha por celdas que `lineaLibre`, pero devolviendo la
  // DISTANCIA en vez de sí/no: la necesitan los rayos perforantes (Láser, Rayo
  // cruzado, Aspa de luz), que se dibujan de un tirón hasta su alcance y tienen
  // que quedarse en la pared que los corta, o el haz se vería seguir por dentro
  // de una tienda mientras el daño se para en la puerta.
  alcanceLibre(x0, y0, ux, uy, max) {
    if (!this.activa) return max;
    const c = this.celda;
    let cx = (x0 / c) | 0, cy = (y0 / c) | 0;
    if (this.solidoEnCelda(cx, cy)) return 0;

    const pasoX = ux > 0 ? 1 : -1;
    const pasoY = uy > 0 ? 1 : -1;
    const tDeltaX = ux === 0 ? Infinity : Math.abs(c / ux);
    const tDeltaY = uy === 0 ? Infinity : Math.abs(c / uy);
    let tMaxX = ux === 0 ? Infinity
      : ((ux > 0 ? (cx + 1) * c - x0 : x0 - cx * c) / Math.abs(ux));
    let tMaxY = uy === 0 ? Infinity
      : ((uy > 0 ? (cy + 1) * c - y0 : y0 - cy * c) / Math.abs(uy));

    const tope = this.ancho + this.alto + 4;
    for (let k = 0; k < tope; k++) {
      // `t` es la distancia recorrida al cruzar a la celda siguiente.
      let t;
      if (tMaxX < tMaxY) { t = tMaxX; cx += pasoX; tMaxX += tDeltaX; }
      else { t = tMaxY; cy += pasoY; tMaxY += tDeltaY; }
      if (t >= max) return max;
      if (this.solidoEnCelda(cx, cy)) return t;
    }
    return max;
  }
};
