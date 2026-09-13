# La copia en la nube, paso a paso

Guarda una copia de tu progreso para poder seguir la partida en otro ordenador.
Son un Worker de Cloudflare y una tabla de D1 (SQLite), las dos cosas dentro del
plan gratuito.

**Antes de nada, lo que esto NO es**, porque decide todo lo demás:

- **No es una cuenta.** Sin correo, sin contraseña, sin registro. La identidad es
  un código aleatorio de 128 bits que el juego genera solo. Sin datos personales
  no hay nada que proteger ni que gestionar. Hay una forma opcional de conectar
  con GitHub para no tener que copiar el código a mano —ver más abajo—, pero
  sigue sin ser una cuenta: solo enlaza tu código a tu cuenta de GitHub, y lo
  único que se guarda de ti es tu id de GitHub y tu @usuario.
- **No es la fuente de la verdad.** El juego sigue guardando donde siempre y esto
  es una copia. Si el Worker se cae, se borra o se acaba el plan gratuito, se
  juega igual que hoy y nadie pierde nada. **Esa es la condición que hace honesto
  ofrecérselo a gente que no eres tú**: quien monta esto se convierte en custodio
  del progreso de otros, y la única forma de no deberles nada es que su partida
  siga viviendo en su navegador.
- **No es seguridad.** Quien tenga tu código puede leer y escribir tu partida.
  Por eso el código es largo y no se publica en ninguna parte.

---

## Los cuatro comandos

Desde la raíz del repositorio.

    npx wrangler login
    npx wrangler d1 create emerita-partidas

El segundo imprime un `database_id`. **Se pega en `nube/wrangler.toml`**, donde
pone `PEGA-AQUI-EL-ID-QUE-TE-DE-WRANGLER`.

    npx wrangler d1 execute emerita-partidas --remote --file=nube/esquema.sql
    npx wrangler deploy --config nube/wrangler.toml

El último imprime la URL, del estilo
`https://emerita-partidas.<tu-subdominio>.workers.dev`. **Esa URL es lo único
que le falta al juego**: es el dato que hay que darle al cliente, que es la
siguiente pieza. Mientras no haya URL, el juego funciona exactamente como hoy y
no habla con nadie.

## Comprobarlo sin abrir el juego

    curl https://TU-URL/p/aB3dEfGhIjKlMnOpQrStUv

Tiene que contestar `{"error":"No hay ninguna copia con ese código."}` con un
404. Si contesta eso, está en pie.

## Probado el 27 de agosto de 2026, contra el Worker desplegado

No "debería funcionar": esto es lo que dio.

**La API, con curl:**

    subir una partida de 46512 s      -> {"guardado":true}
    recuperarla                       -> tiempo 46512, partidas 37, con la hora del SERVIDOR
    intentar machacarla con 900 s     -> {"guardado":false,
                                          "motivo":"Hay una copia con más juego encima."}
    qué hay arriba después            -> la buena, intacta
    lo mismo con ?forzar=1            -> {"guardado":true}
    un código con mala forma          -> 400
    una ruta que liste                -> 404

**Y el juego, desde dos navegadores**, que es la prueba que de verdad vale porque
incluye el CORS, el agrupado de subidas y el formato entero:

- Uno pone un código y juega: 7.777 denarios, 12 partidas, 15.000 s, potenciador
  de vida 4, Oreo de nivel 2. Guarda, y al rato dice `subido`.
- Otro navegador con su propio `localStorage` —o sea otra máquina— pone el mismo
  código y baja: **7777 denarios, 12 partidas, 15000 s, vida 4, Oreo 2**.

Idéntico, y sin un solo error en consola. Las filas de prueba se borraron
después: la tabla quedó en cero.

**El bloqueo de la operadora resultó ser intermitente, como se sospechaba.** La
URL estuvo sin abrir un buen rato y volvió sola, sin tocar nada. Mientras dura un
corte, quien esté en esa red no sincroniza y el juego se lo traga en silencio,
que es justo para lo que está hecho así.

## Si la URL no carga: puede no ser tuya la culpa

Pasó el mismo día del despliegue, y conviene tenerlo escrito porque el síntoma
engaña: el nombre resuelve, el despliegue dice `Deployed`, y la URL no abre. Lo
primero que uno piensa es que ha desplegado mal.

Lo medido entonces, desde una conexión de Movistar:

| Comprobación | Resultado |
|---|---|
| El nombre resuelve | Sí, a `188.114.96.5` y `188.114.97.5`, que son de Cloudflare |
| `cloudflare.com` y `workers.dev` | Funcionan, en 0,36 s — van por `104.19.x.x` |
| Puerto 443 de `104.19.192.29` | Abierto |
| Puerto 443 de `188.114.96.5` | **No abre** |
| Puerto 80 de esa misma IP | Tampoco |

O sea: Cloudflare entero funciona **salvo el trozo de su red donde ha caído el
Worker**. No es TLS, ni un certificado a medio hacer, ni propagación de DNS: los
paquetes no llegan, ni cifrados ni sin cifrar.

En España es conocido que algunas operadoras bloquean rangos enteros de
Cloudflare —el caso sonado fueron los bloqueos por retransmisiones de fútbol, que
se llevaron por delante sitios sin ninguna relación— y suele ser intermitente.

**Cómo distinguirlo en treinta segundos:** abrir la URL en el móvil con datos
móviles, sin wifi. Si ahí carga, es la operadora.

Y las salidas, de menos a más:

1. **Esperar.** Si es de los bloqueos intermitentes, vuelve solo.
2. **Un dominio propio.** Un Worker en un dominio tuyo sale por las IPs normales
   de Cloudflare —las `104.x`, que sí pasan— en vez de por el rango de
   `workers.dev`. Unos 10 € al año, y arregla el problema para todo el mundo.
3. **VPN o cambiar de DNS, no.** Eso lo arregla para quien lo haga y no para
   quien juega, que es lo único que importa aquí.

Lo tranquilizador es que el juego ya está hecho contando con esto: si el servidor
no contesta, se juega igual y se guarda igual. La copia en la nube falla en
silencio, que es exactamente para lo que se diseñó así.

## Lo que hay que poner en el panel de Cloudflare

Un extremo público que escribe recibe visitas de robots el primer día. El Worker
ya rechaza lo que no tiene forma de partida —código mal formado, cuerpo de más de
2 KB, cualquier cosa que no empiece por `P1`— y **lleva su propio freno por IP**:
60 lecturas y 30 escrituras por minuto, y a partir de ahí un 429.

**EL FRENO VA DENTRO DEL WORKER Y NO EN EL PANEL**, y esto costó una vuelta: las
reglas de *rate limiting* del panel son POR ZONA, o sea por un dominio añadido a
tu cuenta. Un subdominio `workers.dev` no es una zona tuya, es de Cloudflare, así
que en *Security → WAF* no hay dónde ponerlas. El día que esto viva en un dominio
propio, se puede subir ahí y quitarlo del código, que es mejor sitio.

Es un límite **blando**, y conviene saberlo: Cloudflare reparte el Worker entre
muchos isolates, cada uno con su memoria, así que las cuentas no son globales.
Para al que le da sin parar desde una máquina —que es el caso real— y no a quien
se lo monte con mil direcciones. No usa D1 a propósito: llevar el contador en la
base convertiría cada visita de un robot en una ESCRITURA, que es justo el
recurso escaso del plan gratuito. El ataque saldría gratis y la defensa cara.

## Cuánto aguanta el plan gratuito

Lo que manda no son las peticiones, son **las escrituras**. D1 da del orden de
100.000 filas escritas al día, contra las ~1.000 de KV; por eso este montaje usa
D1 y no KV. Con una escritura por partida terminada, eso son decenas de miles de
partidas diarias.

**Confirma las cifras antes de fiarte de esta línea**: los planes gratuitos
cambian y esto está escrito el 27 de agosto de 2026.

## Recordar el código con GitHub (opcional)

Esto **sigue sin ser una cuenta**. Lo único que hace es enlazar tu código de
partida a tu cuenta de GitHub para no tener que copiarlo y pegarlo a mano
cada vez: entras con GitHub una vez desde la pantalla de partidas (tecla
**G**), y la próxima vez que lo hagas desde cualquier máquina recuperas tu
partida sola. Se guarda el id numérico de tu cuenta de GitHub y tu @usuario
—para poder enseñarlo en pantalla—, nada más: ni email, ni nombre, ni
avatar. Se pide el scope vacío de GitHub a propósito: con eso ya alcanza.

Tres pasos más, además de los cuatro comandos de arriba.

### 1. Crear la OAuth App en GitHub

En **github.com → Settings → Developer settings → OAuth Apps → New OAuth
App**:

| Campo | Valor |
|---|---|
| Homepage URL | `https://sergiosanchezcustodio.github.io/extremadura-survivors/` |
| Authorization callback URL | `https://emerita-partidas.sergiosanchezcustodio.workers.dev/auth/github/callback` |

