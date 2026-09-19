import { ANCHO_LOGICO, ALTO_LOGICO, ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { ARMAS } from '../datos/armas.js';
import { MAX_NIVEL } from './progresion.js';
import { enemigoMasCercano, enemigosEnRadio } from './colisiones.js';
import { Particulas, COLOR_CHISPA, COLOR_POLVO } from './particulas.js';
// La Campana del Silencio dibuja su onda con los arcos de VFX. Es el único
// comportamiento que pinta algo por su cuenta: los demás dejan el dibujo a lo
// que lanzan —un proyectil, una zona, un tajo— y esta no lanza nada.
import { VFX } from './vfx.js';
import { sen, cos, atan2, hipot } from '../core/mate.js';
import { RejillaMapa } from './rejillaMapa.js';

// Motor genérico de armas.
//
// Un arma equipada es {def, nivel, stats, temporizador}. Cada paso baja el
// temporizador y, al llegar a cero, ejecuta la función que nombra
// `def.comportamiento`. Los datos de datos/armas.js solo parametrizan: añadir un
// arma que reutilice un comportamiento existente no toca este archivo.
//
// Los comportamientos viven en un objeto plano indexado por nombre, no en un
// switch. Así el motor no conoce ninguna arma concreta y basta con añadir una
// función para inventar una familia nueva.

const GRADOS = Math.PI / 180;

// --- Estadísticas efectivas --------------------------------------------------
// Los pasivos del jugador se aplican AQUÍ, al usar el arma, no al calcular sus
// stats. El motivo es que las stats del arma se recalculan solo al subir de
// nivel, mientras que los pasivos cambian por su cuenta: si se hornearan juntos
// habría que recorrer todas las armas de todos los jugadores cada vez que
// alguien coge un anillo.
// LA LÁGRIMA DE LA MORA: cuanto menos vida te queda, más pegas. El máximo se
// alcanza al 10% de vida y de ahí para abajo no sube más — el tramo entre el
// 10% y la muerte es donde se está jugando la partida y no hace falta premiarlo
// dos veces.
//
// Va DENTRO de `danyoDe` y no como un `bonusDanyo` más porque cambia cada
// fotograma: `bonusDanyo` se calcula al recalcular las estadísticas —en cada
// subida de nivel— y esto tiene que mirar la vida AHORA. Un objeto que solo se
// actualizara al subir de nivel diría que pegas mucho porque estabas a punto de
// morir hace tres minutos.
function furiaDe(j) {
  if (j.furiaMoribundo <= 0 || j.vidaMaxima <= 0) return 1;
  const frac = j.vida / j.vidaMaxima;
  if (frac >= 1) return 1;
  // 0 con la vida llena, 1 al 10% o menos.
  const falta = Math.min(1, (1 - frac) / 0.9);
  return 1 + j.furiaMoribundo * falta;
}

// `auraEquipo` es lo que aportan LOS DEMAS con el Sello Templario (ver
// entidades/jugador.js): se suma al bonus propio porque para el
// arma es lo mismo, más daño es más daño. Lo calcula el jugador una vez por
// paso; aquí solo se lee.
function danyoDe(s, j) {
  return Math.round(s.danyo * (1 + j.bonusDanyo + j.auraEquipo) * furiaDe(j));
}
function areaDe(v, j)  { return v * (1 + j.bonusArea); }
// LO LEJOS QUE LLEGA UN ARMA, con la Campana Milagrosa aplicada. Aparte de
// `areaDe` a propósito: el área es lo ANCHO que pega una cosa y el alcance lo
// LEJOS que va, y hay armas —una onda circular— donde subir lo uno sin lo otro
// es justo lo que se quiere.
function alcanceDe(s, j) { return s.alcance * (1 + j.bonusAlcance); }
// Y lo deprisa que sale lo que se lanza (Ala de Mercurio). Solo afecta al
// vuelo: la vida del proyectil se calcula con el alcance dividido por ESTA
// velocidad, así que una bala más rápida llega igual de lejos, solo que antes.
function velocidadDe(s, j) { return s.velocidad * (1 + j.bonusVelProyectil); }
// CUÁNTOS SALEN, con la Bellota de oro sumada.
//
// El arma puede decir que no (`sinBellota`), y hay dos que lo dicen: la Petanca
// —donde lo que hace el arma es el abanico, y una bola más lo desdibuja— y
// cualquiera cuyo número de proyectiles SEA la mecánica. Lo pidió Sergio así:
// «solo armas de proyectiles, quedan fuera petanca o rayo láser».
//
// El láser ni siquiera hace falta excluirlo: los rayos no leen `proyectiles`,
// así que la Bellota no los toca sin que nadie tenga que acordarse.
function proyectilesDe(arma, s, j) {
  if (arma.def.sinBellota) return s.proyectiles;
  return s.proyectiles + (j.bonusProyectiles | 0);
}
// Y lo que TARDA EN APAGARSE lo que se queda en el suelo: el charco de
// alquitrán, el fuego griego, las minas (Amuleto de azogue). Es la tercera
// manera de hacer más fuerte a un arma de zona sin tocar su daño ni su radio —
// la misma zona, más rato— y por eso va aparte de las otras dos.
function duracionDe(v, j) { return v * (1 + j.bonusDuracionZona); }
function recargaDe(s, j) {
  const r = s.recarga * (1 - j.reduccionRecarga);
  return r < 0.08 ? 0.08 : r;
}

// ¿Existe ese comportamiento? Lo consulta la generación de ofertas para no
// ofrecer un arma que todavía no hace nada.
export function comportamientoImplementado(nombre) {
  return typeof COMPORTAMIENTOS[nombre] === 'function';
}

// Tope de enemigos que un solo golpe en área puede tocar. Preasignado: sin él
// haría falta un array nuevo por tajo.
const MAX_ALCANZADOS = 256;

// Tajos visibles a la vez. Es efecto, no lógica: si se pierde uno con la
// pantalla ardiendo, no lo nota nadie.
const MAX_TAJOS = 12;

// TAJOS DIBUJADOS. Un arma cuerpo a cuerpo puede traer una animación de barrido
// en vez del arco trazado: lo declara en `spriteTajo` (datos/armas.js), y el
// valor es directamente el ID DEL ATLAS de su hoja.
//
// Una hoja por arma, y no una tira compartida como las zonas. Cada animación
// trae su propia rejilla, su pivote y su número de fases, así que compartir
// tira obligaría a llevar la cuenta de dónde empieza cada arma; nombrando la
// entrada del atlas no hay contabilidad ninguna y añadir un arma no renumera
// nada de lo que ya está.
//
// Si la hoja no está cargada, el tajo cae al arco trazado de siempre sin
// avisar: misma red que los placeholders del atlas.

// Media altura del sprite de un jugador, en unidades lógicas. La usa `bocaDe`,
// que está declarada más abajo: da igual el orden porque es una declaración de
// función y sube al principio del módulo.
//
// La `y` de un jugador es su LÍNEA DE PIES: el sprite se dibuja con el borde
// inferior ahí, así que el cuerpo ocupa de `y - alto` a `y` y su centro visual
// está media altura más arriba. Un aura centrada en los pies deja al personaje
// asomando por la mitad de arriba; centrada aquí, la figura entera queda dentro
// del área del arma.
//
// Sale del atlas y no de una constante, para que siga valiendo si el arte
// cambia de tamaño. El 13 de repliegue es media altura de los cuatro sprites de
// hoy (104 px físicos = 26 unidades), por si el atlas no ha cargado.
function medioAlto(j) {
  const meta = Recursos.meta(j.personaje);
  return meta ? meta.h / ESCALA_ARTE / 2 : 13;
}

// DE DÓNDE SALE UN DISPARO.
//
// Antes nacían todos en (x, y-8), o sea dentro del pecho del personaje: el
// proyectil aparecía encima de él y lo primero que hacía era atravesarlo, lo
// que se ve como si le brotara del cuerpo. Se movieron al borde del CÍRCULO de
// colisión, y con eso quedó bien a los lados y mal por arriba: el círculo tiene
// radio 8 y el personaje mide 26 unidades de alto, así que un disparo hacia
// arriba seguía naciendo a la altura del pecho — dentro del dibujo.
//
// AHORA LA BOCA ES UNA ELIPSE, no un círculo, y con las medidas del sprite: el
// semieje horizontal sale del radio de colisión y el vertical de la media
// altura del personaje. Una figura de pie es más alta que ancha y su contorno
// también, así que el punto de salida tiene que serlo.
//
// Y se calcula el CORTE DE LA ELIPSE CON EL RAYO del disparo, no el punto
// paramétrico del mismo ángulo: en una elipse esos dos puntos no coinciden, y
// usar el fácil dejaría el disparo desviado del rumbo en las diagonales.
//
// El margen importa: pegado exacto al borde, el proyectil nace rozando la
// silueta y a media velocidad todavía se solapa un frame.
const MARGEN_BOCA = 3;

// Rellena `origenDisparo` con el punto de salida para un ángulo dado. Objeto de
// módulo reutilizado: esto se llama varias veces por disparo —un abanico de
// escopeta son trece— y devolver un objeto nuevo sería asignar en caliente.
const origenDisparo = { x: 0, y: 0 };
function bocaDe(j, ang) {
  const medio = medioAlto(j);
  const a = j.radioCuerpo + MARGEN_BOCA;     // semieje horizontal
  const b = medio + MARGEN_BOCA;             // semieje vertical
  const cx = cos(ang), sy = sen(ang);
  // Distancia del centro al borde de la elipse EN ESTA DIRECCIÓN.
  const d = 1 / Math.sqrt((cx * cx) / (a * a) + (sy * sy) / (b * b));
  origenDisparo.x = j.x + cx * d;
  // El centro de la elipse es el centro VISUAL del personaje, no sus pies: la
  // `y` de un jugador es su línea de pies y el cuerpo sube de ahí hacia arriba.
  origenDisparo.y = j.y - medio + sy * d;
  return origenDisparo;
}

// FOGONAZO: un puñado de chispas en cono, en la boca del cañón, una vez por
// disparo -no una por proyectil, que con la Recortada serían nueve fogonazos
// pisándose en el mismo punto y el mismo fotograma. Solo lo llaman los
// comportamientos de arma de fuego, y solo si `arma.def.fogonazo` lo pide (ver
// datos/armas.js): el Pilum y la Honda comparten `proyectilDirigido` y no
// queman pólvora.
function emitirFogonazo(arma, ctx, x, y, ang) {
  if (!arma.def.fogonazo || Particulas.saturado()) return;
  Particulas.chorro(x, y, cos(ang), sen(ang), 4, 130, 0.35, 0.09, 1.3,
                     COLOR_CHISPA, 0.2, ctx.rng);
}

// LANZAMIENTO: un golpe de polvo hacia ATRÁS -en la dirección CONTRARIA al
// tiro, no en la del vuelo- en el instante de soltar el arma. Es lo que deja
// en el suelo el taconazo de quien arma el brazo para tirar, y es justo lo
// que le faltaba al Pilum: se veía la jabalina volando y nada en el momento
// de soltarla. No es un fogonazo -no hay pólvora- así que color y apertura
// son otros: más ancho, más terroso, y la mitad de partículas porque el
// Pilum dispara mucho más despacio que cualquier arma de fuego.
function emitirLanzamiento(arma, ctx, x, y, ang) {
  if (!arma.def.lanzamiento || Particulas.saturado()) return;
  Particulas.chorro(x, y, -cos(ang), -sen(ang), 4, 55, 0.6, 0.16, 1.1,
                     COLOR_POLVO, 0.5, ctx.rng);
}

// Cada cuánto puede un mismo escudo orbital volver a golpear al mismo enemigo.
const ORBITAL_CADENCIA = 0.35;
let contadorSelloOrbital = 0;

// A CERO AL EMPEZAR PARTIDA, igual que los sellos de proyectil.js y de
// zonaDanyo.js. Es un contador de módulo: nace con la pestaña, no con la
// partida, así que sin esto la segunda partida reparte sellos donde la primera
// los dejó. Jugando no se nota —el sello solo sirve para que un escudo orbital
// no golpee dos veces al mismo bicho, y para eso vale cualquier número que no
// se repita—, pero en el cooperativo por lockstep sí importa: dos máquinas que
// llevan distinto número de partidas jugadas tendrían el contador en sitios
// distintos y sus mundos dejarían de ser el mismo.
export function reiniciarSellosOrbitales() { contadorSelloOrbital = 0; }

// --- Comportamientos ---------------------------------------------------------
// Firma común: (arma, sis, ctx). `sis` es el sistema (para sus buffers), `ctx`
// trae jugador, enemigos, proyectiles y rng.

const COMPORTAMIENTOS = {

  // Proyectil al enemigo más cercano. Con varios proyectiles se abren en
  // abanico alrededor de la misma dirección.
  proyectilDirigido(arma, sis, ctx) {
    const s = arma.stats;
    const objetivo = enemigoMasCercano(ctx.enemigos, ctx.jugador.x, ctx.jugador.y, s.alcance);
    if (!objetivo) return false;          // sin blanco no se gasta la recarga

    let dx = objetivo.x - ctx.jugador.x;
    let dy = objetivo.y - ctx.jugador.y;
    const d = hipot(dx, dy) || 1;
    dx /= d; dy /= d;

    const base = atan2(dy, dx);
    const n = proyectilesDe(arma, s, ctx.jugador);
    // ABANICO O CARRIL, igual que en `direccionFija`: con `separacion` los
    // proyectiles de más salen con el MISMO rumbo, corridos de lado. Lo pide el
    // Arco — nueve flechas abiertas en abanico son nueve flechas
    // torcidas; en paralelo son una andanada.
    const separa = s.separacion || 0;

    for (let i = 0; i < n; i++) {
      // Abanico centrado: con 1 sale recto, con 3 uno recto y dos abiertos.
      const centrado = i - (n - 1) / 2;
      const a = separa > 0 ? base : base + centrado * s.dispersion * GRADOS;

      // POR `_rellenarProyectil` Y NO A MANO, y esto era un fallo de verdad.
      //
      // Aquí se escribían nueve campos de `defProyectil` uno a uno, y ese objeto
      // es COMPARTIDO por todas las armas: lo que este comportamiento no
      // escriba se queda con lo que dejó el disparo anterior, de otra arma. El
      // propio comentario que había aquí avisaba de ello... y aun así faltaban
      // `rebotesPared` y `rebotesEnemigo`.
      //
      // O sea que los rebotes del Fusil y los saltos de la Honda —las dos son
      // `proyectilDirigido`— NUNCA se pasaban al proyectil: con esas armas
      // solas en el arsenal salían siempre a cero, y acompañadas heredaban el
      // valor de la última arma que sí rellenó el descriptor. La función que
      // los reparte estaba bien; el dato no llegaba.
      //
      // El repartidor común escribe TODOS los campos, que es justo para lo que
      // se hizo. Y de paso el `largo` deja de estar clavado a 9 y sale de
      // `largoTrazo`, que las siete armas de esta familia ya declaraban y que
      // esta rama se estaba comiendo.
      sis._rellenarProyectil(arma, s, danyoDe(s, ctx.jugador), ctx.jugador);
      sis.defProyectil.vida = alcanceDe(s, ctx.jugador) / velocidadDe(s, ctx.jugador);

      const b = bocaDe(ctx.jugador, a);
      let ox = b.x, oy = b.y;
      if (separa > 0) {
        ox += sen(a) * centrado * separa;
        oy -= cos(a) * centrado * separa;
      }
      ctx.proyectiles.lanzar(
        ox, oy,
        cos(a) * velocidadDe(s, ctx.jugador), sen(a) * velocidadDe(s, ctx.jugador),
        sis.defProyectil);
    }
    // Uno solo por disparo, en la boca central, no uno por proyectil: con
    // varias balas a la vez (Subfusil, Fusil con rebote) se pisarían.
    const bf = bocaDe(ctx.jugador, base);
    emitirFogonazo(arma, ctx, bf.x, bf.y, base);
    emitirLanzamiento(arma, ctx, bf.x, bf.y, base);
    return true;
  },

  // Arco de corte en la dirección de avance. No hay proyectil: se resuelve el
  // cono al instante y se deja un tajo dibujado.
  //
  // Con más de un golpe por activación, los siguientes quedan encolados con su
  // demora: encadenar dos tajos seguidos se siente como una combinación, y
  // soltarlos en el mismo frame no se vería.
  arcoMelee(arma, sis, ctx) {
    sis.golpear(arma, ctx);
    arma.golpesPendientes = arma.stats.golpes - 1;
    arma.demoraGolpe = arma.def.demoraGolpe;
    return true;
  },

  // Escopeta: muchos proyectiles, muy abiertos, de alcance corto.
  //
  // No es el proyectil dirigido con más dispersión. La diferencia está en que
  // aquí el abanico se reparte al AZAR dentro del cono en vez de en posiciones
  // fijas, y los perdigones llevan vida distinta entre sí: eso es lo que hace
  // que el disparo se sienta sucio y no como una formación de tres jabalinas.
  // LA CAMPANA DEL SILENCIO: un cono que no hace daño, PARALIZA.
  //
  // Pedida por Sergio, y es la primera arma del juego sin daño ninguno. Lo que
  // reparte es tiempo: los que pilla se quedan clavados, mudos y —esto es lo
  // importante— ATRAVESABLES, porque el motor ya trata a un enemigo paralizado
  // como si no fuera un cuerpo (ver `paralizado` en sistemas/colisiones.js: ni
  // empuja ni se le empuja, se le cruza por encima, y el daño de contacto se
  // apaga). O sea que la Campana no es un arma de matar, es la que te saca de
  // un cerco: tocas, y la pared de carne por la que ibas a morir se vuelve
  // niebla durante medio segundo.
  //
  // Ya existía ese estado —lo usa el Reloj de Emerita, el consumible que para
  // la pantalla entera— y esto es lo mismo repartido con puntería: un cono, en
  // la dirección en la que miras, que se abre y se alarga con el nivel.
  //
  // NO SE ACUMULA CONSIGO MISMA: se queda con la parálisis más larga de las dos
  // (`Math.max`) en vez de sumarlas. Sumando, dos campanas seguidas dejarían la
  // pantalla congelada un segundo entero y el arma pasaría de sacarte de un
  // apuro a ganar la partida sola.
  conoSilencio(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    // Hacia donde miras, con el rumbo completo y no solo la horizontal: mirando
    // hacia arriba y parado, la campana sonaría de lado. Mismo criterio que la
    // Recortada sin blanco a la vista (ver `conoCorto`, aquí abajo).
    const base = atan2(j.rumboY, j.rumboX);
    const semi = s.angulo * 0.5 * GRADOS;
    const alcance = areaDe(s.alcance, j);

    const items = ctx.enemigos.pool.items;
    const n = enemigosEnRadio(ctx.enemigos, j.x, j.y, alcance, sis._alcanzados);
    for (let q = 0; q < n; q++) {
      const e = items[sis._alcanzados[q]];
      // El radio ya lo ha filtrado `enemigosEnRadio`; aquí solo queda el
      // ángulo. La diferencia se normaliza a -pi..pi para que el cono funcione
      // igual apuntando a la derecha (donde el ángulo salta de pi a -pi) que en
      // cualquier otra dirección.
      let d = atan2(e.y - j.y, e.x - j.x) - base;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (d > semi || d < -semi) continue;
      if (s.paralisis > e.paralizado) e.paralizado = s.paralisis;
    }

    // LA ONDA, EN TRES ARCOS ESCALONADOS. Una campana no suena en una línea:
    // suena en frentes que salen uno detrás de otro, y tres bastan para que se
    // lea como sonido y no como un tajo. Cada uno sale un poco después y llega
    // un poco menos lejos que el anterior, que es lo que da la sensación de que
    // el primero va por delante.
    for (let k = 0; k < 3; k++) {
      VFX.anillo(j.x, j.y - medioAlto(j), alcance * (1 - k * 0.16),
                 arma.def.color, 2.4 - k * 0.5, 0.34 + k * 0.06,
                 base - semi, base + semi);
    }
    return true;
  },

  conoCorto(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const objetivo = enemigoMasCercano(ctx.enemigos, j.x, j.y, s.alcance);

    let base;
    if (objetivo) {
      base = atan2(objetivo.y - j.y, objetivo.x - j.x);
    } else {
      // Sin blanco dispara igual, hacia donde ENCARA: una escopeta a bocajarro
      // no espera a tener puntería. Y encara con el rumbo completo, no con la
      // horizontal: apuntando hacia arriba y parado, disparaba a un lado.
      base = atan2(j.rumboY, j.rumboX);
    }

    const semi = s.angulo * 0.5 * GRADOS;
    const danyo = danyoDe(s, j);
    for (let i = 0; i < proyectilesDe(arma, s, j); i++) {
      const a = base + (ctx.rng() * 2 - 1) * semi;
      const v = velocidadDe(s, j) * (0.82 + ctx.rng() * 0.36);
      // POR EL REPARTIDOR COMÚN, y este era el ÚLTIMO sitio que no pasaba por
      // él. Aquí se escribían nueve campos a mano sobre `defProyectil`, que es
      // UN objeto compartido por todas las armas: lo que este comportamiento no
      // escriba se queda con lo que dejó el disparo anterior, de otra arma.
      //
      // Lo que se colaba, medido sobre lo que faltaba: `escala` y `giro` —los
      // perdigones de la Recortada crecían y volteaban si llevabas también la
      // Rosa de los vientos o el Aspa—, los rebotes de pared y de enemigo, y lo
      // peor de todo, `radioExplosion` con `estallaAlExpirar`: con un
      // lanzagranadas en el arsenal, los perdigones de una escopeta reventaban
      // en área al agotarse.
      //
      // Es el mismo fallo que tenía `proyectilDirigido` y se arregla igual. Las
      // tres armas de cono —Escopeta, Recortada y Lanzallamas— lo sufrían.
      sis._rellenarProyectil(arma, s, danyo, ctx.jugador);
      // Y estos dos SÍ son de aquí, así que van después: el vuelo de cada
      // perdigón se sortea uno a uno (`v` ya trae su propio azar), y el trazo es
      // corto a propósito porque un cono es muchos destellos pequeños, no una
      // andanada de rayas largas.
      sis.defProyectil.vida = (s.alcance / v) * (0.8 + ctx.rng() * 0.4);
      sis.defProyectil.largo = 5;
      const b = bocaDe(j, a);
      ctx.proyectiles.lanzar(b.x, b.y, cos(a) * v, sen(a) * v,
                             sis.defProyectil);
    }
    // Uno solo por disparo, no uno por perdigón: la Recortada dispara nueve.
    const bf = bocaDe(j, base);
    emitirFogonazo(arma, ctx, bf.x, bf.y, base);
    return true;
  },

  // --- Patrones que NO apuntan -------------------------------------------
  //
  // Todo lo de aquí abajo dispara sin buscar blanco, y esa es la gracia: el
  // jugador no apunta, se COLOCA. Un arma que barre en horizontal te pide
  // alinearte con la horda; una que suelta bombas al azar te pide quedarte en
  // el centro del enjambre. Con seis armas a la vez, la posición correcta es la
  // que satisface a la mayoría, y ahí está la decisión.
  //
  // `patron` decide las direcciones. Se recorren TODAS en cada disparo: un arma
  // de cruz dispara cuatro, no una al azar entre cuatro.
  direccionFija(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const dirs = direccionesDe(arma, s, j);
    const danyo = danyoDe(s, j);

    // ABANICO O CARRIL, y la diferencia importa para lo que se dibuja.
    //
    // Por defecto los proyectiles de más se abren en ÁNGULO desde el mismo
    // punto: es lo que quiere una lluvia de agujas, que cubre un cono.
    //
    // `separacion` cambia el reparto a lateral: todos salen con el MISMO rumbo,
    // corridos a un lado y a otro del eje. Es lo que pide la Columna doble —dos
    // columnas de mármol abiertas nueve grados no son dos columnas, son dos
    // columnas torcidas; en paralelo son una columnata.
    const separa = s.separacion || 0;

    for (let d = 0; d < nDirs; d++) {
      const base = dirs[d];
      for (let i = 0; i < proyectilesDe(arma, s, j); i++) {
        const centrado = i - (proyectilesDe(arma, s, j) - 1) / 2;
        const a = separa > 0 ? base : base + centrado * s.dispersion * GRADOS;
        sis._rellenarProyectil(arma, s, danyo, ctx.jugador);
        sis.defProyectil.vida = alcanceDe(s, j) / velocidadDe(s, j);
        const b = bocaDe(j, a);
        let ox = b.x, oy = b.y;
        if (separa > 0) {
          // Perpendicular al rumbo: (-sin, cos) girado 90°, o sea (sin, -cos).
          ox += sen(a) * centrado * separa;
          oy -= cos(a) * centrado * separa;
        }
        ctx.proyectiles.lanzar(ox, oy,
          cos(a) * velocidadDe(s, j), sen(a) * velocidadDe(s, j), sis.defProyectil);
      }
    }
    return true;
  },

  // Dirección al azar en cada disparo. Cubre el mapa a la larga y no pide nada
  // al jugador salvo estar rodeado, que es donde quiere estar de todas formas.
  direccionAleatoria(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const danyo = danyoDe(s, j);
    for (let i = 0; i < proyectilesDe(arma, s, j); i++) {
      const a = ctx.rng() * Math.PI * 2;
      sis._rellenarProyectil(arma, s, danyo, ctx.jugador);
      sis.defProyectil.vida = alcanceDe(s, j) / velocidadDe(s, j);
      // UN DIBUJO CADA N PROYECTILES. La hoja del RainbowMazas trae diez mazas
      // y el arma las suelta DE DOS EN DOS: las dos primeras son la maza 1, las
      // dos siguientes la 2, y así hasta las veinte del nivel 10, que son las
      // diez de la hoja por parejas.
      //
      // Se reparte por el ÍNDICE y no al azar: al azar saldrían repetidas —diez
      // tiradas de diez no dan diez colores distintos— y el arma es justo eso.
      // Y por parejas y no de una en una porque subir de nivel tiene que
      // AÑADIR UN COLOR, no solo una maza más del montón.
      const porDibujo = arma.def.proyectilesPorFotograma;
      if (porDibujo) sis.defProyectil.fotograma = (i / porDibujo) | 0;
      const b = bocaDe(j, a);
      ctx.proyectiles.lanzar(b.x, b.y,
        cos(a) * velocidadDe(s, j), sen(a) * velocidadDe(s, j), sis.defProyectil);
    }
    return true;
  },

  // Lanzagranadas: sale en una dirección y REVIENTA al tocar a alguien, o al
  // agotar su vuelo. El daño de impacto es pequeño; el gordo va en la onda.
  proyectilExplosivo(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const danyo = danyoDe(s, j);

    let base;
    if (arma.def.patron) {
      const dirs = PATRONES[arma.def.patron];
      base = dirs[(ctx.rng() * dirs.length) | 0];
    } else {
      const obj = enemigoMasCercano(ctx.enemigos, j.x, j.y, s.alcance);
      base = obj ? atan2(obj.y - j.y, obj.x - j.x) : ctx.rng() * Math.PI * 2;
    }

    for (let i = 0; i < proyectilesDe(arma, s, j); i++) {
      const a = base + (i - (proyectilesDe(arma, s, j) - 1) / 2) * s.dispersion * GRADOS;
      sis._rellenarProyectil(arma, s, danyo, ctx.jugador);
      sis.defProyectil.vida = alcanceDe(s, j) / velocidadDe(s, j);
      sis.defProyectil.radioExplosion = areaDe(s.radioExplosion, j);
      sis.defProyectil.danyoExplosion = Math.round(s.danyoExplosion * (1 + j.bonusDanyo));
      sis.defProyectil.estallaAlExpirar = true;
      const b = bocaDe(j, a);
      ctx.proyectiles.lanzar(b.x, b.y,
        cos(a) * velocidadDe(s, j), sen(a) * velocidadDe(s, j), sis.defProyectil);
    }
    return true;
  },

  // EL OSITO DINAMITO: sale corriendo, culebrea, busca al más cercano y
  // revienta encima.
  //
  // Es un `proyectilExplosivo` con dos añadidos —persecución y culebreo— y no
  // un comportamiento aparte de verdad: lo que cambia está entero en el
  // proyectil (ver `persigue` y `zigzag` en entidades/proyectil.js), no en cómo
  // se lanza. Se separa igualmente porque la SALIDA sí es suya: los ositos no
  // salen en abanico como una andanada de granadas, sino cada uno hacia un lado
  // distinto, que es lo que hace que se lean como bichos sueltos y no como una
  // ráfaga.
  //
  // Al impactar estalla solo: en cuanto un proyectil lleva `radioExplosion`, el
  // sistema de colisiones lo revienta contra el primero que toque. Y también al
  // agotarse (`estallaAlExpirar`), porque un osito con la mecha encendida que
  // se apaga sin más sería lo contrario de lo que promete.
  proyectilPerseguidor(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const danyo = danyoDe(s, j);
    const n = proyectilesDe(arma, s, j);

    // HACIA DÓNDE SALE CADA UNO, y aquí el azar está muy medido.
    //
    // Se reparten el círculo entero en partes iguales y cada uno sale por el
    // centro de la suya, con un desvío de como mucho un cuarto de sector. Antes
    // el desvío era de un sector completo y dos ositos podían salir pegados o
    // pisándose; con esto la camada se abre siempre en abanico regular y lo
    // único que el azar decide de verdad es hacia dónde apunta el conjunto.
    //
    // Salen SIEMPRE alejándose: la dirección es radial desde el jugador y nacen
    // ya fuera de su silueta, así que el primer paso los aleja pase lo que pase.
    // Que sigan alejándose los primeros metros es cosa de la carrerilla (ver
    // `recto` en entidades/proyectil.js).
    const giro = ctx.rng() * Math.PI * 2;
    const sector = Math.PI * 2 / n;
    for (let i = 0; i < n; i++) {
      const a = giro + i * sector + (ctx.rng() - 0.5) * sector * 0.5;
      const v = velocidadDe(s, j);
      sis._rellenarProyectil(arma, s, danyo, ctx.jugador);
      sis.defProyectil.vida = alcanceDe(s, j) / v;
      sis.defProyectil.radioExplosion = areaDe(s.radioExplosion, j);
      sis.defProyectil.danyoExplosion = Math.round(s.danyoExplosion * (1 + j.bonusDanyo));
      sis.defProyectil.estallaAlExpirar = true;
      // Los tres que lo hacen ser él. `persigue` y el culebreo salen de la
      // DEFINICIÓN y no de las stats: son su forma de correr, y no cambia
      // porque suba de nivel — lo que sube con el nivel es cuántos, cuánto
      // pegan, cuánta área y cuánto corren.
      sis.defProyectil.persigue = arma.def.persigue || 0;
      sis.defProyectil.zigzag = arma.def.zigzag || 0;
      sis.defProyectil.zigFrec = arma.def.zigFrec || 0;
      // Cada uno con su fase, o los cuatro culebrearían a la vez como un solo
      // cuerpo. Del rng de la partida, que es lo que mantiene el determinismo.
      sis.defProyectil.fase = ctx.rng() * Math.PI * 2;
      sis.defProyectil.animFps = arma.def.animFps || 0;
      sis.defProyectil.sinRotar = !!arma.def.sinRotar;
      sis.defProyectil.recto = arma.def.salidaRecta || 0;
      const b = bocaDe(j, a);
      ctx.proyectiles.lanzar(b.x, b.y, cos(a) * v, sen(a) * v, sis.defProyectil);
    }
    return true;
  },

  // Bombardeo: las bombas caen en puntos AL AZAR de la pantalla visible. No hay
  // nada que apuntar y llega a sitios donde el jugador no está.
  bombardeoAleatorio(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const danyo = Math.round(s.danyoExplosion * (1 + j.bonusDanyo));
    const radio = areaDe(s.radioExplosion, j);

    for (let i = 0; i < proyectilesDe(arma, s, j); i++) {
      // Dentro del viewport, centrado en el jugador: caer fuera de cámara sería
      // regalar daño que nadie ve.
      // DÓNDE CAE. Por defecto, cualquier sitio de la pantalla centrado en el
      // jugador: caer fuera de cámara sería regalar daño que nadie ve.
      //
      // `alcance` lo ENCOGE a un círculo alrededor del jugador, y esa es toda
      // la diferencia entre una lluvia de flechas y el Cayado de San Isidro:
      // la lluvia cubre el campo y el cayado golpea a tus pies. Un arma que
      // reparte por la pantalla entera pega donde tú no estás; una que reparte
      // cerca pega donde está la horda que te rodea, así que se juega dejando
      // que se acerquen en vez de huyendo.
      let x, y;
      if (s.alcance > 0) {
        // Raíz del azar en el radio: sin ella se amontonaría todo en el centro,
        // porque un círculo tiene más área cuanto más lejos del medio.
        const ang = ctx.rng() * Math.PI * 2;
        const rad = Math.sqrt(ctx.rng()) * s.alcance;
        x = j.x + cos(ang) * rad;
        y = j.y + sen(ang) * rad;
      } else {
        x = j.x + (ctx.rng() - 0.5) * ANCHO_LOGICO * 0.9;
        y = j.y + (ctx.rng() - 0.5) * ALTO_LOGICO * 0.9;
      }

      // CON CAÍDA: se ve venir. En vez de aparecer la onda en el suelo, se
      // lanza un proyectil de verdad desde `caida` unidades más arriba, cayendo
      // a plomo, y la onda la deja él al agotarse (`estallaAlExpirar`, ver
      // `estallar` en main.js). Así una lluvia de flechas es una lluvia: se ve
      // caer cada flecha y clavarse.
      //
      // Y el daño va donde el jugador lo ve: no se reparte por el camino —el
      // proyectil no lleva daño de impacto— sino entero en la onda del suelo.
      // Si toca a alguien mientras baja, revienta ahí: le ha caído encima.
      if (arma.def.caida > 0) {
        sis._rellenarProyectil(arma, s, 0, ctx.jugador);
        sis.defProyectil.vida = arma.def.caida / velocidadDe(s, j);
        sis.defProyectil.radioExplosion = radio;
        sis.defProyectil.danyoExplosion = danyo;
        sis.defProyectil.estallaAlExpirar = true;
        ctx.proyectiles.lanzar(x, y - arma.def.caida, 0, velocidadDe(s, j), sis.defProyectil);
        continue;
      }

      ctx.zonas.crear({
        duenyo: ctx.jugador, arma, arma,
        x, y, radio, radioIni: radio * 0.15, duracion: duracionDe(s.duracion, j),
        danyo, empuje: s.empuje, modo: 'onda', color: arma.def.color,
        relleno: 0.3, sprite: arma.def.spriteOnda,
        atraviesaParedes: arma.def.atraviesaParedes
      });
    }
    return true;
  },

  // Onda circular que sale del jugador y se expande. Barre los 360 grados, así
  // que premia estar rodeado en vez de buscar un flanco.
  ondaCircular(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    ctx.zonas.crear({
      duenyo: ctx.jugador, arma,
      x: j.x, y: j.y - 6,
      radio: areaDe(s.radio, j), radioIni: 6,
      duracion: duracionDe(s.duracion, j),
      danyo: danyoDe(s, j), empuje: s.empuje,
      modo: 'onda', color: arma.def.color, relleno: 0.08,
      sprite: arma.def.spriteOnda,
      // Por el suelo o por el aire. El Sismo abre la tierra y va por debajo de
      // todo; una onda de choque o un grito pasan por encima.
      enSuelo: arma.def.ondaEnSuelo,
      atraviesaParedes: arma.def.atraviesaParedes
    });
    return true;
  },

  // Charco o red que se queda en el suelo dañando por tics. `ralentiza` la
  // convierte en arma de control en vez de de daño.
  zonaPersistente(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    for (let i = 0; i < s.charcos; i++) {
      const a = ctx.rng() * Math.PI * 2;
      const d = i === 0 ? 0 : 20 + ctx.rng() * 45;
      let x = j.x + cos(a) * d, y = j.y + sen(a) * d;
      // Un charco no se vierte al otro lado de una pared: si el punto sorteado
      // queda tras un muro, cae a los pies de quien lo suelta. Se sortea igual
      // —los dos `rng()` de arriba se gastan siempre— para que el lockstep no
      // se desfase por dónde esté cada uno.
      if (RejillaMapa.activa && !arma.def.atraviesaParedes &&
          !RejillaMapa.lineaLibre(j.x, j.y, x, y)) { x = j.x; y = j.y; }
      ctx.zonas.crear({
        duenyo: ctx.jugador, arma, arma,
        x, y,
        atraviesaParedes: arma.def.atraviesaParedes,
        radio: areaDe(s.radio, j), duracion: duracionDe(s.duracion, j),
        danyo: danyoDe(s, j), intervalo: s.intervalo,
        empuje: s.empuje, ralentiza: s.ralentiza || 0,
        modo: 'zona', color: arma.def.color, relleno: 0.22,
        sprite: arma.def.sprite, giro: arma.def.giro,
        opacidad: arma.def.opacidad,
        bloquea: arma.def.bloqueaDisparos,
        // ZONA HECHA DE PIEZAS: los abrojos del Tribulus. Salen VOLANDO desde
        // el jugador, así que la zona necesita saber de dónde partieron — y
        // desde el CENTRO del cuerpo, no desde los pies, que es de donde se
        // lanza algo a mano.
        hojaPieza: arma.def.spritePieza,
        piezas: arma.def.piezas,
        vuelo: arma.def.vueloPieza,
        origenX: j.x, origenY: j.y - medioAlto(j),
        // Que el charco prenda donde cae un enemigo. Sale de la DEFINICIÓN y no
        // de las stats porque no crece con el nivel: un incendio se extiende
        // igual de bien al nivel 1 que al 10, lo que sube es el radio de lo que
        // se extiende.
        propaga: arma.def.propaga
      });
    }
    return true;
  },

  // MINAS. Se siembran en el suelo y esperan; explotan cuando algo las pisa.
  //
  // Comportamiento propio y no `zonaPersistente` con otro nombre, porque la
  // pregunta que le hace al jugador es distinta: un charco castiga a quien se
  // queda dentro y hay que colocarlo donde va a haber gente; una mina castiga
  // a quien PASA, así que se siembra por donde vas a huir. Una es un área de
  // negación y la otra es una trampa.
  //
  // Antes eran un charco disfrazado —dañaban por tics a quien estuviera
  // encima— y no se leían como minas ni hacían lo que promete su nombre.
  minaProximidad(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    // LA SIEMBRA SE ABRE CON EL NÚMERO DE MINAS, y no es un adorno: con el
    // reparto fijo de antes —de 20 a 65 unidades— las dos minas del nivel 1
    // quedaban bien, pero las veinticuatro del 10 caían todas en el mismo
    // corro y se solapaban unas con otras. Veinticuatro minas apiladas hacen el
    // daño de una: lo que cobra es la que pisas, no las que hay debajo.
    //
    // Crece con la RAÍZ del número porque lo que tiene que quedar constante es
    // la densidad, y la densidad va por área. Con 2 minas da los 45 de siempre;
    // con 24, 110 — un campo alrededor de ti, que es lo que promete el arma.
    // El tope está para que no se siembre fuera de cámara: regalar minas donde
    // no las ve nadie es tirarlas.
    const apertura = Math.min(45 * Math.sqrt(s.charcos / 2), 110);
    // SIEMPRE A DISTANCIA, NINGUNA A d=0: la primera mina de la siembra
    // caía exactamente bajo los pies de quien la plantaba -mala jugada por
    // partida doble, porque el gatillo (38% del radio) prácticamente la
    // pisa nada más aparecer- y encima es el sitio que el propio jugador va
    // a pisar el siguiente al moverse. `20` es el mismo mínimo que ya tenían
    // las demás.
    //
    // Y NINGUNA ENCIMA DE OTRA. La apertura reparte, pero repartir al azar no
    // impide que dos caigan en el mismo sitio: con veinticuatro tiradas pasa
    // seguro. Así que el sitio se sortea y se RECHAZA si ya está ocupado, hasta
    // `INTENTOS` tiradas por mina. Si ninguna encuentra hueco es que el campo
    // está lleno de verdad, y esa mina no se siembra: plantarla sobre otra no
    // añade una trampa, tapa la que había.
    //
    // Gastar un número variable de tiradas del RNG es determinista igual: todos
    // los clientes corren este mismo bucle sobre el mismo estado, así que el
    // lockstep no se entera.
    const metaMina = Recursos.meta(arma.def.sprite);
    const separacion = 2 * ((metaMina && metaMina.radioDibujo) || 9);
    const INTENTOS = 12;
    for (let i = 0; i < s.charcos; i++) {
      let x = 0, y = 0, libre = false;
      for (let intento = 0; intento < INTENTOS && !libre; intento++) {
        const a = ctx.rng() * Math.PI * 2;
        const d = 20 + ctx.rng() * apertura;
        x = j.x + cos(a) * d;
        y = j.y + sen(a) * d;
        libre = ctx.zonas.minaLibre(x, y, separacion);
      }
      if (!libre) continue;
      ctx.zonas.crear({
        duenyo: ctx.jugador, arma, arma,
        x, y,
        // `radio` es el de la EXPLOSIÓN; el gatillo es mucho más chico, para
        // que haya que pisarla de verdad y no basta con rozarla.
        radio: areaDe(s.radio, j),
        radioGatillo: areaDe(s.radio, j) * 0.38,
        duracion: duracionDe(s.duracion, j),
        danyo: danyoDe(s, j),
        empuje: s.empuje,
        modo: 'mina', color: arma.def.color,
        sprite: arma.def.sprite,
        // NO PARA LOS DISPAROS ENEMIGOS. Y hay que decirlo aquí, porque sin este
        // campo la zona se queda con el valor por defecto —bloquear— y entonces
        // cada mina era una pared invisible del tamaño de su EXPLOSIÓN, que es
        // mucho más que el gatillo que se ve. Con veinticuatro sembradas, medio
        // campo paraba flechas sin que nada en pantalla lo explicara.
        bloquea: arma.def.bloqueaDisparos,
        // Con qué se dibuja el reventón cuando la pisen.
        spriteOnda: arma.def.spriteOnda,
        atraviesaParedes: arma.def.atraviesaParedes
      });
    }
    return true;
  },

  // TORMENTA: rayos que caen del cielo en un área alrededor del jugador y
  // revientan donde tocan.
  //
  // No apunta a nadie, y esa es toda su personalidad. El resto del arsenal
  // busca —al más cercano, hacia donde avanzas, en la dirección del ratón— y
  // esta siembra: cubre un área y lo que esté dentro se lleva lo suyo. Se juega
  // distinto porque premia meterse en el montón en vez de encarar.
  //
  // Los rayos NO caen todos a la vez: se encadenan con `demoraGolpe` usando el
  // mismo mecanismo que los tajos de un arma melé (ver `actualizar`). Soltar
  // siete de golpe sería un fogonazo único; escalonados a doce centésimas se
  // lee como una tormenta, que es lo que se pidió.
  tormentaRayos(arma, sis, ctx) {
    sis.caerRayo(arma, ctx);
    arma.golpesPendientes = arma.stats.rayos - 1;
    arma.demoraGolpe = arma.def.demoraGolpe;
    arma.repetir = sis.caerRayo;
    return true;
  },

  // Aura pegada al jugador. No se recrea cada ciclo: se refresca la que hay, o
  // el pool se llenaría de auras muertas.
  auraPasiva(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    if (arma.zona && arma.zona.vida > 0 && arma.zona.seguir === j) {
      arma.zona.vida = arma.zona.vidaMax;
      arma.zona.radio = areaDe(s.radio, j);
      arma.zona.danyo = danyoDe(s, j);
      return true;
    }
    // Ojo: un aura viva se REFRESCA arriba y no vuelve a pasar por aquí, así
    // que todo lo que se fije abajo tiene que ser constante durante la partida.
    // `opacidad` lo es —sale de la definición, no de las stats— y por eso vale.
    const desvio = medioAlto(j);
    arma.zona = ctx.zonas.crear({
      duenyo: ctx.jugador, arma,
      x: j.x, y: j.y - desvio, desvioY: desvio,
      radio: areaDe(s.radio, j), duracion: 1.0,
      danyo: danyoDe(s, j), intervalo: s.intervalo,
      empuje: s.empuje, modo: 'zona', seguir: j,
      color: arma.def.color, relleno: 0.10,
      sprite: arma.def.sprite, giro: arma.def.giro,
      opacidad: arma.def.opacidad
    });
    return true;
  },

  // Rayo que atraviesa. Es instantáneo: no hay proyectil que seguir, se resuelve
  // la línea y se deja el trazo dibujado. Perfora sin límite por definición.
  rayoPerforante(arma, sis, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    const dirs = PATRONES[arma.def.patron] || PATRONES.horizontal;
    const danyo = danyoDe(s, j);
    const items = ctx.enemigos.pool.items;

    // EL BARRIDO. `giroRayo` son los grados que el haz gira mientras se apaga,
    // en el sentido de las agujas del reloj (positivo hacia la derecha, porque
    // en el lienzo la Y crece hacia abajo). 0 = haz quieto, que es lo normal.
    const giro = (s.giroRayo || 0) * GRADOS;

    for (let d = 0; d < dirs.length; d++) {
      const a = dirs[d];
      const ux0 = cos(a), uy0 = sen(a);
      // EL HAZ NACE EN EL CONTORNO, igual que un proyectil. Salía del pecho
      // (y-8) y por tanto se dibujaba por encima del personaje antes de salir
      // de él; con la boca puesta, empieza donde acaba la silueta.
      //
      // Y el daño se mide desde el MISMO punto que el dibujo. Si no, un enemigo
      // pegado al jugador por el lado contrario entraría por `proy < 0` en uno
      // y no en el otro.
      const b = bocaDe(j, a);
      let bx = b.x, by = b.y;
      // EL HAZ SE PARA EN LA PARED. Su largo es el alcance o la distancia al
      // primer muro, lo que llegue antes, y así se dibuja y así se cobra: nada
      // más allá de ese largo. Con barrido el haz gira, y ahí el recorte se
      // mide sobre el ángulo de salida —aproximado, pero un aspa que gira no
      // suele girar hacia dentro de una tienda— y a cada enemigo se le pide
      // además la línea de visión, que es lo que de verdad decide.
      // Y si la propia boca ya queda al otro lado del muro —pegado por debajo
      // a una pared de una celda pasa, ver `lanzar` en entidades/proyectil.js—
      // el haz sale de los pies, por lo mismo que allí.
      const paredes = RejillaMapa.activa && !arma.def.atraviesaParedes;
      let largo = s.alcance;
      if (paredes) {
        if (!RejillaMapa.lineaLibre(j.x, j.y, bx, by)) { bx = j.x; by = j.y; }
        largo = RejillaMapa.alcanceLibre(bx, by, ux0, uy0, s.alcance);
        if (largo <= 0) continue;
      }
      // Se busca en un radio igual al alcance y se filtra por distancia a la
      // recta: mucho más barato que marchar el rayo paso a paso.
      const n = enemigosEnRadio(ctx.enemigos, j.x, j.y, s.alcance, sis._alcanzados);
      for (let i = 0; i < n; i++) {
        const e = items[sis._alcanzados[i]];
        const dx = e.x - bx, dy = e.y - by;
        if (paredes && !RejillaMapa.lineaLibre(bx, by, e.x, e.y)) continue;

        // SIN BARRIDO es una sola recta, y esta es la rama de siempre.
        //
        // CON BARRIDO el haz no es una recta sino un ABANICO de `giro` grados, y
        // hay que dañar a todo lo que quede dentro — si no, el jugador ve el haz
        // pasarle por encima a un enemigo sin hacerle nada, que es peor que no
        // girar. Se resuelve metiendo al enemigo en el abanico: se toma su
        // ángulo, se recorta al rango [a, a+giro] y se mide contra ESE rayo. Un
        // enemigo dentro del abanico cae sobre su propio ángulo —distancia cero
        // a la recta, o sea tocado— y uno de fuera se compara contra el borde
        // más cercano, que es exactamente lo que hacía el código de antes.
        let ux = ux0, uy = uy0;
        if (giro !== 0) {
          let delta = atan2(dy, dx) - a;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          const dentro = delta < 0 ? 0 : (delta > giro ? giro : delta);
          ux = cos(a + dentro);
          uy = sen(a + dentro);
        }

        const proy = dx * ux + dy * uy;
        if (proy < 0) continue;                       // detrás del jugador
        if (proy > largo + e.radioCuerpo) continue;   // más allá de la pared
        const perp = Math.abs(dx * uy - dy * ux);     // distancia a la recta
        if (perp > s.grosor + e.radioCuerpo) continue;
        ctx.enemigos.danyar(e, danyo, ux, uy, s.empuje, ctx.jugador, arma);
      }
      sis._anotarRayo(bx, by, a, largo, s.grosor, arma.def.color, giro,
                      arma.def.duracionRayo);
    }
    return true;
  },

  // Escudos que orbitan. No usan proyectil: su posición sale del ángulo, y el
  // daño se resuelve por contacto en cada paso con su propio sello para no
  // machacar al mismo enemigo sesenta veces por segundo.
  orbital(arma, sis, ctx) {
    // Se "dispara" una vez y luego vive en actualizarOrbitales.
    arma.orbitalActivo = true;
    return true;
  },

  // Orbital INTERMITENTE: sale, gira unos segundos y se retira hasta la próxima
  // recarga. El orbital normal, una vez encendido, ya no se apaga nunca.
  //
  // La diferencia no es cosmética, es de juego. Un orbital permanente es una
  // defensa: mientras lo lleves, nadie te toca por ese anillo, y eso vuelve
  // pasiva la posición del jugador. Uno que aparece y desaparece te obliga a
  // llevar la cuenta y a decidir cuándo te metes en el montón y cuándo esperas
  // fuera. A cambio de esa ventana pega mucho más que el permanente.
  orbitalPulsante(arma, sis, ctx) {
    arma.orbitalActivo = true;
    arma.restanteOrbital = arma.stats.duracion;
    return true;
  }
};

// Direcciones de cada patrón, en radianes. Y crece hacia ABAJO en pantalla.
const PATRONES = {
  horizontal: [0, Math.PI],
  vertical: [-Math.PI / 2, Math.PI / 2],
  cruz: [0, Math.PI / 2, Math.PI, -Math.PI / 2],
  diagonal: [Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4, -Math.PI / 4],
  adelante: [0]
};

// EL RUMBO DEL JUGADOR, para las armas que disparan HACIA DONDE MIRAS.
//
// No es un patrón como los de arriba —esos son rumbos fijos de la brújula— sino
// uno que se calcula en cada disparo. Va aparte y con nombre propio (`rumbo`)
// para que `direccionesDe` sepa que tiene que preguntar por el jugador en vez
// de leer una lista.
//
// El rumbo sale de `rumboX`/`rumboY` (ver entidades/jugador.js), que es la
// última dirección en la que se movió y NO se pone a cero al soltar el mando:
// parado, un arma de estas sigue apuntando adonde ibas, que es lo que espera
// quien se detiene a esperar a la horda de frente.
const RUMBO = [0];

// MÁS BRAZOS DE LOS QUE TIENE EL PATRÓN.
//
// Un patrón es una lista fija de rumbos, y eso basta mientras el arma tenga
// siempre los mismos. El Aspa no: abre de cuatro brazos a ocho según sube, así
// que los rumbos hay que repartirlos en el momento.
//
// Se reparten REGULARMENTE por la circunferencia entera, anclados al primer
// rumbo del patrón. Así el arma conserva su orientación —el Aspa sigue saliendo
// en diagonal y no en cruz— y los pasos intermedios (cinco brazos, seis, siete)
// quedan repartidos por igual en vez de amontonados a un lado.
//
// Buffer de módulo y no un array nuevo por disparo: esto se llama cada vez que
// dispara un arma de patrón, y asignar aquí es asignar en caliente.
const MAX_DIRECCIONES = 16;
const dirsGeneradas = new Float64Array(MAX_DIRECCIONES);

// Cuántas de las que devuelve `direccionesDe` valen. Va en una variable de
// módulo, y no devolviendo un array del tamaño justo, porque recortar el buffer
// —con `slice` o incluso con `subarray`— asigna un objeto nuevo en cada disparo.
// Es el mismo apaño que `origenDisparo` unas líneas más arriba, y por lo mismo.
let nDirs = 0;

function direccionesDe(arma, s, jugador) {
  if (arma.def.patron === 'rumbo') {
    RUMBO[0] = atan2(jugador.rumboY, jugador.rumboX);
    nDirs = 1;
    return RUMBO;
  }
  const patron = PATRONES[arma.def.patron] || PATRONES.horizontal;
  let n = s.direcciones | 0;
  // Sin `direcciones`, o pidiendo menos de las que el patrón ya trae, manda el
  // patrón: es lo que usan las otras ocho armas de esta familia.
  if (n <= patron.length) { nDirs = patron.length; return patron; }
  if (n > MAX_DIRECCIONES) n = MAX_DIRECCIONES;
  const paso = Math.PI * 2 / n;
  for (let i = 0; i < n; i++) dirsGeneradas[i] = patron[0] + paso * i;
  nDirs = n;
  return dirsGeneradas;
}

// CÓMO SE DIBUJA CADA PROYECTIL.
//
// Hasta ahora los 52 armas del catálogo se veían igual: una raya de color con
// estela. El comportamiento —lo que el arma HACE, que ya está en datos/armas.js—
// es también lo que mejor describe qué debería parecer, así que la forma sale de
// ahí por defecto y no hay que anotarla arma por arma.
//
// Un arma puede llevar su propio `forma` en los datos cuando el comportamiento
// se queda corto. Pasa con las armas de fuego: comparten `proyectilDirigido` con
// el pilum y con el arco, pero una bala no es una jabalina.
function formaDe(arma) {
  return arma.def.forma || FORMA_POR_COMPORTAMIENTO[arma.def.comportamiento] || 'raya';
}

const FORMA_POR_COMPORTAMIENTO = {
  proyectilDirigido:   'dardo',
  direccionFija:       'dardo',
  direccionAleatoria:  'dardo',
  proyectilExplosivo:  'bola',
  proyectilPerseguidor: 'bola',
  rayoPerforante:      'rayo'
};

export class Armas {
  constructor(rng) {
    this.equipadas = [];
    this._rng = rng;
    this._alcanzados = new Int32Array(MAX_ALCANZADOS);
    this._avisadas = new Set();       // comportamientos sin implementar ya avisados

    // Descriptor reutilizado para lanzar proyectiles: se rellena y se pasa, en
    // vez de construir un objeto literal por disparo.
    this.defProyectil = {
      vida: 0, danyo: 0, empuje: 0, radio: 0,
      perforacion: 0, color: '#fff', estela: null, largo: 8, forma: 'raya',
      hoja: null
    };

    // Tajos para dibujar, preasignados.
    this.tajos = new Array(MAX_TAJOS);
    for (let i = 0; i < MAX_TAJOS; i++) {
      this.tajos[i] = { x: 0, y: 0, ang: 0, semi: 0, alcance: 0, vida: 0, vidaMax: 1,
                        color: '#fff', hoja: null,
                        // A quién va pegado el tajo, y cuánto por encima de su
                        // posición. Ver actualizarTajos.
                        seguir: null, desvioY: 0 };
    }
    this.nTajos = 0;

    // Rayos dibujados, mismo esquema de buffer circular que los tajos.
    this.rayos = new Array(MAX_TAJOS);
    for (let i = 0; i < MAX_TAJOS; i++) {
      this.rayos[i] = { x: 0, y: 0, ang: 0, largo: 0, grosor: 0, vida: 0, vidaMax: 1,
                        color: '#fff', giro: 0 };
    }
    this.nRayos = 0;
  }

  // Rellena el descriptor de proyectil con lo común a todos los comportamientos.
  // Cada uno ajusta después lo suyo (vida, explosión).
  _rellenarProyectil(arma, s, danyo, duenyo) {
    const d = this.defProyectil;
    d.duenyo = duenyo || null;
    // Y QUIÉN DISPARA, para que el resumen pueda decir cuánto ha hecho cada
    // arma. Va por aquí y no a mano en cada comportamiento por lo de siempre:
    // `defProyectil` es compartido, y lo que no se escriba se queda con lo del
    // disparo anterior — de otra arma.
    d.arma = arma;
    // Ida y vuelta, si el arma lo pide. Hoy solo los Aros de rítmica.
    d.bumeran = !!arma.def.bumeran;
    // La FORMA con que se dibuja. Sale del comportamiento salvo que el arma diga
    // otra cosa: ver FORMA_POR_COMPORTAMIENTO, aquí arriba.
    d.forma = formaDe(arma);
    // Dibujo propio del proyectil, si el arma lo declara. Sustituye a la forma
    // trazada entera (cuerpo, halo y estela): ver entidades/proyectil.js.
    d.hoja = arma.def.spriteProyectil || null;
    // Radianes por segundo que voltea el dibujo. Sin esto se orienta al vuelo,
    // que es lo correcto para una bala o una abeja y lo contrario de lo que
    // hacen un shuriken o una botella dando vueltas.
    d.giro = arma.def.giroProyectil || 0;
    // Cuánto se amplía el dibujo. Sale de las STATS y no de la definición
    // porque crece con el nivel: ver `escalaProyectil` en la Rosa de los
    // vientos, que cuadruplica su estrella del 1 al 10.
    d.escala = s.escalaProyectil || 1;
    // Fotograma de la hoja. Cero salvo que quien lanza diga otra cosa: lo hace
    // el RainbowMazas, que reparte una maza distinta por cada una que suelta.
    // Va aquí y no solo en su comportamiento porque `defProyectil` es
    // COMPARTIDO entre todas las armas, y lo que no se escriba se queda con lo
    // que dejó el disparo anterior — el fallo que ya costó los rebotes.
    d.fotograma = 0;
    d.danyo = danyo;
    d.empuje = s.empuje;
    d.radio = s.radio;
    // EL ASTA DEL ESCORNAO suma perforación a lo que ya trae el arma. Va aquí,
    // en el repartidor común, y no en cada comportamiento: así lo heredan las
    // veintitantas armas de proyectil de una vez, que es lo que se pidió.
    d.perforacion = s.perforacion + (duenyo ? (duenyo.bonusPerforacion | 0) : 0);
    d.color = arma.def.color;
    d.estela = arma.def.estela;
    d.largo = arma.def.largoTrazo || 8;
    d.radioExplosion = 0;
    d.danyoExplosion = 0;
    d.estallaAlExpirar = false;
    // Hoja de la explosión, si el arma la declara. Viaja con el proyectil
    // porque quien crea la onda es main.js al estallar, y allí ya no hay arma:
    // solo el proyectil. Mismo camino que `spriteProyectil`.
    d.spriteOnda = arma.def.spriteOnda || null;
    // Y la columna de rayo, si el arma la declara. Mismo camino y mismo motivo.
    d.rayoCaida = arma.def.rayoCaida || 0;
    d.rayoGrosor = arma.def.rayoGrosor || 3;
    // Rebotes. Salen de las STATS y no de la definición porque crecen con el
    // nivel: el Fusil gana uno en el 3 y otro en el 10, la Honda hasta tres.
    d.rebotesPared = s.rebotesPared || 0;
    d.rebotesEnemigo = s.rebotesEnemigo || 0;
    // Lo que gana de velocidad por rebote. De la DEFINICIÓN y no de las stats:
    // es una propiedad del arma, no algo que suba con el nivel — lo que sube
    // con el nivel son los rebotes, y cada uno vale lo mismo.
    d.aceleraRebote = arma.def.aceleraRebote || 0;
    // Si pasa por encima de las paredes del nivel. De la definición: lo dicen
    // las armas que caen del cielo, y el resto se para en el muro.
    d.atraviesaParedes = !!arma.def.atraviesaParedes;
    // Y a cero lo del OSITO, por lo mismo que todo lo demás de aquí: este
    // descriptor es COMPARTIDO, y lo que no se escriba se queda con lo que dejó
    // el disparo anterior — de otra arma. Sin esto, llevar el Osito hacía que
    // las balas de las otras seis persiguieran y culebrearan.
    d.persigue = 0;
    d.zigzag = 0;
    d.zigFrec = 0;
    d.fase = 0;
    d.animFps = 0;
    d.sinRotar = false;
    d.recto = 0;
  }

  // UN rayo de la tormenta. Va aquí y no dentro del comportamiento porque se
  // llama dos veces: al activarse el arma y luego una vez por cada rayo
  // encadenado (ver `repetir` en `actualizar`).
  caerRayo(arma, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;

    // Punto al azar dentro del DISCO de alcance. La raíz cuadrada es lo que
    // reparte uniforme por ÁREA: sin ella, la mitad de los rayos caería en el
    // círculo central —que es una cuarta parte del área— y la tormenta se
    // apelotonaría encima del jugador en vez de cubrir la zona.
    const a = ctx.rng() * Math.PI * 2;
    const d = Math.sqrt(ctx.rng()) * areaDe(s.alcance, j);
    const x = j.x + cos(a) * d;
    const y = j.y - medioAlto(j) + sen(a) * d;

    // El reventón. Modo 'onda' y no 'zona': hace daño UNA vez a lo que pilla al
    // abrirse, como una explosión, en vez de por tics — un rayo golpea al caer,
    // no se queda quemando.
    const radio = areaDe(s.radio, j);
    ctx.zonas.crear({
      duenyo: ctx.jugador, arma,
      x, y,
      radio, radioIni: radio * 0.18,
      duracion: 0.26, danyo: danyoDe(s, j),
      empuje: s.empuje, modo: 'onda',
      color: arma.def.color, relleno: 0.34,
      // El chispazo dibujado, si el arma lo trae. Era la última onda del
      // arsenal que seguía cayendo al círculo trazado.
      sprite: arma.def.spriteOnda,
      atraviesaParedes: arma.def.atraviesaParedes
    });

    // Y el haz cayendo a plomo sobre el punto: se traza desde `caida` unidades
    // más arriba hacia abajo (PI/2), así que entra en cuadro desde el cielo.
    this._anotarRayo(x, y - s.caida, Math.PI / 2, s.caida, s.grosor, arma.def.color);
    if (!Particulas.saturado()) {
      Particulas.estallido(x, y, 5, 95, 0.24, 1.5, COLOR_CHISPA, 0.35, this._rng);
    }
  }

  // `giro` en RADIANES: cuánto barre el haz durante su vida. Va con valor por
  // defecto porque solo lo usa el Aspa de luz al máximo; la tormenta y los otros
  // dos rayos no lo pasan y salen rectos como siempre.
  //
  // `vida` es lo que dura el destello, y con el barrido puesto pasa a ser
  // también LA VELOCIDAD del giro: el haz recorre sus grados mientras se apaga,
  // así que alargarle la vida es exactamente ralentizarlo. Un solo número para
  // las dos cosas, y es lo correcto — un aspa que gira despacio y desaparece
  // enseguida se cortaría a medio barrido.
  _anotarRayo(x, y, ang, largo, grosor, color, giro = 0, vida = 0.12) {
    const r = this.rayos[this.nRayos % MAX_TAJOS];
    this.nRayos++;
    r.x = x; r.y = y; r.ang = ang; r.largo = largo;
    r.grosor = grosor; r.vida = r.vidaMax = vida; r.color = color;
    r.giro = giro;
  }

  // Los orbitales no "disparan": existen. Se actualizan aparte, cada paso, y
  // dañan por contacto. El sello se renueva cada ORBITAL_CADENCIA segundos para
  // que un escudo pegado a un enemigo no le pegue sesenta veces por segundo.
  actualizarOrbitales(dt, ctx) {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];
      if (!arma.orbitalActivo) continue;
      const s = arma.stats;
      const j = ctx.jugador;

      // Los intermitentes traen `duracion` y se retiran al agotarla. Los
      // permanentes no la tienen, así que ni se compara: es la misma rama para
      // los dos y no hay que preguntar por el nombre del comportamiento en el
      // bucle.
      if (s.duracion > 0) {
        arma.restanteOrbital -= dt;
        if (arma.restanteOrbital <= 0) { arma.orbitalActivo = false; continue; }
      }

      // Giro del escudo SOBRE SÍ MISMO, distinto de su vuelta alrededor del
      // jugador. Un disco de sierra que orbita sin girar parece una chapa
      // pegada; un escudo, en cambio, no debe girar nunca o su emblema acaba
      // boca abajo la mitad del tiempo. Por eso es un dato del arma y no una
      // regla del motor. Fase propia y avanzada con dt: determinista.
      if (arma.def.giroOrbital) arma.faseGiro += arma.def.giroOrbital * dt;

      arma.anguloOrbital += dt * s.velocidadAngular;
      arma.relojOrbital -= dt;
      if (arma.relojOrbital <= 0) {
        arma.relojOrbital = ORBITAL_CADENCIA;
        arma.selloOrbital = -(++contadorSelloOrbital);   // negativo: no choca
      }                                                   // con los proyectiles

      const radio = areaDe(s.radioOrbita, j);
      const danyo = danyoDe(s, j);
      const items = ctx.enemigos.pool.items;
      const cy = j.y - medioAlto(j);       // centro visual, no la línea de pies
      // Un escudo que orbita pegado a una pared asoma al otro lado, pero no
      // pega ahí: se pide línea de visión desde el jugador, que es de quien
      // cuelga. Antes del sello, por lo mismo que en entidades/zonaDanyo.js.
      const paredes = RejillaMapa.activa && !arma.def.atraviesaParedes;

      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + (k / s.escudos) * Math.PI * 2;
        const ox = j.x + cos(a) * radio;
        const oy = cy + sen(a) * radio;
        const n = enemigosEnRadio(ctx.enemigos, ox, oy, s.radioEscudo, this._alcanzados);
        for (let q = 0; q < n; q++) {
          const e = items[this._alcanzados[q]];
          if (paredes && !RejillaMapa.lineaLibre(j.x, j.y, e.x, e.y)) continue;
          if (e.ultimoSello === arma.selloOrbital) continue;
          e.ultimoSello = arma.selloOrbital;
          const dx = e.x - j.x, dy = e.y - j.y;
          const d = hipot(dx, dy) || 1;
          ctx.enemigos.danyar(e, danyo, dx / d, dy / d, s.empuje, ctx.jugador, arma);
        }
      }
    }
  }

  // Un orbital es un OBJETO, no una luz.
  //
  // Estaba dibujado como disco relleno en 'lighter' y sobre la arena clara del
  // anfiteatro eso satura enseguida: salían bolas BLANCAS, sin el color del
  // arma, sin canto, y tapando a los enemigos de debajo. Un escudo que no se
  // distingue de otro escudo no informa de nada, y con tres armas orbitales en
  // el catálogo eso importa.
  //
  // Van en dos pasadas. Primero un halo aditivo flojo, que es lo que da el calor
  // y lo que se acumula cuando varios se juntan; encima el cuerpo opaco con
  // reborde oscuro, que le devuelve el color y el borde.
  dibujarOrbitales(ctx, jugador) {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];
      if (!arma.orbitalActivo) continue;
      const s = arma.stats;
      const radio = areaDe(s.radioOrbita, jugador);
      const r = s.radioEscudo;
      const paso = (Math.PI * 2) / s.escudos;
      // MISMO centro que usa la colisión en `actualizarOrbitales`: el visual y
      // el daño de un orbital tienen que orbitar el mismo punto o el escudo
      // pega donde no se ve.
      // Posición INTERPOLADA, la misma con la que se dibuja el personaje. Con
      // la del paso de lógica los escudos van un paso por detrás de su dueño y
      // a mucho fps se nota como un baile alrededor de él.
      const cx = jugador.xVista;
      const cy = jugador.yVista - medioAlto(jugador);

      // CON HOJA PROPIA: el dibujo y nada más. Ni halo ni aro, por el mismo
      // motivo que en las zonas — el sprite está horneado para llenar su cuadro
      // hasta el radio del escudo, así que ya dice dónde está y hasta dónde
      // llega. Añadirle el aro encima sería el círculo de siempre pintado sobre
      // el dibujo nuevo.
      const imgOrb = arma.def.spriteOrbital ? Recursos.imagen(arma.def.spriteOrbital) : null;
      const metaOrb = arma.def.spriteOrbital ? Recursos.meta(arma.def.spriteOrbital) : null;
      if (imgOrb && metaOrb) {
        // MEDIO LADO DEL DIBUJO. Por defecto es el radio del escudo, o sea el
        // que hace daño, que es la regla de la casa: el filo del dibujo cae
        // donde acaba lo que mata.
        //
        // `escalaOrbital` la rompe a propósito para las lunas de los Satélites,
        // que se quieren ver grandes. Es un ajuste SOLO de dibujo y no toca la
        // colisión —que sigue leyendo `radioEscudo` en actualizarOrbitales— así
        // que conviene usarlo con cuidado y con el motivo escrito al lado, como
        // está en datos/armas.js.
        const rDibujo = r * (arma.def.escalaOrbital || 1);

        // AURA DETRÁS DEL ESCUDO. Una hoja aparte, no horneada en el sprite, y
        // por un motivo concreto: el Testudo comparte el escudo con el Scutum,
        // así que un aura metida en el PNG la llevarían los dos y la evolución
        // dejaría de distinguirse de su arma base.
        //
        // En ADITIVO, que es lo que la hace resplandor: sumando luz sobre lo
        // que haya debajo en vez de taparlo.
        const imgAura = arma.def.auraOrbital ? Recursos.imagen(arma.def.auraOrbital) : null;
        const metaAura = arma.def.auraOrbital ? Recursos.meta(arma.def.auraOrbital) : null;
        if (imgAura && metaAura) {
          const rAura = r * (arma.def.escalaAura || 1.8);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let k = 0; k < s.escudos; k++) {
            const a = arma.anguloOrbital + k * paso;
            ctx.drawImage(imgAura, 0, 0, metaAura.w, metaAura.h,
                          cx + cos(a) * radio - rAura,
                          cy + sen(a) * radio - rAura,
                          rAura * 2, rAura * 2);
          }
          ctx.restore();
        }

        // LA FASE ES LA POSICIÓN EN LA ÓRBITA, y esa es toda la idea.
        //
        // Las lunas de los Satélites traen una tira con el ciclo lunar entero
        // (ver Pirotecnia.Luna). En vez de darle a cada una un reloj propio, el
        // fotograma sale de DÓNDE ESTÁ: el ángulo orbital, normalizado a una
        // vuelta, indexa la tira.
        //
        // De ahí salen las tres cosas a la vez y sin guardar un solo dato nuevo:
        // cada luna enseña una fase distinta —porque están repartidas por la
        // circunferencia—, cada una va cambiando según gira, y una vuelta
        // completa al jugador es un ciclo lunar completo. Y es reproducible por
        // construcción: no depende del reloj, depende de la geometría.
        //
        // Con hojas de un solo fotograma —el escudo, los discos, las sierras—
        // esto da 0 y no se entera nadie.
        const fases = metaOrb.frames || 1;
        const vuelta = Math.PI * 2;

        // UN DIBUJO DISTINTO POR ORBITAL, la otra manera de repartir la hoja.
        //
        // Es la del Códice Infernal: sube de nivel y aparece OTRO libro, no uno
        // más igual que el anterior. Su hoja trae los diez, y lo que elige cuál
        // es el número de orbital, no dónde está en la órbita — cada libro es
        // el mismo libro siempre, dé las vueltas que dé. Si la fase la pusiera
        // el ángulo, como en las lunas, los diez libros estarían cambiando de
        // portada todo el rato y no habría ninguno que fuera el tuyo.
        const porEscudo = !!arma.def.fotogramaPorEscudo;

        for (let k = 0; k < s.escudos; k++) {
          const a = arma.anguloOrbital + k * paso;
          let f = 0;
          if (porEscudo) {
            // El módulo es la red de seguridad: si algún día hay más orbitales
            // que dibujos en la hoja, se repiten en vez de indexar fuera.
            f = k % fases;
          } else if (fases > 1) {
            // El doble módulo es para los ángulos negativos: en JavaScript
            // (-0.3 % 1) es -0.3, no 0.7, y eso indexaría fuera de la tira.
            const t = (((a / vuelta) % 1) + 1) % 1;
            f = (t * fases) | 0;
            if (f >= fases) f = fases - 1;
          }
          // save/restore por escudo, como en los tajos: la matriz del mundo la
          // fija main.js con el desvío de cámara ya redondeado, y reconstruirla
          // aquí sería copiar ese cálculo en un segundo sitio.
          ctx.save();
          ctx.translate(cx + cos(a) * radio, cy + sen(a) * radio);
          if (arma.def.giroOrbital) ctx.rotate(arma.faseGiro);
          ctx.drawImage(imgOrb, f * metaOrb.w, 0, metaOrb.w, metaOrb.h,
                        -rDibujo, -rDibujo, rDibujo * 2, rDibujo * 2);
          ctx.restore();
        }
        continue;
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = arma.def.color;
      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + k * paso;
        ctx.beginPath();
        ctx.arc(cx + cos(a) * radio, cy + sen(a) * radio,
                r * 1.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Aro, no moneda. Relleno translúcido y canto marcado: relleno opaco
      // tapaba al enemigo que tienes justo encima, y en un juego donde lo que
      // mata es no ver quién se te ha pegado, eso es un efecto que juega en tu
      // contra. Con el aro se sabe dónde está el escudo y se sigue viendo qué
      // hay debajo.
      ctx.save();
      ctx.lineWidth = 1.4;
      for (let k = 0; k < s.escudos; k++) {
        const a = arma.anguloOrbital + k * paso;
        const ox = cx + cos(a) * radio;
        const oy = cy + sen(a) * radio;

        ctx.globalAlpha = 0.32;
        ctx.fillStyle = arma.def.color;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(18,12,22,.8)';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = arma.def.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.arc(ox, oy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  equipar(id) {
    const def = ARMAS[id];
    if (!def) return null;
    const arma = {
      id, def, nivel: 1,
      // LO QUE HA HECHO ESTA ARMA EN ESTA PARTIDA. Lo enseña el resumen final,
      // que lista cada una con su daño y sus bajas. Se pone a cero al equipar y
      // no se toca en las subidas de nivel: la cuenta es del arma en la partida,
      // no del nivel al que llegó.
      danyoHecho: 0, bajas: 0,
      temporizador: 0,
      golpesPendientes: 0,
      demoraGolpe: 0,
      // Estado propio de los comportamientos que lo necesitan.
      orbitalActivo: false, anguloOrbital: 0, relojOrbital: 0, selloOrbital: 0,
      faseGiro: 0,             // giro del escudo sobre sí mismo
      repetir: null,           // qué encadena esta arma; null = un tajo
      restanteOrbital: 0,      // solo el orbital intermitente
      zona: null,
      stats: {}
    };
    this._recalcular(arma);
    this.equipadas.push(arma);
    return arma;
  }

  subirNivel(id) {
    const arma = this.equipadas.find((a) => a.id === id);
    if (!arma || arma.nivel >= MAX_NIVEL) return false;
    arma.nivel++;
    this._recalcular(arma);
    return true;
  }

  // Sustituye un arma por su evolución (sección 9 del plan). Solo lo llama
  // sistemas/progresion.js al abrir un cofre, tras comprobar los requisitos.
  //
  // EN SU SITIO, conservando la posición en `equipadas`: esa posición es la
  // ranura que ocupa en la ficha del jugador, y verla saltar al final de la fila
  // haría parecer que se ha perdido un arma y ganado otra distinta.
  //
  // Se reinicia todo el estado vivo. El comportamiento cambia —un arco de melé
  // pasa a ser una onda, un orbital cambia de número de escudos— y arrastrar el
  // temporizador o el ángulo del anterior deja el primer disparo descolocado.
  //
  // `stats` se cambia por un objeto nuevo en vez de vaciarlo: borrar claves con
  // `delete` mete el objeto en modo diccionario en V8 y este objeto se lee en
  // cada disparo durante el resto de la partida. Es la única asignación, y pasa
  // como mucho cinco veces por partida y siempre con el juego parado en el menú
  // del cofre, nunca dentro del bucle.
  evolucionar(id, idEvo) {
    const arma = this.equipadas.find((a) => a.id === id);
    const def = ARMAS[idEvo];
    if (!arma || !def) return null;

    arma.id = idEvo;
    arma.def = def;
    arma.nivel = 1;
    arma.temporizador = 0;
    arma.golpesPendientes = 0;
    arma.demoraGolpe = 0;
    arma.orbitalActivo = false;
    arma.anguloOrbital = 0;
    arma.relojOrbital = 0;
    arma.selloOrbital = 0;
    arma.restanteOrbital = 0;
    arma.zona = null;          // el charco que hubiera sigue su vida y expira
    arma.stats = {};
    this._recalcular(arma);
    return arma;
  }

  // Aplana la entrada base más los incrementos acumulados hasta el nivel
  // actual. Se hace al equipar y al subir de nivel, nunca en caliente.
  _recalcular(arma) {
    const s = arma.stats;
    for (const k in arma.def) {
      const v = arma.def[k];
      if (typeof v === 'number') s[k] = v;
    }
    const niveles = arma.def.niveles;
    if (!niveles) return;
    for (let i = 1; i < arma.nivel && i < niveles.length; i++) {
      const delta = niveles[i];
      for (const k in delta) s[k] = (s[k] || 0) + delta[k];
    }
    if (s.recarga !== undefined && s.recarga < 0.15) s.recarga = 0.15;
  }

  actualizar(dt, ctx) {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];

      // Golpes encadenados pendientes de la activación anterior.
      //
      // QUIÉN repite lo decide el arma, no este bucle. Un arco melé encadena
      // tajos y una tormenta encadena rayos, y son cosas distintas; el
      // comportamiento deja su función en `arma.repetir` al activarse y aquí
      // solo se la llama. Preguntar por el nombre del comportamiento habría
      // metido en el motor genérico el conocimiento de un arma concreta, que es
      // justo lo que este archivo evita.
      if (arma.golpesPendientes > 0) {
        arma.demoraGolpe -= dt;
        if (arma.demoraGolpe <= 0) {
          (arma.repetir || this.golpear).call(this, arma, ctx);
          arma.golpesPendientes--;
          arma.demoraGolpe = arma.def.demoraGolpe;
        }
      }

      arma.temporizador -= dt;
      if (arma.temporizador > 0) continue;

      const fn = COMPORTAMIENTOS[arma.def.comportamiento];
      if (!fn) {
        // Comportamiento aún no implementado (Fase 4). Se avisa UNA vez y se
        // deja el arma inerte, en vez de reventar la partida.
        if (!this._avisadas.has(arma.def.comportamiento)) {
          this._avisadas.add(arma.def.comportamiento);
          console.warn(`[armas] comportamiento sin implementar: ${arma.def.comportamiento}`);
        }
        arma.temporizador = 1;
        continue;
      }

      // Si el comportamiento no encuentra a quién pegar, se reintenta pronto en
      // vez de gastar la recarga entera: el arma no debe "perder" un ciclo por
      // haber disparado al vacío.
      arma.temporizador = fn(arma, this, ctx)
        ? recargaDe(arma.stats, ctx.jugador)
        : 0.1;
    }
  }

  // Resuelve un tajo: daña a todo lo vivo dentro del cono y deja el efecto.
  golpear(arma, ctx) {
    const s = arma.stats;
    const j = ctx.jugador;
    // Dirección: hacia donde se mueve; si está parado, hacia donde ENCARA.
    //
    // El repliegue era `mirandoDerecha ? 1 : -1`, o sea la horizontal pura, y
    // eso perdía el eje vertical: yendo hacia arriba y soltando el stick, el
    // tajo saltaba de golpe a un lado. Ahora cae al `rumbo` del jugador, que es
    // la última dirección completa y no se borra al parar.
    let ax = j.x - j.xPrev;
    let ay = j.y - j.yPrev;
    if (Math.abs(ax) < 0.0001 && Math.abs(ay) < 0.0001) {
      ax = j.rumboX;
      ay = j.rumboY;
    }
    const ang = atan2(ay, ax);
    const semi = s.angulo * 0.5 * GRADOS;
    const alcance = areaDe(s.alcance, j);
    const danyo = danyoDe(s, j);

    const n = enemigosEnRadio(ctx.enemigos, j.x, j.y, alcance, this._alcanzados);
    const items = ctx.enemigos.pool.items;
    // Un tajo no cruza paredes: al que está al otro lado del muro no se le da.
    // Se pregunta DESPUÉS del filtro del arco, que descarta a la mayoría sin
    // marchar celdas.
    const paredes = RejillaMapa.activa && !arma.def.atraviesaParedes;
    for (let i = 0; i < n; i++) {
      const e = items[this._alcanzados[i]];
      const dx = e.x - j.x;
      const dy = e.y - j.y;
      // Diferencia angular normalizada a [-PI, PI]
      let d = atan2(dy, dx) - ang;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      if (Math.abs(d) > semi) continue;
      if (paredes && !RejillaMapa.lineaLibre(j.x, j.y, e.x, e.y)) continue;

      const m = hipot(dx, dy) || 1;
      ctx.enemigos.danyar(e, danyo, dx / m, dy / m, s.empuje, ctx.jugador, arma);
    }

    // Centro visual del jugador, no su línea de pies: el área de un arma tiene
    // que envolver la figura entera, no salirle por debajo. Ver `medioAlto`.
    const desvio = medioAlto(j);
    const cyj = j.y - desvio;
    this._anotarTajo(j.x, cyj, ang, semi, alcance, arma.def.color,
                     arma.def.spriteTajo || null, arma.def.duracionTajo, j, desvio);
    Particulas.estallido(j.x + cos(ang) * alcance * 0.6,
                         cyj + sen(ang) * alcance * 0.6,
                         3, 55, 0.18, 1, COLOR_CHISPA, 0.3, this._rng);
  }

  // `duracion` es SOLO VISUAL. El daño de un arco se resuelve entero en el
  // instante del golpe (ver `golpear`), y el tajo que se anota aquí es el
  // dibujo y nada más — así que alargarlo no cambia el juego, solo cuánto se ve.
  //
  // Por eso los 0,16 s de siempre valían para un arco trazado, que es un
  // destello, y se quedan cortos para una animación de seis fotogramas: salen a
  // 27 ms cada uno y no da tiempo a leerlos. Quien traiga hoja pide su propia
  // duración en `duracionTajo`.
  _anotarTajo(x, y, ang, semi, alcance, color, hoja = null, duracion, seguir = null, desvioY = 0) {
    if (!duracion) duracion = 0.16;
    // Buffer circular: el más viejo cede el sitio.
    const t = this.tajos[this.nTajos % MAX_TAJOS];
    this.nTajos++;
    t.seguir = seguir; t.desvioY = desvioY;
    t.x = x; t.y = y; t.ang = ang; t.semi = semi;
    t.alcance = alcance; t.vida = t.vidaMax = duracion; t.color = color;
    // Referencia a una cadena constante del catálogo, no una cadena nueva: esto
    // corre en cada golpe y aquí no se asigna nada.
    t.hoja = hoja;
  }

  // TODO LO QUE ESTE ARSENAL TENGA EN PANTALLA, APAGADO. Lo llama main.js
  // cuando su jugador cae abatido.
  //
  // El bucle de armas se salta a los caídos —"un caído no dispara"—, y ahí
  // estaba el fallo: saltárselo no apaga lo que ya estaba encendido, lo
  // CONGELA. Los escudos orbitales se quedaban dando vueltas alrededor del
  // ataúd para siempre, porque su ángulo solo avanza dentro de ese bucle; y los
  // tajos y los rayos se quedaban clavados a medio trazo, porque su `vida` solo
  // baja en `actualizarTajos`. El resultado era un muerto rodeado de sus propias
  // armas quietas.
  //
  // Se apagan en vez de dejarlos terminar su animación a propósito: quien cae
  // deja de estar en la pelea del todo, y media docena de efectos desvaneciendo
  // sobre el ataúd tapan justo lo que hay que ver, que es dónde ha caído y si se
  // puede llegar.
  //
  // El resto del arsenal NO se toca: recargas, niveles y evoluciones siguen como
  // estaban, porque al levantarse se sigue jugando con las mismas armas.
  apagarEfectos() {
    for (let i = 0; i < this.equipadas.length; i++) {
      const arma = this.equipadas[i];
      arma.orbitalActivo = false;
      arma.restanteOrbital = 0;
    }
    for (let i = 0; i < MAX_TAJOS; i++) {
      this.tajos[i].vida = 0;
      this.tajos[i].seguir = null;   // si no, el tajo sigue anclado a un cadáver
      this.rayos[i].vida = 0;
    }
  }

  actualizarTajos(dt) {
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
      // EL TAJO VA PEGADO AL JUGADOR mientras dura.
      //
      // Antes se anotaba la posición del golpe y ahí se quedaba, y con un arco
      // trazado de 0,16 s casi no se notaba. Con una animación de 0,34 s sí: al
      // moverse, el barrido se quedaba atrás y se veía como un aro suelto en el
      // suelo en vez de un arma girando alrededor del personaje.
      //
      // Solo afecta al DIBUJO. El daño de un arco se resuelve entero en el
      // instante del golpe, así que arrastrar el trazo no alarga ni desplaza a
      // quién alcanza: lo que se corrige es la mentira de que el efecto esté
      // donde el personaje ya no está.
      if (t.vida > 0 && t.seguir) {
        t.x = t.seguir.x;
        t.y = t.seguir.y - t.desvioY;
      }
      if (t.vida > 0) t.vida -= dt;
      const r = this.rayos[i];
      if (r.vida > 0) r.vida -= dt;
    }
  }

  // Trazo del rayo: un haz que se abre y se apaga. Como el resto de efectos, en
  // 'lighter' y por código.
  dibujarRayos(ctx) {
    let hay = false;
    for (let i = 0; i < MAX_TAJOS; i++) if (this.rayos[i].vida > 0) { hay = true; break; }
    if (!hay) return;

    // Dos trazos: un halo aditivo ancho y flojo, y encima el núcleo del COLOR
    // del arma en composición normal.
    //
    // Antes era un solo trazo grueso en 'lighter' y sobre la arena clara se
    // saturaba a blanco puro: un rayo rosa y uno azul se veían idénticos, y una
    // recta blanca cruzando la pantalla de lado a lado parece un fallo de
    // dibujado más que un disparo. El núcleo opaco es lo que le devuelve el
    // color y lo que hace que se lea como un haz.
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 0; i < MAX_TAJOS; i++) {
      const r = this.rayos[i];
      if (r.vida <= 0) continue;
      const k = r.vida / r.vidaMax;
      // El haz recorre su barrido A LA VEZ que se apaga: arranca en su rumbo y
      // termina `giro` radianes más allá justo cuando desaparece. Que las dos
      // cosas acaben juntas es lo que lo lee como un aspa que gira y se va, y no
      // como un haz que da un salto al final.
      const ang = r.ang + r.giro * (1 - k);
      const x2 = r.x + cos(ang) * r.largo;
      const y2 = r.y + sen(ang) * r.largo;

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = k * 0.4;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.grosor * (0.8 + k * 2.2);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = k;
      ctx.lineWidth = r.grosor * (0.35 + k * 0.5);
      ctx.beginPath();
      ctx.moveTo(r.x, r.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // El arco se dibuja por código, como el resto de efectos: un sector con el
  // borde encendido que se abre y se apaga.
  dibujarTajos(ctx) {
    let hay = false;
    for (let i = 0; i < MAX_TAJOS; i++) if (this.tajos[i].vida > 0) { hay = true; break; }
    if (!hay) return;

    ctx.save();
    // Aditivo, igual que el arco trazado que había antes. Y con la hoja de la
    // katana no es solo coherencia: está pintada sobre negro y con un halo muy
    // difuso que se desborda de su celda, así que sumando luz el halo oscuro
    // sencillamente no existe y no hay canto recto que disimular.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX_TAJOS; i++) {
      const t = this.tajos[i];
      if (t.vida <= 0) continue;
      const k = t.vida / t.vidaMax;              // 1 al salir, 0 al apagarse

      // Pegado a la posición INTERPOLADA del jugador, no a la del último paso
      // de lógica: el personaje se dibuja interpolado, y usar aquí la otra
      // dejaría el barrido un paso por detrás de su propio dueño — justo el
      // temblor que se quería quitar, pero más fino.
      const tx = t.seguir ? t.seguir.xVista : t.x;
      const ty = t.seguir ? t.seguir.yVista - t.desvioY : t.y;

      const img = t.hoja ? Recursos.imagen(t.hoja) : null;
      const meta = t.hoja ? Recursos.meta(t.hoja) : null;
      if (img && meta) {
        // FASE POR VIDA. La hoja son fotogramas de un barrido que CRECE, así
        // que se recorren de principio a fin en los 0,16 s que dura el tajo.
        const fases = meta.frames || 1;
        let f = ((1 - k) * fases) | 0;
        if (f >= fases) f = fases - 1;

        // Y SE APAGA AL FINAL, que la hoja no trae. Los seis fotogramas van de
        // destello a anillo cerrado y ahí se acaban: sin esto, el tajo
        // desaparecería de golpe en su fotograma más denso. El último tercio de
        // vida se desvanece.
        ctx.globalAlpha = k < 0.34 ? k / 0.34 : 1;

        // Girado con la dirección del golpe. En la Katana —un barrido de 360°—
        // esto no cambia dónde se hace daño, pero evita que dos tajos seguidos
        // salgan calcados: el anillo entra orientado hacia donde atacas.
        //
        // save/restore por tajo, y no un setTransform de vuelta: la matriz del
        // mundo la fija main.js con el desvío de cámara ya redondeado, y
        // reconstruirla aquí sería copiar ese cálculo en un segundo sitio para
        // que se desincronice el día que cambie. Son doce como mucho.
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(t.ang);
        const r = t.alcance;
        // Medio lado = alcance. El recorte se hizo con el radio del contenido
        // más lejano de la hoja, así que el filo del dibujo cae justo donde
        // acaba el daño. Ver RecortarRejilla en herramientas/procesar-assets.ps1.
        ctx.drawImage(img, f * meta.w, 0, meta.w, meta.h,
                      -r, -r, r * 2, r * 2);
        ctx.restore();
        continue;
      }

      const r = t.alcance * (0.75 + (1 - k) * 0.25);
      ctx.globalAlpha = k * 0.75;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 2 + k * 2;
      ctx.beginPath();
      ctx.arc(tx, ty, r, t.ang - t.semi, t.ang + t.semi);
      ctx.stroke();
    }
    ctx.restore();
  }

  vaciar() {
    for (let i = 0; i < MAX_TAJOS; i++) this.tajos[i].vida = 0;
    for (let i = 0; i < this.equipadas.length; i++) {
      this.equipadas[i].temporizador = 0;
      this.equipadas[i].golpesPendientes = 0;
    }
  }
}
