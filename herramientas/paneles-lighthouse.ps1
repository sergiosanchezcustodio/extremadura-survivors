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

function Reducir($rutaEntrada, $rutaSalida, $ancho = $ANCHO, $alto = $ALTO) {
  $src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $rutaEntrada))
  $dst = New-Object System.Drawing.Bitmap $ancho, $alto, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  # HighQualityBicubic con el modo de píxel a "media": es lo más parecido a la
  # media de área que da GDI+, y a esta reducción (x2) no se distingue.
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.DrawImage($src, 0, 0, $ancho, $alto)
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

# LOS SUELOS: `sueloN.png`, baldosas que repiten. Sergio las dibuja a unos
# 164x140 y no cuadradas; el motor quiere un cuadrado múltiplo de la celda
# (32 unidades = 128 px), así que se llevan a 128x128. El estirado es pequeño
# y, en las que son cuadrícula, deja las baldosas más cuadradas que antes.
$dirSuelos = Join-Path $Salida 'suelos'
New-Item -ItemType Directory -Force -Path $dirSuelos | Out-Null
# LOS ESCAPARATES DE CRISTAL: `pared_tienda1..8.png`, los ventanales que
# Sergio dibujó el 22/09/2026 para la pared que una tienda enseña al pasillo.
#
# EL CRISTAL VA AL 25% DE OPACIDAD (75% transparente, lo pidió él), y el MARCO
# se queda opaco. Cuál es cuál no se sabe de antemano —el marco es más ancho en
# unos que en otros—, así que se mide: desde cada borde hacia dentro, la
# primera fila o columna cuyo color se parece al del centro del cristal es
# donde empieza el cristal. Con el panel ya reducido, que es donde importa: si
# el marco sale de dos píxeles, de dos píxeles se ve.
#
# Se mide DESPUES de reducir y no antes por lo mismo: reducir un borde ya
# transparente mezcla el marco con el cristal y deja el canto lavado.
function CristalTransparente($bmp) {
  $w = $bmp.Width; $h = $bmp.Height
  # Color del cristal: el centro del panel.
  $c = $bmp.GetPixel([int]($w / 2), [int]($h / 2))
  function Parecido($p) {
    ([Math]::Abs($p.R - $c.R) + [Math]::Abs($p.G - $c.G) + [Math]::Abs($p.B - $c.B)) -lt 70
  }
  # Grosor del marco por cada lado, con un mínimo de 2 px: un panel sin marco
  # visible se leería como un agujero en la pared.
  $izq = 2; $der = 2; $arr = 2; $aba = 2
  $my = [int]($h / 2); $mx = [int]($w / 2)
  # Y ACOTADO: el reflejo diagonal del cristal llega hasta el borde en algunos
  # paneles, y el barrido lo toma por marco —quince pixeles de los sesenta y
  # cuatro en el rosa—. Un marco de mas de 6 px de lado no lo tiene ninguno; el
  # de abajo si, porque varios llevan zocalo, y ahi el tope es 12.
  function Acotar($v, $max) { return [Math]::Min($max, [Math]::Max(2, $v)) }
  for ($x = 0; $x -lt [int]($w / 3); $x++) { if (Parecido $bmp.GetPixel($x, $my)) { $izq = Acotar $x 6; break } }
  for ($x = 0; $x -lt [int]($w / 3); $x++) { if (Parecido $bmp.GetPixel($w - 1 - $x, $my)) { $der = Acotar $x 6; break } }
  for ($y = 0; $y -lt [int]($h / 3); $y++) { if (Parecido $bmp.GetPixel($mx, $y)) { $arr = Acotar $y 12; break } }
  for ($y = 0; $y -lt [int]($h / 3); $y++) { if (Parecido $bmp.GetPixel($mx, $h - 1 - $y)) { $aba = Acotar $y 12; break } }

  for ($y = $arr; $y -lt $h - $aba; $y++) {
    for ($x = $izq; $x -lt $w - $der; $x++) {
      $p = $bmp.GetPixel($x, $y)
      $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(64, $p.R, $p.G, $p.B))
    }
  }
  return "$izq,$arr,$der,$aba"
}

$dirEscaparates = Join-Path $Salida 'escaparates'
New-Item -ItemType Directory -Force -Path $dirEscaparates | Out-Null
$ne = 0
foreach ($f in Get-ChildItem (Join-Path $Origen 'pared_tienda*.png')) {
  if ($f.BaseName -match '^pared_tienda(\d+)$') {
    $salidaPng = Join-Path $dirEscaparates ("tienda" + $Matches[1] + ".png")
    $src = [System.Drawing.Bitmap]::FromFile($f.FullName)
    $dst = New-Object System.Drawing.Bitmap $ANCHO, $ALTO, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.DrawImage($src, 0, 0, $ANCHO, $ALTO)
    $g.Dispose(); $src.Dispose()
    $marco = CristalTransparente $dst
    $dst.Save($salidaPng, [System.Drawing.Imaging.ImageFormat]::Png)
    $dst.Dispose()
    Write-Host ("  escaparate " + $Matches[1] + ": marco " + $marco)
    $ne++
  }
}
Write-Host "$ne escaparates de cristal a ${ANCHO}x${ALTO} (cristal al 25%) en $dirEscaparates"

$ns = 0
foreach ($f in Get-ChildItem (Join-Path $Origen 'suelo*.png')) {
  if ($f.BaseName -match '^suelo(\d+)$') {
    Reducir $f.FullName (Join-Path $dirSuelos ("suelo" + $Matches[1] + ".png")) 128 128; $ns++
  }
}
Write-Host "$ns suelos a 128x128 en $dirSuelos"
