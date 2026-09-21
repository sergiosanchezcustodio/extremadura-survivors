import {
  ANCHO_LOGICO, ALTO_LOGICO, ANCHO_FISICO, ALTO_FISICO, ANCHO_UI, ALTO_UI,
  ESCALA_ARTE, TILE, DT
} from './core/constantes.js';
import { Bucle } from './core/bucle.js';
import { Entrada } from './core/entrada.js';
import { Camara } from './core/camara.js';
import { Recursos } from './core/recursos.js';
import { MetaProgreso, metaAjena } from './core/metaProgreso.js';
import * as Nube from './core/nube.js';
import * as Progreso from './core/progresoPortable.js';
import { crearRng, hash2 } from './core/rng.js';
import { crearProbador, huellaMotor } from './core/determinismo.js';
import { sen, cos, hipot } from './core/mate.js';
import { Jugador } from './entidades/jugador.js';
import { Enemigos, prepararVariantes } from './entidades/enemigo.js';
import { Proyectiles } from './entidades/proyectil.js';
import { Armas, reiniciarSellosOrbitales } from './sistemas/armas.js';
import { Particulas, COLOR_CHISPA } from './sistemas/particulas.js';
import { VFX } from './sistemas/vfx.js';
import { GestorAudio } from './sistemas/audio.js';
import {
  separacion, contactoJugadores, impactosProyectiles, separarJugadores,
  colisionarObstaculos, colisionarObstaculosProyectiles, colisionarAtaudes,
  ajustes, enemigoMasCercano
} from './sistemas/colisiones.js';
import { Obstaculos } from './sistemas/obstaculos.js';
import { Expendedoras } from './sistemas/expendedoras.js';
import { RejillaMapa } from './sistemas/rejillaMapa.js';
import { SueloRejilla } from './sistemas/sueloRejilla.js';
import { Lockstep } from './core/lockstep.js';
import { RedConsola, avisoDeConexion, avisoMismaRed } from './red/consola.js';
import { Sincro } from './red/sincro.js';
import { dibujarRed, OPCIONES_RED, dibujarCaida, opcionesCaida, dibujarEspera } from './ui/red.js';
import { ocultarCodigoRed } from './ui/codigoRed.js';
import { Recogibles } from './entidades/recogible.js';
import { Cofres, COFRE, LLAMARADA, IMAN, COMIDA, RELOJ, MONEDAS } from './entidades/cofre.js';
import { Disparos } from './entidades/disparo.js';
import { Zonas } from './entidades/zonaDanyo.js';
import { Progresion } from './sistemas/progresion.js';
import { dibujarMenuNivel } from './ui/menuNivel.js';
import { dibujarCofre } from './ui/cofre.js';
import { dibujarFicha } from './ui/ficha.js';
import { dibujarMapa, acercarMapa, reiniciarZoomMapa } from './ui/mapa.js';
import { dibujarTienda } from './ui/tienda.js';
import { dibujarFinal, dibujarCartelFinal } from './ui/final.js';
import { dibujarPaneles, dibujarReloj, dibujarBarraJefe,
         dibujarCuentaAtrasReloj, reiniciarVidasHud } from './ui/hud.js';
import { Pantallas, ocupantePersonaje, dibujarDespedida } from './ui/pantallas.js';
import { dibujarConfig, dibujarConfirmacion } from './ui/configuracion.js';
import { dibujarControles, numeroDeFilas } from './ui/controles.js';
import { Controles, ACCIONES } from './core/controles.js';
import { Capa, FUENTE } from './ui/capa.js';
import { Tema, olvidarDegradados } from './ui/tema.js';
import {
  dibujarDepuracion, dibujarPausa
} from './ui/depuracion.js';
import { Director, aparecerTanda } from './sistemas/director.js';
import { Mascotas } from './sistemas/mascotas.js';
import { MASCOTAS, ORDEN_MASCOTAS } from './datos/mascotas.js';
import { Jefes } from './sistemas/jefes.js';
import { Niveles, PROXIMOS } from './datos/niveles/indice.js';
import { PERSONAJES, ORDEN_PERSONAJES } from './datos/personajes.js';
import { ARMAS } from './datos/armas.js';
import { PASIVOS } from './datos/pasivos.js';
import { POTENCIADORES } from './datos/potenciadores.js';
import { Intro } from './ui/intro.js';
import { dibujarHuecos, refrescarHuecos, huecoOcupado, textoBorrado, dibujarEsperaGithub } from './ui/huecos.js';
import { dibujarNiveles, pedirVista } from './ui/niveles.js';
// GALERÍA (temporal): pantalla para revisar el arte. Ver js/ui/galeria.js.
import { dibujarGaleria, tamanyoSeccion, NUM_SECCIONES, columnasGaleria } from './ui/galeria.js';
import { Historia } from './ui/historia.js';


// Capacidad del pool. El objetivo del plan son 800 entidades simultáneas; el
// margen extra absorbe los picos de una oleada que entra mientras la anterior
// aún no ha salido por culling.
const CAPACIDAD_ENEMIGOS = 1000;

// Proyectiles: la Ballesta a nivel 8 con la Clepsidra dispara mucho, y varias
// armas de proyectil conviven. 400 es holgado y son objetos diminutos.
const CAPACIDAD_PROYECTILES = 400;
// Partículas: 7 por muerte más chispas de impacto. Con la horda del minuto 16
// muriendo a ritmo alto esto se llena, y llenarse es aceptable: se pierde una
// chispa, no un enemigo.
const CAPACIDAD_PARTICULAS = 900;
const CAPACIDAD_NUMEROS = 160;
// Gemas: con la fusión por encima de 150 no puede desbordarse, pero se deja
// margen para el pico entre que caen y se fusionan.
const CAPACIDAD_GEMAS = 600;
// Cofres. En veinte minutos caen cuatro mantícoras y nueve serpientes doradas:
// trece en total, y un cofre no caduca ni se recicla por lejanía.
//
// Dieciséis y no trece: el techo tiene que estar por encima del peor caso, que
// es el jugador que mata élites y no va a por ninguno de sus cofres. Medido con
// la curva entera y un jugador quieto, el pico fueron diez cofres a la vez.
const CAPACIDAD_COFRES = 16;
// Disparos enemigos. Con las medusas del minuto 8 y una mantícora escupiendo
// abanicos de tres, rara vez pasan de veinte en el aire; 120 es holgado y son
// objetos diminutos.
const CAPACIDAD_DISPAROS = 120;
// Zonas: charcos, trampas, auras, ondas y explosiones comparten pool.
// 220 se quedó corto al subir las Minas a 24 por siembra: con `duracion` 10 y
// una recarga de 3,45 s eso son ~70 minas vivas de UN solo jugador, y en
// cooperativo a cuatro son 280 — más que el pool entero, así que las zonas de
// las otras ocho armas de área se quedarían sin sitio y dejarían de dañar. Un
// arma no puede vaciarle el pool a las demás.
const CAPACIDAD_ZONAS = 420;

const SEMILLA = 0xE3E21A;

// --- Aparición de prueba en bruto (teclas 1-4) ------------------------------
// Esto NO es la curva del juego: es un martillo para meter N enemigos de golpe y
// ver si el motor aguanta. Sirve para medir fps y poco más — en una partida no
// aparecen 500 serpientes a la vez, así que no dice nada sobre el ritmo.
//
// Para juzgar el daño, la experiencia y el movimiento contra la presión real
// está el DIRECTOR, que va soltando la curva de veinte minutos de
// datos/niveles/merida.js y corre siempre. Las dos cosas conviven porque
// responden preguntas distintas: los atajos preguntan si el motor aguanta, el
// director pregunta si el juego está bien calibrado.
//
// Hay DOS mezclas porque una sola mentía sobre el juego. Metiendo todo el
// bestiario desde el segundo cero aparecían arpías, que a 92 px/s son más
// rápidas que el jugador (85) y hacen imposible huir. Eso es correcto en el
// plan —el rol "rápido" existe justo para eso— pero la arpía no entra hasta el
// minuto 4, cuando ya hay armas con las que responder.
//
// Minutos 0-4: todos MÁS LENTOS que el jugador. Huir funciona, que es la lectura
// que hay que poder validar.
const MEZCLA_TEMPRANA = [
  'serpiente', 'serpiente', 'serpiente', 'serpiente', 'serpiente',   // 68
  'gargola', 'gargola', 'gargola',                                   // 52
  'legionario', 'legionario',                                        // 38
  'gladiador'                                                        // 46
];
// A partir del minuto 8: con arpías, tanques y todo lo demás.
const MEZCLA_TARDIA = [
  'serpiente', 'serpiente', 'serpiente',
  'gargola', 'gargola',
  'legionario', 'gladiador', 'gladiador',
  'arpia', 'arpia', 'medusa',
  'ciclope', 'minotauro'
];
// La geometría de aparición (perímetro, dispersión y los cinco patrones) vive en
// sistemas/director.js y la comparten los atajos y la curva de verdad: si la
// aparición de prueba y la de la partida usaran códigos distintos, probar una no
// diría nada de la otra.

const lienzo = document.getElementById('juego');
const ctx = lienzo.getContext('2d', { alpha: false });

// EL MUNDO EN BLANCO Y NEGRO mientras el Reloj de Emerita tiene parada a la
// horda. Todo el efecto vive en una clase de CSS (ver #juego.congelado en
// css/estilos.css, que es donde está explicado el porqué); esto solo la pone y
// la quita.
//
// SOLO CUANDO CAMBIA, y de ahí el `_congelado` de al lado. Escribir en
// `classList` cada frame es tocar el DOM sesenta veces por segundo para decirle
// algo que ya sabe, y además reinicia la transición en cada una: el fundido no
// llegaría a arrancar nunca. Con el flag, son dos escrituras por objeto
// recogido.
//
// ANTES ESTO ERA AZUL, y en dos sitios a la vez: un velo `#9fd8ff` a media
// opacidad sobre la pantalla y una copia teñida de hielo de cada bicho, horneada
// al cargar. Las dos se han ido. Lo pidió Sergio en gris de verdad, y las dos
// cosas no sumaban: sobre un mundo desaturado el azul es el único color que
// queda, así que el velo se comía el efecto y el teñido por enemigo ya no se
// distinguía de nada. El gris cuenta lo mismo —esto está detenido— sin pintar
// un solo píxel de más.
let _congelado = false;
function marcarCongelado(si) {
  if (si === _congelado) return;
  _congelado = si;
  lienzo.classList.toggle('congelado', si);
}
lienzo.width = ANCHO_FISICO;
lienzo.height = ALTO_FISICO;

// La interfaz vive en su propio lienzo, encima y a resolución de pantalla. El
// motivo está explicado en ui/capa.js: el ampliado por enteros que mantiene
// crujiente el pixel art es justo lo que dejaba el texto escalonado.
Capa.iniciar(document.getElementById('interfaz'));

// Cooperativo local hasta 4. El motor no sabe cuántos hay: recorre el array.
const MAX_JUGADORES = 4;

const entrada = new Entrada(lienzo, MAX_JUGADORES);
const camara = new Camara();
const rng = crearRng(SEMILLA);

// Array de jugadores en juego, y su arsenal en paralelo por índice. Cada uno
// tiene sus armas: en cooperativo las armas no se comparten, y en la Fase 4 el
// sorteo de subida de nivel además impedirá que dos lleven la misma.
const jugadores = [];
const arsenales = [];

let enemigos = null;
let proyectiles = null;
let recogibles = null;
let cofres = null;
let disparos = null;
let zonas = null;
let bucle = null;

// Contexto que reciben los comportamientos de arma. Se construye UNA vez y se
// reapunta al jugador que toca antes de cada llamada: crear un objeto literal
// por jugador y paso de lógica sería asignar memoria en caliente.
const ctxArmas = { jugador: null, enemigos: null, proyectiles: null, zonas: null, rng: null };

// --- Estado de pantalla ------------------------------------------------------
// El juego ya no arranca dentro de la partida: pasa por el título y por la
// selección de personaje. Son tres estados excluyentes y el reparto es tajante
// —`actualizar` y `dibujar` salen por otra rama en cuanto no estamos jugando—
// porque la mitad del bucle da por hecho que existe `jugadores[0]`, y en el
// título todavía no existe nadie.
const PANTALLA_TITULO = 0;
const PANTALLA_SELECCION = 1;
const PANTALLA_JUEGO = 2;
const PANTALLA_TIENDA = 3;
// Elegir mascota, DESPUÉS de elegir personaje. Solo se pasa por aquí si hay
// alguna comprada: sin ninguna no hay nada que elegir y sería una pantalla que
// solo sirve para pulsar otra vez.
const PANTALLA_MASCOTAS = 4;
const PANTALLA_CONFIG = 5;
// CONTROLADORES: qué hace cada botón, con el mando dibujado. Cuelga de la
// configuración y solo se llega desde ella, así que se sale a ella y no al
// título. Ver ui/controles.js.
const PANTALLA_CONTROLES = 12;
// La INTRO: la ficha del proyecto y el rótulo, antes del menú. Es la pantalla
// de arranque, y de ella solo se sale hacia el título — nunca se vuelve.
const PANTALLA_INTRO = 6;
// LAS TRES PARTIDAS. Va entre la intro y el título, y se vuelve a ella con el
// botón de la esquina del menú (ver ui/huecos.js: la tienda y las mascotas
// gastan de una hucha, así que la hucha hay que elegirla antes del menú).
const PANTALLA_HUECOS = 7;
// El cooperativo online. Se llega desde la pantalla de elegir personajes, que
// es donde ya se decide quién juega. Del menú del título todavía no, porque sus
// cuatro opciones vienen pintadas en la ilustración y añadir una quinta es
// repintar la lápida.
const PANTALLA_RED = 8;
// ELEGIR NIVEL. Va DESPUÉS de elegir héroe y mascota, que es lo último que se
// decide antes de jugar: primero con quién se va, después adónde.
//
// SE VE SIEMPRE, y enseña LA REGIÓN ENTERA —también lo que todavía está
// cerrado—. Es lo contrario del criterio de la pantalla de mascotas, que se
// salta cuando no hay ninguna comprada, y a propósito: allí lo que no se ha
// comprado no existe, y aquí lo que no se ha desbloqueado es justo lo que hay
// que enseñar. Un mapa que solo muestra donde ya puedes ir no es un mapa.
const PANTALLA_NIVELES = 9;
// LA HISTORIA DEL SITIO ELEGIDO: la placa de piedra de la intro con el relato
// del nivel, entre elegirlo y jugarlo. Ver ui/historia.js. Un nivel sin
// `historia` en sus datos no pasa por aquí.
const PANTALLA_HISTORIA = 10;
// GALERÍA (temporal). Mirador del arte de armas, objetos y potenciadores en los
// tamaños en que los dibuja el juego. No se llega a ella jugando: se entra desde
// el menú del título y se vuelve con Esc. Ver js/ui/galeria.js.
const PANTALLA_GALERIA = 11;
let seccionGaleria = 0;
let cursorGaleria = 0;
// Sin valor de arranque: lo pone `irA` al final de este bloque, porque el
// estado de pantalla no es solo esta variable — arrastra la clase del body, y
// dejarlos puestos por separado es tener dos verdades que se desincronizan.
// Pasó: el título salía con la chuleta de atajos de depuración encima.
let pantalla;

// Un hueco por control: null si ese jugador no se ha sumado, y si no
// `{ personaje, listo }`. El índice ES el del control, así que el mando 3
// maneja siempre el puesto 3 aunque el 2 esté vacío.
const puestos = new Array(4).fill(null);

// DE QUIÉN SE LEE EL ARMA Y LA FRASE al pie de la pantalla de selección: del
// último héroe que ha tocado alguien. Cada jugador tiene su propio marco y su
// propio carrusel (ver ui/pantallas.js), así que al pie solo cabe uno y el que
// interesa es el que se acaba de mirar.
//
// Vive aquí y no en `pantallas.js` porque sale de la ENTRADA —quién ha pulsado
// qué— y allí solo se dibuja.
let focoSeleccion = 0;

// Tienda. TRES SECCIONES —potenciadores, mascotas y jugadores— con izquierda y
// derecha para cambiar y arriba/abajo para moverse dentro. Ver ui/tienda.js.
//
// Una sola tienda con secciones y no tres entradas distintas en el menú: se
// pagan con los mismos denarios y se miran en el mismo momento —antes de
// jugar—, así que separarlas obligaría a salir de una para ver cuánto queda
// para lo de la otra.
const ID_POTENCIADORES = Object.keys(POTENCIADORES);
const PESTANYA_POTENCIADORES = 0;
const PESTANYA_MASCOTAS = 1;
const PESTANYA_PERSONAJES = 2;
const N_PESTANYAS = 3;
let pestanyaTienda = PESTANYA_POTENCIADORES;
let cursorTienda = 0;

// --- Menú principal ---------------------------------------------------------
// Sustituye al "pulsa cualquier tecla" del título.
// Las cinco opciones de la lápida más el botón de la esquina.
//
// EL ORDEN NO ES LIBRE: es el de las palabras pintadas en la piedra. La lista y
// la ilustración tienen que decir lo mismo y en la misma fila, porque lo único
// que pone el código encima es un recuadro de luz sobre la opción señalada (ver
// OPCIONES_TITULO en ui/pantallas.js). Mover una aquí sin repintar la lámina
// enciende el recuadro sobre otra palabra.
//
// `esquina` saca a "empezar de cero" del bloque del menú y lo manda abajo a la
// derecha, separado de todo lo demás. Sigue en la misma lista y en el mismo
// recorrido del cursor —se llega bajando desde SALIR— porque un botón al que no
// se puede llegar con el mando no es un botón, pero visualmente no se mezcla con
// lo que se pulsa a diario.
const MENU = [
  { id: 'jugar',  texto: 'JUGAR' },
  { id: 'red',    texto: 'JUGAR EN RED' },
  { id: 'tienda', texto: 'TIENDA' },
  { id: 'config', texto: 'CONFIGURACIÓN' },
  { id: 'salir',  texto: 'SALIR' },
  { id: 'galeria', texto: 'GALERÍA DE ARTE' },   // GALERÍA (temporal)
  { id: 'partidas', texto: 'CAMBIAR PARTIDA', esquina: true }
];
let cursorMenu = 0;

// --- Elección de mascota ----------------------------------------------------
// Un id por jugador, en el mismo orden que `puestos`. Cadena vacía = ninguna.
const mascotasElegidas = new Array(4).fill('');
let cursorMascota = 0;
// Índice del jugador al que le toca elegir. Se recorren en orden y cada uno
// elige la suya; DOS NO PUEDEN LLEVAR LA MISMA, así que las ya cogidas se
// saltan al mover el cursor.
let turnoMascota = 0;

// --- Elección de nivel ------------------------------------------------------
// EL NIVEL EN CURSO. No es una constante importada de un archivo concreto: es
// el que se haya elegido (o el primero, al arrancar). Todo lo que antes leía
// `NIVEL` lee esto, y `usarNivel` es el ÚNICO sitio donde cambia.
let nivelActual = null;
let cursorNivel = 0;
// Mientras se carga el suelo del nivel elegido. Es medio segundo con una imagen
// grande, y sin decirlo la pantalla se queda muda tras pulsar. Además hace de
// cerrojo: dos pulsaciones seguidas lanzarían dos cargas a la vez.
let cambiandoNivel = false;

// CAMBIAR DE NIVEL. Lo único que hay que llamar para que el mundo entero pase a
// ser otro sitio: el suelo, el tema de la interfaz, las oleadas y la decoración.
//
// Es asíncrono porque el suelo es una imagen. Nadie lo llama a mitad de
// partida: se hace al arrancar y al elegir en la pantalla de niveles, que son
// los dos momentos en que no hay mundo que romper.
async function usarNivel(nivel) {
  nivelActual = nivel;
  await Recursos.cargarNivel(nivel);
  // El aspecto de pausa, derrota y subida de nivel lo pone el NIVEL. Se inyecta
  // en vez de importarlo desde ui/: si la interfaz importara merida.js, añadir
  // un nivel obligaría a tocar la interfaz, y el contrato dice que un nivel
  // nuevo es escribir un archivo de datos/niveles/ y nada más.
  Tema.usar(nivel);
  // El director reparte las oleadas del nivel y los obstáculos su decoración.
  // Los dos reservan sus arrays aquí, fuera de la partida: durante ella no se
  // hace un solo `new`.
  //
  // El director COMPARTE EL RNG con todo lo demás, así que con la misma semilla
  // salen las mismas oleadas: es el criterio 10 del plan y sin él no se puede
  // comparar un ajuste de balance con el anterior.
  Director.iniciar(nivel, rng);
  Obstaculos.iniciar(nivel);
  // Y LA MÚSICA DEL SITIO. Cada nivel trae la suya en su archivo de datos: un
  // centro comercial no puede sonar como las ruinas de Mérida. Ver `musica` en
  // js/datos/niveles/<nivel>.js.
  GestorAudio.usarPistas(nivel.musica);
  // LA REJILLA DEL NIVEL, si la trae. Se llama SIEMPRE, también para los que no
  // la traen: sin el `apagar`, volver a Mérida después del centro comercial
  // dejaría sus paredes puestas en mitad de la calzada.
  if (nivel.mapa) {
    RejillaMapa.iniciar(nivel.mapa.rejilla, nivel.mapa.leyenda, nivel.mapa.celda, nivel.alturasMapa);
    prepararColoresRejilla(nivel);
    // Y sus texturas: los PNG que haya y un dibujo de relleno para el resto.
    // Ver sistemas/sueloRejilla.js. Los colores planos de arriba se quedan para
    // el plano y como repliegue si esto no llegara a cargar.
    await SueloRejilla.cargar(nivel);
  } else {
    RejillaMapa.apagar();
    SueloRejilla.activo = false;
  }
  // Y las máquinas expendedoras, que salen de la rejilla: sin rejilla no hay.
  Expendedoras.iniciar();
  // Y la lámina de su historia, si trae una propia. Aquí y no al abrir la
  // pantalla: una imagen que se empieza a pedir cuando ya se está leyendo el
  // relato se pone de fondo a media lectura.
  await Historia.cargarPlaca(nivel);
}

// --- Configuración ----------------------------------------------------------
let cursorConfig = 0;
// Ventana de confirmación de "empezar de cero". Es un estado aparte y no un
// flanco: borrar el progreso de todas las partidas jugadas no puede depender de
// una tecla mal pulsada.
let confirmarBorrado = false;
// Cuál de los dos botones del aviso está señalado. Arranca SIEMPRE en cancelar
// (ver ui/configuracion.js): el que abre por error una ventana que borra todo
// el progreso no debe encontrarse el dedo encima del botón que lo borra.
const CONFIRMAR_CANCELAR = 0;
const CONFIRMAR_BORRAR = 1;
let cursorConfirmar = CONFIRMAR_CANCELAR;
// Qué partida está señalada en la pantalla de huecos, y cuál se va a borrar si
// se confirma. Son la misma: el aviso siempre habla de la señalada.
let cursorHueco = 0;
// Y si el cursor está en el botón de borrar de esa partida en vez de en la
// partida misma. Solo puede estarlo si la partida existe: en una vacía no hay
// botón al que ir.
let enBorrarHueco = false;
// Y si el cursor está en la fila de GitHub, arriba de las tres partidas, en
// vez de en ninguna de ellas. Solo tiene sentido con la nube encendida —sin
// ella no hay fila que señalar—.
let enFilaGithub = false;

// Cambiar de pantalla en un solo sitio. Hay dos cosas que van fuera del lienzo
// y que hay que mover con el estado: la chuleta de atajos del pie, que en las
// pantallas ilustradas sobra, y nada más — si algún día hay una tercera, va
// aquí y no repartida por el bucle.
function irA(nueva) {
  pantalla = nueva;
  refrescarChuleta();
  // AL ENTRAR EN LA PANTALLA DE PARTIDAS SE MIRA LA NUBE, y solo aquí: es el
  // único momento en que se puede cambiar lo guardado sin pisarle nada a nadie
  // —todavía no hay partida elegida— y además es por donde se pasa siempre al
  // abrir el juego. Con la nube apagada esto no hace nada.
  if (nueva === PANTALLA_HUECOS) mirarLaNube();
  // Y AL ENTRAR EN LA DE PERSONAJES, las figuras se plantan de golpe en su
  // sitio. Sin esto se entra viendo los carruseles correr solos desde donde se
  // quedaron la vez anterior, que parece que se está moviendo alguien.
  if (nueva === PANTALLA_SELECCION) {
    focoSeleccion = puestos[0] ? puestos[0].personaje : 0;
    Pantallas.centrarSeleccion();
  }
}

// Lo que se enseña al pie de la pantalla de partidas. Vacío = no decir nada,
// que es lo normal: una copia que funciona no tiene que anunciarse.
let nubeAviso = '';

// BAJAR LA COPIA Y QUEDARSE CON LA MEJOR.
//
// No espera nadie a esto: si la red tarda o no hay, la pantalla ya está pintada
// y se juega igual. Cuando llega, si lo de la nube tiene más juego que lo de
// aquí, se aplica y se refresca la lista.
//
// GANA EL QUE MÁS HA JUGADO, no el más reciente: ver `comparar` en
// core/progresoPortable.js. Y solo se pisan los huecos que vienen — uno vacío
// arriba no borra el que hay aquí.
// TRAER LA PARTIDA DE OTRO SITIO: se pega el código de allí y se baja.
//
// AQUÍ SÍ SE PISA LO QUE HAY, y es lo correcto: pegar el código de otro sitio es
// decir "mi partida es la de allí". Aun así manda la misma regla de siempre —si
// lo de aquí tiene más juego, se queda lo de aquí— para que teclear un código
// por error no cueste veinte horas.
// LO COMÚN DE "HA LLEGADO UNA COPIA DE FUERA, ¿SE APLICA?" — lo usan pegar un
// código a mano, mirar la nube sola al entrar, y volver de conectar con
// GitHub. Misma regla las tres veces: gana quien más ha jugado. Se separa
// aquí para que el día que la regla cambie, cambie en un solo sitio.
function traerSiHayMasJuego(copia) {
  const aqui = Progreso.pesoDe(MetaProgreso.todosLosHuecos());
  const mejorArriba = copia.tiempo > aqui.tiempo ||
                      (copia.tiempo === aqui.tiempo && copia.partidas > aqui.partidas);
  if (!mejorArriba) return { aplicado: false, mejorArriba };
  const puestos = MetaProgreso.aplicarHuecos(copia.huecos);
  if (puestos > 0) refrescarHuecos();
  return { aplicado: puestos > 0, mejorArriba };
}

async function pegarCodigoDeNube() {
  const pegado = await pegarDelPortapapeles();
  if (!pegado) { nubeAviso = 'No he podido leer el portapapeles.'; return; }
  if (!Nube.usarCodigo(pegado)) {
    nubeAviso = 'Eso no tiene la forma de un código de partida.';
    return;
  }
  nubeAviso = 'Buscando esa partida…';
  const copia = await Nube.bajar();
  if (!copia) { nubeAviso = 'No hay ninguna partida guardada con ese código.'; return; }
  // AQUÍ SÍ SE PISA LO QUE HAY, y es lo correcto: pegar el código de otro
  // sitio es decir "mi partida es la de allí". Aun así manda la misma regla
  // de siempre —si lo de aquí tiene más juego, se queda lo de aquí— para que
  // teclear un código por error no cueste veinte horas.
  if (copia.tiempo < Progreso.pesoDe(MetaProgreso.todosLosHuecos()).tiempo) {
    nubeAviso = 'Esa partida tiene menos juego que la de aquí: no se toca nada.';
    return;
  }
  const r = traerSiHayMasJuego(copia);
  nubeAviso = r.aplicado ? 'Traída tu partida.' : 'Ahí no había nada que traer.';
}

async function mirarLaNube() {
  if (!Nube.URL_NUBE) return;
  const copia = await Nube.bajar();
  if (!copia) return;
  const r = traerSiHayMasJuego(copia);
  if (r.aplicado) nubeAviso = 'Recuperada tu partida de la nube.';
}

