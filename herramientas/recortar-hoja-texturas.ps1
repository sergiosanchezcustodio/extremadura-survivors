# RECORTA UNA HOJA DE CONTACTO DE TEXTURAS en sus tiles y los deja al tamaño
# que pide el juego, escalados a vecino más cercano.
#
#   .\herramientas\recortar-hoja-texturas.ps1 resources\stages\2\imagenes_nivel2.png
#
# La hoja es la que devuelve una IA con el prompt de doce texturas del nivel 2
# (ver docs/anadir-un-nivel.md, "El suelo se dibuja con texturas"): una rejilla
# de 4x3 recuadros sobre fondo oscuro, con su etiqueta debajo. Aquí no se
# supone ninguna medida: se busca el fondo y se sacan las cajas de lo que no es
# fondo, se descartan las que son texto (bajas) y se ordenan por filas.
#
# El tamaño de salida es POR TEXTURA, siempre múltiplo de la celda (8): las que
# llevan una rejilla dibujada —baldosas, tablones— salen a un tamaño en el que
# cada baldosa cae en un número entero de píxeles, o el vecino más cercano las
# deja cojas. sistemas/sueloRejilla.js acepta cualquier múltiplo de 8.
param(
  [Parameter(Mandatory = $true)][string]$Hoja,
  [string]$Salida = 'assets\niveles\lighthouse'
)
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'

# Nombre de fichero y lado de salida, en el orden de la hoja (fila a fila).
$TILES = @(
  @('pasillo',      96), @('hipermercado', 96), @('muebleria',   96), @('tienda',      64),
  @('ocio',         64), @('plaza',        96), @('pared',       64), @('estanteria',  64),
  @('mostrador',    64), @('cierre_gris',  64), @('cierre_azul', 64), @('salida',      64)
)

$img = [System.Drawing.Bitmap]::FromFile((Resolve-Path $Hoja))
$w = $img.Width; $h = $img.Height

# El fondo es el color de la esquina. "Es fondo" = se parece a ese color.
$fondo = $img.GetPixel(0, 0)
function EsFondo($c) {
  ([Math]::Abs($c.R - $fondo.R) + [Math]::Abs($c.G - $fondo.G) + [Math]::Abs($c.B - $fondo.B)) -lt 40
}

# Máscara de no-fondo, muestreada cada 2 px para no tardar.
$P = 2
$mw = [int][Math]::Floor($w / $P); $mh = [int][Math]::Floor($h / $P)
$mask = New-Object 'bool[,]' $mw, $mh
for ($y = 0; $y -lt $mh; $y++) { for ($x = 0; $x -lt $mw; $x++) {
  $mask[$x, $y] = -not (EsFondo $img.GetPixel($x * $P, $y * $P))
} }

# Filas: bandas de Y con algo que no sea fondo; dentro de cada banda, bandas de X.
function Bandas($n, $hay) {
  $r = New-Object System.Collections.ArrayList; $ini = -1
  for ($i = 0; $i -le $n; $i++) {
    $v = if ($i -lt $n) { & $hay $i } else { $false }
    if ($v -and $ini -lt 0) { $ini = $i }
    elseif (-not $v -and $ini -ge 0) { [void]$r.Add(@($ini, ($i - 1))); $ini = -1 }
  }
  return $r
}
$cajas = New-Object System.Collections.ArrayList
$filas = Bandas $mh { param($y) for ($x = 0; $x -lt $mw; $x++) { if ($mask[$x, $y]) { return $true } }; $false }
foreach ($f in $filas) {
  $y0 = $f[0]; $y1 = $f[1]
  if (($y1 - $y0) * $P -lt 60) { continue }          # una línea de texto, no un tile
  $cols = Bandas $mw { param($x) for ($y = $y0; $y -le $y1; $y++) { if ($mask[$x, $y]) { return $true } }; $false }
  foreach ($c in $cols) {
    if (($c[1] - $c[0]) * $P -lt 60) { continue }
    [void]$cajas.Add(@(($c[0] * $P), ($y0 * $P), (($c[1] - $c[0] + 1) * $P), (($y1 - $y0 + 1) * $P)))
  }
}
if ($cajas.Count -ne $TILES.Count) {
  Write-Host "Se esperaban $($TILES.Count) recuadros y se han encontrado $($cajas.Count):"
  $cajas | ForEach-Object { Write-Host ("  x={0} y={1} {2}x{3}" -f $_) }
  exit 1
}

New-Item -ItemType Directory -Force $Salida | Out-Null
for ($i = 0; $i -lt $TILES.Count; $i++) {
  $nombre = $TILES[$i][0]; $lado = $TILES[$i][1]
  $b = $cajas[$i]
  # Se recorta un CUADRADO centrado —los recuadros de la hoja no suelen serlo
  # del todo, y estirar una baldosa la deja rectangular— y se come un borde de
  # 3 px: el recuadro suele llevar un filete o un difuminado contra el fondo, y
  # eso en un tile que repite es una raya.
  $lado0 = [Math]::Min($b[2], $b[3]) - 6
  $rect = New-Object System.Drawing.Rectangle ($b[0] + [int](($b[2] - $lado0) / 2)), ($b[1] + [int](($b[3] - $lado0) / 2)), $lado0, $lado0
  $dest = New-Object System.Drawing.Bitmap $lado, $lado
  $g = [System.Drawing.Graphics]::FromImage($dest)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $lado, $lado), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $ruta = Join-Path $Salida "$nombre.png"
  $dest.Save((Join-Path (Get-Location) $ruta), [System.Drawing.Imaging.ImageFormat]::Png)
  $dest.Dispose()
  Write-Host ("  {0,-14} de x={1} y={2} {3}x{4}  ->  {5}x{5}  {6}" -f $nombre, $b[0], $b[1], $b[2], $b[3], $lado, $ruta)
}
$img.Dispose()
