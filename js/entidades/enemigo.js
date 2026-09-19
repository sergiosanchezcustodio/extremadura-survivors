import { ANCHO_LOGICO, ALTO_LOGICO, ESCALA_ARTE } from '../core/constantes.js';
import { Pool } from '../core/pool.js';
import { Rejilla } from '../core/rejilla.js';
import { Recursos } from '../core/recursos.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { ENEMIGOS } from '../datos/enemigos.js';
import { VFX } from '../sistemas/vfx.js';
import { GestorAudio } from '../sistemas/audio.js';
import { RejillaMapa } from '../sistemas/rejillaMapa.js';
import {
  Particulas, COLOR_SANGRE, COLOR_POLVO, COLOR_CHISPA, COLOR_CENIZA,
  COLOR_PIEDRA, COLOR_VENENO
} from '../sistemas/particulas.js';
import { tipoConsumible, COFRE } from './cofre.js';
import { sen, cos, atan2, exp } from '../core/mate.js';

// Denarios por baja (progreso META, ver core/metaProgreso.js): proporcionales
// a lo que ya vale el enemigo en XP, con un suelo de 1 para que hasta una
// serpiente cuente para algo. Primera calibración, un único número — se
// retoca desde aquí si el ritmo de la tienda pide más o menos.
const MULT_DENARIOS = 0.05;
function denariosPorBaja(def) {
  return Math.max(1, Math.round((def.xp || 0) * MULT_DENARIOS));
}
const DENARIOS_ANTORCHA = 3;

// LA PIRA FUNERARIA (datos/pasivos.js). Radio y daño de la explosión que deja
// el cuerpo que le toca. Van aquí y no en el objeto porque el objeto solo
// decide CADA CUÁNTAS muertes revienta una: lo que hace la explosión es
// siempre lo mismo, y subirlo de nivel tiene que acercar las piras, no
// convertirlas en un cañón.
const RADIO_PIRA = 34;
const DANYO_PIRA = 30;

// EL LIBRO DE LAS SOMBRAS. Lo que dura la posesión y lo que hace al reventar.
//
// Cinco segundos son los que pidió Sergio, y son los justos: lo bastante para
// verlo cruzar la pantalla con su aura y lo bastante poco para que no se te
// olvide que va a estallar. Más rato y el objeto sería una mascota.
const DURACION_POSESION = 5;
const RADIO_POSESION = 46;
const DANYO_POSESION = 55;
// Verde, y el mismo que usa el aura que se le pinta encima (ver `dibujar`).
// ROJO, y ya no verde. El aura de un poseido decia "este es de los tuyos" en el
// color de lo amistoso, y con el objeto terminado eso cuenta lo que menos
// importa: un poseido no es un aliado al que proteger, es una BOMBA ANDANDO con
// cinco segundos de mecha que ademas ya no se puede matar. Lo pidio Sergio en
// rojo y es lo correcto: rojo es el color de "apartate de ahi".
const COLOR_POSESION = '#ff4a3a';

// LO QUE PEGA UN POSEIDO AL ROZAR A LOS SUYOS, y cada cuanto.
//
// El dano sale de SU PROPIO dano de contacto, el mismo con el que te perseguia
// hace un segundo, multiplicado por esto. Sale de ahi y no de una cifra fija
// porque un ciclope poseido tiene que pegar como un ciclope: si el Libro
// convirtiera a todos en la misma bomba, daria igual a quien te tocara poseer y
// la mitad de la gracia del objeto es esa loteria.
//
// x1,6 y cada medio segundo: en los cinco segundos que dura son nueve golpes,
// que a un enemigo de masa lo matan y a un tanque lo dejan tocado. Suficiente
// para que se vea trabajar antes de reventar, y lejos de hacer el trabajo por ti
// —la explosion sigue siendo lo que de verdad se lleva a la horda por delante—.
const GOLPE_POSEIDO = 1.6;
const CADENCIA_POSEIDO = 0.5;

// UN JEFE NO SE POSEE. Se mira `rol`, que es como los marca el bestiario (ver
// datos/enemigos.js), y de paso caen las escoltas: los gemelos de la Loba
// llevan el mismo rol, y poseer a uno de los dos dejaría al jefe final con la
// mitad de su guardia trabajando para el otro bando.
function esJefe(e) { return e.def.rol === 'jefe'; }

// --- Culling ----------------------------------------------------------------
// 1.5 pantallas medidas desde el CENTRO de la cámara. Lo que sale de aquí vuelve
// al pool: un enemigo que el jugador ha dejado atrás no vuelve a alcanzarle
// nunca, así que mantenerlo vivo es pagar IA y colisiones por nada.
export const CULL_X = ANCHO_LOGICO * 1.5;   // 720 unidades lógicas
export const CULL_Y = ALTO_LOGICO  * 1.5;   // 405

// Hay DOS radios por enemigo y hacen cosas distintas:
//
//   radio       — círculo de DAÑO. Sale del plan: min(0.35*alto, 0.45*ancho),
//                 deliberadamente pequeño para que rozar un ala o un cuerno no
//                 cuente como impacto.
//   radioCuerpo — círculo FÍSICO, el que impide que dos bichos ocupen el mismo
//                 sitio. Este sí tiene que cubrir la silueta dibujada.
//
// Separarlos es lo que permite que una gárgola con las alas abiertas (38 de
// ancho, radio de daño 7) no se solape con su vecina sin volver injusto el
// impacto. Con un solo radio hay que elegir entre alas atravesándose o golpes
// que entran desde media pantalla.
const FACTOR_CUERPO = 0.45;      // del ancho del sprite: 0.9 del semiancho

// Holgura de la separación blanda sobre el cuerpo. Reparte la multitud dejando
// un respiro entre siluetas; el escalón duro de colisiones.js garantiza después
// que nadie se meta dentro de nadie.
export const FACTOR_SEPARACION = 1.25;

// Palanca global de velocidad. Ahora en 1.0: las velocidades de
// datos/enemigos.js ya son absolutas y están afinadas una a una para el género
// (la masa al 35-40% de la del jugador). La palanca se queda porque sigue
// siendo útil para probar de un golpe si la partida entera va sobrada o corta,
// pero el ajuste fino va en los datos, no aquí.
export const ESCALA_VELOCIDAD = 1.0;

// --- Márgenes de dibujo -----------------------------------------------------
// El ancla es el centro de los pies, así que el sprite crece hacia ARRIBA: la
// hidra mide 112 lógicos de alto y su ancla puede estar 112px por debajo del
// borde superior y aun así verse.
const MARGEN_X      = 64;
const MARGEN_ARRIBA = 128;
const MARGEN_ABAJO  = 32;

// Amplitud de la animación procedural, en PÍXELES FÍSICOS. En píxeles y no en
// porcentaje a propósito: redondeada al entero, la deformación solo toma unos
// pocos valores discretos y el sprite deja de remuestrearse en cada frame.
const BOTE_PX  = 1.5;    // redondeado: -2, -1, 0, 1, 2
const FLOTE_PX = 3;      // desplazamiento vertical de los que vuelan

// Cadencia de las hojas de animación reales. 10 fps es la que traen los GIF de
// origen; a más, el aleteo se vuelve nervioso y deja de leerse.
const SEG_POR_FRAME = 0.1;

// Frenado exponencial del empuje por daño, por segundo. Alto a propósito: un
// golpe tiene que dar un tirón seco y devolver el control enseguida, no mandar
// al bicho de paseo.
const DECAIMIENTO_EMPUJE = 12;

// Cuánto dura el blanqueo del sprite al recibir un impacto.
const DURACION_DESTELLO = 0.07;

// --- Patrones de movimiento --------------------------------------------------
//
// Códigos numéricos, no cadenas. La comparación está en el bucle más caliente
// del juego —hasta 850 entidades por paso— y comparar enteros es lo que permite
// que el compilador convierta esto en un salto de tabla. La traducción desde el
// nombre que trae datos/enemigos.js se hace UNA vez, al aparecer.
const MOV_DIRECTO = 0;
const MOV_ZIGZAG = 1;
const MOV_REVOLOTEO = 2;
const MOV_ORBITA = 3;
const MOV_ACECHO = 4;
const MOV_HUIDA = 5;

// Adónde tira el campo de flujo, reutilizado por todos los enemigos y todos los
// pasos. Es un objeto de módulo, creado al cargar: durante la partida no se
// asigna memoria ni aquí ni en ningún otro sitio.
const RUMBO = { x: 0, y: 0 };

// Más allá de esto no se comprueba si hay línea de visión: se va por el campo de
// flujo directamente. Un enemigo a pantalla y media no se ve —ni él ve a nadie—,
// así que el resultado sería el mismo y el rayo cuesta tanto más cuanto más
// larga es la tirada. Con este tope, ninguna comprobación pasa de unas veinte
// celdas por muchos enemigos que haya vivos.
const DIST_VISION = ANCHO_LOGICO;

// CUÁNTO DURA UNA DESBANDADA. Al entrar un jefe, los comunes salen corriendo a
// triple marcha y a los tres segundos se esfuman, hayan salido de cuadro o no.
//
// Son dos cosas a la vez y las dos hacen falta: la carrera es la puesta en
// escena —ver a la horda largarse es lo que convierte la llegada del jefe en un
// acontecimiento en vez de en un cambio de pantalla— y el borrado es la garantía
// de que la pelea empieza limpia. Sin el reloj, el que se traba contra unas
// ruinas se queda ahí toda la pelea; sin la carrera, la horda se desvanece de
// golpe y no se ha visto pasar nada.
//
// Se retiran SIN premio: ni gema, ni denarios, ni cadáver. No los has matado, se
// han ido. Por eso el borrado vive en `reciclarLejanos` —que solo devuelve el
// hueco al pool— y no en `danyar`, que es quien reparte.
const DESBANDADA = 3;

// Y A CUÁNTO CORREN COMO MÍNIMO mientras dura. 110 es más de lo que corre nada
// en el bestiario —la arpía, la más rápida, va a 32— y esa es la idea: en una
// desbandada no se trota, se huye. A este paso, media pantalla son poco más de
// dos segundos, así que salen por el borde antes de que el reloj tenga que
// borrar a nadie.
const VELOCIDAD_DESBANDADA = 110;
const MOV_TRAVESIA = 6;
const CODIGO_MOV = {
  directo: MOV_DIRECTO, zigzag: MOV_ZIGZAG, revoloteo: MOV_REVOLOTEO,
  orbita: MOV_ORBITA, acecho: MOV_ACECHO, huida: MOV_HUIDA,
  travesia: MOV_TRAVESIA
};
// Frecuencia base de cada patrón, en radianes por segundo. Cada individuo la
// multiplica por un factor propio: si todas las serpientes culebrearan al mismo
// ritmo, el enjambre volvería a leerse como un solo organismo.
const CADENCIA_MOV = [0, 3.2, 1.9, 1.25, 1.5, 2.4, 0];

// --- EL REBAÑO, Y POR QUÉ SE FORMA ------------------------------------------
//
// Con todos los enemigos persiguiendo AL JUGADOR, todos convergen en el mismo
// punto. Da igual que uno culebree y otro revolotee: el destino es el mismo, así
// que en cuanto llevan unos segundos avanzando se apelotonan detrás y la horda
// se convierte en una mancha que te sigue. Los patrones de movimiento adornan el
// camino, pero no cambian a dónde va cada uno.
//
// La corrección es no perseguir al jugador, sino UN PUESTO ALREDEDOR de él. Cada
// enemigo se reserva al aparecer un ángulo propio y una distancia, y persigue ese
// punto. Como los ángulos están repartidos, la horda RODEA en vez de apilarse: te
// llegan por todos los lados, se ve el hueco por el que escapar y cerrar ese
// hueco vuelve a ser una decisión del jugador. Es la misma idea que usan los
// juegos del género y cuesta dos números por entidad.
//
// El puesto DERIVA despacio, cada uno a su ritmo y sentido, para que el anillo no
// quede congelado como una formación militar.
const DERIVA_ACOSO = 0.55;          // radianes por segundo, máximo
// El puesto se mide en múltiplos del radio de separación del propio bicho: un
// cíclope necesita más sitio para rodear que una serpiente, y con una distancia
// fija en unidades los grandes se pisaban igual que antes.
const ACOSO_MIN = 1.4;
const ACOSO_MAX = 4.2;