// VOLVER DE CONECTAR CON GITHUB. Esto NO es una cuenta: si la URL trae
// `?nube_codigo=`, es que el Worker acaba de enlazar —o recordar— el código
// de esta cuenta de GitHub con la partida (ver `callbackGithub` en
// nube/worker.js). Se aplica con la MISMA regla de siempre, y se limpia la
// URL: dejar el código a la vista, o repetir esto solo con recargar la
// página, no aporta nada.
//
// ESTO SE EJECUTA TANTO SI EL LOGIN FUE EN UN POPUP como si fue en esta
// misma pestaña —el popup bloqueado que cae al `location.href` de siempre—.
// No hace falta distinguir los dos casos: en los dos hace falta aplicar la
// vuelta, y el `window.close()` del final es un no-op inofensivo cuando esta
// pestaña no la abrió un script —que es justo el caso de "esta misma
// pestaña"—, así que basta con intentarlo siempre.
let nubeLogin = '';
async function recogerRetornoDeGithub() {
  const url = new URL(location.href);
  const codigoVuelto = url.searchParams.get('nube_codigo');
  if (!codigoVuelto) return;
  const login = url.searchParams.get('nube_login') || '';
  url.searchParams.delete('nube_codigo');
  url.searchParams.delete('nube_login');
  history.replaceState(null, '', url.toString());

  if (!Nube.usarCodigo(codigoVuelto)) return;
  Nube.fijarLogin(login);
  nubeLogin = login;
  const saludo = login ? `Conectado como @${login}.` : 'Conectado con GitHub.';
  nubeAviso = saludo;
  const copia = await Nube.bajar();
  if (copia) {
    const r = traerSiHayMasJuego(copia);
    if (r.aplicado) nubeAviso = saludo + ' Traída tu partida.';
  }
  // SI ESTO ES EL POPUP, se cierra solo: la ventana principal está mirando
  // `popup.closed` y se entera de que ha terminado. Si es esta misma
  // pestaña —popup bloqueado—, el navegador rechaza cerrar una pestaña que
  // no abrió un script, así que aquí no pasa nada y el juego sigue cargando
  // como siempre.
  try { window.close(); } catch { /* no era un popup: se sigue jugando aquí */ }
}

// ¿SE ESTÁ ESPERANDO A QUE VUELVA EL POPUP DE GITHUB? Saca el cartel de
// espera —ver `dibujarEsperaGithub` en ui/huecos.js— y congela la entrada de
// esta pantalla, igual que el aviso de confirmar borrado.
let nubeConectando = false;
// La ventana del popup, para poder cerrarla desde ESC sin esperar a que el
// jugador la encuentre por su cuenta entre las demás ventanas abiertas.
let nubePopup = null;

// EL POPUP, no una navegación de la propia ventana. Antes esto hacía
// `location.href = url` y recargaba el juego entero —intro, título y
// vuelta—, que es justo lo que Sergio vio y no le gustó: toda la pantalla de
// partidas desaparecía y volvía a aparecer un buen rato después.
//
// Con un popup, esta ventana ni se entera: sigue en la pantalla de
// partidas, con un aviso de que se está esperando, y solo vigila cuándo se
// cierra la ventana nueva —`popup.closed`, comprobado cada poco— para volver
// a leer lo que el popup haya dejado escrito. El popup y esta ventana
// comparten origen y por tanto el mismo `localStorage`, así que no hace
// falta que se manden nada: `Nube.recargar()` es simplemente volver a leer
// el disco.
//
// SI EL NAVEGADOR BLOQUEA EL POPUP —`window.open` devuelve null—, se cae al
// comportamiento de siempre: navegar esta misma ventana. Peor experiencia,
// pero sigue funcionando.
function conectarConGithub() {
  // NO DOS A LA VEZ. Con un popup ya esperando, pulsar G o Enter otra vez
  // —por impaciencia, o porque el atajo y la fila caen en el mismo sitio—
  // abriría un segundo popup encima del primero y dos relojes vigilando el
  // mismo cierre.
  if (nubeConectando) return;
  const url = Nube.urlLoginGithub();
  if (!url) return;
  const popup = window.open(url, 'extremadura-github-login', 'width=520,height=680');
  if (!popup) { location.href = url; return; }

  nubeConectando = true;
  nubePopup = popup;
  nubeAviso = 'Esperando a que confirmes en GitHub…';
  const antes = { codigo: Nube.codigo(), login: Nube.login() };

  const reloj = setInterval(() => {
    if (!popup.closed) return;
    clearInterval(reloj);
    nubeConectando = false;
    nubePopup = null;
    Nube.recargar();
    refrescarHuecos();
    nubeLogin = Nube.login();
    // SOLO SE ANUNCIA ALGO SI DE VERDAD CAMBIÓ. Cerrar el popup sin llegar a
    // autorizar —arrepentirse, cerrar por error— no es un fallo que haya que
    // contar, y decir "Conectado" cuando no ha pasado nada sería mentir.
    if (Nube.codigo() !== antes.codigo || Nube.login() !== antes.login) {
      nubeAviso = nubeLogin ? `Conectado como @${nubeLogin}.` : 'Conectado con GitHub.';
    } else {
      nubeAviso = '';
    }
  }, 400);
}

// La chuleta de atajos vive FUERA del lienzo (es texto del documento), así que
// ningún velo la tapa: se quita o se pone con una clase del body y punto.
//
// Sobra en todo lo que no sea la partida en marcha, y el RESUMEN FINAL es una de
// esas cosas aunque el estado siga siendo PANTALLA_JUEGO: ocupa la pantalla
// entera y la chuleta se le colaba por debajo del pie.
function refrescarChuleta() {
  const enMenu = pantalla !== PANTALLA_JUEGO || resumenFinal ||
                 finalMostrado === 'victoria';
  document.body.classList.toggle('enMenu', enMenu);
}

let pausado = false;
// Índice del jugador cuya ficha está abierta, o -1. Se abre con Select en el
// mando de ese jugador o con Tab en el teclado, y congela el mundo: es una
// pantalla para mirar números con calma, y mirarlos mientras te rodean no es
// mirarlos con calma.
let fichaAbierta = -1;
let verDepuracion = false;
let mapaAbierto = false;
// Flanco de "todos caídos": evita reescribir localStorage cada frame mientras
// dura el cartel de derrota, y solo guarda una vez por caída de verdad.
let derrotaGuardada = false;
// Pantalla final (Fase 7): null mientras se juega, o 'victoria'/'derrota' una
// vez que termina. `statsFinal` es la foto fija de ese instante — ver
// capturarStats(). El primero de los dos flancos que salta manda: si el
// equipo cae DESPUÉS de que el reloj ya haya llegado al final, sigue siendo
// una victoria, no una derrota de última hora.
let finalMostrado = null;
let statsFinal = null;
// La derrota va en DOS TIEMPOS y el resumen es el segundo.
//
// Antes salía el panel entero en el mismo frame en que caía el último jugador,
// y eso tapaba justo lo que hay que ver: el ataúd, dónde ha caído y con qué
// encima. Jugando solo era peor todavía —el ataúd propio no llegaba a verse
// nunca—. Ahora primero se queda el mundo a la vista con un cartel arriba, y el
// resumen se pide pulsando.
//
// `resumenFinal` es ese segundo tiempo. La victoria no lo usa: ahí no hay
// ataúd que enseñar ni sitio que mirar, así que su panel sale directo.
let resumenFinal = false;
// Segundos que lleva el resumen en pantalla. Del resumen se sale al menú con
// cualquier tecla, y sin esta espera el mismo golpe de tecla que lo abre lo
// cerraría: entre la pulsación que pide el resumen y la siguiente vuelta del
// bucle no hay ni 17 ms, y quien pulsa dos veces seguidas —que es lo que hace
// todo el mundo al morir— no llegaría a verlo.
let relojResumen = 0;
const ESPERA_RESUMEN = 0.6;
// Denarios que había ANTES de empezar. El resumen enseña lo ganado en la
// partida, y eso es una resta: MetaProgreso.denarios es el montón acumulado de
// todas las partidas jugadas.
let denariosAlEmpezar = 0;

// La pantalla de arranque. Va AQUÍ y no junto a `irA` porque `refrescarChuleta`
// consulta `resumenFinal` y `finalMostrado`, que se declaran unas líneas más
// arriba con `let`: llamarla antes de esas declaraciones revienta con un error
// de zona muerta temporal y el juego no arranca.
Intro.iniciar();
irA(PANTALLA_INTRO);
let zoomPantalla = 1;
let tilesDibujados = 0;
let indicePersonaje = 0;

// --- Perfilado por subsistema ------------------------------------------------
// El tiempo que mide el bucle es el de EMITIR órdenes de dibujo; el canvas 2D
// las encola y rasteriza después, así que puede ir sobrado de JavaScript y aun
// así perder frames. Por eso el overlay compara el tiempo de frame REAL (el que
// sale de los intervalos de requestAnimationFrame) con lo que suman lógica y
// render: la diferencia es lo que se lleva el navegador componiendo.
//
// Los interruptores permiten apagar un sistema y ver el efecto en el acto, que
// es la única forma honesta de saber qué cuesta en una máquina concreta.
const perfil = { suelo: 0, entidades: 0, efectos: 0, texto: 0, interfaz: 0 };
const activo = { suelo: true, particulas: true, numeros: true, efectos: true, destello: true };

// --- Alta y baja de jugadores ------------------------------------------------
// Un jugador entra al enchufar un mando, o a mano con J, para poder probar el
// cooperativo sin cuatro mandos encima de la mesa.
// `idPersonaje` lo trae la pantalla de selección. Sin él —al sumarse a mitad de
// partida con J o al enchufar un mando— se reparte por orden, que es lo que se
// hacía antes de que hubiera pantalla donde elegir.
// `meta` es el progreso comprado de quien lleva a este personaje. Sin él, el de
// esta máquina: lo correcto jugando solo o en el sofá. En red llega el del otro
// por el saludo — ver `metasDeRed`.
function anyadirJugador(idPersonaje, idMascota, meta) {
  if (jugadores.length >= MAX_JUGADORES) return null;
  const i = jugadores.length;
  // El reparto por orden se queda SIEMPRE en los cuatro primeros —`i` no pasa
  // de MAX_JUGADORES— y eso solo es correcto porque los cuatro primeros de
  // ORDEN_PERSONAJES son los gratis. Si algún día se cuela uno de pago ahí, esto
  // regalaría un héroe sin pagarlo.
  const j = new Jugador(idPersonaje || ORDEN_PERSONAJES[i % ORDEN_PERSONAJES.length],
                        idMascota || '', rng, meta || MetaProgreso);

  // En abanico alrededor del primero, para que no nazcan uno dentro de otro.
  const ang = (i / MAX_JUGADORES) * Math.PI * 2;
  const cx = i === 0 ? ANCHO_LOGICO / 2 : jugadores[0].x;
  const cy = i === 0 ? ALTO_LOGICO / 2 : jugadores[0].y;
  j.x = j.xPrev = j.xVista = cx + (i === 0 ? 0 : cos(ang) * 26);
  j.y = j.yPrev = j.yVista = cy + (i === 0 ? 0 : sen(ang) * 26);
  jugadores.push(j);

  // Arsenal propio, con el arma que le toca a su personaje. Eso ya garantiza
  // que los cuatro arranquen distintos; el sorteo de subida de nivel se encarga
  // de que sigan sin repetirse.
  const arsenal = new Armas(rng);
  arsenal.equipar(j.def.arma);
  arsenales.push(arsenal);
  j.arsenal = arsenal;
  // Y las gemas del suelo, que las necesitan los Cencerros de San Antón: cada
  // X segundos las llaman a todas, igual que el imán consumible. Se le enchufa
  // desde aquí y no se importa desde el jugador, por lo mismo que el bestiario
  // no importa los cofres: quien monta la partida reparte las piezas.
  j.recogibles = recogibles;
  // Y el equipo, que lo miran los cuatro objetos de cooperativo. Se le pasa la
  // lista VIVA, no una copia: quien se suma a mitad de partida entra en ella y
  // los que ya estaban lo ven sin que nadie tenga que avisar.
  j.companyeros = jugadores;
  // Y el bestiario, que lo necesita el Libro de las Sombras para elegir a quién
  // poseer. Tercera pieza que se le enchufa al jugador desde fuera, y por el
  // mismo motivo que las otras dos.
  j.enemigos = enemigos;
  // Con dos o más, la XP pasa a ser de equipo (ver Progresion.ganarXp): quien
  // se suma entra ya al nivel común, y el umbral de todos se recalcula para
  // el nuevo número de jugadores.
  Progresion.resincronizarEquipo(jugadores);
  return j;
}

function quitarJugador() {
  if (jugadores.length <= 1) return;   // siempre queda al menos uno
  jugadores.pop();
  arsenales.pop();
  Progresion.resincronizarEquipo(jugadores);
}

// Cada mando que se enchufa suma un jugador, hasta cuatro. Solo con la partida
// en marcha: en la pantalla de selección enchufar un mando no mete a nadie, se
// entra pulsando A, que es donde además se elige personaje.
addEventListener('gamepadconnected', () => {
  if (pantalla !== PANTALLA_JUEGO) return;
  if (entrada.mandosConectados >= jugadores.length) anyadirJugador();
});

// A quién persigue un proyectil que caza. Misma idea que `estallar`: una
// referencia creada UNA vez y pasada al sistema, porque esto se pregunta por
// cada osito vivo y en cada paso.
//
// Vive aquí y no en entidades/proyectil.js porque la búsqueda está en
// sistemas/colisiones.js, que ya importa del archivo de proyectiles: hacerlo al
// revés cerraría un ciclo de módulos por una sola llamada.
function cazarCercano(x, y, radio) {
  return enemigoMasCercano(enemigos, x, y, radio);
}

// Onda expansiva de un proyectil que estalla. Referencia creada UNA vez y
// pasada a los sistemas: construir la closure por frame sería asignar en
// caliente, y esto puede llamarse muchas veces por paso con un bombardeo.
function estallar(p) {
  zonas.crear({
    // La onda hereda el dueño del proyectil que revienta: lo que mate la
    // explosión es del que disparó la granada.
    duenyo: p.duenyo,
    x: p.x, y: p.y,
    radio: p.radioExplosion, radioIni: p.radioExplosion * 0.15,
    duracion: 0.32, danyo: p.danyoExplosion, empuje: p.empuje * 1.6,
    modo: 'onda', color: p.color, relleno: 0.3, sprite: p.spriteOnda,
    // Y si cruza paredes, lo hereda también: la flecha que cae del cielo
    // revienta donde cae, y la granada que se para en el muro revienta a
    // este lado.
    atraviesaParedes: p.atraviesaParedes
  });
  // Y la columna que cae del cielo sobre el punto, para el que la declare (el
  // Pilum de Júpiter). Es SOLO dibujo: el daño entero está en la onda de
  // arriba, y meterle daño propio al haz sería cobrar dos veces el mismo golpe.
  if (p.rayoCaida > 0) VFX.haz(p.x, p.y, p.rayoCaida, p.rayoGrosor, p.color);
}

// --- Escalado al viewport ----------------------------------------------------
//
// La rejilla de píxeles se cuenta EN PÍXELES DEL MONITOR, no en unidades CSS, y
// se cuenta por PÍXEL DE ARTE, no por píxel del lienzo. Ahí estaba el fallo de
// los bordes en pantalla completa.
//
// Lo que había redondeaba el zoom a un entero sobre unidades CSS. Pero en
// Windows una unidad CSS no es un píxel: con el escalado del sistema al 125%,
// un monitor 4K son 3072x1728 unidades CSS, y ahí `floor(3072/1920)` da 1. El
// lienzo se quedaba en 1920x1080 y sobraban 576 píxeles de marco a cada lado y
// 324 arriba y abajo — que es justo lo que se veía. Y encima la rejilla tampoco
// salía entera: cada píxel del lienzo caía sobre 1,25 píxeles del monitor.
//
// Contando en píxeles de verdad, en ese mismo monitor caben 8 píxeles por cada
// píxel de arte (3840/480), el zoom sale 1,6 en CSS y la pantalla se llena
// entera con la rejilla clavada: dos píxeles físicos por píxel del lienzo. Que
// el número en CSS tenga decimales da igual; el navegador lo devuelve a los
// píxeles enteros de los que salió.
//
// POR PÍXEL DE ARTE y no por píxel del lienzo porque un píxel de arte ya son
// ESCALA_ARTE del lienzo: exigir que el lienzo caiga entero es cuatro veces más
// estricto de lo que la vista necesita, y esa exigencia de más se paga en marco.
//
// Y UN REPLIEGUE, porque hay ventanas en las que el escalón entero desperdicia
// demasiado —una ventana de navegador con el zoom a 150%, por ejemplo—. Si
// encajar en la rejilla cuesta más del 15% del tamaño, se estira hasta llenar y
// se acepta la rejilla irregular: entre un juego pequeño y perfecto y uno
// grande con los píxeles un pelo desiguales, a esa distancia gana el grande.
const APROVECHAMIENTO_MINIMO = 0.85;

function redimensionar() {
  const densidad = window.devicePixelRatio || 1;

  // Zoom que llenaría la ventana justo, sin mirar rejillas.
  const exacto = Math.min(innerWidth / ANCHO_FISICO, innerHeight / ALTO_FISICO);

  // El mismo, bajado al escalón donde cada píxel de arte ocupa un número
  // entero de píxeles del monitor.
  const porArte = exacto * ESCALA_ARTE * densidad;
  const encajado = Math.max(1, Math.floor(porArte)) / (ESCALA_ARTE * densidad);

  const factor = (encajado / exacto) >= APROVECHAMIENTO_MINIMO ? encajado : exacto;
  zoomPantalla = factor;
  lienzo.style.width  = (ANCHO_FISICO * factor) + 'px';
  lienzo.style.height = (ALTO_FISICO  * factor) + 'px';
  // La capa de interfaz ocupa el mismo rectángulo en CSS, pero por debajo lleva
  // tantos píxeles como dé la pantalla.
  Capa.redimensionar(factor);
  // Los degradados del tema guardan coordenadas absolutas y se cachean; tras un
  // cambio de escala habría que repintarlos igual, pero más vale tirarlos que
  // arrastrar una banda mal colocada.
  olvidarDegradados();
}
addEventListener('resize', redimensionar);

// Cambio de densidad de pantalla: pasa al arrastrar la ventana de un monitor a
// otro, o al hacer zoom en el navegador. Sin esto, la interfaz se queda con la
// resolución del monitor anterior y se ve blanda. La consulta hay que rehacerla
// cada vez porque solo dispara UNA vez por umbral cruzado.
function vigilarDensidad() {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    .addEventListener('change', () => { redimensionar(); vigilarDensidad(); },
                      { once: true });
}

// --- Pantalla completa -------------------------------------------------------
// Vía la API del navegador y no el F11 nativo: F11 lo intercepta el propio
// navegador antes de que la página se entere, así que no hay forma de
// ofrecerlo como un botón del juego ni de saber si está activo. El resultado
// visual es el mismo (y el mismo margen si la pantalla no encaja a zoom
// entero exacto), pero así queda un control real dentro del juego.
const botonPantallaCompleta = document.getElementById('pantallaCompleta');
// Se saca a una funcion porque ahora lo piden dos sitios: este boton y la
// pantalla de configuracion.
function alternarPantallaCompleta() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
botonPantallaCompleta.addEventListener('click', alternarPantallaCompleta);
addEventListener('fullscreenchange', () => {
  botonPantallaCompleta.textContent = document.fullscreenElement ? '⤢' : '⛶';
  botonPantallaCompleta.title = document.fullscreenElement
    ? 'Salir de pantalla completa' : 'Pantalla completa';
  // El cambio de tamaño real del viewport llega con su propio evento resize,
  // pero en algunos navegadores fullscreenchange se dispara un instante antes
  // de que innerWidth/innerHeight se actualicen. Redimensionar aquí también
  // es barato y evita un frame con el zoom viejo.
  redimensionar();
});

// --- Consumibles del suelo ---------------------------------------------------
// Cuánto cura la comida y cuánto dura el lanzallamas prestado.
const CURA_COMIDA = 20;
const DURACION_LLAMARADA = 8;
// El Reloj de Emerita para a la horda entera, y son muchísimos segundos: dan
// para cruzar el anfiteatro de lado a lado, rematar a un élite y levantar a
// quien se ha quedado en el suelo, todo en la misma parada. Por eso es el
// consumible más raro de los cinco (ver tipoConsumible en entidades/cofre.js).
// Cuántos son exactamente, en PARALISIS_RELOJ, unas líneas más abajo.
//
// Y mientras dura, la horda congelada NO ES UN OBSTÁCULO: se la atraviesa
// andando y no hace daño al tocarla (ver contactoJugador y apartarDelJugador en
// sistemas/colisiones.js). Es lo que convierte el objeto en la salida de
// verdad del peor momento de la partida: quedar rodeado y que los cuerpos
// siguieran siendo pared dejaba el pánico intacto, solo que en silencio.
// Ha ido 6 -> 12 -> 24 -> 19 -> 10, y el recorte se decidió con la cuenta atrás
// ya en pantalla: viéndola correr se nota el momento exacto en que el objeto
// deja de resolver nada y pasa a ser un paseo por un decorado quieto. Con
// veinticuatro eso ocurría a media cuenta.
//
// Diez es además el número que mejor lee el propio display: entra en 0:10 y
// baja de dos cifras a una, así que se ve de un vistazo en qué mitad de la
// parada estás sin llegar a leer el número.
//
// Congela a la horda ENTERA, incluida la que aparezca durante esos segundos:
// ver `paralizarTodos` en entidades/enemigo.js.
const PARALISIS_RELOJ = 10;
// Las monedas se cobran FUERA de la partida: van al progreso META y siguen ahí
// mañana. Es el único consumible que no cambia nada de lo que está pasando.
const DENARIOS_MONEDAS = 10;
// Lo que da la tecla D en la tienda. Atajo de prueba: ver entradaTienda.
const DENARIOS_PRUEBA = 1000;
const CADENCIA_LLAMARADA = 0.16;
const DANYO_LLAMARADA = 26;
// El verde del anillo de curación. Es el único verde de los efectos del jugador
// y por eso no hace falta más para que se lea como "te has curado".
const COLOR_CURA = '#7ce08a';
// Y los otros dos anillos de consumible: el azul frío del imán —el mismo color
// con el que brilla el jugador al absorber gemas— y el oro del denario.
const COLOR_HALO_IMAN = '#7ac4ff';
const COLOR_DENARIO = '#e8b73a';

// Efecto INSTANTÁNEO al recogerlos: no se eligen, no ocupan ranura y no abren
// ninguna pantalla. Lo único que deciden es si merece la pena desviarse a por
// ellos ahora, y esa decisión se toma corriendo.
function usarConsumible(jugador, tipo) {
  if (tipo === IMAN) {
    // Todas las gemas del mapa vuelan hacia quien lo recoge. Con el campo de
    // gemas que deja una partida avanzada, esto son varios niveles de golpe.
    recogibles.atraerTodas(jugador);
    VFX.congelar(0.05);
    // Un anillo ANCHO, que es el tamaño de lo que acaba de pasar: no ha curado
    // ni ha subido nada, ha barrido el mapa entero. Y con las estelas de las
    // gemas (entidades/recogible.js) lo que viene después ya se ve solo.
    VFX.anillo(jugador.x, jugador.y - 10, 90, COLOR_HALO_IMAN, 2.5, 0.55);
    return;
  }

  if (tipo === COMIDA) {
    const antes = jugador.vida;
    jugador.vida = Math.min(jugador.vidaMaxima, jugador.vida + CURA_COMIDA);
    // Curarse era el único consumible completamente mudo: la barra de la esquina
    // subía y ya. Un anillo verde en el sitio, y las chispas SUBIENDO igual que
    // en la subida de nivel, que es el idioma de lo que te entra. El anillo sale
    // aunque estuvieras a vida llena —la comida se ha gastado y hay que verlo—
    // pero las chispas no: si no ha curado nada, no hay nada que celebrar.
    VFX.anillo(jugador.x, jugador.y - 10, 30, COLOR_CURA, 2, 0.4);
    if (jugador.vida > antes && !Particulas.saturado()) {
      Particulas.chorro(jugador.x, jugador.y - 10, 0, -1, 7, 45, 0.9, 0.5, 1.5,
                        COLOR_CHISPA, 0.1, rng);
    }
    GestorAudio.abrirCofre();
    return;
  }

  if (tipo === RELOJ) {
    // Se para la horda ENTERA, esté donde esté: no es un área alrededor de quien
    // lo recoge. Un radio convertiría el objeto en "colócate bien antes de
    // cogerlo", y lo que tiene que ser es el botón de pánico que te saca del
    // peor momento de la partida.
    enemigos.paralizarTodos(PARALISIS_RELOJ);
    GestorAudio.abrirCofre();
    return;
  }

  if (tipo === MONEDAS) {
    MetaProgreso.ganar(DENARIOS_MONEDAS);
    GestorAudio.abrirCofre();
    // El único consumible cuyo premio no está en la partida sino en la cuenta
    // de denarios, o sea en la esquina de arriba. El anillo dorado en el sitio
    // es lo que conecta las dos cosas: pasa aquí, se apunta allí.
    VFX.anillo(jugador.x, jugador.y - 10, 26, COLOR_DENARIO, 2, 0.4);
    return;
  }

  // LLAMARADA: no es un efecto y ya, es un ARMA PRESTADA durante ocho segundos.
  // Mientras dura, el jugador escupe fuego hacia donde mira, y como el fuego
  // sale en la dirección en que se avanza, apuntarlo es moverse. Esos ocho
  // segundos cambian cómo juegas: se pasa de esquivar a barrer.
  jugador.llamarada = DURACION_LLAMARADA;
  VFX.sacudir(2.5);
}

// Un chorro de fuego por delante del jugador mientras le dure la llamarada. Se
// resuelve como zonas cortas encadenadas, que es lo que ya sabe hacer daño en
// área: tres por disparo, cada vez más anchas, y una cadencia rápida para que se
// lea como un chorro continuo y no como tres bombas.
function actualizarLlamarada(dt) {
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (j.llamarada <= 0) continue;
    j.llamarada -= dt;
    j.relojLlamarada -= dt;
    if (j.relojLlamarada > 0) continue;
    j.relojLlamarada = CADENCIA_LLAMARADA;

    // Dirección: hacia donde se mueve; si está parado, hacia donde mira. Igual
    // que el arco de melé, para que las dos cosas se apunten igual.
    let ax = j.x - j.xPrev;
    let ay = j.y - j.yPrev;
    if (Math.abs(ax) < 0.0001 && Math.abs(ay) < 0.0001) {
      ax = j.mirandoDerecha ? 1 : -1;
      ay = 0;
    }
    const m = hipot(ax, ay) || 1;
    ax /= m; ay /= m;

    for (let k = 0; k < 3; k++) {
      const avance = 22 + k * 26;
      zonas.crear({
        duenyo: j,
        x: j.x + ax * avance,
        y: j.y - 4 + ay * avance,
        radio: 20 + k * 6, radioIni: 6,
        duracion: 0.3,
        danyo: DANYO_LLAMARADA, empuje: 120,
        modo: 'onda', color: '#ff7a2a', relleno: 0.4,
        // La misma llamarada que sueltan la mantícora y el Cerbero. Es fuego
        // que brota del suelo, que es exactamente lo que hace este consumible:
        // no hacía falta hoja nueva, hacía falta usar la que ya estaba.
        sprite: 'reventonLlama'
      });
    }
  }
}

// Aparecen alrededor de la CÁMARA, no de un jugador concreto: con el grupo
// repartido por la pantalla, anclarlo a uno dejaría el borde opuesto vacío.
function tanda(cantidad, mezcla) {
  aparecerTanda(enemigos, camara, cantidad, mezcla, rng);
}

// --- Título y selección de personaje -----------------------------------------

