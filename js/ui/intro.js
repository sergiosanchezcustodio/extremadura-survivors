import { Recursos } from '../core/recursos.js';
import { GestorAudio } from '../sistemas/audio.js';
import { ANCHO_UI, ALTO_UI } from '../core/constantes.js';
import { FUENTE_TITULO, textoEspaciado } from './capa.js';
import { TituloVivo } from './tituloVivo.js';
import {
  ESPERA, FUNDIDO, prepararRelato, dibujarRelato, acompasarAVoz, RETARDO_VOZ,
  avanzarAguante, dibujarAguante,
  hornearPantalla, fondoPantalla, velo, ENTRADA, ORO, ORO_CLARO
} from './relato.js';

// LA INTRO: tres pantallas antes de elegir partida.
//
//   1. EL SPLASH. Una ilustración de Sergio que YA TRAE TODO ESCRITO: las
//      tecnologías, el crédito de IA, la licencia y su propio "pulsa cualquier
//      tecla". Aquí NO se dibuja nada encima. Llegó a llevar los enlaces del
//      repositorio y de itch.io escritos por código y se quitaron: en una
//      ilustración tan cargada, tres direcciones en una esquina no se leían como
//      información, se leían como una pegatina.
//   2. EL RELATO. La historia subiendo por el hueco de una placa de piedra que
//      dibujó Sergio, con la tricolor extremeña envolviéndola.
//   3. LA PORTADA. El logo sobre la escena, con un "PULSE UNA TECLA PARA
//      CONTINUAR" pintado en la propia lámina. Es la única de las tres que NO se
//      va sola: las dos primeras se presentan sin que nadie toque nada, y esta
//      espera. Un temporizador aquí diría lo contrario de lo que pone escrito.
//
// ESTA INTRO PRESENTA EL JUEGO ENTERO, NO EL NIVEL 1. Contaba la historia de
// Mérida, y con la región por delante eso dejaba al juego presentándose por su
// primer capítulo: quien lo abría por primera vez se enteraba de que había un
// acueducto, no de a qué se estaba metiendo. La historia de cada sitio se
// cuenta ahora donde toca —al elegirlo, justo antes de jugarlo— y vive en su
// archivo de datos (ver `historia` en datos/niveles/*.js y ui/historia.js).
//
// CÓMO SE SALTA: cualquier tecla o botón, en las tres.
//
// Y NO SE ESCRIBE EN NINGUNA PARTE. Hubo un pie que anunciaba los atajos y lo
// quitó Sergio. Tiene sentido: son pantallas de las que se sale sin hacer nada
// —la primera a los ocho segundos, la segunda cuando acaba el relato— así que
// el atajo no es algo que haya que saber para seguir, es un adelanto para quien
// ya se la sabe. Y ese lo encuentra a la primera pulsación.
//
// Se acepta CUALQUIER tecla, y no una lista de tres, porque no hay nada escrito
// que diga cuál. Una versión anterior del splash traía pintado un "PULSA
// CUALQUIER TECLA PARA CONTINUAR" y ya no lo trae; da igual, porque el criterio
// es el mismo por los dos lados: si lo dice, hay que cumplirlo al pie de la
// letra, y si no lo dice, con más razón vale cualquiera.

const FASE_SPLASH = 0;
const FASE_RELATO = 1;
// LA TERCERA: la portada con el logo, y el aviso de pulsar YA NO VIENE PINTADO.
//
// Va DESPUÉS del relato y antes de elegir partida, que es donde la quiso
// Sergio: el juego se presenta solo —la ficha técnica y la historia corren sin
// que nadie toque nada— y aquí se para a esperarte. Es el primer momento en que
// el juego pide algo.
//
// ESTA NO SE VA SOLA, y es lo único que la separa de las otras dos. El aviso
// está PINTADO en la ilustración, así que un temporizador diría lo contrario de
// lo que se lee en pantalla. Se espera lo que haga falta.
const FASE_PORTADA = 2;

// Lo que dura el splash, si nadie toca nada. Los últimos SPLASH_FUNDIDO
// segundos son ya el fundido a negro, así que a los ocho en punto la pantalla
// se ha ido del todo.
const SPLASH_DURA = 8;
const SPLASH_FUNDIDO = 1.2;

