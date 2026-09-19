import { nuevoSello } from '../entidades/proyectil.js';
import { DT } from '../core/constantes.js';
import { hipot } from '../core/mate.js';
import { RejillaMapa } from './rejillaMapa.js';

// Colisiones sobre la rejilla espacial. Dos consumidores:
//   - separacion()      enemigo <-> enemigo, para que no se apilen en un punto
//   - contactoJugador() enemigo <-> jugador, daño por contacto
//
// Ambos leen la MISMA rejilla, construida una sola vez por paso de lógica.

// La separación es una RESTRICCIÓN POSICIONAL, no una fuerza.
//
// Primero se intentó como fuerza sumada a la velocidad y no funciona: la
// persecución tira siempre a tope hacia el jugador y el empuje solo aparece
// cuando ya hay solape, así que el montón se comprime hasta que ambos se
// igualan. Peor aún, dentro de un amontonamiento simétrico los empujes de todos
// los lados se cancelan y el que está en el centro no tiene a dónde ir. Con 500
// serpientes eso daba 2.354 pares gravemente solapados y una distancia mínima de
// 0,34px: literalmente unos dentro de otros.
//
// Como restricción no hay equilibrio de fuerzas que negociar: si dos siluetas se
// solapan, se separan y punto. La persecución puede empujar todo lo que quiera.
// El resultado es el muro de cuerpos del género: los de atrás no llegan al
// jugador porque los de delante ocupan el sitio.

// Fracción del solape que se corrige por paso.
//
// Las correcciones acumuladas se dividen por la RAÍZ del número de contactos.
// No es un número elegido a ojo: con 500 enemigos asentados alrededor del
// jugador, midiendo qué porcentaje de pasos invierte cada enemigo su dirección
// de movimiento (que es exactamente lo que se ve como vibración) sale
//
//   divisor 1 (sumar)      98,9% de pasos invertidos, 2,55px por paso  <- vibra
//   divisor raiz(c)         9,6%                      0,05px
//   divisor c (promediar)   5,7%                      0,11px
//
// Sumar sobrecorrige: un enemigo con doce vecinos recibe doce correcciones
// completas, se pasa de largo, al paso siguiente le corrigen en sentido
// contrario y vuelta a empezar, 60 veces por segundo. Promediar estabiliza pero
// se queda tan corto que deja de separar (la distancia mínima entre bichos cae
// a 0,08px y los pares solapados se multiplican por quince). La raíz da lo
// mejor de ambos: se asienta Y separa mejor que sumando (distancia mínima 3,76
// frente a 1,40).
const RELAJACION = 0.8;

// Tope del desplazamiento por paso, en px lógicos. Un enemigo en el centro de un
// apelotonamiento recibe la suma de veinte correcciones y sin tope saldría
// disparado a la otra punta del mapa.
const MAX_CORRECCION = 4;

// Pasadas del solucionador por paso de lógica. Es la palanca directa entre "no
// se solapan" y coste de CPU: con los valores por defecto son cinco pasadas
// sobre la lista de pares cercanos (ver `juntarPares`, que es quien la arma en
// un único recorrido de la rejilla).
//
// Ajustables en caliente desde la consola (`window.EMERITA.ajustes`) para poder
// medir su coste real en una máquina concreta, que es algo que no se puede
// deducir a ojo. Bajar `pasadasDuras` a 1 y `iteraciones` a 1 corta el trabajo
// de separación a la quinta parte, a cambio de que se interpenetren más.
export const ajustes = {
  iteraciones: 2,      // pasadas blandas, reparten la multitud
  pasadasDuras: 3      // pasadas duras, garantizan que no se solapen
};

// El daño por contacto alcanza un poco más lejos que el cuerpo sólido. Sin este
// margen, los enemigos quedarían empujados a exactamente el borde y el golpe
// entraría o no según el último bit del cálculo en coma flotante. Con el 10%,
// el que está pegado a ti te hace daño siempre.
const MARGEN_DANYO = 1.10;

// Acumula la corrección de un par. El chequeo va SIEMPRE con distancias al
// cuadrado; la raíz solo se paga en los pares que de verdad se solapan, y hace
// falta para tener la dirección.
//
// Acumular y aplicar al final (Jacobi) en vez de mover dentro del bucle
// (Gauss-Seidel): el segundo converge antes, pero hace que el resultado dependa
// del orden en que la rejilla visita las celdas, y ese orden cambia cuando el
// pool intercambia posiciones al reciclar. Mismo estado, distinto resultado.
function empujar(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const r = a.radioSep + b.radioSep;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;

  let nx, ny, solape;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    solape = r - d;              // en px, no normalizado: es una distancia
  } else {
    // Exactamente encima: cualquier dirección vale, pero tiene que ser siempre
    // la misma o el par vibraría. Determinista, que es el criterio 10.
    nx = 1; ny = 0; solape = r;
  }

  // Reparto por masa: el ligero cede. Un cíclope (masa 8) contra una serpiente
  // (masa 1) apenas se aparta y es la serpiente la que rodea.
  //
  // Dos inmunes al empuje (invMasa 0 los dos, ver entidades/enemigo.js) dan
  // total 0: sin esta salida sería una división por cero. Es un caso raro
  // —dos jefes solapados— pero posible si Cerbero sigue vivo cuando entra la
  // Loba, y no hay nada sensato que repartir entre dos cuerpos que ninguno de
  // los dos va a ceder.
  const total = a.invMasa + b.invMasa;
  if (total <= 0) return;   // los dos son inamovibles: no hay nada que repartir
  const corr = solape * RELAJACION;
  const ca = (corr * a.invMasa) / total;
  const cb = (corr * b.invMasa) / total;

  a.sepX -= nx * ca;
  a.sepY -= ny * ca;
  b.sepX += nx * cb;
  b.sepY += ny * cb;
  a.contactos++;
  b.contactos++;
}

// Resuelve una penetración REAL de los círculos de colisión, al instante y al
// 100%. Es el segundo escalón, y es el que garantiza el invariante duro: dos
// cuerpos no ocupan el mismo sitio, nunca.
//
// La separación blanda de arriba trabaja sobre `radioSep` (radio x 1.6) y es
// quien reparte la multitud, pero como se relaja y se promedia siempre deja un
// residuo: medido, 114 pares interpenetrados con hasta 4,73px de solape. Esta
// pasada los corrige de golpe.
//
// Aquí sí se mueve dentro del bucle (Gauss-Seidel) en vez de acumular: no hay
// riesgo de oscilación porque solo actúa sobre los que de verdad se solapan, que
// son pocos, y así una sola pasada basta.
function separarDuro(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const r = a.radioCuerpo + b.radioCuerpo;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return;

  let nx, ny, pen;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    nx = dx / d;
    ny = dy / d;
    pen = r - d;
  } else {
    nx = 1; ny = 0; pen = r;
  }

  // Un congelado por el Reloj cuenta como INAMOVIBLE: masa inversa cero, igual
  // que una antorcha. Aparta a quien le empuje pero no cede un píxel, que es lo
  // que hace que el bloque de hielo se quede clavado los doce segundos.
  const ma = a.paralizado > 0 ? 0 : a.invMasa;
  const mb = b.paralizado > 0 ? 0 : b.invMasa;
  const total = ma + mb;
  if (total <= 0) return;   // dos inamovibles solapados: nada que repartir (ver empujar)
  const ca = (pen * ma) / total;
  const cb = (pen * mb) / total;
  a.x -= nx * ca;
  a.y -= ny * ca;
  b.x += nx * cb;
  b.y += ny * cb;
}