**La callback URL tiene que ser exacta**, letra por letra: el Worker la
lleva fija en `CALLBACK_GITHUB` (`worker.js`) precisamente para que nunca
pueda desajustarse con la que registra la petición.

Copia el **Client ID** y pégalo en `nube/wrangler.toml`, donde pone
`PEGA-AQUI-EL-CLIENT-ID-DE-GITHUB`. Genera además un **Client Secret** — no
lo pegues en ningún fichero del repositorio, es del paso siguiente.

### 2. Guardar el secreto

    npx wrangler secret put GITHUB_CLIENT_SECRET --config nube/wrangler.toml

Pide el valor por la terminal y no lo escribe en ningún sitio del
repositorio: el Client ID es público —viaja en la URL de cualquier login de
OAuth, lo ve cualquiera que mire la barra de direcciones— pero el secreto no
debe estarlo nunca.

### 3. Aplicar la tabla nueva y desplegar

    npx wrangler d1 execute emerita-partidas --remote --file=nube/esquema.sql
    npx wrangler deploy --config nube/wrangler.toml

El primer comando es el mismo de siempre —es idempotente, crear una tabla
que ya existe no hace nada— y ahora además crea `github_vinculos`.

### Comprobarlo

    node herramientas\probar-nube.js

Cubre las dos rutas nuevas —`/auth/github/inicio` y `/auth/github/callback`—
enteras, con un GitHub de mentira montado sustituyendo `fetch` global: que un
origen fuera de la lista blanca no redirige a ningún sitio y no toca la base
de datos, que la primera conexión enlaza el código con el que se vino, y que
una segunda conexión de la MISMA cuenta desde OTRO navegador —con OTRO
código local— recupera el código de la primera vez en vez de sustituirlo.

De verdad, solo se puede probar jugando: pulsa **G** en la pantalla de
partidas, autoriza en GitHub, y comprueba que vuelves con tu código —o con
el que ya tuvieras enlazado, si no es la primera vez—.

### Por qué el enlace cambia solo si el código nuevo tiene más juego

**Esto no fue así desde el principio, y el cambio salió de un fallo real
en producción** (28 de agosto de 2026): la primera versión fijaba el
enlace en la primera conexión, para siempre. Sergio conectó una vez desde
una ventana de incógnito sin haber jugado nada ahí, y su cuenta quedó
enlazada para siempre a una partida vacía — la de verdad, con horas
jugadas, se quedó sin enlazar y no había forma de arreglarlo salvo tocar la
base de datos a mano.

Ahora cada conexión **pesa las dos partidas** —la que ya estaba enlazada y
la del navegador desde el que se conecta— con la misma regla de siempre:
gana quien más ha jugado. Un código recién generado que nunca ha subido
nada pesa cero, así que no puede ganarle a uno con partidas de verdad. Y
esto es lo que lo hace **autocorregirse solo**: en cuanto esa cuenta se
conecta desde el navegador con la partida buena, el enlace se corrige él
mismo, sin tocar nada a mano.

### Por qué solo GitHub, de momento

Google exige, para publicar la aplicación fuera del modo de pruebas —que
tiene tope de 100 usuarios y no hace falta ninguna revisión—, una política
de privacidad propia y una revisión de Google que puede tardar días o
semanas. GitHub no pide nada de eso: un formulario y ya está. El día que
haga falta Google, es la misma idea con una tabla y unas rutas más.

## Y si algún día quieres apagarlo

`npx wrangler delete`. Los jugadores no se enteran: el juego deja de sincronizar
y sigue guardando en su navegador. El código de progreso —el que se copia y se
pega a mano, `js/core/progresoPortable.js`— sigue funcionando sin servidor, y por
eso se hizo primero.

## Los ficheros

| | |
|---|---|
| `worker.js` | La API entera: `GET /p/<codigo>`, `PUT /p/<codigo>` y el login con GitHub (`/auth/github/inicio`, `/auth/github/callback`). No hay ninguna ruta que liste nada. |
| `esquema.sql` | Las dos tablas: `partidas` (una fila por partida) y `github_vinculos` (la traducción "cuenta de GitHub → código", opcional). |
| `wrangler.toml` | El despliegue. Aquí van el `database_id` y el `GITHUB_CLIENT_ID`. |

Y la prueba, que corre sin desplegar nada y sin cuenta:

    node herramientas\probar-nube.js

Monta el Worker contra una base de mentira y le hace peticiones de verdad. Lo que
comprueba es lo que puede costarle la partida a alguien: que subir una copia peor
no machaque la buena, que un código con mala forma no llegue a la base, y que un
cuerpo enorme se rechace.