// Distancia a la que la presa deja de huir y empieza a rondar. Sin este tope, la
// serpiente dorada se va en línea recta, sale de pantalla y el culling se la
// lleva con su cofre dentro: el premio existiría solo sobre el papel.
const DIST_HUIDA = 150;

// Amplitud del desvío lateral, como fracción del avance.
const AMP_ZIGZAG = 0.80;
const AMP_REVOLOTEO = 1.15;

// A menos de esta distancia todos van RECTO, con el desvío desvaneciéndose de
// forma continua. Sin esto, un enemigo que culebrea nunca llega a tocarte:
// pasa de largo una y otra vez y el combate cuerpo a cuerpo deja de existir.
const CERCA = 26;

// Enganche de alcance para JEFES. Los tres son más lentos que el jugador
// (18-12 contra 64), así que alejarse en línea recta abre hueco sin parar. Ya
// no se los recicla por lejanía (reciclarLejanos), pero sin esto se quedarían
// rezagados fuera de pantalla, invisibles pero "vivos" y disparando al vacío
// —que es casi tan malo como perderlos del todo—. Pasado este umbral,
// recuperan velocidad de forma progresiva y sin techo real (un jefe que se ha
// quedado media pantalla atrás corre el doble; a pantalla y media, el triple),
// así que SIEMPRE terminan cerrando la distancia, nunca de un salto.
const DIST_ALCANCE_JEFE = 300;

// --- Tabla de senos ----------------------------------------------------------
// Dos o tres senos por entidad y paso son 150.000 llamadas por segundo con la
// horda llena. La tabla cuesta 4 KB una sola vez y el error de muestreo a 1024
// entradas es de milésimas de radián: invisible en una trayectoria.
//
// Y desde que se llena con `sen` en vez de con `Math.sin` (ver core/mate.js), la
// tabla es además IDÉNTICA EN TODOS LOS NAVEGADORES. Antes no lo era: se
// horneaba con la biblioteca del motor, así que Chrome y Firefox arrancaban la
// partida con dos tablas distintas y todo lo que se moviera con ellas divergía
// desde el primer paso.
const TAU = Math.PI * 2;
const N_SENO = 1024;
const SENO = new Float32Array(N_SENO);
for (let i = 0; i < N_SENO; i++) SENO[i] = sen(i * TAU / N_SENO);
const ESCALA_SENO = N_SENO / TAU;
function seno(a) { return SENO[((a * ESCALA_SENO) | 0) & (N_SENO - 1)]; }

// El hitstop se reserva a la MUERTE de un enemigo duro, no a un umbral de daño.
//
// Estaba puesto en "25 de daño o más" y era un error de bulto: el Pilum a nivel
// 8 pega 31, así que a partir de ese nivel CADA disparo congelaba la lógica 35
// ms. Con un solo enemigo en pantalla bastaba para que el juego diera tirones
// constantes, y no se veía en ninguna medición porque un frame congelado no
// tarda más: se salta el trabajo.
//
// Ligarlo a la vida máxima del que cae lo arregla de raíz. Una serpiente muere
// sin ceremonia por mucho que le pegues; un cíclope o un jefe paran el mundo un
// instante, que es justo lo que el recurso debe subrayar.
const VIDA_HITSTOP = 150;

// Segundos de aviso antes de que un enemigo dispare. Tres décimas: lo justo
// para verlo y apartarse si estabas mirando, no tanto como para que el enemigo
// deje de ser una amenaza. Ver dibujarAvisos.
const AVISO_ATAQUE = 0.3;
const COLOR_AVISO = '#ff9a5a';

// Cubos de la ordenación por Y, uno por unidad lógica de alto visible.
const CUBOS_Y = MARGEN_ARRIBA + ALTO_LOGICO + MARGEN_ABAJO;

// Jugador vivo más cercano a un punto, o null si no queda ninguno en pie.
// Exportada porque el sistema de colisiones necesita exactamente el mismo
// criterio: si el empuje y el daño usaran objetivos distintos, un enemigo
// podría perseguir a uno y morder a otro.
export function masCercano(jugadores, x, y) {
  let mejor = null;
  let mejorD2 = Infinity;
  for (let i = 0; i < jugadores.length; i++) {
    const j = jugadores[i];
    if (j.abatido) continue;
    const dx = j.x - x;
    const dy = j.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < mejorD2) { mejorD2 = d2; mejor = j; }
  }
  return mejor;
}

// Genera las variantes de COLOR del bestiario (la serpiente dorada de la sección
// 11, y las que vengan). Se llama UNA vez, después de cargar el atlas y antes del
// primer frame: teñir un sprite en caliente sería un canvas nuevo por enemigo.
//
// Vive aquí y no en core/recursos.js porque el catálogo de enemigos es un dato de
// juego: recursos sabe teñir, pero no tiene por qué saber qué hay que teñir.
export function prepararVariantes() {
  for (const id in ENEMIGOS) {
    const def = ENEMIGOS[id];
    if (!def.spriteBase || !def.tinte) continue;
    // Si el teñido no sale (falta la base), la variante se queda con el sprite
    // de su base y se juega igual, sin el color. Misma regla que los
    // placeholders del atlas: que falte arte nunca puede tumbar la partida.
    if (!Recursos.variante(def.sprite, def.spriteBase, def.tinte)) {
      def.sprite = def.spriteBase;
    }
  }

  // Y el AZUL DEL CONGELADO, ya con los sprites definitivos: si una variante se
  // ha quedado en su base, el hielo tiene que teñir la base y no un id que no
  // existe. Solo para el bestiario, que es lo único que el Reloj congela.
}

// DE QUÉ ESTÁ HECHO CADA BICHO. `restos` lo declara la ficha (datos/enemigos.js)
// y aquí se traduce a cómo se ve, que es donde viven los colores: los datos
// dicen CUÁL y el motor sabe CÓMO, igual que con `movimiento`.
//
// No es solo el color. Lo que de verdad separa una lasca de piedra de un
// salpicón de sangre es cómo CAE, y eso son dos números:
//
//   gravedad — la piedra se desploma, el veneno flota, la ceniza casi no baja.
//   apertura — el medio ángulo del cono. Lo sólido sale disparado en la
//              dirección del golpe; lo que es humo se esparce en todas.
//
// `gotas` es cuántas suelta la muerte cuando hay sitio: la piedra se rompe en
// más trozos y más pequeños que un cuerpo.
const MATERIALES = {
  carne:  { color: COLOR_SANGRE, gravedad: 1,    velocidad: 85, apertura: 1.25, gotas: 7, tam: 2 },
  piedra: { color: COLOR_PIEDRA, gravedad: 1.7,  velocidad: 72, apertura: 1.5,  gotas: 9, tam: 1.5 },
  veneno: { color: COLOR_VENENO, gravedad: 0.25, velocidad: 62, apertura: 1.9,  gotas: 8, tam: 2 },
  ceniza: { color: COLOR_CENIZA, gravedad: 0.12, velocidad: 48, apertura: 2.2,  gotas: 8, tam: 1.5 }
};

// Forma única para todos los enemigos: un solo tipo oculto en V8. Si unos
// enemigos tuvieran campos que otros no, cada acceso pasaría a ser polimórfico.
function crearEnemigo() {
  return {
    def: null, tipo: '',
    x: 0, y: 0, xPrev: 0, yPrev: 0, xVista: 0, yVista: 0,
    vida: 0, vidaMaxima: 0, velocidad: 0, danyo: 0,
    sepX: 0, sepY: 0, contactos: 0,
    empujeX: 0, empujeY: 0,
    frenado: 0,              // 0..1, cuánto le ralentiza una red o un charco
    destello: 0,             // segundos que queda blanqueado tras un impacto
    material: null,          // de qué está hecho: entrada de MATERIALES
    ultimoSello: 0,          // marca del último proyectil que le golpeó
    radio: 0, radioCuerpo: 0, radioSep: 0, invMasa: 1, vuela: false,
    fase: 0, cadencia: 0, mirandoDerecha: true,
    // Personalidad de movimiento. Todo se sortea al aparecer y no cambia: es lo
    // que hace que dos bichos del mismo tipo no vayan nunca sincronizados.
    mov: 0, faseMov: 0, cadenciaMov: 0, giro: 1, radioOrbita: 0,
    // Puesto de acoso: su sitio en el anillo alrededor del jugador.
    anguloAcoso: 0, radioAcoso: 0, derivaAcoso: 0,
    // Recarga del ataque a distancia. 0 en los que no disparan.
    relojAtaque: 0,
    // Huida SIN vuelta: la de los que se largan cuando entra el jefe final.
    huidaTotal: false,
    // Segundos que le quedan de desbandada antes de esfumarse. Solo lo llevan
    // los COMUNES a los que la entrada de un jefe ha puesto a correr; a cero se
    // les retira del pool sin premio (ver `reciclarLejanos`). Cero = no está en
    // desbandada, que es el caso de todos los demás.
    relojDesbandada: 0,
    // Pánico TEMPORAL: segundos que le quedan de salir corriendo por el chillido
    // del Pollito Fantasma (sistemas/mascotas.js). A diferencia de `huidaTotal`,
    // esto se pasa: al llegar a cero vuelve al movimiento que tenía, que se
    // guarda aquí mismo porque el sorteo de personalidad se hace una vez al
    // aparecer y no habría forma de recuperarlo si se pisara.
    panico: 0,
    movPrevio: 0,
    // PARALIZADO: segundos que le quedan clavado en el sitio por el Reloj de
    // Emerita (entidades/cofre.js). No es pánico ni huida — no se mueve, no
    // dispara y no se anima. Es lo mismo para todos, jefes incluidos: son seis
    // segundos y el objeto es de los que salen una vez cada varias partidas.
    paralizado: 0,
    // ¿Le ha dado alguien ya? Lo mira la Cruz del Gigante, que dobla el PRIMER
    // golpe que recibe cada enemigo. Se pone al aparecer, así que un enemigo
    // reciclado del pool nace virgen y no hereda el golpe del anterior.
    golpeado: 0,
    // POSEIDO POR EL LIBRO DE LAS SOMBRAS: segundos que le quedan de estar en
    // tu bando. Mientras corre deja de perseguir a nadie, camina hacia el
    // enemigo mas cercano con un aura verde encima, y al agotarse revienta.
    //
    // Vive en el enemigo y no en una lista aparte porque el pool ya lo recorre
    // entero cada paso: una lista seria un segundo sitio donde apuntar quien
    // esta poseido, y un enemigo reciclado que se olvidara de borrarse de ella
    // dejaria un fantasma.
    poseido: 0,
    // Reloj del golpe cuerpo a cuerpo mientras dura la posesion. Va aparte de
    // `relojAtaque` a proposito: ese es el del ataque a distancia de la medusa y
    // compania, y una medusa poseida tiene los dos.
    relojGolpePoseido: 0,
    // Y quien lo poseyo, para apuntarle el dano de la explosion como suyo. Es
    // el mismo criterio que el `duenyo` de un proyectil.
    poseidoPor: null,
    // Dirección fija de los que cruzan sin perseguir (MOV_TRAVESIA) y de los
    // jefes en plena embestida (ver `embestida` más abajo): la reutilizan
    // porque las dos cosas son "recto, en esta dirección, sin perseguir".
    dirX: 0, dirY: 0,
    // Segundos que le quedan de embestida (Fase 6, sistemas/jefes.js). >0
    // anula la persecución normal: mover() la consume en línea recta a lo
    // que valga `velocidad` en ese momento, que quien la dispara ya ha
    // subido. 0 en todo el bestiario salvo un jefe embistiendo.
    embestida: 0,
    frames: 1, frame: 0, relojAnim: 0,
    // Referencias resueltas al aparecer: dibujar 800 entidades no puede pagar
    // dos búsquedas en Map por entidad y frame.
    objetivo: null,          // jugador al que persigue este paso
    meta: null, img: null, imgEspejo: null, imgTinte: null, imgTinteEspejo: null
  };
}