// --- LA LISTA DE PARES CERCANOS ---------------------------------------------
//
// La rejilla se recorría CINCO VECES por paso —dos pasadas blandas y tres
// duras— y cada recorrido volvía a generar los mismos pares desde cero. Medido
// con 811 enemigos en el minuto 15:
//
//   29.254 pares candidatos por recorrido  x5 = 146.270 visitas por paso
//    4.137 de ellos (14%) lo bastante cerca para que la cuenta sirva de algo
//    1.857 solapados de verdad en separación, 388 en cuerpo
//
// O sea que el 86% del trabajo era mirar parejas que estaban lejos, y encima
// se miraba cinco veces. En el perfil de CPU eso era el 78% de la lógica.
//
// Ahora la rejilla se recorre UNA vez, se apuntan los pares que están cerca, y
// las cinco pasadas van sobre esa lista. Mismo resultado y una quinta parte del
// recorrido: 29.254 + 5x4.137 = 49.939 visitas en vez de 146.270.
//
// SE GUARDAN ÍNDICES DEL POOL, no objetos: los índices no cambian durante la
// separación —el pool no se reordena hasta `retirarMuertos`, que va mucho
// después— y así no se asigna un solo objeto. Dos Int32Array preasignados, como
// la propia rejilla.
//
// Y EN EL MISMO ORDEN en que los visitaba el recorrido. No es un detalle: la
// pasada dura es Gauss-Seidel —mueve dentro del bucle— así que el resultado
// depende del orden de los pares. Manteniéndolo, la partida sale exactamente
// igual que antes, bit a bit (comprobado con la huella de 3600 fotogramas).
const MAX_PARES = 32000;
const paresA = new Int32Array(MAX_PARES);
const paresB = new Int32Array(MAX_PARES);
let nPares = 0;

// Cuánto puede acercarse un par DURANTE las pasadas, y por tanto cuánto margen
// hay que dejar al apuntar la lista.
//
// Ni `empujar` ni `separarDuro` acercan a nadie: los dos separan. Lo único que
// puede meter a dos enemigos el uno hacia el otro es la corrección que cada uno
// recibe de SUS OTROS vecinos, y esa está topada a MAX_CORRECCION por pasada
// blanda y por cuerpo: dos cuerpos por dos pasadas son 16 px. Los ocho de
// propina cubren lo que puede mover una pasada dura, que solo actúa sobre los
// pocos que ya están solapados —y esos ya están en la lista.
//
// SE CALCULA CON LAS ITERACIONES DE VERDAD y no con un 2 escrito aquí, porque
// `ajustes.iteraciones` se toca en caliente desde la consola para medir su
// coste. Con el 2 fijo, subirlo a cuatro dejaba el margen a la mitad de lo que
// hacía falta y la separación empezaba a perder pares sin que nada avisara.
//
// El techo lo pone la rejilla, no este número: la consulta de media vecindad
// encuentra pares hasta 64 px (ver CELDA en core/rejilla.js), así que pedir más
// margen del que cabe ahí no añade nada. Con los valores por defecto son 24, y
// el par más exigente del bestiario —dos cíclopes— se toca a 44,8.
function margenPar() {
  return 2 * MAX_CORRECCION * ajustes.iteraciones + 8;
}

// Recorre cada par de enemigos vecinos EXACTAMENTE UNA VEZ y apunta los que
// están cerca.
//
// El filtro va ESCRITO A MANO dentro de los dos bucles en vez de en una función
// `anotar(a, b)` compartida, y no es por gusto: así la posición y el radio de
// `a` se leen UNA VEZ POR FILA en vez de una vez por par. Son tres lecturas de
// propiedad menos en las 29.000 parejas que se miran por paso, y en el perfil
// esa función suelta salía al 7,6% ella sola.
function juntarPares(items, rejilla) {
  let n = 0;                       // local: `nPares` es de módulo y se paga
  const MARGEN_PAR = margenPar();  // una vez por paso, no por par
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  // MEDIA vecindad. Con las 9 celdas cada par se visitaría dos veces; mirando
  // solo derecha, abajo-izquierda, abajo y abajo-derecha (más la propia celda
  // con q > p) cada par sale exactamente una vez y el trabajo se reduce a la
  // mitad, tanto en recorrido como en cuentas.
  for (let cy = 0; cy < filas; cy++) {
    const ultimaFila = cy === filas - 1;
    for (let cx = 0; cx < columnas; cx++) {
      const c = cy * columnas + cx;
      const ini = inicio[c];
      const fin = inicio[c + 1];
      if (ini === fin) continue;

      // Pares dentro de la propia celda
      for (let p = ini; p < fin; p++) {
        const ia = indices[p];
        const a = items[ia];
        const ax = a.x, ay = a.y, ar = a.radioSep + MARGEN_PAR;
        for (let q = p + 1; q < fin; q++) {
          const ib = indices[q];
          const b = items[ib];
          const dx = b.x - ax;
          const dy = b.y - ay;
          const r = ar + b.radioSep;
          if (dx * dx + dy * dy > r * r || n >= MAX_PARES) continue;
          paresA[n] = ia;
          paresB[n] = ib;
          n++;
        }
      }

      // Derecha
      if (cx + 1 < columnas) {
        const d = c + 1;
        n = paresEntre(items, indices, ini, fin, inicio[d], inicio[d + 1], n);
      }
      if (ultimaFila) continue;

      const base = c + columnas;
      // Abajo-izquierda, abajo, abajo-derecha
      if (cx > 0)            n = paresEntre(items, indices, ini, fin, inicio[base - 1], inicio[base], n);
      n = paresEntre(items, indices, ini, fin, inicio[base], inicio[base + 1], n);
      if (cx + 1 < columnas) n = paresEntre(items, indices, ini, fin, inicio[base + 1], inicio[base + 2], n);
    }
  }
  nPares = n;
}

