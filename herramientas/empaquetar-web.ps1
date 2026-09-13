# Empaqueta el juego como build WEB para subir a itch.io (o cualquier host
# HTML5 estatico).
#
# A DIFERENCIA de empaquetar.ps1 (que mete Chromium entero dentro de un .exe
# para que funcione sin navegador), esto NO lleva runtime: solo el juego, tal
# cual lo sirve `python -m http.server`. itch.io sirve el contenido del zip
# por http igual que ese servidor, asi que los modulos ES6 cargan sin
# problema -lo que NO funcionaria es abrir el zip descomprimido a doble clic
# sobre index.html (file://), por la misma razon de siempre.
#
# Sale un zip de unos 25-30 MB (nada de Chromium) con exactamente lo que lee
# el juego: index.html, css/, js/, assets/. Nada de resources/, herramientas/,
# manual/, docs/ ni el propio repo: eso es utillaje de desarrollo, no parte
# del juego.
#
#   powershell -ExecutionPolicy Bypass -File herramientas\empaquetar-web.ps1
#
# El zip resultante se sube en itch.io > Edit game > Uploads > arrastrar el
# .zip, marcando "This file will be played in the browser" y dejando 480x270
# (o el multiplo entero que se prefiera) como resolucion del embed.

$ErrorActionPreference = 'Stop'
$RAIZ   = Split-Path -Parent $PSScriptRoot
$SALIDA = Join-Path $RAIZ 'dist\web'
$ZIP    = Join-Path $RAIZ 'dist\extremadura-survivors-web.zip'

if (Test-Path $SALIDA) { Remove-Item $SALIDA -Recurse -Force }
New-Item -ItemType Directory -Force -Path $SALIDA | Out-Null

Copy-Item (Join-Path $RAIZ 'index.html') $SALIDA -Force
foreach ($d in @('css', 'js', 'assets')) {
    Copy-Item (Join-Path $RAIZ $d) $SALIDA -Recurse -Force
}

if (Test-Path $ZIP) { Remove-Item $ZIP -Force }
# El contenido va SUELTO dentro del zip (index.html en la raiz), no metido en
# una subcarpeta: itch.io busca index.html justo ahi y si no lo encuentra en
# la raiz del zip, el juego no arranca.
Compress-Archive -Path (Join-Path $SALIDA '*') -DestinationPath $ZIP -CompressionLevel Optimal

$total = (Get-ChildItem $SALIDA -Recurse -File | Measure-Object Length -Sum).Sum
"", "Build web en:  $SALIDA"
"Sin comprimir: {0:N1} MB" -f ($total / 1MB)
"Zip:           $ZIP  ({0:N1} MB)" -f ((Get-Item $ZIP).Length / 1MB)
