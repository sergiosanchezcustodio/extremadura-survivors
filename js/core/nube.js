// LA COPIA EN LA NUBE, desde el lado del juego.
//
// Guarda una copia del progreso para poder seguir la partida en otro ordenador.
// El servidor está en `nube/` —un Worker de Cloudflare y una tabla— y su lectura
// vale para entender esto: la API son dos rutas y no sabe quién eres.
//
// TRES REGLAS, y las tres son la misma idea desde ángulos distintos:
//
//   1. EL DISCO MANDA. El juego guarda en `localStorage` como siempre y esto es
//      una copia. Si el servidor no contesta, no existe o alguien lo apagó, se
//      juega exactamente igual que hoy y no se pierde nada. Por eso ninguna
//      llamada de aquí bloquea nada ni devuelve errores hacia arriba: fallar en
//      silencio es LO CORRECTO para una copia.
//   2. NO SE ESPERA NUNCA. Nada de esto está en el camino de empezar a jugar.
//      Se sube después de guardar y se baja al entrar en la pantalla de
//      partidas, las dos cosas sin que nadie se quede mirando una rueda.
//   3. GANA EL QUE MÁS HA JUGADO, no el más reciente. Ver `comparar` en
//      progresoPortable.js: decidirlo por la hora deja que un ordenador con el
//      reloj adelantado machaque veinte horas de otro.
//
// SIN CUENTAS. La identidad es un código aleatorio de 128 bits que se genera
// aquí la primera vez. Quien tenga ese código puede leer y escribir esa partida;
// por eso es tan largo y por eso el servidor no tiene ninguna ruta que liste
// nada. Lo que se gana a cambio es que no hay correo, ni contraseña, ni
// recuperación, ni un solo dato personal guardado en ninguna parte.

import { empaquetar, desempaquetar, pesoDe } from './progresoPortable.js';

// LA DIRECCIÓN DEL SERVIDOR. Vacía = la nube está apagada y el juego no habla
// con nadie: ni una petición. Ver nube/LEEME.md para desplegar otro.
//
// El subdominio es de la CUENTA, no de este Worker, y por eso está escrito con
// el nombre de Sergio y no con el del juego: todo lo que despliegue en el futuro
// colgará del mismo sitio.
//
// SI ESTA LÍNEA SE VACÍA, el juego sigue funcionando exactamente igual — guarda
// en su navegador como siempre y no sincroniza. Es la propiedad que hace que
// esto se pueda apagar cualquier día sin dejar tirado a nadie.
export let URL_NUBE = 'https://emerita-partidas.sergiosanchezcustodio.workers.dev';

// El código vive en `localStorage`, que en este proyecto está reservado al
// progreso META. Esto lo es: identifica al jugador entre partidas y no lo lee
// nadie durante la simulación.
const CLAVE_CODIGO = 'extremadura-nube-codigo';

// EL @USUARIO DE GITHUB, si se ha conectado. Se guarda aparte del código -es
// solo para enseñarlo en pantalla, no identifica nada- y por la misma razón
// que el código: para que el popup del login (ver `js/main.js`) pueda
// escribirlo y la ventana principal, que comparte el mismo origen y el mismo
// `localStorage`, lo recoja sin que nadie tenga que mandárselo por mensaje.
const CLAVE_LOGIN = 'extremadura-nube-login';

// Las dos cambiaron de prefijo con el nombre del juego, y se arrastra lo que
// hubiera guardado. Aquí importa más que en el volumen: el código de la nube es
// lo que IDENTIFICA una copia entre partidas, y perderlo es quedarse fuera de tu
// propia copia sin saber por qué. Mismo trato que en core/metaProgreso.js —se
// copia, no se mueve— así que si algo fallara, lo viejo sigue ahí.
try {
  for (const [nueva, vieja] of [[CLAVE_CODIGO, 'emerita-nube-codigo'],
                                [CLAVE_LOGIN, 'emerita-nube-login']]) {
    if (localStorage.getItem(nueva) !== null) continue;
    const previo = localStorage.getItem(vieja);
    if (previo !== null) localStorage.setItem(nueva, previo);
  }
} catch { /* sin almacenamiento: se empieza sin copia en la nube */ }