// MENÚ PRINCIPAL. Sustituye al "pulsa cualquier tecla" de antes: ahora hay
// cuatro sitios a los que ir y hay que poder elegir.
//
// Se mueve con arriba/abajo o la cruceta, y también con el stick, porque el
// menú es lo primero que toca alguien que acaba de enchufar un mando.
// LAS TRES PARTIDAS. Arriba y abajo para señalar, Enter o A para entrar con
// ella, y Supr o X para borrarla — con su aviso delante, que es el único sitio
// desde el que se borra desde que dejó de haber un "empezar de cero" global.
//
// De aquí NO SE SALE hacia atrás: es la primera pantalla con la que se topa el
// jugador y detrás solo está la intro, que ya pasó. Sin partida elegida no hay
// menú al que ir, porque el menú enseña denarios y la tienda los gasta.
function entradaHuecos() {
  const c0 = entrada.controles[0];
  // Una sola llamada por eje y frame: `flancoEje` guarda estado y llamarlo dos
  // veces se comería su propio flanco.
  const ejeV = c0 ? c0.flancoEje(false) : 0;
  const ejeH = c0 ? c0.flancoEje(true) : 0;

  // TODOS los flancos se consumen ANTES de decidir nada. Encadenarlos con `||`
  // cortocircuita —si el primero es cierto, el segundo no llega a consumirse—
  // y esa pulsación se quedaría en la cola para la pantalla siguiente.
  const tArriba = entrada.consumirFlanco('ArrowUp');
  const tAbajo = entrada.consumirFlanco('ArrowDown');
  const tIzq = entrada.consumirFlanco('ArrowLeft');
  const tDer = entrada.consumirFlanco('ArrowRight');
  const tEsc = entrada.consumirFlanco('Escape');
  const tEnter = entrada.consumirFlanco('Enter');
  const tEspacio = entrada.consumirFlanco('Space');
  const mArriba = c0 ? c0.consumirBoton(12) : false;
  const mAbajo = c0 ? c0.consumirBoton(13) : false;
  const mIzq = c0 ? c0.consumirBoton(14) : false;
  const mDer = c0 ? c0.consumirBoton(15) : false;
  const mA = c0 ? c0.consumirBoton(0) : false;
  const mAtras = entrada.consumirAtras();

  // CON EL CARTEL DE GITHUB PUESTO, la entrada es suya entera: solo se puede
  // cancelar. Igual que el aviso de confirmar borrado más abajo, pero sin
  // botones que recorrer —aquí no hay más que una salida—. Cerrar el popup a
  // mano no hace falta limpiar nada más: el reloj de `conectarConGithub()`
  // se entera solo en su próxima pasada y hace la misma limpieza que si se
  // hubiera cerrado de cualquier otra forma.
  if (nubeConectando) {
    if (tEsc || mAtras) {
      if (nubePopup && !nubePopup.closed) nubePopup.close();
    }
    return;
  }

  // LA NUBE: llevarte tu código o traer el de otro sitio.
  //
  // Va con letras y no con una opción más en la lista porque no es del camino
  // normal: se usa una vez, el día que te sientas en otro ordenador. Quien no
  // sepa que existe juega igual y su partida se sincroniza sola.
  //
  // Se atiende ANTES del aviso de borrado a propósito no: se atiende después,
  // porque con el aviso abierto la entrada es suya entera. Por eso está aquí
  // arriba solo la lectura, y el efecto va debajo.
  if (!confirmarBorrado && Nube.URL_NUBE) {
    if (entrada.consumirFlanco('KeyC')) {
      RedConsola.copiar(Nube.codigo()).then((ok) => {
        nubeAviso = ok ? 'Tu código está copiado: guárdalo.'
                       : 'No he podido copiarlo. Está escrito aquí abajo.';
      });
      return;
    }
    if (entrada.consumirFlanco('KeyV')) {
      pegarCodigoDeNube();
      return;
    }
    if (entrada.consumirFlanco('KeyG')) {
      conectarConGithub();
      return;
    }
  }

  // Con el aviso abierto, la entrada es suya entera: solo se puede decir sí o
  // no. Se atiende con los flancos YA consumidos arriba.
  if (confirmarBorrado) {
    if (tIzq || mIzq || ejeH < 0) cursorConfirmar = CONFIRMAR_CANCELAR;
    if (tDer || mDer || ejeH > 0) cursorConfirmar = CONFIRMAR_BORRAR;

    // Esc y B cancelan de una, sin pasar por el botón: es el gesto de cerrar
    // que vale en todas las ventanas del juego.
    if (tEsc || mAtras) { confirmarBorrado = false; return; }

    if (tEnter || tEspacio || mA) {
      if (cursorConfirmar === CONFIRMAR_BORRAR) {
        MetaProgreso.borrarHueco(cursorHueco);
        refrescarHuecos();
        // El botón que se acaba de usar ya no está dibujado —la partida está
        // vacía— así que el cursor vuelve a la fila.
        enBorrarHueco = false;
        Mascotas.releer(null);
        mascotasElegidas.fill('');
      }
      confirmarBorrado = false;
    }
    return;
  }

  const n = MetaProgreso.NUM_HUECOS;
  // LA FILA DE GITHUB ENTRA EN EL MISMO CICLO, arriba de la primera partida,
  // pero solo si hay nube: sin ella no hay nada que conectar y esta pantalla
  // se mueve exactamente como antes de que existiera. Se cuenta como una
  // posición más —`total = n + 1`— con la fila de GitHub en la posición 0,
  // así que subir desde la partida 1 entra en ella y subir desde ella da la
  // vuelta a la partida 3, sin casos sueltos para cada borde.
  if (Nube.URL_NUBE) {
    const total = n + 1;
    let pos = enFilaGithub ? 0 : cursorHueco + 1;
    if (tAbajo || mAbajo || ejeV > 0) pos = (pos + 1) % total;
    if (tArriba || mArriba || ejeV < 0) pos = (pos + total - 1) % total;
    enFilaGithub = pos === 0;
    if (!enFilaGithub) cursorHueco = pos - 1;
  } else {
    if (tAbajo || mAbajo || ejeV > 0) cursorHueco = (cursorHueco + 1) % n;
    if (tArriba || mArriba || ejeV < 0) cursorHueco = (cursorHueco + n - 1) % n;
  }

  // A la DERECHA está el botón de borrar, y solo existe si la partida existe.
  // Al cambiar de fila hay que comprobarlo otra vez: bajando de una partida
  // jugada a un hueco vacío, el cursor se quedaría sobre un botón que no está
  // dibujado. Y nada de esto aplica en la fila de GitHub: ahí no hay nada que
  // borrar.
  if (!enFilaGithub) {
    if (tDer || mDer || ejeH > 0) enBorrarHueco = true;
    if (tIzq || mIzq || ejeH < 0) enBorrarHueco = false;
    if (!huecoOcupado(cursorHueco)) enBorrarHueco = false;
  }

  if (tEnter || tEspacio || mA) {
    if (enFilaGithub) {
      conectarConGithub();
      return;
    }
    if (enBorrarHueco) {
      confirmarBorrado = true;
      cursorConfirmar = CONFIRMAR_CANCELAR;
      return;
    }
    MetaProgreso.usar(cursorHueco);
    Mascotas.releer(null);
    mascotasElegidas.fill('');
    cursorMenu = 0;
    irA(PANTALLA_TITULO);
  }
}