// Todos los pares entre dos celdas distintas. Devuelve cuántos van apuntados.
//
// El tope de MAX_PARES no se alcanza jugando —son 32 vecinos cercanos por
// enemigo con el pool lleno, y un cuerpo sólido no admite ni la mitad a su
// alrededor— pero se comprueba igual: es lo que garantiza que nunca se escriba
// fuera del array si algún día crece el bestiario.
function paresEntre(items, indices, iniA, finA, iniB, finB, n) {
  const MARGEN_PAR = margenPar();
  for (let p = iniA; p < finA; p++) {
    const ia = indices[p];
    const a = items[ia];
    const ax = a.x, ay = a.y, ar = a.radioSep + MARGEN_PAR;
    for (let q = iniB; q < finB; q++) {
      const ib = indices[q];
      const b = items[ib];
      const dx = b.x - ax;
      const dy = b.y - ay;
      const r = ar + b.radioSep;
      if (dx * dx + dy * dy > r * r || n >= MAX_PARES) continue;
      paresA[n] = ia;
      paresB[n] = ib;
      n++;
    }
  }
  return n;
}

// Las dos pasadas, cada una sobre la lista.
//
// Son dos funciones y no una con la función como parámetro, y esa es la
// segunda mitad de la optimización: con un solo destino posible, el motor
// puede meter `empujar` y `separarDuro` dentro del bucle (monomórfico). Con el
// parámetro, cada par pagaba una llamada indirecta que no se puede inlinear —
// eran 146.270 llamadas por paso.
function pasadaBlanda(items) {
  for (let i = 0; i < nPares; i++) empujar(items[paresA[i]], items[paresB[i]]);
}

function pasadaDura(items) {
  for (let i = 0; i < nPares; i++) separarDuro(items[paresA[i]], items[paresB[i]]);
}

// Vuelca lo acumulado sobre las posiciones.
function aplicarCorrecciones(items, n) {
  for (let k = 0; k < n; k++) {
    const e = items[k];
    const c = e.contactos;
    if (c === 0) continue;
    // Congelado por el Reloj: inmóvil de verdad. Sigue sumando su parte a los
    // vecinos —es un cuerpo y ocupa sitio— pero no se mueve él. Sin esto, una
    // horda amontonada seguía deshaciéndose sola durante los doce segundos y el
    // bloque de hielo se veía respirar, que es justo lo contrario de lo que
    // tiene que contar una parada del tiempo.
    if (e.paralizado > 0) continue;

    const div = Math.sqrt(c);
    let cx = e.sepX / div;
    let cy = e.sepY / div;
    const m2 = cx * cx + cy * cy;
    if (m2 > MAX_CORRECCION * MAX_CORRECCION) {
      const inv = MAX_CORRECCION / Math.sqrt(m2);
      cx *= inv;
      cy *= inv;
    }
    e.x += cx;
    e.y += cy;
  }
}

// Ningún enemigo puede ACERCARSE al jugador más rápido de lo que anda, pase lo
// que pase con la multitud.
//
// Sin esto, los de atrás empujan a los de delante y la primera línea avanza más
// deprisa que su propia velocidad: medido con 500 enemigos, serpientes de 68
// px/s llegaban a 83,6 y el jugador (85) no lograba despegarse ni un píxel en
// cinco segundos de huida. La horda entera corría más que el bicho más rápido
// que la compone.
//
// Se recorta SOLO la componente que apunta al jugador. De lado y hacia fuera la
// multitud sigue empujando todo lo que necesite, que es lo que deshace los
// amontonamientos.
function topeAcercamiento(items, n) {
  for (let k = 0; k < n; k++) {
    const e = items[k];
    if (e.contactos === 0) continue;     // sin vecinos nadie le ha empujado
    // Se recorta el acercamiento a SU objetivo, el mismo que eligió al moverse.
    const obj = e.objetivo;
    if (!obj) continue;

    let hx = obj.x - e.xPrev;
    let hy = obj.y - e.yPrev;
    const h2 = hx * hx + hy * hy;
    if (h2 < 0.0001) continue;
    const invH = 1 / Math.sqrt(h2);
    hx *= invH;
    hy *= invH;

    const avance = (e.x - e.xPrev) * hx + (e.y - e.yPrev) * hy;
    const tope = e.velocidad * DT;
    if (avance > tope) {
      const exceso = avance - tope;
      e.x -= hx * exceso;
      e.y -= hy * exceso;
    }
  }
}

// El jugador es un cuerpo SÓLIDO que aparta, y al que nadie aparta.
//
// La asimetría es deliberada y es lo único que hace jugable tener cuerpos
// sólidos en este género. Si el empuje fuera mutuo, quedar rodeado sería una
// sentencia: no podrías atravesar el muro de cuerpos ni retroceder. Apartando
// tú a ellos, te abres paso a tu velocidad y ellos ceden, que es como se siente
// caminar entre una multitud.
//
// Se resuelve al 100%, sin relajación: aquí no hay riesgo de oscilación porque
// es uno contra uno, no una red de restricciones, y el jugador NO puede quedar
// penetrado ni un frame o se vería el solape.
function apartarDelJugador(items, rejilla, jugador) {
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;
  const jx = jugador.x;
  const jy = jugador.y;

  const cx = rejilla.columnaDe(jx);
  const cy = rejilla.filaDe(jy);

  for (let fy = cy - 1; fy <= cy + 1; fy++) {
    if (fy < 0 || fy >= filas) continue;
    for (let fx = cx - 1; fx <= cx + 1; fx++) {
      if (fx < 0 || fx >= columnas) continue;
      const c = fy * columnas + fx;
      for (let p = inicio[c]; p < inicio[c + 1]; p++) {
        const e = items[indices[p]];
        // CONGELADO POR EL RELOJ DE EMERITA: SE ATRAVIESA.
        //
        // Mientras dura la parada, un enemigo deja de ser un cuerpo: ni empuja
        // ni se le empuja, se le cruza por encima. Sin esto el Reloj no sacaba
        // de un cerco —los cuerpos seguían siendo pared y quedabas encajado
        // igual, solo que en silencio—, y sacar de un cerco es exactamente
        // para lo que existe. El daño por contacto se apaga en el mismo sitio
        // en el que se mide (ver contactoJugador).
        if (e.paralizado > 0) continue;
        // POSEÍDO POR EL LIBRO DE LAS SOMBRAS: tampoco muerde, por el mismo
        // motivo que el congelado. Está de tu bando durante cinco segundos —va a
        // por los suyos y les pega (ver el bloque de `poseido` en
        // entidades/enemigo.js)— así que morderte mientras tanto contaría lo
        // contrario de lo que hace el objeto.
        //
        // Y es la otra mitad de que no se le pueda matar: si fuera intocable Y
        // siguiera haciéndote daño al rozarlo, el Libro te habría plantado en
        // medio de la horda un bicho invencible que te muerde. Las dos reglas
        // van juntas o ninguna.
        if (e.poseido > 0) continue;
        const dx = e.x - jx;
        const dy = e.y - jy;
        const r = jugador.radioCuerpo + e.radioCuerpo;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;

        // LAS ANTORCHAS NO SE MUEVEN: se aparta el JUGADOR.
        //
        // Son decoración con vida (`esObjeto`, ver datos/enemigos.js) y ya están
        // marcadas como inamovibles —masa 999 e `inmuneEmpuje`— así que ni la
        // horda ni un golpe las desplazan. Faltaba este sitio: el jugador las
        // empujaba por delante como si arrastrara una farola, que es lo que vio
        // Sergio. Ahora se resuelve al revés, igual que contra una columna.
        //
        // El invariante de arriba se mantiene: sigue sin haber penetración, solo
        // cambia cuál de los dos cuerpos cede.
        const inamovible = e.def.esObjeto;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const f = (r - d) / d;         // escala el propio delta, sin normalizar
          if (inamovible) {
            jugador.x -= dx * f;
            jugador.y -= dy * f;
          } else {
            e.x += dx * f;
            e.y += dy * f;
          }
        } else if (inamovible) {
          jugador.x -= r;
        } else {
          e.x += r;                      // justo encima: sale por la derecha
        }
      }
    }
  }
}