// Cuánto se espera a que conteste el servidor. Corto a propósito: esto es una
// comodidad, y una comodidad que hace esperar deja de serlo. Si no llega en tres
// segundos, se sigue jugando y ya se sincronizará la próxima vez.
const ESPERA = 3000;

// Y cuánto se agrupan las subidas. `guardar()` se llama varias veces seguidas
// —al comprar en la tienda, al terminar una partida— y cada una no puede ser una
// escritura en la nube: se acumulan y se manda una sola.
const AGRUPAR = 4000;

const estado = {
  codigo: '',
  login: '',
  reloj: 0,
  subiendo: false,
  pendiente: null,      // los huecos que faltan por subir
  // Lo último que se sabe, para poder enseñarlo sin volver a preguntar.
  ultimo: '',           // '', 'subido', 'hay-mejor', 'sin-red', 'apagada'
  alCambiar: null
};

function activa() { return !!URL_NUBE; }

// EL CÓDIGO, generado aquí y una sola vez.
//
// 128 bits de `crypto.getRandomValues`, no de `Math.random`: esto es lo único
// que separa tu partida de la de otro, y un generador previsible convierte
// "adivinarlo es imposible" en "adivinarlo es cuestión de intentarlo".
export function codigo() {
  if (estado.codigo) return estado.codigo;
  try {
    const guardado = localStorage.getItem(CLAVE_CODIGO);
    if (guardado && /^[A-Za-z0-9_-]{22,64}$/.test(guardado)) {
      estado.codigo = guardado;
      return guardado;
    }
  } catch { /* sin almacenamiento: se genera uno para esta sesión */ }

  const bytes = new Uint8Array(16);
  (globalThis.crypto || {}).getRandomValues?.(bytes);
  let crudo = '';
  for (let i = 0; i < bytes.length; i++) crudo += String.fromCharCode(bytes[i]);
  const nuevo = btoa(crudo).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  estado.codigo = nuevo;
  try { localStorage.setItem(CLAVE_CODIGO, nuevo); } catch { /* da igual */ }
  return nuevo;
}

// Cambiar de código es "entrar con la partida de otro sitio": se apunta y a
// partir de ahí se sincroniza contra ese. No baja nada por su cuenta — de eso se
// encarga quien llame, que es quien sabe si puede pisar lo que hay.
export function usarCodigo(nuevo) {
  const limpio = String(nuevo || '').trim();
  if (!/^[A-Za-z0-9_-]{22,64}$/.test(limpio)) return false;
  estado.codigo = limpio;
  try { localStorage.setItem(CLAVE_CODIGO, limpio); } catch { /* da igual */ }
  return true;
}

// EL @USUARIO DE GITHUB. Se persiste igual que el código -mismo mecanismo,
// misma razón-, y quien lo pone es `recogerRetornoDeGithub()` en main.js en
// cuanto GitHub confirma la conexión.
export function fijarLogin(login) {
  estado.login = String(login || '');
  try {
    if (estado.login) localStorage.setItem(CLAVE_LOGIN, estado.login);
    else localStorage.removeItem(CLAVE_LOGIN);
  } catch { /* da igual */ }
}

export function login() {
  if (estado.login) return estado.login;
  try { estado.login = localStorage.getItem(CLAVE_LOGIN) || ''; } catch { /* nada */ }
  return estado.login;
}

// VOLVER A LEER DEL DISCO. Hace falta después de que el POPUP del login haya
// escrito su propio código y su propio @usuario: el popup y esta ventana
// comparten origen y por tanto `localStorage`, pero cada uno tiene su propia
// copia en memoria -esto de aquí, `estado`- que no se entera sola de que el
// disco ha cambiado debajo. Ver `conectarConGithub()` en main.js.
export function recargar() {
  estado.codigo = '';
  estado.login = '';
  codigo();
  login();
}

export function ultimoEstado() { return activa() ? estado.ultimo : 'apagada'; }
export function alCambiar(fn) { estado.alCambiar = fn; }