function entradaTitulo() {
  const c = entrada.controles[0];
  const eje = c ? c.flancoEje(false) : 0;      // vertical
  const n = MENU.length;

  if (entrada.consumirFlanco('ArrowDown') || (c && c.consumirBoton(13)) || eje > 0) {
    cursorMenu = (cursorMenu + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowUp') || (c && c.consumirBoton(12)) || eje < 0) {
    cursorMenu = (cursorMenu + n - 1) % n;
  }

  // Atajo que ya existía y se conserva: T entra directo a la tienda.
  if (entrada.consumirFlanco('KeyT')) { pestanyaTienda = PESTANYA_POTENCIADORES; cursorTienda = 0; irA(PANTALLA_TIENDA); return; }

  // GALERÍA (temporal): G entra directa, igual que T entra a la tienda.
  if (entrada.consumirFlanco('KeyG')) { seccionGaleria = 0; cursorGaleria = 0; irA(PANTALLA_GALERIA); return; }

  const acepta = entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
                 (c && c.consumirBoton(0));
  if (!acepta) return;

  switch (MENU[cursorMenu].id) {
    case 'jugar':
      irASeleccion();
      break;
    case 'red':
      irARed(PANTALLA_TITULO);
      break;
    case 'tienda':
      pestanyaTienda = PESTANYA_POTENCIADORES;
      cursorTienda = 0;
      irA(PANTALLA_TIENDA);
      break;
    case 'config':
      cursorConfig = 0;
      confirmarBorrado = false;
      irA(PANTALLA_CONFIG);
      break;
    case 'galeria':               // GALERÍA (temporal)
      seccionGaleria = 0;
      cursorGaleria = 0;
      irA(PANTALLA_GALERIA);
      break;
    case 'salir':
      salirDelJuego();
      break;
    case 'partidas':
      cursorHueco = MetaProgreso.hueco >= 0 ? MetaProgreso.hueco : 0;
      refrescarHuecos();
      enBorrarHueco = false;
      enFilaGithub = false;
      irA(PANTALLA_HUECOS);
      break;
  }
}

// Entrar a elegir personaje con la mesa limpia. Se llega desde el menú (con un
// solo nivel abierto) y desde la pantalla de niveles, y las dos tienen que
// dejar los puestos igual: si una de las dos se olvidara de vaciarlos, la
// partida arrancaría con los jugadores de la anterior.
function irASeleccion() {
  puestos.fill(null);
  puestos[0] = { personaje: primeroDesbloqueado(), listo: false };
  irA(PANTALLA_SELECCION);
}

// VOLVER A ELEGIR HÉROE, desde mascotas o desde la lista de niveles.
//
// Hay que DESCONFIRMAR A TODOS, y sin eso no se volvía. La pantalla de
// personajes sale sola en cuanto todos están listos —esa es su condición de
// salida— y al llegar más adelante todos lo estaban: se volvía a personajes y
// en el mismo fotograma la salida disparaba otra vez hacia delante. ESC parecía
// no hacer nada, cuando lo que pasaba era que ibas y volvías sin ver nada.
//
// Se desconfirman TODOS y no solo el primero porque eso es lo que significa
// salir de donde se sale: volver a elegir héroes.
function volverAElegirPersonajes() {
  for (let i = 0; i < puestos.length; i++) {
    if (puestos[i]) puestos[i].listo = false;
  }
  mascotasElegidas.fill('');
  irA(PANTALLA_SELECCION);
}

// LO ÚLTIMO ANTES DE JUGAR: elegir dónde. Se llega aquí desde mascotas, o
// directamente desde personajes cuando no hay ninguna mascota comprada.
//
// Viene señalado el nivel EN CURSO —el de la partida anterior, o el primero al
// arrancar—, que es el que casi siempre se va a volver a jugar.
function irAElegirNivel() {
  cursorNivel = Math.max(0, Niveles.lista.indexOf(nivelActual));
  pedirVista(nivelActual);
  irA(PANTALLA_NIVELES);
}

// --- Elegir nivel ------------------------------------------------------------
// La lista tal y como la quiere la pantalla: el nivel, si está abierto y —si no
// lo está— el NOMBRE de lo que hay que terminar para abrirlo. El nombre se
// resuelve aquí y no en ui/ porque es el índice quien sabe qué nivel es cuál;
// la pantalla solo lo escribe.
function listaDeNiveles() {
  const filas = Niveles.lista.map((nivel) => {
    const previo = nivel.requiere ? Niveles.por(nivel.requiere) : null;
    return {
      nivel,
      nombre: nivel.nombre,
      subtitulo: nivel.subtitulo,
      minutos: Math.round(nivel.duracion / 60),
      abierto: Niveles.abierto(nivel, MetaProgreso.fases),
      requiereNombre: previo ? previo.nombre : ''
    };
  });
  // Y detrás, el camino que queda. `nivel` a null es lo que distingue un sitio
  // anunciado de uno escrito: no hay adónde entrar.
  for (let i = 0; i < PROXIMOS.length; i++) {
    filas.push({ nivel: null, nombre: PROXIMOS[i].nombre, abierto: false });
  }
  return filas;
}

function entradaNiveles() {
  // Mientras carga el suelo no se atiende a nada: la pulsación que llegara aquí
  // se quedaría en la cola y dispararía sola en la pantalla siguiente.
  if (cambiandoNivel) return;

  const c = entrada.controles[0];
  const eje = c ? c.flancoEje(false) : 0;
  // EL CURSOR PASA POR TODO, también por lo cerrado y por lo que todavía no
  // existe: es la única forma de leer qué hace falta para abrirlo. Lo que no se
  // puede es ENTRAR, y de eso se encarga la comprobación de más abajo. Mismo
  // criterio que la pantalla de héroes con los que no están desbloqueados.
  const n = listaDeNiveles().length;

  const antes = cursorNivel;
  if (entrada.consumirFlanco('ArrowDown') || (c && c.consumirBoton(13)) || eje > 0) {
    cursorNivel = (cursorNivel + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowUp') || (c && c.consumirBoton(12)) || eje < 0) {
    cursorNivel = (cursorNivel + n - 1) % n;
  }
  // EL MAPA DEL SITIO SEÑALADO SE PIDE AL SEÑALARLO, no al dibujar. La ventana
  // de la derecha enseña el suelo del nivel, y ese suelo es una imagen que hay
  // que traer: pedirla desde el dibujado sería lanzarla sesenta veces por
  // segundo. Ver `pedirVista` en ui/niveles.js, que además solo la trae la
  // primera vez.
  if (cursorNivel !== antes) {
    const fila = listaDeNiveles()[cursorNivel];
    if (fila && fila.nivel) pedirVista(fila.nivel);
  }

  // Atrás: a volver a elegir héroes. No al título — de aquí no se sale del
  // recorrido de una partida, se retrocede un paso dentro de él.
  if (entrada.consumirFlanco('Escape') || entrada.consumirAtras()) {
    volverAElegirPersonajes();
    return;
  }

  const acepta = entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
                 (c && c.consumirBoton(0));
  if (!acepta) return;

  const fila = listaDeNiveles()[cursorNivel];
  // Un sitio cerrado —o uno que todavía no está escrito— se puede señalar, para
  // leer qué hace falta, pero no se entra.
  if (!fila.nivel || !fila.abierto) return;
  const elegido = fila.nivel;

  // Ya cargado: se pasa de largo sin esperar a nada. Es el caso normal, porque
  // el nivel en curso es el que viene señalado al entrar.
  if (elegido === nivelActual) { contarLaHistoria(); return; }

  cambiandoNivel = true;
  usarNivel(elegido).then(() => {
    cambiandoNivel = false;
    contarLaHistoria();
  });
}

// La historia del sitio, y después la partida. Un nivel que no tenga nada
// escrito se salta la pantalla: una placa vacía subiendo por la piedra durante
// veinte segundos es peor que no enseñarla.
function contarLaHistoria() {
  if (!Historia.hay(nivelActual)) { empezarPartida(); return; }
  Historia.iniciar(nivelActual);
  irA(PANTALLA_HISTORIA);
}

// SALIR de un juego que corre en una pestaña.
//
// `window.close()` solo funciona en ventanas que ha abierto un script, y esta
// la ha abierto una persona escribiendo una dirección, así que el navegador lo
// ignora en silencio. Se intenta igualmente —si alguien lanza el juego desde un
// acceso directo en modo aplicación, sí cierra— y si no, se deja la pantalla
// diciendo que ya se puede cerrar la pestaña. Fingir que el botón hace algo que
// no puede hacer sería peor que decirlo.
let despedida = false;
function salirDelJuego() {
  MetaProgreso.guardar();
  GestorAudio.pararMusica();
  despedida = true;
  window.close();
}

// Primer personaje que se pueda usar. Hoy los cuatro están desbloqueados (ver
// `coste` en datos/personajes.js), pero si alguno se pone de pago el menú no
// puede arrancar con el cursor encima de uno que no es tuyo.
function primeroDesbloqueado() {
  for (let p = 0; p < ORDEN_PERSONAJES.length; p++) {
    if (MetaProgreso.heroeDesbloqueado(ORDEN_PERSONAJES[p])) return p;
  }
  return 0;
}

// --- Elección de mascota ------------------------------------------------------
// Se pasa por aquí después de elegir personaje y solo si hay alguna comprada.
// Cada jugador elige la suya por turnos, y no se puede repetir: una mascota que
// ya lleva otro se salta al mover el cursor.
function entradaMascotas() {
  const c = entrada.controles[turnoMascota] || entrada.controles[0];
  // El teclado lleva al jugador 1 SIEMPRE, y además a cualquiera que no tenga
  // mando enchufado. Aquí se puede y en la selección de personaje no, porque
  // esto va POR TURNOS: solo hay un jugador eligiendo a la vez, así que el
  // teclado no puede estar moviendo dos cursores.
  //
  // Sin esto, un segundo jugador añadido con J —que es como se prueba el
  // cooperativo sin cuatro mandos— no podía elegir mascota y la pantalla se
  // quedaba muerta, igual que pasaba con la de personajes antes de la tecla H.
  const c0 = entrada.controles[0];
  const teclado = turnoMascota === 0 || !(c && c.conectado);
  const disponibles = mascotasDisponibles();
  const n = disponibles.length;

  if ((teclado && entrada.consumirFlanco('Escape')) || (c && c.consumirBoton(1))) {
    // Atrás: al jugador anterior, o de vuelta a elegir personaje.
    if (turnoMascota > 0) {
      turnoMascota = turnoAnterior(turnoMascota);
      mascotasElegidas[turnoMascota] = '';
      cursorMascota = 0;
    } else {
      // VOLVER A PERSONAJES ES DESCONFIRMARLOS, y sin esto no se volvía.
      //
      // La pantalla de personajes sale sola en cuanto TODOS están listos —esa
      // es su condición de salida— y al llegar aquí todos lo estaban. Así que
      // se volvía a personajes y en el mismo fotograma la salida disparaba otra
      // vez hacia aquí: ESC parecía no hacer nada, cuando lo que pasaba era que
      // ibas y volvías sin llegar a ver nada.
      //
      // Se desconfirman todos y no solo el primero porque eso es lo que
      // significa salir de aquí: volver a elegir héroes. Para cambiar solo el
      // tuyo sin tocar el de nadie ya está el atrás de dentro de esta pantalla,
      // que va al jugador anterior.
      volverAElegirPersonajes();
    }
    return;
  }

  const eje = c ? c.flancoEje(true) : 0;
  if ((teclado && entrada.consumirFlanco('ArrowRight')) || (c && c.consumirBoton(15)) || eje > 0) {
    cursorMascota = (cursorMascota + 1) % (n + 1);
  }
  if ((teclado && entrada.consumirFlanco('ArrowLeft')) || (c && c.consumirBoton(14)) || eje < 0) {
    cursorMascota = (cursorMascota + n) % (n + 1);
  }

  const acepta = (teclado && (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space'))) ||
                 (c && c.consumirBoton(0));
  if (!acepta) return;

  // El último hueco de la lista es SIN MASCOTA. Existe porque llevar una es una
  // elección, y una elección sin la opción de no elegir no lo es.
  mascotasElegidas[turnoMascota] = cursorMascota < n ? disponibles[cursorMascota] : '';

  const siguiente = turnoSiguiente(turnoMascota);
  if (siguiente < 0) irAElegirNivel();
  else { turnoMascota = siguiente; cursorMascota = 0; }
}

// Mascotas que este jugador puede elegir: las compradas menos las que ya lleva
// otro. Se recalcula en cada paso y no se guarda, que son ocho elementos.
function mascotasDisponibles() {
  const libres = [];
  for (const id of ORDEN_MASCOTAS) {
    if (!MetaProgreso.tieneMascota(id)) continue;
    let cogida = false;
    for (let i = 0; i < mascotasElegidas.length; i++) {
      if (i !== turnoMascota && mascotasElegidas[i] === id) { cogida = true; break; }
    }
    if (!cogida) libres.push(id);
  }
  return libres;
}

function turnoSiguiente(desde) {
  for (let i = desde + 1; i < puestos.length; i++) if (puestos[i]) return i;
  return -1;
}

function turnoAnterior(desde) {
  for (let i = desde - 1; i >= 0; i--) if (puestos[i]) return i;
  return 0;
}

// --- Configuración ------------------------------------------------------------
// Vídeo, sonido y el botón de empezar de cero.
// Los ajustes. "Empezar de cero" ya no está aquí: se fue al menú principal como
// botón de su esquina (ver MENU), que es donde lo quería Sergio. Y tiene razón:
// borrar el progreso de todas las partidas no es un ajuste que se toque al lado
// del volumen, y menos ahora que esta pantalla se abre TAMBIÉN desde dentro de
// una partida en marcha.
const CONFIG = [
  { id: 'musica',    texto: 'Música' },
  { id: 'efectos',   texto: 'Efectos' },
  { id: 'pantalla',  texto: 'Pantalla completa' },
  // No es un ajuste: no cambia nada, ABRE una pantalla. Va en esta lista igual
  // porque es donde la buscaría cualquiera, y porque la alternativa —una quinta
  // opción en la lápida del título— es repintar la ilustración.
  { id: 'controles', texto: 'Controladores' },
  { id: 'volver',    texto: 'Volver' }
];

// El cursor de la pantalla de controladores. Aparte del de la configuración:
// son dos listas distintas y volver de una a otra tiene que dejar cada cursor
// donde estaba.
let cursorControl = 0;
// Y si está esperando a que se pulse algo para asignarlo.
let capturandoControl = false;

// La configuración abierta DESDE LA PARTIDA. No es una pantalla más del bucle
// —el estado sigue siendo PANTALLA_JUEGO, con el mundo congelado detrás— porque
// salir de ella tiene que devolver a la pausa, no al menú.
let configEnPartida = false;

// La misma lista de ajustes se usa desde el menú y desde dentro de una partida.
// `cerrar` es lo único que cambia: en el menú vuelve al título y en la partida
// vuelve a la pausa.
function entradaConfig(cerrar) {
  const c = entrada.controles[0];
  const n = CONFIG.length;
  if (entrada.consumirFlanco('Escape') || entrada.consumirAtras()) { cerrar(); return; }

  const ejeV = c ? c.flancoEje(false) : 0;
  if (entrada.consumirFlanco('ArrowDown') || (c && c.consumirBoton(13)) || ejeV > 0) {
    cursorConfig = (cursorConfig + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowUp') || (c && c.consumirBoton(12)) || ejeV < 0) {
    cursorConfig = (cursorConfig + n - 1) % n;
  }

  const id = CONFIG[cursorConfig].id;
  const ejeH = c ? c.flancoEje(true) : 0;
  const menos = entrada.consumirFlanco('ArrowLeft') || (c && c.consumirBoton(14)) || ejeH < 0;
  const mas = entrada.consumirFlanco('ArrowRight') || (c && c.consumirBoton(15)) || ejeH > 0;
  const acepta = entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
                 (c && c.consumirBoton(0));

  if (id === 'musica' && (menos || mas)) GestorAudio.ajustarMusica(mas ? 0.1 : -0.1);
  if (id === 'efectos' && (menos || mas)) GestorAudio.ajustarEfectos(mas ? 0.1 : -0.1);
  if (id === 'pantalla' && (acepta || menos || mas)) alternarPantallaCompleta();
  if (id === 'controles' && acepta) {
    cursorControl = 0;
    capturandoControl = false;
    irA(PANTALLA_CONTROLES);
  }
  if (id === 'volver' && acepta) cerrar();
}

// CONTROLADORES. Se recorre, se cambia lo que se quiera y se sale a la
// CONFIGURACIÓN, que es de donde se viene.
//
// ESTA PANTALLA SE MANEJA EN CRUDO, sin pasar por las asignaciones del jugador,
// y es a propósito: aquí es donde se cambian, así que si respetara lo asignado
// alguien podría dejarse sin manera de salir. Las flechas, Enter y Esc mandan
// siempre dentro de ella, se haya puesto lo que se haya puesto.
function entradaControles() {
  const c = entrada.controles[0];
  const n = numeroDeFilas();

  // --- Esperando a que se pulse algo ---------------------------------------
  if (capturandoControl) {
    // Esc cancela, y por eso se mira ANTES: si no, se asignaría Esc.
    if (entrada.consumirFlanco('Escape', -1, true)) { capturandoControl = false; return; }

    const a = ACCIONES[cursorControl];
    const tecla = entrada.teclaCruda();
    if (tecla) {
      entrada.consumirFlanco(tecla, -1, true);
      Controles.asignarTecla(a.id, tecla);
      capturandoControl = false;
      return;
    }
    // El mando, salvo en las direcciones: ahí van al stick y a la cruceta, y
    // cambiar «cruceta arriba» por «botón B» no es algo que nadie quiera.
    if (!a.fijoEnMando && c) {
      const boton = entrada.botonCrudo();
      if (boton >= 0) {
        c.consumirBoton(boton);
        Controles.asignarBoton(a.id, boton);
        capturandoControl = false;
      }
    }
    return;
  }

  // --- Recorriendo ----------------------------------------------------------
  const ejeV = c ? c.flancoEje(false) : 0;
  const abajo = entrada.consumirFlanco('ArrowDown', -1, true) ||
                (c && c.consumirBoton(13)) || ejeV > 0;
  const arriba = entrada.consumirFlanco('ArrowUp', -1, true) ||
                 (c && c.consumirBoton(12)) || ejeV < 0;
  const acepta = entrada.consumirFlanco('Enter', -1, true) || (c && c.consumirBoton(0));
  const sale = entrada.consumirFlanco('Escape', -1, true) || (c && c.consumirBoton(1));

  if (abajo) cursorControl = (cursorControl + 1) % n;
  if (arriba) cursorControl = (cursorControl + n - 1) % n;

  if (acepta) {
    if (cursorControl < ACCIONES.length) capturandoControl = true;
    else Controles.restablecer();
    return;
  }
  if (sale) irA(PANTALLA_CONFIG);
}

// Tienda: un cursor, comprar con Enter/A, Esc/B o T para volver al título. Las
// compras son denarios de progreso META (core/metaProgreso.js) — para
// siempre, no de esta partida — así que no hay nada que deshacer al salir.
//
// SE MANEJA CON EL MANDO ENTERO, no solo con las flechas del teclado: cruceta
// (botones 12-15 del mapeo estándar) y STICK IZQUIERDO. El stick hace falta
// aparte porque no es un botón sino un eje continuo, así que "moverlo abajo" no
// es un evento; `flancoEje` le pone histéresis y lo convierte en uno (ver
// core/entrada.js). Sin esto, quien acabara de enchufar un mando llegaba a la
// tienda y no podía moverse por ella.
//
// Los flancos se consumen TODOS antes de decidir nada. Encadenarlos con `||`
// cortocircuita —si el primero es cierto, el segundo no llega a consumirse— y
// esa pulsación se quedaría en la cola para dispararse en la pantalla siguiente.
// GALERÍA (temporal). Un cursor por una rejilla y tres pestañas: las flechas
// mueven casilla a casilla —y saltan de fila al llegar al borde, que es como se
// recorre una rejilla y no como se recorre una lista—, Tab cambia de pestaña y
// Esc vuelve al título. Ver js/ui/galeria.js.
function entradaGaleria() {
  const c = entrada.controles[0];
  const ejeV = c ? c.flancoEje(false) : 0;
  const ejeH = c ? c.flancoEje(true) : 0;

  const tDer = entrada.consumirFlanco('ArrowRight');
  const tIzq = entrada.consumirFlanco('ArrowLeft');
  const tAbajo = entrada.consumirFlanco('ArrowDown');
  const tArriba = entrada.consumirFlanco('ArrowUp');
  const tTab = entrada.consumirFlanco('Tab');
  const tEscape = entrada.consumirFlanco('Escape');
  const tGaleria = entrada.consumirFlanco('KeyG');
  const mAtras = entrada.consumirAtras();

  if (tEscape || tGaleria || mAtras) { irA(PANTALLA_TITULO); return; }

  // Tab y los gatillos hacen lo mismo: la siguiente pestaña. El cursor vuelve a
  // cero porque las tres listas no tienen ni la misma longitud ni el mismo
  // orden, igual que en la tienda.
  if (tTab || (c && (c.consumirBoton(4) || c.consumirBoton(5)))) {
    seccionGaleria = (seccionGaleria + 1) % NUM_SECCIONES;
    cursorGaleria = 0;
    return;
  }

  const n = tamanyoSeccion(seccionGaleria);
  const cols = columnasGaleria();
  if (tDer || (c && c.consumirBoton(15)) || ejeH > 0) cursorGaleria = (cursorGaleria + 1) % n;
  if (tIzq || (c && c.consumirBoton(14)) || ejeH < 0) cursorGaleria = (cursorGaleria + n - 1) % n;
  if (tAbajo || (c && c.consumirBoton(13)) || ejeV > 0) cursorGaleria = (cursorGaleria + cols) % n;
  if (tArriba || (c && c.consumirBoton(12)) || ejeV < 0) cursorGaleria = (cursorGaleria - cols + n * 2) % n;
}

function entradaTienda() {
  const c = entrada.controles[0];
  // Una sola llamada por eje y frame: `flancoEje` guarda estado y llamarlo dos
  // veces se comería su propio flanco.
  const ejeV = c ? c.flancoEje(false) : 0;
  const ejeH = c ? c.flancoEje(true) : 0;

  const tDer = entrada.consumirFlanco('ArrowRight');
  const tIzq = entrada.consumirFlanco('ArrowLeft');
  const tAbajo = entrada.consumirFlanco('ArrowDown');
  const tArriba = entrada.consumirFlanco('ArrowUp');
  const tEnter = entrada.consumirFlanco('Enter');
  const tEspacio = entrada.consumirFlanco('Space');
  const tEscape = entrada.consumirFlanco('Escape');
  const tTienda = entrada.consumirFlanco('KeyT');
  const tDinero = entrada.consumirFlanco('KeyD');
  const mAtras = entrada.consumirAtras();
  const mDer = c ? c.consumirBoton(15) : false;
  const mIzq = c ? c.consumirBoton(14) : false;
  const mAbajo = c ? c.consumirBoton(13) : false;
  const mArriba = c ? c.consumirBoton(12) : false;
  const mAcepta = c ? c.consumirBoton(0) : false;

  if (tEscape || tTienda || mAtras) {
    irA(PANTALLA_TITULO);
    return;
  }

  // D: MIL DENARIOS. Atajo de PRUEBA, como los del 1 al 8 de la partida, y por
  // eso vive en la tienda y no en el menú: es para poder comprobar que una
  // compra hace lo que dice sin jugarse veinte partidas antes de llegar a
  // pagarla. Se guarda en el acto porque lo primero que se hace después de
  // probar una compra es recargar para ver si se quedó.
  //
  // Está sin anunciar en ninguna pantalla a propósito: quien no sepa que existe
  // no se la encuentra sin querer, que es lo que se le pide a un atajo que
  // regala dinero.
  if (tDinero) {
    MetaProgreso.ganar(DENARIOS_PRUEBA);
    MetaProgreso.guardar();
  }

  // Cambiar de sección reinicia el cursor: las tres listas no tienen ni la
  // misma longitud ni el mismo orden, así que conservar la fila solo llevaría
  // a un sitio arbitrario.
  if (tDer || mDer || ejeH > 0) {
    pestanyaTienda = (pestanyaTienda + 1) % N_PESTANYAS; cursorTienda = 0; return;
  }
  if (tIzq || mIzq || ejeH < 0) {
    pestanyaTienda = (pestanyaTienda + N_PESTANYAS - 1) % N_PESTANYAS; cursorTienda = 0; return;
  }

  const lista = pestanyaTienda === PESTANYA_MASCOTAS ? ORDEN_MASCOTAS
              : pestanyaTienda === PESTANYA_PERSONAJES ? ORDEN_PERSONAJES
              : ID_POTENCIADORES;
  const n = lista.length;
  if (tAbajo || mAbajo || ejeV > 0) cursorTienda = (cursorTienda + 1) % n;
  if (tArriba || mArriba || ejeV < 0) cursorTienda = (cursorTienda + n - 1) % n;

  if (tEnter || tEspacio || mAcepta) {
    // El mismo boton compra o SUBE DE NIVEL segun toque, en las tres pestanas.
    // Para quien juega es el mismo gesto —pagar por tener mas— y separarlo en
    // "comprar" y "mejorar" solo anadiria un concepto.
    if (pestanyaTienda === PESTANYA_MASCOTAS) {
      MetaProgreso.comprarMascota(ORDEN_MASCOTAS[cursorTienda]);
    } else if (pestanyaTienda === PESTANYA_PERSONAJES) {
      MetaProgreso.comprarHeroe(ORDEN_PERSONAJES[cursorTienda]);
    } else {
      MetaProgreso.comprarPotenciador(ID_POTENCIADORES[cursorTienda]);
    }
  }
}

// Siguiente personaje LIBRE en la dirección dada. Dos jugadores no pueden
// llevar el mismo: cada personaje tiene su arma exclusiva (ver
// datos/personajes.js), así que repetir dejaría a dos con el mismo arsenal de
// salida y rompería lo que hace que el cooperativo se juegue distinto.
//
// POR LOS BLOQUEADOS SÍ SE PASA, y es lo que hace que el carrusel sirva de
// algo. Se probó al revés —el cursor los saltaba— y el resultado era que quien
// no había comprado a nadie no podía mover la tira ni un arco: los cuatro de
// pago existían en una pantalla que nadie podía llegar a ver. Se recorren, se
// ven en penumbra con su precio, y lo único que no se puede es confirmarlos.
function personajeLibre(indice, desde, paso) {
  const n = ORDEN_PERSONAJES.length;
  for (let k = 1; k <= n; k++) {
    const p = (desde + paso * k + n * n) % n;
    if (ocupantePersonaje(puestos, p) < 0) return p;
  }
  return desde;                       // todos cogidos: no se mueve
}

// Dónde se planta un jugador que acaba de sumarse: el primero que esté libre Y
// sea suyo. Aquí sí manda el desbloqueo, al revés que en el cursor — a nadie se
// le puede dejar empezado encima de un héroe que no ha comprado.
function primerLibre() {
  for (let p = 0; p < ORDEN_PERSONAJES.length; p++) {
    if (ocupantePersonaje(puestos, p) < 0 &&
        MetaProgreso.heroeDesbloqueado(ORDEN_PERSONAJES[p])) return p;
  }
  return -1;
}

function entradaSeleccion() {
  const hueco = primerLibre();

  // --- Altas ---------------------------------------------------------------
  // Un mando enchufado entra pulsando A o Start. Start (9) no lo reclama
  // ninguna otra pantalla de selección —solo abre pausa/ficha durante la
  // partida (ver el comentario de core/entrada.js)—, así que aquí es libre y
  // es el botón que casi todo el mundo prueba primero para "unirse". Con J
  // entra uno más por teclado, que es como se prueba el cooperativo sin
  // cuatro mandos encima de la mesa.
  if (hueco >= 0) {
    for (let i = 1; i < puestos.length; i++) {
      if (puestos[i]) continue;
      const c = entrada.controles[i];
      if (c && c.conectado && (c.consumirBoton(0) || c.consumirBoton(9))) {
        puestos[i] = { personaje: hueco, listo: false };
        focoSeleccion = hueco;
        break;
      }
    }
    if (entrada.consumirFlanco('KeyJ')) {
      for (let i = 1; i < puestos.length; i++) {
        if (!puestos[i]) {
          const libre = primerLibre();
          if (libre < 0) break;         // no queda ninguno suelto que sea suyo
          puestos[i] = { personaje: libre, listo: false };
          focoSeleccion = libre;
          break;
        }
      }
    }
  }

  // H quita el último, igual que en la partida. No es solo simetría: un puesto
  // añadido con J lo maneja el mando de ESE jugador, así que si se ha pulsado
  // sin tener el mando enchufado no puede confirmar nunca, y como la partida no
  // arranca hasta que están todos listos, la pantalla se quedaba muerta sin más
  // salida que recargar. Con H se deshace.
  if (entrada.consumirFlanco('KeyH')) {
    for (let i = puestos.length - 1; i >= 1; i--) {
      if (puestos[i]) { puestos[i] = null; break; }
    }
  }

  // --- Cada puesto con SU control ------------------------------------------
  for (let i = 0; i < puestos.length; i++) {
    const puesto = puestos[i];
    if (!puesto) continue;
    const c = entrada.controles[i];
    // El teclado es del jugador 1, igual que en la partida.
    const teclado = i === 0;

    // Atrás: deshace un paso cada vez. Confirmado -> sin confirmar; sin
    // confirmar -> se va (o vuelve al título, si es el jugador 1, que no puede
    // irse porque entonces no quedaría nadie).
    if ((teclado && entrada.consumirFlanco('Escape')) || (c && c.consumirBoton(1))) {
      if (puesto.listo) puesto.listo = false;
      else if (i > 0) puestos[i] = null;
      else { irA(PANTALLA_TITULO); return; }
      continue;
    }

    if (puesto.listo) continue;

    // El stick se lee UNA vez por paso: flancoEje consume estado.
    const eje = c ? c.flancoEje(true) : 0;
    // CADA MARCO TIENE SU CARRUSEL, y se le avisa de hacia dónde ha ido el
    // cursor: la dirección es lo único que el dibujado no puede deducir, porque
    // con los héroes que llevan otros jugadores fuera de la lista, el índice
    // puede saltar de 6 a 1 yendo hacia la derecha.
    if ((teclado && entrada.consumirFlanco('ArrowRight')) || (c && c.consumirBoton(15)) || eje > 0) {
      const previo = puesto.personaje;
      puesto.personaje = personajeLibre(i, previo, 1);
      if (puesto.personaje !== previo) Pantallas.deslizarPuesto(i, 1, previo);
      focoSeleccion = puesto.personaje;
    }
    if ((teclado && entrada.consumirFlanco('ArrowLeft')) || (c && c.consumirBoton(14)) || eje < 0) {
      const previo = puesto.personaje;
      puesto.personaje = personajeLibre(i, previo, -1);
      if (puesto.personaje !== previo) Pantallas.deslizarPuesto(i, -1, previo);
      focoSeleccion = puesto.personaje;
    }
    // CONFIRMAR, y solo si es suyo. Un héroe de pago se recorre pero no se
    // coge: la pantalla lo dice con su precio dentro del arco y con el renglón
    // del pie (ver dibujarSeleccion en ui/pantallas.js).
    if ((teclado && (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space'))) ||
        (c && c.consumirBoton(0))) {
      if (MetaProgreso.heroeDesbloqueado(ORDEN_PERSONAJES[puesto.personaje])) puesto.listo = true;
    }
  }

  // AL COOPERATIVO ONLINE, por atajo.
  //
  // Durante un tiempo esta fue la ÚNICA puerta, y no por gusto: las opciones de
  // la lápida vienen pintadas en la ilustración, así que añadir una al título
  // era repintar el arte. Ya está repintada —JUGAR EN RED, segundo renglón— y
  // esa es ahora la puerta que se ve.
  //
  // El atajo se queda: no estorba, está probado, y aquí encaja porque es donde
  // se decide quién juega.
  if (entrada.consumirFlanco('KeyO')) { irARed(PANTALLA_SELECCION); return; }

  // --- Salida ---------------------------------------------------------------
  const presentes = puestos.filter(Boolean);
  if (presentes.length > 0 && presentes.every((p) => p.listo)) {
    // Elegir mascota solo tiene sentido si hay alguna comprada. Sin ninguna se
    // salta la pantalla entera y se entra a jugar: una pantalla cuya unica
    // opcion es "ninguna" no es una eleccion, es un tramite.
    if (MetaProgreso.algunaMascota()) {
      mascotasElegidas.fill('');
      turnoMascota = puestos.findIndex(Boolean);
      cursorMascota = 0;
      irA(PANTALLA_MASCOTAS);
    } else {
      mascotasElegidas.fill('');
      irAElegirNivel();
    }
  }
}

// Crea de verdad a los jugadores elegidos y arranca. Hasta aquí no existía ni
// uno solo: los pools y el director ya estaban montados desde `arrancar`, pero
// `jugadores` estaba vacío a propósito, porque un jugador en pie durante el
// título es un jugador al que ya le está corriendo el reloj.
// PROGRESO META NEUTRO, y devuelto tal cual estaba.
//
// Lo usan dos cosas que parecen distintas y tienen el mismo problema: la prueba
// de determinismo y LA PARTIDA EN RED. Las mejoras compradas con denarios
// cambian la vida y el daño del personaje, así que dos máquinas con distinto
// progreso guardado simulan mundos distintos aunque todo lo demás sea correcto.
//
// Mientras dura, `MetaProgreso.guardar()` está congelado y no escribe: sin esa
// guarda, una partida en red sobrescribiría el hueco de verdad con el progreso
// falso.
//
// ES TEMPORAL PARA LA RED. Lo que toca al final no es jugar sin mejoras, sino
// que cada máquina conozca las del otro y las aplique a su personaje: que tú
// tengas más mejoras que tu hermana no rompe el lockstep, lo que lo rompe es que
// su máquina no sepa cuáles son. Eso viaja en el saludo, y el saludo es la fase
// siguiente.
function fijarMetaNeutra() {
  const previo = {
    denarios: MetaProgreso.denarios,
    personajes: MetaProgreso.personajes,
    potenciadores: MetaProgreso.potenciadores,
    mascotas: MetaProgreso.mascotas,
    mascotaEquipada: MetaProgreso.mascotaEquipada,
    factorDenarios: MetaProgreso.factorDenarios
  };
  MetaProgreso._congelado = true;
  MetaProgreso.denarios = 0;
  MetaProgreso.personajes = {};
  MetaProgreso.potenciadores = {};
  MetaProgreso.mascotas = {};
  MetaProgreso.mascotaEquipada = '';
  MetaProgreso.factorDenarios = 1;
  return previo;
}

function restaurarMeta(previo) {
  if (!previo) return;
  MetaProgreso.denarios = previo.denarios;
  MetaProgreso.personajes = previo.personajes;
  MetaProgreso.potenciadores = previo.potenciadores;
  MetaProgreso.mascotas = previo.mascotas;
  MetaProgreso.mascotaEquipada = previo.mascotaEquipada;
  MetaProgreso.factorDenarios = previo.factorDenarios;
  MetaProgreso._congelado = false;
}

// EMPEZAR UNA PARTIDA EN RED, las dos máquinas con lo mismo.
//
// Todo lo que decide cómo va a ser la partida viaja en el saludo y NO se decide
// aquí: la semilla del azar y qué personaje lleva cada puesto. Si cada máquina
// eligiera lo suyo, serían dos partidas distintas desde el primer fotograma.
// El progreso comprado de cada puesto, mientras dura una partida en red. Null
// fuera de ella: entonces cada jugador usa el de esta máquina, que es el suyo.
let metasDeRed = null;

// LA PANTALLA DE COOPERATIVO, en un solo sitio.
//
// `fase` dice qué se está enseñando y qué se puede hacer: 'menu', 'creando',
// 'uniendo', 'esperando' (ya hay código propio que mandar), 'pegar' (falta el
// del otro), 'conectado' y 'error'.
const red = {
  fase: 'menu', cursor: 0, codigo: '', copiado: false,
  // Lo que ha salido de medir la conexión al abrirse: fotogramas de retardo y
  // la ida y vuelta con que se eligieron. Cero mientras no se haya medido.
  retardo: 0, rtt: 0,
  aviso: '', esAnfitrion: false, conectados: 0,
  // Lo que se sabe de la conexión antes de intentarla: ver `avisoDeConexion` en
  // red/consola.js. Null mientras no haya nada que decir, que es lo normal.
  avisoConexion: null,
  // La dirección de casa escrita a mano y lo que se lleva tecleado de ella.
  ipLocal: '', ipTecleada: '',
  // ¿Esto es un reenganche a una partida caída, o una partida nueva? El baile de
  // códigos es el mismo; lo que pasa al final, no.
  reenganche: false
};

// SE HA CAÍDO LA RED EN PLENA PARTIDA.
//
// Hasta ahora esto se decía por la consola, que es como no decirlo: quien está
// jugando ve el mundo congelado y no sabe si ha sido su wifi, el del otro o un
// fallo del juego. Ahora sale un cartel con el motivo y dos salidas.
//
// El mundo se queda quieto mientras el cartel está puesto, igual que con la
// pausa: no tendría sentido seguir jugando una partida que ya no es de dos
// mientras decides si quieres seguir jugándola.
let caidaRed = '';
let cursorCaida = 0;
// Qué puesto llevaba esta máquina, para poder quedarse con ese jugador si se
// decide seguir en solitario. Se apunta al empezar porque `Sincro` lo olvida al
// pararse.
let puestoLocalRed = 0;

// LA SEMILLA DE ESTA PARTIDA, guardada para el reenganche.
//
// Antes se usaba y se tiraba: sembraba el RNG y ahí terminaba su vida. Para
// volver a engancharse hace falta poder decirle al otro de qué partida venimos,
// y la semilla es la primera pregunta -- dos partidas con semillas distintas no
// tienen ni por dónde empezar a compararse.
let semillaRed = 0;

// Y si estamos en mitad de un reenganche, para que la pantalla de códigos sepa
// que no esta creando una partida sino volviendo a una.
let reenganchando = false;

// A DÓNDE VUELVE ESC DESDE EL COOPERATIVO, que ya no es siempre el mismo sitio.
//
// Se entra por dos puertas —la opción JUGAR EN RED de la lápida y el atajo `O`
// de la pantalla de personajes— y salir siempre a personajes convertía el ESC
// del título en un viaje: ibas al cooperativo, te arrepentías y aparecías en
// una pantalla en la que no habías estado. Se apunta la puerta al entrar.
//
// `irARed` se llama también desde dentro de la propia pantalla, para volver a
// su menú tras cerrar una conexión; en esas llamadas no se pasa nada y la
// puerta apuntada se conserva.
let volverDeRed = PANTALLA_SELECCION;

function irARed(desde) {
  if (desde !== undefined) volverDeRed = desde;
  red.fase = 'menu';
  red.cursor = 0;
  red.codigo = '';
  red.aviso = '';
  red.copiado = false;
  red.conectados = 0;
  red.avisoConexion = null;
  red.reenganche = false;
  // La dirección de casa NO se borra al volver a entrar: se escribe una vez y
  // sirve para los cuatro intentos que hagan falta. Se pierde al recargar, que
  // es otra cosa.
  red.ipLocal = RedConsola.ipLocal;
  // El aviso del retardo se engancha ANTES de que haya conexión: la medida
  // empieza sola en cuanto se abre el canal, y engancharse después es una
  // carrera que en una red rápida se pierde.
  esperarRetardoDeRed();
  irA(PANTALLA_RED);
}

// PEGAR NO PUEDE HACERLO EL JUEGO POR SU CUENTA.
//
// El navegador no deja leer el portapapeles sin un gesto de la persona por
// delante — y hace bien: cualquier página podría leerte lo que tengas copiado.
// Por eso hay una tecla para pegar en vez de mirarlo solo.
async function pegarDelPortapapeles() {
  try {
    const t = await navigator.clipboard.readText();
    return (t || '').trim();
  } catch {
    return '';
  }
}

async function crearPartidaEnRed() {
  red.fase = 'creando';
  red.aviso = 'Buscando por dónde te pueden encontrar…';
  const codigo = await RedConsola.invitar();
  if (!codigo) { red.fase = 'error'; red.aviso = 'No se ha podido crear la partida.'; return; }
  red.codigo = codigo;
  red.copiado = await RedConsola.copiar(codigo);
  red.esAnfitrion = true;
  red.avisoConexion = avisoDeConexion(RedConsola.diagnostico());
  red.fase = 'esperando';
}

async function unirseAPartidaEnRed() {
  const codigo = await pegarDelPortapapeles();
  if (!codigo) {
    red.fase = 'error';
    red.aviso = 'No he podido leer el portapapeles. Copia el código otra vez y ' +
                'dale permiso al navegador si te lo pide.';
    return;
  }
  red.fase = 'uniendo';
  red.aviso = 'Contestando…';
  const respuesta = await RedConsola.responder(codigo);
  if (!respuesta) {
    red.fase = 'error';
    red.aviso = 'Ese código no vale. ¿Está entero y es el de quien te invita?';
    return;
  }
  red.codigo = respuesta;
  red.copiado = await RedConsola.copiar(respuesta);
  red.esAnfitrion = false;
  // QUIEN SE UNE ES EL PRIMERO QUE PUEDE SABER SI ESTÁIS EN LA MISMA RED: es el
  // primero que tiene delante el código del otro Y el suyo propio. Ese aviso
  // manda sobre el de la conexión, porque es más concreto.
  red.avisoConexion = RedConsola.mismaRedQue(codigo)
    ? avisoMismaRed(!!RedConsola.ipLocal)
    : avisoDeConexion(RedConsola.diagnostico());
  red.fase = 'esperando';
  // Y en cuanto el otro lo pegue, quedamos conectados sin hacer nada más.
  // Quien se une mide igual que el anfitrión: el viaje es el mismo, pero el
  // retardo lo elige cada máquina para sí, y esta no puede fiarse de que la otra
  // se lo diga (ver `ajustarRetardo`).
  RedConsola.alConectar(() => { red.fase = 'conectado'; });
}

async function aceptarRespuestaEnRed() {
  const codigo = await pegarDelPortapapeles();
  if (!codigo) {
    red.aviso = 'No he podido leer el portapapeles.';
    return;
  }
  red.fase = 'uniendo';
  red.aviso = 'Conectando…';
  // ¿ESTÁIS EN LA MISMA RED? Se sabe leyendo su código, y se sabe AHORA, no al
  // cabo del minuto que tarda ICE en rendirse. Si además falla la conexión, el
  // cartel de error dirá por qué en vez de encogerse de hombros.
  const mismaRed = RedConsola.mismaRedQue(codigo);
  if (mismaRed) red.avisoConexion = avisoMismaRed(!!RedConsola.ipLocal);

  const ok = await RedConsola.aceptar(codigo);
  if (!ok) {
    red.fase = 'error';
    const porque = mismaRed
      ? avisoMismaRed(!!RedConsola.ipLocal)
      : avisoDeConexion(RedConsola.diagnostico());
    red.aviso = porque
      ? porque.titulo + ' ' + porque.detalle
      : 'No se ha podido conectar con ese código.';
    return;
  }
  red.conectados = RedConsola.conectados;
  red.fase = 'conectado';
}

// EL RETARDO YA NO SE ELIGE AQUÍ: lo pone la propia conexión en cuanto se abre,
// midiendo el viaje (ver `ajustarRetardo` en red/consola.js). Esta pantalla solo
// se entera para poder enseñarlo, porque es el único número de aquí que dice
// cómo se va a jugar.
//
// Tarda un segundo en llegar —son veinte pings— y hasta entonces `red.retardo`
// vale cero y no se pinta nada, que es mejor que pintar un número que va a
// cambiar delante de quien lo está leyendo.
function esperarRetardoDeRed() {
  red.retardo = 0;
  red.rtt = 0;
  RedConsola.alAjustarRetardo((r) => {
    red.retardo = r.fotogramas;
    red.rtt = r.mediana;
  });
}

// LO QUE SE TECLEA DE LA DIRECCIÓN DE CASA.
//
// Es lo único que se escribe con el teclado en todo el juego, así que no hay
// maquinaria de campos de texto que reutilizar y tampoco hace falta: una
// dirección son dígitos y puntos, y con quince caracteres ya no cabe ninguna.
//
// Se lee por CÓDIGO DE TECLA y no por el carácter, igual que el resto de la
// entrada del juego: `entrada` solo guarda códigos. El teclado numérico va
// aparte porque es donde la mayoría de la gente teclea números.
function tecleatIpLocal() {
  if (entrada.consumirFlanco('Backspace')) {
    red.ipTecleada = red.ipTecleada.slice(0, -1);
    red.aviso = '';
  }
  if (red.ipTecleada.length >= 15) return;
  for (let d = 0; d <= 9; d++) {
    if (entrada.consumirFlanco('Digit' + d) || entrada.consumirFlanco('Numpad' + d)) {
      red.ipTecleada += String(d);
      red.aviso = '';
    }
  }
  if (entrada.consumirFlanco('Period') || entrada.consumirFlanco('NumpadDecimal')) {
    // Dos puntos seguidos no forman ninguna dirección y solo dan un error más
    // tarde: se descartan aquí, que es donde se ve lo que estás escribiendo.
    if (red.ipTecleada && !red.ipTecleada.endsWith('.')) red.ipTecleada += '.';
  }
}

// DEJARLO A MEDIAS Y VOLVER AL CARTEL.
//
// Salir de un reenganche no es salir del cooperativo: la partida sigue ahí
// congelada y las dos salidas de siempre —seguir en solitario o volver al menú—
// siguen esperando. Mandarlo al menú de red desde aquí sería perderla sin
// haberlo pedido.
//
// `cerrarIntento()` Y NO `cerrar()`. Con dos jugadores el enlace en curso es
// el único que hay y da igual cuál de las dos se llame; con tres o cuatro,
// `cerrar()` barre TODOS los enlaces del anfitrión —incluidos los que nunca
// se habían caído— y `cerrarIntento()` solo se lleva por delante el código a
// medias que se estaba negociando. Comprobado con Playwright: abortar el
// reenganche del jugador 3 con el 2 y el 4 esperando detrás desconectaba a
// los tres antes de este cambio, y a ninguno después.
function dejarElReenganche() {
  RedConsola.cerrarIntento();
  reenganchando = false;
  red.reenganche = false;
  irA(PANTALLA_JUEGO);
}

function entradaRed() {
  const c = entrada.controles[0];
  const atras = entrada.consumirFlanco('Escape') || entrada.consumirAtras();
  if (red.reenganche && atras && red.fase !== 'ip') { dejarElReenganche(); return; }

  if (red.fase === 'menu') {
    const eje = c ? c.flancoEje(false) : 0;
    const n = OPCIONES_RED.length;
    if (entrada.consumirFlanco('ArrowDown') || (c && c.consumirBoton(13)) || eje > 0) {
      red.cursor = (red.cursor + 1) % n;
    }
    if (entrada.consumirFlanco('ArrowUp') || (c && c.consumirBoton(12)) || eje < 0) {
      red.cursor = (red.cursor + n - 1) % n;
    }
    const acepta = entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
                   (c && c.consumirBoton(0));
    if (atras || (acepta && red.cursor === 2)) { irA(volverDeRed); return; }
    if (entrada.consumirFlanco('KeyL')) {
      red.fase = 'ip';
      red.ipTecleada = red.ipLocal;
      red.aviso = '';
      return;
    }
    if (acepta && red.cursor === 0) crearPartidaEnRed();
    if (acepta && red.cursor === 1) { red.fase = 'pegar'; red.esAnfitrion = false; }
    return;
  }

  if (red.fase === 'ip') {
    if (atras) { red.fase = 'menu'; red.aviso = ''; return; }
    tecleatIpLocal();
    if (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('NumpadEnter')) {
      // VACÍO ES UNA RESPUESTA VÁLIDA: es como se quita una dirección que ya no
      // vale porque has cambiado de casa o de wifi.
      const puesta = RedConsola.ponerIpLocal(red.ipTecleada);
      if (!puesta && red.ipTecleada) {
        red.aviso = 'Esa no es una dirección de red local. Empiezan por 192.168, ' +
                    'por 10. o por 172.16-31.';
        return;
      }
      red.ipLocal = puesta;
      red.aviso = '';
      red.fase = 'menu';
    }
    return;
  }

  if (red.fase === 'pegar') {
    // El ESC de un reenganche ya lo atrapa el guardián de arriba de la
    // función, así que aquí solo queda el camino de una partida nueva.
    if (atras) { irARed(); return; }
    if (entrada.consumirFlanco('KeyV')) unirseAPartidaEnRed();
    return;
  }

  if (red.fase === 'esperando') {
    if (atras) { RedConsola.cerrar(); irARed(); return; }
    // Solo el anfitrión pega una respuesta: quien se ha unido ya no tiene nada
    // que pegar, solo esperar.
    if (red.esAnfitrion && entrada.consumirFlanco('KeyV')) aceptarRespuestaEnRed();
    return;
  }

  if (red.fase === 'conectado') {
    if (atras) { RedConsola.salir(); irARed(); return; }
    red.conectados = RedConsola.conectados;
    // INVITAR A OTRO MÁS. Cada invitado necesita su propio par de códigos
    // —cada conexión trae sus credenciales— así que se repite el baile una vez
    // por persona. Las que ya estaban conectadas siguen estándolo.
    if (!red.reenganche && red.esAnfitrion && red.conectados < 3 &&
        entrada.consumirFlanco('KeyI')) {
      crearPartidaEnRed();
      return;
    }
    // EN UN REENGANCHE NO HAY NADA QUE PULSAR. El saludo va y vuelve solo en
    // cuanto se abre el canal, y si cuadra la partida se reanuda sola. Dejar
    // aquí el ENTER de empezar sería dejar a mano el botón de tirar la partida
    // que se estaba intentando salvar.
    if (!red.reenganche && red.esAnfitrion &&
        (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
         (c && c.consumirBoton(0)))) {
      RedConsola.jugar();
    }
    return;
  }

  if (red.fase === 'error' && atras) { RedConsola.cerrar(); irARed(); }
}

// LO QUE PARA EL MUNDO SIN SALIR EN NINGUNA FIRMA: la pantalla en la que se
// está, la pausa, el menú de nivel, el cofre, el fin de partida.
//
// Lo usa la prueba de determinismo —una pasada con el menú abierto no simula
// nada, y sin esto eso se lee como "difieren los enemigos"— y ahora también la
// prueba de partida en red, que necesita poder decir POR QUÉ una de las dos
// puntas se ha quedado quieta. Sin esto solo sabía decir que se había quedado.
function mandoActual() {
  return {
    pantalla,
    pausado: pausado ? 1 : 0,
    subiendoNivel: Progresion.abierto ? 1 : 0,
    cofre: Progresion.cofreAbierto ? 1 : 0,
    final: finalMostrado || '',
    directorActivo: Director.activo ? 1 : 0,
    directorT: Director.t,
    tope: Director.tope,
    jugadores: jugadores.length,
    enemigos: enemigos.pool.activos,
    mapaPintado: Recursos.mapaPintado ? 1 : 0,
    rngEstado: rng.estado(),
    // Y lo de la red, para la prueba de partida.
    redActiva: Sincro.activo ? 1 : 0,
    redRota: Sincro.roto || '',
    // El cartel de la caída y si ofrece volver. Sin esto, la prueba del
    // reenganche solo podia mirar si la partida seguia, no si el juego llego a
    // ofrecer la opcion.
    caida: caidaRed ? 1 : 0,
    puedeReenganchar: sePuedeReenganchar() ? 1 : 0,
    esperados: Lockstep.esperados,
    faltan: Lockstep.faltan().join(',')
  };
}

async function empezarPartidaEnRed(conexion, cfg) {
  // CADA JUGADOR CON SUS PROPIAS MEJORAS, las suyas de verdad.
  //
  // Antes se jugaba con el progreso a cero en las dos máquinas. Era la forma
  // rápida de que no desincronizara, y funcionaba, pero convertía el
  // cooperativo en otra cosa: entrabas a jugar con alguien y te habían quitado
  // todo lo que habías comprado.
  //
  // Ahora el progreso de cada uno viaja en el saludo y CADA MÁQUINA SIMULA A
  // LOS DOS con lo que cada uno tiene. Que tú lleves más mejoras que tu hermana
  // no rompe el lockstep; lo que lo rompía era que su máquina no lo supiera.
  caidaRed = '';
  puestoLocalRed = cfg.jugadorLocal | 0;
  semillaRed = cfg.semilla >>> 0;
  reenganchando = false;
  metasDeRed = [];
  const metas = cfg.metas || [];
  for (let i = 0; i < cfg.personajes.length; i++) {
    metasDeRed[i] = i === cfg.jugadorLocal ? MetaProgreso : metaAjena(metas[i]);
  }
  // EL NIVEL DEL ANFITRIÓN, antes de tocar nada más. Los dos tienen que jugar
  // el mismo sitio o no hay lockstep que valga: cambian el suelo, las oleadas y
  // la decoración, y con ellos el mundo entero. Si es el que ya está cargado
  // —el caso normal— esto no espera a nada.
  const suyo = cfg.nivel ? Niveles.por(cfg.nivel) : null;
  if (suyo && suyo !== nivelActual) await usarNivel(suyo);

  rng.sembrar(cfg.semilla >>> 0);
  volverAlMenu();
  rng.sembrar(cfg.semilla >>> 0);
  puestos.fill(null);
  mascotasElegidas.fill('');
  for (let i = 0; i < cfg.personajes.length; i++) {
    puestos[i] = { personaje: cfg.personajes[i] | 0, listo: true };
  }
  empezarPartida();
  Sincro.empezar(conexion, {
    esAnfitrion: cfg.esAnfitrion,
    jugadorLocal: cfg.jugadorLocal,
    jugadores: cfg.personajes.length,
    // La huella del mundo, sin tocar el progreso guardado: ver SIN_META en
    // core/determinismo.js.
    huellaDe: () => window.EMERITA.determinismo.firmaMundo(),
    partesDe: () => window.EMERITA.determinismo.partesMundo(),
    nombres: window.EMERITA ? window.EMERITA.determinismo.nombresMundo() : [],
    // LOS GRUPOS SE PASAN. Sin ellos, `foto()` retrata el mundo ENTERO -- cientos
    // de enemigos, tres veces por segundo- y vuelve el cuelgue que ya tumbó un
    // navegador. El arreglo de aquel día acotó los grupos en red/sincro.js y se
    // quedó a medias: este enganche se los comía.
    fotoDe: (grupos) => window.EMERITA.determinismo.foto(grupos),
    comparaFotos: (a, b, t) => window.EMERITA.determinismo.comparaFotos(a, b, t),
    alRomperse: (motivo) => {
      terminarPartidaEnRed();
      // Solo si seguimos dentro: si la partida ya había terminado, el aviso
      // sobra y encima taparía el resumen.
      if (pantalla === PANTALLA_JUEGO && !finalMostrado) {
        caidaRed = motivo || 'Se ha perdido la conexión.';
        cursorCaida = 0;
      }
    },
    alElegir: eleccionRemota,
    alCofre: cofreRemoto
  });
  return true;
}

// `colgar` solo al salir a propósito. Al romperse por desincronización se para
// la simulación pero se deja el canal abierto: es justo entonces cuando llegan
// los números del otro que dicen qué se ha separado.
// SEGUIR TÚ SOLO con la partida donde está.
//
// Se queda solo el jugador de esta máquina. Al otro no se le puede dejar ahí
// plantado: sin nadie que lo mueva sería un muñeco recibiendo golpes, y la
// cámara seguiría intentando encuadrar a los dos.
//
// Y hay que reiniciar el búfer de pulsaciones: durante la partida en red decía
// que el puesto propio era el 0 o el 1 según quién fueras, y ahora solo queda un
// jugador que lee el primer mando. Sin esto, quien se hubiera unido —puesto 1—
// se quedaba sin poder moverse.
function seguirEnSolitarioTrasCaida() {
  const j = jugadores[puestoLocalRed] || jugadores[0];
  const a = arsenales[puestoLocalRed] || arsenales[0];
  jugadores.length = 0;
  arsenales.length = 0;
  if (j) { jugadores.push(j); j.id = 0; }
  if (a) arsenales.push(a);
  Progresion.resincronizarEquipo(jugadores);
  Mascotas.releer(['']);
  // Sin reiniciar el búfer: la partida sigue donde estaba y su contador de pasos
  // también. Ver Lockstep.aSolitario.
  Lockstep.aSolitario();
  caidaRed = '';
}

// ¿SE PUEDE VOLVER A ESTA PARTIDA?
//
// Tiene que haber una caída de verdad -- no se reengancha uno a una partida
// que sigue --, tiene que quedar mundo al que volver, y tiene que haber sido
// la red y no una desincronización ni un `adios` a propósito.
//
// YA NO HACE FALTA SER DOS. La restricción a dos jugadores era de la primera
// versión: con tres o cuatro, `Sincro.reanudar` sustituía TODOS los enlaces
// por el único que se acababa de negociar y se llevaba por delante a quien
// seguía perfectamente conectado. Ahora `reengancharPartida` reanuda con
// `RedConsola.enlacesConectados()` -- todos los que sigan en pie más el nuevo
// -- así que un enlace roto entre tres o cuatro ya no exige rehacerlos todos.
function sePuedeReenganchar() {
  return !!caidaRed && !finalMostrado && jugadores.length >= 2 && Sincro.rotoPorRed;
}

// EL SALUDO QUE VIAJA POR EL CANAL NUEVO, o null si aquí no hay nada a lo que
// volver. Lo pide red/consola.js en cuanto se abre el canal.
function puntoDeReenganche() {
  if (!sePuedeReenganchar()) return null;
  const punto = Sincro.puntoDeReenganche();
  punto.semilla = semillaRed >>> 0;
  return punto;
}

// Y LA COMPROBACIÓN, que es de lo que va todo esto.
//
// Reengancharse a ciegas sería peor que no reengancharse: dos mundos que ya no
// son el mismo seguirían jugando como si lo fueran, y la desincronización que
// saltara media hora después no tendría de dónde tirar. Así que antes de
// reanudar nada se comparan la semilla y la última huella que los dos tengan
// comprobada, y si no cuadra se dice por qué y no se reanuda.
function reengancharPartida(enlace, suyo) {
  const negar = (motivo) => {
    // AL OTRO HAY QUE DECÍRSELO. Si solo se entera esta punta, la de enfrente se
    // queda mirando una pantalla de "conectados" que no va a avanzar nunca.
    enlace.enviarControl('nore ' + motivo);
    red.fase = 'error';
    red.aviso = 'No se puede volver a la partida: ' + motivo;
    return false;
  };
  if (!sePuedeReenganchar()) {
    return negar('en la otra maquina ya no queda esa partida. ' +
                 '¿Se ha vuelto al menú, o se ha seguido en solitario?');
  }
  if ((suyo.semilla >>> 0) !== (semillaRed >>> 0)) {
    return negar('no venis de la misma partida.');
  }
  const porque = Sincro.comprobarReenganche(suyo);
  if (porque) return negar(porque);

  // TODOS LOS QUE SIGAN EN PIE, no solo el que se acaba de negociar. Con dos
  // jugadores es el mismo enlace de siempre; con tres o cuatro, `enlace` es
  // solo el que sustituye al que se cayó -- los demás nunca se fueron, y
  // `parar()` les había quitado la voz a todos por igual (ver red/sincro.js).
  // Reanudar con la lista entera los vuelve a enganchar sin tocarlos de otra
  // forma.
  Sincro.reanudar(RedConsola.enlacesConectados());
  caidaRed = '';
  reenganchando = false;
  red.reenganche = false;
  irA(PANTALLA_JUEGO);
  console.log('RED: reenganchados en el paso ' + Lockstep.paso + '. Se sigue.');
  return true;
}

// Lo mismo visto desde el otro lado: el de enfrente ha dicho que no.
function reengancheRechazado(motivo) {
  if (!reenganchando) return;
  Sincro.parar();
  red.fase = 'error';
  red.aviso = 'La otra maquina no puede volver: ' + motivo;
}

// ENTRAR AL BAILE DE CÓDIGOS SIN SALIR DE LA PARTIDA.
//
// Se reutiliza la pantalla del cooperativo entera, porque reengancharse ES el
// mismo baile: las credenciales de una conexión no se reciclan, así que hace
// falta un par de códigos nuevo. Lo único que cambia es que al final no se
// empieza nada -- la partida sigue congelada detrás de esta pantalla y lo que se
// hace es descongelarla.
//
// Los papeles se conservan: quien invitó vuelve a invitar. No es capricho, es
// que el puesto de cada uno tiene que seguir siendo el que era.
function irAlReenganche() {
  reenganchando = true;
  red.reenganche = true;
  red.cursor = 0;
  red.codigo = '';
  red.aviso = '';
  red.copiado = false;
  red.conectados = 0;
  red.avisoConexion = null;
  red.ipLocal = RedConsola.ipLocal;
  red.esAnfitrion = puestoLocalRed === 0;
  esperarRetardoDeRed();
  irA(PANTALLA_RED);
  if (red.esAnfitrion) crearPartidaEnRed();
  else red.fase = 'pegar';
}

function entradaCaidaRed() {
  const c = entrada.controles[0];
  const eje = c ? c.flancoEje(false) : 0;
  const OPCIONES = opcionesCaida(sePuedeReenganchar());
  const n = OPCIONES.length;
  if (entrada.consumirFlanco('ArrowDown') || (c && c.consumirBoton(13)) || eje > 0) {
    cursorCaida = (cursorCaida + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowUp') || (c && c.consumirBoton(12)) || eje < 0) {
    cursorCaida = (cursorCaida + n - 1) % n;
  }
  if (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
      (c && c.consumirBoton(0))) {
    // POR EL TEXTO Y NO POR EL ÍNDICE: la lista tiene dos entradas o tres según
    // se pueda volver o no, y un número aquí significaría una cosa distinta en
    // cada caso. Es la clase de error que no se ve hasta que alguien pulsa
    // "seguir en solitario" y se le va la partida al menú.
    const elegida = OPCIONES[cursorCaida];
    if (elegida === 'RECONECTAR') irAlReenganche();
    else if (elegida === 'SEGUIR EN SOLITARIO') seguirEnSolitarioTrasCaida();
    else { caidaRed = ''; volverAlMenu(); }
  }
}

function terminarPartidaEnRed(colgar) {
  if (colgar) Sincro.desconectar(); else Sincro.parar();
  metasDeRed = null;
}

function empezarPartida() {
  // Las mascotas van EN PARALELO a los jugadores, no por indice de puesto: si
  // juega el puesto 0 y el 2, los jugadores son 0 y 1, y sus mascotas tienen
  // que quedar en esas mismas posiciones o el jugador 1 saldria con la mascota
  // que eligio el 2.
  const mascotasPorJugador = [];
  for (let i = 0; i < puestos.length; i++) {
    if (!puestos[i]) continue;
    mascotasPorJugador.push(mascotasElegidas[i] || '');
    anyadirJugador(ORDEN_PERSONAJES[puestos[i].personaje], mascotasElegidas[i] || '',
                   metasDeRed ? metasDeRed[jugadores.length] : null);
  }
  // EN UN NIVEL DE REJILLA MANDA EL MAPA. `anyadirJugador` los pone en abanico
  // alrededor del centro de la pantalla, que en un recinto con paredes es un
  // sitio cualquiera — y la mitad de las veces, el interior de una tienda.
  if (RejillaMapa.activa) {
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      const ang = (i / jugadores.length) * Math.PI * 2;
      j.x = RejillaMapa.inicio.x + (i === 0 ? 0 : cos(ang) * 26);
      j.y = RejillaMapa.inicio.y + (i === 0 ? 0 : sen(ang) * 26);
      RejillaMapa.sacarDePared(j);
      j.xPrev = j.xVista = j.x;
      j.yPrev = j.yVista = j.y;
    }
    // El campo de flujo, hecho ya para el primer paso: sin esto, la primera
    // décima de segundo la horda persigue con el campo de la partida anterior.
    RejillaMapa.actualizarCampo(jugadores, true);
    // Y el mapa, en blanco: el centro comercial se descubre andando, y eso vale
    // también para la segunda partida.
    RejillaMapa.olvidarLoVisto();
    RejillaMapa.mirarAlrededor(jugadores);
    // Y todos los cierres echados otra vez: son progreso de LA PARTIDA, no del
    // jugador. La segunda se empieza igual que la primera, en el anillo de
    // dentro.
    RejillaMapa.cerrarPuertas();
    reiniciarZoomMapa();
  }
  camara.situar(jugadores[0].x, jugadores[0].y);
  // Que mascota lleva cada uno se decide en su pantalla y no cambia en toda la
  // partida: se lee una vez aqui.
  Mascotas.releer(mascotasPorJugador);
  Director.reiniciar();
  // El mapa, otra vez virgen: las antorchas y los enemigos colocados en la
  // decoración se invocan una vez por fila y hay que olvidar las de la partida
  // anterior. Ver Obstaculos.reiniciar.
  Obstaculos.reiniciar();
  Expendedoras.reiniciar();
  Lockstep.reiniciar();
  reiniciarSellosOrbitales();
  enemigos.bajas = 0;
  derrotaGuardada = false;
  finalMostrado = null;
  statsFinal = null;
  resumenFinal = false;
  relojResumen = 0;
  denariosAlEmpezar = MetaProgreso.denarios;
  GestorAudio.iniciarMusica();
  irA(PANTALLA_JUEGO);
}

// LOS CIERRES QUE ABREN LOS JEFES. Solo hace algo en un nivel de recinto que
// traiga puertas (hoy el CC The Lighthouse).
//
// Cada jefe abre su juego: el del minuto 10 los cierres grises, el del 20 los
// azules y el final las puertas de la calle. `abrirPuertas` devuelve true una
// sola vez por juego, así que esto se puede preguntar cada paso sin llevar
// ninguna cuenta aquí.
//
// Se avisa por el mismo canal que los jefes y las oleadas: si se abre medio
// centro comercial y no lo dice nadie, el jugador sigue dando vueltas por donde
// ya estaba.
function atenderCierres() {
  if (!RejillaMapa.activa || !nivelActual.jefes) return;
  const j = nivelActual.jefes;
  if (Jefes.haCaido(j.intermedio) && RejillaMapa.abrirPuertas('10min')) {
    Director.anunciar('LOS CIERRES GRISES SE ABREN');
  }
  if (Jefes.haCaido(j.segundo) && RejillaMapa.abrirPuertas('20min')) {
    Director.anunciar('LOS CIERRES AZULES SE ABREN');
  }
  if (Jefes.haCaido(j.final) && RejillaMapa.abrirPuertas('final')) {
    Director.anunciar('LAS PUERTAS DE LA CALLE SE ABREN');
  }
}

// ¿SE HA GANADO? Y no se gana igual en los dos tipos de nivel.
//
// En una CALZADA (Mérida) se gana llegando al final del reloj, que es lo que ha
// sido siempre: el jefe final entra un minuto antes y quien aguanta los treinta
// minutos se lleva la partida aunque siga en pie.
//
// En un RECINTO con puertas (The Lighthouse) se gana MATANDO AL JEFE FINAL, y no
// es un capricho: ahí la partida es salir del centro comercial, las puertas de
// la calle las abre él, y terminar por reloj con el jefe vivo sería ganar
// habiéndose quedado dentro. El reloj llega al final y la partida sigue —el
// director mantiene vivo el último tramo de oleadas mientras haya jefe— hasta
// que cae.
function hayVictoria() {
  if (RejillaMapa.activa && nivelActual.jefes && nivelActual.jefes.final) {
    return Jefes.haCaido(nivelActual.jefes.final);
  }
  return Director.terminado;
}

// Cuánto se queda cualquiera por dentro del borde del NIVEL (no de la
// pantalla, eso ya lo hace camara.sujetar). Pequeño a propósito: la franja de
// hierba llega hasta el borde de la imagen y no hay por qué recortarla.
const MARGEN_NIVEL = 12;

// Los colores planos del prototipo, uno por símbolo de la leyenda y ya resueltos
// a un array indexado por `tipo`. Se prepara al cargar el nivel porque dibujar
// el suelo consulta esto una vez por celda visible y por fotograma: ahí no se
// buscan claves en un objeto.
let coloresRejilla = null;

function prepararColoresRejilla(nivel) {
  const def = nivel.coloresMapa || {};
  coloresRejilla = RejillaMapa.simbolos.map((ch) => def[ch] || COLOR_VACIO);
}

// La horda y los jugadores contra las paredes del recinto. Va justo detrás de
// `colisionarObstaculos` porque es lo mismo con otra estructura de datos: allí
// una lista de cajas, aquí la rejilla.
//
// TAMBIÉN LO QUE VUELA. Un centro comercial tiene techo, y una arpía que
// atraviesa la fachada se lleva por delante la única regla que el jugador puede
// leer del mapa: que detrás de una pared se está a salvo. Distinguir una
// estantería —por encima de la que sí tendría sentido volar— de un muro de carga
// pide un símbolo más en la leyenda, y eso es trabajo de cuando haya arte.
// Semialto de la caja con que un jugador choca contra las paredes del nivel.
// Chico a propósito: ver `colisionar` en sistemas/rejillaMapa.js.
const PIES_CONTRA_PARED = 2;

// TOPE DE LA CAJA CON QUE UN ENEMIGO CHOCA CONTRA LAS PAREDES. Los grandes
// llevan un `radioCuerpo` que sale de su dibujo —26 Cerbero, más la Loba— y
// con él la caja no cabe por una puerta de 64 ni dobla una esquina: el campo
// de flujo le decía "sigue" y la pared le decía "no", y se quedaba clavado
// empujando contra el canto. Lo vio Sergio. Contra las PAREDES se choca con
// una caja de 14 de semilado como mucho: 28 de ancho pasa por cualquier hueco
// del mapa y, sobre todo, por las rutas del campo ancho (ver
// sistemas/rejillaMapa.js): una celda libre de ese campo está a 16 de la
// pared más cercana en su peor punto, y con 18 la esquina de la caja seguía
// enganchándose en los cantos —medido—. Que el dibujo de un jefe tape un
// poco de muro al pasar es lo que hace un cuerpo grande en un pasillo visto
// desde arriba. Entre cuerpos se sigue chocando con el radio de cuerpo entero.
const PARED_SEMILADO_MAX = 14;

function colisionarParedes() {
  if (!RejillaMapa.activa) return;
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    // Semialto de dos: los pies tocan el muro de abajo. Ver `colisionar`.
    RejillaMapa.colisionar(j, j.radioCuerpo || j.radio, PIES_CONTRA_PARED);
  }
  const items = enemigos.pool.items;
  const n = enemigos.pool.activos;
  for (let k = 0; k < n; k++) {
    const e = items[k];
    if (e.vida <= 0) continue;           // disolviéndose: los jirones no chocan
    const r = e.radioCuerpo || e.radio;
    RejillaMapa.colisionar(e, r > PARED_SEMILADO_MAX ? PARED_SEMILADO_MAX : r);
  }
}

// Tope duro en X contra el borde del MUNDO, no de la pantalla. Se aplica a
// jugadores y enemigos por igual: un enemigo generado en el hueco vacío de
// fuera del mapa (los patrones de aparición reparten en anillo alrededor de
// la cámara sin saber que el nivel tiene ancho limitado) terminaría dejando
// su gema de XP en un sitio al que nadie puede llegar. En Y no hay tope: el
// suelo repite sin límite hacia arriba y abajo.
function clamparXNivel(e) {
  // En un nivel de REJILLA el mundo está acotado por los cuatro lados, no solo
  // en X: el tope lo pone el recinto entero.
  if (RejillaMapa.activa) { RejillaMapa.sujetar(e, MARGEN_NIVEL); return; }
  if (!Recursos.mapaPintado) return;
  const limIzq = MARGEN_NIVEL;
  const limDer = Recursos.anchoSuelo - MARGEN_NIVEL;
  if (e.x < limIzq) e.x = limIzq; else if (e.x > limDer) e.x = limDer;
}

// Foto fija del resumen de la partida, tomada UNA vez en el instante en que se
// gana o se pierde.
//
// Trae DOS COSAS DISTINTAS y conviene no mezclarlas: las cifras de equipo
// —tiempo, bajas, denarios— y una ficha POR JUGADOR. Antes solo salía el
// jugador 1, y en cooperativo eso deja fuera a tres personas que acaban de jugar
// la misma partida; ahora el resumen ocupa la pantalla entera y caben las cuatro
// columnas (ver ui/final.js).
//
// Es una COPIA, no una vista de los objetos vivos: el mundo sigue corriendo por
// debajo del cartel de derrota, así que apuntar a `jugadores` dejaría un resumen
// que cambia mientras se lee. Aquí sí se puede asignar memoria —la partida ya ha
// terminado, no estamos en el bucle—.
function capturarStats() {
  return {
    // Los SEGUNDOS (Director.t), no el "mm:ss" ya montado que devuelve
    // Director.reloj: el resumen es quien decide cómo se escribe un tiempo, y
    // pasarle la cadena hecha ata las dos cosas por ninguna razón.
    tiempo: Director.t,
    bajas: enemigos.bajas,
    // PUNTOS DE DAÑO DEL EQUIPO. Se suma de los jugadores y no se lleva un
    // contador global aparte: dos sitios donde apuntar lo mismo acaban dando
    // números distintos, y el que se lee en la ficha de cada uno es este.
    danyo: jugadores.reduce((n, j) => n + j.danyoHecho, 0),
    // Lo GANADO en esta partida, no el montón entero. El total sigue estando
    // (MONEDERO, al lado), pero lo que quiere saber quien acaba de jugar es qué
    // le ha rentado ESTA partida, y ese número no estaba en ninguna parte: el
    // panel viejo enseñaba el acumulado con el rótulo "DENARIOS", que es
    // justamente el que se lee como "lo que has sacado".
    denarios: MetaProgreso.denarios - denariosAlEmpezar,
    monedero: MetaProgreso.denarios,
    jugadores: jugadores.map((j) => ({
      id: j.id,
      // De qué dibujo sale, que no siempre es su id: ver `provisional` en
      // datos/personajes.js. El resumen pinta su cara y necesita el del arte.
      sprite: j.personaje,
      nombre: j.def.nombre,
      nivel: j.nivel,
      bajas: j.bajas,
      danyo: j.danyoHecho,
      golpes: j.golpesRecibidos,
      resurrecciones: j.resurreccionesUsadas,
      enPie: !j.abatido,
      mascota: j.mascotaId && MASCOTAS[j.mascotaId] ? MASCOTAS[j.mascotaId].corto : '',
      // Cada arma con lo que ha hecho, ORDENADAS DE MÁS A MENOS DAÑO. El orden
      // se decide aquí y no al dibujar porque es parte de lo que se cuenta: la
      // lista contesta "cuál me ha ganado la partida", y esa pregunta se lee
      // mirando la primera fila, no comparando cuatro números sueltos.
      armas: j.arsenal
        ? j.arsenal.equipadas
            .map((a) => ({ id: a.id, nivel: a.nivel, danyo: a.danyoHecho, bajas: a.bajas }))
            .sort((a, b) => b.danyo - a.danyo)
        : [],
      pasivos: { ...j.pasivos }
    }))
  };
}

// VOLVER AL MENÚ desde el resumen final, que es lo que pidió Sergio: antes de
// aquí solo se salía recargando la página.
//
// Desmonta la partida entera a mano. No basta con cambiar de pantalla: los pools
// siguen llenos de la horda del minuto veinte, `jugadores` sigue teniendo a los
// cuatro y `empezarPartida` los AÑADE en vez de sustituirlos, así que la segunda
// partida arrancaría con ocho personajes y la horda anterior encima.
//
// Los pools se vacían, NO se recrean: vaciar un pool es poner su contador de
// activos a cero (ver core/pool.js), así que esto no asigna memoria y la
// siguiente partida arranca sin esperar a nada.
function volverAlMenu() {
  MetaProgreso.guardar();
  GestorAudio.pararMusica();

  enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); disparos.vaciar();
  cofres.vaciar(); recogibles.vaciar(); Jefes.vaciar();
  Particulas.vaciar(); VFX.vaciar();

  jugadores.length = 0;
  arsenales.length = 0;
  Mascotas.releer(null);
  Progresion.iniciar(rng);
  Director.reiniciar();
  Obstaculos.reiniciar();
  Expendedoras.reiniciar();
  // Los corazones olvidan la partida pasada: si no, el primer fotograma de la
  // siguiente enseña reventando las vidas que ya no se tienen.
  reiniciarVidasHud();
  for (let i = 0; i < VIDAS_GASTADAS.length; i++) VIDAS_GASTADAS[i] = 0;
  // Y el mundo vuelve al color. Sin esto, salir al menú con el Reloj todavía
  // corriendo deja el gris puesto: el interruptor solo se toca mientras se
  // dibuja la partida, así que al dejar de dibujarla nadie lo apagaría.
  marcarCongelado(false);

  finalMostrado = null;
  statsFinal = null;
  resumenFinal = false;
  relojResumen = 0;
  derrotaGuardada = false;
  pausado = false;
  configEnPartida = false;
  fichaAbierta = -1;
  mapaAbierto = false;

  puestos.fill(null);
  cursorMenu = 0;
  irA(PANTALLA_TITULO);
}

// --- Reanimación en cooperativo ----------------------------------------------
//
// Un jugador caído se levanta solo, pero LO RÁPIDO DEPENDE DE LA COMPAÑÍA: diez
// segundos si alguien se queda junto a su ataúd, treinta si nadie va.
//
// Se lleva como PROGRESO de 0 a 1 y no como un contador de segundos fijado en
// el momento de caer, y esa es toda la gracia de la mecánica. Con un contador
// fijo, acercarse al ataúd de tu hermana no serviría de nada si ya se había
// decidido "treinta" al caer. Con progreso, el reloj corre al triple mientras
// alguien está al lado y se frena en cuanto se va: quedarse es una decisión
// —dejas de matar y te quedas quieto donde ha caído, que suele ser el peor
// sitio del mapa— y esa decisión es justo lo que hace cooperativo a un
// cooperativo. Los extremos siguen siendo exactamente los que pidió Sergio: 10
// segundos sin moverse de al lado, 30 sin acercarse nunca.
const RADIO_REANIMAR = 60;     // unidades lógicas: hay que ir de verdad, no basta con estar en pantalla
const REANIMAR_CERCA = 10;     // segundos con alguien dentro del radio
const REANIMAR_LEJOS = 30;     // segundos sin nadie

// PERDER UNA VIDA TIENE QUE NOTARSE, y hasta ahora no se notaba.
//
// La Moneda de Caronte te devuelve al sitio en el mismo frame en que te matan, y
// eso, que es lo que la hace buena, era también lo que la hacía invisible: seguías
// jugando sin enterarte de que acababas de morir. Lo único que cambiaba era un
// número en una esquina de cuarenta píxeles.
//
// Aquí va el aviso que se ve y se siente. La parte que se ve EN EL PERSONAJE
// —desaparecer y volver— vive en entidades/jugador.js (ver RENACER), porque es
// dibujo suyo; esto es lo que pasa alrededor:
//
//   - un ANILLO ROJO ancho en el sitio, del tamaño de lo que ha pasado;
//   - un chorro de chispas hacia arriba, el idioma de lo que te entra;
//   - el PARÓN y el borde rojo, que ya estaban en jugador.js al gastar la moneda;
//   - y el MANDO VIBRANDO, que es lo único que llega aunque estuvieras mirando
//     la otra punta de la pantalla.
//
// POR FLANCO sobre `resurreccionesUsadas`, igual que el barrido de los caídos:
// el número ya está en el jugador y compararlo con el del paso anterior cuesta
// una resta. Nadie tiene que avisar a nadie.
//
// Lo visual y la vibración NO entran en la simulación —ni tocan el RNG ni el
// estado— así que no pueden desincronizar el cooperativo online. Y la vibración
// va al mando de ESE jugador, no a todos: en cooperativo local, que vibre el
// mando de quien no ha perdido nada sería una mentira.
const VIDAS_GASTADAS = [0, 0, 0, 0];
const COLOR_VIDA_PERDIDA = '#ff5a4a';

function avisarVidasPerdidas() {
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    const usadas = j.resurreccionesUsadas || 0;
    if (usadas <= VIDAS_GASTADAS[i]) { VIDAS_GASTADAS[i] = usadas; continue; }
    VIDAS_GASTADAS[i] = usadas;

    // Anillo ANCHO: el tamaño dice la importancia, y esto es lo más gordo que
    // le pasa a un jugador en toda la partida.
    VFX.anillo(j.x, j.y - 10, 64, COLOR_VIDA_PERDIDA, 3, 0.6);
    VFX.anillo(j.x, j.y - 10, 34, '#ffd9c0', 2, 0.45);
    if (!Particulas.saturado()) {
      Particulas.chorro(j.x, j.y - 10, 0, -1, 14, 70, 1.4, 0.5, 2,
                        COLOR_VIDA_PERDIDA, 0.2, rng);
    }
    entrada.vibrar(i);
  }
}

// AL CAER, SUS ARMAS DEJAN DE ESTAR EN PANTALLA.
//
// El bucle de armas se salta a los abatidos —"un caído no dispara"— y eso
// bastaba cuando las armas eran solo disparos. Con orbitales, tajos y charcos no
// basta: saltarse a alguien no apaga lo que ya tenía encendido, lo CONGELA. Se
// veían escudos dando vueltas alrededor de un ataúd, arcos de espada clavados a
// medio trazo y charcos de veneno quietos matando por su cuenta, todos de
// alguien que llevaba medio minuto en el suelo.
//
// Se barre en TRES SITIOS porque los efectos de un arma viven en tres sitios: el
// arsenal (orbitales, tajos y rayos), el pool de proyectiles y el de zonas. Cada
// uno sabe hacer lo suyo; aquí solo se dice a quién.
//
// POR FLANCO, no cada frame. `_ataquesLimpiados` recuerda si ya se hizo, así que
// esto cuesta una comparación por jugador y paso, y el barrido de verdad ocurre
// una sola vez por caída. Sin el flanco habría que recorrer los dos pools
// enteros sesenta veces por segundo por cada caído, que es justo el momento en
// que la pantalla está más llena.
//
// Se rearma al levantarse (no al revés): quien vuelve de un ataúd vuelve a
// poder dejar cosas en pantalla, y la próxima vez que caiga hay que barrer otra
// vez.
function limpiarAtaquesDeCaidos() {
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (!j.abatido) { j._ataquesLimpiados = false; continue; }
    if (j._ataquesLimpiados) continue;
    j._ataquesLimpiados = true;
    if (arsenales[i]) arsenales[i].apagarEfectos();
    proyectiles.retirarDe(j);
    zonas.retirarDe(j);
  }
}

function reanimar(dt) {
  // En solitario no hay reanimación: caer es perder, como hasta ahora.
  if (jugadores.length < 2) return;

  // HACE FALTA ALGUIEN EN PIE. Sin esta guarda la partida sería imposible de
  // perder: con los cuatro caídos el contador seguiría corriendo y se
  // levantarían solos a los treinta segundos, así que la pantalla de derrota
  // no llegaría nunca.
  let hayVivo = false;
  for (let i = 0; i < jugadores.length; i++) {
    if (!jugadores[i].abatido) { hayVivo = true; break; }
  }
  if (!hayVivo) return;

  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (!j.abatido) continue;

    // LA LLAVE DEL PERDÓN la lleva EL QUE VA A LEVANTAR, no el caído, y esa es
    // toda la idea del objeto: no te salva a ti, te convierte a ti en quien
    // salva. Así que el radio y la prisa salen de cada compañero que se acerca,
    // y con dos cerca manda el mejor de los dos.
    let acompanyado = false;
    let mejorPerdon = 0;
    for (let k = 0; k < jugadores.length; k++) {
      const o = jugadores[k];
      if (k === i || o.abatido) continue;
      const alcance = RADIO_REANIMAR * (1 + o.perdon);
      const dx = o.x - j.x;
      const dy = o.y - j.y;
      if (dx * dx + dy * dy <= alcance * alcance) {
        acompanyado = true;
        if (o.perdon > mejorPerdon) mejorPerdon = o.perdon;
      }
    }

    // El caído sube su barra al doble de deprisa con alguien al lado (diez
    // segundos contra treinta), y la Llave acorta esos diez.
    const cerca = REANIMAR_CERCA / (1 + mejorPerdon);
    j.reanimacion += dt / (acompanyado ? cerca : REANIMAR_LEJOS);
    if (j.reanimacion >= 1) j.levantar();
  }
}

// --- Lógica -----------------------------------------------------------------
function actualizar(dt) {
  entrada.actualizar();

  // Título y selección salen por aquí, antes de tocar nada de la simulación:
  // todo lo que viene debajo da por hecho que hay al menos un jugador vivo.
  if (pantalla !== PANTALLA_JUEGO) {
    if (pantalla === PANTALLA_INTRO) {
      // De la intro se sale a ELEGIR PARTIDA, no al menú: el menú ya enseña
      // los denarios de una partida concreta.
      if (Intro.actualizar(dt, entrada)) {
        cursorHueco = MetaProgreso.ultimoUsado();
        refrescarHuecos();
        enBorrarHueco = false;
        enFilaGithub = false;
        irA(PANTALLA_HUECOS);
      }
    }
    else if (pantalla === PANTALLA_HUECOS) entradaHuecos();
    else if (pantalla === PANTALLA_RED) entradaRed();
    else if (pantalla === PANTALLA_TITULO) entradaTitulo();
    else if (pantalla === PANTALLA_NIVELES) entradaNiveles();
    else if (pantalla === PANTALLA_HISTORIA) {
      // La placa corre sola y se salta con cualquier tecla. Al acabarse, la
      // partida empieza: es la última pantalla del recorrido.
      if (Historia.actualizar(dt, entrada)) empezarPartida();
    }
    else if (pantalla === PANTALLA_TIENDA) entradaTienda();
    else if (pantalla === PANTALLA_MASCOTAS) entradaMascotas();
    else if (pantalla === PANTALLA_CONFIG) entradaConfig(() => irA(PANTALLA_TITULO));
    else if (pantalla === PANTALLA_CONTROLES) entradaControles();
    else if (pantalla === PANTALLA_GALERIA) entradaGaleria();   // GALERÍA (temporal)
    else entradaSeleccion();
    entrada.limpiarFlanco();
    return;
  }

  // El cofre se atiende ANTES que nada, incluidos los atajos de depuración. Se
  // cierra con cualquier tecla, así que si los atajos fueran antes, cerrarlo con
  // el 2 soltaría además quinientas serpientes.
  if (Progresion.cofreAbierto) {
    // Las ruletas giran con el PASO DE LÓGICA y no con el reloj de pared: van
    // al mismo ritmo aunque el navegador pierda fotogramas, y con la misma
    // semilla el cofre se ve exactamente igual dos partidas seguidas.
    const girando = Progresion.girarCofre(dt);

    // EL COFRE ES DE QUIEN LO COGE, y solo él lo cierra.
    //
    // Todos lo ven —es parte de la gracia, se enseña lo que le ha tocado a tu
    // hermana— pero si cada uno tuviera que cerrarlo por su cuenta, en una
    // partida de cuatro habría que pulsar cuatro veces para seguir jugando. Lo
    // dijo Sergio jugando: "el resto de jugadores ha tenido que cerrarlo
    // también, eso no debe ocurrir".
    //
    // Es el mismo caso que la carta de subir de nivel y viaja por el mismo
    // camino: el canal fiable, porque el cofre para el mundo y el búfer de
    // pulsaciones deja de fluir mientras está abierto.
    const mio = !Sincro.activo ||
                jugadores.indexOf(Progresion.cofre) === Sincro.jugadorLocal;
    if (mio && entrada.algunFlanco()) {
      // La primera pulsación mientras giran NO cierra: las termina. Quien ya ha
      // visto veinte cofres no tiene por qué esperar tres segundos, y quien lo
      // ve por primera vez no se lo salta sin querer al ir a cerrar.
      if (Sincro.activo) Sincro.avisarCofre(girando ? 0 : 1);
      if (girando) Progresion.saltarGiro();
      else Progresion.cerrarCofre();
    }
    entrada.limpiarFlanco();
    return;
  }

  // Ficha de jugador. Cada uno abre LA SUYA con el Select de su mando (botón 8
  // del mapeo estándar); el teclado abre la del jugador 1. La misma tecla la
  // cierra, que es lo que se intenta por instinto.
  if (entrada.consumirFlanco('Tab')) fichaAbierta = fichaAbierta === 0 ? -1 : 0;
  for (let i = 0; i < jugadores.length; i++) {
    const c = entrada.controles[i];
    if (c && c.consumirBoton(8)) fichaAbierta = fichaAbierta === i ? -1 : i;
  }
  if (fichaAbierta >= 0) {
    if (fichaAbierta >= jugadores.length) fichaAbierta = -1;   // se fue ese jugador
    else {
      alternarAutomatico(jugadores[fichaAbierta]);
      // ESC en teclado o B en cualquier mando: la ficha no tenía hasta ahora
      // ninguna forma de cerrarse aparte de la misma tecla que la abrió.
      if (entrada.consumirFlanco('Escape') || entrada.consumirAtras()) fichaAbierta = -1;
    }
    entrada.limpiarFlanco();
    return;
  }

  if (entrada.consumirFlanco('F3')) verDepuracion = !verDepuracion;
  // --- EL MAPA DEL NIVEL ----------------------------------------------------
  //
  // Se abre con Bloq Mayús o con Y, y F4 se queda como atajo de siempre para no
  // romperle la costumbre a nadie.
  //
  // MIENTRAS ESTÁ ABIERTO NO SE ATIENDE NADA MÁS, igual que hace la ficha: se
  // sale por aquí. No es solo orden — la Y con la pausa puesta abre los ajustes,
  // y sin este corte una misma pulsación haría las dos cosas.
  if (mapaAbierto) {
    // ESC EN EL TECLADO O B EN CUALQUIER MANDO, que es lo que se intenta por
    // instinto para cerrar cualquier ventana del juego. Va ANTES que la pausa: si
    // no, el ESC que cierra el mapa abriría el menú de pausa detrás.
    if (entrada.consumirFlanco('Escape') || entrada.consumirAtras() ||
        entrada.consumirFlanco('CapsLock') || entrada.consumirFlanco('F4')) {
      mapaAbierto = false;
      entrada.limpiarFlanco();
      return;
    }
    for (let i = 0; i < jugadores.length; i++) {
      const c = entrada.controles[i];
      if (c && c.consumirBoton(3)) { mapaAbierto = false; entrada.limpiarFlanco(); return; }
    }
    // El zoom: en el teclado los dos signos, con sus gemelos del teclado
    // numérico; en el mando, los gatillos de abajo (derecho acerca, izquierdo
    // aleja), que pidió Sergio.
    //
    // LOS CÓDIGOS DE TECLA SON FÍSICOS, no del carácter: 'Equal' y 'Minus' son
    // las teclas del + y el - EN UN TECLADO AMERICANO. En el español, en esas
    // posiciones están la ¡ y la ', y el + y el - viven en 'BracketRight' y
    // 'Slash'. Sin estas dos el zoom no respondía en el teclado de Sergio.
    let z = 0;
    if (entrada.consumirFlanco('Equal') || entrada.consumirFlanco('BracketRight') ||
        entrada.consumirFlanco('NumpadAdd')) z = 1;
    if (entrada.consumirFlanco('Minus') || entrada.consumirFlanco('Slash') ||
        entrada.consumirFlanco('NumpadSubtract')) z = -1;
    for (let i = 0; i < jugadores.length; i++) {
      const c = entrada.controles[i];
      if (!c) continue;
      if (c.consumirBoton(7)) z = 1;
      if (c.consumirBoton(6)) z = -1;
    }
    if (z !== 0) acercarMapa(z);
    entrada.limpiarFlanco();
    return;
  }

  // Y para ABRIRLO, solo si no hay otra ventana puesta: con la pausa echada, la
  // Y son los ajustes.
  if (!pausado && !configEnPartida) {
    if (entrada.consumirFlanco('CapsLock') || entrada.consumirFlanco('F4')) {
      mapaAbierto = true;
    } else {
      for (let i = 0; i < jugadores.length; i++) {
        const c = entrada.controles[i];
        if (c && c.consumirBoton(3)) { mapaAbierto = true; break; }
      }
    }
    if (mapaAbierto) { entrada.limpiarFlanco(); return; }
  }
  // LA CONFIGURACIÓN, DESDE DENTRO DE LA PARTIDA. Se abre con la pausa puesta y
  // se cierra volviendo a ella, no al menú: quien la abre está jugando y quiere
  // seguir jugando. El estado sigue siendo PANTALLA_JUEGO con el mundo
  // congelado detrás; esto es una ventana más, como la ficha o el mapa.
  if (configEnPartida) {
    entradaConfig(() => { configEnPartida = false; });
    entrada.limpiarFlanco();
    return;
  }

  // EL CARTEL DE RED CAÍDA CONGELA EL MUNDO, igual que la pausa. No tendría
  // sentido seguir jugando una partida que ya no es de dos mientras decides si
  // quieres seguir jugándola. Va lo primero: mientras esté puesto no se atiende
  // ninguna otra tecla de la partida.
  if (caidaRed) { entradaCaidaRed(); entrada.limpiarFlanco(); return; }

  if (entrada.consumirFlanco('Escape', 9)) pausado = !pausado;
  // B en el mando SOLO cierra la pausa, nunca la abre: "atrás" no es un botón
  // de menú, así que si el juego no está pausado no hace nada.
  else if (pausado && entrada.consumirAtras()) pausado = false;
  // Y con la pausa puesta, O abre los ajustes. Una tecla y no una opción de
  // menú porque la pausa es un cartel, no una lista: convertirla en menú por un
  // solo destino sería más ceremonia de la que hace falta.
  if (pausado && (entrada.consumirFlanco('KeyO') || (entrada.controles[0] && entrada.controles[0].consumirBoton(3)))) {
    configEnPartida = true;
    cursorConfig = 0;
    entrada.limpiarFlanco();
    return;
  }
  // EL RETARDO DE ENTRADA SÍ SIGUE FUNCIONANDO EN RED, y va antes del corte de
  // los atajos a propósito: es precisamente jugando con alguien cuando hace
  // falta poder subirlo o bajarlo sobre la marcha. No toca la simulación —cada
  // máquina puede llevar el suyo— así que no desincroniza nada.
  //
  // Coma y punto porque están juntas y se tantean sin mirar el teclado.
  if (entrada.consumirFlanco('Comma')) {
    AVISO_ARMA.texto = `Retardo de entrada: ${Lockstep.ajustarRetardo(-1)} fotogramas`;
    AVISO_ARMA.restante = 2;
  }
  if (entrada.consumirFlanco('Period')) {
    AVISO_ARMA.texto = `Retardo de entrada: ${Lockstep.ajustarRetardo(1)} fotogramas`;
    AVISO_ARMA.restante = 2;
  }

  // LOS ATAJOS DE PRUEBA NO EXISTEN EN RED, y hay que decirlo alto.
  //
  // Todos cambian la simulación en UNA SOLA máquina: subir las armas, soltar
  // cien enemigos, saltar un minuto, volverse inmortal, cambiar de personaje.
  // El otro no se entera, así que a partir de esa tecla ya son dos partidas
  // distintas. Sergio pulsó la L —subir el nivel de las armas— y la
  // desincronización salió unos segundos después: una máquina había matado un
  // enemigo más que la otra (787 bajas contra 786) y la gema de ese enemigo
  // estaba en otro sitio.
  //
  // No se sincronizan, se apagan: son herramientas de probar el juego a solas,
  // no cosas que deban pasarle a nadie por sorpresa desde la otra punta.
  // OJO CON EL ALCANCE: esto va dentro de `actualizar`, así que aquí NO se
  // puede devolver. La primera versión lo hacía y dejaba el mundo entero sin
  // simular en cuanto había red: los dos jugadores aparecían quietos, sin
  // enemigos y sin decoración, con la música sonando y la consola limpia. Un
  // bloque etiquetado se salta los atajos sin abandonar el paso.
  atajos: {
  if (Sincro.activo) {
    if (entrada.consumirFlanco('KeyL') || entrada.consumirFlanco('KeyC') ||
        entrada.consumirFlanco('KeyJ') || entrada.consumirFlanco('KeyH') ||
        entrada.consumirFlanco('KeyG') || entrada.consumirFlanco('KeyK') ||
        entrada.consumirFlanco('KeyM') || entrada.consumirFlanco('KeyR') ||
        entrada.consumirFlanco('Digit1') || entrada.consumirFlanco('Digit2') ||
        entrada.consumirFlanco('Digit3') || entrada.consumirFlanco('Digit4') ||
        entrada.consumirFlanco('Digit5') || entrada.consumirFlanco('Digit6') ||
        entrada.consumirFlanco('Digit7') || entrada.consumirFlanco('Digit8') ||
        entrada.consumirFlanco('KeyX')) {
      AVISO_ARMA.texto = 'Los atajos de prueba están apagados en red';
      AVISO_ARMA.restante = 2.5;
    }
    break atajos;
  }

  if (entrada.consumirFlanco('KeyC')) {
    // Cambia el personaje del jugador 1; los demás llevan el suyo.
    indicePersonaje = (indicePersonaje + 1) % ORDEN_PERSONAJES.length;
    jugadores[0].personaje = PERSONAJES[ORDEN_PERSONAJES[indicePersonaje]].sprite;
  }
  if (entrada.consumirFlanco('KeyJ')) anyadirJugador();
  if (entrada.consumirFlanco('KeyH')) quitarJugador();
  if (entrada.consumirFlanco('Digit1')) tanda(100, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit2')) tanda(500, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit3')) tanda(800, MEZCLA_TEMPRANA);
  if (entrada.consumirFlanco('Digit4')) tanda(300, MEZCLA_TARDIA);
  // El DIRECTOR corre siempre: es la partida. La tecla 5 lo apaga para poder
  // juzgar un arma sin oleada encima, y al volver a encenderlo arranca del
  // minuto 0 y limpia la pantalla, porque lo que se mide entonces es la curva y
  // arrastrar ochocientas serpientes de la tecla 3 falsea el minuto 0 entero.
  //
  // 6 y 7 mueven el reloj un minuto: probar el minuto 16 esperando dieciséis
  // minutos no es probar, es esperar.
  if (entrada.consumirFlanco('Digit5')) {
    if (Director.alternar()) {
      enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); disparos.vaciar(); Jefes.vaciar();
    }
  }
  if (entrada.consumirFlanco('Digit6')) Director.saltar(60);
  if (entrada.consumirFlanco('Digit7')) Director.saltar(-60);
  // Cofre a los pies del jugador 1. Esperar a que caiga una mantícora para
  // comprobar una evolución son cinco minutos de partida por intento.
  if (entrada.consumirFlanco('Digit8')) cofres.soltar(jugadores[0].x, jugadores[0].y);
  if (entrada.consumirFlanco('KeyX')) {
    enemigos.vaciar(); proyectiles.vaciar(); zonas.vaciar(); cofres.vaciar();
    disparos.vaciar(); Jefes.vaciar();
  }
  if (entrada.consumirFlanco('KeyG')) {
    const nuevo = !jugadores[0].inmortal;
    for (let i = 0; i < jugadores.length; i++) jugadores[i].inmortal = nuevo;
  }
  if (entrada.consumirFlanco('KeyR')) {
    for (let i = 0; i < jugadores.length; i++) jugadores[i].reiniciar();
    // Y se retira la pantalla final. Sin esto, `finalMostrado` se quedaba
    // puesto para siempre: levantar a los jugadores les devolvía el control
    // pero el cartel seguía encima de la partida y no había forma de quitarlo
    // sin recargar. Era el bug que hacía que la R "no hiciera nada".
    finalMostrado = null;
    statsFinal = null;
    resumenFinal = false;
    relojResumen = 0;
    derrotaGuardada = false;
    refrescarChuleta();
  }
  if (entrada.consumirFlanco('KeyL')) subirTodasLasArmas();
  if (entrada.consumirFlanco('KeyM')) cicladorArmas(false);
  if (entrada.consumirFlanco('KeyComma')) cicladorArmas(true);
  // LOS OBJETOS, con K e I, igual que las armas con M y la coma. La K equipaba
  // el Gladius y eso ya no tenía sentido: para poner un arma concreta está el
  // ciclador, que además dice cuál es. Lo pidió Sergio y tiene razón — era un
  // atajo a un arma del que ya había otro camino mejor.
  //
  // La I la usa además la pantalla de RED para invitar a otro jugador, y no
  // chocan: aquel bloque solo corre con `pantalla === PANTALLA_RED` y este está
  // dentro de los atajos de partida. Hay precedente —la X vacía la horda aquí y
  // es la subida automática en la ficha— pero conviene saberlo antes de mover
  // ninguna de las dos.
  if (entrada.consumirFlanco('KeyK')) cicladorObjetos(false);
  if (entrada.consumirFlanco('KeyI')) cicladorObjetos(true);
  if (entrada.consumirFlanco('KeyZ')) equiparConCalcomania();
  // Interruptores de perfilado: apagar un sistema y mirar los fps es la forma
  // más directa de saber qué cuesta en una máquina concreta.
  if (entrada.consumirFlanco('KeyP')) activo.particulas = !activo.particulas;
  if (entrada.consumirFlanco('KeyN')) activo.numeros = !activo.numeros;
  if (entrada.consumirFlanco('KeyO')) activo.efectos = !activo.efectos;
  if (entrada.consumirFlanco('KeyY')) activo.suelo = !activo.suelo;
  if (entrada.consumirFlanco('KeyT')) {
    Enemigos.destelloActivo = !Enemigos.destelloActivo;
    activo.destello = Enemigos.destelloActivo;
  }
  }   // fin del bloque `atajos`

  // Menú de subida de nivel: congela el mundo entero. Es el único momento en que
  // el juego se detiene solo, y tiene prioridad sobre todo lo demás.
  //
  // Mientras gira la ruleta (Progresion.animando) no se atiende ninguna
  // entrada: aceptar Enter durante el giro dejaría elegir una carta que
  // todavía no se ha visto.
  if (Progresion.abierto) {
    if (!Progresion.tirando(dt)) menuNivelEntrada();
    entrada.limpiarFlanco();
    return;
  }

  if (pausado) { entrada.limpiarFlanco(); return; }

  // Hitstop: congela la LÓGICA unos milisegundos tras un golpe fuerte, pero el
  // render sigue corriendo. Se siente como un frenazo del mundo, no como una
  // caída de fps. La sacudida sí avanza, o el parón la dejaría clavada.
  if (VFX.congelado > 0) {
    VFX.congelado -= dt;
    VFX.actualizar(dt);
    entrada.limpiarFlanco();
    return;
  }

  // LAS PULSACIONES NO ENTRAN DIRECTAS EN LA SIMULACIÓN, pasan por el búfer.
  //
  // `registrar` apunta lo que se está pulsando ahora para dentro de unos pasos;
  // `marcoDe` devuelve lo que toca consumir en ESTE. Con retardo 0 las dos
  // cosas son la misma y se juega como siempre. Ver core/lockstep.js.
  //
  // Cada jugador con SU control: el jugador 1 lleva teclado y mando 0; los
  // demás, su mando.
  // EN RED, EL PASO NO SIEMPRE SE PUEDE DAR.
  //
  // `antesDelPaso` manda lo que se está pulsando aquí —siempre, aunque el mundo
  // esté parado— y contesta si ya se conocen las pulsaciones de todos. Si no,
  // el mundo se queda quieto este fotograma. Eso es lo que se ve como "lag" en
  // un juego así: no es lentitud, es la partida esperando a saber qué hizo el
  // otro. Inventarse su pulsación sería jugar otra partida distinta.
  if (Sincro.activo) {
    if (!Sincro.antesDelPaso(entrada)) { entrada.limpiarFlanco(); return; }
  } else {
    Lockstep.registrar(entrada);
  }
  for (let i = 0; i < jugadores.length; i++) {
    jugadores[i].actualizar(dt, Lockstep.marcoDe(i));
  }
  limpiarAtaquesDeCaidos();
  avisarVidasPerdidas();
  Lockstep.avanzar();
  if (Sincro.activo) Sincro.despuesDelPaso();
  reanimar(dt);
  Mascotas.actualizar(dt, jugadores, ctxArmas);
  for (let i = 0; i < jugadores.length; i++) clamparXNivel(jugadores[i]);
  // EL CAMINO HASTA LOS JUGADORES, recalculado justo antes de que la horda se
  // mueva. Solo hace trabajo de verdad una vez cada seis pasos (ver
  // sistemas/rejillaMapa.js) y en Mérida no hace ninguno.
  RejillaMapa.actualizarCampo(jugadores, false);
  // Lo que se va viendo del nivel. Cada paso, y no cada seis como el campo de
  // flujo: son mil celdas por jugador y casi todas ya están marcadas, así que
  // cuesta menos que ponerle un contador.
  RejillaMapa.mirarAlrededor(jugadores);
  enemigos.mover(dt, jugadores, camara);
  proyectiles.mover(dt, estallar, camara, cazarCercano, jugadores);

  // Orden deliberado: primero se recicla (el pool intercambia posiciones y
  // dejaría los índices de la rejilla apuntando a otras entidades), y solo
  // entonces se construye la rejilla. Se construye UNA vez y la usan TODOS los
  // sistemas que vienen detrás: separación, contacto, armas e impactos.
  //
  // La separación mueve hasta 4px después de construirla, así que el contacto
  // trabaja con una rejilla desfasada esos 4px. Es inofensivo: la consulta 3x3
  // cubre 64px y el alcance real del contacto son 49 como mucho (radio 39 de la
  // hidra + 10 del jugador), o sea 15px de margen.
  enemigos.reciclarLejanos(camara.x, camara.y);
  enemigos.rejilla.reconstruir(
    enemigos.pool.items, enemigos.pool.activos, camara.x, camara.y);
  separacion(enemigos, jugadores);
  // Las máquinas expendedoras, ANTES de los obstáculos: es quien pone las
  // rotas en `Obstaculos.fijos` y las enteras en el pool de enemigos.
  Expendedoras.actualizar(camara, enemigos);
  Obstaculos.actualizar(camara.y, enemigos);
  colisionarObstaculos(Obstaculos, jugadores, enemigos);
  colisionarParedes();
  // Con las paredes ya aplicadas: lo que cada enemigo ha avanzado de verdad,
  // para el detector de atasco de los jefes (ver `medirAvance`).
  enemigos.medirAvance();
  // Y los proyectiles que CORREN por el suelo -hoy el Osito Dinamito- contra
  // esos mismos obstaculos. Va aqui, justo detras y con la plantilla ya
  // colocada por `Obstaculos.actualizar`, porque es el mismo problema: lo que
  // pisa el suelo no atraviesa una columna.
  colisionarObstaculosProyectiles(Obstaculos, proyectiles);
  // Los ataudes son solidos igual que una columna: el sitio donde ha caido un
  // companero deja de ser sitio por el que se pasa.
  colisionarAtaudes(jugadores, enemigos);
  contactoJugadores(enemigos, jugadores);

  // Las armas disparan DESPUÉS de reconstruir la rejilla: el arco melee la
  // consulta para saber a quién alcanza, y con una rejilla del paso anterior
  // podría dar a alguien que ya no está donde se ve.
  //
  // Un arsenal por jugador, cada uno con sus recargas. El contexto se reapunta
  // en vez de crearse: cuatro jugadores por sesenta pasos serían 240 objetos
  // por segundo tirados a la basura.
  for (let i = 0; i < jugadores.length; i++) {
    if (jugadores[i].abatido) continue;      // un caído no dispara
    ctxArmas.jugador = jugadores[i];
    arsenales[i].actualizar(dt, ctxArmas);
    arsenales[i].actualizarOrbitales(dt, ctxArmas);
    arsenales[i].actualizarTajos(dt);
  }
  impactosProyectiles(proyectiles, enemigos, estallar);

  // Los muertos se retiran cuando ya nadie recorre la rejilla. Hasta aquí solo
  // estaban marcados con vida a cero.
  enemigos.retirarMuertos();
  proyectiles.reciclarFuera(camara);

  zonas.actualizar(dt, enemigos);
  enemigos.retirarMuertos();
  recogibles.actualizar(dt, jugadores);
  // Los cofres van DESPUÉS de retirar a los muertos: el que suelta un élite al
  // caer tiene que existir ya cuando se comprueba quién lo pisa, o se perdería
  // el caso de morir justo encima del jugador.
  cofres.actualizar(dt, jugadores);
  actualizarLlamarada(dt);
  // Los disparos enemigos van DESPUÉS de las armas: primero se limpia el aire
  // con lo que el jugador haya lanzado este paso, y lo que sobreviva avanza. Al
  // revés, un disparo podría atravesar una explosión que ocurre en el mismo
  // instante y eso se lee como un fallo.
  disparos.barrer(proyectiles, zonas, arsenales, jugadores);
  disparos.actualizar(dt, jugadores, camara);
  Particulas.actualizar(dt);
  VFX.actualizar(dt);
  if (AVISO_ARMA.restante > 0) AVISO_ARMA.restante -= dt;
  GestorAudio.actualizar();

  // Si alguien ha subido de nivel durante este paso, el menú abre en el
  // siguiente. Se atiende aquí, al final, para que el paso termine entero.
  Progresion.atender(jugadores);

  // La cámara va al centro del grupo y la correa impide que nadie se salga de
  // pantalla. Sujetar DESPUÉS de mover la cámara: al revés, el rezagado toparía
  // contra un borde que ya no está donde se le sujetó.
  camara.seguirGrupo(jugadores, dt);
  // En un recinto cerrado la cámara se para en la fachada: sin esto se asoma al
  // vacío de fuera del mapa en cuanto el grupo pega la espalda a una pared.
  if (RejillaMapa.activa) camara.sujetarAlMundo(RejillaMapa.anchoMundo, RejillaMapa.altoMundo);
  camara.sujetar(jugadores);
  // Después de la correa: si dos topan contra el mismo borde, hay que volver a
  // separarlos o el tope los dejaría uno dentro del otro.
  separarJugadores(jugadores);

  // El director aparece DESPUÉS de mover la cámara: si lo hiciera antes, con la
  // cámara corriendo detrás del grupo los enemigos entrarían medio metidos en
  // pantalla por el lado hacia el que se avanza.
  Director.actualizar(dt, enemigos, camara);
  // Los jefes van DESPUÉS del director: si acaba de invocar a uno este mismo
  // paso, sistemas/jefes.js ya lo encuentra registrado y puede empezar a
  // actuar sin esperar a la vuelta siguiente del bucle.
  Jefes.actualizar(dt, enemigos, jugadores, disparos);
  // Y LO QUE ABRE CADA JEFE AL CAER, que es lo que estructura el nivel 2: el
  // centro comercial se juega en tres anillos y de uno al siguiente solo se pasa
  // por unos cierres que hay que ganarse.
  atenderCierres();

  // Último en tocar posiciones este paso: atrapa tanto a los que acaban de
  // aparecer (director/jefes, arriba) como a los que se han movido, antes de
  // que nadie los vea ni de que puedan soltar una gema fuera del mundo.
  {
    const items = enemigos.pool.items;
    const n = enemigos.pool.activos;
    for (let k = 0; k < n; k++) clamparXNivel(items[k]);
    // Y los que hayan aparecido DENTRO de una pared, fuera de ella. Los patrones
    // del director reparten en anillo alrededor de la cámara sin saber que aquí
    // hay tiendas, así que en un mapa con 2000 celdas macizas una buena parte de
    // las apariciones cae en sitio imposible. `sacarDePared` sale en el acto
    // para quien ya está en suelo bueno, que es el caso normal.
    if (RejillaMapa.activa) {
      for (let k = 0; k < n; k++) RejillaMapa.sacarDePared(items[k]);
    }
  }

  // Todos caídos: se guardan los denarios ganados en la partida. Por flanco,
  // no cada frame que el cartel sigue en pantalla —aquí no hay a dónde volver
  // sin recargar, así que es la última oportunidad razonable de escribir.
  const derrota = jugadores.every((j) => j.abatido);
  if (derrota && !derrotaGuardada) { MetaProgreso.guardar(); derrotaGuardada = true; }
  else if (!derrota) derrotaGuardada = false;

  // Fin de la partida: el reloj llega al final ANTES que la derrota, para que
  // un equipo que cae justo cuando expira el tiempo se lleve la victoria y no
  // una derrota de última hora — ver la nota de finalMostrado más arriba.
  if (!finalMostrado && hayVictoria()) {
    statsFinal = capturarStats();
    finalMostrado = 'victoria';
    refrescarChuleta();
    MetaProgreso.anotarPartida(Director.t);
    // Y la fase queda superada. Solo aquí: la derrota no supera nada.
    MetaProgreso.superarFase(nivelActual.id);
  } else if (!finalMostrado && derrota) {
    statsFinal = capturarStats();
    finalMostrado = 'derrota';
    resumenFinal = false;      // primero el cartel; el resumen se pide
    // Cuenta igual que la victoria para la hoja de servicios del hueco:
    // aguantar veintiocho minutos y caer es un dato tan bueno como ganar.
    // `anotarPartida` guarda, así que releva al guardado por flanco de arriba.
    MetaProgreso.anotarPartida(Director.t);
  }

  // Segundo tiempo de la derrota: cualquier tecla pasa del cartel al resumen.
  // Se atiende AQUÍ y no arriba del todo porque el flanco que abre el resumen
  // no puede ser el mismo golpe de tecla que acaba de matarte.
  //
  // Y del resumen se sale AL MENÚ PRINCIPAL, que es el tercer y último tiempo.
  // La victoria se salta el cartel y entra por la segunda rama desde el primer
  // frame: allí no hay ataúd que mirar.
  if (finalMostrado === 'derrota' && !resumenFinal) {
    // `flancoAvance` y no cualquier tecla: estas dos son pantallas de PASO, y
    // pasar de la derrota al resumen —y del resumen al menú— con un roce
    // cualquiera se lleva por delante los números de la partida antes de que
    // nadie los haya leído. El cofre sigue admitiendo cualquier cosa a
    // propósito: aquel no es una pantalla de paso, es un "vale" en mitad del
    // juego con el mando ya en la mano (ver `algunFlanco`).
    if (entrada.flancoAvance()) { resumenFinal = true; relojResumen = 0; refrescarChuleta(); }
  } else if (finalMostrado) {
    relojResumen += dt;
    if (relojResumen >= ESPERA_RESUMEN && entrada.flancoAvance()) {
      entrada.limpiarFlanco();
      volverAlMenu();
      return;
    }
  }

  entrada.limpiarFlanco();
}