// Un obstáculo del escenario (columna, antorcha, estatua, ruina) es, para la
// física, exactamente lo que es el jugador en `apartarDelJugador`: un cuerpo
// fijo que aparta y al que nadie aparta. Se factoriza en una función propia
// porque aquí el "fijo" cambia entre obstáculo y obstáculo, mientras que
// `apartarDelJugador` siempre gira alrededor de un jugador concreto.
// Radio de cuerpo del enemigo más grande del bestiario, para dimensionar el
// barrido de rejilla contra obstáculos. No hace falta que sea exacto: pasarse
// solo cuesta mirar alguna celda de más, y quedarse corto es perder empujones.
const MAYOR_CUERPO = 20;

// CAJA Y NO CÍRCULO NI ELIPSE. La huella de un obstáculo sale de su dibujo (ver
// sistemas/obstaculos.js) y ha pasado por las tres formas, así que conviene
// dejar escrito por qué se descartaron las dos primeras:
//
//   CÍRCULO. Un solo radio no puede describir a la vez una columna —26x80,
//     estrecha y alta, de la que solo estorba el pie— y unas ruinas —124x110,
//     un montón de escombro sólido de punta a punta—. Había que elegir, ganaba
//     el número pequeño, y las ruinas quedaban con un círculo en la base por el
//     que se colaba todo el mundo.
//
//   ELIPSE. Arregla lo anterior, pero una elipse INSCRITA en la caja del dibujo
//     solo cubre el 78% de su área: se dejaba las cuatro esquinas libres y un
//     10% del ancho. En un montón de escombro que llena casi su recuadro, eso
//     son cuatro bocas por las que meterse — que es justo lo que se veía.
//
//   CAJA. Cubre el recuadro entero, esquinas incluidas, y es lo que de verdad
//     significa "sólido".
//
// Es choque de CÍRCULO contra CAJA, resuelto por el punto de la caja más
// cercano al centro de la entidad: así el empuje sale por la normal correcta
// también en las esquinas, en vez de dar el salto que daría comparar ejes.
function empujarFueraDe(e, ox, oy, hx, hy) {
  const r = e.radioCuerpo;
  const dx = e.x - ox;
  const dy = e.y - oy;

  // Punto de la caja más próximo, en coordenadas relativas al centro.
  const px = dx < -hx ? -hx : (dx > hx ? hx : dx);
  const py = dy < -hy ? -hy : (dy > hy ? hy : dy);
  const sx = dx - px, sy = dy - py;
  const d2 = sx * sx + sy * sy;

  if (d2 > 0.000001) {
    if (d2 >= r * r) return;             // fuera de la caja y sin tocarla
    const d = Math.sqrt(d2);
    const f = (r - d) / d;
    e.x += sx * f;
    e.y += sy * f;
    return;
  }

  // CENTRO DENTRO DE LA CAJA. Aquí no hay normal que seguir, así que se sale
  // por el lado más cercano. Importa que sea el más cercano y no uno fijo: al
  // rozar un canto, empujar hacia el lado equivocado cruzaría la entidad por
  // dentro del obstáculo y saldría disparada por el otro extremo.
  const izq = dx + hx + r;
  const der = hx - dx + r;
  const arr = dy + hy + r;
  const aba = hy - dy + r;
  let m = izq;
  if (der < m) m = der;
  if (arr < m) m = arr;
  if (aba < m) m = aba;
  if (m === izq)      e.x -= izq;
  else if (m === der) e.x += der;
  else if (m === arr) e.y -= arr;
  else                e.y += aba;
}