const RUTA_SPLASH = 'assets/menus/splash.jpg';
const RUTA_HISTORIA = 'assets/menus/intro-historia.jpg';
const RUTA_PORTADA = 'assets/menus/titulo-pre.jpg';

// LA VOZ DEL NARRADOR de esta pantalla. Es un MP3 horneado (ver
// herramientas/generar-voz.js) y es opcional de verdad: si falta, el relato sube
// como siempre y no se entera nadie.
const RUTA_VOZ = 'assets/voz/intro.mp3';

// EL GUION DE LA INTRO: de qué va ESTO, en un minuto.
//
// No cuenta una historia entera, presenta la premisa: dónde pasa, qué ha
// pasado, quién eres y qué se te pide. Los nombres de los sitios van sin
// prometer cuántos hay ni en qué orden salen —eso lo dice la pantalla de elegir
// nivel, que sabe cuáles existen de verdad—, porque un relato que anuncia seis
// capítulos y enseña uno se lee como una promesa incumplida.
//
// La historia de cada sitio NO va aquí: va en su archivo de datos.
const GUION = [
  '@EXTREMADURA',
  '#SURVIVORS',
  '',
  '',
  'Extremadura, tierra de historias',
  'y leyendas casi olvidadas.',
  '',
  'Hoy vuelven a ser verdad.',
  '',
  'Lo que se contaba al calor de la',
  'lumbre ha resurgido de sus',
  'cenizas, y asola los pueblos y',
  'los campos de nuestra gente.',
  '',
  'Nadie sabe por qué. Quizá porque',
  'el amor, la bondad y la compasión',
  'fueron cayendo en el olvido, y en',
  'su sitio crecieron el miedo, el',
  'odio y la ira.',
  '',
  'El mal le está ganando la partida',
  'al bien.',
  '',
  'Y aun así queda esperanza.',
  '',
  'Mientras haya hombres y mujeres',
  'de valor, sin miedo a lo',
  'desconocido, con el corazón y el',
  'coraje suficientes para plantar',
  'cara a lo que acecha…',
  '',
  '',
  'Extremadura te necesita.'
];

const estado = {
  // Cuánto lleva aguantada la tecla de saltar, de 0 a 1. Ver AGUANTE_SALTO.
  aguante: 0,
  fase: FASE_SPLASH,
  reloj: 0,
  relato: null,       // el guion ya trazado (ver ui/relato.js)
  splash: null,       // el splash, horneado al tamaño de la pantalla
  historia: null,     // la placa de la historia, horneada igual
  portada: null       // ¿hay portada? La lámina la guarda TituloVivo
};