// Interruptor de subida automática. Se atiende en dos sitios —la ficha y el menú
// de subida de nivel— porque son los dos momentos en que uno se acuerda de que
// existe: mirando la ficha, o harto de que se abra el menú.
//
// El botón 2 del mando es X en el mapeo estándar.
function alternarAutomatico(j) {
  if (!j) return;
  const c = entrada.controles[jugadores.indexOf(j)] || entrada.controles[0];
  if (entrada.consumirFlanco('KeyF') || c.consumirBoton(2)) {
    if (Progresion.puedeAutomatizar(j)) j.autoNivel = !j.autoNivel;
  }
}

// Entrada del menú de nivel. Elige el jugador al que le toca —con su propio
// mando— pero el teclado vale siempre: si el que sube es el jugador 3 y no
// tiene mando a mano, la partida no puede quedarse bloqueada.
// LA CARTA QUE SE ELIGE AL SUBIR DE NIVEL TAMBIÉN ES SIMULACIÓN.
//
// Y no puede viajar por el búfer de pulsaciones, porque el menú PARA EL MUNDO:
// mientras está abierto, el reloj de pasos no avanza y el búfer no fluye. Así
// que la elección va por el canal de control, que es el fiable, atada al puesto
// que la hace.
//
// Las dos máquinas abren el menú en el mismo paso —la experiencia es
// determinista, así que suben de nivel a la vez— y las dos aplican el MISMO
// índice de carta. Quien no es dueño del menú lo ve pero no lo toca: si pudiera
// elegir, cada máquina se quedaría una carta distinta y a partir de ahí serían
// dos partidas.
// Lo que ha hecho con su cofre quien lo cogió. Se aplica igual aquí, para que
// las dos pantallas cierren a la vez.
function cofreRemoto(accion) {
  if (!Progresion.cofreAbierto) return;
  if (accion === 0) Progresion.saltarGiro();
  else Progresion.cerrarCofre();
}