// LOS OBSTÁCULOS CONTRA LOS PROYECTILES QUE CORREN POR EL SUELO.
//
// Una bala atraviesa una columna y a nadie le extraña: va por el aire y dura un
// suspiro. El Osito Dinamito no —corre con sus patas por la misma calzada que
// todo el mundo—, y pasar por dentro de una ruina lo delata como lo que sería:
// un dibujo moviéndose sobre el fondo. Sergio pidió que se comporte como un
// jugador o un enemigo, y esto es lo que eso significa en el motor.
//
// Solo los que PERSIGUEN. El resto de proyectiles siguen volando: cambiarles
// eso a los cincuenta y nueve restantes no se pidió y rompería armas enteras
// —la Ballesta dispara por encima de las ruinas a propósito—.
//
// Y no basta con empujarlos fuera: al chocar se les quita la componente de
// velocidad contra la pared y se quedan con la tangente, o sea que RESBALAN por
// el canto en vez de encallar contra él. Es lo mismo que hace un jugador contra
// una columna, solo que a él lo sigue empujando su mando y aquí no hay mando.
export function colisionarObstaculosProyectiles(obstaculos, proyectiles) {
  const obs = obstaculos.items;
  const nObs = obstaculos.activos;
  if (nObs === 0) return;
  const items = proyectiles.pool.items;
  const n = proyectiles.pool.activos;

  for (let k = 0; k < n; k++) {
    const p = items[k];
    if (p.persigue <= 0) continue;
    const r = p.radio > 0 ? p.radio : 1;

    for (let i = 0; i < nObs; i++) {
      const o = obs[i];
      const dx = p.x - o.cx;
      const dy = p.y - o.cy;
      // Descarte rápido por caja ampliada: la mayoría de los pares no se tocan
      // y esto se pregunta por cada osito y cada obstáculo en cada paso.
      if (dx > o.hx + r || dx < -o.hx - r || dy > o.hy + r || dy < -o.hy - r) continue;

      const px = dx < -o.hx ? -o.hx : (dx > o.hx ? o.hx : dx);
      const py = dy < -o.hy ? -o.hy : (dy > o.hy ? o.hy : dy);
      let sx = dx - px, sy = dy - py;
      const d2 = sx * sx + sy * sy;

      if (d2 > 0.000001) {
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        const f = (r - d) / d;
        p.x += sx * f;
        p.y += sy * f;
        sx /= d; sy /= d;
      } else {
        // Centro dentro de la caja: se sale por el lado más cercano, igual que
        // `empujarFueraDe`. Pasa cuando un osito nace pegado a una piedra.
        const izq = dx + o.hx + r, der = o.hx - dx + r;
        const arr = dy + o.hy + r, aba = o.hy - dy + r;
        let m = izq; if (der < m) m = der; if (arr < m) m = arr; if (aba < m) m = aba;
        if (m === izq)      { p.x -= izq; sx = -1; sy = 0; }
        else if (m === der) { p.x += der; sx =  1; sy = 0; }
        else if (m === arr) { p.y -= arr; sx =  0; sy = -1; }
        else                { p.y += aba; sx =  0; sy =  1; }
      }

      // Y a resbalar: fuera la parte de la velocidad que empuja contra la
      // pared, se conserva la que va a lo largo de ella. Si el choque es
      // frontal y no queda tangente, se le da la vuelta para que no se quede
      // temblando contra el canto.
      const vn = p.vx * sx + p.vy * sy;
      if (vn < 0) {
        let tx = p.vx - vn * sx;
        let ty = p.vy - vn * sy;
        const t = Math.sqrt(tx * tx + ty * ty);
        if (t > 0.001) {
          const v = p.rapidez > 0 ? p.rapidez : Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          p.vx = (tx / t) * v;
          p.vy = (ty / t) * v;
        } else {
          p.vx = -p.vx;
          p.vy = -p.vy;
        }
      }
    }
  }
}

// Objetos sólidos del escenario contra jugadores y enemigos. Los obstáculos
// son pocos y estáticos (sistemas/obstaculos.js), así que no llevan rejilla
// propia: contra los jugadores (como mucho 4) se compara directo, y contra
// los enemigos se reutiliza la rejilla que YA construyó `main.js` para este
// paso, con la misma consulta 3x3 de `apartarDelJugador`.
export function colisionarObstaculos(obstaculos, jugadores, enemigos) {
  const items = obstaculos.items;
  const n = obstaculos.activos;
  if (n === 0) return;

  const rejilla = enemigos.rejilla;
  const enemItems = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  for (let k = 0; k < n; k++) {
    const o = items[k];

    // `o.cy` es el centro de la HUELLA, que no es la posición del obstáculo:
    // su `y` es la línea donde se apoya el dibujo, y la huella sube desde ahí.
    for (let i = 0; i < jugadores.length; i++) {
      empujarFueraDe(jugadores[i], o.cx, o.cy, o.hx, o.hy);
    }

    // EL BARRIDO SALE DEL TAMAÑO DE LA HUELLA, no de una vecindad 3x3 fija.
    //
    // La celda mide 64 y el 3x3 garantiza alcanzar 64 unidades desde el centro,
    // que sobraba cuando el mayor obstáculo era una columna. Unas ruinas tienen
    // 56 de semieje y el enemigo más gordo 14 de cuerpo: 70, más de lo que el
    // 3x3 asegura. El fallo habría sido de los que no se ven —un bicho suelto
    // colándose por una esquina de vez en cuando— así que se calcula el rango
    // en vez de confiar en que quepa.
    const alcanceX = o.hx + MAYOR_CUERPO;
    const alcanceY = o.hy + MAYOR_CUERPO;
    const fx0 = rejilla.columnaDe(o.cx - alcanceX);
    const fx1 = rejilla.columnaDe(o.cx + alcanceX);
    const fy0 = rejilla.filaDe(o.cy - alcanceY);
    const fy1 = rejilla.filaDe(o.cy + alcanceY);
    for (let fy = fy0; fy <= fy1; fy++) {
      if (fy < 0 || fy >= filas) continue;
      for (let fx = fx0; fx <= fx1; fx++) {
        if (fx < 0 || fx >= columnas) continue;
        const c = fy * columnas + fx;
        for (let p = inicio[c]; p < inicio[c + 1]; p++) {
          empujarFueraDe(enemItems[indices[p]], o.cx, o.cy, o.hx, o.hy);
        }
      }
    }
  }
}

// Ataúdes: el sitio donde ha caído un jugador es SÓLIDO, ni se pisa ni se
// atraviesa. Misma resolución que un obstáculo del escenario, pero aparte
// porque estos aparecen y desaparecen durante la partida y son cuatro como
// mucho, así que ni pool ni rejilla propia: se recorre la lista de jugadores.
//
// El propio caído no se empuja a sí mismo —se quedaría vibrando dentro de su
// ataúd— y tampoco se empuja a otro caído: dos ataúdes juntos no tienen por qué
// separarse, y hacerlo los movería del sitio donde murieron, que es justo la
// información que da un ataúd.
//
// RADIO_ATAUD sale del sprite. Al subir los ataúdes a 34 de alto para que no
// se emborronaran (ver el catálogo de procesar-assets.ps1) pasaron a medir 96
// físicos de ancho, o sea 24 lógicos: la mitad son 12.
//
// Se queda en 10, algo por debajo, porque la caja del sprite incluye cosas que
// sobresalen y no son madera —la bufanda de Eric por la derecha, el balón por
// abajo— y empujar desde ahí se notaría como un obstáculo invisible. 10 cubre
// el cuerpo del ataúd, que es lo que se ve sólido.
const RADIO_ATAUD = 10;

export function colisionarAtaudes(jugadores, enemigos) {
  const rejilla = enemigos.rejilla;
  const enemItems = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  for (let k = 0; k < jugadores.length; k++) {
    const caido = jugadores[k];
    if (!caido.abatido) continue;

    for (let i = 0; i < jugadores.length; i++) {
      if (i === k || jugadores[i].abatido) continue;
      empujarFueraDe(jugadores[i], caido.x, caido.y, RADIO_ATAUD, RADIO_ATAUD);
    }

    const cx = rejilla.columnaDe(caido.x);
    const cy = rejilla.filaDe(caido.y);
    for (let fy = cy - 1; fy <= cy + 1; fy++) {
      if (fy < 0 || fy >= filas) continue;
      for (let fx = cx - 1; fx <= cx + 1; fx++) {
        if (fx < 0 || fx >= columnas) continue;
        const c = fy * columnas + fx;
        for (let p = inicio[c]; p < inicio[c + 1]; p++) {
          empujarFueraDe(enemItems[indices[p]], caido.x, caido.y, RADIO_ATAUD, RADIO_ATAUD);
        }
      }
    }
  }
}

