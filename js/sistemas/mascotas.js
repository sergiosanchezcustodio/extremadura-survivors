import { MASCOTAS, factorMascota } from '../datos/mascotas.js';
import { MetaProgreso } from '../core/metaProgreso.js';
import { Recursos, HALO_PX } from '../core/recursos.js';
import { ESCALA_ARTE } from '../core/constantes.js';
import { enemigoMasCercano, enemigosEnRadio } from './colisiones.js';
import { VFX } from './vfx.js';
import { sen, cos, hipot } from '../core/mate.js';
import { RejillaMapa } from './rejillaMapa.js';

// Mascotas: el bicho que acompaña a cada jugador y hace su cosa cada tantos
// segundos. Ver datos/mascotas.js para el catálogo.
//
// UNA POR JUGADOR y la misma para todos: la mascota equipada es una elección de
// menú, no de partida, así que en cooperativo los cuatro llevan la suya del
// mismo tipo. Se preasignan las cuatro al arrancar y no se crea ni una sola
// durante la partida, como todo lo demás.
//
// Las PASIVAS no pasan por aquí para su efecto —lo aplica jugador.js con el
// mismo bucle que los pasivos y los potenciadores— pero sí para dibujarse: que
// Heladio no haga nada cada X segundos no quiere decir que no tenga que verse
// trotando al lado.

const MAX = 4;

// CÓMO ACOMPAÑA AL JUGADOR: dando vueltas a su alrededor.
//
// Iba a un punto FIJO detrás de él —al lado contrario de hacia donde mira— y
// con eso una mascota quieta era una calcomanía pegada al costado. Ahora el
// punto al que va gira, así que el bicho trota alrededor sin parar.
//
// LA ÓRBITA ES UNA ELIPSE, no un círculo, y bastante aplastada: el juego se ve
// desde arriba y en escorzo, así que una vuelta redonda de verdad se dibuja
// como una elipse ancha y baja. Con un círculo, la mascota subiría y bajaría lo
// mismo que se mueve a los lados y parecería estar orbitando en vertical.
//
// Y CENTRADA UN POCO POR DEBAJO DE LOS PIES, que es lo que deja media vuelta
// por delante del jugador y media por detrás.
//
// SIN TAPAR AL PERSONAJE. Cualquier vuelta cerrada alrededor de alguien pasa
// por detrás de él: no hay órbita que rodee y a la vez esquive el sprite. Así
// que no se esquiva, se OCULTA — las mascotas de suelo entran en el mismo
// ordenado por Y que los enemigos, los jugadores y las columnas (ver
// `prepararOrden` y `enemigos.dibujar`), y en la mitad de arriba de la vuelta
// el jugador se dibuja después y las tapa. Que es lo que hace un cuerpo con
// algo que le pasa por detrás.
// LAS MEDIDAS SALEN DEL SPRITE, no del gusto. El personaje mide 11 de ancho por
// 26 de alto desde sus pies y la mascota más grande 14 de alto. Con el centro
// de la elipse 4 por debajo de los pies y semieje vertical 10, el punto más
// bajo de la vuelta —el de delante, el peligroso, porque además cae justo sobre
// la x del jugador— deja los pies de la mascota 14 por debajo de los del
// personaje: exactamente su propia altura, así que su cabeza roza la línea de
// los pies del jugador y no le sube por la pierna. Las otras siete son más
// bajas y despejan de sobra.
//
// El punto más alto queda 6 por encima de los pies, dentro del sprite — pero
// ahí la mascota va POR DETRÁS y el ordenado la tapa, que es de lo que se trata.
const ORBITA_X = 18;           // semieje horizontal, en unidades lógicas
const ORBITA_Y = 10;           // semieje vertical: aplastado, por el escorzo
const ORBITA_CY = 4;           // cuánto baja el centro respecto a los pies
// Radianes por segundo. 1,15 son unos cinco segundos y medio por vuelta: se ve
// que rodea, no que da vueltas como un satélite.
const VEL_ORBITA = 1.15;
const SUAVIZADO = 5;           // 1/s: cuanto más alto, más pegada
const DISTANCIA_MINIMA = 6;    // nunca más cerca del jugador que esto (ver actualizar)
const FLOTE = 1.6;             // amplitud del balanceo vertical
const RADIO_DIBUJO = 5;

