# Publicar una versión

Dos sitios, dos mecanismos distintos. GitHub Pages se actualiza solo; itch.io
hay que subirlo a mano.

---

## GitHub Pages — automático

**https://sergiosanchezcustodio.github.io/extremadura-survivors/**

Sirve la rama `master` tal cual, desde la raíz. No hay que hacer nada: cada
`git push` reconstruye el sitio en un minuto o dos. Funciona porque el juego no
tiene paso de build y todas las rutas de `index.html` son relativas.

El `.nojekyll` de la raíz evita que Pages pase el repositorio por Jekyll antes
de servirlo. Hoy no hay ningún fichero que empiece por guion bajo —que es lo que
Jekyll se salta sin avisar— pero el día que lo haya, el fallo sería un 404
silencioso en un asset, y eso no se ve hasta que alguien juega.

Comprobar que ha salido:

```powershell
gh api repos/sergiosanchezcustodio/extremadura-survivors/pages/builds/latest --jq '.status'
```

---

## itch.io — a mano

**https://sergiosanchezcustodio.itch.io/extremadura-survivors**

```powershell
powershell -ExecutionPolicy Bypass -File herramientas\empaquetar-web.ps1
```

Deja `dist/extremadura-survivors-web.zip`, unos 26 MB. Se sube en **Edit game →
Uploads**, arrastrando el `.zip`, marcando **"This file will be played in the
browser"** y dejando **960 × 540** como tamaño del embed (o cualquier múltiplo
entero de 480 × 270).

El zip lleva el contenido **suelto en la raíz**, no dentro de una subcarpeta:
itch.io busca `index.html` justo ahí y si no lo encuentra, el juego no arranca.

Y lleva solo lo que el juego lee —`index.html`, `css/`, `js/`, `assets/`—; nada
de `resources/`, `herramientas/`, `manual/` ni `docs/`, que son utillaje de
desarrollo.

Más cómodo que el zip: **`herramientas\publicar-itch.ps1`** hace la build y la
sube con butler de una vez, y como sube la CARPETA en vez del zip, solo manda lo
que ha cambiado — medido, una republicación con un asset tocado son 780 KB en
vez de 27 MB.

### La ficha, en cambio, es a mano

**itch.io no tiene API de escritura para la ficha de un juego.** El título, la
descripción, los tags, la portada y el tamaño del embed solo se tocan por el
formulario web; y la credencial que butler deja guardada está limitada a subir
builds, así que ni siquiera puede leer el perfil (`api key does not permit`).

Lo que hay que pegar ahí está escrito y listo en **[itch/ficha.md](itch/ficha.md)**,
con la portada ya recortada a los 630x500 que pide itch en `itch/portada.jpg`.

---

## EL SELLO DEL ATLAS: lo que rompe una publicación sin que se note

`js/core/recursos.js` cuelga de cada imagen un sello anticaché: `?v=` más el
campo `version` de `assets/atlas.json`, que reescribe `procesar-assets.ps1` en
cada pasada.

Existe porque ni `python -m http.server` ni un `file://` mandan cabeceras de
caducidad, así que el navegador decide por su cuenta cuánto se queda con una
imagen — y con ficheros de días, esa heurística son horas.

**Si se cambia un asset y no sube la versión del atlas, el juego sigue pidiendo
la URL vieja y el navegador le sirve su copia cacheada.** Ya pasó: se cambió la
ilustración del menú entera, se recargó, y seguía saliendo la anterior con el
recuadro de selección nuevo encima. El fichero en disco era el correcto; la URL,
no.

Así que al tocar assets:

1. Ejecutar `procesar-assets.ps1`.
2. **Conservar el cambio de `assets/atlas.json`.** Regenera los 26 assets y
   muchos salen idénticos en contenido, así que revertir ese ruido es razonable
   — pero `atlas.json` NO es ruido: es la marca que invalida la caché.
3. Comprobar el sello antes de publicar:

```powershell
Select-String -Path assets\atlas.json -Pattern '"version"'
```

---

## Antes de publicar

- [ ] Las capturas de `docs/capturas/` siguen enseñando lo que hay. Se
      rehacen jugando y fotografiando, y se normalizan con
      `herramientas\montar-galeria.ps1 -Capturas`.
- [ ] Las láminas de `docs/` (bestiario, arsenal, potenciadores, mascotas) se
      rehacen solas con `montar-galeria.ps1` y **leen `js/datos/`**, así que un
      arma o un potenciador nuevo entra sin tocarlas a mano.
- [ ] El manual (`manual/manual-jugador.html`) menciona los controles que hay.
- [ ] El sello del atlas ha subido si se ha tocado algún asset.