export function separacion(enemigos, jugadores) {
  const pool = enemigos.pool;
  const items = pool.items;
  const n = pool.activos;

  // Varias pasadas del solucionador. Con una sola quedaban 1.507 pares
  // solapados: la persecución mete a los enemigos unos dentro de otros cada
  // paso y una única corrección parcial no llega a deshacerlo. Cada pasada
  // adicional recorre los pares otra vez sobre las posiciones ya corregidas.
  //
  // La rejilla se construyó antes y NO se reconstruye entre pasadas: cada una
  // mueve 4px como mucho, y entre el alcance real de un par (44,8 con dos
  // cíclopes) y los 64 que cubre la consulta 3x3 hay 19px de holgura de sobra.
  // Por lo mismo la lista de pares se arma una vez y vale para las cinco.
  const rejilla = enemigos.rejilla;

  // UN SOLO RECORRIDO DE LA REJILLA para las cinco pasadas. Ver la cabecera de
  // `juntarPares`: los pares no cambian entre pasadas —la rejilla tampoco se
  // reconstruye— así que volver a generarlos cinco veces era trabajo repetido.
  juntarPares(items, rejilla);

  for (let iter = 0; iter < ajustes.iteraciones; iter++) {
    for (let k = 0; k < n; k++) {
      const e = items[k];
      e.sepX = 0;
      e.sepY = 0;
      e.contactos = 0;
    }
    pasadaBlanda(items);
    aplicarCorrecciones(items, n);
  }

  // El ORDEN de lo que viene importa, y se descubrió midiendo: con la pasada
  // dura antes del tope y del empuje del jugador, esos dos volvían a meter unos
  // dentro de otros lo que la dura acababa de separar, y los pares
  // interpenetrados apenas bajaban de 114 a 102. Van de menor a mayor prioridad,
  // y el último en tocar una posición es el que manda:
  //
  //   1. tope de acercamiento  — restricción de velocidad, la más blanda
  //   2. pasada dura           — dos cuerpos no ocupan el mismo sitio
  //   3. empuje del jugador    — invariante absoluto, nunca se le penetra
  //
  // El empuje del jugador puede volver a meter a alguien dentro de otro enemigo,
  // pero solo a los pocos que le tocan, y el frame siguiente lo deshace.
  topeAcercamiento(items, n);
  for (let iter = 0; iter < ajustes.pasadasDuras; iter++) pasadaDura(items);
  // Cada jugador aparta lo suyo. El último en tocar manda, y como los cuerpos
  // de dos jugadores nunca se solapan entre sí, no compiten por lo mismo.
  for (let i = 0; i < jugadores.length; i++) {
    if (!jugadores[i].abatido) apartarDelJugador(items, rejilla, jugadores[i]);
  }
}

// Daño por contacto. Solo se miran las 9 celdas alrededor del jugador: da igual
// que haya 800 enemigos vivos si solo un puñado puede estar tocándolo.
//
// Se aplica POR TICS, no por frame: quien impone la cadencia es la
// invulnerabilidad de 0,5s del jugador. Sin eso, estar dentro de un enjambre
// serían 60 impactos por segundo y la vida se evaporaría en un suspiro.
//
// De todos los que tocan se coge el de MÁS daño, no el primero que aparezca: el
// orden dentro de la celda depende del pool y cambiaría el resultado de un frame
// a otro sin que el jugador hiciera nada distinto.
//
// DESVIACIÓN DEL PLAN, consciente: el alcance es `radioCuerpo`, no el `radio` de
// la sección 10. Con los cuerpos sólidos, a una gárgola (cuerpo 17, radio de
// daño 7) la restricción física ya la mantiene a 27px del jugador, así que con
// el radio pequeño NUNCA podría hacer daño: sería inofensiva por geometría. El
// motivo original del radio pequeño era que rozar un ala no contase como
// impacto, y eso ahora lo garantiza el propio cuerpo sólido: si el ala te toca,
// es que el bicho está pegado a ti de verdad. `radio` sigue existiendo y será el
// que usen las armas en la Fase 3, donde el criterio original sí aplica.
// Daño por contacto de TODOS los jugadores. Cada uno con su cadencia propia:
// los i-frames son individuales, así que dos jugadores pegados al mismo bicho
// no comparten el reloj del golpe.
export function contactoJugadores(enemigos, jugadores) {
  for (let i = 0; i < jugadores.length; i++) contactoJugador(enemigos, jugadores[i]);
}

export function contactoJugador(enemigos, jugador) {
  if (jugador.abatido || jugador.invulnerable > 0) return 0;

  const rejilla = enemigos.rejilla;
  const items = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  const cx = rejilla.columnaDe(jugador.x);
  const cy = rejilla.filaDe(jugador.y);
  const jx = jugador.x;
  const jy = jugador.y;

  let peor = 0;
  // Dónde estaba el que más pega. El golpe se cuenta como si viniera de ÉL, que
  // es de quien viene el número: con seis bichos encima, promediar las
  // direcciones daría un vector corto apuntando a ninguna parte.
  let peorX = 0, peorY = 0;
  // Quién ha sido, para la Capa del erizo. Solo hace falta la referencia al que
  // más pega, que es el que acaba haciendo el daño de este paso.
  let peorE = null;
  for (let fy = cy - 1; fy <= cy + 1; fy++) {
    if (fy < 0 || fy >= filas) continue;
    for (let fx = cx - 1; fx <= cx + 1; fx++) {
      if (fx < 0 || fx >= columnas) continue;
      const c = fy * columnas + fx;
      for (let p = inicio[c]; p < inicio[c + 1]; p++) {
        const e = items[indices[p]];
        // Congelado por el Reloj de Emerita: no muerde. Es la otra mitad de
        // poder atravesarlo (ver apartarDelJugador): cruzar por encima de un
        // bloque de hielo y salir con la vida a la mitad sería la peor manera
        // posible de contar lo que hace el objeto.
        if (e.paralizado > 0) continue;
        const dx = e.x - jx;
        const dy = e.y - jy;
        const r = (e.radioCuerpo + jugador.radioCuerpo) * MARGEN_DANYO;
        // e.danyo, no e.def.danyo: el escalado por minuto se congela en la
        // entidad al aparecer (ver entidades/enemigo.js), y leer del catálogo
        // devolvería siempre el valor de minuto 0.
        if (dx * dx + dy * dy < r * r && e.danyo > peor) {
          peor = e.danyo;
          peorX = e.x;
          peorY = e.y;
          peorE = e;
        }
      }
    }
  }

  // La dirección va del que muerde hacia el jugador, sin normalizar: eso lo hace
  // recibirDanyo. Todo lo demás —sangre, marca, sacudida, borde rojo y parón—
  // vive ya ahí dentro, que es el único sitio por donde pasa TODO el daño que
  // recibe un jugador (ver entidades/jugador.js).
  if (peor > 0) {
    const dolido = jugador.recibirDanyo(peor, jx - peorX, jy - peorY);
    // LA CAPA DEL ERIZO devuelve parte del golpe a quien lo dio.
    //
    // Solo si el golpe ha ENTRADO (`dolido`): con los i-frames puestos,
    // `recibirDanyo` no hace nada y devolver espinas por un golpe que no te han
    // dado convertiría el objeto en un arma de contacto permanente — te metes
    // en el montón y las espinas cobran sesenta veces por segundo.
    //
    // Y solo contra el que MÁS pega de los que te rodean, que es el que ha
    // hecho el daño: repartir a todos los que te tocan sería cobrar por golpes
    // que no han existido.
    if (dolido && jugador.espinas > 0 && peorE && peorE.vida > 0) {
      const vuelta = Math.max(1, Math.round(peor * jugador.espinas));
      const ex = peorE.x - jx, ey = peorE.y - jy;
      const d = Math.sqrt(ex * ex + ey * ey) || 1;
      enemigos.danyar(peorE, vuelta, ex / d, ey / d, 0, jugador, null);
    }
  }
  return peor;
}