export class Enemigos {
  // Interruptor de perfilado, no de juego. Estático porque el dibujado lo
  // consulta en el bucle interno y no merece una indirección por entidad.
  static destelloActivo = true;

  constructor(capacidad, rng) {
    this.pool = new Pool(crearEnemigo, capacidad);
    this.rejilla = new Rejilla(capacidad, CULL_X, CULL_Y);
    this._rng = rng;

    this._visibles = new Int32Array(capacidad);
    this._cubo     = new Int32Array(capacidad);
    this._orden    = new Int32Array(capacidad);
    this._conteo   = new Int32Array(CUBOS_Y + 1);
    // Jugadores (nunca más de 4) Y obstáculos del escenario (columnas,
    // estatuas...) intercalados en el mismo barrido por Y que los enemigos.
    // 64 es holgado: los obstáculos activos a la vez son una decena larga.
    this._ordenExtras = new Array(64);

    this.dibujados = 0;
    this.reciclados = 0;
    this.bajas = 0;
    this.recogibles = null;    // lo enchufa main.js
    this.cofres = null;        // ídem: solo los élites lo usan
    this.disparos = null;      // ídem: solo los que llevan `ataque`
    this._sinArte = new Set(); // tipos ya avisados por no tener sprite
    // Élites vivos ahora mismo (los que sueltan cofre). Lo consulta el director
    // para no encadenar dos: recorrer el pool entero cada paso solo para contar
    // dos bichos sería pagar 800 comprobaciones por una respuesta que cabe en un
    // entero.
    this.elitesVivos = 0;
    // Segundos que le quedan a la parálisis del Reloj de Emerita. Es de la
    // HORDA y no de cada enemigo: mientras corra, lo que aparezca nace ya
    // congelado. Ver `paralizarTodos`.
    this.paralisisRestante = 0;
    // Escoltas de jefe vivos ahora mismo (los gemelos de la loba). Mismo motivo
    // que elitesVivos: sistemas/jefes.js necesita saber si ha caído alguno este
    // paso sin recorrer el pool entero para contarlo.
    this.escoltasVivos = 0;
  }

  get activos() { return this.pool.activos; }

  // --- El Libro de las Sombras de Alburquerque -------------------------------
  //
  // Un enemigo al azar se pasa a tu bando: deja de perseguirte, camina hacia los
  // suyos envuelto en un aura ROJA, les pega mientras le dura y a los
  // DURACION_POSESION segundos revienta. Y NO SE LE PUEDE MATAR mientras tanto
  // (ver `danyar`), ni tu ni nadie.
  //
  // NO A LOS JEFES, y esa es la única regla que trae de fábrica: un jefe
  // poseído sería un jefe que deja de ser un jefe, y encima el más caro de
  // matar del nivel resuelto por un objeto.
  //
  // Se elige al azar de entre los que valen, con el RNG de la partida: mismo
  // criterio que todo lo demás del juego, así que dos partidas con la misma
  // semilla poseen al mismo bicho.
  poseer(duenyo) {
    const items = this.pool.items;
    const n = this.pool.activos;
    if (n === 0) return null;

    // Se cuentan primero los que valen y se elige uno de esos. Con un solo
    // sorteo sobre el pool entero, en una pantalla llena de jefe la mitad de
    // las tiradas caerían en el jefe y no poseerían a nadie: el objeto se
    // apagaría justo cuando más falta hace.
    let cuantos = 0;
    for (let k = 0; k < n; k++) {
      const e = items[k];
      if (e.vida > 0 && !e.poseido && !esJefe(e) && !e.def.esObjeto) cuantos++;
    }
    if (cuantos === 0) return null;

    let elegido = (this._rng() * cuantos) | 0;
    for (let k = 0; k < n; k++) {
      const e = items[k];
      if (e.vida <= 0 || e.poseido || esJefe(e) || e.def.esObjeto) continue;
      if (elegido-- > 0) continue;
      e.poseido = DURACION_POSESION;
      e.poseidoPor = duenyo || null;
      return e;
    }
    return null;
  }

  // El enemigo vivo más cercano a uno dado, para que el poseído sepa a por
  // quién va. Recorre el pool entero: son cinco segundos de la vida de un
  // bicho, no vale la pena meterlo en la rejilla espacial.
  _enemigoMasCercano(desde) {
    const items = this.pool.items;
    const n = this.pool.activos;
    let mejor = null, mejorD = Infinity;
    for (let k = 0; k < n; k++) {
      const e = items[k];
      if (e === desde || e.vida <= 0 || e.poseido > 0 || e.def.esObjeto) continue;
      const dx = e.x - desde.x, dy = e.y - desde.y;
      const d = dx * dx + dy * dy;
      if (d < mejorD) { mejorD = d; mejor = e; }
    }
    return mejor;
  }

  // Y el final: revienta donde esté y se lleva por delante lo que tenga al
  // lado. El daño se le apunta a quien lo poseyó, igual que el de un proyectil
  // se le apunta a quien lo disparó.
  _reventarPoseido(e) {
    const duenyo = e.poseidoPor;
    e.poseido = 0;
    e.poseidoPor = null;
    e.relojGolpePoseido = 0;
    if (this.zonas) {
      this.zonas.crear({
        x: e.x, y: e.y,
        radio: RADIO_POSESION * (1 + (duenyo ? duenyo.bonusArea : 0)),
        radioIni: 5,
        duracion: 0.34,
        danyo: Math.round(DANYO_POSESION * (1 + (duenyo ? duenyo.bonusDanyo : 0))),
        intervalo: 0.34,
        tipo: 'onda',
        color: COLOR_POSESION,
        empuje: 140,
        duenyo
      });
    }
    // Y el poseído se va con ella: lo que revienta no queda de pie.
    this.danyar(e, e.vida + 1, 0, -1, 0, duenyo, null);
  }

  // `escalaVida` y `escalaDanyo` son el escalado por minuto de la curva de
  // oleadas (ver datos/niveles/merida.js y sistemas/director.js). Se aplican
  // AQUÍ, al aparecer, y quedan congelados en la entidad: un enemigo del minuto
  // 15 conserva su vida aunque el reloj siga corriendo mientras esté vivo, que
  // es lo que hace que matarlo cueste lo que costaba cuando salió.
  //
  // La velocidad NO escala a propósito. Un bestiario en el que todo acelera con
  // el reloj deja de poder leerse: la serpiente ya no es "la lenta", y la única
  // información fiable que da un enemigo a distancia es cómo se mueve.
  aparecer(tipo, x, y, escalaVida = 1, escalaDanyo = 1, movimiento = null) {
    const def = ENEMIGOS[tipo];

    // Sin sprite en el atlas no aparece. Pasa con los que están declarados en
    // el bestiario a la espera de su ilustración —hoy la loba y los gemelos— y
    // sin esta puerta el primero que se invocara reventaría la partida en el
    // primer golpe, al buscar el alto del sprite para colocar el número de daño.
    // Se avisa UNA vez por tipo: un aviso por enemigo llenaría la consola.
    if (!def || !Recursos.meta(def.sprite)) {
      if (def && !this._sinArte.has(tipo)) {
        this._sinArte.add(tipo);
        console.warn(`[enemigos] ${tipo} no tiene sprite todavía: no aparece`);
      }
      return null;
    }

    const e = this.pool.obtener();
    if (!e) return null;                     // pool lleno: se ignora, sin asignar

    e.def = def;
    e.tipo = tipo;
    e.x = e.xPrev = e.xVista = x;
    e.y = e.yPrev = e.yVista = y;
    // Las estadísticas se instancian POR ENEMIGO al aparecer, no se leen del
    // catálogo en cada paso.
    e.vida = e.vidaMaxima = def.vida * escalaVida;
    e.danyo = def.danyo * escalaDanyo;

    // VELOCIDAD PROPIA DE CADA INDIVIDUO, ±14% sobre la de su tipo. Es la medida
    // más barata contra el efecto rebaño y la que más se nota: con la velocidad
    // exacta del catálogo, veinte serpientes que salen del mismo borde llegan en
    // formación cerrada y se mueven como una placa. Con esto la fila se
    // desordena sola en un par de segundos.
    const varianza = 0.86 + this._rng() * 0.28;
    e.velocidad = def.velocidad * ESCALA_VELOCIDAD * varianza;

    // El movimiento puede venir impuesto por la OLEADA en vez de por el tipo:
    // así la misma serpiente entra persiguiendo en una oleada y cruzando de
    // largo en otra, y dos oleadas del mismo bicho se leen distintas. Lo usa
    // sistemas/director.js con el campo `movimiento` del evento.
    e.mov = CODIGO_MOV[movimiento || def.movimiento] || MOV_DIRECTO;
    e.dirX = 0; e.dirY = 0;          // la travesía la fija en su primer paso
    e.faseMov = this._rng() * TAU;
    e.cadenciaMov = CADENCIA_MOV[e.mov] * (0.8 + this._rng() * 0.5);
    e.giro = this._rng() < 0.5 ? -1 : 1;      // sentido del culebreo o del giro
    e.radioOrbita = 30 + this._rng() * 30;    // solo lo usa la órbita
    e.sepX = 0; e.sepY = 0;
    e.empujeX = 0; e.empujeY = 0;
    e.frenado = 0;
    e.destello = 0;
    e.ultimoSello = 0;
    e.radio = def.radio;
    // 0, no 1/masa, para los inmunes al empuje: es lo que los hace de verdad
    // INAMOVIBLES en el solucionador de separación de sistemas/colisiones.js,
    // no solo inmunes al tirón de las armas. `inmuneEmpuje` solo tapaba el
    // empuje por daño (ver más abajo); la separación entre bichos —la presión
    // constante de la horda contra un jefe— es un sistema aparte y usaba la
    // masa real igual que cualquier otro, así que un jefe rodeado sí se movía
    // un poco cada frame aunque ningún arma pudiera empujarlo directamente.
    // Con invMasa a 0, reparte el 100% de cualquier solape al OTRO cuerpo del
    // par: el jefe no cede nada, la serpiente sí.
    e.invMasa = def.inmuneEmpuje ? 0 : 1 / def.masa;
    e.vuela = def.vuela;
    e.mirandoDerecha = true;

    e.meta = Recursos.meta(def.sprite);
    // El cuerpo nunca es más pequeño que el círculo de daño: si el sprite es
    // estrecho manda el radio del plan, y si es ancho manda la silueta.
    const anchoLogico = e.meta ? e.meta.w / ESCALA_ARTE : def.radio * 2;
    e.radioCuerpo = Math.max(def.radio, anchoLogico * FACTOR_CUERPO);
    e.radioSep = e.radioCuerpo * FACTOR_SEPARACION;

    // Puesto en el anillo de acoso. El ángulo va al azar en la circunferencia
    // completa: es lo que reparte a la horda alrededor del jugador en vez de
    // dejarla en fila detrás.
    e.anguloAcoso = this._rng() * TAU;
    e.radioAcoso = e.radioSep * (ACOSO_MIN + this._rng() * (ACOSO_MAX - ACOSO_MIN));
    e.derivaAcoso = (this._rng() * 2 - 1) * DERIVA_ACOSO;

    // Primera recarga al azar dentro de su ciclo: si todas las medusas de una
    // oleada dispararan a la vez, no serían seis enemigos, sería un solo evento.
    e.relojAtaque = def.ataque ? this._rng() * def.ataque.cadencia : 0;
    e.huidaTotal = false;
    e.relojDesbandada = 0;
    e.panico = 0;
    // NACE PARALIZADO si el Reloj está corriendo. Es lo que hace que el efecto
    // valga también para lo que todavía no había aparecido — que es la mitad de
    // la horda, porque el director no deja de soltar mientras dura. Ver
    // `paralizarTodos`.
    e.paralizado = this.paralisisRestante;
    e.golpeado = 0;
    e.poseido = 0;
    e.poseidoPor = null;
    e.relojGolpePoseido = 0;
    e.movPrevio = 0;

    if (def.cofre) this.elitesVivos++;
    if (def.escolta) this.escoltasVivos++;

    // Fase inicial aleatoria: si todos botaran sincronizados el enjambre
    // parecería un solo organismo latiendo.
    e.fase = this._rng() * Math.PI * 2;
    e.cadencia = 4 + e.velocidad * 0.06;

    // Hoja de animación real, si la hay. El fotograma inicial también va al
    // azar: con veinte gárgolas aleteando a la vez y en fase, el enjambre
    // parecería un solo bicho repetido.
    e.frames = (e.meta && e.meta.frames) || 1;
    e.frame = e.frames > 1 ? (this._rng() * e.frames) | 0 : 0;
    e.relojAnim = this._rng() * SEG_POR_FRAME;

    e.img = Recursos.imagen(def.sprite);
    e.imgEspejo = Recursos.espejo(def.sprite);
    e.imgTinte = Recursos.tinte(def.sprite);
    e.imgTinteEspejo = Recursos.tinteEspejo(def.sprite);
    // Copia azulada para cuando el Reloj de Emerita lo deja congelado. Se
    // resuelve aquí, con las otras tres hojas, para que el dibujado no tenga que
    // preguntar nada: elige imagen y ya.
    // De qué está hecho. Se resuelve AQUÍ, con el resto de lo que se saca de la
    // ficha una sola vez, y no en `danyar`: así la muerte no tiene que buscar en
    // ningún diccionario ni preguntar si el campo existe. Es lo mismo que se
    // hace dos líneas más arriba con las hojas de dibujo.
    e.material = MATERIALES[def.restos] || MATERIALES.carne;
    return e;
  }

