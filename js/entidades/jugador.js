import { ESCALA_ARTE } from '../core/constantes.js';
import { Recursos } from '../core/recursos.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { PERSONAJES } from '../datos/personajes.js';
import { PASIVOS } from '../datos/pasivos.js';
import { POTENCIADORES } from '../datos/potenciadores.js';
import { MASCOTAS, factorMascota } from '../datos/mascotas.js';
import { Progresion, xpNecesaria, REROLLS, MAX_ARMAS, MAX_PASIVOS } from '../sistemas/progresion.js';
import { GestorAudio } from '../sistemas/audio.js';
import { Particulas, COLOR_SANGRE, COLOR_POLVO } from '../sistemas/particulas.js';
import { VFX } from '../sistemas/vfx.js';
import { hipot } from '../core/mate.js';

// --- Animación ---------------------------------------------------------------
//
// El jugador usa hojas de fotogramas reales, generadas offline por
// herramientas/procesar-assets.ps1 a partir de la única pose de cada personaje.
// El atlas trae los clips con nombre: `quieto` (2 fotogramas) y `andar` (4).
//
// Esto sustituye al "bombeo de zancada" que deformaba el sprite en tiempo real
// cortándolo en franjas. Aquel apaño escalaba las dos piernas a la vez, o sea
// simétricamente, y un paso es justo lo contrario: una pierna sube mientras la
// otra apoya. Se veía patizambo, y encima reescalar en fracciones de píxel cada
// frame hacía hormiguear los bordes. Ahora es un drawImage y punto.
//
// Repliegue: si un personaje no trae clips (arte antiguo, o un placeholder), se
// dibuja el fotograma 0 y no pasa nada.
const CLIP_QUIETO  = 'quieto';
const CLIP_ANDAR   = 'andar';
const CLIP_LATERAL = 'andar_lateral';

// Estadísticas base de la sección 6 del plan.
const BASE = {
  vidaMaxima: 100,
  // 64 y no los 85 del plan: TODO el juego baja un 25% de velocidad, jugador y
  // bestiario a la vez (ver la cabecera de datos/enemigos.js). La proporción
  // entre ambos no cambia —huir sigue funcionando igual de bien— pero el ritmo
  // general afloja y da tiempo a leer la pantalla antes de decidir.
  velocidad: 64,          // px lógicos por segundo
  armadura: 0,
  regeneracion: 0,
  radioRecogida: 40,
  // Subido junto con el resto del bestiario (herramientas/procesar-assets.ps1,
  // datos/enemigos.js): los cuatro personajes crecieron de 22 a 26 de alto
  // lógico, así que el círculo de colisión tiene que crecer con ellos o
  // quedaría flotando dentro de una silueta más grande de lo que protege.
  //
  // El radio de RECOGIDA no cambia con esto: es una distancia de juego, no un
  // cuerpo, y no tiene por qué escalar con el tamaño del personaje.
  radio: 8                // círculo de colisión
};

// Invulnerabilidad tras golpe. Es lo que convierte el daño de contacto en tics:
// estar metido en un enjambre son 2 impactos por segundo, no 60.
const INVULNERABILIDAD = 0.5;

// EL RENACER: cuánto dura la desaparición y la vuelta al gastar una vida.
//
// Nueve décimas, partidas por la mitad: en la primera el personaje se encoge
// hasta desaparecer del todo, en la segunda vuelve a crecer desde nada. Y detrás
// siguen los i-frames de siempre hasta los dos segundos.
//
// Existe porque perder una vida PASABA DESAPERCIBIDO, que es lo peor que puede
// hacer el suceso más importante de una partida. Lo único que se veía era el
// parpadeo normal de invulnerabilidad —el mismo de cualquier roce— y un número
// que bajaba en una esquina de cuarenta píxeles. Te habías muerto y podías no
// enterarte.
//
// Desaparecer DEL TODO y no solo parpadear es la diferencia: un hueco donde
// estaba tu personaje obliga a mirar, porque de pronto no sabes dónde estás.
const RENACER = 0.9;
const PARPADEO = 0.07;     // periodo del destello mientras dura

// DESTELLO ROJO al recibir. Va ANTES del parpadeo de i-frames y no a la vez:
// durante estas dos décimas el sprite se ve entero y en rojo, y solo después
// empieza a intermitir. El parpadeo dice "ahora mismo no te pueden dar" —es
// información de estado— y el destello dice "acaban de darte", que es lo que
// hay que ver en el instante en que pasa; encadenados, cada uno cuenta lo suyo
// sin pisar al otro.
const DESTELLO_DANYO = 0.18;

// CUÁNTO SE QUEDA EL CUERPO EN EL SUELO tras el último fotograma de la
// animación de muerte antes de que lo sustituya el ataúd. Sin esta pausa el
// ataúd aparecía encima del cuerpo recién caído, en el mismo fotograma, y la
// caída no llegaba a leerse. Solo dibujo: la mecánica (reanimación, derrota)
// sigue arrancando en el instante de caer, como siempre.
const CUERPO_EN_EL_SUELO = 1.2;
// Y cuánto se queda en el suelo cuando lo que se ha perdido es UNA VIDA (Moneda
// de Caronte) y va a volver: menos, porque aquí no hay ataúd que esperar y la
// partida sigue con él dentro.
const CUERPO_EN_EL_SUELO_CARONTE = 0.4;

// A partir de esta fracción de la vida máxima, un golpe además CONGELA. Un
// arañazo de serpiente no puede parar el juego, y el mordisco que te deja a la
// mitad no puede pasar desapercibido: es la misma idea que VIDA_HITSTOP en el
// bestiario, pero medida en lo que te ha costado a TI.
const FRACCION_HITSTOP = 0.10;

// El azul frío del halo de recogida. Frío a propósito: todo lo que le pasa al
// jugador y es malo va en rojo, y lo que le entra va en el color de las gemas.
const COLOR_HALO_RECOGIDA = '#7ac4ff';

// Escudo del potenciador Égida (datos/potenciadores.js). Dos números, no uno:
// cuánto hay que aguantar SIN QUE TE TOQUEN para que empiece a rellenarse, y
// cuánto tarda entonces en llenarse del todo. La espera es lo que hace que el
// escudo premie salir del montón; sin ella sería vida máxima con otro nombre.
const ESPERA_ESCUDO = 6;
const RELLENO_ESCUDO = 4;

// --- Los cuatro objetos que van por reloj ------------------------------------
//
// Lo que dura o cuánto cura cada uno vive AQUÍ y no en datos/pasivos.js, porque
// lo que sube de nivel en los cuatro es cada cuántos segundos pasa, no cuánto
// pasa. Un objeto que mejorara las dos cosas a la vez sería dos objetos.

// Virgen Negra: lo que dura el instante de invulnerabilidad. Ocho décimas es
// poco más que los i-frames de un golpe (medio segundo), que es la referencia
// con la que ya está calibrado todo lo demás.
const DURACION_VIRGEN = 0.8;

// Bálsamo de Fierabrás: por debajo de qué fracción de vida salta, y qué
// fracción cura. Un tercio es mucho a propósito: es un trago, no un goteo, y
// tiene que sacarte de verdad o no se distingue de la Corona de laurel.
const UMBRAL_BALSAMO = 0.25;
const CURA_BALSAMO = 0.33;

// Diadema de Aliseda: segundos sin recibir un golpe hasta llegar al impulso
// máximo. Cinco es una oleada larga bien jugada.
const SUBIDA_DIADEMA = 5;

// El Grial de Alconetar: puntos de vida que reparte cada vez que suena. Poco a
// proposito —es un goteo de equipo, no una cura— y fijo, porque lo que sube de
// nivel es cada cuanto llega.
const CURA_GRIAL = 6;

