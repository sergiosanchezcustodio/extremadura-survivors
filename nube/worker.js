// LA COPIA EN LA NUBE DE UNA PARTIDA. Un Worker de Cloudflare y una tabla.
//
// QUÉ RESUELVE. El progreso vive en el `localStorage` del navegador, o sea por
// dominio y por máquina: hoy lo que juegas en github.io y lo que juegas en
// itch.io ya son dos partidas distintas, y cambiar de ordenador es empezar de
// cero. Esto guarda una COPIA para poder seguir donde lo dejaste.
//
// LO QUE NO ES, y conviene tenerlo claro antes de leer una línea:
//
//   - No es una cuenta. No hay correo, ni contraseña, ni registro. La identidad
//     es un código aleatorio que el juego genera solo y guarda en tu navegador.
//     Sin datos personales no hay nada que proteger, nada que recuperar y nada
//     que gestionar.
//   - No es la fuente de la verdad. El juego sigue guardando en su sitio de
//     siempre y esto es una copia. Si el Worker se cae, se borra o se acaba el
//     plan gratuito, se juega exactamente igual que hoy y nadie pierde nada.
//     Esa es la condición que hace honesto ofrecérselo a desconocidos.
//   - No es seguridad. Quien tenga tu código puede leer y escribir tu partida.
//     Por eso el código es de 128 bits: adivinarlo no es una opción, y no se
//     publica en ninguna parte.
//
// LA API, entera:
//
//   GET  /p/<codigo>   devuelve la copia guardada, o 404 si no hay ninguna
//   PUT  /p/<codigo>   guarda una copia   (cuerpo JSON, ver `validar`)
//
// No hay listado y no lo va a haber: solo se puede leer el código exacto que ya
// tienes. Un extremo que permita enumerar convierte "hay que adivinar 128 bits"
// en "hay que pedir la lista".

// El código es lo único que separa una partida de otra, así que se comprueba su
// forma antes de tocar la base de datos. 22 caracteres son los 128 bits que
// genera el juego; se admite hasta 64 por si algún día se alarga.
const FORMA_CODIGO = /^[A-Za-z0-9_-]{22,64}$/;

// Tope del cuerpo. Una partida con todo desbloqueado ronda los 300 caracteres
// (medido: 274 con 37 partidas y 13 horas jugadas), así que 2 KB es diez veces
// lo que hace falta. El tope no es tacañería: es lo que impide que un extremo
// público y anónimo se convierta en el disco duro gratis de otro.
const TOPE_CUERPO = 2048;

// CORS abierto, y es una decisión, no un descuido. El juego se sirve desde tres
// sitios distintos —github.io, el subdominio que le toque a itch.io ese día, y
// localhost mientras se desarrolla— y esa lista cambia sin avisar. Cerrar por
// origen no protegería nada, además: cualquiera puede hablar con esto desde una
// terminal. Lo que protege es el código, no el origen del navegador.
const CABECERAS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

// --- EL FRENO POR IP ---------------------------------------------------------
//
// POR QUÉ ESTÁ AQUÍ Y NO EN EL PANEL DE CLOUDFLARE. Las reglas de *rate
// limiting* del panel son POR ZONA, o sea por un dominio que hayas añadido a tu
// cuenta; un subdominio `workers.dev` no es una zona tuya, es de Cloudflare, así
// que ahí no hay dónde ponerlas. El día que esto viva en un dominio propio, se
// puede quitar de aquí y hacerlo arriba, que es mejor sitio.
//
// ES UN LÍMITE BLANDO, y hay que decirlo claro: Cloudflare reparte el Worker
// entre muchos isolates repartidos por el mundo, cada uno con su memoria, así
// que estas cuentas no son globales. Alguien decidido a saltárselo lo consigue.
// Lo que sí para —que es el caso real— es a quien le da sin parar desde una
// máquina: sus peticiones caen casi siempre en el mismo sitio, y ahí se le
// cuenta.
//
// No usa D1 a propósito. Llevar el contador en la base convertiría cada visita
// de un robot en una ESCRITURA, que es justo el recurso escaso del plan
// gratuito: el ataque saldría gratis y la defensa cara.
const VENTANA_MS = 60000;
// El PUT tiene menos margen que el GET porque es el que escribe. Un jugador de
// verdad hace un GET al entrar y un PUT cada varias partidas; el cliente además
// agrupa las subidas y no manda más de una cada cuatro segundos.
let TOPE_LECTURA = 60;
let TOPE_ESCRITURA = 30;
const visitas = new Map();