  // Persecución hacia el jugador MÁS CERCANO. La separación NO entra aquí: se
  // aplica después, como corrección de posición, una vez construida la rejilla
  // (ver sistemas/colisiones.js). Mezclarla en la velocidad no funciona, porque
  // la persecución tira siempre a tope y acaba ganando.
  //
  // Con cooperativo, cada enemigo elige objetivo cada paso. Son cuatro
  // comparaciones por enemigo como mucho, y elegir una vez y recordarlo daría
  // bichos que ignoran al jugador que tienen encima por seguir al de la otra
  // punta. El objetivo se guarda en `e.objetivo` porque el tope de acercamiento
  // lo necesita después y no tiene sentido recalcularlo.
  //
  // xPrev queda con la posición de principio de paso, así que la interpolación
  // del render recoge también lo que mueva la separación.
  // `camara` es opcional y solo lo usan los ataques con `azarObjetivo` (el
  // sismo del cíclope) para poder soltar el punto en cualquier sitio visible
  // en vez de encima del jugador. Nada más en esta función lo necesita.
  mover(dt, jugadores, camara) {
    // El reloj de la parálisis global corre aquí, una vez por paso y no una vez
    // por enemigo: es de la horda, no de cada bicho.
    if (this.paralisisRestante > 0) {
      this.paralisisRestante -= dt;
      if (this.paralisisRestante < 0) this.paralisisRestante = 0;
    }

    const items = this.pool.items;
    const n = this.pool.activos;

    for (let k = 0; k < n; k++) {
      const e = items[k];
      e.xPrev = e.x;
      e.yPrev = e.y;

      // EL RELOJ DE LA DESBANDADA, antes que nada y sin `continue`: lo único
      // que hace es contar, y tiene que contar también mientras el enemigo está
      // paralizado o haciendo cualquier otra cosa. Se le deja bajar POR DEBAJO
      // de cero —de ahí el `< 0` con el que lo lee `reciclarLejanos`— para
      // distinguir "se le acabó" de "nunca estuvo en desbandada", que es el cero
      // de fábrica de todos los demás.
      if (e.relojDesbandada > 0) {
        e.relojDesbandada -= dt;
        if (e.relojDesbandada <= 0) e.relojDesbandada = -1;
      }

      // --- PARALIZADO (el Reloj de Emerita) --------------------------------
      // Lo primero de todo, por delante del pánico y de la embestida de un
      // jefe: mientras dura no hay NADA que un enemigo pueda hacer. Ni
      // perseguir, ni disparar, ni pasar de fotograma — se queda tal cual, que
      // es la mitad de lo que hace que el objeto se note.
      //
      // `xPrev`/`yPrev` ya están puestos arriba, así que la interpolación del
      // render lo deja quieto en vez de arrastrarlo desde donde venía.
      if (e.paralizado > 0) {
        e.paralizado = Math.max(0, e.paralizado - dt);
        if (e.destello > 0) e.destello -= dt;
        continue;
      }

      // --- Pánico temporal (el chillido del Pollito Fantasma) --------------
      // Se consume aquí, al principio, y al agotarse devuelve al bicho el
      // movimiento que tenía. Va antes de todo lo demás para que un enemigo que
      // deja de tener pánico este mismo paso ya persiga con normalidad y no se
      // quede un frame a medias.
      if (e.panico > 0) {
        e.panico -= dt;
        if (e.panico <= 0) {
          e.panico = 0;
          e.mov = e.movPrevio;
          e.cadenciaMov = CADENCIA_MOV[e.mov];
        }
      }

      // --- Embestida de jefe (Fase 6) ------------------------------------
      // La dispara sistemas/jefes.js: fija dirX/dirY y sube `velocidad`, y
      // aquí solo se consume el cronómetro en línea recta. Sin persecución,
      // sin separación blanda tirando del rumbo y sin tope de acercamiento
      // —`objetivo` se deja a null a propósito—: una carga que se desvía al
      // chocar con la multitud deja de sentirse como una carga.
      if (e.embestida > 0) {
        e.objetivo = null;
        e.embestida -= dt;
        e.x += e.dirX * e.velocidad * dt;
        e.y += e.dirY * e.velocidad * dt;
        if (e.destello > 0) e.destello -= dt;
        if (e.dirX > 0.08) e.mirandoDerecha = true;
        else if (e.dirX < -0.08) e.mirandoDerecha = false;
        if (e.frames > 1) {
          e.relojAnim += dt;
          while (e.relojAnim >= SEG_POR_FRAME) {
            e.relojAnim -= SEG_POR_FRAME;
            e.frame = (e.frame + 1) % e.frames;
          }
        } else {
          e.fase += dt * e.cadencia;
        }
        continue;
      }

      // POSEIDO: ha cambiado de bando. Camina hacia el enemigo vivo mas cercano
      // en vez de hacia un jugador, y al agotarsele el tiempo revienta.
      //
      // Y AHORA SI PEGA AL ROZAR. Durante un tiempo no lo hizo —no existia dano
      // de enemigo contra enemigo en ningun sitio del motor y solo la explosion
      // se llevaba a los suyos—, pero asi el poseido se pasaba cinco segundos
      // caminando sin hacer nada y lo unico que contaba era donde le pillaba el
      // final. Lo pidio Sergio: que ataque, y luego reviente.
      //
      // El dano sale de SU dano de contacto (ver GOLPE_POSEIDO) y se le apunta a
      // quien lo poseyo, igual que el de la explosion: lo que mata un poseido lo
      // ha matado el Libro de las Sombras de alguien.
      if (e.poseido > 0) {
        e.poseido -= dt;
        if (e.poseido <= 0) {
          this._reventarPoseido(e);
          continue;
        }
        if (e.relojGolpePoseido > 0) e.relojGolpePoseido -= dt;

        const presa = this._enemigoMasCercano(e);
        if (presa) {
          const dxp = presa.x - e.x;
          const dyp = presa.y - e.y;
          const dp = Math.sqrt(dxp * dxp + dyp * dyp) || 1;

          // SE PARA AL LLEGAR, en vez de empujar el cuerpo desde dentro. Sin el
          // corte, el poseido se mete en la presa y la separacion los deja a los
          // dos temblando uno contra otro: se ve como un fallo, no como un
          // ataque.
          const alcance = e.radio + presa.radio;
          if (dp > alcance) {
            e.x += (dxp / dp) * e.velocidad * dt;
            e.y += (dyp / dp) * e.velocidad * dt;
          } else if (e.relojGolpePoseido <= 0) {
            e.relojGolpePoseido = CADENCIA_POSEIDO;
            // Por `danyar` y no restando vida a mano: es el punto unico por el
            // que muere cualquier cosa en este juego, y es quien suelta la gema,
            // el cofre, las particulas y los denarios. Restarle vida por fuera
            // dejaria cadaveres que nadie recoge.
            this.danyar(presa, Math.round(e.danyo * GOLPE_POSEIDO),
                        dxp / dp, dyp / dp, e.def.masa >= 60 ? 90 : 40,
                        e.poseidoPor, null);
          }
        }
        e.objetivo = null;
        continue;
      }

      const objetivo = masCercano(jugadores, e.x, e.y);
      e.objetivo = objetivo;
      if (!objetivo) { if (e.destello > 0) e.destello -= dt; continue; }

      // --- Ataque a distancia -------------------------------------------
      // Solo lo tienen los poderosos (ver `ataque` en datos/enemigos.js). Se
      // resuelve antes de mover para que el disparo salga de donde se ve al
      // enemigo, no de donde acabará este paso.
      //
      // El disparo sale hacia el jugador REAL, no hacia el puesto de acoso: el
      // puesto es para colocarse, y disparar a un punto vacío al lado del
      // jugador se leería como un fallo del juego.
      if (e.def.ataque && this.disparos) {
        e.relojAtaque -= dt;
        if (e.relojAtaque <= 0) {
          const at = e.def.ataque;
          let dxa = objetivo.x - e.x;
          let dya = objetivo.y - e.y;
          const d2a = dxa * dxa + dya * dya;
          if (d2a < at.alcance * at.alcance && d2a > 1) {
            e.relojAtaque = at.cadencia;

            // SISMO: no vuela nada. Se marca un círculo en el suelo donde está
            // el jugador AHORA, se avisa, y revienta. Por eso no se puede
            // destruir como un proyectil: la respuesta no es limpiarlo, es
            // salirse del círculo.
            //
            // Se apunta a donde estás, no a donde estarás: adivinar el futuro
            // haría imposible esquivarlo moviéndose, que es justo lo que este
            // ataque tiene que enseñar.
            if (at.tipo === 'sismo') {
              // `azarObjetivo`: fracción de las veces que el sismo cae en un
              // punto al azar de la pantalla en vez de sobre el jugador real
              // (ver el comentario de `ciclope` en datos/enemigos.js). Usa el
              // RNG de la partida, no Math.random(): dos partidas con la
              // misma semilla tienen que tirar los mismos dados también aquí.
              let tx = objetivo.x, ty = objetivo.y;
              if (at.azarObjetivo && camara && this._rng() < at.azarObjetivo) {
                tx = camara.izquierda + this._rng() * ANCHO_LOGICO;
                ty = camara.arriba + this._rng() * ALTO_LOGICO;
              }
              // Se le pasa de dónde sale la piedra: del pecho del cíclope, no
              // de sus pies. Con eso el disparo puede dibujarla volando durante
              // el aviso (ver el sismo en entidades/disparo.js).
              this.disparos.sismo(tx, ty, at, e.x, e.y - 10);
            } else {

            const inv = 1 / Math.sqrt(d2a);
            const base = atan2(dya * inv, dxa * inv);
            const paso = at.dispersion * Math.PI / 180;
            const inicio = base - paso * (at.proyectiles - 1) * 0.5;
            for (let q = 0; q < at.proyectiles; q++) {
              const a = inicio + paso * q;
              this.disparos.lanzar(e.x, e.y - 6, cos(a), sen(a), at);
            }
            }
          } else {
            // Fuera de alcance: se reintenta pronto en vez de gastar la recarga
            // entera, igual que hacen las armas del jugador.
            e.relojAtaque = 0.25;
          }
        }
      }

      // --- Los que CRUZAN, aparte --------------------------------------
      // No persiguen. Fijan la dirección la primera vez que se mueven —hacia
      // donde estabas cuando entraron— y siguen recto hasta salir de la región
      // activa, donde el culling los recoge.
      //
      // Es la otra mitad de la solución al rebaño, y la más visible: por muchos
      // puestos de acoso que se repartan, si TODO lo que hay en pantalla te
      // persigue, todo acaba yendo en la misma dirección. Con una parte de la
      // horda cruzando, hay tráfico en dos direcciones, se ve moverse el campo
      // de batalla y esquivar vuelve a significar algo.
      if (e.mov === MOV_TRAVESIA) {
        if (e.dirX === 0 && e.dirY === 0) {
          const ang = atan2(objetivo.y - e.y, objetivo.x - e.x) +
                      (this._rng() - 0.5) * 0.5;
          e.dirX = cos(ang);
          e.dirY = sen(ang);
        }
        const v = e.velocidad * (1 - e.frenado);
        if (e.frenado > 0) {
          e.frenado -= dt * 1.6;
          if (e.frenado < 0) e.frenado = 0;
        }
        e.x += e.dirX * v * dt;
        e.y += e.dirY * v * dt;
        if (e.empujeX !== 0 || e.empujeY !== 0) {
          e.x += e.empujeX * dt;
          e.y += e.empujeY * dt;
          const fr = exp(-DECAIMIENTO_EMPUJE * dt);
          e.empujeX *= fr; e.empujeY *= fr;
          if (Math.abs(e.empujeX) < 1 && Math.abs(e.empujeY) < 1) { e.empujeX = 0; e.empujeY = 0; }
        }
        if (e.destello > 0) e.destello -= dt;
        if (e.dirX > 0.08) e.mirandoDerecha = true;
        else if (e.dirX < -0.08) e.mirandoDerecha = false;
        if (e.frames > 1) {
          e.relojAnim += dt;
          while (e.relojAnim >= SEG_POR_FRAME) {
            e.relojAnim -= SEG_POR_FRAME;
            e.frame = (e.frame + 1) % e.frames;
          }
        } else {
          e.fase += dt * e.cadencia;
        }
        continue;
      }

      // --- Puesto de acoso ---------------------------------------------
      // No se persigue al jugador: se persigue el sitio que a este bicho le toca
      // alrededor del jugador. Ver el comentario de DERIVA_ACOSO arriba: es lo
      // que convierte la cola que te sigue en un cerco que se cierra.
      e.anguloAcoso += dt * e.derivaAcoso;
      const metaX = objetivo.x + cos(e.anguloAcoso) * e.radioAcoso;
      const metaY = objetivo.y + sen(e.anguloAcoso) * e.radioAcoso;

      let dx = metaX - e.x;
      let dy = metaY - e.y;
      const d2 = dx * dx + dy * dy;
      let dist = 0;
      if (d2 > 0.0001) {
        dist = Math.sqrt(d2);
        const inv = 1 / dist;
        dx *= inv; dy *= inv;
      } else {
        dx = 0; dy = 0;
      }

      // --- POR LOS PASILLOS, no contra la pared -------------------------
      //
      // En un nivel de rejilla (el CC The Lighthouse), perseguir en línea recta
      // es amontonarse contra el escaparate del hipermercado mientras el jugador
      // mira desde el pasillo de al lado. El campo de flujo de
      // sistemas/rejillaMapa.js ya sabe, para cada celda del mapa, hacia dónde
      // hay que ir para acercarse al jugador más cercano POR PASILLOS.
      //
      // Pero solo se usa CUANDO HAY UNA PARED DE POR MEDIO. Mientras te ve, el
      // bicho se te echa encima en línea recta, igual que en Mérida: el campo
      // describe una curva suave que, a dos metros, se lee como que el enemigo
      // ha perdido el interés. Lo bonito de la mezcla es que se nota jugando —
      // doblas una esquina y lo que te seguía tarda un instante en rodearla.
      //
      // Los que HUYEN quedan fuera: el campo apunta hacia el jugador y es justo
      // lo contrario de lo que quieren.
      if (RejillaMapa.activa && e.mov !== MOV_HUIDA && (dx !== 0 || dy !== 0)) {
        const aCiegas = dist > DIST_VISION ||
                        !RejillaMapa.lineaLibre(e.x, e.y, objetivo.x, objetivo.y);
        if (aCiegas && RejillaMapa.direccionEn(e.x, e.y, RUMBO)) {
          dx = RUMBO.x; dy = RUMBO.y;
        }
      }

      // --- Personalidad de movimiento ---------------------------------
      // Aquí es donde la horda deja de ser un bloque. Sobre la dirección de
      // persecución se monta el patrón del tipo, y el desvío se APAGA de
      // forma continua en el último tramo: un enemigo que culebrea pegado a
      // ti pasaría de largo una y otra vez sin llegar a tocarte nunca.
      let vFactor = 1;
      if (e.mov !== MOV_DIRECTO && dist > 0) {
        e.faseMov += dt * e.cadenciaMov;
        if (e.faseMov > TAU) e.faseMov -= TAU;
        const k = dist < CERCA ? dist / CERCA : 1;

        let nx = dx, ny = dy;
        if (e.mov === MOV_ZIGZAG) {
          // Desvío perpendicular sinusoidal: culebreo.
          const s = seno(e.faseMov) * AMP_ZIGZAG * k * e.giro;
          nx = dx - dy * s; ny = dy + dx * s;
        } else if (e.mov === MOV_REVOLOTEO) {
          // DOS ondas de periodo inconmensurable. Con una sola se le ve el
          // bucle enseguida y deja de parecer errático; con dos, el patrón
          // tarda tanto en repetirse que se lee como azar.
          const s = (seno(e.faseMov) * 0.62 + seno(e.faseMov * 0.41 + 1.7) * 0.38)
                    * AMP_REVOLOTEO * k * e.giro;
          nx = dx - dy * s; ny = dy + dx * s;
          vFactor = 0.80 + 0.35 * (seno(e.faseMov * 0.7) + 1);
        } else if (e.mov === MOV_ORBITA) {
          // Espiral: el radio al que quiere girar late, así que la vuelta se
          // va cerrando y abriendo y acaba pasando por la distancia de
          // contacto. Girando a radio fijo no llegaría a golpear jamás.
          const ro = e.radioOrbita * (0.78 + 0.22 * seno(e.faseMov));
          const fuera = dist > ro;
          const radial = fuera ? 1 : -0.30;
          const tang = (fuera ? 0.55 : 1) * k * e.giro;
          nx = dx * radial - dy * tang;
          ny = dy * radial + dx * tang;
        } else if (e.mov === MOV_ACECHO) {
          // Ni desvío ni curva: solo el ritmo. Se para, mira, y embiste.
          vFactor = seno(e.faseMov) > 0.15 ? 1.85 : 0.16;
        } else if (e.mov === MOV_HUIDA) {
          // El único que NO quiere alcanzarte. Dos componentes:
          //
          //   radial     — negativo mientras estás cerca (se aleja) y ligeramente
          //                positivo pasado DIST_HUIDA (vuelve a acercarse). Ese
          //                cambio de signo es lo que la mantiene rondando a media
          //                pantalla en vez de largarse en línea recta.
          //   tangencial — le da la vuelta al jugador. Sin esto, huir es alejarse
          //                por una recta y basta con acorralarla contra el borde.
          //
          // El resultado es una presa que se escurre pero sigue en pantalla:
          // alcanzable si dejas de matar oleada un momento, que es exactamente el
          // dilema que el cofre tiene que plantear.
          // `huidaTotal` la ponen los que salen por patas al entrar el jefe: esos
          // no rondan a media pantalla, se van y no vuelven.
          const radial = (e.huidaTotal || dist < DIST_HUIDA) ? -1 : 0.4;
          const rodeo = 0.85 * e.giro;
          nx = dx * radial - dy * rodeo;
          ny = dy * radial + dx * rodeo;
          // Acelerones cortos: se escapa a tirones, como algo que sabe que lo
          // persiguen. Además hace que perseguirla no sea mantener una tecla.
          vFactor = 0.88 + 0.34 * seno(e.faseMov);
          // La desbandada de un jefe (huidaGeneral) no es la presa que ronda
          // por el cofre: aquí "huir" tiene que leerse como PÁNICO, no como
          // el mismo trote de siempre con la flecha invertida.
          //
          // x3 y no el x1,45 que tuvo: a uno y medio se iban al trote y el
          // desalojo duraba tanto que la pelea con el jefe empezaba con la
          // pantalla todavía llena de espaldas. Lo pidió Sergio más rápido y de
          // paso arregla eso. A triple marcha, un básico cruza lo que queda de
          // pantalla en poco más de un segundo — se ve la desbandada, que es lo
          // que hace de la llegada del jefe un acontecimiento, y se acaba.
          if (e.huidaTotal) vFactor *= 3;
        }

        const m2 = nx * nx + ny * ny;
        if (m2 > 0.0001) {
          const invm = 1 / Math.sqrt(m2);
          dx = nx * invm; dy = ny * invm;
        }
      }

      // Enganche de alcance: ver el comentario de DIST_ALCANCE_JEFE. `dist` ya
      // es la distancia real al puesto de acoso (para un jefe, prácticamente
      // la distancia al jugador, porque su radioAcoso es nulo).
      const multJefe = (e.def.rol === 'jefe' && dist > DIST_ALCANCE_JEFE)
        ? dist / DIST_ALCANCE_JEFE : 1;

      // El frenado lo imponen las redes y los charcos, y se desvanece solo. Es
      // un valor máximo, no acumulativo: dos redes solapadas frenan lo mismo
      // que una, o bastaría con apilar armas de control para dejar el mapa
      // congelado.
      let v = e.velocidad * vFactor * multJefe * (1 - e.frenado);

      // LA DESBANDADA TIENE VELOCIDAD MÍNIMA, no solo multiplicador.
      //
      // Con el x3 a secas, los lentos seguían sin salir de cuadro: una serpiente
      // va a 10, o sea 18 por segundo contando el vaivén, y la pantalla tiene 240
      // de semieje. Le harían falta trece segundos para desaparecer por el borde
      // y el reloj de la desbandada la borra a los tres — a la vista, que es
      // justo el parpadeo que esto evita. Un cíclope, a 7, ni se movía.
      //
      // Con el suelo, hasta el más lento cruza la media pantalla en menos de los
      // tres segundos que tiene, así que se va POR EL BORDE y lo recoge el
      // culling. El reloj deja de ser el camino normal y pasa a ser lo que era:
      // la red por si alguno se queda trabado.
      //
      // Y el frenado se aplica igual —una red que pisa un enemigo en desbandada
      // lo sigue frenando—, así que sigue siendo un suelo y no una inmunidad.
      if (e.huidaTotal && e.relojDesbandada !== 0) {
        const suelo = VELOCIDAD_DESBANDADA * (1 - e.frenado);
        if (v < suelo) v = suelo;
      }
      if (e.frenado > 0) {
        e.frenado -= dt * 1.6;
        if (e.frenado < 0) e.frenado = 0;
      }
      e.x += dx * v * dt;
      e.y += dy * v * dt;

      // Empuje por daño. Decae rápido y en exponencial: un golpe da un tirón
      // seco, no un desplazamiento largo. Los inmunes ni lo acumulan.
      if (e.empujeX !== 0 || e.empujeY !== 0) {
        e.x += e.empujeX * dt;
        e.y += e.empujeY * dt;
        const frenado = exp(-DECAIMIENTO_EMPUJE * dt);
        e.empujeX *= frenado;
        e.empujeY *= frenado;
        if (Math.abs(e.empujeX) < 1 && Math.abs(e.empujeY) < 1) {
          e.empujeX = 0; e.empujeY = 0;
        }
      }
      if (e.destello > 0) e.destello -= dt;

      // Umbral ancho a propósito: con uno estrecho, un enemigo que persigue casi
      // en vertical se pasa el rato volteándose por el ruido de la separación.
      if (dx > 0.08) e.mirandoDerecha = true;
      else if (dx < -0.08) e.mirandoDerecha = false;

      if (e.frames > 1) {
        e.relojAnim += dt;
        while (e.relojAnim >= SEG_POR_FRAME) {
          e.relojAnim -= SEG_POR_FRAME;
          e.frame = (e.frame + 1) % e.frames;
        }
      } else {
        e.fase += dt * e.cadencia;
      }
    }
  }