export class Jugador {
  // `rng` es el de la partida, el mismo que llevan el bestiario y el director.
  // Se usa SOLO para el adorno de recibir golpes; se acepta que falte porque
  // nada de lo que decide se juega con él, y así el jugador sigue construyéndose
  // en las pantallas de selección, donde no hay partida ni azar que valga.
  // `meta` es el PROGRESO COMPRADO de quien lleva a este personaje: sus
  // potenciadores y el nivel de su mascota. Por defecto es el de esta máquina,
  // que es lo correcto jugando solo o en el sofá.
  //
  // EN RED NO PUEDE SER GLOBAL. Cada máquina simula a los DOS jugadores, y cada
  // uno trae las mejoras que se ha comprado en su propio hueco de partida.
  // Leyendo el progreso local para los dos, tu máquina daría a tu hermana tus
  // mejoras y la suya te daría las de ella: dos mundos distintos desde el
  // primer fotograma. Por eso el progreso de cada uno viaja en el saludo y
  // entra por aquí.
  constructor(idPersonaje = 'eric', idMascota = '', rng = null, meta = MetaProgreso) {
    this._meta = meta || MetaProgreso;
    // Qué mascota lleva ESTE jugador. Se fija al crearlo, con lo elegido en la
    // pantalla de mascotas, y no cambia durante la partida. Va antes que nada
    // porque recalcularStats() la lee ya en este constructor.
    this.mascotaId = idMascota;
    this._rng = rng;
    const def = PERSONAJES[idPersonaje] || PERSONAJES.eric;
    this.id = idPersonaje;
    // Enemigos que ha matado ESTE jugador. Se lleva aquí y no en el pool de
    // enemigos porque la pregunta es "cuántos ha matado él", y el sitio donde
    // eso vive sin índices que mantener es el propio jugador. Lo sube
    // `Enemigos.danyar` cuando el golpe que remata trae dueño.
    this.bajas = 0;
    // PUNTOS DE DAÑO QUE HA HECHO, contando todo: sus armas y el mordisco de su
    // mascota. Lo enseña el resumen final. Va aparte del recuento por arma
    // (ver `danyoHecho` en sistemas/armas.js) justamente por eso: el total del
    // jugador incluye lo que no sale de un arma, así que sumar la lista no da
    // este número y no debe darlo.
    this.danyoHecho = 0;
    // Muertes contadas para la Pira funeraria. Va aqui y no entre las
    // estadisticas derivadas a proposito: `recalcularStats` se llama en cada
    // subida de nivel y pondria la cuenta a cero, o sea que subir de nivel
    // apagaria la pira que estabas a punto de encender.
    this.bajasPira = 0;

    // LOS RELOJES DE LOS CUATRO PERIODICOS. Aqui y no entre las estadisticas
    // derivadas por lo mismo que la cuenta de la Pira: `recalcularStats` se
    // llama en cada subida de nivel y los pondria a cero, o sea que subir de
    // nivel reiniciaria la cuenta atras de todo lo que estaba a punto de pasar.
    this.relojInvulnerable = 0;
    this.relojBalsamo = 0;
    this.relojIman = 0;
    // Y el de la Diadema, que cuenta al reves: segundos SIN que te toquen. Lo
    // pone a cero `recibirDanyo`, que es donde de verdad se entera de que te
    // han dado.
    this.relojImpulso = 0;
    this.relojGrial = 0;
    this.relojLibro = 0;
    // El del Capa del Peregrino cuenta AL REVES que los otros: es lo que le
    // queda para volver a estar cargado, asi que empieza a cero -o sea,
    // cargado- y solo corre despues de comerse un golpe.
    this.relojManto = 0;
    // LO QUE APORTAN LOS DEMAS, sumado una vez por paso y no cada vez que se
    // pregunta: `danyoDe` lo lee en cada disparo de cada arma de cada jugador,
    // y recorrer el equipo ahi seria recorrerlo cientos de veces por segundo
    // para obtener siempre el mismo numero.
    this.auraEquipo = 0;
    // El equipo, para poder mirarlo. Lo enchufa quien crea al jugador, como los
    // recogibles: el jugador no importa la lista de jugadores.
    this.companyeros = null;
    this.def = def;
    this.personaje = def.sprite;
    this.arsenal = null;          // lo enchufa quien crea al jugador
    this.recogibles = null;       // idem: lo necesitan los Cencerros de San Antón
    this.enemigos = null;         // idem: lo necesita el Libro de las Sombras

    // --- Progresión ------------------------------------------------------
    this.nivel = 1;
    this.xp = 0;
    this.xpNecesaria = xpNecesaria(1);
    this.pasivos = {};            // id -> nivel
    this.rerolls = REROLLS;
    // Subida de nivel automática. Solo surte efecto con las ocho ranuras llenas
    // (ver Progresion.puedeAutomatizar); se enciende desde la ficha o desde el
    // propio menú de subida de nivel.
    this.autoNivel = false;
    // Lanzallamas prestado por un consumible: segundos que le quedan y su
    // propia recarga. Vive en el jugador y no en el arsenal porque no ocupa
    // ranura ni sube de nivel: es una ayuda temporal, no un arma.
    this.llamarada = 0;
    this.relojLlamarada = 0;

    this.x = 0; this.y = 0;
    this.xPrev = 0; this.yPrev = 0;
    this.xVista = 0; this.yVista = 0;

    // Estadísticas derivadas. NUNCA se escriben a mano: salen de la base, los
    // modificadores del personaje y los pasivos, y las recalcula recalcularStats.
    this.vidaMaxima = 0;
    this.velocidad = 0;
    this.armadura = 0;
    this.regeneracion = 0;
    this.radioRecogida = 0;
    this.bonusDanyo = 0;
    this.reduccionRecarga = 0;
    this.bonusArea = 0;
    this.recalcularStats();
    this.vida = this.vidaMaxima;
    this.radio = BASE.radio;
    // Cuerpo físico. Los cuatro personajes comparten marco de 32x32 lógicos y
    // sus siluetas miden 12-16 de ancho, así que el radio de daño (10) ya cubre
    // la silueta y no hay que derivarlo del sprite como en los enemigos. Que sea
    // el mismo para los cuatro es justo lo que pedía el plan: una única caja.
    this.radioCuerpo = BASE.radio;

    this.invulnerable = 0;         // segundos restantes de i-frames
    this.destello = 0;             // segundos que queda enrojecido tras el golpe
    this.brilloRecogida = 0;       // 0..1, halo mientras absorbe gemas
    this.abatido = false;
    // Segundos desde que cayó. Lleva la ANIMACIÓN DE MUERTE del personaje
    // (clip `morir` de `<personaje>Muerte`, si el atlas lo trae): al morir del
    // todo, seguida del ataúd; al perder una vida, seguida del renacer. Solo
    // dibujo — ver `dibujar`.
    this.relojMuerte = 0;
    // Segundos que le quedan TUMBADO tras gastar una Moneda de Caronte: la
    // animación de muerte entera más el rato en el suelo. Mientras dure no se
    // mueve ni dispara —está muerto, aunque vaya a volver— y ya es invulnerable.
    // Al llegar a cero arranca el RENACER de siempre.
    this.caidoCaronte = 0;
    // Flanco de "ya se han barrido sus armas de la pantalla al caer". Lo lleva
    // limpiarAtaquesDeCaidos() en main.js; se declara aquí y no se crea sobre la
    // marcha para que un jugador nazca siempre con los mismos campos, que es de
    // lo que depende el determinismo (ver core/determinismo.js).
    this._ataquesLimpiados = false;
    // Segundos que le quedan al RENACER: la desaparición y la vuelta al gastar
    // una vida. Solo dibujo — ver `dibujar` y RENACER en este mismo archivo.
    this.renacer = 0;
    this.inmortal = false;         // depuración: permite medir sin morir
    this.golpesRecibidos = 0;

    // Reanimación en cooperativo. 0..1: al llegar a 1 el jugador se levanta.
    // NO es un contador de segundos porque el ritmo al que sube depende de si
    // hay alguien cerca del ataúd — ver reanimar() en main.js.
    this.reanimacion = 0;

    // Escudo del potenciador Égida. `escudo` es lo que queda ahora mismo y
    // `relojEscudo` cuenta el tiempo desde el último golpe.
    this.escudo = this.escudoMax;
    this.relojEscudo = 0;
    // Vidas extra de la Moneda de Caronte ya gastadas. Va APARTE del techo
    // porque recalcularStats() rehace `resurreccionesMax` en cada subida de
    // nivel: si el contador de gastadas viviera ahí, subir de nivel devolvería
    // todas las vidas extra que ya se hubieran usado.
    this.resurreccionesUsadas = 0;

    this.mirandoDerecha = true;

    // RUMBO: la última dirección hacia la que se movió, unitaria y COMPLETA.
    //
    // `mirandoDerecha` solo guarda el eje horizontal, que es lo que necesita el
    // sprite —está dibujado de frente y solo se voltea—, pero las armas apuntan
    // en dos ejes. Al soltar el stick, quien apuntaba con el movimiento se
    // quedaba sin dato y caía a "izquierda o derecha según mire": si ibas hacia
    // arriba y parabas, el arma daba un volantazo a la horizontal.
    //
    // Un arma apunta hacia donde ENCARAS, y encarar no deja de ser cierto
    // porque hayas dejado de andar. Ver `golpear` y `conoCorto`.
    this.rumboX = 1;
    this.rumboY = 0;

    this.andando = false;
    this.lateral = false;    // se mueve más en horizontal que en vertical
    this.magAndar = 0;       // 0..1, cuánto se inclina el stick

    this.clip = CLIP_QUIETO;
    this.frame = 0;
    this.relojAnim = 0;
  }

