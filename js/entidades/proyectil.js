import { ANCHO_LOGICO, ALTO_LOGICO, ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';
import { Recursos } from '../core/recursos.js';
import { sen, cos, atan2, hipot } from '../core/mate.js';
import { RejillaMapa } from '../sistemas/rejillaMapa.js';

// Proyectiles. Mismo patrón que los enemigos: pool preasignado, activos
// contiguos, cero `new` en partida.
//
// NO usan sprite. El plan es explícito: proyectiles, explosiones, charcos y
// partículas se dibujan por código con formas y `globalCompositeOperation =
// 'lighter'`. Rinden mejor que un PNG escalado y, sobre todo, se ven mejor:
// una jabalina de 8 píxeles dibujada como trazo siempre estará más limpia que
// un sprite reducido.

// Margen fuera de pantalla antes de reciclar.
//
// Era 48, que basta para lo que SALE de cámara: un proyectil que se va ya no le
// importa a nadie. Pero desde la Lluvia de flechas también hay proyectiles que
// ENTRAN —nacen por encima del borde superior y caen dentro— y con el margen
// corto se reciclaban en el mismo frame en que se lanzaban, antes de que nadie
// los viera. La caja tiene que ser lo bastante alta para sostenerlos mientras
// bajan.
//
// 200 cubre una caída de 150 sobre un blanco en el borde de la pantalla. Lo que
// cuesta es que un proyectil que se va de cuadro tarda un poco más en devolver
// su hueco al pool; da igual, porque de todas formas muere solo al agotar su
// `vida`, que es su alcance partido por su velocidad.
const MARGEN = 200;

// LO QUE PASA EN CADA REBOTE, sea contra el margen de la cámara o contra una
// pared del nivel: se gasta un rebote y la bala vuelve a ser una bala nueva.
function recargarTrasRebote(p) {
  p.rebotesPared--;
  // Se le devuelve el alcance. El `vida` de un proyectil es su alcance
  // partido por su velocidad, o sea la distancia que le queda: sin
  // reponerlo, la bala llega al margen ya agotada y el rebote se ve
  // apagarse a los dos palmos en vez de volver.
  p.vida = p.vidaMax;
  // Y vuelve a poder golpear a quien ya golpeó: el sello es lo que
  // impide que un proyectil dañe dos veces al mismo, y una bala que
  // vuelve del margen es un golpe nuevo.
  p.sello = contadorSello++;
  // Con la perforación entera otra vez, que es lo que hace que el
  // rebote SIRVA. Una bala que vuelve gastada rebota de adorno: cruza
  // la horda sin tocar a nadie y lo único que se ve es una raya. Y es
  // coherente con las otras dos líneas: si el margen la deja como un
  // disparo nuevo, lo es entera. El daño sigue acotado, porque cada
  // tramo entre paredes gasta como mucho su perforación.
  p.perforacion = p.perforacionMax;

  // Y SALE MÁS RÁPIDA DE LO QUE ENTRÓ. Es lo que convierte los rebotes
  // de un recurso a una amenaza que crece: la primera vuelta es una
  // bala y la décima es un latigazo cruzando la pantalla.
  //
  // Se multiplica la velocidad y NO se toca `vida`, que se acaba de
  // reponer entera: como `vida` es tiempo y no distancia, una bala más
  // rápida recorre más en ese mismo tiempo. O sea que cada rebote alarga
  // también el tramo siguiente, que es justo lo que hace falta para que
  // le dé tiempo a llegar a la pared de enfrente.
  if (p.aceleraRebote > 0) {
    const k = 1 + p.aceleraRebote;
    p.vx *= k;
    p.vy *= k;
  }
}

function crearProyectil() {
  return {
    x: 0, y: 0, xPrev: 0, yPrev: 0,
    vx: 0, vy: 0,
    vida: 0,                 // segundos que le quedan
    vidaMax: 0,              // con los que nació; se repone al rebotar
    danyo: 0, empuje: 0,
    radio: 0,
    // QUIÉN LO DISPARÓ. Es el objeto jugador, no un índice: el motor ya guarda
    // referencias a jugadores en otros sitios (las auras se pegan a uno con
    // `seguir`), y una referencia no obliga a mantener índices al ritmo de los
    // jugadores que entran y salen de la partida. `null` = de nadie, y entonces
    // la baja solo cuenta para el total de la horda.
    duenyo: null,
    // Enemigos que aún puede atravesar. NEGATIVO significa "en seco": gastado
    // pero todavía volando, que es lo que le pasa a una bala con rebotes de
    // pared pendientes (ver `rebotesPared` y sistemas/colisiones.js).
    perforacion: 0,
    perforacionMax: 0,       // con la que nació; se repone al rebotar
    sello: 0,                // marca para no golpear dos veces al mismo
    // Al agotarse deja una onda expansiva de este radio. 0 = no estalla.
    radioExplosion: 0, danyoExplosion: 0,
    estallaAlExpirar: false, // las granadas revientan aunque no den a nadie
    // Id de atlas de la hoja de explosión, para que la onda que deja al
    // estallar sepa con qué dibujarse. Quien la crea es main.js, y allí ya no
    // queda arma: solo el proyectil.
    spriteOnda: null,
    // COLUMNA DE RAYO al estallar. `rayoCaida` es desde cuánto más arriba cae
    // el haz —0 = no cae ninguno— y `rayoGrosor` su trazo. Viaja con el
    // proyectil por lo mismo que `spriteOnda`: quien revienta es main.js y allí
    // ya no hay arma a la que preguntarle.
    rayoCaida: 0, rayoGrosor: 3,
    // REBOTES CONTRA EL BORDE DE LA PANTALLA. Cuántas veces le queda por
    // rebotar antes de seguir de largo. El Fusil los usa: la bala vuelve del
    // margen y barre otra vez, que convierte un arma de un solo blanco en una
    // que castiga los pasillos.
    rebotesPared: 0,
    // Cuánto gana de velocidad en CADA rebote de pared, en tanto por uno. 0 =
    // vuelve igual de rápido que se fue, que es lo normal.
    aceleraRebote: 0,
    // REBOTES DE ENEMIGO A ENEMIGO. Al gastarse contra uno, en vez de morir
    // salta al más cercano que no haya tocado ya. Es la Honda: una piedra que
    // va haciendo cabriolas entre la horda.
    rebotesEnemigo: 0,
    // SI PASA POR ENCIMA DE LAS PAREDES del nivel. Lo normal es que no: un
    // proyectil que toca pared muere ahí —o rebota, si le quedan rebotes—. Lo
    // llevan a true los que caen del cielo (Bombardeo, Lluvia de flechas,
    // Cayado): una flecha que cae a plomo no tiene pared que la pare. Ver
    // `atraviesaParedes` en datos/armas.js.
    atraviesaParedes: false,
    color: '#fff', estela: null,
    largo: 8,                // longitud del trazo al dibujar
    // Cómo se dibuja: dardo, bala, bola, rayo o el trazo de siempre. Sale del
    // comportamiento del arma (ver FORMA_POR_COMPORTAMIENTO en sistemas/armas.js).
    forma: 'raya',
    // Id de atlas de un dibujo propio. Si lo trae, sustituye a la forma
    // trazada; si no carga, se vuelve a la forma sin avisar.
    hoja: null,
    // CUÁNTO SE AMPLÍA SU DIBUJO. 1 = a su tamaño horneado, que es lo normal.
    //
    // Lo usa la Rosa de los vientos, que crece con el nivel del arma: su hitbox
    // sube de 3 a 12 y la estrella tiene que subir con él, o al máximo estaría
    // haciendo daño a cuatro veces la distancia de lo que se ve.
    escala: 1,
    // GIRO SOBRE SÍ MISMO, en radianes por segundo. 0 = el dibujo se orienta
    // según su vuelo, que es lo normal en un proyectil.
    //
    // Hay cosas que no apuntan a donde van: un shuriken voltea, una botella da
    // vueltas por el aire. Para esas, orientar el dibujo al rumbo lo deja
    // clavado y rígido, que es justo lo contrario de lo que hacen de verdad.
    giro: 0,
    // BUMERÁN: sale, frena, se para y vuelve. Cero = vuela recto, que es lo
    // normal.
    //
    // La velocidad no se toca al lanzar: lo que se guarda es la de salida
    // (`vx0`/`vy0`) y en cada paso se multiplica por un factor que va de +1 a
    // -1 según la vida gastada. Con ese reparto la integral del recorrido es
    // cero, o sea que vuelve EXACTAMENTE al punto desde el que salió, y sin
    // integrar aceleraciones: dos partidas con la misma semilla trazan la misma
    // curva hasta el último píxel.
    //
    // Vuelve al SITIO desde el que se lanzó, no al jugador. Es lo que hace un
    // bumerán de verdad, y perseguir al dueño obligaría a guardarle una
    // referencia y a curvar la trayectoria cada paso — más código para algo que
    // se nota menos que el propio ir y venir.
    bumeran: 0,
    vx0: 0, vy0: 0,
    // EL ARMA QUE LO DISPARÓ, para apuntarle el daño y las bajas en el resumen.
    // Viaja con el proyectil por el mismo motivo que `duenyo`: quien mira la
    // colisión tiene el proyectil delante y el arma ya no.
    arma: null,
    // QUÉ FOTOGRAMA DE SU HOJA DIBUJA. 0 en todos menos uno, porque casi todas
    // las hojas de proyectil traen un solo dibujo.
    //
    // Existe por el RainbowMazas, cuya hoja trae diez mazas de diez colores y
    // lanza una de cada: al nivel 10 salen las diez a la vez y ninguna repite.
    // Quien lanza decide cuál le toca a cada una (ver `direccionAleatoria` en
    // sistemas/armas.js); aquí solo se dibuja la que digan.
    fotograma: 0,
    // PERSECUCIÓN, en radianes por segundo. 0 = vuela recto, que es lo normal.
    //
    // Es cuánto puede TORCER el rumbo cada segundo hacia el enemigo más
    // cercano, no un imán: con un tope de giro, un blanco que se cruza de lado
    // obliga al proyectil a describir una curva y puede llegar a pasarse de
    // largo y tener que volver. Eso es lo que hace que se lea como algo que
    // corre detrás de alguien y no como una línea que se dobla.
    persigue: 0,
    // EL CULEBREO, en radianes de amplitud y en oscilaciones por segundo. Se
    // suma al rumbo ya corregido, así que el bicho zigzaguea MIENTRAS persigue.
    //
    // La fase es propia de cada proyectil (`fase`, sorteada al lanzar) para que
    // cuatro ositos sueltos a la vez no culebreen como un solo cuerpo.
    zigzag: 0, zigFrec: 0, fase: 0,
    // Rapidez de crucero, guardada aparte. Perseguir gira el vector velocidad y
    // al girarlo hay que reconstruirlo: sin este número, los errores de coma
    // flotante de cada paso irían comiéndose la velocidad hasta dejar al
    // proyectil parado en el aire.
    rapidez: 0,
    // FOTOGRAMAS POR SEGUNDO de su hoja. 0 = no anima, que es lo normal: casi
    // todas las hojas de proyectil traen un dibujo quieto.
    animFps: 0,
    // NO SE ORIENTA AL VUELO: solo se espeja según hacia dónde va. Una bala
    // apunta a donde vuela, pero un osito que corre tiene los pies abajo
    // siempre, y rotarlo con el rumbo lo dejaría cabeza abajo yendo a la
    // izquierda.
    sinRotar: 0,
    // CARRERILLA: segundos de salida en línea recta, sin perseguir ni culebrear.
    //
    // Sin esto, un osito lanzado hacia la derecha con un enemigo a la izquierda
    // del jugador daba media vuelta en el sitio y volvía cruzando por delante de
    // quien lo había soltado: se quedaba dando vueltas a los pies del jugador en
    // vez de salir corriendo, que es lo que promete el arma. Con la carrerilla
    // primero SALE, y en cuanto está fuera empieza a buscar.
    recto: 0
  };
}

// Marca única por proyectil. Cada enemigo golpeado guarda el sello del
// proyectil que le dio; comparándolo, un proyectil perforante nunca cuenta dos
// veces al mismo enemigo aunque siga solapándolo varios frames.
//
// Es preferible a que el proyectil lleve una lista de a quién ha tocado: esa
// lista habría que asignarla, vaciarla y recorrerla, y los índices del pool de
// enemigos cambian de posición al reciclar.
// Hasta dónde busca presa un proyectil que persigue. Ver `persigue`.
//
// 150 es media pantalla a lo ancho: lo bastante para que el osito encuentre a
// alguien casi siempre estando dentro de la horda, y lo bastante poco para que
// uno lanzado al vacío se vaya de verdad en vez de cruzar el mapa a por el
// último enemigo del nivel.
const RADIO_CAZA = 150;
const TAU = Math.PI * 2;

// EL RODEO. Un proyectil que caza NO PASA POR ENCIMA DE UN JUGADOR: le da la
// vuelta, y por fuera del DIBUJO, no del círculo de colisión.
//
// Es lo que separa a un osito corriendo por el suelo de una bala, que atraviesa
// a los suyos porque va por el aire y a nadie le extraña. Un juguete con patas
// cruzando un cuerpo se lee como que el dibujo está mal pegado, y en
// cooperativo, con cuatro cuerpos en dos palmos, pasa todo el rato.
//
// CONTRA LA SILUETA, Y POR ESO ES UNA ELIPSE. El círculo de colisión del
// jugador tiene radio 8 y está a sus PIES —ahí es donde le pegan—, pero el
// personaje mide 26 de alto por unos 15 de ancho: un osito que pasara a diez
// unidades del punto de los pies cruzaría el pecho por encima sin entrar en
// ningún círculo. Así que la zona que no se pisa es un óvalo del tamaño del
// dibujo, centrado a media altura, y de ahí salen las dos medidas de siempre:
//
//   `siluetaDe` — el óvalo mismo, con un margen para no rozarlo.
//   RODEO_HOLGURA — cuánto más lejos empieza a torcer, en veces ese óvalo.
//                   Ir sobrado es lo que hace la curva suave en vez de un
//                   quiebro al tocar una línea invisible.
//
// El empujón de después de mover usa el óvalo pelado: es el "nunca" de "nunca
// lo atraviesa", y la curva puede fallar a bocajarro.
const RODEO_HOLGURA = 1.9;
// LA BURBUJA DE SALIDA, alrededor de QUIEN LO HA LANZADO.
//
// Rodear el cuerpo no basta para que un osito se vaya. La horda persigue al
// jugador, o sea que el enemigo más cercano casi siempre está pegado a él: en
// cuanto se le acababa la carrerilla, el osito daba media vuelta y se quedaba
// orbitando entre los pies de su dueño —medido: una de cada cuatro muestras a
// menos de 18 unidades—. Eso no es lo que promete el arma, que es soltar bichos
// que SALEN CORRIENDO.
//
// Dentro de este radio el rumbo tiene prohibido acercarse a su dueño: se le
// permite salir o irse de lado, nunca volver. El tope es de 80 grados y no de
// 90 justo por eso: a 90 la componente radial es cero y el osito daría vueltas
// eternas a la misma distancia; con 80 siempre le queda algo de "hacia fuera" y
// termina saliendo, aunque sea en espiral.
//
// Solo vale para SU dueño. A los otros jugadores se les rodea, que es distinto:
// ahí no hay nada de lo que huir, solo un cuerpo que no se pisa.
const SALIDA_RADIO = 46;
const SALIDA_TOPE = 80 * Math.PI / 180;
// Aire entre el dibujo del jugador y el osito. Lo pidió Sergio así: rodearlo
// SIN TOCARLO, o sea que las siluetas no lleguen a compartir un píxel.
const RODEO_MARGEN = 2;
// De cuánto es el óvalo de un jugador EN LA DIRECCIÓN en que se le mira, y
// dónde está su centro. Se devuelve en el objeto de siempre para no asignar uno
// por proyectil y por paso: esto se llama en el bucle caliente.
const OVALO = { cx: 0, cy: 0, rx: 0, ry: 0 };
function siluetaDe(j) {
  const meta = Recursos.meta(j.personaje);
  // Sin dibujo cargado, el bulto de siempre: 26 de alto es lo que miden los
  // ocho personajes, y con eso el rodeo sigue siendo correcto aunque el atlas
  // no haya llegado.
  const h = meta ? meta.h / ESCALA_ARTE : 26;
  const w = meta ? meta.w / ESCALA_ARTE : 16;
  OVALO.cx = j.x;
  OVALO.cy = j.y - h / 2;         // el ancla del personaje son los PIES
  OVALO.rx = w / 2 + RODEO_MARGEN;
  OVALO.ry = h / 2 + RODEO_MARGEN;
  return OVALO;
}
// El radio del óvalo en la dirección (ux, uy), unitaria. Es la fórmula de la
// elipse en polares: con rx = ry devuelve el radio del círculo, así que no hay
// dos caminos que mantener.
function radioOvalo(rx, ry, ux, uy) {
  const a = ry * ux, b = rx * uy;
  return (rx * ry) / Math.sqrt(a * a + b * b);
}

let contadorSello = 1;

// SE REINICIA CON EL POOL, al empezar cada partida.
//
// Es un contador de módulo que solo subía, así que dos partidas seguidas
// repartían sellos en rangos distintos. Para una sola partida da igual —lo que
// se compara son igualdades dentro de la misma tanda— pero deja el estado
// dependiendo de cuántas partidas lleves jugadas, y eso es justo lo que hace
// que "misma semilla, misma partida" deje de ser cierto.
function reiniciarSellos() { contadorSello = 1; }

// Un sello nuevo. Lo necesita el rebote entre enemigos (sistemas/colisiones.js):
// un proyectil que cambia de rumbo hacia otro blanco es un golpe nuevo y tiene
// que poder volver a tocar a quien ya tocó. Se exporta el CONTADOR y no se
// duplica en el otro archivo para que no haya dos series que puedan chocar.
export function nuevoSello() { return contadorSello++; }

export class Proyectiles {
  constructor(capacidad) {
    this.pool = new Pool(crearProyectil, capacidad);
    this.dibujados = 0;
  }

  get activos() { return this.pool.activos; }

  lanzar(x, y, vx, vy, def) {
    // LA BOCA NO PUEDE ESTAR AL OTRO LADO DE UNA PARED. Está en el contorno del
    // dibujo, hasta 28 unidades por encima de los pies; pegado por debajo a un
    // muro de una celda (8), queda del otro lado y el proyectil nacía ya en la
    // tienda de al lado sin haber tocado pared. Se mira el tramo de los pies de
    // quien dispara a la boca y, si cruza muro, el disparo sale DE LOS PIES: así
    // pegado a un muro se sigue disparando a lo largo de él, y lo que vaya
    // hacia el muro muere contra él al primer paso, como debe.
    if (def.duenyo && RejillaMapa.activa && !def.atraviesaParedes &&
        !RejillaMapa.lineaLibre(def.duenyo.x, def.duenyo.y, x, y)) {
      x = def.duenyo.x;
      y = def.duenyo.y;
    }
    const p = this.pool.obtener();
    if (!p) return null;
    p.x = p.xPrev = x;
    p.y = p.yPrev = y;
    p.vx = vx;
    p.vy = vy;
    p.vida = def.vida;
    p.danyo = def.danyo;
    p.empuje = def.empuje;
    p.radio = def.radio;
    p.perforacion = p.perforacionMax = def.perforacion;
    p.color = def.color;
    p.estela = def.estela || null;
    p.largo = def.largo || 8;
    p.forma = def.forma || 'raya';
    p.hoja = def.hoja || null;
    p.giro = def.giro || 0;
    p.escala = def.escala || 1;
    p.fotograma = def.fotograma || 0;
    p.arma = def.arma || null;
    p.bumeran = def.bumeran ? 1 : 0;
    p.vx0 = p.vx;
    p.vy0 = p.vy;
    p.radioExplosion = def.radioExplosion || 0;
    p.danyoExplosion = def.danyoExplosion || 0;
    p.estallaAlExpirar = !!def.estallaAlExpirar;
    p.spriteOnda = def.spriteOnda || null;
    p.rayoCaida = def.rayoCaida || 0;
    p.rayoGrosor = def.rayoGrosor || 3;
    p.vidaMax = p.vida;
    p.rebotesPared = def.rebotesPared || 0;
    p.aceleraRebote = def.aceleraRebote || 0;
    p.rebotesEnemigo = def.rebotesEnemigo || 0;
    p.atraviesaParedes = !!def.atraviesaParedes;
    p.persigue = def.persigue || 0;
    p.zigzag = def.zigzag || 0;
    p.zigFrec = def.zigFrec || 0;
    p.fase = def.fase || 0;
    p.rapidez = hipot(vx, vy);
    p.animFps = def.animFps || 0;
    p.sinRotar = def.sinRotar ? 1 : 0;
    p.recto = def.recto || 0;
    p.duenyo = def.duenyo || null;
    p.sello = contadorSello++;

    // Y NACE YA FUERA DEL CUERPO DE QUIEN LO SUELTA. El que rodea se aparta en
    // cada paso (ver `siluetaDe` en `mover`), pero el primer fotograma es
    // anterior a su primer paso: un osito sale de la boca de su dueño, que está
    // a menos de eso, así que durante un fotograma se le veía encima. Se le
    // empuja al borde por donde va, que es hacia donde iba a salir de todas
    // formas.
    if (p.persigue > 0 && p.duenyo) {
      const o = siluetaDe(p.duenyo);
      const dx = p.x - o.cx, dy = p.y - o.cy;
      const d = hipot(dx, dy);
      const v = hipot(p.vx, p.vy) || 1;
      const r = radioOvalo(o.rx, o.ry, d < 0.001 ? p.vx / v : dx / d,
                                       d < 0.001 ? p.vy / v : dy / d);
      if (d < r) {
        // Sale por donde VA, no por donde está: hacia dónde apunta ya se
        // sorteó al lanzarlo, y es lo que reparte la camada alrededor.
        const rv = radioOvalo(o.rx, o.ry, p.vx / v, p.vy / v);
        p.x = o.cx + (p.vx / v) * rv;
        p.y = o.cy + (p.vy / v) * rv;
        p.xPrev = p.x;
        p.yPrev = p.y;
      }
    }
    return p;
  }

  // `alEstallar` es una referencia de función, no una closure: la fija main.js
  // una vez. `cazar(x, y, radio)` viene por el mismo camino y por un motivo de
  // más: buscar al enemigo más cercano vive en sistemas/colisiones.js, que ya
  // importa de este archivo, así que importarlo aquí cerraría un ciclo de
  // módulos por una sola llamada. Se llama con el proyectil que acaba de expirar y que debe reventar.
  // `camara` solo hace falta para los proyectiles que rebotan; se pasa siempre
  // porque comprobar `rebotesPared` es una comparación con cero y no compensa
  // tener dos caminos.
  mover(dt, alEstallar, camara, cazar, jugadores) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      p.xPrev = p.x;
      p.yPrev = p.y;

      // EL BUMERÁN, antes de mover: de +1 a -1 según la vida gastada. A media
      // vida el factor es cero —el aro se para en el aire, que es el momento
      // que lo hace reconocible— y de ahí en adelante desanda lo andado.
      //
      // Se reescribe `vx`/`vy` y no se mueve por otro camino porque todo lo
      // demás lee esos dos números: el dibujo se orienta con ellos, el empuje
      // al golpear sale de ellos y el rebote los invierte. Un bumerán que
      // volviera por su cuenta pegaría hacia donde ya no va.
      if (p.bumeran) {
        const f = 1 - 2 * (p.vidaMax - p.vida) / p.vidaMax;
        p.vx = p.vx0 * f;
        p.vy = p.vy0 * f;
      }

      // EL QUE PERSIGUE: tuerce hacia el enemigo más cercano y culebrea.
      //
      // Va antes de mover y no después por lo de siempre en este archivo: todo
      // lo demás lee `vx`/`vy` —el dibujo se orienta con ellos y el empuje del
      // golpe sale de ellos—, así que el rumbo tiene que estar puesto antes de
      // que el paso ocurra.
      if (p.recto > 0) p.recto -= dt;

      // Mientras dura la carrerilla no se toca el rumbo: sale recto y punto.
      if (p.persigue > 0 && cazar && p.recto <= 0) {
        let ang = atan2(p.vy, p.vx);
        // ALCANCE DE BÚSQUEDA, no de vuelo: si no hay nadie cerca sigue recto y
        // se le acaba la vida, que es lo que tiene que pasar cuando se lanza a
        // un claro. El radio es generoso porque el proyectil ya está en medio
        // de la horda, no en la mano del jugador.
        const obj = cazar(p.x, p.y, RADIO_CAZA);
        if (obj) {
          const deseado = atan2(obj.y - p.y, obj.x - p.x);
          // La diferencia, normalizada al tramo corto: sin esto, un blanco a la
          // espalda hace que el giro dé la vuelta por el lado largo.
          let d = deseado - ang;
          while (d > Math.PI) d -= TAU;
          while (d < -Math.PI) d += TAU;
          const tope = p.persigue * dt;
          ang += d > tope ? tope : (d < -tope ? -tope : d);
        }
        // Y EL CULEBREO ENCIMA. Se aplica al rumbo dibujado y de vuelo, no a la
        // posición: desviar el punto dejaría al bicho corriendo de lado.
        //
        // La fase se cuenta con la vida ya gastada, que avanza en pasos de dt
        // fijo, y no con un reloj de pared: dos partidas con la misma semilla
        // trazan el mismo culebreo.
        if (p.zigzag > 0) {
          ang += sen(p.fase + (p.vidaMax - p.vida) * p.zigFrec) * p.zigzag;
        }

        // Y AHORA SE APARTA DE LOS JUGADORES, lo último de todo: persecución y
        // culebreo proponen un rumbo y esto lo corrige, así que ningún blanco y
        // ninguna oscilación pueden volver a meterlo dentro del cuerpo.
        //
        // La corrección es angular y no un empujón: se le exige al rumbo un
        // hueco mínimo respecto a la dirección en la que está el jugador, y si
        // no lo cumple se le manda al borde de ese hueco POR EL LADO AL QUE YA
        // IBA. Girar siempre hacia el mismo lado haría que dos ositos que
        // llegan por lados opuestos se cruzaran los dos por el mismo sitio.
        //
        // El hueco crece según se acerca —de nada en el borde a media vuelta
        // pegado al cuerpo—, que es lo que dibuja la curva alrededor en vez de
        // un quiebro seco al tocar una línea invisible.
        if (jugadores) {
          for (let m = 0; m < jugadores.length; m++) {
            const j = jugadores[m];
            const o = siluetaDe(j);
            const jx = o.cx - p.x, jy = o.cy - p.y;
            const d = hipot(jx, jy);
            if (d < 0.001) continue;
            const rSil = radioOvalo(o.rx, o.ry, jx / d, jy / d);
            if (d >= rSil * RODEO_HOLGURA) continue;
            const hacia = atan2(jy, jx);
            let dif = ang - hacia;
            while (dif > Math.PI) dif -= TAU;
            while (dif < -Math.PI) dif += TAU;
            // El hueco que se le exige al rumbo crece según se acerca: de nada
            // en el borde de la holgura a media vuelta pegado a la silueta.
            const cerca = (rSil * RODEO_HOLGURA - d) / (rSil * (RODEO_HOLGURA - 1));
            const hueco = (cerca > 1 ? 1 : cerca) * (Math.PI / 2);
            // Al lado al que YA IBA: girando siempre hacia el mismo, dos
            // ositos que llegan por lados opuestos se cruzarían por el mismo
            // sitio.
            if (dif >= 0 && dif < hueco) ang = hacia + hueco;
            else if (dif < 0 && dif > -hueco) ang = hacia - hueco;
          }
        }

        // Y LO ÚLTIMO, que no se le vuelva a acercar a quien lo soltó.
        if (p.duenyo) {
          const o = siluetaDe(p.duenyo);
          const dx = p.x - o.cx, dy = p.y - o.cy;
          const d = hipot(dx, dy);
          if (d < SALIDA_RADIO && d > 0.001) {
            const fuera = atan2(dy, dx);
            let dif = ang - fuera;
            while (dif > Math.PI) dif -= TAU;
            while (dif < -Math.PI) dif += TAU;
            if (dif > SALIDA_TOPE) ang = fuera + SALIDA_TOPE;
            else if (dif < -SALIDA_TOPE) ang = fuera - SALIDA_TOPE;
          }
        }

        p.vx = cos(ang) * p.rapidez;
        p.vy = sen(ang) * p.rapidez;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // REBOTE CONTRA EL MARGEN VISIBLE, y contra el visible a propósito: el
      // borde contra el que rebota tiene que ser uno que el jugador VEA, o el
      // rebote parece que sale de la nada. Por eso se usa la cámara y no los
      // límites del nivel.
      //
      // Se invierte la componente y se recoloca justo dentro del borde: sin
      // recolocar, un proyectil rápido puede quedarse fuera un paso más y
      // gastar los dos rebotes contra la misma pared en dos frames seguidos.
      //
      // ESTO SE PERDIÓ Y HUBO QUE TRAERLO DE VUELTA. Desapareció en el commit
      // del Osito Dinamito —que reescribió `mover` entera para meter la
      // persecución y el rodeo— y con él se fue el Fusil: el parámetro `camara`
      // seguía llegando a la función y ya no lo leía nadie, así que el arma cuyo
      // truco entero es convertir la pantalla en una mesa de billar disparaba
      // balas que se apagaban contra el borde. La mitad de la mecánica que vive
      // en sistemas/colisiones.js —mandar la bala a la pared en vez de darla por
      // gastada contra un cuerpo— sí sobrevivió, y por eso no saltó nada: el
      // arma funcionaba, simplemente no rebotaba.
      if (p.rebotesPared > 0 && camara) {
        // El borde sale de la cámara LÓGICA (`camara.x`) y no de `izquierda`,
        // que se calcula sobre `xVista` — la posición YA INTERPOLADA para
        // dibujar. Rebotar es lógica: cambia la trayectoria y por tanto a quién
        // se mata, así que no puede depender de un valor que se mueve con los
        // fps. Con `xVista`, la misma semilla daba rebotes distintos a 60 y a
        // 144 Hz, que es justo lo que la reproducibilidad prohíbe.
        const cx = camara.x - ANCHO_LOGICO / 2, cy = camara.y - ALTO_LOGICO / 2;
        const izq = cx, der = cx + ANCHO_LOGICO;
        const arr = cy, aba = cy + ALTO_LOGICO;
        let reboto = false;
        if (p.x < izq && p.vx < 0)      { p.x = izq; p.vx = -p.vx; reboto = true; }
        else if (p.x > der && p.vx > 0) { p.x = der; p.vx = -p.vx; reboto = true; }
        else if (p.y < arr && p.vy < 0) { p.y = arr; p.vy = -p.vy; reboto = true; }
        else if (p.y > aba && p.vy > 0) { p.y = aba; p.vy = -p.vy; reboto = true; }
        if (reboto) recargarTrasRebote(p);
      }

      // LAS PAREDES DEL NIVEL. En un recinto (ver sistemas/rejillaMapa.js) lo
      // que vuela se para en la pared: es la regla que el jugador lee del mapa
      // —detrás de un muro se está a salvo— y vale en los dos sentidos, o una
      // tienda cerrada sería un fuerte desde el que se dispara sin que entre
      // nadie. Se prueba el TRAMO recorrido y no el punto final, por lo mismo
      // que los impactos: una bala rápida cruza una pared fina en un paso.
      //
      // Tres salidas según lo que sea:
      //  - los que CORREN por el suelo (el Osito) resbalan por la pared como
      //    resbala todo el mundo, igual que contra una columna de Mérida;
      //  - los que tienen rebotes de pared (el Fusil) rebotan de verdad, y aquí
      //    la pared sí se ve, que era lo que pedía el rebote contra el margen;
      //  - el resto muere en la pared, y si era una granada revienta en ella.
      if (RejillaMapa.activa && !p.atraviesaParedes) {
        if (p.persigue > 0) {
          RejillaMapa.colisionar(p, p.radio > 0 ? p.radio : 1);
        } else if (!RejillaMapa.lineaLibre(p.xPrev, p.yPrev, p.x, p.y)) {
          if (p.rebotesPared > 0) {
            // Qué eje ha chocado: se prueba cada componente por separado desde
            // el último punto bueno. Si ninguna sola lo explica es una esquina
            // y se invierten las dos.
            const chocaX = !RejillaMapa.lineaLibre(p.xPrev, p.yPrev, p.x, p.yPrev);
            const chocaY = !RejillaMapa.lineaLibre(p.xPrev, p.yPrev, p.xPrev, p.y);
            if (chocaX || !chocaY) p.vx = -p.vx;
            if (chocaY || !chocaX) p.vy = -p.vy;
            p.x = p.xPrev;
            p.y = p.yPrev;
            recargarTrasRebote(p);
          } else {
            // Revienta en el último punto que aún era aire, no dentro del muro:
            // una onda que nace en la pared reparte la mitad al otro lado.
            p.x = p.xPrev;
            p.y = p.yPrev;
            if (p.radioExplosion > 0 && alEstallar) alEstallar(p);
            this.pool.liberarEn(k);
            continue;
          }
        }
      }

      // EL "NUNCA" DEL RODEO. La curva de arriba evita el cuerpo casi siempre,
      // pero "casi" no es lo que se pidió: a bocajarro —el osito nace ENTRE los
      // pies de quien dispara— o si el jugador corre a meterse encima, no hay
      // rumbo que valga. Así que después de mover se comprueba, y lo que esté
      // dentro se saca por donde entró.
      //
      // Se mueve la POSICIÓN y no la velocidad: el rumbo ya está corregido y es
      // el bueno, lo que sobra es haberse metido. Empujando el rumbo en vez del
      // punto, el osito se quedaría trabado contra el cuerpo dando vueltas.
      if (p.persigue > 0 && jugadores) {
        for (let m = 0; m < jugadores.length; m++) {
          const j = jugadores[m];
          const o = siluetaDe(j);
          const dx = p.x - o.cx, dy = p.y - o.cy;
          const d = hipot(dx, dy);
          // Justo encima del centro no hay "por donde entró" que valga: se le
          // saca por donde va, que es lo único que no depende de dividir por
          // cero.
          if (d < 0.001) {
            const v = hipot(p.vx, p.vy) || 1;
            const r = radioOvalo(o.rx, o.ry, p.vx / v, p.vy / v);
            p.x = o.cx + (p.vx / v) * r;
            p.y = o.cy + (p.vy / v) * r;
            continue;
          }
          const r = radioOvalo(o.rx, o.ry, dx / d, dy / d);
          if (d >= r) continue;
          p.x = o.cx + (dx / d) * r;
          p.y = o.cy + (dy / d) * r;
        }
      }

      p.vida -= dt;
      if (p.vida <= 0) {
        // Una granada que no acierta a nadie tiene que estallar igual: caer al
        // suelo y desaparecer sin más sería lo contrario de lo que promete.
        if (p.estallaAlExpirar && p.radioExplosion > 0 && alEstallar) alEstallar(p);
        this.pool.liberarEn(k);                  // sin avanzar k: ver Pool
      } else k++;
    }
  }

  // Baja inmediata, la usa el sistema de colisiones cuando se agota la
  // perforación.
  liberarEn(i) { this.pool.liberarEn(i); }

  vaciar() { this.pool.vaciar(); reiniciarSellos(); }

  // TODO LO QUE HAYA LANZADO ESTE JUGADOR, FUERA. Lo llama main.js en el
  // instante en que alguien cae abatido.
  //
  // Un proyectil en vuelo no tiene quien lo gobierne, pero tampoco se apaga
  // solo: sigue su recta hasta salir de cámara o caducar, y mientras tanto pega.
  // Con el dueño en el suelo eso se lee como un arma que dispara sin nadie
  // detrás — y en la práctica quedaba peor todavía, porque los que orbitan o
  // persiguen se quedan CLAVADOS apuntando a un cadáver.
  //
  // Se recorre hacia atrás y se libera en el sitio: `liberarEn` del pool
  // intercambia el hueco con el último activo, así que ir de atrás hacia delante
  // es lo único que no se salta elementos al reordenar bajo los pies.
  retirarDe(duenyo) {
    if (!duenyo) return;
    const items = this.pool.items;
    for (let k = this.pool.activos - 1; k >= 0; k--) {
      if (items[k].duenyo === duenyo) this.pool.liberarEn(k);
    }
  }

  // Recicla lo que ha salido de cámara. Va aparte de mover() porque necesita la
  // cámara y mover() se llama antes de que la cámara se actualice.
  reciclarFuera(camara) {
    const items = this.pool.items;
    const izq = camara.x - ANCHO_LOGICO / 2 - MARGEN;
    const der = camara.x + ANCHO_LOGICO / 2 + MARGEN;
    const arr = camara.y - ALTO_LOGICO / 2 - MARGEN;
    const aba = camara.y + ALTO_LOGICO / 2 + MARGEN;
    let k = 0;
    while (k < this.pool.activos) {
      const p = items[k];
      if (p.x < izq || p.x > der || p.y < arr || p.y > aba) this.pool.liberarEn(k);
      else k++;
    }
  }

  // Trazo orientado según la velocidad, con un núcleo claro encima y un
  // resplandor suave en la punta. El modo 'lighter' suma luz en vez de
  // taparla, que es lo que hace que los impactos se vean calientes cuando se
  // amontonan.
  //
  // EL RESPLANDOR VA A ALFA BAJO A PROPÓSITO (0.22). Este es un juego de
  // "muchas balas en pantalla a la vez" —a nivel alto, un arma puede tener
  // varios proyectiles vivos y varias armas disparan juntas— así que un halo
  // intenso por proyectil se acumularía hasta lavar la lectura del combate.
  // Con 'lighter' ya activo, los que SÍ se solapan se ven más calientes solos
  // por la suma, sin tener que subir el alfa base de cada uno. El radio del
  // halo se acota (máximo 16) para que un arma con hitbox grande no deje una
  // mancha desproporcionada.
  // CADA ARMA CON SU SILUETA.
  //
  // Los 52 del catálogo se dibujaban igual: una raya de color con estela. Con
  // eso, el pilum, la bala de un fusil, una granada y un rayo eran el mismo
  // trazo en cuatro colores, y la personalidad de un arma se quedaba entera en
  // el número de daño.
  //
  // Cuatro formas y el trazo de siempre de repliegue. No son cincuenta y dos
  // dibujos: son cuatro maneras de moverse por el aire, que es lo que de verdad
  // distingue a un proyectil de otro. El color sigue separando dentro de cada
  // familia, como hasta ahora.
  //
  // Todo va en `lighter` —sumando luz— porque son destellos, no objetos: es lo
  // que hace que se lean sobre la piedra oscura y sobre la horda por igual.
  dibujar(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) { this.dibujados = 0; return; }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let k = 0; k < n; k++) {
      const p = items[k];
      const x = p.xPrev + (p.x - p.xPrev) * alpha;
      const y = p.yPrev + (p.y - p.yPrev) * alpha;

      const v = hipot(p.vx, p.vy);
      if (v < 0.001) continue;
      const ux = p.vx / v, uy = p.vy / v;
      const l = p.largo;

      // CON DIBUJO PROPIO: el sprite orientado al vuelo, y nada más. Ni halo ni
      // trazo — el dibujo ya trae su propio cuerpo y su estela.
      if (p.hoja) {
        const img = Recursos.imagen(p.hoja);
        const meta = Recursos.meta(p.hoja);
        if (img && meta) {
          const aw = meta.w / ESCALA_ARTE * p.escala;
          const ah = meta.h / ESCALA_ARTE * p.escala;
          // De qué trozo de la hoja se recorta. Con hojas de un dibujo —que son
          // casi todas— esto es 0 y sale el de siempre.
          const nf = meta.frames || 1;
          // QUÉ FOTOGRAMA TOCA. Con `animFps` el dibujo tiene ciclo propio —el
          // osito corre— y el fotograma sale del tiempo que lleva volando; sin
          // él manda quien lanzó, que es el caso de siempre.
          //
          // Del tiempo VIVIDO y no de un reloj, por lo mismo que el giro de
          // aquí abajo: dt es fijo, así que la misma semilla anima igual.
          const cual = p.animFps > 0
            ? (((p.vidaMax - p.vida) * p.animFps) | 0) % nf
            : p.fotograma % nf;
          const fx = cual * meta.w;
          ctx.save();
          ctx.globalAlpha = 1;
          // FUERA EL 'lighter' PARA LOS QUE TRAEN DIBUJO.
          //
          // El modo aditivo de arriba es para los proyectiles TRAZADOS: son
          // destellos y sumar luz es lo que los hace legibles sobre la piedra
          // oscura. Con una ilustración es al revés: sumando, los tonos
          // oscuros del dibujo no aportan nada y desaparecen, los claros se
          // queman, y la bala entera se ve translúcida — que es exactamente lo
          // que Sergio vio en la de la pistola. Dibujada en 'source-over' se
          // respeta el alfa que trae el PNG, que además es DURO (silueta
          // recortada al pixel, sin bordes a medias), así que la bala sale
          // maciza y con su contorno.
          //
          // Vale para TODAS las armas que usen un `spriteProyectil`, no solo
          // para la pistola: el criterio es tener dibujo propio, no ser un
          // arma concreta. Hoy son seis las que comparten esta bala.
          ctx.globalCompositeOperation = 'source-over';
          ctx.translate(x, y);

          if (p.sinRotar) {
            // NI ROTA NI SE ANCLA POR LA PUNTA: se planta de pie y solo cambia
            // de lado. Un osito que corre tiene los pies abajo vaya a donde
            // vaya, y orientarlo al rumbo lo dejaría boca abajo cada vez que
            // fuera hacia la izquierda.
            //
            // El dibujo mira a la DERECHA, así que se espeja cuando va hacia la
            // izquierda —al revés que las balas, que se dibujan mirando a la
            // izquierda—. Es cosa del dibujo, no del motor.
            if (p.vx < 0) ctx.scale(-1, 1);
            ctx.drawImage(img, fx, 0, meta.w, meta.h, -aw / 2, -ah / 2, aw, ah);
          } else if (p.giro !== 0) {
            // GIRA SOBRE SÍ MISMO: el shuriken y la botella del molotov. Se
            // dibuja CENTRADO, porque una cosa que voltea no tiene punta que
            // anclar — anclarla por el borde la haría orbitar alrededor del
            // punto de impacto en vez de girar sobre su eje.
            //
            // La fase sale de la vida ya gastada y del sello, no de un reloj:
            // dt es fijo, así que dos partidas con la misma semilla giran igual,
            // y el sello hace que dos proyectiles a la vez no salgan
            // sincronizados. Es el mismo truco que el núcleo de `_bola`.
            ctx.rotate(p.sello * 0.7 + (p.vidaMax - p.vida) * p.giro);
            ctx.drawImage(img, fx, 0, meta.w, meta.h, -aw / 2, -ah / 2, aw, ah);
          } else {
            ctx.rotate(atan2(p.vy, p.vx));
            // ESPEJADO, no girado 180°. El dibujo mira a la izquierda, y aquí
            // hay dos maneras de darle la vuelta que NO son la misma: rotar
            // media vuelta invertiría también el eje vertical —la llama y los
            // brillos saldrían del revés— mientras que espejar solo cambia el
            // sentido de la marcha, que es lo único que hay que corregir.
            ctx.scale(-1, 1);
            // ANCLADO POR LA PUNTA, no por el centro: detrás del proyectil lo
            // que hay es llama, y anclar por el centro dejaría media estela por
            // delante del punto que de verdad colisiona.
            //
            // Con el espejo puesto, lo que se dibuja en x=d aparece en -d: el
            // borde izquierdo del dibujo —que es la punta— acaba en +0,2 de
            // largo por delante, y la llama se extiende 0,8 hacia atrás. La
            // abeja usa el mismo convenio: cabeza a la izquierda del dibujo.
            ctx.drawImage(img, fx, 0, meta.w, meta.h, -aw * 0.2, -ah / 2, aw, ah);
          }
          ctx.restore();
          continue;
        }
      }

      // El halo lo llevan todas: es lo que las hace visibles con la pantalla
      // llena, y su tamaño ya lo separa el radio de cada arma.
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, Math.min(p.radio * 2.2, 16), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (p.forma === 'dardo') this._dardo(ctx, p, x, y, ux, uy, l);
      else if (p.forma === 'bala') this._bala(ctx, p, x, y, ux, uy, l);
      else if (p.forma === 'bola') this._bola(ctx, p, x, y, ux, uy, l);
      else if (p.forma === 'rayo') this._rayo(ctx, p, x, y, ux, uy, l);
      else this._raya(ctx, p, x, y, ux, uy, l);
    }

    ctx.restore();
    this.dibujados = n;
  }

  // DARDO: lo que se lanza con punta —pilum, jabalina, flecha, aguja—. Asta
  // larga y fina, punta ancha y dos aletas atrás. Es la forma que dice "esto
  // viene clavándose" en vez de "esto viene pasando".
  _dardo(ctx, p, x, y, ux, uy, l) {
    const px = -uy, py = ux;                  // perpendicular, para las aletas
    if (p.estela) {
      ctx.strokeStyle = p.estela;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - ux * l * 2.6, y - uy * l * 2.6);
      ctx.lineTo(x - ux * l, y - uy * l);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x + ux * l * 0.5, y + uy * l * 0.5);
    // Aletas.
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x - ux * l * 1.35 + px * l * 0.28, y - uy * l * 1.35 + py * l * 0.28);
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x - ux * l * 1.35 - px * l * 0.28, y - uy * l * 1.35 - py * l * 0.28);
    ctx.stroke();
    // Punta: un triángulo lleno, que es lo que se ve a esta escala.
    ctx.beginPath();
    ctx.moveTo(x + ux * l * 0.75, y + uy * l * 0.75);
    ctx.lineTo(x + px * l * 0.2, y + py * l * 0.2);
    ctx.lineTo(x - px * l * 0.2, y - py * l * 0.2);
    ctx.closePath();
    ctx.fillStyle = p.color;
    ctx.fill();
  }

  // BALA: corta, compacta y con la estela larga. Lo que cuenta de un disparo de
  // fuego no es el proyectil —que apenas se ve— sino el rastro.
  _bala(ctx, p, x, y, ux, uy, l) {
    ctx.strokeStyle = p.estela || p.color;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - ux * l * 3.2, y - uy * l * 3.2);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.4, p.radio * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  // BOLA: lo que va a estallar. Redonda, con núcleo claro y un giro lento que
  // se nota — una granada rueda por el aire, no vuela derecha.
  _bola(ctx, p, x, y, ux, uy, l) {
    const r = Math.max(2.2, p.radio * 0.9);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // El núcleo gira alrededor del centro con el sello del proyectil como fase:
    // así dos granadas a la vez no giran sincronizadas.
    const a = p.sello * 0.7 + p.vida * 9;
    ctx.fillStyle = '#fff4d2';
    ctx.beginPath();
    ctx.arc(x + cos(a) * r * 0.32, y + sen(a) * r * 0.32, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    if (p.estela) {
      ctx.strokeStyle = p.estela;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = r * 0.9;
      ctx.beginPath();
      ctx.moveTo(x - ux * l * 1.6, y - uy * l * 1.6);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // RAYO: quebrado. Tres tramos con el codo desplazado a un lado y a otro, y el
  // desplazamiento sale del sello y de la vida, así que tiembla mientras avanza
  // sin necesitar azar ni memoria por proyectil.
  _rayo(ctx, p, x, y, ux, uy, l) {
    const px = -uy, py = ux;
    const f = p.sello * 1.7 + p.vida * 40;
    const a1 = sen(f) * l * 0.45;
    const a2 = sen(f * 1.7 + 2) * l * 0.45;
    const x0 = x - ux * l * 2, y0 = y - uy * l * 2;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + ux * l * 0.7 + px * a1, y0 + uy * l * 0.7 + py * a1);
    ctx.lineTo(x0 + ux * l * 1.4 + px * a2, y0 + uy * l * 1.4 + py * a2);
    ctx.lineTo(x + ux * l * 0.4, y + uy * l * 0.4);
    ctx.stroke();
    // Segundo trazo más fino y claro por encima: es lo que le da el brillo de
    // descarga en vez de parecer una cuerda doblada.
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // RAYA: el trazo de siempre. Es el repliegue de los comportamientos que no
  // declaran forma, y lo que usan los que no son proyectiles al uso.
  _raya(ctx, p, x, y, ux, uy, l) {
    if (p.estela) {
      ctx.strokeStyle = p.estela;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - ux * l * 2.2, y - uy * l * 2.2);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - ux * l, y - uy * l);
    ctx.lineTo(x + ux * l * 0.35, y + uy * l * 0.35);
    ctx.stroke();
  }
}
