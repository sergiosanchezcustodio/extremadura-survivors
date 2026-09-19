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

  // Campo de flujo hacia los jugadores, sobre la REJILLA DE NAVEGACIÓN (ver
  // `_prepararNavegacion`), que es más basta que la de colisión.
  navAncho: 0,
  navAlto: 0,
  navCelda: 0,
  navSolido: null,
  _dist: null,
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
  iniciar(mapa, leyenda, celda) {
    this.celda = celda;
    this.ancho = mapa.ancho;
    this.alto = mapa.alto;
    this.anchoMundo = mapa.ancho * celda;
    this.altoMundo = mapa.alto * celda;

    const n = this.ancho * this.alto;
    this.solido = new Uint8Array(n);
    this.tipo = new Uint8Array(n);
    this.simbolos = Object.keys(leyenda);

    for (let y = 0; y < this.alto; y++) {
      const fila = mapa.filas[y];
      for (let x = 0; x < this.ancho; x++) {
        const ch = fila[x];
        const i = y * this.ancho + x;
        const def = leyenda[ch];
        // Un carácter que no esté en la leyenda es pared. Es lo seguro: un
        // símbolo desconocido tratado como suelo abre un agujero al vacío.
        this.solido[i] = !def || def.solido ? 1 : 0;
        const t = this.simbolos.indexOf(ch);
        this.tipo[i] = t < 0 ? 0 : t;
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
    return this.solido[cy * this.ancho + cx] === 1;
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
  colisionar(e, r) {
    if (!this.activa) return;
    const c = this.celda;
    const cx0 = ((e.x - r) / c) | 0, cx1 = ((e.x + r) / c) | 0;
    const cy0 = ((e.y - r) / c) | 0, cy1 = ((e.y + r) / c) | 0;

    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.solidoEnCelda(cx, cy)) continue;

        const mx = cx * c + c / 2;              // centro de la celda
        const my = cy * c + c / 2;
        const dx = e.x - mx;
        const dy = e.y - my;
        const px = c / 2 + r - (dx < 0 ? -dx : dx);   // penetración en X
        if (px <= 0) continue;
        const py = c / 2 + r - (dy < 0 ? -dy : dy);
        if (py <= 0) continue;

        const sx = dx < 0 ? -1 : 1;
        const sy = dy < 0 ? -1 : 1;
        const libreX = !this.solidoEnCelda(cx + sx, cy);
        const libreY = !this.solidoEnCelda(cx, cy + sy);

        if (px < py) {
          if (libreX) e.x = mx + sx * (c / 2 + r);
          else if (libreY) e.y = my + sy * (c / 2 + r);
        } else {
          if (libreY) e.y = my + sy * (c / 2 + r);
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
      if (this.solido[i] === 0) { refugio[i] = i; cola[fin++] = i; }
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
    if (this.solido[i] === 0) {
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
    const P = 2;                                  // celdas finas por celda de nav
    this.navAncho = Math.ceil(this.ancho / P);
    this.navAlto = Math.ceil(this.alto / P);
    this.navCelda = this.celda * P;

    const n = this.navAncho * this.navAlto;
    this.navSolido = new Uint8Array(n);
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
  actualizarCampo(jugadores, forzar) {
    if (!this.activa) return;
    if (!forzar && this._pasos++ % PASOS_POR_CAMPO !== 0) return;

    const ancho = this.navAncho, alto = this.navAlto;
    const solido = this.navSolido;
    const dist = this._dist;
    const cola = this._cola;
    dist.fill(LEJOS);
    let fin = 0, ini = 0;

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
      // se prueba también con los cuatro vecinos antes de rendirse.
      if (dist[i] === 0) continue;
      if (solido[i] === 0) { dist[i] = 0; cola[fin++] = i; continue; }
      for (let v = 0; v < 4; v++) {
        const nx = cx + VX[v], ny = cy + VY[v];
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const ni = ny * ancho + nx;
        if (solido[ni] === 1 || dist[ni] === 0) continue;
        dist[ni] = 0; cola[fin++] = ni;
        break;
      }
    }
    if (fin === 0) return;              // nadie en pie: el campo anterior vale

    while (ini < fin) {
      const c = cola[ini++];
      const d = dist[c] + 1;
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
  direccionEn(x, y, salida) {
    if (!this.activa) return false;
    const ancho = this.navAncho, alto = this.navAlto;
    const cx = (x / this.navCelda) | 0;
    const cy = (y / this.navCelda) | 0;
    if (cx < 0 || cy < 0 || cx >= ancho || cy >= alto) return false;

    const dist = this._dist;
    const solido = this.navSolido;
    let aqui = dist[cy * ancho + cx];

    // PEGADO A LA PARED NO ES ESTAR PERDIDO. La celda de navegación es sólida si
    // lo es cualquiera de sus cuatro finas, así que un enemigo que roza un muro
    // —que son muchos, en un sitio hecho de pasillos— cae en una celda sin
    // distancia y se quedaría sin ruta justo cuando más falta le hace. Antes de
    // rendirse se mira a los cuatro vecinos y se sale hacia el mejor de ellos.
    if (aqui === LEJOS) {
      let mejorD = LEJOS, bx = 0, by = 0;
      for (let k = 0; k < 4; k++) {
        const nx = cx + VX[k], ny = cy + VY[k];
        if (nx < 0 || ny < 0 || nx >= ancho || ny >= alto) continue;
        const ni = ny * ancho + nx;
        if (solido[ni] === 1 || dist[ni] === LEJOS) continue;
        if (dist[ni] < mejorD) { mejorD = dist[ni]; bx = VX[k]; by = VY[k]; }
      }
      if (mejorD === LEJOS) return false;   // ahora sí: desde aquí no se llega
      salida.x = bx; salida.y = by;
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
      if (k >= 4 && (this.navSolidoEn(nx, cy) || this.navSolidoEn(cx, ny))) continue;
      if (dist[ni] < mejor) { mejor = dist[ni]; mx = VX[k]; my = VY[k]; }
    }
    if (mx === 0 && my === 0) return false;
    if (mx !== 0 && my !== 0) { salida.x = mx * 0.7071068; salida.y = my * 0.7071068; }
    else { salida.x = mx; salida.y = my; }
    return true;
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
  }
};