  // Recalcula todo desde cero: base del plan, modificadores del personaje y
  // pasivos. Desde cero y no incremental a propósito — sumar sobre lo ya sumado
  // acumula errores de redondeo y hace imposible quitar un pasivo si algún día
  // hiciera falta.
  //
  // 'suma' añade tal cual (armadura, regeneración). 'factor' es porcentual
  // acumulativo sobre el valor ya modificado por el personaje.
  recalcularStats() {
    const mods = this.def.mods;
    const vidaAnterior = this.vidaMaxima;

    this.vidaMaxima = BASE.vidaMaxima * (mods.vidaMaxima || 1);
    this.velocidad = BASE.velocidad * (mods.velocidad || 1);
    this.radioRecogida = BASE.radioRecogida * (mods.radioRecogida || 1);
    this.armadura = BASE.armadura;
    this.regeneracion = BASE.regeneracion;
    this.bonusDanyo = 0;
    this.reduccionRecarga = 0;
    this.bonusArea = 0;
    // Techos que llenan los potenciadores permanentes. Se reinician aquí, como
    // todo lo demás, porque este método se vuelve a llamar en cada subida de
    // nivel y si no se acumularían sobre sí mismos.
    this.escudoMax = 0;
    this.resurreccionesMax = 0;
    this.bonusXp = 0;              // Plinio el Búho y la Musa

    // --- Bonos que NO son estadísticas del cuerpo -------------------------
    //
    // Los de arriba describen al personaje: cuánto aguanta, cuánto corre,
    // cuánto pega. Estos describen lo que hacen SUS ARMAS y lo que le pasa al
    // mundo, así que no se leen aquí sino allí donde toca —al lanzar un
    // proyectil, al crear una zona, al recibir un golpe—. Viven en el jugador
    // por el mismo motivo que `bonusArea`: es lo que lleva encima quien
    // dispara, y el arma es la misma para todos.
    //
    // Todos arrancan a cero y todos se rellenan por el mismo bucle de
    // `campo`/`tipo`/`valor` que ya usan pasivos, potenciadores y mascotas. No
    // hay mecanismo nuevo: hay campos nuevos.
    this.bonusAlcance = 0;         // Campana Milagrosa
    this.bonusVelProyectil = 0;    // Ala de Mercurio
    this.bonusDuracionZona = 0;    // Amuleto de azogue
    this.bonusPerforacion = 0;     // Asta del Escornao
    this.reduccionContacto = 0;    // Lagarto de Calzadilla
    this.bonusDenarios = 0;        // Becerro de Oro

    // --- Los que enganchan en un golpe ------------------------------------
    //
    // Estos no cambian un numero: se enteran de que ha pasado algo. Los tres
    // primeros viven en el camino del dano —el que se hace y el que se recibe—
    // y el ultimo en el calculo del dano de las armas.
    this.robaVida = 0;             // Sanguijuelas del Guadiana
    this.espinas = 0;              // Capa del erizo
    this.primerGolpeDoble = 0;     // Cruz del Gigante
    this.piraCada = 0;             // Pira funeraria
    this.furiaMoribundo = 0;       // Lagrima de la Mora

    // --- Los cuatro que van por reloj -------------------------------------
    //
    // Cada uno dice CADA CUANTOS SEGUNDOS pasa lo suyo, y el reloj que los
    // cuenta esta un poco mas abajo, fuera de las estadisticas derivadas.
    //
    // Cero = no lo llevas, y eso apaga el reloj entero: sin esa puerta habria
    // cuatro contadores corriendo en cada jugador y en cada paso para nada.
    this.invulnerableCada = 0;     // Virgen Negra
    this.balsamoCada = 0;          // Balsamo de Fierabras
    this.imanCada = 0;             // Cencerros de San Anton
    this.impulsoMax = 0;           // Diadema de Aliseda

    // --- Los cuatro de cooperativo ----------------------------------------
    //
    // Los unicos del juego que miran a los DEMAS. Jugando solo no salen
    // siquiera en el sorteo (ver `soloCooperativo` en datos/pasivos.js), asi
    // que aqui no hay que defenderse de que valgan cero: nadie los lleva.
    this.auraDanyo = 0;            // Sello Templario
    this.reparteVida = 0;          // Corona de Espinas
    this.grialCada = 0;            // El Grial de Alconetar
    this.perdon = 0;               // La Llave del Perdon

    // --- Los cinco de la tienda -------------------------------------------
    //
    // Potenciadores permanentes (denarios), no pasivos de partida. Los tres
    // primeros son campos como los de arriba; los dos ultimos son RANURAS, y
    // esos no los lee nadie aqui: los lee la progresion al repartir cartas y la
    // ficha al dibujar los huecos.
    this.mantoCada = 0;            // Capa del Peregrino
    this.bonusProyectiles = 0;     // Bellota de oro
    this.ultimoAliento = 0;        // Ultimo aliento
    this.maxArmas = MAX_ARMAS;     // Bandolera
    this.maxPasivos = MAX_PASIVOS; // Zurron

    // El Libro de las Sombras de Alburquerque. Cada cuantos segundos se pasa un
    // enemigo a tu bando; quien lo hace es el bestiario (`poseer`), que es
    // quien tiene la lista de bichos.
    this.libroCada = 0;

    // MASCOTA de ESTE jugador (datos/mascotas.js). Cada uno lleva la suya, y la
    // elige en la pantalla de mascotas; `mascotaId` lo pone main.js al crearlo.
    //
    // Las pasivas declaran `campo`/`tipo`/`valor` igual que un pasivo o un
    // potenciador, así que se aplican con el mismo bucle y no hacen falta ni un
    // campo ni un mecanismo nuevos. Van las PRIMERAS de las tres capas porque
    // es lo que llevas puesto antes de empezar, igual que los potenciadores.
    //
    // El valor se multiplica por lo que rinda su NIVEL: una mascota al 5 vale
    // el doble que recién comprada.
    const mascota = MASCOTAS[this.mascotaId];
    if (mascota && mascota.campo) {
      const factor = factorMascota(this._meta.nivelMascota(this.mascotaId));
      if (mascota.tipo === 'suma') this[mascota.campo] += mascota.valor * factor;
      else this[mascota.campo] *= (1 + mascota.valor * factor);
    }

    // Potenciadores permanentes (denarios, ver core/metaProgreso.js): la base
    // de la que arranca CUALQUIER personaje en CUALQUIER partida, así que se
    // aplican antes que los pasivos —los de esta partida— con el mismo
    // mecanismo exacto ('suma'/'factor' sobre `campo`).
    for (const id in this._meta.potenciadores) {
      const def = POTENCIADORES[id];
      if (!def) continue;
      const nivel = this._meta.potenciadores[id];
      if (def.tipo === 'suma') this[def.campo] += def.valor * nivel;
      else this[def.campo] *= (1 + def.valor * nivel);
    }

    for (const id in this.pasivos) {
      const def = PASIVOS[id];
      if (!def) continue;
      const nivel = this.pasivos[id];
      // TERCER TIPO: `escalon`, un valor que BAJA con el nivel hasta un suelo.
      //
      // Los otros dos suben —`suma` añade y `factor` multiplica— y eso vale
      // para todo lo que es "más": más vida, más daño, más área. La Pira
      // funeraria no: lo que dice su número es CADA CUÁNTAS muertes revienta
      // una, así que mejorarla es bajarlo. Forzarla a `suma` con valores
      // negativos habría funcionado y habría dejado un objeto cuya descripción
      // dice 25 y cuyo dato dice -2.
      if (def.tipo === 'escalon') {
        this[def.campo] = Math.max(def.suelo, def.valor + def.paso * (nivel - 1));
      } else if (def.tipo === 'suma') {
        this[def.campo] += def.valor * nivel;
      } else {
        this[def.campo] *= (1 + def.valor * nivel);
      }
    }

    // La recarga no puede llegar a cero por muchas clepsidras que se acumulen.
    if (this.reduccionRecarga > 0.7) this.reduccionRecarga = 0.7;

    // El escudo en curso no puede pasarse de su techo, pero tampoco se rellena
    // aquí: recalcularStats() se llama en cada subida de nivel, y regalar el
    // escudo entero en cada una lo convertiría en "sube de nivel para curarte".
    if (this.escudo > this.escudoMax) this.escudo = this.escudoMax;

    // Al ampliar la vida máxima se conserva lo que faltaba, no el porcentaje:
    // si te quedaban 20 de 100, te quedan 20 de 120, no 24.
    if (vidaAnterior > 0 && this.vidaMaxima > vidaAnterior && this.vida !== undefined) {
      // el ánfora cura aparte, en progresion.js
    }
  }