// Si la memoria crece, se tiran las entradas caducadas. Sin esto, un barrido de
// direcciones deja el Map creciendo hasta que el isolate muera.
const MAX_VIGILADAS = 5000;

function pasaElFreno(ip, escribe, ahora) {
  // SIN IP NO SE LIMITA. `CF-Connecting-IP` la pone el borde de Cloudflare y no
  // se puede falsear desde fuera; si no está, es que esto no viene por ahí —una
  // prueba en local— y contarlas todas juntas sería frenar el banco de pruebas.
  if (!ip) return true;
  if (visitas.size > MAX_VIGILADAS) {
    for (const [k, v] of visitas) if (v.hasta <= ahora) visitas.delete(k);
  }
  const v = visitas.get(ip);
  if (!v || v.hasta <= ahora) {
    visitas.set(ip, { hasta: ahora + VENTANA_MS, lecturas: 0, escrituras: 0 });
    return pasaElFreno(ip, escribe, ahora);
  }
  if (escribe) { v.escrituras++; return v.escrituras <= TOPE_ESCRITURA; }
  v.lecturas++;
  return v.lecturas <= TOPE_LECTURA;
}

// Costura para las pruebas: bajar los topes y vaciar la cuenta sin esperar un
// minuto de reloj. No la usa el Worker.
export function _ajustarFreno(topeLectura, topeEscritura) {
  TOPE_LECTURA = topeLectura;
  TOPE_ESCRITURA = topeEscritura;
  visitas.clear();
}

function respuesta(objeto, estado = 200) {
  return new Response(JSON.stringify(objeto), {
    status: estado,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CABECERAS }
  });
}

// ¿El cuerpo que llega es una copia de partida con sentido?
//
// Se exporta y se prueba aparte porque es lo único del Worker que tiene lógica:
// el resto es una consulta. Ver herramientas\probar-nube.js.
export function validar(datos) {
  if (!datos || typeof datos !== 'object') return 'El cuerpo no es un objeto.';
  const { cuerpo, tiempo, partidas, sello } = datos;
  if (typeof cuerpo !== 'string' || cuerpo.length === 0) return 'Falta el progreso.';
  if (cuerpo.length > TOPE_CUERPO) return 'El progreso ocupa demasiado.';
  // Se comprueba la MARCA del formato, no el contenido: el Worker no sabe leer
  // un progreso y no tiene por qué. Lo suyo es guardar el texto que le den,
  // igual que un buzón no lee las cartas.
  if (cuerpo.slice(0, 2) !== 'P1') return 'Eso no es un progreso de Emerita.';
  if (!Number.isFinite(tiempo) || tiempo < 0) return 'El tiempo jugado no es un número.';
  if (!Number.isInteger(partidas) || partidas < 0) return 'Las partidas no son un número.';
  if (!Number.isInteger(sello) || sello < 0) return 'El sello no es un número.';
  return '';
}

// EL TIEMPO Y LAS PARTIDAS VIAJAN APARTE, y no es duplicar datos por gusto: son
// lo que decide cuál de dos copias gana, y así el Worker puede decidirlo con
// dos comparaciones de números en vez de aprender a leer el formato del juego.
// El día que el formato cambie, esto no se entera.
//
// Y se decide en el SERVIDOR además de en el cliente, que es lo que protege del
// caso feo de verdad: un ordenador que llevaba semanas sin abrirse sincroniza su
// partida vieja y se lleva por delante la buena. Con esto, subir algo peor no
// hace nada. `?forzar=1` se salta la regla, para cuando de verdad quieras que
// mande lo que tienes aquí.
const GUARDAR = `
  INSERT INTO partidas (codigo, cuerpo, tiempo, partidas, sello, actualizado)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(codigo) DO UPDATE SET
    cuerpo = excluded.cuerpo, tiempo = excluded.tiempo,
    partidas = excluded.partidas, sello = excluded.sello,
    actualizado = excluded.actualizado
  WHERE excluded.tiempo > partidas.tiempo
     OR (excluded.tiempo = partidas.tiempo AND excluded.partidas > partidas.partidas)`;