function eleccionRemota(indice) {
  if (!Progresion.abierto) return;
  Progresion.seleccion = indice;
  Progresion.elegir(indice);
  Progresion.atender(jugadores);
}

function menuNivelEntrada() {
  const j = Progresion.actual;
  const puesto = jugadores.indexOf(j);
  const c = entrada.controles[puesto] || entrada.controles[0];
  const n = Progresion.nOpciones;

  // En red, el menú de otro no se toca: su dueño elegirá y lo dirá.
  if (Sincro.activo && puesto !== Sincro.jugadorLocal) return;

  // El stick se lee UNA vez por paso: flancoEje consume estado, así que
  // llamarlo dos veces devolvería 0 la segunda.
  const eje = c.flancoEje(true);
  if (entrada.consumirFlanco('ArrowRight') || c.consumirBoton(15) || eje > 0) {
    Progresion.seleccion = (Progresion.seleccion + 1) % n;
  }
  if (entrada.consumirFlanco('ArrowLeft') || c.consumirBoton(14) || eje < 0) {
    Progresion.seleccion = (Progresion.seleccion + n - 1) % n;
  }
  for (let i = 0; i < n; i++) {
    if (entrada.consumirFlanco('Digit' + (i + 1))) Progresion.seleccion = i;
  }
  if (entrada.consumirFlanco('KeyR') && j.rerolls > 0) {
    Progresion.rerollar(jugadores);
    return;
  }
  alternarAutomatico(j);
  // Botón 0 = A en el mapeo estándar.
  if (entrada.consumirFlanco('Enter') || entrada.consumirFlanco('Space') ||
      c.consumirBoton(0)) {
    const elegida = Progresion.seleccion;
    // Se avisa ANTES de aplicarla: si `elegir` encadenara otro menú y el aviso
    // saliera después, los dos mensajes irían en otro orden y el de allí se
    // aplicaría sobre el menú equivocado.
    if (Sincro.activo) Sincro.avisarEleccion(elegida);
    Progresion.elegir(elegida);
    Progresion.atender(jugadores);      // encadena si hay más en cola
  }
}