  // Experiencia. Puede subir VARIOS niveles de golpe con una gema dorada, y cada
  // subida encola su propia elección. La lógica en sí —solitario o barra
  // compartida en cooperativo— vive en Progresion, que es quien conoce al
  // resto de la partida; el jugador solo sabe pedir que le sumen XP.
  ganarXp(cantidad, jugadores) {
    if (this.abatido) return;
    Progresion.ganarXp(this, cantidad, jugadores);
  }

  // Una gema ha llegado. El halo NO es un efecto por gema: es UN número que
  // sube con cada una y baja solo, y por eso aguanta lo mismo una gema suelta
  // —un parpadeo— que el imán soltando seiscientas de golpe, que se convierte
  // en un resplandor sostenido mientras dura la lluvia. Un adorno por gema en
  // ese momento serían seiscientos efectos en dos segundos.
  absorberGema() {
    this.brilloRecogida = Math.min(1, this.brilloRecogida + 0.4);
  }

  // Reducción PLANA por armadura, nunca porcentual, pero con un mínimo de 1: si
  // la armadura pudiera anular el daño, un pasivo barato haría inmune al jugador
  // frente a las serpientes durante los 20 minutos.
  //
  // `dirX`/`dirY` es HACIA DÓNDE IBA EL GOLPE, igual que en danyar() del
  // bestiario: del que pega hacia ti. Sin normalizar, se normaliza aquí. Quien
  // no la sepa puede omitirla y el adorno sale redondo, que es lo correcto para
  // un daño que no viene de ninguna parte.
  //
  // TODO EL ADORNO DE RECIBIR VIVE AQUÍ, y no repartido por quien pega. Es el
  // único embudo por el que pasa cualquier daño al jugador —contacto, disparo,
  // sismo y charco—, así que ponerlo aquí garantiza que ninguna fuente nueva se
  // olvide de contarlo. La sacudida estaba en sistemas/colisiones.js y por eso
  // mismo la tenía SOLO el contacto: te podía matar un sismo sin que la pantalla
  // se moviera.
  recibirDanyo(cantidad, dirX = 0, dirY = 0) {
    if (this.abatido || this.invulnerable > 0 || this.inmortal) return false;

    // EL MANTO DEL PEREGRINO se come un golpe entero cada diez segundos.
    //
    // Va lo PRIMERO, antes de la armadura y del escudo: lo que para no es una
    // parte del golpe, es el golpe. Y devuelve `false` —como si no te hubieran
    // dado— asi que no gasta i-frames, no corta la recarga del escudo y no
    // borra la Diadema. Eso es lo que lo separa del escudo, que absorbe pero
    // deja el golpe existiendo para todo lo demas.
    //
    // Se lleva los i-frames por delante a proposito: sin ellos, pararte un
    // mordisco en medio de la horda te deja expuesto al siguiente en el mismo
    // fotograma, y el objeto no habria servido de nada.
    if (this.mantoCada > 0 && this.relojManto <= 0) {
      this.relojManto = this.mantoCada;
      this.invulnerable = INVULNERABILIDAD;
      this.brilloRecogida = 1;
      return false;
    }

    // EL LAGARTO DE CALZADILLA quita un PORCENTAJE, y la armadura una cantidad
    // fija. Por eso conviven sin ser lo mismo: contra la horda que pica de tres
    // en tres manda la armadura —tres menos dos es uno, casi nada— y contra el
    // mordisco de un jefe manda el porcentaje, que a cuarenta le quita ocho y a
    // tres no le quita ni uno.
    //
    // Va ANTES de la armadura porque es lo que hace la piel, no la coraza: la
    // escama amortigua el golpe y lo que llega después es lo que la placa
    // detiene. Al revés, con armadura alta, el porcentaje no tendría casi nada
    // sobre lo que morder.
    const entrada = this.reduccionContacto > 0
      ? cantidad * (1 - Math.min(0.8, this.reduccionContacto))
      : cantidad;
    let danyo = Math.max(1, entrada - this.armadura);

    // El ESCUDO se come el golpe antes que la vida, y cualquier impacto corta
    // su recarga. Es lo contrario que la armadura: la armadura quita una
    // cantidad fija a cada golpe y el escudo aguanta un total, así que una
    // sirve contra la horda que pica de tres en tres y el otro contra el
    // mordisco de un jefe.
    this.relojEscudo = 0;
    // Y la Diadema de Aliseda vuelve a cero: lo que premia es no comerse nada,
    // asi que un golpe le quita todo lo acumulado. Va aqui, con el reloj del
    // escudo, porque es la misma pregunta —cuanto llevas sin que te toquen— y
    // este es el unico sitio por donde pasa TODO el dano que recibe un jugador.
    this.relojImpulso = 0;
    if (this.escudo > 0) {
      const absorbido = Math.min(this.escudo, danyo);
      this.escudo -= absorbido;
      danyo -= absorbido;
    }

    this.vida -= danyo;

    // LA CORONA DE ESPINAS: lo que te quitan, lo ganan ellos.
    //
    // Es el objeto del que aguanta. No te protege de nada —el golpe entra
    // igual— pero convierte tu vida en la de los demas, asi que lo lleva quien
    // se pone delante. En una partida de cuatro, con uno abriendo y tres
    // detras, es lo mas cerca que tiene el juego de un tanque.
    //
    // Reparte a CADA uno, no entre todos: si se dividiera, el objeto valdria
    // menos cuanta mas gente hubiera, que es al reves de lo que tiene que pasar
    // en un objeto de cooperativo.
    if (this.reparteVida > 0 && danyo > 0 && this.companyeros) {
      const cura = danyo * this.reparteVida;
      for (let i = 0; i < this.companyeros.length; i++) {
        const o = this.companyeros[i];
        if (o === this || o.abatido || o.vida >= o.vidaMaxima) continue;
        o.vida = Math.min(o.vidaMaxima, o.vida + cura);
      }
    }

    this.invulnerable = INVULNERABILIDAD;
    this.destello = DESTELLO_DANYO;
    this.golpesRecibidos++;
    GestorAudio.danyoJugador();
    // El PARÓN del golpe se lo cede al de caer cuando el golpe es el último:
    // VFX.congelar raciona a uno cada 0.6s, así que si el mordisco que te mata
    // se lleva el suyo, la caída —que es lo único que hay que notar de verdad—
    // se quedaría sin él.
    this._acusarGolpe(danyo, dirX, dirY, this.vida <= 0);
    if (this.vida <= 0) {
      this.vida = 0;
      // Moneda de Caronte: si queda alguna vida extra se gasta y se vuelve en
      // el sitio, sin ataúd y sin esperar a nadie. Va ANTES de darse por
      // abatido a propósito: en cooperativo, gastar la moneda es mejor que
      // hacer que un compañero cruce media pantalla a levantarte.
      if (this.resurreccionesUsadas < this.resurreccionesMax) {
        this.resurreccionesUsadas++;
        this.levantar();
        // Y la puesta en escena: LA MISMA MUERTE QUE SI FUERA LA DEFINITIVA
        // —golpe, caída, cuerpo en el suelo— y después desaparece y vuelve.
        // Perder una vida tiene que verse como morir, porque es lo que ha
        // pasado; lo que cambia es lo que viene detrás: el renacer en vez del
        // ataúd. La invulnerabilidad que deja `levantar` (INVULNERABILIDAD * 4)
        // se alarga lo que dure el cuerpo en el suelo, para que a salvo lo esté
        // durante toda la puesta en escena y un rato más, como antes.
        this.relojMuerte = 0;
        this.caidoCaronte = this._duracionMuerte(CUERPO_EN_EL_SUELO_CARONTE);
        this.invulnerable += this.caidoCaronte;
        this.renacer = RENACER;
        // Levantarse apaga el destello —quien sale del ataúd sale entero— y
        // aquí no se ha salido de ningún ataúd: el golpe ha existido y tiene
        // que verse.
        this.destello = DESTELLO_DANYO;
        // Se ha muerto y ha vuelto: el parón y la pantalla en rojo son lo que
        // dice que acaba de gastarse una moneda. Sin esto, la Moneda de Caronte
        // es el único objeto del juego cuyo efecto no se ve al usarse.
        VFX.congelar(0.10, true);
        VFX.herir(1);
      } else {
        this.abatido = true;
        this.reanimacion = 0;
        this.relojMuerte = 0;
        // ÚLTIMO ALIENTO: al caer, lo que te quedaba se lo dejas a los que
        // siguen en pie. Es el único objeto del juego que solo sirve cuando has
        // fallado, y por eso se compra: no cambia cómo juegas, cambia lo que
        // vale tu muerte.
        if (this.ultimoAliento > 0 && this.companyeros) {
          for (let i = 0; i < this.companyeros.length; i++) {
            const o = this.companyeros[i];
            if (o === this || o.abatido || o.vida >= o.vidaMaxima) continue;
            o.vida = Math.min(o.vidaMaxima, o.vida + o.vidaMaxima * this.ultimoAliento);
            o.brilloRecogida = 1;
          }
        }
        this._acusarCaida(dirX, dirY);
      }
    }
    return true;
  }

