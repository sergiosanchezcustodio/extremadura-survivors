# LOS PANELES DEL CC THE LIGHTHOUSE: paredes y estanterías, de resources/ a
# assets/, al tamaño exacto que pinta el juego.
#
#   .\herramientas\paneles-lighthouse.ps1
#
# Sergio dibuja cada panel como una lámina VERTICAL vista de frente —una pared
# de 65x213, una estantería de 66x228— y el juego los pinta como CARA de lo
# que tiene altura en la perspectiva 3/4 (ver sistemas/sueloRejilla.js). Van
# PRÁCTICAMENTE A SU TAMAÑO, que es como los quiere Sergio: 64x224 píxeles, o
# sea 16 unidades de ancho (cuatro celdas de 4) por 56 de alto (catorce), y se
# pintan 1:1 con el píxel del monitor. La deformación es de un 2-5%, nada.
#
# Qué panel va con qué tienda NO se decide aquí: es dato del nivel
# (`paredesMapa`, `escaparatesMapa` y `estanteriasMapa` en
# js/datos/niveles/lighthouse.js). Aquí solo se convierten todos, con su número.
param(
  [string]$Origen = 'resources\stages\2',
  [string]$Salida = 'assets\niveles\lighthouse'
)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

$ANCHO = 64
$ALTO  = 224

function Reducir($rutaEntrada, $rutaSalida) {
  $src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $rutaEntrada))
  $dst = New-Object System.Drawing.Bitmap $ANCHO, $ALTO, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  # HighQualityBicubic con el modo de píxel a "media": es lo más parecido a la
  # media de área que da GDI+, y a esta reducción (x2) no se distingue.
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($src, 0, 0, $ANCHO, $ALTO)
  $g.Dispose()
  $dst.Save($rutaSalida, [System.Drawing.Imaging.ImageFormat]::Png)
  $dst.Dispose(); $src.Dispose()
}

$dirParedes = Join-Path $Salida 'paredes'
$dirEstantes = Join-Path $Salida 'estanterias'
New-Item -ItemType Directory -Force -Path $dirParedes  | Out-Null
New-Item -ItemType Directory -Force -Path $dirEstantes | Out-Null

$n = 0
foreach ($f in Get-ChildItem (Join-Path $Origen 'pared_tipo*.png')) {
  if ($f.BaseName -match 'pared_tipo(\d+)') {
    Reducir $f.FullName (Join-Path $dirParedes ("tipo" + $Matches[1] + ".png")); $n++
  }
}
foreach ($f in Get-ChildItem (Join-Path $Origen 'estanteria_*.png')) {
  if ($f.BaseName -match 'estanteria_([a-z]+)(\d+)') {
    Reducir $f.FullName (Join-Path $dirEstantes ($Matches[1] + $Matches[2] + ".png")); $n++
  }
}
Write-Host "$n paneles a ${ANCHO}x${ALTO} en $Salida\paredes y $Salida\estanterias"