export const Intro = {
  // Se llama una vez al arrancar, con el resto de recursos. Si una ilustración
  // no carga, su pantalla sale con un fondo de reserva: se pierde el dibujo, no
  // la posibilidad de llegar al menú.
  async cargar() {
    const [splash, historia, portada] = await Promise.all([
      Recursos.cargarSuelta(RUTA_SPLASH),
      Recursos.cargarSuelta(RUTA_HISTORIA),
      Recursos.cargarSuelta(RUTA_PORTADA)
    ]);
    if (splash) estado.splash = hornearPantalla(splash, true);
    if (historia) estado.historia = hornearPantalla(historia, false);
    // LA PORTADA NO SE HORNEA AQUÍ: la hornea TituloVivo, igual que el título.
    // Son la misma escena —la portada es el título sin la lápida del menú— y
    // eso hace que las antorchas de la ilustración sean las mismas, así que la
    // portada se lleva también su fuego: el resplandor que late y las pavesas
    // que suben. Sin eso, la única pantalla del juego que espera quieta era
    // también la única con la escena congelada.
    //
    // Y horneándola ALLÍ y no aquí, el encaje de las dos láminas lo calcula el
    // mismo código: si se hiciera por los dos lados, el fuego de una acabaría
    // un día dos píxeles más allá que el de la otra.
    if (portada) {
      TituloVivo.hornear('portada', portada);
      estado.portada = true;
    }
  },

  iniciar() {
    estado.fase = FASE_SPLASH;
    estado.reloj = 0;
    estado.aguante = 0;
    if (!estado.relato) estado.relato = prepararRelato(GUION);
  },

  // Devuelve true cuando la intro se ha acabado y toca ir al menú.
  actualizar(dt, entrada) {
    estado.reloj += dt;

    // EL RELATO SE SALTA AGUANTANDO, no de un toque: hay un minuto de narración
    // detrás y perderla por un roce no tiene arreglo (ver AGUANTE_SALTO). Las
    // otras dos fases —el logo y la portada— siguen pasando con una pulsación:
    // ahí no hay nada que perderse.
    if (estado.fase === FASE_RELATO) {
      estado.aguante = avanzarAguante(estado.aguante, entrada.avanceMantenido(), dt);
      if (estado.aguante >= 1) { estado.aguante = 0; return siguiente(); }
    } else if (entrada.flancoAvance()) {
      return siguiente();
    }

    if (estado.fase === FASE_SPLASH && estado.reloj >= SPLASH_DURA) return siguiente();
    if (estado.fase === FASE_RELATO && estado.reloj >= estado.relato.duracion) return siguiente();
    // La portada no tiene reloj: se sale de ella por el `flancoAvance` de arriba
    // y por ningún otro sitio.
    return false;
  },

  dibujar(ctxMundo, ctxUi) {
    if (estado.fase === FASE_SPLASH) {
      fondoPantalla(ctxMundo, estado.splash);
      velo(ctxMundo, estado.reloj, SPLASH_DURA - estado.reloj, SPLASH_FUNDIDO);
    } else if (estado.fase === FASE_RELATO) {
      fondoPantalla(ctxMundo, estado.historia);
      dibujarRelato(ctxUi, estado.relato, estado.reloj);
      dibujarAguante(ctxUi, estado.aguante);
      velo(ctxMundo, estado.reloj, estado.relato.duracion - estado.reloj, FUNDIDO);
    } else {
      TituloVivo.avanzar();
      TituloVivo.fondo(ctxMundo, 'portada');
      TituloVivo.efectos(ctxMundo, 'portada');
      // Solo la entrada desde el negro del relato: no hay salida que fundir,
      // porque no se sabe cuándo va a ser. `Infinity` deja el fundido de salida
      // sin disparar nunca — ver `velo`, que compara lo que sobra contra él.
      velo(ctxMundo, estado.reloj, Infinity, 0);
      // Y el aviso encima, en la CAPA DE INTERFAZ. Esa capa va por su cuenta y
      // el velo no la alcanza —tiñe el lienzo del MUNDO—, así que la entrada
      // desde el negro se la hace `dibujarPulsa` por su lado.
      dibujarPulsa(ctxUi, estado.reloj);
    }
  },

  // ¿Estamos en la PORTADA? Lo pregunta main.js para arrancar ahí la música del
  // título: la portada es el primer cartel del juego y el último paso antes de
  // elegir partida, así que el tema tiene que abrirla. Las otras dos fases no
  // la quieren —el splash es un logo de ocho segundos y sobre el relato manda
  // la voz del narrador—, y por eso no vale con preguntar por la pantalla.
  get enPortada() { return estado.fase === FASE_PORTADA; },

  // La placa de piedra ya horneada. La reutiliza la pantalla de historia de
  // nivel: es la misma placa con otro guion, y hornear una segunda copia de la
  // misma imagen a 1920x1080 sería pagar dos veces por el mismo dibujo.
  get placa() { return estado.historia; }
};

// --- EL AVISO DE LA PORTADA --------------------------------------------------
//
// Antes venía PINTADO en la ilustración —"Pulse cualquier tecla para
// continuar"— y Sergio lo quitó del dibujo para que lo ponga el juego. Que lo
// escriba el código y no la lámina tiene dos ventajas que la lámina no puede
// dar: sale nítido a la resolución del monitor, como el resto de la interfaz
// (ver ui/capa.js), y puede MOVERSE.
//
// Y se mueve LATIENDO: sube y baja de intensidad sin llegar a apagarse. Es la
// única cosa viva de una pantalla que no tiene reloj y espera lo que haga
// falta, así que es también lo que dice que el juego no se ha colgado.
//
// "PULSA" y no "PULSE": el juego tutea en todas partes (ui/final.js, ui/red.js)
// y era la lámina la que iba por libre.
const PULSA = 'PULSA CUALQUIER TECLA';