  // El adorno de UN GOLPE. Cuatro cosas, y las cuatro a la medida de lo que te
  // ha quitado en proporción a tu vida máxima, no en puntos: doce de daño es un
  // roce para Eric y un tercio de la barra para Lucy, y tienen que sentirse como
  // lo que son. Es el mismo criterio que usa el bestiario con la vida del que
  // cae (ver danyar en entidades/enemigo.js).
  _acusarGolpe(danyo, dirX, dirY, mortal) {
    const frac = this.vidaMaxima > 0 ? Math.min(1, danyo / this.vidaMaxima) : 0;
    const rng = this._rng;

    // 1. SANGRE hacia donde iba el golpe, saliendo del pecho y no de los pies.
    // Cono ancho, como la muerte de un enemigo: es un cuerpo reventando, no una
    // chispa de choque contra metal.
    if (rng && !Particulas.saturado()) {
      const v = hipot(dirX, dirY);
      const n = 4 + Math.round(frac * 8);
      if (v > 0.0001) {
        Particulas.chorro(this.x, this.y - 12, dirX / v, dirY / v,
                          n, 80, 1.15, 0.4, 1.5, COLOR_SANGRE, 1, rng);
      } else {
        // Sin dirección —un sismo bajo los pies, un charco— sale redondo, que
        // es justo lo que cuenta la verdad: eso no venía de ningún sitio.
        Particulas.estallido(this.x, this.y - 12, n, 70, 0.4, 1.5,
                             COLOR_SANGRE, 1, rng);
      }
    }

    // 2. LA MARCA DEL GOLPE, que no pasa por el racionamiento de las partículas
    // y por tanto se ve también en la matanza del minuto 16, que es justo cuando
    // el pool está lleno y cuando más falta hace enterarse de que te están
    // dando. Ver VFX.impacto.
    VFX.impacto(this.x, this.y - 12, dirX, dirY, danyo);

    // 3. LA SACUDIDA, con un suelo que garantiza que hasta el roce más tonto se
    // note en la pantalla: recibir nunca puede ser silencioso.
    VFX.sacudir(1.6 + frac * 9);

    // 4. Y el borde rojo. Ver VFX.herir.
    VFX.herir(0.35 + frac * 0.9);

    // El PARÓN solo para los golpes gordos. VFX.congelar tiene además su propio
    // racionamiento, así que cuatro mordiscos seguidos no encadenan cuatro
    // frenazos.
    if (!mortal && frac >= FRACCION_HITSTOP) {
      VFX.congelar(0.05 + Math.min(0.06, frac * 0.2));
    }
  }

  // Y el adorno de CAER, que es otra cosa: no es el golpe más fuerte de la
  // partida, es el único que cambia el estado de la partida. Se le da el peso
  // que hasta ahora solo tenía la muerte de un jefe.
  _acusarCaida(dirX, dirY) {
    VFX.congelar(0.14, true);      // forzado: caer pasa una vez, ver VFX.congelar
    VFX.sacudir(7);
    VFX.herir(1);
    const rng = this._rng;
    if (!rng) return;
    // Aquí NO se consulta `saturado`: caer pasa una vez y con la pantalla llena
    // de bichos es justo cuando pasa. Si el pool no tiene sitio se perderán
    // algunas, y eso ya lo resuelve el propio pool sin ayuda.
    Particulas.estallido(this.x, this.y - 12, 16, 95, 0.55, 2,
                         COLOR_SANGRE, 1, rng);
    Particulas.estallido(this.x, this.y - 2, 8, 45, 0.5, 1.5,
                         COLOR_POLVO, 0.35, rng);
  }

  // Se levanta tras la cuenta de reanimación. A MEDIA VIDA y con los i-frames
  // puestos: a vida llena, dejarse caer sería una forma barata de curarse, y
  // sin invulnerabilidad se volvería a caer en el mismo frame, porque uno cae
  // justo donde estaba rodeado.
  levantar() {
    this.abatido = false;
    this.reanimacion = 0;
    this.relojMuerte = 0;
    this.caidoCaronte = 0;
    this.destello = 0;
    this.vida = Math.max(1, Math.round(this.vidaMaxima * 0.5));
    this.invulnerable = INVULNERABILIDAD * 4;
    // Se vuelve con el escudo entero: si volvieras con él a cero, los seis
    // segundos de espera empezarían justo cuando más falta hace.
    this.escudo = this.escudoMax;
    this.relojEscudo = 0;
  }