// --- Atajos de prueba (TEMPORAL, Fase 3) ------------------------------------
// La progresión de verdad llega en la Fase 4 con la pantalla de subida de nivel.
function subirTodasLasArmas() {
  for (let i = 0; i < arsenales.length; i++) {
    const eq = arsenales[i].equipadas;
    for (let k = 0; k < eq.length; k++) arsenales[i].subirNivel(eq[k].id);
  }
}
// Recorre el catálogo dejando UNA sola arma equipada al jugador 1. Es la única
// forma de juzgar un patrón por separado: con seis a la vez no se distingue cuál
// hace qué. Con Shift va hacia atrás.
let indiceCatalogo = -1;

// CARTEL DEL ARMA. Se enseña el nombre en pantalla al cambiar, unos segundos.
//
// El ciclador existía desde hace tiempo pero era a ciegas: cincuenta y siete
// armas pasando sin decir cuál es, y para saberlo había que abrir el panel de
// depuración. Repasar el catálogo entero así no lo hace nadie. Con el nombre
// delante, pulsar M cincuenta y siete veces sí es una forma de ver todos los
// efectos, que es para lo que está.
const AVISO_ARMA = { texto: '', restante: 0 };
const DURACION_AVISO_ARMA = 2.2;

// ORDEN ALFABÉTICO POR NOMBRE, y no el del catálogo.
//
// `Object.keys(ARMAS)` da el orden de declaración, que agrupa por familias y
// va bien para leer el archivo pero fatal para recorrerlas a mano: no hay
// forma de saber si ya has pasado por la Guadaña ni de volver a un arma
// concreta. Alfabético por el nombre VISIBLE —no por el identificador— porque
// es lo que se lee en pantalla, y con `localeCompare` en español para que la
// Ñ y los acentos caigan donde un humano los busca.
//
// Se ordena UNA vez al cargar el módulo: el catálogo no cambia en partida.
const ORDEN_CATALOGO = Object.keys(ARMAS)
  .sort((a, b) => ARMAS[a].nombre.localeCompare(ARMAS[b].nombre, 'es'));

// ¿Trae dibujo propio o se dibuja por código? Es lo que más se consulta cuando
// se está repasando el arte, así que sale en el aviso y en el panel de F3.
//
// `spriteOnda` estaba SIN mirar y son diez armas —las seis explosivas y las
// cuatro de onda expansiva—: salían marcadas como si no tuvieran dibujo justo
// cuando se estaba comprobando su dibujo.
export function armaTieneDibujo(def) {
  return !!(def.sprite || def.spriteTajo || def.spriteOnda ||
            def.spriteOrbital || def.spriteProyectil);
}

function cicladorArmas(haciaAtras) {
  const ids = ORDEN_CATALOGO;
  indiceCatalogo = (indiceCatalogo + (haciaAtras ? -1 : 1) + ids.length) % ids.length;
  const id = ids[indiceCatalogo];
  const a = arsenales[0];
  // Se queda SOLO con la nueva, y a nivel 1: `equipar` siempre crea en 1, así
  // que un arma que estuviera al 8 vuelve a su forma base. Es lo que hace que
  // dos armas se puedan comparar entre sí.
  a.equipadas.length = 0;
  a.vaciar();
  a.equipar(id);

  const def = ARMAS[id];
  AVISO_ARMA.texto = `${indiceCatalogo + 1}/${ids.length}  ${def.nombre}` +
                     (armaTieneDibujo(def) ? '  [dibujo]' : '');
  AVISO_ARMA.restante = DURACION_AVISO_ARMA;
}

// Se dibuja en la CAPA DE INTERFAZ y arriba del todo: es texto de desarrollo y
// abajo lo taparían los paneles de jugador.
function dibujarAvisoArma(ctx) {
  if (AVISO_ARMA.restante <= 0) return;
  const t = AVISO_ARMA.restante / DURACION_AVISO_ARMA;
  ctx.save();
  ctx.globalAlpha = t > 0.35 ? 1 : t / 0.35;    // se apaga al final
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `700 20px ${FUENTE}`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(14,10,18,.92)';
  ctx.lineWidth = 5;
  ctx.strokeText(AVISO_ARMA.texto, ANCHO_UI / 2, 18);
  ctx.fillStyle = '#ffe9b0';
  ctx.fillText(AVISO_ARMA.texto, ANCHO_UI / 2, 18);
  ctx.restore();
}

// Equipa de golpe TODAS las armas que llevan calcomanía de suelo, y nada más.
//
// Existe porque probarlas de otra forma es absurdo: con el ciclador (M) hay que
// contar trece pulsaciones para el Rete y cuarenta y cuatro para el Alquitrán, y
// esas cuentas cambian en cuanto alguien mete un arma nueva en medio del
// catálogo. Al jugador de verdad le llegan por sorteo, o sea cuando quieran.
//
// La lista sale de los DATOS —quién declara `sprite` en datos/armas.js— y no de
// unos ids escritos aquí. Así la tecla sigue sirviendo según se vayan añadiendo
// o quitando calcomanías, sin que nadie tenga que acordarse de actualizar esto:
// ya se descartaron dos (la lava del Fuego griego y el sello de las Minas) y con
// una lista a mano habrían quedado dos ids muertos.
//
// Vacía el arsenal, igual que el ciclador: se trata de ver los charcos sin que
// otras seis armas llenen la pantalla de destellos. Conviene combinarla con G
// (inmortal), porque el Rete y el Alquitrán casi no matan.
function equiparConCalcomania() {
  const a = arsenales[0];
  a.equipadas.length = 0;
  a.vaciar();
  const ids = Object.keys(ARMAS);
  for (let i = 0; i < ids.length; i++) {
    const d = ARMAS[ids[i]];
    if (d.sprite || d.spriteTajo || d.spriteOrbital || d.spriteProyectil) a.equipar(ids[i]);
  }
}

// --- Ciclador de OBJETOS (K adelante, I atrás) -------------------------------
//
// El hermano del ciclador de armas, y existe por lo mismo: probar un objeto de
// otra forma es absurdo. Hay veintinueve pasivos y la única manera de ver uno
// concreto en partida era rezar para que saliera en una carta de subida de
// nivel — con tres opciones de un sorteo entre armas y objetos, ver el que te
// interesa puede costar media hora.
//
// SE QUEDA CON UNO SOLO, igual que el de armas y por el mismo motivo: con los
// demás puestos no se sabe qué efecto es de quién. Y ese es justo el caso en
// que más falta hace mirar de uno en uno, porque casi todos los pasivos son
// números que no se ven —un 12% de área, medio punto de armadura— y la única
// forma de leerlos es la ficha de jugador con TAB.
//
// A NIVEL 1, también como el de armas: es el escalón con el que se comparan
// entre sí. Para verlo al máximo se pulsa K y luego se sube a mano.
//
// Reutiliza el aviso de arma en pantalla (AVISO_ARMA) en vez de montar otro: es
// el mismo cartel diciendo lo mismo —qué acabas de equipar— y dos carteles a la
// vez en la misma esquina se taparían el uno al otro.
//
// ORDEN ALFABÉTICO por el nombre visible, por lo mismo que el catálogo de
// armas: el de declaración agrupa por tandas y va bien para leer el archivo,
// pero recorriéndolo a mano no hay forma de saber por dónde ibas.
const ORDEN_PASIVOS = Object.keys(PASIVOS)
  .sort((a, b) => PASIVOS[a].nombre.localeCompare(PASIVOS[b].nombre, 'es'));
let indicePasivos = -1;

function cicladorObjetos(haciaAtras) {
  const ids = ORDEN_PASIVOS;
  indicePasivos = (indicePasivos + (haciaAtras ? -1 : 1) + ids.length) % ids.length;
  const id = ids[indicePasivos];
  const j = jugadores[0];
  if (!j) return;

  // Se BORRAN los que hubiera, y por eso hay que recalcular después: las
  // estadísticas del jugador son la suma de todos sus pasivos, así que dejar de
  // llevar uno no se nota hasta que alguien vuelve a hacer esa suma.
  for (const otro in j.pasivos) delete j.pasivos[otro];
  j.pasivos[id] = 1;
  j.recalcularStats();

  // El Ánfora sube la vida máxima: sin esto, ciclar hasta ella deja la barra a
  // la mitad de golpe, que parece que te han pegado.
  const def = PASIVOS[id];
  if (def.curaAlSubir) j.vida = Math.min(j.vidaMaxima, j.vida + def.curaAlSubir);

  AVISO_ARMA.texto = `${indicePasivos + 1}/${ids.length}  ${def.nombre}`;
  AVISO_ARMA.restante = DURACION_AVISO_ARMA;
}

// --- Render -----------------------------------------------------------------
// ¿Está el mundo parado? Lo están la pausa, la ficha, el menú de subida de
// nivel, el aviso de evolución y el hitstop. Todos comparten la misma vía: en
// `actualizar` se sale antes de tocar la simulación.
function mundoCongelado() {
  return pausado || configEnPartida || fichaAbierta >= 0 || mapaAbierto || Progresion.abierto ||
         Progresion.cofreAbierto || VFX.congelado > 0;
}

function dibujar(alpha) {
  // Música: se programa por horizonte en tiempo de PARED, no de simulación
  // (ver sistemas/audio.js), así que avanza aquí, en el render de cada
  // fotograma, y no en el paso de lógica fijo — sigue sonando aunque el
  // mundo esté congelado por un menú o la pausa.
  GestorAudio.tick();

  // Título y selección: no hay mundo que dibujar. La ilustración ocupa el
  // lienzo del juego entero y los resaltados van en la capa de interfaz, así
  // que ni se limpia el suelo ni se recorren pools que están vacíos.
  if (pantalla !== PANTALLA_JUEGO) {
    // La música del menú, en todas las pantallas previas MENOS la intro. Se pide
    // cada fotograma y no al cambiar de pantalla a propósito: hasta que el
    // usuario no toca una tecla el navegador no deja sonar nada, y así entra
    // sola en cuanto lo hace sin que ninguna pantalla tenga que saberlo (ver
    // musicaMenu).
    //
    // Lo de antes de jugar tiene DOS canciones, y el corte es la PORTADA de la
    // intro: el primer cartel del juego y el último paso antes de elegir
    // partida. Hasta ahí suena la de siempre —el logo y el relato, por debajo
    // del narrador, que la agacha al 10% con apartarMusica—; de ahí en adelante
    // el tema del título, que estrena en la portada y se queda hasta la partida.
    if (pantalla === PANTALLA_INTRO && !Intro.enPortada) GestorAudio.musicaIntro();
    else GestorAudio.musicaMenu();
    Capa.limpiar();
    if (despedida) { Pantallas.titulo(ctx, Capa.ctx, null, 0); dibujarDespedida(Capa.ctx); return; }
    if (pantalla === PANTALLA_INTRO) { Intro.dibujar(ctx, Capa.ctx); return; }
    if (pantalla === PANTALLA_HISTORIA) { Historia.dibujar(ctx, Capa.ctx); return; }
    if (pantalla === PANTALLA_RED) { dibujarRed(ctx, Capa.ctx, red); return; }
    // Fuera de esa pantalla, la caja del código no puede quedarse flotando: es
    // un elemento de verdad encima del lienzo, no un dibujo que se borre solo
    // al limpiar el fotograma.
    ocultarCodigoRed();
    if (pantalla === PANTALLA_HUECOS) {
      dibujarHuecos(ctx, Capa.ctx, cursorHueco, enBorrarHueco,
                    Nube.URL_NUBE
                      ? { codigo: Nube.codigo(), aviso: nubeAviso, login: nubeLogin,
                          conectando: nubeConectando }
                      : null,
                    enFilaGithub);
      if (confirmarBorrado) {
        dibujarConfirmacion(Capa.ctx, cursorConfirmar, textoBorrado(cursorHueco));
      }
      if (nubeConectando) dibujarEsperaGithub(Capa.ctx);
      return;
    }
    if (pantalla === PANTALLA_TITULO) {
      Pantallas.titulo(ctx, Capa.ctx, MENU, cursorMenu);
    }
    else if (pantalla === PANTALLA_NIVELES) {
      dibujarNiveles(ctx, Capa.ctx, listaDeNiveles(), cursorNivel, cambiandoNivel);
    }
    else if (pantalla === PANTALLA_TIENDA) dibujarTienda(ctx, Capa.ctx, cursorTienda, pestanyaTienda);
    else if (pantalla === PANTALLA_MASCOTAS) {
      Pantallas.mascotas(ctx, Capa.ctx, mascotasDisponibles(), cursorMascota,
                         turnoMascota, puestos, mascotasElegidas);
    } else if (pantalla === PANTALLA_CONTROLES) {
      dibujarControles(ctx, Capa.ctx, cursorControl, capturandoControl);
    } else if (pantalla === PANTALLA_CONFIG) {
      dibujarConfig(ctx, Capa.ctx, CONFIG, cursorConfig);
    }
    // GALERÍA (temporal)
    else if (pantalla === PANTALLA_GALERIA) {
      dibujarGaleria(ctx, Capa.ctx, seccionGaleria, cursorGaleria);
    }
    else Pantallas.seleccion(ctx, Capa.ctx, puestos, focoSeleccion);
    return;
  }

  // EL TEMBLOR DE LAS PANTALLAS PARADAS.
  //
  // Con el mundo congelado, la lógica no corre pero el RENDER sí, y el bucle le
  // sigue pasando un alpha que oscila entre 0 y 1 cada frame. Como al congelar
  // se sale de `actualizar` ANTES de que las entidades copien su posición a
  // xPrev, cada una conserva el desplazamiento del último paso y la
  // interpolación las mueve adelante y atrás sesenta veces por segundo. De ahí
  // el temblor al abrir el menú, el cofre, la ficha o la pausa: pequeño, pero
  // constante y justo cuando hay que leer.
  //
  // Congelado, alpha vale 1: se dibuja el estado final del último paso, quieto.
  if (mundoCongelado()) alpha = 1;

  for (let i = 0; i < jugadores.length; i++) jugadores[i].interpolar(alpha);
  camara.interpolar(alpha);

  // La cámara se ancla a píxel físico entero. Sin esto el suelo tiembla:
  // el vecino más próximo va duplicando y saltando filas de píxeles. La
  // sacudida se suma ANTES de redondear, así que también sale en píxeles
  // enteros y no rompe la rejilla.
  const offX = Math.round((camara.izquierdaVista + VFX.desvioX) * ESCALA_ARTE);
  const offY = Math.round((camara.arribaVista + VFX.desvioY) * ESCALA_ARTE);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.setTransform(ESCALA_ARTE, 0, 0, ESCALA_ARTE, -offX, -offY);

  let t = performance.now();
  if (activo.suelo) dibujarSuelo(offX / ESCALA_ARTE, offY / ESCALA_ARTE);
  else { ctx.fillStyle = '#b99b6b'; ctx.fillRect(offX / ESCALA_ARTE, offY / ESCALA_ARTE, ANCHO_LOGICO, ALTO_LOGICO); tilesDibujados = 0; }
  perfil.suelo = performance.now() - t;

  t = performance.now();
  // Las calcomanías de zona, LO PRIMERO después del terreno: un charco de
  // aceite es una mancha en el suelo y tiene que quedar por debajo de todo lo
  // que se pueda pisar, gemas incluidas. Su canto se pinta luego, arriba del
  // todo, con el resto de efectos (ver zonaDanyo.js).
  if (activo.efectos) {
    zonas.dibujarSuelo(ctx);
    // Y las ondas que van POR EL SUELO, hoy la del arma Sismo: la tierra
    // abriéndose tiene que pasar por debajo de los cuerpos y de las columnas.
    // El resto de ondas —choque, grito, explosiones— siguen arriba.
    zonas.dibujarAire(ctx, true);
    disparos.dibujarSuelo(ctx, alpha);
    // Y los reventones DE SUELO, que hoy es el del sismo del cíclope: la tierra
    // levantándose tiene que quedar debajo de lo que la pisa. Los de aire —el
    // veneno de la medusa, la bola de la mantícora— siguen por encima de todo,
    // más abajo en este mismo método.
    VFX.dibujarReventones(ctx, true);
  }
  // Las gemas van bajo las entidades: son suelo, y taparlas con un cuerpo es
  // información correcta, no un fallo. El cofre también, pero su halo lo delata
  // por debajo de la horda, que es justo para lo que está.
  recogibles.dibujar(ctx, alpha);
  cofres.dibujar(ctx, alpha);
  // LAS MASCOTAS ENTRAN EN EL ORDENADO POR PROFUNDIDAD, no se pintan después.
  //
  // Dan vueltas alrededor de su jugador y buena parte de la vuelta la hacen por
  // detrás de él: si se dibujan al final, se le plantan en la cara. Metiéndolas
  // aquí, con la horda y las columnas, el jugador las tapa cuando le pasan por
  // detrás — que es lo que hace un cuerpo con lo que tiene detrás.
  const nMascotas = Mascotas.prepararOrden(jugadores);
  enemigos.dibujar(ctx, camara, alpha, jugadores, Obstaculos,
                   Mascotas.enOrden, nMascotas);
  perfil.entidades = performance.now() - t;

  // Por encima de las entidades: los efectos tienen que leerse siempre, aunque
  // haya ochocientos cuerpos debajo.
  t = performance.now();
  if (activo.efectos) {
    zonas.dibujarAire(ctx, false);
    proyectiles.dibujar(ctx, alpha);
    for (let i = 0; i < arsenales.length; i++) {
      arsenales[i].dibujarTajos(ctx);
      arsenales[i].dibujarRayos(ctx);
    }
    // Los haces de rayo, en la misma capa que los del arsenal: son la misma
    // cosa dibujada por otro camino (ver VFX.haz).
    VFX.dibujarHaces(ctx);
  }
  // Los orbitales, por encima de las mascotas que se han dibujado con la horda:
  // un escudo que desaparece detrás del perro deja de decir dónde estás
  // protegido, que es lo único que un orbital tiene que decir.
  if (activo.efectos) {
    for (let i = 0; i < arsenales.length; i++) {
      arsenales[i].dibujarOrbitales(ctx, jugadores[i]);
    }
  }
  // Y aquí las voladoras que este frame van POR DELANTE del jugador, que son las
  // únicas que no entraron en el ordenado. El búho y el pollito vuelan más alto
  // que un escudo, así que les toca ir encima. Las de la mitad de atrás ya están
  // pintadas con la horda, debajo del personaje, que es de lo que se trataba.
  Mascotas.dibujarPorEncima(ctx, jugadores);

  // Los disparos enemigos, por encima de todo lo del mundo: uno que viene tiene
  // que verse aunque cruce por detrás de un cíclope.
  disparos.dibujar(ctx, alpha);
  // Los avisos de disparo van DESPUÉS de la horda: son de los pocos adornos que
  // tienen que verse por encima de los cuerpos, porque avisan de algo que va a
  // pasar y llegar tarde a verlos es no verlos.
  if (activo.efectos) enemigos.dibujarAvisos(ctx, alpha);
  if (activo.particulas) Particulas.dibujar(ctx, alpha);
  // Las marcas de golpe van DESPUÉS de las partículas y con ellas en el lienzo
  // del mundo: son lo último del impacto y tienen que quedar por encima.
  if (activo.efectos) VFX.dibujarImpactos(ctx);
  // Los reventones DE AIRE, por encima de la horda: el veneno de la medusa y la
  // bola de la mantícora revientan EN el proyectil, a la altura del pecho, así
  // que tapan. Es el mismo criterio que los avisos de disparo de unas líneas más
  // arriba — el aviso dice que viene y el reventón dice que ha llegado, y las
  // dos mitades del mismo mensaje tienen que leerse aunque estés rodeado.
  //
  // Los de SUELO ya se han pintado con las calcomanías, antes que las entidades.
  if (activo.efectos) VFX.dibujarReventones(ctx, false);
  // Y los anillos de recompensa los últimos del mundo: subir de nivel o curarse
  // tapa por un instante lo que haya debajo, y eso es lo que se quiere.
  if (activo.efectos) VFX.dibujarAnillos(ctx);
  perfil.efectos = performance.now() - t;

  // --- Interfaz, en su propio lienzo -----------------------------------
  // A partir de aquí se dibuja sobre `ctxUi`, no sobre `ctx`. Se limpia entera
  // cada frame: es barata (unas decenas de órdenes) y así no hay que llevar la
  // cuenta de qué zonas quedaron sucias del frame anterior.
  t = performance.now();
  Capa.limpiar();
  const ctxUi = Capa.ctx;

  // Los números de daño van los PRIMEROS de la capa: son del mundo, no de la
  // interfaz, y tienen que quedar por debajo del panel y de los menús. Que
  // vivan en este lienzo es solo porque son texto y aquí es donde el texto se
  // ve bien.
  const tNum = performance.now();
  if (activo.numeros) VFX.dibujarNumeros(ctxUi, offX, offY);
  // El borde rojo va DEBAJO del panel y de los menús, como los números: es del
  // mundo, no de la interfaz. La fracción es la del jugador peor parado de los
  // que siguen en pie —a un caído no le queda vida que avisar, y su ataúd ya se
  // ve en el mapa—, así que en cooperativo el aviso lo da quien esté peor.
  if (activo.efectos) {
    let fracPeor = 1;
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      if (j.abatido || j.vidaMaxima <= 0) continue;
      const f = j.vida / j.vidaMaxima;
      if (f < fracPeor) fracPeor = f;
    }
    VFX.dibujarHerida(ctxUi, ANCHO_UI, ALTO_UI, fracPeor);
  }
  perfil.texto = performance.now() - tNum;

  if (caidaRed) {
    dibujarCaida(Capa.ctx, caidaRed, cursorCaida, opcionesCaida(sePuedeReenganchar()));
  }
  else if (Sincro.activo) {
    // Y SI NO SE HA CORTADO PERO EL MUNDO ESTÁ QUIETO, DECIR POR QUÉ. Es el
    // mismo principio que el aviso de la consola —una pantalla congelada sin
    // explicación es un fallo en sí mismo— pero puesto donde mira quien juega,
    // que no es la consola. `espera()` devuelve null mientras no haya nada que
    // contar, o sea casi siempre.
    const esperaRed = Sincro.espera();
    if (esperaRed) dibujarEspera(Capa.ctx, esperaRed);
  }

  if (verDepuracion) {
    dibujarDepuracion(ctxUi, {
      fps: bucle.fps,
      msUpdate: bucle.msUpdate,
      msRender: bucle.msRender,
      pasos: bucle.pasosUltimoFrame,
      entidades: enemigos.activos + jugadores.length,
      dibujados: enemigos.dibujados,
      pool: enemigos.pool,
      reciclados: enemigos.reciclados,
      bajas: enemigos.bajas,
      proyectiles: proyectiles.activos,
      particulas: Particulas.activas,
      numeros: VFX.numerosActivos,
      jugadores,
      arsenales,
      // Por dónde va el ciclador de armas (tecla M). -1 = sin usar.
      cicloArma: indiceCatalogo,
      cicloTotal: ORDEN_CATALOGO.length,
      perfil,
      activo,
      celdas: enemigos.rejilla.numCeldas,
      tiles: tilesDibujados,
      cx: camara.x, cy: camara.y,
      retardo: Lockstep.retardo,
      red: Sincro.resumen(),
      fuente: entrada.controles[0].fuente,
      mandos: entrada.mandosConectados,
      zoom: zoomPantalla,
      cofres: cofres.activos,
      disparos: disparos.activos,
      sustituidos: Recursos.sustituidos.length,
      jefe: Jefes.info(enemigos),
      escoltas: enemigos.escoltasVivos
    });
  }
  dibujarAvisoArma(ctxUi);
  dibujarPaneles(ctxUi, jugadores);
  // Reloj y denarios comparten cinta arriba en el centro: ver ui/hud.js.
  dibujarReloj(ctxUi, MetaProgreso.denarios - denariosAlEmpezar);
  // Un mismo Jefes.info() alimenta la barra Y decide si suena la música de
  // jefe: es el único punto donde main.js sabe si hay uno en pie ahora mismo.
  const infoJefe = Jefes.info(enemigos);
  GestorAudio.jefeActivo(!!infoJefe);
  dibujarBarraJefe(ctxUi, infoJefe);

  // La cuenta atrás del Reloj de Emerita, abajo en el centro y solo mientras
  // corre. Sale de `paralisisRestante` y no de un cronómetro propio de la
  // interfaz: es el MISMO número que decide cuánto sigue quieta la horda, así
  // que lo que se ve en pantalla no puede desajustarse de lo que pasa.
  dibujarCuentaAtrasReloj(ctxUi, enemigos.paralisisRestante);
  // Y el mundo entero en blanco y negro mientras dura, del mismo número. El
  // cómo está en css/estilos.css (#juego.congelado): aquí solo se enciende y se
  // apaga un interruptor.
  marcarCongelado(enemigos.paralisisRestante > 0);

  // Solo se pierde cuando caen TODOS. Con un compañero en pie la partida sigue,
  // que es lo que hace que el cooperativo tenga sentido.
  //
  // El cofre manda sobre todo lo demás: es el único que aparece sin haberlo
  // pedido, y si una subida de nivel simultánea se pintara encima nadie sabría
  // qué le acaba de tocar.
  // Derrota en dos tiempos: primero solo el cartel, con el mundo y los ataudes
  // a la vista, y el resumen cuando se pide. La victoria va directa al resumen:
  // alli no hay ataud que mirar.
  if (finalMostrado === 'derrota' && !resumenFinal) dibujarCartelFinal(ctxUi, ALTO_UI, false);
  else if (finalMostrado) dibujarFinal(ctxUi, ALTO_UI, finalMostrado === 'victoria', statsFinal);
  if (fichaAbierta >= 0) dibujarFicha(ctxUi, jugadores, fichaAbierta);
  else if (Progresion.cofreAbierto) dibujarCofre(ctxUi, jugadores);
  else if (Progresion.abierto) dibujarMenuNivel(ctxUi, jugadores);
  else if (configEnPartida) dibujarConfig(null, ctxUi, CONFIG, cursorConfig);
  else if (pausado) dibujarPausa(ctxUi, ALTO_UI);
  else if (mapaAbierto) dibujarMapa(ctxUi, jugadores, enemigos, cofres, camara);
  perfil.interfaz = performance.now() - t;
}