// Los jugadores tampoco se atraviesan entre sí.
//
// Aquí el reparto es MITAD Y MITAD, sin masas: dos jugadores son iguales y
// ninguno tiene derecho a empujar al otro. Es la diferencia con el empuje contra
// enemigos, donde el jugador manda y nadie le aparta a él.
//
// Recorrido de todos los pares: con cuatro jugadores son seis comparaciones, así
// que la rejilla espacial aquí sobra por completo.
export function separarJugadores(jugadores) {
  const n = jugadores.length;
  if (n < 2) return;
  for (let i = 0; i < n; i++) {
    const a = jugadores[i];
    if (a.abatido) continue;
    for (let k = i + 1; k < n; k++) {
      const b = jugadores[k];
      if (b.abatido) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const r = a.radioCuerpo + b.radioCuerpo;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;

      let nx, ny, pen;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = dx / d; ny = dy / d; pen = r - d;
      } else {
        // Exactamente encima (dos que entran a la vez): se separan siempre en
        // la misma dirección para que no vibren.
        nx = 1; ny = 0; pen = r;
      }
      const mitad = pen * 0.5;
      a.x -= nx * mitad;
      a.y -= ny * mitad;
      b.x += nx * mitad;
      b.y += ny * mitad;
    }
  }
}

// --- Consultas para las armas -----------------------------------------------

// Enemigo vivo más cercano dentro de `alcance`, o null.
//
// Recorrido lineal sobre los activos, a propósito. Es O(n) POR DISPARO, no por
// frame: con las recargas del plan son un puñado de búsquedas por segundo, y
// 800 comprobaciones de distancia al cuadrado no se notan. Si algún arma
// llegara a disparar todos los frames, esto tendría que pasar a recorrer
// anillos de celdas de la rejilla.
// `excluir` es un enemigo al que NO mirar. Lo usa el rebote de proyectil: el
// que se acaba de golpear es siempre el más cercano a sí mismo, así que sin
// excluirlo la piedra rebotaría eternamente contra el mismo cuerpo.
export function enemigoMasCercano(enemigos, x, y, alcance, excluir = null) {
  const items = enemigos.pool.items;
  const n = enemigos.pool.activos;
  let mejor = null;
  let mejorD2 = alcance * alcance;
  // En un recinto, el más cercano A LA VISTA: apuntar a uno que está al otro
  // lado de una pared es disparar contra el muro una y otra vez mientras el
  // que sí se ve te muerde. La línea de visión se pregunta solo cuando el
  // candidato MEJORA al mejor que había, que son unas pocas veces por barrido y
  // no una por enemigo.
  const paredes = RejillaMapa.activa;
  for (let k = 0; k < n; k++) {
    const e = items[k];
    if (e.vida <= 0 || e === excluir) continue;
    const dx = e.x - x;
    const dy = e.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= mejorD2) continue;
    if (paredes && !RejillaMapa.lineaLibre(x, y, e.x, e.y)) continue;
    mejorD2 = d2; mejor = e;
  }
  return mejor;
}

// Rellena `salida` (Int32Array preasignado) con los índices de pool de los
// enemigos vivos dentro del radio. Devuelve cuántos. Usa la rejilla porque esto
// sí puede llamarse a menudo y con la pantalla llena.
export function enemigosEnRadio(enemigos, x, y, radio, salida) {
  const rejilla = enemigos.rejilla;
  const items = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;

  const c0 = rejilla.columnaDe(x - radio);
  const c1 = rejilla.columnaDe(x + radio);
  const f0 = rejilla.filaDe(y - radio);
  const f1 = rejilla.filaDe(y + radio);
  const tope = salida.length;

  let n = 0;
  for (let fy = f0; fy <= f1 && fy < filas; fy++) {
    if (fy < 0) continue;
    for (let fx = c0; fx <= c1 && fx < columnas; fx++) {
      if (fx < 0) continue;
      const c = fy * columnas + fx;
      for (let p = inicio[c]; p < inicio[c + 1]; p++) {
        const idx = indices[p];
        const e = items[idx];
        if (e.vida <= 0) continue;
        const dx = e.x - x;
        const dy = e.y - y;
        // Radio del enemigo incluido: un cíclope se toca antes que una serpiente.
        const r = radio + e.radioCuerpo;
        if (dx * dx + dy * dy > r * r) continue;
        if (n >= tope) return n;
        salida[n++] = idx;
      }
    }
  }
  return n;
}

// Proyectiles contra enemigos. La perforación se resuelve con el sello: cada
// proyectil lleva una marca única y el enemigo guarda la del último que le dio,
// así que atravesar a alguien nunca cuenta dos veces aunque sigan solapados
// varios frames seguidos.
// Hasta dónde busca un proyectil que rebota su siguiente blanco. Corto a
// propósito: un rebote que cruza media pantalla no se lee como un rebote, se
// lee como un proyectil teledirigido.
const ALCANCE_REBOTE = 110;