const GUARDAR_FORZADO = `
  INSERT INTO partidas (codigo, cuerpo, tiempo, partidas, sello, actualizado)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT(codigo) DO UPDATE SET
    cuerpo = excluded.cuerpo, tiempo = excluded.tiempo,
    partidas = excluded.partidas, sello = excluded.sello,
    actualizado = excluded.actualizado`;

// --- LOGIN CON GITHUB, solo para recordar el código -------------------------
//
// Esto NO es una cuenta. Sigue sin haber contraseña ni correo, y sigue sin
// haber ninguna ruta que liste nada. Lo único que añade es una tabla de
// TRADUCCIÓN -"esta cuenta de GitHub, este código"- para no tener que copiar
// y pegar el código a mano cada vez. Ver la cabecera de esquema.sql.
//
// EL WORKER NUNCA DECIDE QUÉ PARTIDA ES MEJOR. Solo enlaza y devuelve el
// código al navegador; la comparación de "quién tiene más juego" la hace el
// cliente con la misma regla que ya usa para pegar un código a mano —ver
// `pegarCodigoDeNube` en js/main.js—. Repetirla aquí sería mantenerla dos
// veces y que un día se desincronizaran.

// FIJA A PROPÓSITO, no calculada de la petición que llega: tiene que ser
// BYTE A BYTE la misma que la Authorization callback URL registrada en la
// OAuth App de GitHub, o el intercambio de código falla en silencio.
const CALLBACK_GITHUB =
  'https://emerita-partidas.sergiosanchezcustodio.workers.dev/auth/github/callback';

// SOLO A ESTOS SITIOS SE REDIRIGE DE VUELTA tras hablar con GitHub. Sin esta
// lista, cualquiera podría fabricar un `state` que mandara el código de
// sesión a una página suya -un open redirect de manual, y aquí con un código
// OAuth de verdad viajando dentro-. `localhost` entra para poder probar esto
// en desarrollo sin desplegar nada.
const ORIGENES_PERMITIDOS = [
  'https://sergiosanchezcustodio.github.io',
  'https://sergiosanchezcustodio.itch.io',
  'http://localhost:8000'
];

// EL `state` LLEVA EL CÓDIGO Y LA PÁGINA EXACTA de la que se vino, porque el
// juego se sirve desde varios sitios y el Worker tiene que saber a dónde
// devolver al jugador -no basta el origen: el juego vive en una subruta en
// github.io-. Lo compone `urlLoginGithub()` en js/core/nube.js; aquí solo se
// deshace y se valida.
function decodificarState(state) {
  const s = String(state || '');
  const punto = s.lastIndexOf('.');
  if (punto < 0) return null;
  const codigo = s.slice(0, punto);
  if (!FORMA_CODIGO.test(codigo)) return null;
  let b64 = s.slice(punto + 1).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  let pagina;
  try { pagina = atob(b64); } catch { return null; }
  let url;
  try { url = new URL(pagina); } catch { return null; }
  if (!ORIGENES_PERMITIDOS.includes(url.origin)) return null;
  return { codigo, pagina: url.toString() };
}