  // Aplica daño. NO recicla al morir: solo deja la vida a cero y suelta el
  // efecto. Retirar aquí mismo intercambiaría posiciones en el pool y dejaría
  // los índices de la rejilla —que es justo lo que está recorriendo quien
  // llama— apuntando a otras entidades. La retirada va aparte, en
  // retirarMuertos(), cuando ya no hay nadie iterando.
  // `duenyo` es el jugador que ha metido el golpe, o null si no se le puede
  // atribuir a nadie. Solo se usa para apuntarle la baja: el daño es el mismo
  // venga de quien venga.
  // `fuente` es EL ARMA que pega, cuando la hay: el objeto del arsenal, no su
  // id. Sirve para el resumen de partida, que enseña cuánto ha hecho cada una y
  // a cuántos se ha llevado por delante.
  //
  // Es opcional a propósito. Hay daño que no sale de un arma —el mordisco de
  // una mascota— y ese suma al total del jugador pero no tiene fila propia en
  // la lista: una mascota no es un arma y ponerla en esa columna diría que se
  // puede subir de nivel como las demás.
  danyar(e, cantidad, dirX, dirY, fuerza, duenyo, fuente) {
    if (e.vida <= 0) return false;          // ya muerto este paso

    // UN POSEIDO NO SE PUEDE MATAR. Lo pidio Sergio y arregla lo que hacia que
    // el Libro de las Sombras fuera un objeto raro de usar: el bicho al que
    // acababas de pasarte a tu bando se moria de un roce de tus propias armas
    // —que siguen disparando solas a lo que tengan mas cerca, y lo mas cerca
    // era el— asi que la mitad de las veces el objeto se gastaba sin que
    // llegaras a ver nada. Se pagaba un objeto para matar a un enemigo dos veces.
    //
    // Es inmune a TODO, no solo a ti: tambien a la explosion de otro poseido y
    // al fuego de tus companeros. La regla se entiende de una sola forma —lo
    // que brilla en rojo no se toca— y una excepcion la volveria imposible de
    // leer en mitad de una horda.
    //
    // No es inmortal: le quedan sus cinco segundos y revienta igual. Lo que se
    // le quita es la posibilidad de morir ANTES de servir para algo.
    if (e.poseido > 0) return false;

    // SE APUNTA LO QUE SE QUITA DE VERDAD, no lo que se pide. Un golpe de 56 a
    // un enemigo con 7 de vida son 7 puntos de daño hecho, no 56: contar la
    // petición infla el número justo con las armas que rematan a la horda de un
    // toque, que son la mitad del catálogo, y entonces la lista deja de servir
    // para compararlas entre ellas, que es para lo que está.
    // LA CRUZ DEL GIGANTE dobla el PRIMER golpe que recibe cada enemigo.
    //
    // Es del enemigo y no del jugador: el primero es el primero, lo dé quien lo
    // dé. En cooperativo eso significa que el que llega antes se lleva el
    // doble, que es lo que premia el objeto — abrir tú, no rematar.
    //
    // Y la marca se pone SIEMPRE, la lleve alguien o no. Si solo la pusiera
    // quien tiene la Cruz, jugando con dos y llevándola uno solo, el otro
    // dejaría a todos los enemigos "sin estrenar" y la Cruz cobraría el doble
    // en cuerpos ya medio muertos.
    if (!e.golpeado) {
      if (duenyo && duenyo.primerGolpeDoble > 0) {
        cantidad *= 1 + duenyo.primerGolpeDoble;
      }
      e.golpeado = 1;
    }

    const efectivo = Math.min(cantidad, e.vida);
    if (duenyo) duenyo.danyoHecho += efectivo;
    if (fuente) fuente.danyoHecho += efectivo;

    // LAS SANGUIJUELAS DEL GUADIANA devuelven parte del daño como vida. Sobre
    // lo EFECTIVO y no sobre lo pedido: si no, un arma que remata a la horda de
    // un toque curaría por los cincuenta puntos que pidió y no por los siete
    // que hacían falta, y el objeto se volvería inmortalidad barata.
    if (duenyo && duenyo.robaVida > 0 && !duenyo.abatido) {
      const cura = efectivo * duenyo.robaVida;
      if (duenyo.vida < duenyo.vidaMaxima) {
        duenyo.vida = Math.min(duenyo.vidaMaxima, duenyo.vida + cura);
      }
    }

    e.vida -= cantidad;
    e.destello = DURACION_DESTELLO;
    VFX.numero(e.x, e.y - e.meta.h / ESCALA_ARTE * 0.6, cantidad, this._rng);

    // Empuje proporcional al daño e inverso a la masa, como pide el plan: una
    // serpiente sale despedida y un cíclope ni se entera.
    if (!e.def.inmuneEmpuje && fuerza > 0) {
      const imp = fuerza * e.invMasa * (0.5 + cantidad / 40);
      e.empujeX += dirX * imp;
      e.empujeY += dirY * imp;
    }

    if (e.vida <= 0) {
      e.vida = 0;
      // EL PARÓN Y LA SACUDIDA, A LA MEDIDA DE LO QUE HA CAÍDO.
      //
      // Antes era un valor fijo para todo lo que pasara de VIDA_HITSTOP, así
      // que matar a un cíclope y matar a un jefe se sentían igual. Ahora el
      // parón crece con la vida máxima del que cae y la sacudida le acompaña:
      // una serpiente no para nada, un élite da un golpe seco y un jefe se nota
      // en el mando. Los topes están puestos para que un hitstop siga siendo un
      // signo de puntuación y no un tartamudeo (ver VFX.congelar, que además
      // tiene su propio racionamiento).
      if (e.vidaMaxima >= VIDA_HITSTOP) {
        const peso = Math.min(1, e.vidaMaxima / (VIDA_HITSTOP * 12));
        VFX.congelar(0.04 + peso * 0.06);
        // `masa`: esto lo piden decenas de muertes por segundo con un arma de
        // área, y sin racionar la cámara no se para nunca. Ver VFX.sacudir.
        VFX.sacudir(1.2 + peso * 3.5, true);
      }

      // Objeto del escenario (antorcha, ver datos/enemigos.js): NO es una
      // baja de verdad. Nada de gema de XP ni de sumar al contador de
      // enemigos eliminados —ese contador y la experiencia son la cuenta de
      // la horda, no del atrezo—, y en vez de sangre suelta un consumible al
      // azar, la misma tripleta que ya reparte el director de oleadas
      // (sistemas/director.js) por el escenario cada pocos minutos.
      if (e.def.esObjeto) {
        MetaProgreso.ganar(DENARIOS_ANTORCHA);
        GestorAudio.muerteEnemigo();
        if (this.cofres) this.cofres.soltar(e.x, e.y, tipoConsumible(this._rng()));
        // Una antorcha no muere: se APAGA. Las chispas son el fuego que salta al
        // romperla, y lo que se queda flotando después es su ceniza —el material
        // de su ficha— en vez del polvo de tierra que levanta un cuerpo al caer.
        const matObjeto = e.material;
        const apretadoObjeto = Particulas.saturado();
        Particulas.chorro(e.x, e.y - 4, dirX, dirY, apretadoObjeto ? 3 : 6,
                          70, 1.1, 0.35, 1.5, COLOR_CHISPA, 0.8, this._rng);
        if (!apretadoObjeto) {
          Particulas.estallido(e.x, e.y - 4, 5, matObjeto.velocidad * 0.6, 0.55,
                               matObjeto.tam, matObjeto.color, matObjeto.gravedad,
                               this._rng);
        }
        return true;
      }

      this.bajas++;
      // Y a quien lo remató. Va DESPUÉS del descarte de `esObjeto` de arriba, a
      // propósito: romper una antorcha no es matar un enemigo, y colarla aquí
      // inflaría la cuenta de quien pasara rompiendo el atrezo.
      if (duenyo) duenyo.bajas++;
      // Y a QUÉ arma se la apunta, para la lista del resumen. Aquí abajo y no
      // arriba con el daño por el mismo motivo que la del jugador: romper una
      // antorcha no es matar, y arriba todavía no se ha descartado el atrezo.
      if (fuente) fuente.bajas++;
      // EL BECERRO DE ORO va aquí y no en `denariosPorBaja`, que no sabe quién
      // ha matado. Es del que remata, no del equipo: en cooperativo, quien lo
      // lleve cobra más por LO SUYO, y eso es lo que hace que valga la pena
      // llevarlo aunque el compañero mate más.
      //
      // Nerón el Gato multiplica lo mismo pero por otro camino (`factorDenarios`
      // en MetaProgreso, ver datos/mascotas.js): la mascota es de la partida
      // entera y esto es de cada baja. Se acumulan, y a propósito — el que
      // quiera montarse la partida del dinero, que se la monte.
      // LA PIRA FUNERARIA: cada N muertes, la siguiente revienta. El contador es
      // del jugador y no del arma, así que las cuatro que lleve suman a la
      // misma cuenta: lo que enciende la pira es matar, no matar con algo.
      if (duenyo && duenyo.piraCada > 0 && this.zonas) {
        if (++duenyo.bajasPira >= duenyo.piraCada) {
          duenyo.bajasPira = 0;
          this.zonas.crear({
            x: e.x, y: e.y,
            radio: RADIO_PIRA * (1 + duenyo.bonusArea),
            radioIni: 4,
            duracion: 0.32,
            danyo: Math.round(DANYO_PIRA * (1 + duenyo.bonusDanyo)),
            intervalo: 0.32,
            tipo: 'onda',
            color: '#ff9a3c',
            empuje: 120,
            duenyo
          });
        }
      }

      const oro = denariosPorBaja(e.def);
      MetaProgreso.ganar(duenyo && duenyo.bonusDenarios > 0
        ? Math.round(oro * (1 + duenyo.bonusDenarios))
        : oro);
      GestorAudio.muerteEnemigo();
      if (e.def.cofre) this.elitesVivos--;
      if (e.def.escolta) this.escoltasVivos--;
      // Con la matanza en marcha se recorta el estallido: cuando mueren cien a
      // la vez, nadie distingue siete partículas de tres, pero el coste sí se
      // nota. La muerte SIEMPRE deja algo, o el enemigo se esfumaría sin más.
      // Suelta su gema de experiencia. El gestor de recogibles se enchufa desde
      // fuera para que enemigo.js no dependa de él: si algún día un enemigo no
      // debe soltar nada, basta con no ponerlo.
      if (this.recogibles) this.recogibles.soltar(e.x, e.y, e.def.xp || 1);

      // Cofre de élite. Va APARTE de la gema y no en lugar de ella: la gema es
      // el pago por matarlo y el cofre es el premio por haberlo elegido a él
      // entre toda la horda.
      if (e.def.cofre && this.cofres) this.cofres.soltar(e.x, e.y);

      // LO QUE DEJA UN JEFE. Los dos campos son datos del bicho (ver
      // `cofreDorado` y `denariosAlMorir` en datos/enemigos.js): aquí no se sabe
      // quién es Cerbero ni quién la Loba, solo que uno deja cofre y otro oro.
      //
      // El cofre va FORZADO a especial, sin pasar por el sorteo del 10%: lo que
      // se gana tumbando a un jefe no puede depender de una tirada.
      if (e.def.cofreDorado && this.cofres) this.cofres.soltar(e.x, e.y, COFRE, true);

      // Y los denarios del jefe final van DIRECTOS al progreso META, sin pasar
      // por un recogible en el suelo. Cuando cae la Loba la partida se termina,
      // así que un montón de monedas tiradas en la arena sería un premio que hay
      // que correr a recoger antes de que la pantalla de final se lo coma. Esto
      // no puede perderse.
      if (e.def.denariosAlMorir > 0) {
        MetaProgreso.ganar(duenyo && duenyo.bonusDenarios > 0
          ? Math.round(e.def.denariosAlMorir * (1 + duenyo.bonusDenarios))
          : e.def.denariosAlMorir);
      }

      // Lo que suelta sale DESPEDIDO hacia donde iba el golpe, no en círculo: un
      // cono, que sigue leyéndose como un reventón pero cuenta además de dónde
      // vino. El polvo sí se queda redondo — es el que levanta el cuerpo al
      // caer, y ese no tiene dirección ni depende de qué se haya roto.
      //
      // Y sale del MATERIAL, no siempre sangre: una gárgola es una estatua y
      // reventaba en rojo como todo lo demás. Ver MATERIALES.
      const mat = e.material;
      const apretado = Particulas.saturado();
      Particulas.chorro(e.x, e.y - 4, dirX, dirY, apretado ? 3 : mat.gotas,
                        mat.velocidad, mat.apertura, 0.45, mat.tam,
                        mat.color, mat.gravedad, this._rng);
      if (!apretado) {
        Particulas.estallido(e.x, e.y - 4, 3, 40, 0.30, 1,
                             COLOR_POLVO, 0.4, this._rng);
      }
      return true;
    }

    // Las chispas de impacto son lo primero que se sacrifica: son adorno, y un
    // arco de melé a nivel 8 pide doscientas de golpe. Las que salen van hacia
    // donde iba el golpe, en un cono estrecho: son chispas de choque, no una
    // explosión.
    if (!Particulas.saturado()) {
      // La CARNE echa chispas doradas —la chispa es el idioma del choque y así
      // se ha visto siempre— pero lo que no es carne echa lo suyo: pegarle a una
      // gárgola tiene que soltar lascas, no destellos, porque es lo que dice sin
      // palabras que eso de ahí es piedra y va a costar. Y como golpear es lo
      // que más se hace, es aquí donde el material se ve de verdad; la muerte
      // solo lo confirma.
      const mat = e.material;
      const chispa = mat === MATERIALES.carne;
      Particulas.chorro(e.x, e.y - 6, dirX, dirY, 2, 60, 0.7, 0.22, 1,
                        chispa ? COLOR_CHISPA : mat.color,
                        chispa ? 0.6 : mat.gravedad, this._rng);
    }
    // Y la marca del golpe, que es lo que hace que un impacto se vea aunque no
    // haya sitio para partículas: un trazo corto atravesado en la dirección del
    // golpe. Ver VFX.impacto.
    VFX.impacto(e.x, e.y - 6, dirX, dirY, cantidad);
    GestorAudio.golpe();
    return false;
  }