export function impactosProyectiles(proyectiles, enemigos, alEstallar) {
  const rejilla = enemigos.rejilla;
  const items = enemigos.pool.items;
  const inicio = rejilla.inicio;
  const indices = rejilla.indices;
  const columnas = rejilla.columnas;
  const filas = rejilla.filas;
  const pItems = proyectiles.pool.items;

  let k = 0;
  while (k < proyectiles.pool.activos) {
    const p = pItems[k];
    let agotado = false;

    // EN SECO: perforación gastada pero rebotes de pared por usar. Sigue
    // volando y no hace daño a nadie hasta tocar el margen, donde se recarga
    // (ver Proyectiles.mover). Se sale antes de mirar la rejilla siquiera: no
    // hay nada que pueda pasarle a un proyectil que no golpea.
    if (p.perforacion < 0) { k++; continue; }

    // EL PROYECTIL SE PRUEBA COMO SEGMENTO, NO COMO PUNTO.
    //
    // Se probaba dónde está AHORA, y eso falla en cuanto vuela rápido: entre un
    // fotograma y el siguiente recorre `velocidad/60` unidades, y si eso es más
    // que la ventana de impacto —el radio de la bala más el del enemigo— salta
    // por encima de un cuerpo sin llegar a tocarlo nunca.
    //
    // Medido con el Fusil al máximo, que rebota diez veces ganando un 10% de
    // velocidad en cada una: acaba a 1654 de velocidad, o sea 27,6 unidades por
    // fotograma, contra una ventana de 8 frente a un enemigo pequeño. Tres de
    // cada cuatro cuerpos le pasaban por debajo. La mejora se volvía castigo
    // justo cuando el arma tenía que estar más fuerte.
    //
    // Se arregla midiendo contra el TRAMO recorrido —de la posición anterior a
    // la actual— en vez de contra el punto final. `xPrev`/`yPrev` ya existían
    // para interpolar el dibujado, así que el dato estaba ahí.
    //
    // NO CUESTA NADA EN EL CASO NORMAL: para un proyectil lento, la posición
    // anterior y la actual están a menos de un píxel, así que la caja que se
    // consulta en la rejilla es la misma de antes y se recorren las mismas
    // celdas. Solo los rápidos miran unas pocas más, que es exactamente cuando
    // hace falta.
    const px0 = p.xPrev, py0 = p.yPrev;
    const segX = p.x - px0, segY = p.y - py0;
    const segLen2 = segX * segX + segY * segY;

    const minX = px0 < p.x ? px0 : p.x;
    const maxX = px0 < p.x ? p.x : px0;
    const minY = py0 < p.y ? py0 : p.y;
    const maxY = py0 < p.y ? p.y : py0;
    const c0 = rejilla.columnaDe(minX - p.radio);
    const c1 = rejilla.columnaDe(maxX + p.radio);
    const f0 = rejilla.filaDe(minY - p.radio);
    const f1 = rejilla.filaDe(maxY + p.radio);

    for (let fy = f0; fy <= f1 && !agotado; fy++) {
      if (fy < 0 || fy >= filas) continue;
      for (let fx = c0; fx <= c1 && !agotado; fx++) {
        if (fx < 0 || fx >= columnas) continue;
        const c = fy * columnas + fx;
        for (let q = inicio[c]; q < inicio[c + 1]; q++) {
          const e = items[indices[q]];
          if (e.vida <= 0 || e.ultimoSello === p.sello) continue;
          // Distancia del enemigo AL TRAMO, no al punto final: se proyecta su
          // centro sobre el segmento, se recorta a los extremos y se mide desde
          // ahí. Con el tramo de longitud cero —un proyectil parado— sale el
          // punto de siempre y la cuenta es la de antes.
          let t = 0;
          if (segLen2 > 0) {
            t = ((e.x - px0) * segX + (e.y - py0) * segY) / segLen2;
            if (t < 0) t = 0; else if (t > 1) t = 1;
          }
          const dx = e.x - (px0 + segX * t);
          const dy = e.y - (py0 + segY * t);
          const r = p.radio + e.radioCuerpo;
          if (dx * dx + dy * dy > r * r) continue;

          e.ultimoSello = p.sello;
          const v = hipot(p.vx, p.vy) || 1;
          enemigos.danyar(e, p.danyo, p.vx / v, p.vy / v, p.empuje, p.duenyo, p.arma);

          if (p.perforacion > 0) { p.perforacion--; continue; }

          // REBOTE A OTRO ENEMIGO. Antes de darlo por gastado, si le quedan
          // rebotes salta al enemigo vivo más cercano que NO sea este. Es la
          // Honda: una piedra que va haciendo cabriolas por la horda.
          //
          // Se distingue de la perforación a propósito: perforar es seguir
          // recto atravesando cuerpos, rebotar es CAMBIAR DE RUMBO hacia otro
          // blanco. La primera premia alinearse, la segunda premia el bulto.
          // REBOTE CONTRA LA PARED. Antes de darlo por gastado: si le quedan
          // rebotes de margen NO muere aquí, sigue volando EN SECO hasta el
          // borde y allí recupera la perforación.
          //
          // Sin esto, los rebotes del Fusil no se veían nunca, y no era un
          // fallo del rebote sino de que la bala no llegaba a la pared: moría
          // contra el primer o segundo cuerpo —perforación 1 al nivel 1, 3 al
          // 10— y en este juego siempre hay un cuerpo entre tú y el margen. La
          // función estaba bien y no se ejecutaba jamás en partida.
          if (p.rebotesPared > 0) { p.perforacion = -1; agotado = false; break; }

          if (p.rebotesEnemigo > 0) {
            const otro = enemigoMasCercano(enemigos, p.x, p.y, ALCANCE_REBOTE, e);
            if (otro) {
              p.rebotesEnemigo--;
              const ddx = otro.x - p.x, ddy = otro.y - p.y;
              const dd = hipot(ddx, ddy) || 1;
              // Conserva la RAPIDEZ y cambia solo la dirección: si se copiara
              // el vector al blanco, un rebote corto dejaría la piedra parada.
              const rapidez = hipot(p.vx, p.vy) || 1;
              p.vx = (ddx / dd) * rapidez;
              p.vy = (ddy / dd) * rapidez;
              // Sello nuevo: puede volver a tocar a quien ya tocó si el rebote
              // lo devuelve. Y vida repuesta, que si no llega sin alcance.
              p.sello = nuevoSello();
              p.vida = p.vidaMax;
              agotado = false;
              break;                       // sale de esta celda; sigue vivo
            }
          }
          agotado = true; break;
        }
      }
    }

    if (agotado) {
      // Al gastarse deja su onda expansiva, si la lleva. El daño de la
      // explosión NO es el del impacto: un lanzagranadas reparte poco en el
      // punto y mucho alrededor.
      if (p.radioExplosion > 0 && alEstallar) alEstallar(p);
      proyectiles.liberarEn(k);              // sin avanzar k: ver Pool
    } else k++;
  }
}