function avisar(que) {
  estado.ultimo = que;
  if (estado.alCambiar) { try { estado.alCambiar(que); } catch { /* nada */ } }
}

// Una petición con tope de tiempo y sin excepciones hacia fuera. Devuelve null
// cuando algo va mal, y "algo va mal" incluye no tener internet, que es el caso
// más normal de todos y no es un error del que haya que informar.
async function pedir(ruta, opciones) {
  if (!activa()) return null;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), ESPERA);
  try {
    const r = await fetch(URL_NUBE.replace(/\/$/, '') + ruta,
                          { ...opciones, signal: corte.signal });
    if (!r.ok && r.status !== 404) return null;
    return { estado: r.status, datos: await r.json().catch(() => null) };
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

// SUBIR. Se llama después de guardar, y no manda nada de inmediato: apunta lo
// que hay que subir y espera unos segundos por si vienen más cambios.
export function subir(huecos) {
  if (!activa()) return;
  estado.pendiente = huecos;
  if (estado.reloj) return;
  estado.reloj = setTimeout(() => {
    estado.reloj = 0;
    const pend = estado.pendiente;
    estado.pendiente = null;
    if (pend) subirYa(pend);
  }, AGRUPAR);
}

export async function subirYa(huecos, forzar = false) {
  if (!activa()) return false;
  const peso = pesoDe(huecos);
  const r = await pedir('/p/' + codigo() + (forzar ? '?forzar=1' : ''), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cuerpo: empaquetar(huecos),
      tiempo: peso.tiempo,
      partidas: peso.partidas,
      sello: Math.floor(Date.now() / 1000)
    })
  });
  if (!r) { avisar('sin-red'); return false; }
  // Que el servidor no lo guarde NO es un fallo: significa que ahí arriba hay
  // una copia con más juego. Quien llame decidirá si la quiere.
  const guardado = !!(r.datos && r.datos.guardado);
  avisar(guardado ? 'subido' : 'hay-mejor');
  return guardado;
}

// BAJAR. Devuelve los huecos que hay en la nube, o null si no hay copia, no hay
// red o la nube está apagada — los tres casos se atienden igual: no se toca
// nada.
export async function bajar() {
  const r = await pedir('/p/' + codigo(), { method: 'GET' });
  if (!r) { avisar('sin-red'); return null; }
  if (r.estado === 404 || !r.datos || !r.datos.cuerpo) return null;
  const leido = desempaquetar(r.datos.cuerpo);
  if (!leido.ok) return null;
  return { huecos: leido.huecos, tiempo: +r.datos.tiempo || 0,
           partidas: r.datos.partidas | 0, sello: r.datos.sello | 0 };
}

// Para las pruebas y para poder encenderla desde la consola sin recompilar nada.
export function apuntarA(url) { URL_NUBE = String(url || ''); }

// LA URL PARA "CONECTAR CON GITHUB". Esto NO es una cuenta: solo enlaza el
// código de esta partida a tu cuenta de GitHub para poder recuperarlo sin
// copiarlo a mano. Ver "Recordar el código con GitHub" en nube/LEEME.md.
//
// El `state` lleva el código actual Y la página exacta desde la que se
// entra —no basta el origen: el juego vive en una subruta en github.io—,
// porque el Worker tiene que saber a dónde devolver al jugador y el juego se
// sirve desde varios sitios. Va comprimido en base64url, el mismo alfabeto
// que ya usa el propio código, para poder viajar como un solo parámetro.
//
// Devuelve cadena vacía si la nube está apagada: no tiene sentido ofrecer
// conectar con nada.
export function urlLoginGithub() {
  if (!activa()) return '';
  const pagina = location.origin + location.pathname;
  let cruda = '';
  for (const byte of new TextEncoder().encode(pagina)) cruda += String.fromCharCode(byte);
  const b64 = btoa(cruda).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const state = codigo() + '.' + b64;
  return URL_NUBE.replace(/\/$/, '') + '/auth/github/inicio?state=' + encodeURIComponent(state);
}