  // Retira del pool a los que se quedaron sin vida. Se llama cuando ya no hay
  // ningún sistema recorriendo la rejilla.
  retirarMuertos() {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      if (items[k].vida <= 0) this.pool.liberarEn(k);   // sin avanzar k
      else k++;
    }
  }

  // Devuelve al pool todo lo que ha quedado fuera de la región activa.
  // OJO: libera intercambiando con el último, así que k NO avanza cuando hay
  // baja; el que acaba de caer en la posición k todavía no se ha mirado.
  //
  // Los élites (`persistente`) aguantan el DOBLE de distancia. La mantícora
  // orbita y la serpiente dorada huye: los dos se alejan por diseño, y con el
  // margen normal se reciclaban en mitad de la persecución llevándose el cofre.
  // Son uno o dos a la vez, así que la IA extra no se nota en ningún sitio.
  //
  // Uno de estos puede quedar fuera de la rejilla espacial, que solo cubre la
  // región de culling normal. No pasa nada: la pinza de core/rejilla.js lo mete
  // en la celda del borde y las comprobaciones de distancia siguen siendo
  // exactas. Lo único que se pierde es afinidad de celda para un par de bichos
  // que además están fuera de pantalla.
  reciclarLejanos(centroX, centroY) {
    const items = this.pool.items;
    let k = 0;
    while (k < this.pool.activos) {
      const e = items[k];
      // Un jefe NUNCA se recicla por lejanía. Antes de este cambio, un jefe
      // que se quedaba atrás (todos son más lentos que el jugador) podía
      // cruzar el umbral de culling como cualquier serpiente: el objeto no se
      // borraba (el pool solo mueve el índice), así que sistemas/jefes.js
      // seguía creyéndolo vivo y gobernando un fantasma congelado e invisible,
      // hasta que un enemigo nuevo reciclaba ese mismo hueco y lo pisaba sin
      // más. El jefe desaparecía para siempre sin morir ni dar recompensa —el
      // bug real de "hemos perdido a la Loba de vista y no ha vuelto a
      // aparecer". El desenganche que sí hace falta (que no se quede atrás de
      // verdad) se resuelve con velocidad de alcance más abajo, en mover().
      if (e.def.rol === 'jefe') { k++; continue; }

      // EL QUE SE HA IDO EN LA DESBANDADA, fuera aunque siga a la vista. Su
      // reloj lo puso `huidaGeneral` al entrar el jefe y lo descuenta `mover`;
      // a cero se retira sin más, que es lo que garantiza que la pelea con el
      // jefe empieza sin nadie más en pantalla.
      //
      // Aquí y no en `danyar` a propósito: por este camino el hueco vuelve al
      // pool y ya está — ni gema, ni denarios, ni cadáver, ni el contador de
      // bajas. No los has matado, se han largado.
      const seFue = e.huidaTotal && e.relojDesbandada < 0;

      // Y AL QUE HUYE SE LE RECOGE EN CUANTO SALE DE CUADRO, sin esperar al
      // margen generoso de siempre. Ese margen existe para que un enemigo que se
      // queda un momento fuera de plano no desaparezca y reaparezca; el que va
      // en desbandada no va a volver, así que guardarle el sitio es tener medio
      // pool ocupado por gente que ya se ha ido. 0,4 de CULL deja 288 en x y 162
      // en y, las dos por fuera de la pantalla (240 y 135).
      const margen = e.huidaTotal && e.relojDesbandada !== 0
                   ? 0.4
                   : (e.def.persistente ? 2 : 1);
      if (seFue ||
          Math.abs(e.x - centroX) > CULL_X * margen ||
          Math.abs(e.y - centroY) > CULL_Y * margen) {
        if (e.def.cofre) this.elitesVivos--;
        if (e.def.escolta) this.escoltasVivos--;
        this.pool.liberarEn(k);
        this.reciclados++;
      } else {
        k++;
      }
    }
  }

  // Pánico de UNO, y temporal. Lo usa el Pollito Fantasma
  // (sistemas/mascotas.js): a diferencia de huidaGeneral, esto se pasa.
  //
  // Ni jefes ni objetos del escenario: a un jefe no lo espanta un pollo, y una
  // antorcha no tiene piernas. Y no se reencola el pánico si ya lo tiene, solo
  // se estira: un chillido encima de otro alarga el susto, no lo reinicia con
  // un movimiento previo equivocado.
  espantar(indice, duracion) {
    const e = this.pool.items[indice];
    if (!e || e.vida <= 0) return;
    if (e.def.rol === 'jefe' || e.def.esObjeto || e.huidaTotal) return;
    if (e.panico <= 0) {
      e.movPrevio = e.mov;
      e.mov = MOV_HUIDA;
      e.cadenciaMov = CADENCIA_MOV[MOV_HUIDA];
    }
    if (duracion > e.panico) e.panico = duracion;
  }

  // Para el tiempo a TODA la horda. Lo llama el Reloj de Emerita al recogerse.
  //
  // A todos de verdad, jefes incluidos: es un objeto raro, dura seis segundos y
  // el momento en que más falta hace es justo cuando hay un jefe encima. Se
  // saltan solo los objetos del escenario, que no se mueven de todas formas.
  // EL RELOJ DE EMERITA PARA LA HORDA ENTERA, no solo la que ya existe.
  //
  // Esto congelaba a los que estuvieran vivos en ese instante, y con eso no
  // basta: el director sigue soltando enemigos mientras dura, y nacen JUSTO
  // FUERA DE CUADRO. Entraban andando por el borde con todo lo demás
  // petrificado, que es exactamente lo que rompe la ilusión de tiempo parado.
  //
  // Y no era solo el director: un enemigo congelado que se aleja lo bastante lo
  // recicla `reciclarLejanos`, y el hueco vuelve a usarse para uno nuevo — sin
  // congelar.
  //
  // Se arregla guardando el tiempo que le queda a la PARÁLISIS, no a cada
  // enemigo: mientras corra, todo el que aparezca nace ya paralizado con lo que
  // reste (ver `aparecer`). Un solo número para toda la horda.
  paralizarTodos(duracion) {
    if (duracion > this.paralisisRestante) this.paralisisRestante = duracion;
    const items = this.pool.items;
    for (let k = 0; k < this.pool.activos; k++) {
      const e = items[k];
      if (e.def.esObjeto) continue;
      if (duracion > e.paralizado) e.paralizado = duracion;
    }
  }

  // TODOS SALEN HUYENDO, menos los jefes, y lo llama el director en los tres
  // hitos de jefe —minutos 10, 20 y el final—.
  //
  // Llegó a hacerse de otra forma: borrar la horda de golpe. Se ve peor, y
  // Sergio pidió lo contrario: que huyan MÁS RÁPIDO y desaparezcan. Son las dos
  // mitades de lo mismo y ninguna sobra — la carrera a triple marcha es lo que
  // se ve (ver `huidaTotal` en mover) y el reloj de desbandada es lo que
  // garantiza que a los tres segundos no queda ni uno.
  //
  // No se les mata ni se les borra: se les cambia el movimiento. Ver desaparecer
  // la horda de golpe se leería como un fallo del juego; verla dar media vuelta
  // y largarse dice quién acaba de llegar mejor que cualquier cartel.
  huidaGeneral() {
    const items = this.pool.items;
    for (let k = 0; k < this.pool.activos; k++) {
      const e = items[k];
      // Ni jefes (no huyen de sí mismos) ni objetos del escenario (una
      // antorcha no tiene piernas): ver la nota de `esObjeto` en
      // datos/enemigos.js.
      if (e.def.rol === 'jefe' || e.def.esObjeto) continue;
      e.mov = MOV_HUIDA;
      e.cadenciaMov = CADENCIA_MOV[MOV_HUIDA];
      e.huidaTotal = true;
      // Sin tope de huida: estos no rondan, se van. El culling los recoge.
      e.radioAcoso = 0;
      e.derivaAcoso = 0;
      // Y A LOS COMUNES SE LES PONE FECHA DE CADUCIDAD. Corriendo a triple
      // marcha les sobra para salir de cuadro, pero "casi siempre" no vale:
      // basta un básico trabado contra unas ruinas o uno que sale hacia donde
      // el jugador va para que se quede dando vueltas por la pelea del jefe. A
      // los DESBANDADA segundos se le retira del pool, esté donde esté.
      //
      // A LOS ÉLITES NO. Un élite suelta el cofre que es la única vía a las
      // evoluciones: borrarlo le quita al jugador un premio que ya se estaba
      // peleando y sin avisar. Huyen como todos, pero si los alcanzas siguen
      // valiendo lo que valían.
      if (e.def.rol !== 'elite') e.relojDesbandada = DESBANDADA;
    }
  }

  vaciar() {
    this.pool.vaciar();
    this.elitesVivos = 0;
    this.escoltasVivos = 0;
    // Sin esto, una partida nueva empezada durante una congelación heredaría el
    // reloj y su primera oleada saldría petrificada.
    this.paralisisRestante = 0;
  }

  // Ordenación por profundidad (eje Y) mediante ordenación por CONTEO sobre
  // arrays tipados preasignados. Nada de Array.sort con una closure de
  // comparación por frame: eso asigna, y además su coste es n log n cuando aquí
  // el rango de Y está acotado y se puede hacer en O(n + k).
  //
  // Los jugadores se intercalan en el mismo orden, en vez de pintarse antes o
  // después del bloque: con la pantalla llena, un jugador siempre encima flota
  // sobre el enjambre y siempre debajo desaparece.
  //
  // Se pintan por orden de Y creciente, igual que los enemigos. Como son pocos
  // (cuatro jugadores como mucho, una decena larga de obstáculos), se ordenan
  // con una inserción sobre un array preasignado; montar aquí un sort con
  // comparador sería asignar una closure por frame.
  //
  // `obstaculos` es opcional (columnas, antorchas, estatuas, ruinas —
  // sistemas/obstaculos.js): son estáticos, así que solo aportan su posición
  // y su propio método `dibujar(ctx)`, exactamente como un Jugador.
  // AVISO DE ATAQUE: el que va a disparar se enciende antes de hacerlo.
  //
  // El cíclope y el charco ya avisaban con su círculo en el suelo, pero un
  // disparo normal salía sin previo aviso: con ochocientos bichos en pantalla,
  // el proyectil que te mata aparece de una nube de sprites y no hay forma de
  // haberlo visto venir. Esto no lo hace más fácil —el disparo sale igual— lo
  // hace JUSTO: la información está, y esquivar pasa a ser cosa tuya.
  //
  // Se dibuja aparte del blit de la horda y no dentro, para no meter una rama
  // por enemigo en el bucle más caliente del juego. El recorrido es sobre todos
  // los activos, pero lo primero que mira es si el bicho tiene ataque a
  // distancia, y eso lo tienen cuatro de veinte.
  dibujarAvisos(ctx, alpha) {
    const items = this.pool.items;
    const n = this.pool.activos;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // EL AURA ROJA DE LOS POSEÍDOS, antes que los avisos de ataque y en el
    // mismo recorrido: los dos son adornos que cuelgan de unos pocos enemigos y
    // recorrer el pool dos veces para pintar dos cosas sería pagarlo dos veces.
    //
    // Late, y late MÁS DEPRISA según se le acaba el tiempo. Es lo único que
    // avisa de que va a estallar, y un aura quieta diría "este es de los tuyos"
    // sin decir "y le quedan dos segundos".
    for (let k = 0; k < n; k++) {
      const e = items[k];
      if (e.poseido <= 0 || e.vida <= 0) continue;
      const x = e.xPrev + (e.x - e.xPrev) * alpha;
      const y = e.yPrev + (e.y - e.yPrev) * alpha;
      const alto = e.meta ? e.meta.h / ESCALA_ARTE : 12;
      const queda = e.poseido / DURACION_POSESION;
      // De un latido por segundo a cinco: 1 + 4 * lo gastado.
      const late = 0.72 + 0.28 * Math.sin(e.poseido * (1 + 4 * (1 - queda)) * 6.28);
      const r = alto * 0.62 * late;
      const g = ctx.createRadialGradient(x, y - alto * 0.45, 0, x, y - alto * 0.45, r);
      // Los tres tramos son el mismo rojo apagandose hacia fuera, no tres
      // colores: un degradado que cambia de tono se lee como dos halos pegados.
      g.addColorStop(0, 'rgba(255,140,120,.60)');
      g.addColorStop(0.55, 'rgba(235,60,45,.32)');
      g.addColorStop(1, 'rgba(150,25,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - alto * 0.45, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let k = 0; k < n; k++) {
      const e = items[k];
      if (!e.def.ataque || e.vida <= 0 || e.paralizado > 0) continue;
      const falta = e.relojAtaque;
      if (falta > AVISO_ATAQUE || falta <= 0) continue;

      // De 0 a 1 según se acerca el disparo: el aro se cierra y se enciende.
      const t = 1 - falta / AVISO_ATAQUE;
      const x = e.xPrev + (e.x - e.xPrev) * alpha;
      const y = e.yPrev + (e.y - e.yPrev) * alpha - e.meta.h / ESCALA_ARTE * 0.5;
      const r = 14 - t * 8;

      ctx.globalAlpha = 0.20 + t * 0.45;
      ctx.strokeStyle = COLOR_AVISO;
      ctx.lineWidth = 1 + t * 1.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();

      // Y un punto que crece en el centro, que es lo que se ve cuando el aro ya
      // está encima del bicho y no se distingue de su silueta.
      ctx.globalAlpha = t * 0.6;
      ctx.fillStyle = COLOR_AVISO;
      ctx.beginPath();
      ctx.arc(x, y, 1 + t * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // `extras`/`nExtras` son cosas sueltas que quieren entrar en el ordenado por
  // profundidad sin pertenecer a ningún pool de aquí: hoy, las mascotas que
  // pisan el suelo. Basta con que cada una traiga un `yVista` y un
  // `dibujar(ctx)`, igual que los jugadores y los obstáculos.
  dibujar(ctx, camara, alpha, jugadores, obstaculos, extras = null, nExtras = 0) {
    const items = this.pool.items;
    const n = this.pool.activos;
    // Aquí SÍ toca la vista: esto es `dibujar`.
    const izq = camara.izquierdaVista;
    const arr = camara.arribaVista;
    const yBase = arr - MARGEN_ARRIBA;

    const conteo = this._conteo;
    const visibles = this._visibles;
    const cubos = this._cubo;
    const orden = this._orden;

    conteo.fill(0);

    // 1. Interpolar, descartar lo que no toca el viewport y clasificar por Y.
    let vis = 0;
    const limIzq = izq - MARGEN_X;
    const limDer = izq + ANCHO_LOGICO + MARGEN_X;
    const limAbajo = arr + ALTO_LOGICO + MARGEN_ABAJO;
    for (let k = 0; k < n; k++) {
      const e = items[k];
      const x = e.xPrev + (e.x - e.xPrev) * alpha;
      const y = e.yPrev + (e.y - e.yPrev) * alpha;
      if (x < limIzq || x > limDer || y < yBase || y > limAbajo) continue;
      e.xVista = x;
      e.yVista = y;

      let b = (y - yBase) | 0;
      if (b < 0) b = 0; else if (b >= CUBOS_Y) b = CUBOS_Y - 1;
      visibles[vis] = k;
      cubos[vis] = b;
      vis++;
      conteo[b + 1]++;
    }

    // 2. Suma acumulada y colocación. `conteo` hace de cursor: al terminar queda
    //    desplazado, pero se vuelve a poner a cero al principio del frame.
    for (let b = 1; b <= CUBOS_Y; b++) conteo[b] += conteo[b - 1];
    for (let i = 0; i < vis; i++) orden[conteo[cubos[i]]++] = visibles[i];

    // 3. Pintar de arriba a abajo. Un solo drawImage por entidad: el volteo sale
    //    de la copia espejada precacheada, no de tocar la matriz del contexto.
    // Jugadores Y obstáculos, juntos, ordenados por Y creciente con inserción
    // sobre un buffer propio. Un obstáculo nunca se mueve, así que su yVista
    // es siempre su y; da igual mezclarlo con jugadores que sí interpolan.
    const ordenJ = this._ordenExtras;
    let nj = 0;
    for (let i = 0; i < jugadores.length; i++) {
      const j = jugadores[i];
      let p = nj++;
      while (p > 0 && ordenJ[p - 1].yVista > j.yVista) { ordenJ[p] = ordenJ[p - 1]; p--; }
      ordenJ[p] = j;
    }
    if (obstaculos) {
      const oi = obstaculos.items;
      const on = obstaculos.activos;
      for (let i = 0; i < on; i++) {
        const o = oi[i];
        let p = nj++;
        while (p > 0 && ordenJ[p - 1].yVista > o.yVista) { ordenJ[p] = ordenJ[p - 1]; p--; }
        ordenJ[p] = o;
      }
    }
    // Y los extras, por el mismo camino. Van los últimos en insertarse pero la
    // inserción los coloca por su y, así que una mascota que orbita por encima
    // de los pies de su jugador acaba ANTES que él en la lista y el jugador la
    // tapa al dibujarse encima. Es lo único que hace falta para que la vuelta
    // pase por detrás del personaje en vez de por delante de su cara.
    for (let i = 0; i < nExtras; i++) {
      const x = extras[i];
      let p = nj++;
      while (p > 0 && ordenJ[p - 1].yVista > x.yVista) { ordenJ[p] = ordenJ[p - 1]; p--; }
      ordenJ[p] = x;
    }
    let sigJugador = 0;

    for (let i = 0; i < vis; i++) {
      const e = items[orden[i]];
      const meta = e.meta;
      if (!meta) continue;
      while (sigJugador < nj && ordenJ[sigJugador].yVista <= e.yVista) {
        ordenJ[sigJugador++].dibujar(ctx);
      }

      // Recién golpeado: se pinta la copia blanqueada, generada al cargar. No
      // hay filtro ni composición en caliente, solo se elige otra imagen.
      //
      // Se puede apagar (tecla T) porque es sospechoso de coste: con un arma de
      // área a nivel alto, casi todos los enemigos visibles destellan a la vez y
      // el dibujado pasa a alternar entre dos imágenes distintas cientos de
      // veces por frame, que es lo que rompe el agrupado del canvas.
      // CONGELADO POR DELANTE DEL DESTELLO. Mientras el Reloj de Emerita tiene
      // parada a la horda, el bicho no destella aunque le peguen: un fogonazo
      // blanco encima de un enemigo congelado contaría lo contrario de lo que
      // pasa —que sigue en la pelea— justo cuando el jugador está decidiendo por
      // dónde cruzar.
      //
      // ANTES ADEMÁS SE PINTABA EN AZUL HIELO, con una copia teñida de cada
      // sprite horneada al cargar (`imgHielo`). Se ha ido con el resto del azul:
      // ahora el mundo ENTERO se queda en blanco y negro mientras dura el Reloj
      // (ver #juego.congelado en css/estilos.css), y sobre un mundo desaturado
      // un teñido azul por bicho no distingue nada de nada — lo dice ya el hecho
      // de que no se mueva ninguno. Lo que sí hacía falta conservar es esto: que
      // el destello no se cuele durante la parada.
      const img = (e.destello > 0 && Enemigos.destelloActivo && e.paralizado <= 0)
        ? (e.mirandoDerecha ? e.imgTinte : e.imgTinteEspejo)
        : (e.mirandoDerecha ? e.img : e.imgEspejo);

      // Todo se cuadra a PÍXEL FÍSICO ENTERO antes de dibujar.
      //
      // Con imageSmoothingEnabled = false, un rectángulo de destino fraccionario
      // hace que el muestreo por vecino más próximo elija filas y columnas
      // distintas de un frame al siguiente: el sprite hierve aunque la entidad
      // apenas se mueva. Esa era la mitad de la vibración que se veía.
      const cxF = Math.round(e.xVista * ESCALA_ARTE);
      const cyF = Math.round(e.yVista * ESCALA_ARTE);

      // Con hoja de animación real no se aplica NADA procedural: el bote y el
      // flote existen para dar vida a una ilustración estática, y superpuestos a
      // un aleteo dibujado a mano se pelean con él. El artista ya decidió cómo
      // se mueve este bicho.
      if (e.frames > 1) {
        ctx.drawImage(img,
          e.frame * meta.w, 0, meta.w, meta.h,
          (cxF - (meta.w >> 1)) / ESCALA_ARTE, (cyF - meta.h) / ESCALA_ARTE,
          meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
        continue;
      }

      // Bote vertical, SIN deformar. Antes esto era squash & stretch: el ancho y
      // el alto de destino cambiaban un par de píxeles con la animación.
      // Se veía bien, pero significaba que CADA enemigo de suelo se dibujaba
      // escalado, y un drawImage escalado no entra por la ruta rápida del
      // navegador. Con setecientos por frame eso se paga.
      //
      // Desplazar el ancla da casi la misma sensación de peso y deja todos los
      // blits a escala 1:1. Si algún día sobra presupuesto, el squash vuelve
      // aquí y en ningún otro sitio.
      const amp = e.vuela ? FLOTE_PX : BOTE_PX;
      const dyF = cyF - meta.h + Math.round(sen(e.fase) * amp);
      ctx.drawImage(img,
        (cxF - (meta.w >> 1)) / ESCALA_ARTE, dyF / ESCALA_ARTE,
        meta.w / ESCALA_ARTE, meta.h / ESCALA_ARTE);
    }
    // Los que quedan van por delante de todo lo visible (o no había enemigos).
    while (sigJugador < nj) ordenJ[sigJugador++].dibujar(ctx);

    this.dibujados = vis;
  }
}
