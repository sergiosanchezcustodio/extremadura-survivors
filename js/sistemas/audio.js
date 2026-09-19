// GESTOR DE AUDIO.
//
// Los EFECTOS son síntesis procedural con Web Audio API: golpes, muertes,
// subidas de nivel y aperturas de cofre se generan en tiempo real con
// osciladores y ruido, sin un solo fichero. Se hizo así porque no había forma
// de conseguir samples, y sigue así porque funciona.
//
// La MÚSICA ya no. Sergio ha compuesto dos temas para Emerita y suenan ellos,
// encadenados en bucle (ver PISTAS y la sección de música más abajo). El bucle
// procedural que había —dron grave y frases sueltas— se queda como REPLIEGUE
// para cuando los ficheros no cargan: sin él, un fallo de red dejaría la
// partida muda, y el plan pedía tolerancia a la ausencia de assets.
//
// Los ficheros van por <audio> y NO por decodeAudioData, que es la otra forma
// de meterlos en el grafo. Son 13,6 MB de MP3: decodificados a PCM en memoria
// serían más de 150 MB, y no hace ninguna falta tenerlos enteros en RAM cuando
// lo único que se hace con ellos es reproducirlos de principio a fin. El
// elemento se enchufa al grafo con createMediaElementSource, así que el volumen
// se controla en el mismo sitio que todo lo demás.
//
// TOLERANTE A LA AUSENCIA DE AudioContext: si el navegador lo bloquea (sin
// gesto del usuario todavía) o no existe, `ctx` se queda a null y todos los
// métodos vuelven a ser una operación en silencio. Nunca un error que
// interrumpa la partida — igual que pedía la sección 15 del plan para el
// caso "sin assets".
//
// LOS NODOS DE WEB AUDIO SÍ SE CREAN CON `new` EN CALIENTE, y es la única
// excepción consciente al "cero `new` durante la partida" del proyecto: la
// propia API los diseña de un solo uso —un OscillatorNode no se reinicia ni
// se recicla, se crea, suena una vez y se tira— así que no existe un pool
// posible. Se acota el coste con un PRESUPUESTO por paso de lógica (igual
// que VFX.numero) y un límite de voces simultáneas por sonido: unos pocos
// osciladores por frame se oyen igual de bien que doscientos, y son los que
// de verdad cuesta crear y GC-ear.
//
// LA VARIACIÓN DE TONO (±8%, pedida en el plan contra la fatiga auditiva) usa
// Math.random(), NUNCA el rng con semilla del director: es cosmético puro,
// como el temporizador del tirón de la tragaperras (ver sistemas/progresion.
// js) — si tirara de la semilla compartida, dos partidas con el mismo
// director dejarían de sonar igual sin que ninguna decisión de juego hubiera
// cambiado, y el criterio 10 del plan es sobre REPRODUCIBILIDAD DE LA
// PARTIDA, no sobre qué tono exacto suena en un golpe.

let ctx = null;
let gMaestro = null;
let gEfectos = null;
let gMusica = null;
let bufferRuido = null;

// --- Presupuesto por paso de lógica -----------------------------------------
// Un arco de melé a nivel 8 alcanza a un centenar de enemigos de una vez: sin
// tope, eso son cien osciladores creados en el mismo paso por un golpe que ya
// se ha oído con los primeros seis.
const PRESUPUESTO_PASO = 8;
let _presupuesto = 0;

// --- Límite de voces simultáneas por sonido ---------------------------------
// Cada entrada guarda cuándo termina cada voz que suena ahora mismo (tiempo de
// AudioContext). Purgar las vencidas y contar las que quedan es más barato
// que llevar la cuenta con temporizadores de JS aparte.
const _vocesActivas = { golpe: [], muerteEnemigo: [], recogerGema: [], danyoJugador: [] };
const LIMITE_VOCES = { golpe: 4, muerteEnemigo: 5, recogerGema: 4, danyoJugador: 3 };

function puedeSonar(nombre, duracion) {
  const activas = _vocesActivas[nombre];
  if (!activas) return true;             // sonidos raros (jefe, nivel, cofre): sin límite
  const ahora = ctx.currentTime;
  while (activas.length && activas[0] <= ahora) activas.shift();
  if (activas.length >= LIMITE_VOCES[nombre]) return false;
  activas.push(ahora + duracion);
  activas.sort((a, b) => a - b);
  return true;
}

