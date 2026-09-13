// NARRAR UN TEXTO CON ELEVENLABS, desde la línea de comandos.
//
//   node herramientas/generar-voz.js "Hace veinte siglos Roma levantó…" -s assets/voz/intro-1.mp3
//
// Es la hermana de generar-imagen.js: mismo sitio, misma forma de leer la clave
// y mismo trato con el resultado. Aquella pide dibujos a Replicate y esta pide
// voz a ElevenLabs.
//
// LO QUE SALE DE AQUÍ SÍ ES MATERIAL FINAL, al revés que las imágenes. El arte
// lo dibuja Sergio y lo generado es solo boceto; la voz del narrador no la va a
// grabar nadie, así que estos MP3 son los que van dentro del juego, se guardan
// en assets/voz/ y se versionan como la música.
//
// Y POR ESO SE HORNEA. La API se llama AQUÍ, en desarrollo, una vez. El juego no
// lleva la clave, no habla con ElevenLabs y no necesita internet: se encuentra
// unos MP3 en assets/ y los reproduce, igual que hace con assets/musica/. Si
// mañana ElevenLabs cierra, el juego sigue sonando igual.
//
// CERO DEPENDENCIAS, como todo lo demás. La API es un POST y la respuesta es el
// MP3 en el cuerpo: `fetch` y escribir el fichero.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// CARMELO, la voz que eligió Sergio: masculina, grave, española de la península.
// El id es de la biblioteca de ElevenLabs y no cambia.
const VOZ_POR_DEFECTO = '5egO01tkUjEzu7xSSE8M';

// `eleven_multilingual_v2` y no el turbo ni el flash. Los rápidos existen para
// generar en directo mientras alguien espera; aquí no espera nadie —esto se
// hornea una vez y se guarda— así que lo único que importa es cómo suena, y el
// multilingual es el que mejor lleva el español y los topónimos.
const MODELO_POR_DEFECTO = 'eleven_multilingual_v2';

// 128 kbps a 44,1 kHz: es lo que ya tienen las pistas de assets/musica, y una
// voz sola comprime mejor que una mezcla. Subir de aquí engorda el juego sin que
// se note en unos altavoces.
const FORMATO = 'mp3_44100_128';

// AJUSTES DE VOZ, y los dos primeros son los que de verdad cambian el resultado.
//
//   stability   — cuánto se repite a sí misma. Bajo = más expresivo y más
//                 impredecible entre tomas; alto = plano y constante. Para un
//                 narrador interesa la zona media-alta: tiene que sonar igual en
//                 los ocho niveles, no improvisar en cada uno.
//   similarity  — cuánto se agarra al timbre original de la voz.
//   style       — cuánta interpretación se inventa. En un narrador, poca: lo que
//                 cuenta es el texto, no el actor.
const ESTABILIDAD = 0.55;
const SIMILITUD = 0.80;
const ESTILO = 0.15;

function ayuda() {
  console.log(`
Narra un texto con ElevenLabs y lo guarda en un MP3.

  node herramientas/generar-voz.js "<lo que se narra>" [opciones]

  -s, --salida <ruta>    dónde guardarlo. Por defecto: assets/voz/<fecha>.mp3
  -v, --voz <id>         id de voz. Por defecto: ${VOZ_POR_DEFECTO} (Carmelo)
  -m, --modelo <id>      modelo. Por defecto: ${MODELO_POR_DEFECTO}
      --estabilidad <n>  0..1. Por defecto: ${ESTABILIDAD}
      --similitud <n>    0..1. Por defecto: ${SIMILITUD}
      --estilo <n>       0..1. Por defecto: ${ESTILO}
      --voces            lista las voces de la cuenta y sale

La clave va en la variable ELEVENLABS_API_KEY o en una línea
ELEVENLABS_API_KEY=... del fichero .env de la raíz (que no se versiona).
`);
}

// El .env, leído a mano y quitando los bytes nulos. Es la misma función que
// generar-imagen.js y está copiada a propósito en vez de compartida: son dos
// herramientas sueltas de herramientas/, no módulos del juego, y un tercer
// archivo del que dependan las dos para partir cadenas por un '=' costaría más
// de lo que ahorra. El porqué de los nulos está contado allí: PowerShell escribe
// UTF-16 con algunos redirectores y la clave deja de reconocerse.
function leerEnv() {
  const ruta = join(RAIZ, '.env');
  if (!existsSync(ruta)) return {};
  const crudo = readFileSync(ruta)
    .toString('latin1')
    .split('').filter((c) => c !== '\u0000').join('')
    .replace(/^\uFEFF/, '');
  const valores = {};
  for (const linea of crudo.split('\n')) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const corte = limpia.indexOf('=');
    if (corte < 0) continue;
    valores[limpia.slice(0, corte).trim()] =
      limpia.slice(corte + 1).trim().replace(/^["']|["']$/g, '');
  }
  return valores;
}

function clave() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const k = leerEnv().ELEVENLABS_API_KEY;
  if (k) return k;
  console.error(`
FALTA LA CLAVE DE ELEVENLABS.

Ponla en el fichero .env de la raíz del repositorio, en una línea:

    ELEVENLABS_API_KEY=tu_clave_aqui

Ese fichero está en .gitignore y no se sube nunca. La clave se saca del panel de
la cuenta, en https://elevenlabs.io/app/settings/api-keys
`);
  process.exit(1);
}