  reiniciar() {
    this.recalcularStats();
    this.vida = this.vidaMaxima;
    this.invulnerable = 0;
    this.renacer = 0;
    this.destello = 0;
    this.abatido = false;
    this.reanimacion = 0;
    this.relojMuerte = 0;
    this.caidoCaronte = 0;
    this.golpesRecibidos = 0;
    this.escudo = this.escudoMax;
    this.relojEscudo = 0;
    this.relojInvulnerable = 0;
    this.relojBalsamo = 0;
    this.relojIman = 0;
    this.relojImpulso = 0;
    this.relojGrial = 0;
    this.relojManto = 0;
    this.relojLibro = 0;
    this.bajasPira = 0;
    this.resurreccionesUsadas = 0;
  }

  actualizar(dt, entrada) {
    this.xPrev = this.x;
    this.yPrev = this.y;

    // El RENACER espera a que el cuerpo haya terminado de morir: primero la
    // caída, luego el hundirse y volver.
    if (this.caidoCaronte > 0) {
      this.caidoCaronte -= dt;
      if (this.caidoCaronte < 0) this.caidoCaronte = 0;
    } else if (this.renacer > 0) {
      this.renacer -= dt;
      if (this.renacer < 0) this.renacer = 0;
    }
    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      if (this.invulnerable < 0) this.invulnerable = 0;
    }
    // Antes del corte por abatido: quien acaba de caer tiene el destello puesto,
    // y si no corriera aquí se quedaría encendido hasta que se levantara.
    if (this.destello > 0) {
      this.destello -= dt;
      if (this.destello < 0) this.destello = 0;
    }
    if (this.brilloRecogida > 0) {
      this.brilloRecogida = Math.max(0, this.brilloRecogida - dt * 3.2);
    }
    if (this.abatido || this.caidoCaronte > 0) {
      this.andando = false;
      this.relojMuerte += dt;
      return;
    }

    // Regeneración de la corona de laurel. Goteo continuo, no por tics: a 0.2/s
    // un tic entero cada segundo se notaría como un parpadeo en la barra.
    if (this.regeneracion > 0 && this.vida < this.vidaMaxima) {
      this.vida = Math.min(this.vidaMaxima, this.vida + this.regeneracion * dt);
    }

    // Recarga del escudo. Solo tras ESPERA_ESCUDO segundos sin recibir ni un
    // golpe, y luego progresiva. La espera es lo que hace que el escudo premie
    // salir del montón en vez de quedarse dentro: si se rellenara al momento
    // sería vida máxima disfrazada.
    if (this.escudoMax > 0) {
      this.relojEscudo += dt;
      if (this.relojEscudo >= ESPERA_ESCUDO && this.escudo < this.escudoMax) {
        this.escudo = Math.min(this.escudoMax,
                               this.escudo + this.escudoMax * dt / RELLENO_ESCUDO);
      }
    }

    // --- Los cuatro que van por reloj --------------------------------------
    //
    // Los tres primeros disparan cada X segundos y el cuarto se acumula. Van
    // DESPUÉS del corte por abatido de más arriba, a propósito: un caído no se
    // cura solo, ni se vuelve invulnerable, ni llama a las gemas. Lo único que
    // le pasa mientras está en el suelo es que le reaniman.

    // LA VIRGEN NEGRA. Un instante de invulnerabilidad cada X segundos, y
    // llegue cuando llegue: no espera a que te vayan a dar. Suena raro dicho
    // así, pero en una pantalla llena, ocho décimas de cada diez segundos son
    // un 8% del daño de contacto que no te entra, y encima se VE —el mismo
    // parpadeo que tras un golpe—, que es lo que la convierte en un objeto y no
    // en un número escondido.
    if (this.invulnerableCada > 0) {
      this.relojInvulnerable += dt;
      if (this.relojInvulnerable >= this.invulnerableCada) {
        this.relojInvulnerable = 0;
        if (this.invulnerable < DURACION_VIRGEN) this.invulnerable = DURACION_VIRGEN;
      }
    }

    // EL BÁLSAMO DE FIERABRÁS. El trago que te saca de una: cura de golpe al
    // bajar del umbral, y hasta que no pasan sus segundos no vuelve a haber.
    //
    // Cura una FRACCIÓN de tu vida máxima y no una cantidad fija, así que
    // acompaña al personaje que lo lleva: en Julie, que tiene un 20% más de
    // vida, cura un 20% más. Y solo salta por debajo del umbral — beberse el
    // frasco con la vida casi llena sería tirarlo.
    if (this.balsamoCada > 0) {
      if (this.relojBalsamo > 0) {
        this.relojBalsamo -= dt;
        if (this.relojBalsamo < 0) this.relojBalsamo = 0;
      } else if (this.vida > 0 && this.vida < this.vidaMaxima * UMBRAL_BALSAMO) {
        this.vida = Math.min(this.vidaMaxima, this.vida + this.vidaMaxima * CURA_BALSAMO);
        this.relojBalsamo = this.balsamoCada;
        this.brilloRecogida = 1;
      }
    }

    // LOS CENCERROS DE SAN ANTÓN. Cada X segundos suenan y todas las gemas del
    // mapa vienen solas, que es exactamente lo que hace el imán consumible.
    //
    // Quien las atrae es `Recogibles`, y el jugador no lo conoce: se le enchufa
    // desde fuera (`recogibles`), igual que al bestiario se le enchufan los
    // cofres. Sin él, esto no hace nada y no rompe nada.
    if (this.imanCada > 0 && this.recogibles) {
      this.relojIman += dt;
      if (this.relojIman >= this.imanCada) {
        this.relojIman = 0;
        this.recogibles.atraerTodas(this);
        this.brilloRecogida = 1;
      }
    }

    // El Capa del Peregrino, recargándose. Cuenta hacia abajo y a cero está
    // listo, que es lo contrario de los otros tres relojes — y a propósito: lo
    // normal es tenerlo puesto, no esperándolo.
    if (this.relojManto > 0) {
      this.relojManto -= dt;
      if (this.relojManto < 0) this.relojManto = 0;
    }

    // EL LIBRO DE LAS SOMBRAS DE ALBURQUERQUE. Cada X segundos, un enemigo al
    // azar se pasa a tu bando: deja de perseguirte, camina hacia los suyos con
    // un aura verde y a los cinco segundos revienta.
    //
    // Quien lo hace es el bestiario, que es quien tiene la lista de bichos —el
    // jugador solo lleva el reloj—. Y se le enchufa desde fuera, como los
    // recogibles: aquí no se importa a nadie.
    if (this.libroCada > 0 && this.enemigos) {
      this.relojLibro += dt;
      if (this.relojLibro >= this.libroCada) {
        this.relojLibro = 0;
        this.enemigos.poseer(this);
      }
    }

    // EL SELLO DE LOS CABALLEROS DE MAGACELA. Lo que aportan los demas, sumado
    // aqui una vez y leido despues por `danyoDe` en cada disparo.
    //
    // Suma el de LOS OTROS y no el propio: quien lo lleva reparte, no se lo
    // queda. Con dos llevandolo, cada uno recibe el del otro — se acumulan sin
    // que nadie se multiplique por si mismo.
    if (this.companyeros) {
      let aura = 0;
      for (let i = 0; i < this.companyeros.length; i++) {
        const o = this.companyeros[i];
        if (o !== this && !o.abatido) aura += o.auraDanyo;
      }
      this.auraEquipo = aura;
    }