// Variación de tono ±8%, ver nota de cabecera sobre por qué NO usa el rng
// compartido.
function variar(freq) {
  return freq * (1 + (Math.random() * 2 - 1) * 0.08);
}

// --- Fábricas de sonido ------------------------------------------------------

// Tono simple: un oscilador con envolvente de ataque corto y caída
// exponencial. Es la base de casi todos los efectos.
function tono(destino, freq, duracion, tipo, volumen, desfase = 0) {
  const t0 = ctx.currentTime + desfase;
  const osc = ctx.createOscillator();
  osc.type = tipo;
  osc.frequency.setValueAtTime(variar(freq), t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(volumen, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  osc.connect(g).connect(destino);
  osc.start(t0);
  osc.stop(t0 + duracion + 0.02);
  return osc;
}

// Ráfaga de ruido blanco filtrada: la base de golpes y muertes, que suenan a
// impacto y no a nota musical.
function ruido(destino, duracion, volumen, tipoFiltro, freqFiltro, desfase = 0) {
  const t0 = ctx.currentTime + desfase;
  const fuente = ctx.createBufferSource();
  fuente.buffer = bufferRuido;
  const filtro = ctx.createBiquadFilter();
  filtro.type = tipoFiltro;
  filtro.frequency.setValueAtTime(variar(freqFiltro), t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(volumen, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duracion);
  fuente.connect(filtro).connect(g).connect(destino);
  fuente.start(t0);
  fuente.stop(t0 + duracion + 0.02);
}

// --- Música: patrones y reproductor por horizonte ----------------------------
//
// En vez de un `setInterval`/`setTimeout` marcando cada nota, se PROGRAMA por
// adelantado un bucle entero de golpe (Web Audio acepta `start(t)` en
// cualquier instante futuro con precisión de muestra) y se avanza el
// "horizonte" ya programado. `tick()` —llamado cada fotograma desde
// ui/capa.js vía main.js, NUNCA desde el paso de lógica fijo— solo comprueba
// si el horizonte se acerca y programa el siguiente bucle si hace falta.
//
// Es tiempo REAL (ctx.currentTime), no tiempo de simulación: siguiendo la
// misma idea que el pulso de furia del jefe (ui/hud.js), esto es puramente
// cosmético y correr en tiempo de pared no rompe la reproducibilidad de la
// partida — no toca ni lee nada del estado de juego con semilla.
function nota(t, f, d, tipo, vol) { return { t, f, d, tipo, vol }; }

// Escala frigia sobre Re: aire modal, antiguo, encaja con ruinas romanas de
// noche. D2 73.42 · D3 146.83 · Eb3 155.56 · F3 174.61 · G3 196.00 · A3
// 220.00 · Bb3 233.08 · C4 261.63 · D4 293.66 · Eb4 311.13 · F4 349.23.
const LOOP_AMBIENTE = 16;
const DRON_AMBIENTE = 73.42;
const NOTAS_AMBIENTE = [
  nota(0.0,  146.83, 2.4, 'triangle', 0.05),
  nota(3.4,  174.61, 2.0, 'triangle', 0.045),
  nota(6.2,  220.00, 2.2, 'triangle', 0.05),
  nota(9.6,  196.00, 1.8, 'triangle', 0.04),
  nota(12.4, 261.63, 2.6, 'triangle', 0.045),
];

const LOOP_JEFE = 8;
const NOTAS_JEFE = [
  // Pulso grave marcando el compás: ocho corcheas alternando la tónica y la
  // quinta, con dientes de sierra en vez del triángulo suave del ambiente.
  nota(0.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(0.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(1.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(1.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(2.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(2.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(3.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(3.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(4.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(4.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(5.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(5.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(6.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(6.5, 110.00, 0.16, 'sawtooth', 0.065),
  nota(7.0, 73.42,  0.16, 'sawtooth', 0.075),
  nota(7.5, 110.00, 0.16, 'sawtooth', 0.065),
  // Frase aguda, tensa, encima del pulso.
  nota(1.0, 311.13, 0.3,  'square', 0.05),
  nota(3.0, 349.23, 0.3,  'square', 0.05),
  nota(5.5, 293.66, 0.5,  'square', 0.055),
];

let _horizonte = 0;
let _musicaActiva = false;
let _jefeActivo = false;
let _dronOsc = null, _dronGain = null;

// --- Música de fichero -------------------------------------------------------
//
// LAS PISTAS DE LA PARTIDA LAS PONE EL NIVEL, no este archivo.
//
// Cada sitio suena distinto —Mérida no puede sonar como un centro comercial— y
// eso es una decisión del nivel, así que viaja en su archivo de datos (campo
// `musica`, ver js/datos/niveles/<nivel>.js) y llega aquí por `usarPistas`.
// Antes había una lista fija aquí con las dos canciones de Mérida, y con eso
// añadir un sitio obligaba a tocar el motor de audio.
//
// Éstas son el REPLIEGUE, para el caso de un nivel que no declare ninguna: mejor
// la música de Mérida que el silencio.
const PISTAS_POR_DEFECTO = ['assets/musica/emerita-1.mp3', 'assets/musica/emerita-2.mp3'];
let PISTAS = PISTAS_POR_DEFECTO;

// Al acabar la última se vuelve a la primera, así que la partida entera va
// encadenando las dos sin silencio en medio.
//
// El bucle NO se hace con `loop = true` en cada elemento: eso repetiría la
// misma canción para siempre. Se encadena con el evento `ended`, que es lo que
// permite pasar de una a la otra y volver a empezar.

// Las de ANTES DE JUGAR van aparte y sueltas: no entran en la lista de arriba
// porque no se encadenan con las otras ni entre sí, sino que cada una se repite
// sobre sí misma hasta que el juego cambia de pantalla.
//
// Son dos, y el corte entre ellas es la PORTADA de la intro, que es donde se
// ve por primera vez el título del juego:
//
//   'intro'  suena desde que arranca el juego —el logo y el relato del
//            narrador, por debajo del cual se agacha al 10%— y se acaba cuando
//            aparece la portada.
//   'menu'   es el tema del título. Entra EN la portada y se queda para elegir
//            partida, el menú, la tienda y todo lo demás hasta la partida.
//
// Existen porque hasta hace poco todo esto estaba en silencio y la música solo
// arrancaba al empezar a jugar: quien se quedaba mirando la tienda tenía la
// impresión de que el juego se había colgado.
const SUELTAS = {
  intro: 'assets/musica/intro.mp3',
  menu: 'assets/musica/menu.mp3'
};

// El volumen de la música compuesta va por debajo del que tenía la procedural:
// aquella eran cuatro notas sueltas y esto es una mezcla completa, así que al
// mismo nivel se comía los efectos.
const VOLUMEN_MUSICA = 0.42;
const VOLUMEN_EFECTOS = 0.6;

// Ajustes de VOLUMEN, guardados aparte del progreso META. Son de esta máquina,
// no algo que se haya ganado jugando, así que "empezar de cero" no los toca.
// Cambió de `emerita-volumen-v1` con el nombre del juego, y se arrastra el valor
// anterior igual que el progreso (ver migrarClaves en core/metaProgreso.js): a
// quien tenía la música bajada no puede volvérsele a subir sola por un cambio de
// nombre que no ha pedido.
const CLAVE_VOL = 'extremadura-volumen-v1';
const CLAVE_VOL_VIEJA = 'emerita-volumen-v1';
try {
  if (localStorage.getItem(CLAVE_VOL) === null) {
    const previo = localStorage.getItem(CLAVE_VOL_VIEJA);
    if (previo !== null) localStorage.setItem(CLAVE_VOL, previo);
  }
} catch { /* sin almacenamiento: valores por defecto */ }
// El <audio> del narrador, si hay uno hablando ahora mismo. Solo puede haber
// uno: dos voces a la vez no se entienden, y cuando se pide una nueva la
// anterior sobra siempre.
let _narrador = null;
let _esperaNarrador = 0;      // temporizador de la entrada retrasada de la voz
let _apartada = false;

// Baja la música mientras habla el narrador y la devuelve al acabar. Va por el
// nodo de ganancia y con una rampa, no de golpe: un salto de volumen se oye
// como un fallo del juego.
function apartarMusica(si) {
  if (!ctx || !gMusica || si === _apartada) return;
  _apartada = si;
  // AL 10%, no al 30 que tuvo. A un tercio la música seguía peleando con la voz
  // —son 48 segundos de narración sobre una pista compuesta, no un pitido— y lo
  // que se perdía era el texto, que es lo único que hay que entender en esa
  // pantalla. A una décima parte la banda sonora se queda de fondo de verdad:
  // se nota que está, y no se lee por encima de ella.
  const destino = si ? _volMusica * 0.10 : _volMusica;
  try {
    gMusica.gain.cancelScheduledValues(ctx.currentTime);
    gMusica.gain.setValueAtTime(gMusica.gain.value, ctx.currentTime);
    gMusica.gain.linearRampToValueAtTime(destino, ctx.currentTime + 0.4);
  } catch {
    gMusica.gain.value = destino;
  }
}

let _volMusica = VOLUMEN_MUSICA;
let _volEfectos = VOLUMEN_EFECTOS;

function cargarVolumenes() {
  try {
    const crudo = localStorage.getItem(CLAVE_VOL);
    if (!crudo) return;
    const d = JSON.parse(crudo);
    if (typeof d.musica === 'number') _volMusica = Math.max(0, Math.min(1, d.musica));
    if (typeof d.efectos === 'number') _volEfectos = Math.max(0, Math.min(1, d.efectos));
  } catch { /* sin almacenamiento: se usan los de fábrica */ }
}

function guardarVolumenes() {
  try {
    localStorage.setItem(CLAVE_VOL, JSON.stringify({ musica: _volMusica, efectos: _volEfectos }));
  } catch { /* sin almacenamiento: suena bien esta sesión y ya */ }
}

let _pistas = null;          // HTMLAudioElement por pista, creados una vez
let _pistaActual = -1;
let _musicaFichero = false;  // ¿hay ficheros y han cargado?
const _sueltas = {};         // HTMLAudioElement por nombre de SUELTAS, uno por uso
let _suelta = '';            // cuál de ellas toca ahora mismo, '' si ninguna
let _reintentoSuelta = 0;    // ver musicaSuelta(): reintento espaciado del play()

function siguientePista() {
  if (!_pistas) return;
  _pistaActual = (_pistaActual + 1) % _pistas.length;
  const a = _pistas[_pistaActual];
  a.currentTime = 0;
  // `play()` devuelve una promesa que el navegador rechaza si todavía no ha
  // habido gesto del usuario. No es un error del que haya que enterarse: la
  // siguiente llamada —al empezar la partida, que ya viene de pulsar una
  // tecla— sí sonará.
  const p = a.play();
  if (p && p.catch) p.catch(() => {});
}

// Engancha un <audio> al grafo para que su volumen dependa del maestro. Si el
// navegador no deja (pasa con algunos orígenes), se le pone el volumen a mano:
// mejor una pista que no obedece al ajuste que ninguna pista.
function enchufar(a) {
  try {
    ctx.createMediaElementSource(a).connect(gMusica);
  } catch {
    a.volume = _volMusica;
  }
}

// Prepara los elementos y los engancha al grafo. Devuelve si ha podido.
function prepararMusica() {
  if (!ctx || _pistas) return _musicaFichero;
  _pistas = [];
  for (let i = 0; i < PISTAS.length; i++) {
    const a = new Audio();
    a.src = PISTAS[i];
    a.preload = 'auto';
    a.loop = false;
    // Al acabar una, la siguiente. Es el bucle entero.
    a.addEventListener('ended', siguientePista);
    // Si una pista no carga se abandona el plan y manda el repliegue
    // procedural: media banda sonora sonando y media no sería peor que
    // ninguna, porque el silencio caería siempre en el mismo sitio.
    a.addEventListener('error', () => {
      _musicaFichero = false;
      pararPistas();
    });
    // Sin enrutado al grafo se reproduce igual, solo que su volumen deja de
    // depender del maestro. Mejor eso que quedarse sin música.
    enchufar(a);
    // Al documento, ocultos. Para sonar no hace falta —un elemento suelto se
    // reproduce igual— pero así se pueden inspeccionar desde el navegador, que
    // es la única forma cómoda de comprobar si una pista va por donde debe.
    a.hidden = true;
    a.dataset.pista = String(i);
    document.body.appendChild(a);
    _pistas.push(a);
  }
  _musicaFichero = true;
  return true;
}

// Las sueltas, aparte. `loop = true` y no el encadenado del `ended` de las
// otras: cada una es una sola canción y repetirla es exactamente lo que se
// quiere. Se crean la primera vez que se piden, no todas al arrancar: la del
// menú no hace falta hasta la portada, y adelantar su descarga compite con la
// voz del narrador, que sí suena ya.
function prepararSuelta(nombre) {
  if (!ctx) return false;
  if (_sueltas[nombre]) return true;
  const ruta = SUELTAS[nombre];
  if (!ruta) return false;
  const a = new Audio();
  a.src = ruta;
  a.preload = 'auto';
  a.loop = true;
  a.addEventListener('error', () => { delete _sueltas[nombre]; });
  enchufar(a);
  a.hidden = true;
  a.dataset.pista = nombre;
  document.body.appendChild(a);
  _sueltas[nombre] = a;
  return true;
}

// Para TODAS menos la que se pide dejar sonando. Se llama al cambiar de suelta
// y al empezar la partida, y por eso admite un nombre: pararlas todas para
// arrancar acto seguido la que ya sonaba la devolvería al segundo cero.
function pararSueltas(salvo) {
  for (const nombre in _sueltas) {
    if (nombre === salvo) continue;
    const a = _sueltas[nombre];
    a.pause();
    a.currentTime = 0;
  }
}

// El motor de las dos de arriba. Cambiar de suelta PARA la anterior y arranca
// la nueva desde el principio: son dos canciones distintas, no dos trozos de la
// misma, y el corte cae justo en el fundido con el que entra la portada.
function musicaSuelta(nombre) {
  if (!ctx) return;
  const a = _sueltas[nombre];
  if (_suelta === nombre && a && !a.paused) return;     // ya suena
  const ahora = performance.now();
  if (ahora - _reintentoSuelta < 700) return;
  _reintentoSuelta = ahora;

  _suelta = nombre;
  _musicaActiva = false;      // el repliegue procedural es para la partida
  pararPistas();
  pararSueltas(nombre);
  if (prepararSuelta(nombre)) {
    const p = _sueltas[nombre].play();
    if (p && p.catch) p.catch(() => {});
  }
}

function pararPistas() {
  if (!_pistas) return;
  for (let i = 0; i < _pistas.length; i++) {
    _pistas[i].pause();
    _pistas[i].currentTime = 0;
  }
  _pistaActual = -1;
}

// El dron grave del ambiente suena TODO el rato, no en bucles discretos: es
// el colchón sobre el que se recortan las frases sueltas.
function arrancarDron() {
  if (_dronOsc) return;
  _dronOsc = ctx.createOscillator();
  _dronOsc.type = 'sine';
  _dronOsc.frequency.setValueAtTime(DRON_AMBIENTE, ctx.currentTime);
  _dronGain = ctx.createGain();
  _dronGain.gain.setValueAtTime(0, ctx.currentTime);
  _dronOsc.connect(_dronGain).connect(gMusica);
  _dronOsc.start();
}

function programarBucle(t0) {
  const patron = _jefeActivo ? NOTAS_JEFE : NOTAS_AMBIENTE;
  const duracion = _jefeActivo ? LOOP_JEFE : LOOP_AMBIENTE;
  for (let i = 0; i < patron.length; i++) {
    const n = patron[i];
    tono(gMusica, n.f, n.d, n.tipo, n.vol, (t0 - ctx.currentTime) + n.t);
  }
  // El dron sube cuando llega el jefe (más presencia) y baja en calma.
  if (_dronGain) {
    _dronGain.gain.linearRampToValueAtTime(
      _jefeActivo ? 0.05 : 0.03, t0 - ctx.currentTime + ctx.currentTime + 1);
  }
  return duracion;
}

export const GestorAudio = {
  iniciar() {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
      gMaestro = ctx.createGain();
      gMaestro.gain.value = 1;
      gMaestro.connect(ctx.destination);
      cargarVolumenes();
      gEfectos = ctx.createGain();
      gEfectos.gain.value = _volEfectos;
      gEfectos.connect(gMaestro);
      gMusica = ctx.createGain();
      gMusica.gain.value = _volMusica;
      gMusica.connect(gMaestro);

      // Un segundo de ruido blanco, generado UNA vez y reutilizado por todas
      // las ráfagas de golpe/muerte/cofre: no hace falta uno nuevo por sonido,
      // solo un `AudioBufferSourceNode` distinto leyendo el mismo buffer.
      const n = ctx.sampleRate;
      bufferRuido = ctx.createBuffer(1, n, ctx.sampleRate);
      const datos = bufferRuido.getChannelData(0);
      for (let i = 0; i < n; i++) datos[i] = Math.random() * 2 - 1;

      // Los navegadores bloquean el audio hasta el primer gesto del usuario.
      // Una vez, y se desconecta: no hace falta comprobarlo en cada tecla.
      const reanudar = () => {
        if (ctx.state === 'suspended') ctx.resume();
        removeEventListener('keydown', reanudar);
        removeEventListener('pointerdown', reanudar);
      };
      addEventListener('keydown', reanudar);
      addEventListener('pointerdown', reanudar);
    } catch {
      ctx = null;             // sin audio disponible: todo se queda en silencio
    }
  },

  // Reinicia el presupuesto de sonidos frecuentes. Se llama una vez por paso
  // de LÓGICA (main.js, junto a VFX.actualizar), nunca por fotograma.
  actualizar() {
    _presupuesto = 0;
  },

  // Avanza la música. Se llama una vez por FOTOGRAMA (main.js, en dibujar),
  // no por paso de lógica: es tiempo de pared, ver la nota de cabecera.
  tick() {
    if (!ctx || !_musicaActiva) return;
    // Con las pistas de Sergio sonando no se programa nada: el dron y las
    // frases sueltas se pisarían con la mezcla y sonaría a dos músicas a la vez.
    if (_musicaFichero) return;
    const MARGEN = 0.25;
    if (ctx.currentTime > _horizonte - MARGEN) {
      arrancarDron();
      const duracion = programarBucle(Math.max(_horizonte, ctx.currentTime));
      _horizonte = Math.max(_horizonte, ctx.currentTime) + duracion;
    }
  },

  // QUÉ SUENA EN ESTE NIVEL. Lo llama main.js al cargar uno, con lo que traiga su
  // archivo de datos. Un nivel sin `musica` se queda con las de Mérida.
  //
  // Si la lista es la misma que ya estaba no se toca nada: cambiar de nivel y
  // volver no tiene por qué tirar los elementos <audio> ya descargados. Y si
  // cambia, se desmontan los de antes —pararlos no basta, se quedarían colgados
  // del grafo sonando en la siguiente partida— y se montan los nuevos a la
  // primera que haga falta.
  usarPistas(lista) {
    const nueva = (lista && lista.length) ? lista.slice() : PISTAS_POR_DEFECTO;
    if (nueva.length === PISTAS.length && nueva.every((r, i) => r === PISTAS[i])) return;
    PISTAS = nueva;
    if (_pistas) {
      pararPistas();
      for (const a of _pistas) {
        a.removeEventListener('ended', siguientePista);
        if (a.parentNode) a.parentNode.removeChild(a);
      }
      _pistas = null;
      _pistaActual = -1;
      _musicaFichero = false;
    }
  },

  iniciarMusica() {
    if (!ctx) return;
    _musicaActiva = true;
    _suelta = '';
    _horizonte = ctx.currentTime;
    pararSueltas();
    if (prepararMusica()) {
      _pistaActual = -1;
      siguientePista();      // arranca por la primera y de ahí encadena
    }
  },

  // MÚSICA DE ANTES DE JUGAR. `musicaIntro` la piden el logo y el relato;
  // `musicaMenu`, la portada y de ahí en adelante —elegir partida, el título,
  // la tienda, la configuración—. Y la piden CADA VEZ que se entra: es
  // idempotente a propósito, así ninguna pantalla tiene que llevar la cuenta de
  // cuál venía antes, le basta con decir qué suena aquí.
  //
  // Se llama en CADA FOTOGRAMA, y por eso comprueba si ya está sonando en vez
  // de fiarse de un interruptor. Los navegadores bloquean el audio hasta el
  // primer gesto del usuario, así que el primer `play()` —el del arranque,
  // antes de que nadie haya tocado nada— se rechaza siempre; llamando en bucle,
  // la música entra sola en cuanto se pulsa la primera tecla, sin que la
  // pantalla tenga que enterarse de nada de esto.
  //
  // El reintento va ESPACIADO: insistir sesenta veces por segundo mientras el
  // fichero carga llena la consola de "play() interrupted" sin adelantar nada.
  musicaIntro() { musicaSuelta('intro'); },
  musicaMenu() { musicaSuelta('menu'); },

  pararMusica() {
    _musicaActiva = false;
    _suelta = '';
    pararPistas();
    pararSueltas();
  },

  // --- NARRACIÓN -------------------------------------------------------------
  //
  // La voz del narrador en la intro y en la historia de cada nivel. Son MP3
  // horneados con ElevenLabs (ver herramientas/generar-voz.js) y viven en
  // assets/voz/, al lado de la música y por el mismo camino: un <audio>
  // enchufado al grafo.
  //
  // VA POR EL CANAL DE EFECTOS Y NO POR EL DE MÚSICA, aunque sea un fichero
  // largo como una pista. La razón es del jugador: quien baja la música quiere
  // dejar de oír la banda sonora, no quedarse sin entender el relato. Y quien
  // sube los efectos quiere oír mejor lo que pasa, que aquí es exactamente esto.
  //
  // LA MÚSICA SE APARTA MIENTRAS HABLA. No se para —el silencio detrás de una
  // voz sola suena a fallo— sino que baja a un tercio y vuelve al acabar. Es lo
  // que hace cualquier locución sobre música y lo que permite entender las dos
  // cosas a la vez.
  //
  // DEVUELVE LA DURACIÓN, en segundos, a quien la pida. El relato la usa para
  // acompasar la subida del texto a lo que tarda la voz (ver ui/relato.js): sin
  // eso, el texto va por un lado y el narrador por otro. Es una promesa porque
  // la duración no se sabe hasta que el navegador lee la cabecera del MP3.
  // `retardo` son los segundos que espera antes de empezar a hablar. Lo pide el
  // relato: el texto entra primero y la voz entra cuando el primer renglón ya se
  // puede leer (ver RETARDO_VOZ en ui/relato.js). La duración se devuelve en
  // cuanto se conoce, sin esperar a que empiece a sonar, porque quien la pide la
  // necesita para calcular el ritmo del texto desde el primer fotograma.
  narrar(ruta, retardo = 0) {
    this.callarNarrador();

    // SIN AudioContext TAMBIÉN SUENA, y esto no es una precaución de adorno: es
    // el caso NORMAL la primera vez.
    //
    // La intro arranca sola al abrir el juego, antes de que nadie haya tocado
    // nada, y hasta el primer gesto los navegadores no dejan crear el contexto.
    // La primera versión de esto se rendía ahí —`if (!ctx) return`— y el
    // resultado era que la narración de la intro no se oía JUSTO la única vez
    // que la intro se ve. Lo cazó la prueba en el navegador, no el ojo.
    //
    // Un <audio> suelto no necesita el grafo para sonar: el grafo solo sirve
    // para que el volumen lo mande el mismo mando que todo lo demás. Así que se
    // crea siempre y se enchufa si se puede; si no, se le pone el volumen a
    // mano y se reproduce igual.
    const a = new Audio();
    a.src = ruta;
    a.preload = 'auto';
    // Al canal de EFECTOS. `enchufar` manda al de música, así que aquí se hace
    // a mano: es la única fuente de fichero que no es música.
    try {
      ctx.createMediaElementSource(a).connect(gEfectos);
    } catch {
      a.volume = _volEfectos;
    }
    a.hidden = true;
    document.body.appendChild(a);
    _narrador = a;

    apartarMusica(true);
    a.addEventListener('ended', () => apartarMusica(false));

    const arrancar = () => {
      _esperaNarrador = 0;
      const p = a.play();
      if (p && p.catch) p.catch(() => {});
    };
    if (retardo > 0) _esperaNarrador = setTimeout(arrancar, retardo * 1000);
    else arrancar();

    // Si el fichero no está o el navegador no lo deja sonar, se devuelve cero y
    // el relato sigue con su ritmo de siempre. Una narración que falta es una
    // pantalla sin voz, no una pantalla rota.
    return new Promise((listo) => {
      if (a.readyState >= 1) return listo(a.duration || 0);
      a.addEventListener('loadedmetadata', () => listo(a.duration || 0), { once: true });
      a.addEventListener('error', () => listo(0), { once: true });
    });
  },

  // Cortar al narrador. Lo llama quien se salta el relato —cualquier tecla— y
  // hace falta de verdad: sin esto, la voz sigue contando la caída de Roma
  // mientras el jugador elige personaje en el menú.
  callarNarrador() {
    // El temporizador se cancela SIEMPRE, aunque no haya nadie hablando: si se
    // salta el relato durante esos primeros segundos de ventaja, la voz todavía
    // no ha empezado y sin esto arrancaría después, ya en el menú.
    if (_esperaNarrador) { clearTimeout(_esperaNarrador); _esperaNarrador = 0; }
    if (!_narrador) return;
    try {
      _narrador.pause();
      _narrador.src = '';
      _narrador.remove();
    } catch { /* ya no estaba */ }
    _narrador = null;
    apartarMusica(false);
  },

  // --- Volumen, para la pantalla de configuración ---------------------------
  //
  // Se guarda en localStorage aparte del progreso META: es un ajuste de esta
  // máquina, no algo que se haya ganado jugando, y mezclarlo con los denarios
  // haría que "empezar de cero" te bajara el volumen.
  //
  // Si no hay AudioContext, los ajustes se recuerdan igual y se aplicarán en
  // cuanto lo haya: el usuario no tiene por qué saber que el navegador todavía
  // no ha desbloqueado el audio.
  volumenMusica() { return _volMusica; },
  volumenEfectos() { return _volEfectos; },

  ajustarMusica(delta) {
    _volMusica = Math.max(0, Math.min(1, Math.round((_volMusica + delta) * 10) / 10));
    if (gMusica) gMusica.gain.value = _volMusica;
    guardarVolumenes();
  },

  ajustarEfectos(delta) {
    _volEfectos = Math.max(0, Math.min(1, Math.round((_volEfectos + delta) * 10) / 10));
    if (gEfectos) gEfectos.gain.value = _volEfectos;
    guardarVolumenes();
  },

  // Estado de la música, para poder mirarlo desde la consola sin adivinar por
  // el oído si están sonando los ficheros o el repliegue procedural.
  estadoMusica() {
    return {
      activa: _musicaActiva,
      fichero: _musicaFichero,
      pista: _pistaActual,
      sonando: _pistas && _pistaActual >= 0 ? !_pistas[_pistaActual].paused : false,
      segundo: _pistas && _pistaActual >= 0
               ? Math.round(_pistas[_pistaActual].currentTime) : 0,
      duracion: _pistas && _pistaActual >= 0
                ? Math.round(_pistas[_pistaActual].duration) || 0 : 0,
      suelta: _suelta,
      contexto: ctx ? ctx.state : 'sin AudioContext'
    };
  },

  // Sistemas/jefes.js avisa aquí cuando hay un jefe en pie o no. El cambio de
  // patrón se aplica en el SIGUIENTE bucle que se programe, nunca a mitad de
  // uno: cortar una frase por la mitad se oye peor que esperar un segundo.
  jefeActivo(activo) {
    _jefeActivo = activo;
  },

  golpe() {
    if (!ctx || _presupuesto >= PRESUPUESTO_PASO) return;
    if (!puedeSonar('golpe', 0.05)) return;
    _presupuesto++;
    ruido(gEfectos, 0.05, 0.18, 'bandpass', 1800);
  },

  muerteEnemigo() {
    if (!ctx || _presupuesto >= PRESUPUESTO_PASO) return;
    if (!puedeSonar('muerteEnemigo', 0.14)) return;
    _presupuesto++;
    ruido(gEfectos, 0.13, 0.22, 'lowpass', 900);
    tono(gEfectos, 130, 0.16, 'sine', 0.12);
  },

  danyoJugador() {
    if (!ctx) return;
    if (!puedeSonar('danyoJugador', 0.16)) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(190, t0);
    osc.frequency.exponentialRampToValueAtTime(75, t0 + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    osc.connect(g).connect(gEfectos);
    osc.start(t0);
    osc.stop(t0 + 0.18);
  },

  recogerGema() {
    if (!ctx || _presupuesto >= PRESUPUESTO_PASO) return;
    if (!puedeSonar('recogerGema', 0.09)) return;
    _presupuesto++;
    tono(gEfectos, 880, 0.05, 'sine', 0.08);
    tono(gEfectos, 1320, 0.06, 'sine', 0.07, 0.045);
  },

  subidaNivel() {
    if (!ctx) return;
    const notas = [261.63, 329.63, 392.00, 523.25];   // C4-E4-G4-C5
    for (let i = 0; i < notas.length; i++) {
      tono(gEfectos, notas[i], 0.22, 'triangle', 0.14, i * 0.07);
    }
  },

  abrirCofre() {
    if (!ctx) return;
    ruido(gEfectos, 0.09, 0.2, 'lowpass', 500);
    tono(gEfectos, 392.00, 0.18, 'triangle', 0.1, 0.05);
    tono(gEfectos, 587.33, 0.22, 'triangle', 0.09, 0.09);
  },

  avisoJefe() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(58, t0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.5);
    g.gain.linearRampToValueAtTime(0, t0 + 1.4);
    osc.connect(g).connect(gEfectos);
    osc.start(t0);
    osc.stop(t0 + 1.5);
    ruido(gEfectos, 1.2, 0.06, 'lowpass', 200, 0.1);
  }
};