function argumentos(argv) {
  const o = { texto: '', salida: '', voz: VOZ_POR_DEFECTO, modelo: MODELO_POR_DEFECTO,
              estabilidad: ESTABILIDAD, similitud: SIMILITUD, estilo: ESTILO,
              listar: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--ayuda' || a === '--help') { ayuda(); process.exit(0); }
    else if (a === '--voces') o.listar = true;
    else if (a === '-s' || a === '--salida') o.salida = argv[++i];
    else if (a === '-v' || a === '--voz') o.voz = argv[++i];
    else if (a === '-m' || a === '--modelo') o.modelo = argv[++i];
    else if (a === '--estabilidad') o.estabilidad = +argv[++i];
    else if (a === '--similitud') o.similitud = +argv[++i];
    else if (a === '--estilo') o.estilo = +argv[++i];
    // Lo primero que no sea una opción es lo que se quiere narrar. Se acumula
    // por si viene sin comillas, igual que en generar-imagen.js.
    else o.texto = o.texto ? `${o.texto} ${a}` : a;
  }
  return o;
}

function nombrePorDefecto() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `voz-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
         `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function listarVoces(k) {
  const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': k }
  });
  if (!resp.ok) {
    console.error(`ElevenLabs ha dicho que no (HTTP ${resp.status}): ${await resp.text()}`);
    process.exit(1);
  }
  const datos = await resp.json();
  for (const v of datos.voices || []) {
    const etiquetas = v.labels ? Object.values(v.labels).join(', ') : '';
    console.log(`${v.voice_id}  ${v.name}${etiquetas ? '  [' + etiquetas + ']' : ''}`);
  }
}

async function principal() {
  const o = argumentos(process.argv.slice(2));
  const k = clave();
  if (o.listar) { await listarVoces(k); return; }
  if (!o.texto) { ayuda(); process.exit(1); }

  const salida = resolve(RAIZ, o.salida || join('assets', 'voz', nombrePorDefecto() + '.mp3'));
  mkdirSync(dirname(salida), { recursive: true });

  console.log(`Voz:     ${o.voz}`);
  console.log(`Modelo:  ${o.modelo}`);
  console.log(`Texto:   ${o.texto.length} caracteres`);
  console.log(`Guarda:  ${salida}`);
  console.log('Narrando…');

  const t0 = Date.now();
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${o.voz}?output_format=${FORMATO}`, {
      method: 'POST',
      headers: {
        'xi-api-key': k,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg'
      },
      body: JSON.stringify({
        text: o.texto,
        model_id: o.modelo,
        voice_settings: {
          stability: o.estabilidad,
          similarity_boost: o.similitud,
          style: o.estilo,
          use_speaker_boost: true
        }
      })
    });

  if (!resp.ok) {
    const cuerpo = await resp.text();
    console.error(`\nElevenLabs ha dicho que no (HTTP ${resp.status}):\n${cuerpo}\n`);
    if (resp.status === 401) console.error('La clave no vale o ha caducado.');
    if (resp.status === 402) console.error(
      'El plan GRATUITO no deja usar voces de la BIBLIOTECA por la API, solo las de\n' +
      'serie y las propias. `--voces` lista las que sí valen con esta clave.');
    if (resp.status === 422) console.error('El id de voz o de modelo no existe.');
    if (resp.status === 429) console.error('Se han agotado los créditos del mes.');
    // `exitCode` y no `exit`: cortar el proceso con la conexión todavía abierta
    // hace que Node se caiga por dentro al cerrarla —el "Assertion failed" de
    // libuv— y ese ruido tapa el mensaje de arriba, que es el que hay que leer.
    process.exitCode = 1;
    return;
  }

  // La respuesta ES el MP3, sin JSON alrededor ni URL que descargar aparte.
  const audio = Buffer.from(await resp.arrayBuffer());
  writeFileSync(salida, audio);
  console.log(`\n  ${salida}  (${(audio.length / 1024).toFixed(0)} KB,` +
              ` ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log('Hecho.');
}

principal().catch((e) => {
  console.error('\nNo ha podido ser:', e.message);
  process.exit(1);
});