async function inicioGithub(url, entorno) {
  const decodificado = decodificarState(url.searchParams.get('state'));
  if (!decodificado) return respuesta({ error: 'Enlace de conexión no válido.' }, 400);
  if (!entorno.GITHUB_CLIENT_ID) {
    return respuesta({ error: 'El login con GitHub no está configurado en este servidor.' }, 501);
  }
  const destino = new URL('https://github.com/login/oauth/authorize');
  destino.searchParams.set('client_id', entorno.GITHUB_CLIENT_ID);
  destino.searchParams.set('redirect_uri', CALLBACK_GITHUB);
  destino.searchParams.set('state', url.searchParams.get('state'));
  // SIN SCOPE. Con `scope=` vacío, `GET /user` ya da `id` y `login`, que es
  // lo único que hace falta. Pedir `user:email` sería guardar más de lo que
  // se necesita, y aquí lo mínimo es la regla, no la excepción.
  destino.searchParams.set('scope', '');
  destino.searchParams.set('allow_signup', 'false');
  return Response.redirect(destino.toString(), 302);
}

async function callbackGithub(url, entorno) {
  const decodificado = decodificarState(url.searchParams.get('state'));
  if (!decodificado) return respuesta({ error: 'Enlace de conexión no válido.' }, 400);

  const code = url.searchParams.get('code');
  if (!code) return respuesta({ error: 'GitHub no ha mandado ningún código.' }, 400);
  if (!entorno.GITHUB_CLIENT_ID || !entorno.GITHUB_CLIENT_SECRET) {
    return respuesta({ error: 'El login con GitHub no está configurado en este servidor.' }, 501);
  }

  let token = null;
  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: entorno.GITHUB_CLIENT_ID,
        client_secret: entorno.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: CALLBACK_GITHUB
      })
    });
    const datos = await r.json();
    token = datos && datos.access_token;
  } catch { token = null; }
  if (!token) return respuesta({ error: 'GitHub no ha confirmado la conexión.' }, 502);

  let perfil = null;
  try {
    const r = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${token}`, 'User-Agent': 'extremadura-survivors' }
    });
    perfil = await r.json();
  } catch { perfil = null; }
  if (!perfil || !Number.isInteger(perfil.id)) {
    return respuesta({ error: 'No se ha podido leer tu perfil de GitHub.' }, 502);
  }

  // SE QUEDA EL CÓDIGO CON MÁS JUEGO -misma regla que usa todo lo demás en
  // este proyecto para decidir entre dos copias, ver `traerSiHayMasJuego` en
  // js/main.js-, NO "el primero que llegó". Antes sí era "el primero que
  // llegó", y fue exactamente el fallo que se vio en producción: conectar
  // por primera vez desde una ventana vacía -una prueba, una incógnito-
  // enlazaba esa cuenta PARA SIEMPRE a una partida sin nada, y no había
  // forma de arreglarlo salvo tocar la base de datos a mano. Con la partida
  // pesándose en cada conexión, esto se cura solo: en cuanto esa misma
  // cuenta se conecta desde el navegador con la partida de verdad, el
  // enlace se corrige él solo, sin que nadie tenga que hacer nada.
  const existente = await entorno.DB.prepare(
    'SELECT codigo FROM github_vinculos WHERE github_id = ?1'
  ).bind(perfil.id).first();

  let codigoFinal = decodificado.codigo;
  if (existente && existente.codigo !== decodificado.codigo) {
    const [pesoNuevo, pesoViejo] = await Promise.all([
      entorno.DB.prepare('SELECT tiempo, partidas FROM partidas WHERE codigo = ?1')
        .bind(decodificado.codigo).first(),
      entorno.DB.prepare('SELECT tiempo, partidas FROM partidas WHERE codigo = ?1')
        .bind(existente.codigo).first()
    ]);
    // SIN FILA EN `partidas` PESA CERO: un código recién generado que nunca
    // ha llegado a subir nada -como el de una ventana que solo ha entrado a
    // conectar y no ha jugado- no puede ganarle a uno con partidas de
    // verdad, así que se trata como el peso más bajo posible.
    const tNuevo = pesoNuevo ? pesoNuevo.tiempo : 0, pNuevo = pesoNuevo ? pesoNuevo.partidas : 0;
    const tViejo = pesoViejo ? pesoViejo.tiempo : 0, pViejo = pesoViejo ? pesoViejo.partidas : 0;
    const ganaNuevo = tNuevo > tViejo || (tNuevo === tViejo && pNuevo > pViejo);
    codigoFinal = ganaNuevo ? decodificado.codigo : existente.codigo;
  }

  const ahora = Math.floor(Date.now() / 1000);
  await entorno.DB.prepare(`
    INSERT INTO github_vinculos (github_id, codigo, login, actualizado)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(github_id) DO UPDATE SET
      codigo = excluded.codigo, login = excluded.login, actualizado = excluded.actualizado
  `).bind(perfil.id, codigoFinal, perfil.login || '', ahora).run();

  const vuelta = new URL(decodificado.pagina);
  vuelta.searchParams.set('nube_codigo', codigoFinal);
  if (perfil.login) vuelta.searchParams.set('nube_login', perfil.login);
  return Response.redirect(vuelta.toString(), 302);
}

export default {
  async fetch(peticion, entorno) {
    if (peticion.method === 'OPTIONS') return new Response(null, { headers: CABECERAS });

    // EL FRENO VA ANTES QUE NADA, y antes de mirar siquiera la ruta: quien está
    // martilleando no merece que se le analice la petición, y comprobar la ruta
    // primero sería trabajo hecho para tirarlo después.
    const ip = peticion.headers.get('CF-Connecting-IP');
    if (!pasaElFreno(ip, peticion.method === 'PUT', Date.now())) {
      return new Response(
        JSON.stringify({ error: 'Demasiadas peticiones. Prueba dentro de un minuto.' }),
        { status: 429,
          headers: { 'Content-Type': 'application/json; charset=utf-8',
                     'Retry-After': '60', ...CABECERAS } });
    }

    const url = new URL(peticion.url);

    // EL LOGIN CON GITHUB, antes que la ruta de siempre: son rutas propias,
    // no partidas, y `/auth/...` nunca tiene la forma de `/p/<codigo>`.
    if (url.pathname === '/auth/github/inicio') return inicioGithub(url, entorno);
    if (url.pathname === '/auth/github/callback') return callbackGithub(url, entorno);

    const trozos = url.pathname.split('/').filter(Boolean);
    if (trozos.length !== 2 || trozos[0] !== 'p') {
      return respuesta({ error: 'Ruta desconocida.' }, 404);
    }
    const codigo = trozos[1];
    if (!FORMA_CODIGO.test(codigo)) {
      return respuesta({ error: 'Ese código no tiene la forma de un código de partida.' }, 400);
    }

    if (peticion.method === 'GET') {
      const fila = await entorno.DB.prepare(
        'SELECT cuerpo, tiempo, partidas, sello, actualizado FROM partidas WHERE codigo = ?1'
      ).bind(codigo).first();
      if (!fila) return respuesta({ error: 'No hay ninguna copia con ese código.' }, 404);
      return respuesta(fila);
    }

    if (peticion.method === 'PUT') {
      let datos;
      try { datos = await peticion.json(); }
      catch { return respuesta({ error: 'El cuerpo no es JSON.' }, 400); }
      const mal = validar(datos);
      if (mal) return respuesta({ error: mal }, 400);

      const forzar = url.searchParams.get('forzar') === '1';
      const ahora = Math.floor(Date.now() / 1000);
      const r = await entorno.DB.prepare(forzar ? GUARDAR_FORZADO : GUARDAR)
        .bind(codigo, datos.cuerpo, datos.tiempo, datos.partidas, datos.sello, ahora)
        .run();

      // `changes` a cero significa que la regla ha rechazado el guardado: lo que
      // hay arriba es mejor que lo que se manda. NO es un error —el juego lo
      // usará para quedarse con lo de la nube— así que se contesta 200 con la
      // verdad, y no un 409 que cualquier cliente trataría como avería.
      const guardado = (r.meta && r.meta.changes) > 0;
      return respuesta({ guardado, motivo: guardado ? '' : 'Hay una copia con más juego encima.' });
    }

    return respuesta({ error: 'Solo GET y PUT.' }, 405);
  }
};