    // EL GRIAL DE ALCONETAR. Cada X segundos cura un poco a TODOS, incluido
    // quien lo lleva. Es el goteo del equipo: no salva a nadie de un golpe, pero
    // en veinte minutos son cientos de puntos repartidos.
    if (this.grialCada > 0 && this.companyeros) {
      this.relojGrial += dt;
      if (this.relojGrial >= this.grialCada) {
        this.relojGrial = 0;
        for (let i = 0; i < this.companyeros.length; i++) {
          const o = this.companyeros[i];
          // A los caidos tampoco: en el suelo no se cura nadie, se reanima.
          if (o.abatido || o.vida >= o.vidaMaxima) continue;
          o.vida = Math.min(o.vidaMaxima, o.vida + CURA_GRIAL);
          o.brilloRecogida = 1;
        }
      }
    }

    // LA DIADEMA DE ALISEDA. Velocidad que se acumula mientras no te toquen y
    // que un solo golpe devuelve a cero (ver `recibirDanyo`).
    //
    // Es el tercer objeto de velocidad del juego y el único que no es un
    // porcentaje plano: las Sandalias y Premura te hacen rápido siempre, y esta
    // te hace rápido si juegas bien. Tarda SUBIDA_DIADEMA segundos en llenarse,
    // lo bastante como para que salir ileso de un apuro se note y lo bastante
    // poco como para recuperarla dentro de la misma oleada.
    let velocidad = this.velocidad;
    if (this.impulsoMax > 0) {
      this.relojImpulso += dt;
      const lleno = Math.min(1, this.relojImpulso / SUBIDA_DIADEMA);
      velocidad *= 1 + this.impulsoMax * lleno;
    }

    const vx = entrada.ejeX * velocidad;
    const vy = entrada.ejeY * velocidad;
    this.x += vx * dt;
    this.y += vy * dt;