// Suelo infinito con scroll toroidal: no hay mapa en memoria, la variante de
// cada celda sale de un hash de sus coordenadas. Se dibuja solo lo que toca el
// viewport, con un tile de margen.
//
// El tamaño del tile lo pone Recursos y NO es la constante TILE: con el mapa
// pintado de Emerita el tile mide 240x368 unidades lógicas —media pantalla de
// ancho, una y media de alto— en vez de los 32x32 del suelo procedural. Con un
// solo tile el hash da siempre 0 y la mezcla de variantes se queda en nada, que
// es lo correcto: la variedad la trae ya el dibujo.
// Fuera de los límites del mapa pintado no hay escenario: un color sólido y
// oscuro en vez de repetir la imagen, para que se lea como "aquí se acaba el
// mundo conocido" y no como una costura rota. A juego con el tono nocturno de
// la calzada; no sale de `paleta` porque esa paleta es del tema diurno
// original y no del nuevo mapa.
const COLOR_VACIO = '#0a0c14';

function dibujarSuelo(izq, arr) {
  // NIVEL DE REJILLA: colores planos, una celda por rectángulo. Es el suelo del
  // PROTOTIPO y se ve como lo que es — cuando haya tileset dibujado, esta rama
  // pasa a hacer un drawImage por celda en vez de un fillRect, y ya está.
  //
  // Solo se pintan las celdas que se ven: unas 15x10, sea el mapa de 64
  // pantallas o de mil.
  if (RejillaMapa.activa && SueloRejilla.activo) {
    // Con texturas: el caché por trozos de sistemas/sueloRejilla.js. Lo de
    // fuera del recinto, del color del vacío, por lo mismo que abajo.
    ctx.fillStyle = COLOR_VACIO;
    ctx.fillRect(izq, arr, ANCHO_LOGICO, ALTO_LOGICO);
    tilesDibujados = SueloRejilla.dibujar(ctx, izq, arr);
    return;
  }
  if (RejillaMapa.activa && coloresRejilla) {
    const c = RejillaMapa.celda;
    const cx0 = Math.max(0, (izq / c) | 0);
    const cy0 = Math.max(0, (arr / c) | 0);
    const cx1 = Math.min(RejillaMapa.ancho - 1, ((izq + ANCHO_LOGICO) / c) | 0);
    const cy1 = Math.min(RejillaMapa.alto - 1, ((arr + ALTO_LOGICO) / c) | 0);

    // Lo de fuera del recinto, del color del vacío: la cámara topa con la
    // fachada, pero con la interpolación puede asomar medio píxel.
    ctx.fillStyle = COLOR_VACIO;
    ctx.fillRect(izq, arr, ANCHO_LOGICO, ALTO_LOGICO);

    tilesDibujados = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      const fila = cy * RejillaMapa.ancho;
      // Las celdas seguidas del mismo color se pintan de una sola pasada: un
      // pasillo son quince rectángulos idénticos en fila y el hipermercado
      // entero, uno.
      let cx = cx0;
      while (cx <= cx1) {
        const t = RejillaMapa.tipo[fila + cx];
        let fin = cx + 1;
        while (fin <= cx1 && RejillaMapa.tipo[fila + fin] === t) fin++;
        ctx.fillStyle = coloresRejilla[t];
        ctx.fillRect(cx * c, cy * c, (fin - cx) * c, c);
        tilesDibujados++;
        cx = fin;
      }
    }
    return;
  }

  const tiles = Recursos.tilesSuelo;
  if (tiles.length === 0) return;

  const anchoTile = Recursos.anchoSuelo;
  const altoTile = Recursos.altoSuelo;
  const ty0 = Math.floor(arr / altoTile);
  const filas = Math.ceil(ALTO_LOGICO / altoTile) + 1;

  tilesDibujados = 0;

  // Mapa pintado: ANCHO LIMITADO al de la imagen, nunca varias avenidas en
  // paralelo. Una sola columna de tile (x en [0, anchoTile)); en Y sigue
  // repitiendo hacia arriba y abajo igual que siempre.
  if (Recursos.mapaPintado) {
    ctx.fillStyle = COLOR_VACIO;
    ctx.fillRect(izq, arr, ANCHO_LOGICO, ALTO_LOGICO);
    for (let fy = 0; fy < filas; fy++) {
      const gy = ty0 + fy;
      ctx.drawImage(tiles[0], 0, gy * altoTile, anchoTile, altoTile);
      tilesDibujados++;
    }
    return;
  }

  // Procedural de emergencia: el tile es pequeño y está pensado para repetir
  // sin límite en las dos direcciones, así que aquí sí hay varias columnas.
  const tx0 = Math.floor(izq / anchoTile);
  const columnas = Math.ceil(ANCHO_LOGICO / anchoTile) + 1;
  for (let fy = 0; fy < filas; fy++) {
    const gy = ty0 + fy;
    for (let fx = 0; fx < columnas; fx++) {
      const gx = tx0 + fx;
      const variante = hash2(gx, gy) % tiles.length;
      ctx.drawImage(tiles[variante], gx * anchoTile, gy * altoTile, anchoTile, altoTile);
      tilesDibujados++;
    }
  }
}

// --- Arranque ---------------------------------------------------------------
// Denarios por cofre de verdad (no consumible): un botín fijo, aparte de lo
// que ya da —evolución o mejoras— por sí mismo.
const DENARIOS_COFRE = 15;
// El radio con el que se recoge un objeto del suelo (ver RADIO_RECOGIDA en
// entidades/cofre.js). Se usa aquí como margen al apartarlo de un obstáculo:
// dejarlo pegado al borde de una columna sería dejarlo igual de inalcanzable.
const RADIO_RECOGIDA_COFRE = 13;

async function arrancar() {
  MetaProgreso.iniciar();
  // EL @USUARIO YA CONECTADO, si lo hay —de una sesión anterior—. Sin esto,
  // alguien que ya conectó con GitHub ayer vería "Conectar con GitHub" hoy
  // hasta que volviera a hacerlo: el enlace sigue vivo en el servidor, pero
  // esta pestaña no se enteraba de que ya se había usado.
  nubeLogin = Nube.login();
  // VOLVER DE GITHUB, si es que se viene de ahí. No se espera: si la URL no
  // trae nada, sale en el acto; si trae un código, sigue en segundo plano
  // mientras el resto de arrancar() continúa.
  recogerRetornoDeGithub();
  // LAS ASIGNACIONES DE CONTROLES, lo primero de todo: en cuanto haya una tecla
  // que leer hay que saber de quién es. Ajuste de esta máquina, como el
  // volumen, no progreso ganado jugando. Ver core/controles.js.
  Controles.cargar();
  GestorAudio.iniciar();
  // Los datos de TODOS los niveles, antes que nada: la pantalla de selección
  // necesita el nombre y la duración de cada uno para pintar la lista, y son
  // unos pocos KB de literales. El arte de cada uno —el suelo— NO se carga
  // aquí, solo el del que se va a jugar. Ver datos/niveles/indice.js.
  await Niveles.cargar();
  await Recursos.cargar();
  // Variantes de color del bestiario (la serpiente dorada). Después de cargar el
  // atlas y antes del primer frame: teñir un sprite en caliente sería un canvas
  // nuevo por enemigo.
  prepararVariantes();
  // Hoja enrojecida de los cuatro personajes, para el destello de recibir un
  // golpe. Aquí por el mismo motivo que las variantes: teñir en caliente sería
  // un lienzo nuevo a mitad de partida. Solo los personajes y no el atlas
  // entero — ver prepararTinteDanyo en core/recursos.js.
  for (const id of ORDEN_PERSONAJES) Recursos.prepararTinteDanyo(PERSONAJES[id].sprite);

  // Todos los pools se preasignan aquí, antes del primer frame.
  enemigos = new Enemigos(CAPACIDAD_ENEMIGOS, rng);
  proyectiles = new Proyectiles(CAPACIDAD_PROYECTILES);
  Particulas.iniciar(CAPACIDAD_PARTICULAS);
  VFX.iniciar(CAPACIDAD_NUMEROS);
  recogibles = new Recogibles(CAPACIDAD_GEMAS, rng);
  cofres = new Cofres(CAPACIDAD_COFRES, rng);
  disparos = new Disparos(CAPACIDAD_DISPAROS, rng);
  zonas = new Zonas(CAPACIDAD_ZONAS);
  enemigos.recogibles = recogibles;
  enemigos.cofres = cofres;
  enemigos.disparos = disparos;
  // Y las zonas: las necesita la Pira funeraria, que deja una explosión donde
  // cae el cuerpo que le toca (ver `danyar` en entidades/enemigo.js). Mismo
  // enganche que los otros tres y por el mismo motivo: el bestiario no importa
  // los sistemas, se los dan.
  enemigos.zonas = zonas;
  Progresion.iniciar(rng);
  // El búfer de pulsaciones, con su anillo preasignado. Ver core/lockstep.js.
  Lockstep.iniciar(MAX_JUGADORES);

  // Quién abre el cofre y qué pasa entonces se decide aquí, no en la entidad:
  // así el cofre no sabe nada de la progresión y la progresión no sabe nada de
  // que existan cofres tirados por el suelo.
  // Que nada de lo que cae quede donde no se pueda coger: fuera del ancho del
  // nivel o metido detrás de una columna. El margen es el radio de recogida del
  // cofre, así que no basta con que el objeto esté fuera del obstáculo —tiene
  // que estar lo bastante fuera como para que el jugador llegue a tocarlo—.
  cofres.recolocar = (c) => {
    clamparXNivel(c);
    Obstaculos.apartar(c, RADIO_RECOGIDA_COFRE);
    c.xPrev = c.x;
    c.yPrev = c.y;
  };

  cofres.alRecoger = (jugador, tipo, especial) => {
    if (tipo === COFRE) {
      Progresion.abrirCofre(jugador, jugadores, especial);
      MetaProgreso.ganar(DENARIOS_COFRE);
      GestorAudio.abrirCofre();
    } else usarConsumible(jugador, tipo);
  };

  // EL NIVEL DE ARRANQUE es el primero de la lista. Deja listos el suelo, el
  // tema de la interfaz, el director y la decoración; elegir otro en la
  // pantalla de niveles vuelve a llamar aquí mismo (ver `usarNivel`).
  await usarNivel(Niveles.lista[0]);
  // El director decide cuándo cae un consumible; los objetos del suelo saben
  // dibujarse y dejarse recoger. Ninguno de los dos sabe del otro más que esto.
  Director.objetos = cofres;
  Director.jugadores = jugadores;
  enemigos.alRomper = (e) => Expendedoras.romper(e);
  Jefes.iniciar(rng);
  Mascotas.iniciar();

  ctxArmas.enemigos = enemigos;
  ctxArmas.proyectiles = proyectiles;
  ctxArmas.zonas = zonas;
  ctxArmas.rng = rng;

  // Los jugadores NO se crean aquí: los crea empezarPartida() con lo que se
  // haya elegido en la pantalla de selección. Todo lo de arriba —pools,
  // director, recursos— sí se monta ya, para que al pulsar JUGAR no haya que
  // esperar a nada.
  // La intro carga junto a las pantallas, no antes ni después: las dos leen
  // imágenes sueltas y ninguna depende de la otra.
  await Promise.all([Pantallas.cargar(), Intro.cargar()]);

  redimensionar();
  vigilarDensidad();
  document.getElementById('cargando').remove();

  bucle = new Bucle(actualizar, dibujar);
  bucle.arrancar();

  // Asa de depuración. El juego NO la lee: existe para poder inspeccionar el
  // estado desde la consola y, sobre todo, para `avanzar(n)`, que ejecuta n
  // pasos de lógica sin depender de requestAnimationFrame. Con eso se puede
  // reproducir una situación exacta (misma semilla, mismos pasos) al ajustar el
  // balance, que es de lo que va el criterio 10.
  // Los denarios ganados en la partida ya están en MetaProgreso.denarios en
  // caliente (ver enemigo.js/cofre.js), pero solo se ESCRIBEN a localStorage
  // aquí: al cerrar o recargar la pestaña, que es el único momento en que de
  // verdad se podrían perder.
  addEventListener('beforeunload', () => MetaProgreso.guardar());

  // La consola de red necesita poder empezar y terminar una partida, y no puede
  // importarlo de aquí sin cerrar un círculo entre los dos módulos. Se le pasa.
  RedConsola.enganchar({
    empezar: empezarPartidaEnRed,
    terminar: terminarPartidaEnRed,
    // En qué nivel juega esta máquina. Lo pregunta el anfitrión para poder
    // decirlo en el saludo; quien se una cargará ese mismo.
    nivel: () => nivelActual.id,
    // ESTO NO ES `Sincro.activo`, y la diferencia es un bloqueo permanente.
    //
    // Lo usa `medirYPonerRetardo` para no mover el retardo con la partida en
    // marcha: moverlo deja sin escribir las casillas del búfer que quedan en
    // medio y el mundo espera para siempre una pulsación que nadie va a poner.
    // Con una partida caída, `Sincro.activo` es false -- se paró al romperse --
    // y el canal del reenganche se abria midiendo y aplicando un retardo nuevo a
    // un búfer que sigue a medio llenar. La partida hay que contarla mientras
    // haya mundo, no mientras haya conexión.
    enPartida: () => Sincro.activo || !!caidaRed,
    puntoDeReenganche,
    reenganchar: reengancharPartida,
    reengancheRechazado
  });

  window.EMERITA = {
    // `jugadores` NO va aquí: está más abajo como función (`jugadores()`) y, en
    // un objeto literal, la última clave gana. Puesto también aquí como array,
    // lo único que conseguía era que `EMERITA.jugadores.length` diera 0 —la
    // aridad de la función— y pareciera que no hay nadie jugando.
    arsenales, enemigos, proyectiles, recogibles, cofres, disparos, zonas, camara, entrada, bucle,
    // Los obstáculos sólidos del escenario. Se exponen por lo mismo que todo lo
    // de aquí: para poder comprobar desde fuera cosas que sobre el dibujo no se
    // ven —si un osito se está metiendo dentro de una ruina, por ejemplo— sin
    // tener que juzgarlo a ojo en una captura.
    obstaculos: Obstaculos,
    particulas: Particulas, vfx: VFX, progresion: Progresion, director: Director, jefes: Jefes,
    meta: MetaProgreso,
    ajustes, activo, perfil,
    anyadirJugador, quitarJugador,
    // Estado de las pantallas previas. Sirve para lo mismo que `avanzar`:
    // reproducir una situación sin depender de que llegue la pulsación. `irA`
    // salta a una pantalla concreta —título 0, selección 1, juego 2, tienda 3—
    // sin pasar por el menú, que es la única forma de probar la tienda o la
    // selección desde la consola cuando el navegador no está dando el foco.
    puestos, get pantalla() { return pantalla; }, irA, volverAlMenu,
    // Qué ventana de la partida está puesta. Se exponen por lo mismo que
    // `pantalla`: poder comprobar desde fuera que una tecla ha hecho lo que
    // tenía que hacer, sin juzgarlo en una captura.
    get mapaAbierto() { return mapaAbierto; },
    get pausado() { return pausado; },
    get fichaAbierta() { return fichaAbierta; },
    // ENTRAR EN UN NIVEL SIN PASAR POR LOS MENÚS. Es el equivalente de `irA`
    // para el sitio en vez de para la pantalla: `usarNivel` carga el mapa, el
    // tema y las oleadas, y `empezarPartida` monta el mundo. Sirve para probar
    // un nivel que todavía está cerrado por progreso, que si no obliga a ganar
    // el anterior cada vez que se recarga la página.
    usarNivel, empezarPartida, niveles: Niveles,
    // La rejilla del nivel, si lo es. Se expone por lo mismo que `obstaculos`:
    // para poder comprobar desde fuera que un enemigo no está dentro de una
    // pared sin tener que juzgarlo a ojo en una captura.
    rejilla: RejillaMapa,
    // Estado de las pantallas de menu, por el mismo motivo que `puestos`:
    // poder reproducir una eleccion sin depender de que llegue la pulsacion.
    mascotasElegidas, mascotasDisponibles,
    get turnoMascota() { return turnoMascota; },
    get cursorMenu() { return cursorMenu; },
    get pestanyaTienda() { return pestanyaTienda; },
    PANTALLA: { intro: PANTALLA_INTRO, huecos: PANTALLA_HUECOS,
                titulo: PANTALLA_TITULO, seleccion: PANTALLA_SELECCION,
                juego: PANTALLA_JUEGO, tienda: PANTALLA_TIENDA,
                niveles: PANTALLA_NIVELES, historia: PANTALLA_HISTORIA },
    // En qué nivel se está. Sirve para lo mismo que `PANTALLA`: poder
    // comprobar desde fuera que elegir un sitio en la lista ha cargado ese
    // sitio, sin tener que mirar el dibujo del suelo.
    nivel: () => nivelActual.id,
    // Progreso META y mascotas. Se exponen para poder probar desde la consola
    // sin jugar veinte partidas para reunir denarios, y para poder mirar qué
    // hay guardado sin abrir el inspector de localStorage.
    meta: MetaProgreso, mascotas: Mascotas, audio: GestorAudio,
    get jugador() { return jugadores[0]; },   // atajo para el caso de uno solo
    avanzar(n) { for (let i = 0; i < n; i++) actualizar(DT); return enemigos.activos; },

    // PRUEBA DE DETERMINISMO (core/determinismo.js). Es lo que decide si el
    // cooperativo online puede ir por lockstep — solo pulsaciones por la red —
    // o hay que mandar el estado del mundo entero.
    //
    //   EMERITA.determinismo.repetir()   la misma partida dos veces, aquí
    //   EMERITA.determinismo.firmar()    huella para comparar con otro navegador
    // Qué funciones de Math difieren entre motores: EMERITA.huellaMotor()
    huellaMotor,
    // El búfer de pulsaciones, a mano desde la consola: `EMERITA.lockstep.retardo`
    // dice con cuánto se está jugando ahora mismo.
    lockstep: Lockstep,
    // Por qué el mundo no avanza, si no avanza. Ver `mandoActual`.
    mando: mandoActual,
    // El progreso guardado, para que la prueba de partida pueda dar mejoras
    // DISTINTAS a cada punta: es el caso que de verdad hay que comprobar.
    meta: MetaProgreso,
    // Los jugadores vivos, para las pruebas. Solo lectura de referencias: no
    // hay nada que copiar ni asignar.
    jugadores: () => jugadores,
    // La red, mientras no tenga pantallas propias. El anfitrión hace
    // `EMERITA.red.invitar()`, manda el código, y quien se une responde con
    // `EMERITA.red.responder('...')`. Ver js/red/consola.js.
    red: RedConsola,
    determinismo: crearProbador({
      dt: DT,
      entrada,
      paso: actualizar,
      // Una partida recién empezada y con el azar en un punto conocido.
      //
      // SE SIEMBRA DOS VECES, antes y después de vaciar, y las dos hacen falta:
      // `volverAlMenu` consume azar por su cuenta (Progresion.iniciar), así que
      // sembrando solo después, ese consumo habría partido de un estado distinto
      // en cada pasada y podría haber dejado rastro. Sembrando también antes,
      // todo lo que ocurre desde el vaciado es idéntico.
      fijarMeta: fijarMetaNeutra,
      restaurarMeta,
      // PROGRESO META CONOCIDO, y devuelto tal cual estaba al terminar.
      //
      // Las mejoras compradas con denarios ENTRAN EN LA SIMULACIÓN: cambian la
      // vida y el daño del personaje, que es justo para lo que se compran. Eso
      // está bien en el juego y es fatal para la prueba: dos máquinas con
      // distinto progreso guardado comparan dos partidas que no son la misma, y
      // la huella no significa nada.
      //
      // Así que mientras dura la prueba se juega SIN mejoras, sin mascota y sin
      // héroes desbloqueados, que es un punto de partida que cualquier máquina
      // puede reproducir. Y con `_congelado` puesto, para que nada de esto
      // llegue al disco: sin esa guarda, la primera partida de prueba
      // sobrescribiría el hueco de verdad.
      reiniciar(semilla) {
        rng.sembrar(semilla);
        volverAlMenu();
        rng.sembrar(semilla);
        puestos.fill(null);
        puestos[0] = { personaje: 0, listo: true };
        mascotasElegidas.fill('');
        empezarPartida();
      },
      // Lo que para el mundo sin salir en la firma. Ver `mandoActual`.
      mando: mandoActual,
      // ¿Sigue simulándose el mundo? Falso en cuanto la partida termina, y
      // entonces `actualizar` sale sin tocar nada.
      enPartida: () => pantalla === PANTALLA_JUEGO && !finalMostrado,
      estado: () => ({
        rng, director: Director, camara, progresion: Progresion, jugadores,
        enemigos, proyectiles, zonas, disparos, recogibles, cofres,
        mascotas: Mascotas, jefes: Jefes, particulas: Particulas, vfx: VFX,
        obstaculos: Obstaculos, arsenales, lockstep: Lockstep
      })
    })
  };

  // Recuperar el foco tras un alt-tab evita que el acumulador escupa un salto.
  addEventListener('visibilitychange', () => {
    if (!document.hidden) bucle.ultimo = performance.now();
  });
}

arrancar();