// Índices de enemigos que devuelve una consulta por radio. Preasignado y
// compartido: el chillido del Pollito puede caer con la pantalla llena, y
// crear un array por chillido sería asignar en caliente.
const BUFER = new Int32Array(400);

// Cadencia del ciclo de las mascotas animadas. Mismo criterio que el bestiario:
// una velocidad fija para todas, porque son bichos pequeños al lado del jugador
// y afinarla por mascota no se notaría.
const SEG_POR_FRAME = 1 / 10;

// ¿Se llega desde el jugador a ese desplazamiento sin cruzar pared? Con dos
// unidades de margen, las mismas que deja el recorte de la órbita.
function sitioLibre(j, dx, dy) {
  const d = hipot(dx, dy);
  if (d < 0.001) return true;
  return RejillaMapa.alcanceLibre(j.x, j.y, dx / d, dy / d, d) >= d - 2;
}

export const Mascotas = {
  activas: null,           // una entrada por jugador, preasignada

  iniciar() {
    this.activas = new Array(MAX);
    for (let i = 0; i < MAX; i++) {
      this.activas[i] = {
        x: 0, y: 0, reloj: 0, fase: i * 1.7, viva: false,
        // Ángulo recorrido en su vuelta alrededor del jugador. Se preasigna con
        // el resto del estado: las cuatro mascotas se crean al arrancar y no se
        // asigna una sola durante la partida.
        orbita: 0,
        // Desplazamiento respecto a su jugador. Es lo que se suaviza, y por eso
        // vive aquí en vez de calcularse: ver `actualizar`.
        despX: 0, despY: 0,
        // Si este frame se ha entregado al ordenado por profundidad. Lo que no,
        // lo pinta `dibujarPorEncima`. Ver `prepararOrden`.
        ordenada: false,
        // Para el ordenado por profundidad: el ordenador de `enemigo.js` pide a
        // todo lo que le pasan un `yVista` y un `dibujar(ctx)`, y con eso mezcla
        // mascotas, jugadores, obstáculos y horda en una sola pasada. La mascota
        // no interpola —se mueve con suavizado, no a saltos— así que su yVista
        // es su y.
        //
        // El cierre se crea AQUÍ, al arrancar, junto con el resto del estado: es
        // una función por mascota y son cuatro para toda la sesión.
        yVista: 0,
        dibujar: null,
        mirandoDerecha: true, frame: 0, relojAnim: i * 0.13,
        // UNA MASCOTA POR JUGADOR: cada puesto lleva la suya, su nivel y lo
        // que necesita para dibujarse. Antes había una sola global.
        id: '', def: null, nivel: 0, factor: 1, idAtlas: '', frames: 1
      };
      const m = this.activas[i];
      m.dibujar = (ctx) => this._una(ctx, m);
    }
    // Las mascotas que entran en el ordenado por profundidad este frame.
    // Preasignada, como todo lo demás: nunca se crea nada en partida.
    this.enOrden = new Array(MAX);
    this.nEnOrden = 0;
    this.releer(null);
  },

  // Se llama al empezar la partida con lo que se haya elegido en la pantalla de
  // mascotas: un id por jugador, o cadena vacía para "ninguna". Durante la
  // partida no cambia.
  releer(elegidas) {
    if (!this.activas) return;
    let factorDenarios = 1;

    for (let i = 0; i < MAX; i++) {
      const m = this.activas[i];
      const id = (elegidas && elegidas[i]) || '';
      const nivel = id ? MetaProgreso.nivelMascota(id) : 0;

      m.id = nivel > 0 ? id : '';
      // El color de SU jugador, para la silueta de cuando se hunde en un muro.
      // Se lo pone main.js al empezar la partida (ver `colorearMascotas`); si
      // no hay, la silueta no se dibuja y se ve la mascota de siempre.
      m.def = m.id ? MASCOTAS[m.id] : null;
      m.nivel = nivel;
      // Cuánto rinde su nivel. Se resuelve aquí y no en cada golpe: es un
      // número por partida, no por paso.
      m.factor = factorMascota(nivel);
      // Id del atlas y número de fotogramas, resueltos UNA vez por partida en
      // vez de rehacer la cadena y consultar el atlas sesenta veces por segundo.
      m.idAtlas = m.id ? 'mascota' + m.id.charAt(0).toUpperCase() + m.id.slice(1) : '';
      const meta = m.idAtlas ? Recursos.meta(m.idAtlas) : null;
      m.frames = meta ? (meta.frames || 1) : 1;
      // TODA LA RANURA A ESTRENAR, no solo lo que cambia de mascota.
      //
      // Las ranuras se preasignan al arrancar y se reutilizan partida tras
      // partida, así que lo que no se toque aquí sigue teniendo lo que dejó la
      // mascota anterior: dónde estaba, por dónde iba su vuelta, qué fotograma
      // pintaba. Con una mascota elegida se sobrescribe enseguida y no se nota;
      // sin ella la ranura queda inerte y esos restos no molestan a nadie...
      // salvo que dejan de ser la misma partida. Lo cazó guardarInstantanea():
      // nueve campos sucios tras jugar una sola vez, y con ellos dos maquinas
      // con distinto historial no pueden compartir un cooperativo por lockstep.
      //
      // `fase` y `relojAnim` vuelven a su valor de origen y no a cero: se
      // reparten por ranura a propósito, para que cuatro mascotas iguales no
      // aleteen todas a la vez.
      m.x = 0; m.y = 0; m.yVista = 0;
      m.despX = 0; m.despY = 0;
      m.orbita = 0;
      m.fase = i * 1.7;
      m.relojAnim = i * 0.13;
      m.frame = 0;
      m.mirandoDerecha = true;
      m.ordenada = false;
      m.reloj = 0;
      m.viva = false;

      // Nerón: el bonus de denarios NO se acumula si lo llevan varios. Los
      // denarios son del equipo, no de cada jugador, así que sumar cuatro veces
      // el mismo gato multiplicaría por 2,4 lo que gana la partida entera por
      // una decisión que además está prohibida —no se puede repetir mascota—.
      // Se queda con el mejor por si acaso.
      if (m.def && m.def.factorDenarios) {
        factorDenarios = Math.max(factorDenarios, 1 + m.def.factorDenarios * m.factor);
      }
    }

    // Se deja escrito en MetaProgreso para que lo aplique `ganar()` una sola
    // vez, en vez de repetirlo en los tres sitios que reparten denarios.
    MetaProgreso.factorDenarios = factorDenarios;
  },

  actualizar(dt, jugadores, ctx) {
    for (let i = 0; i < jugadores.length && i < MAX; i++) {
      const j = jugadores[i];
      const m = this.activas[i];
      if (!m.def) continue;                    // este jugador no lleva mascota
      const habilidad = HABILIDADES[m.def.habilidad];

      // Un jugador caído no tiene mascota al lado: se esconde y vuelve cuando
      // le levantan. Es la lectura correcta —el bicho no se queda pegado a un
      // ataúd— y de paso impide que un caído siga haciendo daño con Karim.
      if (j.abatido) { m.viva = false; continue; }

      if (!m.viva) {                     // aparece donde esté el jugador
        m.viva = true;
        m.x = j.x; m.y = j.y;
        m.despX = 0; m.despY = 0;        // y sale hacia su sitio desde ahí
      }

      // LA ÓRBITA AVANZA CON EL PASO DE LÓGICA, no con el reloj de pared: dt es
      // fijo, así que dos partidas con la misma semilla las mueven igual. Misma
      // regla que las fases de los disparos y la sacudida de cámara.
      //
      // Y cada jugador arranca en un punto distinto del círculo —`i` reparte las
      // cuatro— para que en cooperativo no salgan las cuatro mascotas alineadas
      // como una formación.
      m.orbita += VEL_ORBITA * dt;
      const ang = m.orbita + i * (Math.PI * 2 / MAX);

      // EL SUAVIZADO VA SOBRE EL DESPLAZAMIENTO, no sobre la posición del mundo.
      //
      // Persiguiendo el punto de la órbita en coordenadas de mundo, la mascota
      // se quedaba a la zaga cuando el jugador corría: con el retraso de un
      // quinto de segundo y sesenta unidades por segundo de carrera, el bicho
      // aparecía DOCE unidades por detrás del anillo, o sea encima del jugador.
      // Medido: llegaba a taparle la mitad del sprite, justo cuando se está
      // moviendo y hace más falta verse.
      //
      // Suavizando el desplazamiento RELATIVO al jugador, la traslación del
      // jugador se traslada entera y sin retraso —el anillo va con él— y el
      // suavizado solo amortigua lo que cambia de verdad, que es el giro. Como
      // el giro es lento, la órbita conserva su tamaño y la mascota no se mete
      // en el sprite ni corriendo ni en zigzag.
      let objX = cos(ang) * ORBITA_X;
      let objY = ORBITA_CY + sen(ang) * ORBITA_Y;
      // SI EL SITIO DE LA VUELTA CAE EN UNA PARED, SE VA DETRÁS DEL JUGADOR.
      //
      // Antes se recortaba el desplazamiento hasta el muro, y con el jugador
      // pegado a la pared eso dejaba a la mascota a cero de él: encima de su
      // sprite, temblando entre "quiero ir a la pared" y "no cabo". Lo vio
      // Sergio. Ahora, si el punto de la órbita no está a la vista desde el
      // jugador, el objetivo pasa a ser un sitio libre de esta lista, por
      // orden: DETRÁS del jugador (más arriba que sus pies, que es donde el
      // sprite del jugador la tapa y donde, contra un muro al sur, siempre hay
      // hueco), el espejo del punto por el otro lado, y un poco más arriba
      // todavía. El suavizado de abajo la lleva hasta allí sin saltos.
      // Y con un muro AL NORTE no hay detrás que valga: entonces a un costado
      // —el del punto de la vuelta, o el otro—, y solo si tampoco, delante.
      // Lo que nunca: quedarse encima del jugador.
      // Y el costado que se prefiere es EN EL QUE YA ESTÁ (signo de despX): el
      // suavizado la lleva en línea recta al objetivo, y cambiar de costado
      // es pasar por encima del jugador, que es justo lo que se evita.
      if (RejillaMapa.activa && !sitioLibre(j, objX, objY)) {
        const lado = m.despX < 0 ? -1 : 1;
        // El sitio de detrás sigue el LADO DEL PUNTO DE LA VUELTA, no el de
        // la mascota: así, mientras la vuelta recorre la mitad tapada, la
        // mascota cruza de un lado a otro POR DETRÁS del jugador (a seis por
        // encima de sus pies) y sale por el lado por el que la vuelta vuelve
        // a estar libre, en vez de cruzarle por encima al salir.
        const ladoVuelta = objX < 0 ? -1 : 1;
        if (sitioLibre(j, ladoVuelta * ORBITA_X * 0.6, ORBITA_CY - ORBITA_Y)) { objX = ladoVuelta * ORBITA_X * 0.6; objY = ORBITA_CY - ORBITA_Y; }
        else if (sitioLibre(j, lado * ORBITA_X, ORBITA_CY - 2)) { objX = lado * ORBITA_X; objY = ORBITA_CY - 2; }
        else if (sitioLibre(j, lado * ORBITA_X * 0.7, ORBITA_CY + ORBITA_Y)) { objX = lado * ORBITA_X * 0.7; objY = ORBITA_CY + ORBITA_Y; }
        else if (sitioLibre(j, -lado * ORBITA_X, ORBITA_CY - 2)) { objX = -lado * ORBITA_X; objY = ORBITA_CY - 2; }
        else if (sitioLibre(j, 0, ORBITA_CY + ORBITA_Y)) { objX = 0; objY = ORBITA_CY + ORBITA_Y; }
      }
      const k = Math.min(1, SUAVIZADO * dt);
      m.despX += (objX - m.despX) * k;
      m.despY += (objY - m.despY) * k;
      // Y NUNCA ENCIMA DEL JUGADOR, venga de donde venga el camino: si el
      // suavizado la lleva a menos de DISTANCIA_MINIMA de él —pasa al cambiar
      // de sitio de un costado al otro— se la saca radialmente hasta ahí, y
      // rodea en vez de cruzar por el sprite. Con desplazamiento nulo se saca
      // hacia arriba, que es por detrás.
      {
        const d = hipot(m.despX, m.despY);
        if (d < DISTANCIA_MINIMA) {
          if (d < 0.001) { m.despX = 0; m.despY = -DISTANCIA_MINIMA; }
          else { const f = DISTANCIA_MINIMA / d; m.despX *= f; m.despY *= f; }
        }
      }
      // SIN CRUZAR PAREDES, como red por si el camino suavizado pasa por un
      // muro: se mide hasta dónde llega el tramo del jugador a su sitio y, si
      // hay pared, se queda a este lado, a un par de unidades. Se recorta el
      // DESPLAZAMIENTO y no solo la posición, para que el suavizado no la
      // empuje contra la pared en cada paso.
      if (RejillaMapa.activa) {
        const d = hipot(m.despX, m.despY);
        if (d > 0.001) {
          const libre = RejillaMapa.alcanceLibre(j.x, j.y, m.despX / d, m.despY / d, d);
          if (libre < d) {
            // Nunca a menos de 6 del jugador: antes bajaba hasta cero y la
            // mascota acababa clavada en su sprite. Si un instante roza el
            // muro mientras el suavizado la lleva a su sitio nuevo, es un
            // instante; encima del jugador era todo el rato.
            const f = Math.max(DISTANCIA_MINIMA, libre - 2) / d;
            m.despX *= f;
            m.despY *= f;
          }
        }
      }
      const antX = m.x;
      m.x = j.x + m.despX;
      m.y = j.y + m.despY;
      // Hacia dónde se mueve DE VERDAD, contando el arrastre del jugador: una
      // mascota que acompaña una carrera hacia la derecha mira a la derecha
      // aunque en ese momento le toque la mitad de atrás de la vuelta.
      const avanceX = m.x - antX;
      m.fase += dt * 3;
      // Mira hacia donde se mueve, con una zona muerta: sin ella, el temblor
      // del suavizado cuando ya está en su sitio la haría girar sin parar.
      if (avanceX > 0.05) m.mirandoDerecha = true;
      else if (avanceX < -0.05) m.mirandoDerecha = false;

      // Ciclo de la mascota, si su dibujo es un GIF. Las que siguen siendo un
      // PNG quieto tienen un solo fotograma y esto no hace nada.
      if (m.frames > 1) {
        m.relojAnim += dt;
        while (m.relojAnim >= SEG_POR_FRAME) {
          m.relojAnim -= SEG_POR_FRAME;
          m.frame = (m.frame + 1) % m.frames;
        }
      }

      if (!habilidad) continue;          // pasiva: solo se dibuja
      m.reloj -= dt;
      if (m.reloj > 0) continue;
      m.reloj = m.def.cada;
      habilidad(m.def, m, j, ctx);
    }
  },

  // Un drawImage por mascota y su sombra. El id del atlas es el de la mascota
  // con el prefijo `mascota` (ver el catálogo de procesar-assets.ps1).
  //
  // El VOLTEO sale de la copia espejada que precachea recursos.js, igual que en
  // enemigos y jugador: todos los dibujos miran a la derecha y aquí se elige
  // uno u otro según hacia dónde va el bicho, sin tocar la matriz del contexto.
  //
  // Si falta el sprite se cae a la silueta de color con la inicial, que es lo
  // que hubo mientras no había arte: una mascota invisible sería peor que un
  // círculo, porque media gracia de llevar a Karim es verlo correr al lado.
  // SE DIBUJA EN DOS PASADAS, y el motivo es de lectura, no de estética.
  //
  // Los orbitales —Scutum, Discos de sierra, Sierras votivas, Testudo— giran
  // pegados al jugador y ahí es justo donde va la mascota, así que la mascota
  // los tapaba: un escudo que desaparece detrás del perro deja de decir dónde
  // estás protegido, que es lo único que un orbital tiene que decir.
  //
  // Pasan por ENCIMA de las mascotas que pisan el suelo, que se dibujan con la
  // horda: un disco de sierra gira a la altura del pecho y el perro no. Y por
  // DEBAJO del búho y el pollito fantasma cuando estos van por delante del
  // jugador, que es cuando se ven enteros. Manda la altura del bicho.
  // LAS MASCOTAS NO SE DIBUJAN AQUÍ, se entregan al ordenador por profundidad.
  //
  // Devuelve cuántas ha dejado en `this.enOrden` para que main.js se las pase a
  // `enemigos.dibujar`, que las mezcla con la horda, los jugadores y las
  // columnas en una sola pasada ordenada por Y.
  //
  // LAS QUE VUELAN ENTRAN SOLO EN LA MITAD DE ATRÁS DE LA VUELTA.
  //
  // El búho y el pollito fantasma tienen que quedar por ENCIMA de los orbitales
  // —vuelan más alto que un escudo— y eso obliga a pintarlos al final de todo,
  // después de la horda. Pero al final de todo también se le plantan en la cara
  // al jugador cuando le pasan por detrás.
  //
  // Las dos cosas se pueden tener porque no ocurren a la vez: cada frame la
  // mascota está en una mitad de la vuelta o en la otra, así que se dibuja en
  // una pasada o en la otra, nunca en las dos.
  //
  //   - Detrás del jugador (`m.y < j.y`): entra aquí, con la horda, y el sprite
  //     del jugador la tapa. Ahí abajo pierde contra los orbitales, pero es que
  //     ahí abajo está medio escondida detrás del personaje de todas formas.
  //   - Delante: se queda para `dibujarPorEncima`, después de los orbitales.
  //
  // Las que pisan el suelo entran siempre: esas sí van por debajo de un escudo
  // que gira a la altura del pecho.
  //
  // Se ordenan por su `y` de suelo, la que persigue la órbita, no por la altura
  // a la que se dibujan: el flote es un adorno de dibujado y usarlo aquí haría
  // que el bicho cambiase de capa al subir y bajar.
  prepararOrden(jugadores) {
    let n = 0;
    for (let i = 0; i < jugadores.length && i < MAX; i++) {
      const m = this.activas[i];
      m.ordenada = false;
      if (!m.viva || !m.def) continue;
      if (m.def.vuela && m.y >= jugadores[i].y) continue;   // va por delante
      m.yVista = m.y;
      m.ordenada = true;
      this.enOrden[n++] = m;
    }
    this.nEnOrden = n;
    return n;
  },

  // Lo que no cupo en el ordenado: las voladoras que este frame van por delante
  // del jugador. Se llama después de los orbitales (ver main.js), que es lo que
  // las deja por encima de un escudo o de un disco de sierra.
  dibujarPorEncima(ctx, jugadores) {
    for (let i = 0; i < jugadores.length && i < MAX; i++) {
      const m = this.activas[i];
      if (!m.viva || !m.def || m.ordenada) continue;
      this._una(ctx, m);
    }
  },

  // Una mascota, en la posición en la que esté. No la llama nadie directamente:
  // la invoca el ordenador por profundidad, mascota a mascota, a través del
  // cierre `m.dibujar` que se prepara en `iniciar`.
  _una(ctx, m) {
    ctx.save();
    const d = m.def;
    const idAtlas = m.idAtlas;
    const meta = Recursos.meta(idAtlas);

    // SOLO FLOTAN LAS QUE VUELAN. El balanceo lo tenían las ocho, y a las que
    // andan las dejaba levitando: ya tienen su animación de patas, que es lo
    // que cuenta que caminan, y el vaivén encima las despegaba del suelo. El
    // búho y el pollito fantasma sí lo conservan, que es lo que dice que no
    // pisan (ver `vuela` en datos/mascotas.js).
    //
    // Y NINGUNA LLEVA SOMBRA. La tenían para no parecer pegadas al cristal,
    // pero no la lleva nadie más —ni los personajes ni los enemigos— así que
    // la mascota era lo único del mundo con una elipse negra debajo, y eso se
    // notaba más que el problema que resolvía.
    const y = d.vuela ? m.y + sen(m.fase) * FLOTE : m.y;

    if (meta) {
      const w0 = meta.w / ESCALA_ARTE, h0 = meta.h / ESCALA_ARTE;
      // HUNDIDA EN UN MURO, igual que su jugador (ver `dibujar` en
      // entidades/jugador.js): cuando la pared la tapa del todo se dibuja su
      // silueta con el halo del color de SU jugador, que es lo que dice de
      // quién es el bulto que se ve dentro del muro.
      const img = m.mirandoDerecha ? Recursos.imagen(idAtlas) : Recursos.espejo(idAtlas);
      if (img) {
        const w = meta.w / ESCALA_ARTE;
        const h = meta.h / ESCALA_ARTE;
        // La copia espejada está volteada FOTOGRAMA A FOTOGRAMA (ver
        // recursos.js), así que el índice vale igual en las dos y la
        // animación no corre del revés al girar.
        ctx.drawImage(img, m.frame * meta.w, 0, meta.w, meta.h,
                      m.x - w / 2, y - h, w, h);
        ctx.restore();
        return;
      }
    }

    ctx.beginPath();
    ctx.arc(m.x, y, RADIO_DIBUJO, 0, Math.PI * 2);
    ctx.fillStyle = d.color;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(8,7,10,.75)';
    ctx.stroke();
    ctx.fillStyle = 'rgba(12,10,14,.8)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 6px sans-serif';
    ctx.fillText(d.inicial, m.x, y + 0.5);
    ctx.restore();
  },

};