    const mag = hipot(entrada.ejeX, entrada.ejeY);
    this.andando = mag > 0.02;
    this.magAndar = Math.min(1, mag);
    if (this.andando) {
      // Manda el eje dominante. El sprite está dibujado de frente, así que
      // moverse en horizontal es justo lo que peor se lee: hay un clip aparte
      // con el cuerpo escorado hacia donde va.
      this.lateral = Math.abs(entrada.ejeX) > Math.abs(entrada.ejeY);
      if (entrada.ejeX > 0.05) this.mirandoDerecha = true;
      else if (entrada.ejeX < -0.05) this.mirandoDerecha = false;
      // El rumbo se refresca mientras haya stick y NO se borra al soltarlo:
      // ese es todo el arreglo. Se guarda normalizado para que quien apunte no
      // tenga que volver a dividir.
      if (mag > 0.0001) {
        this.rumboX = entrada.ejeX / mag;
        this.rumboY = entrada.ejeY / mag;
      }
    }
    this._animar(dt);
  }

  // Avanza el clip que toca. La cadencia del paso sigue al stick: andando
  // despacio, los pasos salen más lentos, que es lo que espera la mano.
  _animar(dt) {
    const meta = Recursos.meta(this.personaje);
    const clips = meta && meta.clips;
    if (!clips) return;

    let nombre = CLIP_QUIETO;
    if (this.andando) {
      nombre = this.lateral && clips[CLIP_LATERAL] ? CLIP_LATERAL : CLIP_ANDAR;
    }
    if (nombre !== this.clip) {
      // Al cambiar de frontal a lateral NO se reinicia el fotograma: los dos
      // ciclos tienen la misma longitud y la misma fase, así que conservarlo
      // hace que girar en marcha no dé un tirón en el paso.
      const mismoCiclo = this.clip !== CLIP_QUIETO && nombre !== CLIP_QUIETO;
      this.clip = nombre;
      if (!mismoCiclo) { this.frame = 0; this.relojAnim = 0; }
    }
    const clip = clips[nombre];
    if (!clip || clip.n <= 1) { this.frame = 0; return; }

    const fps = this.andando ? clip.fps * this.magAndar : clip.fps;
    if (fps <= 0) return;
    const paso = 1 / fps;
    this.relojAnim += dt;
    while (this.relojAnim >= paso) {
      this.relojAnim -= paso;
      this.frame = (this.frame + 1) % clip.n;
    }
  }

  interpolar(alpha) {
    this.xVista = this.xPrev + (this.x - this.xPrev) * alpha;
    this.yVista = this.yPrev + (this.y - this.yPrev) * alpha;
  }

  // ¿Está en el suelo, sea para siempre o por una moneda? Es lo que main.js
  // mira para no dejarle disparar: `abatido` solo cubre la muerte definitiva.
  get caido() { return this.abatido || this.caidoCaronte > 0; }

  // Cuánto dura la muerte dibujada: el clip `morir` de su hoja más el rato en
  // el suelo que se pida. Cero si el héroe no tiene hoja, y entonces no hay
  // nada que esperar: al ataúd o al renacer directamente, como siempre.
  _duracionMuerte(enElSuelo) {
    const meta = Recursos.meta(this.personaje + 'Muerte');
    const clip = meta && meta.clips && meta.clips.morir;
    return clip ? clip.n / clip.fps + enElSuelo : 0;
  }

  // El fotograma de la muerte que toca ahora, dibujado a los pies. Devuelve
  // false si no hay hoja o no se ha podido dibujar, para que quien llama ponga
  // lo que va después (ataúd o sprite normal).
  _dibujarMuerte(ctx, axF, ayF) {
    const idMuerte = this.personaje + 'Muerte';
    const metaMuerte = Recursos.meta(idMuerte);
    const clipMorir = metaMuerte && metaMuerte.clips && metaMuerte.clips.morir;
    if (!clipMorir) return false;
    const imgMuerte = this.mirandoDerecha ? Recursos.imagen(idMuerte)
                                          : Recursos.espejo(idMuerte);
    if (!imgMuerte) return false;
    const f = Math.min(clipMorir.n - 1, (this.relojMuerte * clipMorir.fps) | 0);
    const indice = clipMorir.desde + f;
    ctx.drawImage(imgMuerte,
      indice * metaMuerte.w, 0, metaMuerte.w, metaMuerte.h,
      (axF - metaMuerte.anclaX) / ESCALA_ARTE, (ayF - metaMuerte.anclaY) / ESCALA_ARTE,
      metaMuerte.w / ESCALA_ARTE, metaMuerte.h / ESCALA_ARTE);
    return true;
  }

  // Cuánto queda para levantarse, en un arco a los pies del caído. Va en el
  // MUNDO y no en el panel de la esquina a propósito: lo que hay que decidir
  // mirándolo es si te da tiempo a llegar hasta ahí, y eso se decide mirando
  // el sitio, no una esquina de la pantalla. Solo aparece si el contador ha
  // arrancado, así que en solitario —donde no hay reanimación— no sale nada.
  // Se dibuja igual sobre el cuerpo cayendo que sobre el ataúd: el compañero
  // que viene corriendo no tiene por qué esperar a que aparezca la caja.
  _dibujarReanimacion(ctx, axF, ayF) {
    if (this.reanimacion <= 0) return;
    const cx = axF / ESCALA_ARTE;
    const cy = ayF / ESCALA_ARTE - 2;
    const r = 9;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(8,7,10,.65)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#e8c23a';
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, this.reanimacion));
    ctx.stroke();
    ctx.restore();
  }

  // Un drawImage y nada más: el fotograma que toca de la hoja.
  //
  // El volteo sale de la copia espejada precacheada, igual que en los enemigos,
  // y esa copia está volteada fotograma a fotograma para que la animación no
  // corra del revés al mirar a la izquierda.
  //
  // El ancla es el centro de los pies. Todo se cuadra a píxel FÍSICO entero:
  // con el suavizado apagado, un destino fraccionario hace que el vecino más
  // próximo elija filas distintas cada frame y el sprite hierva.
  dibujar(ctx) {
    // CAÍDO: en su sitio va su ATAÚD, no el personaje tumbado ni el personaje
    // de pie como hasta ahora. Cada uno tiene el suyo y cuenta quién iba
    // dentro —el del Atleti, el del hámster, el del capibara, el de la
    // katana—, que en cooperativo es lo que dice a quién hay que ir a levantar
    // sin leer un nombre desde el otro lado de la pantalla.
    //
    // Se dibuja SIN parpadeo de i-frames y sin espejo: un ataúd no mira a
    // ningún lado y no está recibiendo golpes.
    if (this.abatido) {
      // SIN ATAÚD DIBUJADO SE SIGUE ADELANTE: si al atlas le faltara el de un
      // héroe se perdería el dibujo, no la mecánica. Antes se salía aquí mismo
      // y salirse se llevaba por delante también el reloj de la reanimación de
      // más abajo. (Hoy los ocho tienen el suyo; el sarcófago genérico que
      // tapaba el hueco de los cuatro de pago se retiró el 21/09/2026.)
      const axF = Math.round(this.xVista * ESCALA_ARTE);
      const ayF = Math.round(this.yVista * ESCALA_ARTE);

      // ANTES DEL ATAÚD, LA CAÍDA. Si el héroe tiene hoja de muerte
      // (`<personaje>Muerte`, dibujada por Sergio para los ocho), se
      // reproduce una vez su clip `morir` —el golpe, la caída, el cuerpo en el
      // suelo— y el último fotograma se queda un rato antes de que lo releve
      // el ataúd. Mira hacia donde miraba al caer: la hoja es frontal y la
      // copia espejada de Recursos vale igual que para andar.
      if (this.relojMuerte < this._duracionMuerte(CUERPO_EN_EL_SUELO) &&
          this._dibujarMuerte(ctx, axF, ayF)) {
        this._dibujarReanimacion(ctx, axF, ayF);
        return;
      }

      const metaAtaud = Recursos.meta(this.personaje + 'Ataud');
      const imgAtaud = Recursos.imagen(this.personaje + 'Ataud');
      if (metaAtaud && imgAtaud) {
        ctx.drawImage(imgAtaud,
          0, 0, metaAtaud.w, metaAtaud.h,
          (axF - (metaAtaud.w >> 1)) / ESCALA_ARTE, (ayF - metaAtaud.h) / ESCALA_ARTE,
          metaAtaud.w / ESCALA_ARTE, metaAtaud.h / ESCALA_ARTE);
      }

      this._dibujarReanimacion(ctx, axF, ayF);
      return;
    }

    // DOS HOJAS POR PERSONAJE SI EL ATLAS LAS TRAE: `<id>` mira a la derecha y
    // `<id>Izq` a la izquierda.
    //
    // Es mejor que espejar por código en cuanto el arte NO es simétrico: un
    // arma colgada de una cadera, la raya del pelo, una cicatriz. El espejo se
    // las cambia de lado cada vez que giras, y eso se nota más de lo que
    // parece porque girar es lo que más se hace en este juego.
    //
    // Si no hay hoja izquierda se sigue usando la copia espejada precacheada,
    // así que el arte antiguo y los placeholders siguen funcionando sin tocar
    // nada. Las dos hojas deben declarar los MISMOS clips: el reloj de
    // animación es uno solo y no se reinicia al girar.
    // HALO DE RECOGIDA, debajo del sprite. La gema desaparecía al tocarte y no
    // pasaba nada más: la experiencia entraba en un contador de la esquina y el
    // sitio donde ocurría —tú— se quedaba mudo. Aquí no se dibuja el premio sino
    // el hecho de estar recibiéndolo, que es lo que hace que valga la pena
    // meterse en un campo de gemas.
    //
    // Suma luz en vez de taparlo, así que sobre el suelo oscuro se lee como un
    // resplandor y no como un disco pegado a los pies.
    if (this.brilloRecogida > 0) {
      const b = this.brilloRecogida;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = b * 0.5;
      ctx.fillStyle = COLOR_HALO_RECOGIDA;
      ctx.beginPath();
      ctx.arc(this.xVista, this.yVista - 10, 7 + b * 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // DESTELLO ROJO: la hoja teñida que dejó preparada Recursos antes del primer
    // frame. Se elige exactamente igual que la normal —hoja izquierda propia si
    // la hay, copia espejada si no— porque son las mismas hojas pasadas por el
    // mismo tinte; si faltara alguna, `img` se queda con la de siempre y lo
    // único que se pierde es el color.
    const herido = this.destello > 0;

    let meta = Recursos.meta(this.personaje);
    let img;
    if (this.mirandoDerecha) {
      img = herido ? Recursos.tinteDanyo(this.personaje) : null;
      if (!img) img = Recursos.imagen(this.personaje);
    } else {
      const idIzq = this.personaje + 'Izq';
      const metaIzq = Recursos.meta(idIzq);
      if (metaIzq) {
        meta = metaIzq;
        img = herido ? Recursos.tinteDanyo(idIzq) : null;
        if (!img) img = Recursos.imagen(idIzq);
      } else {
        img = herido ? Recursos.tinteDanyoEspejo(this.personaje) : null;
        if (!img) img = Recursos.espejo(this.personaje);
      }
    }
    if (!meta || !img) return;

    // MONEDA DE CARONTE, primer tiempo: la misma muerte que la definitiva, y
    // SIN el parpadeo de i-frames de abajo —un cuerpo en el suelo que
    // intermite parece un fallo, y ya se ve que no le pueden dar—. El renacer
    // no arranca hasta que esto acaba (ver `actualizar`).
    if (this.caidoCaronte > 0) {
      const cxM = Math.round(this.xVista * ESCALA_ARTE);
      const cyM = Math.round(this.yVista * ESCALA_ARTE);
      if (this._dibujarMuerte(ctx, cxM, cyM)) return;
    }

    // Parpadeo de los i-frames. Se salta el sprite, no la barra de vida: durante
    // medio segundo hay que poder seguir leyendo cuánta queda.
    //
    // NO PARPADEA MIENTRAS DURA EL DESTELLO: los dos avisos van seguidos, no
    // superpuestos. Un sprite rojo que además se salta fotogramas se lee como un
    // fallo de dibujado, y el destello es justo lo que hay que ver entero.
    if (!herido && this.invulnerable > 0 &&
        (((this.invulnerable / PARPADEO) | 0) & 1) === 1) return;

    const clip = meta.clips && meta.clips[this.clip];
    const indice = clip ? clip.desde + this.frame : 0;

    const cxF = Math.round(this.xVista * ESCALA_ARTE);
    const cyF = Math.round(this.yVista * ESCALA_ARTE);

    const anchoLog = meta.w / ESCALA_ARTE;
    const altoLog = meta.h / ESCALA_ARTE;

    // --- EL RENACER: se va y vuelve ----------------------------------------
    //
    // La mitad de la animación se encoge hasta nada y la otra mitad crece desde
    // nada. Se escala desde LOS PIES, no desde el centro: un personaje que
    // encoge hacia su ombligo flota; encogiendo hacia el suelo se lee como que
    // se hunde y vuelve a salir, que es lo que cuenta lo que ha pasado.
    //
    // En el fondo del valle no se dibuja NADA durante unos fotogramas, y ese
    // hueco es justo el aviso: el ojo va a buscar dónde estás.
    if (this.renacer > 0) {
      const u = 1 - this.renacer / RENACER;       // 0 al empezar, 1 al acabar
      // Triángulo: 1 -> 0 -> 1, con el valle en la mitad.
      const k = Math.abs(u - 0.5) * 2;
      if (k < 0.06) return;                       // el instante en que no está
      ctx.save();
      ctx.globalAlpha = k;
      const w = anchoLog * k, h = altoLog * k;
      ctx.drawImage(img,
        indice * meta.w, 0, meta.w, meta.h,
        cxF / ESCALA_ARTE - w / 2, cyF / ESCALA_ARTE - h, w, h);
      ctx.restore();
      return;
    }

    ctx.drawImage(img,
      indice * meta.w, 0, meta.w, meta.h,
      (cxF - (meta.w >> 1)) / ESCALA_ARTE, (cyF - meta.h) / ESCALA_ARTE,
      anchoLog, altoLog);
  }


}