// Dónde cae, en unidades de interfaz (960x540). El camino empedrado del primer
// plano es la única franja ancha y oscura de la ilustración, y ahí no hay nada
// dibujado que tapar: ni jabalíes, ni ruinas, ni la placa del título.
const PULSA_Y = ALTO_UI - 48;

// EL LATIDO. Coseno alzado, que es la forma de ir y volver sin picos: la
// intensidad pasa de PULSA_MIN a 1 y vuelve, y en los extremos se queda un
// instante en vez de rebotar. Un seno pelado —o peor, un triángulo— se lee como
// un parpadeo.
//
// No baja hasta apagarse: un texto que desaparece del todo se lee como un fallo
// de dibujo, no como una animación.
const PULSA_CICLO = 2.6;
const PULSA_MIN = 0.45;

function dibujarPulsa(ctxUi, reloj) {
  // La entrada desde el negro la hace `velo` sobre el lienzo del MUNDO, y esta
  // capa va por encima y no se entera: sin esto, el texto aparecería de golpe
  // sobre una ilustración que todavía está subiendo del negro.
  const entrada = Math.min(1, reloj / ENTRADA);
  const latido = 0.5 - 0.5 * Math.cos((reloj / PULSA_CICLO) * Math.PI * 2);
  const alfa = entrada * (PULSA_MIN + (1 - PULSA_MIN) * latido);

  ctxUi.save();
  ctxUi.globalAlpha = alfa;
  ctxUi.textAlign = 'center';
  ctxUi.textBaseline = 'alphabetic';
  ctxUi.font = '600 19px ' + FUENTE_TITULO;

  // Oro DEGRADADO, de claro arriba a oscuro abajo, que es como está pintado el
  // rótulo del título: un dorado plano al lado de uno modelado canta.
  const grad = ctxUi.createLinearGradient(0, PULSA_Y - 19, 0, PULSA_Y + 4);
  grad.addColorStop(0, ORO_CLARO);
  grad.addColorStop(1, ORO);
  ctxUi.fillStyle = grad;

  // El resplandor crece con el latido. Es lo que hace que parezca luz de las
  // antorchas sobre letra dorada y no una capa de opacidad subiendo y bajando.
  ctxUi.shadowColor = 'rgba(255,186,84,.85)';
  ctxUi.shadowBlur = 6 + 12 * latido;

  // Espaciado ancho y reborde oscuro: lapidario, como el rótulo, y legible
  // sobre las losas del camino, que no son negras del todo.
  textoEspaciado(ctxUi, PULSA, ANCHO_UI / 2, PULSA_Y, 3.4, 3);
  ctxUi.restore();
}

function siguiente() {
  if (estado.fase === FASE_SPLASH) {
    estado.fase = FASE_RELATO;
    estado.reloj = 0;
    // Y empieza a hablar. La duración llega DESPUÉS —hay que leer la cabecera
    // del MP3— así que el relato arranca a su ritmo de siempre y se reajusta en
    // cuanto se sabe cuánto dura la voz. Es cosa de milisegundos: el salto no se
    // ve porque el texto todavía está entrando por abajo.
    GestorAudio.narrar(RUTA_VOZ, RETARDO_VOZ)
      .then((d) => acompasarAVoz(estado.relato, d));
    return false;
  }
  if (estado.fase === FASE_RELATO) {
    // Se salta el relato: el narrador se calla. Sin esto sigue contando la
    // historia por encima del menú.
    GestorAudio.callarNarrador();
    // SIN PORTADA NO HAY PARADA. Si la ilustración no ha cargado, esta pantalla
    // sería un negro esperando una tecla que nadie sabe que hay que pulsar: se
    // salta y se va a elegir partida, igual que antes de que existiera.
    if (!estado.portada) return true;
    estado.fase = FASE_PORTADA;
    estado.reloj = 0;
    return false;
  }
  return true;
}

// El guion se exporta para la prueba de relatos: comprobar que un renglón entra
// en la placa se hace midiendo el guion de verdad, no uno inventado.
export { GUION as GUION_INTRO };