// --- Habilidades activas -----------------------------------------------------
// Firma común (def, mascota, jugador, ctx). `ctx` trae lo que haga falta del
// mundo: enemigos, zonas y el rng. Añadir una mascota que reutilice una de
// estas es añadir una entrada en datos/mascotas.js y nada más.
// `m.factor` es cuanto rinde su NIVEL (1 al nivel 1, 2 al nivel 5). Se aplica
// aqui, sobre el numero que define a cada mascota, y no en los datos: los datos
// dicen cuanto hace la mascota, no cuanto la ha mejorado este jugador.
const HABILIDADES = {
  // KARIM: muerde al más cercano. Daño directo y sin proyectil — la mordida se
  // resuelve en el sitio, así que no gasta pool de proyectiles ni puede fallar.
  morder(def, m, j, ctx) {
    const presa = enemigoMasCercano(ctx.enemigos, m.x, m.y, def.alcance);
    if (!presa) { m.reloj = 0.3; return; }   // sin blanco, reintenta pronto
    let dx = presa.x - m.x;
    let dy = presa.y - m.y;
    const dist = hipot(dx, dy) || 1;
    // La mordida se le apunta a SU jugador: la mascota es suya, y lo que
    // mata cuenta para él.
    ctx.enemigos.danyar(presa, Math.round(def.danyo * m.factor), dx / dist, dy / dist, 60, j);
    // Se teletransporta a la presa: es un perro lanzándose, y verlo aparecer
    // junto al bicho al que acaba de morder vende el gesto sin animarlo.
    m.x = presa.x - dx / dist * 8;
    m.y = presa.y - dy / dist * 8;
  },

  // CLEOPATRA: cura una cantidad fija. No pone un objeto en el suelo que haya
  // que ir a recoger —eso ya lo hacen los consumibles del director— sino que
  // cura a SU jugador: una mascota que te obliga a ir a por lo que te da no se
  // siente como una mascota, se siente como otro recogible.
  huevo(def, m, j, ctx) {
    if (j.vida >= j.vidaMaxima) { m.reloj = 1.5; return; }   // reintenta pronto
    const cura = Math.round(def.cura * m.factor);
    j.vida = Math.min(j.vidaMaxima, j.vida + cura);
    VFX.numero(j.x, j.y - 22, cura, ctx.rng);
  },

  // OREO: denarios directos al bolsillo. No caen al suelo por lo mismo que el
  // huevo, y porque un denario tirado en el minuto 20 no lo recoge nadie.
  escarbar(def, m, j, ctx) {
    MetaProgreso.ganar(Math.round(def.denarios * m.factor));
  },

  // POLLITO: los de alrededor salen huyendo un rato. No hace daño: abre hueco,
  // que con la horda encima vale más que matar a cuatro.
  //
  // El búfer de índices está preasignado arriba, no se crea uno por chillido:
  // esto puede dispararse con la pantalla llena.
  espantar(def, m, j, ctx) {
    const n = enemigosEnRadio(ctx.enemigos, m.x, m.y, def.radio * m.factor, BUFER);
    for (let i = 0; i < n; i++) ctx.enemigos.espantar(BUFER[i], def.duracion * m.factor);
    VFX.sacudir(1.5);
  }
};
