// EL MAPA DEL CC THE LIGHTHOUSE. Generado — NO se edita a mano.
//
// Sale de `node herramientas/mapa-lighthouse.js generar` (semilla 20260919) y se
// regenera desde Tiled con `... importar` después de retocar
// resources/mapas/lighthouse.tmj. Ver docs/anadir-un-nivel.md.
//
// Datos puros, como todo lo de datos/: una rejilla de caracteres y dos listas
// de puntos. Quién decide qué significa cada símbolo es sistemas/rejillaMapa.js.

// Lado de la celda en unidades LÓGICAS. Coincide con TILE por comodidad de
// lectura, no por obligación del motor.
export const CELDA = 32;

// Qué es cada carácter. `solido` es lo único que mira la simulación; el resto
// es el tipo de suelo, que hoy solo elige un color en el prototipo.
export const LEYENDA = {
  '#': { nombre: 'pared',        solido: true  },
  '.': { nombre: 'pasillo',      solido: false },
  'a': { nombre: 'hipermercado', solido: false },
  'b': { nombre: 'mueblería',    solido: false },
  'c': { nombre: 'tienda',       solido: false },
  'd': { nombre: 'ocio',         solido: false },
  'f': { nombre: 'plaza',        solido: false },
  'S': { nombre: 'salida',       solido: false }
};

export const MAPA = {
  ancho: 112,
  alto: 72,
  // Dónde aparecen los jugadores, en celdas.
  inicio: { x: 47, y: 32 },
  // Las bocas de la fachada. Hoy son señalización: se gana venciendo al jefe
  // final, que entra por una de ellas reventando la pared.
  salidas: [{ x: 81, y: 0 }, { x: 53, y: 71 }, { x: 0, y: 25 }, { x: 111, y: 24 }],
  filas: [
  '################################################################################SSS#############################',
  '#########################...##############....######....########################....############################',
  '##dddddddddddddddddddddd#...#dddddddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...#dddddddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...#dddddddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aa#####################aa##',
  '##dddddddddddddddddddddd#...#dddddddddddd#.....cccc#....#bbbb#################b#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...#dddddddddddd#.....cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddd##dddd#...#dddddddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aa#####################aa##',
  '##dddddddddddddddd##dddd#...#ddd##ddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddd##dddd#...#ddd##ddddddd#....#cccc#....#b#################bbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddd##dddddddddd#...#ddd####ddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aa#####################aa##',
  '##dddddddddd##dddddddddd#...#ddd####ddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#.....aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddd##dddddddddd#...#ddd####ddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#.....aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...#dddddddddddd#....#cccc#....#bbbb#################b#....#aa#####################aa##',
  '##dddddddddddddddddd##dd#...#dddddddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddd##dd#...#dddddddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...#dddddddddddd#....#cccc#....#bbbbbbbbbbbbbbbbbbbbbb#....#aa#####################aa##',
  '##dddddddddddddddddddddd....###########..#....######....#b#################bbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd................................#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...............................#bbbbbbbbbbbbbbbbbbbbbb#....#aa#####################aa##',
  '##dddddddddddddddddddddd#................................bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...############...#########.....bbbb#################b#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....#aaaaaaaaaaaaaaaaaaaaaaaaa##',
  '##dddddddddddddddddddddd#...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....######################..###S',
  'S###..###################...#ddd###dddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#...............................S',
  'S...........................#ddd###dddd#...#fffffff#....#b#################bbbb#...............................S',
  'S...........................#ddd###dddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#...............................#',
  '#...........................#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....################....########',
  '###############...#######...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....#dddddddddddddd#....#ccccc##',
  '##dddddddddddd#...#ccccc#...#dddddddddd#...#fffffff#....#bbbb#################b.....#dddddddddddddd.....#ccccc##',
  '##dddddddddddd#...#ccccc#...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb.....#dddddd##dddddd.....#ccccc##',
  '##dddddddddddd#...#ccccc#...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....#ddddd###dddddd#....#ccccc##',
  '##dddddddddddd#...#ccccc#...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....#ddddd###dddddd#....#ccccc##',
  '##dddd###ddddd#...#ccccc#...#dddddddddd#...#fffffff#....#b#################bbbb#....#ddddd##ddddddd#....#ccccc##',
  '##dddd#####ddd#...#ccccc#...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....#ddddd##ddddddd#....#ccccc##',
  '##dddddd###ddd#...#ccccc#...#dddddddddd#...#fffffff.....#bbbbbbbbbbbbbbbbbbbbbb#....#dddd###ddddddd#....#ccccc##',
  '##dddddd###ddd#...#ccccc#...#dddddddddd#...#fffffff.....#bbbbbbbbbbbbbbbbbbbbbb#....#dddd###ddddddd#....#ccccc##',
  '##dddddddddddd#...#ccccc#...#dddddddddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....#dddddddddddddd#....#ccccc##',
  '##dddddddddddd#...#ccccc#....dd####dddd#...#fffffff#....#bbbbbbbbbbbbbbbbbbbbbb#....#dddddddddddddd#....#ccccc##',
  '##dddddddddddd#...#ccccc#....dd####dddd#...#fffffff#....########################....################....###..###',
  '##dddddddddddd#...#ccccc....#dd####dddd#...#fffffff#...........................................................#',
  '##dddddddddddd#...#ccccc....#dddddddddd#...#fffffff#...........................................................#',
  '##dddddddddddd#...#ccccc#...#dddddddddd#...#fffffff#...........................................................#',
  '###########..##...#######...#######..###...#########...........................................................#',
  '#.......................................................##########..###########...########..####################',
  '#.......................................................#aaaaaaaaaaaaaaaaaaaaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '#.......................................................#aaaaaaaaaaaaaaaaaaaaa#....bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##############..###########...###..##....###########....#aa#aa#aa#aa#aa#aa#aaa#....bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbb######################b##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbb###################b#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#b######################bbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#.....ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##b###################bbbb#...#ccccc#.....ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbb######################b##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb....#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbb###################b....#ccccc#....#ccccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#######....###########....#aa#aa#aa#aa#aa#aa#aaa#...#b######################bbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#.............................#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#.............................#aa#aa#aa#aa#aa#aa#aaa....#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##b###################bbbb#.............................#aa#aa#aa#aa#aa#aa#aaa....#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#.............................#aa#aa#aa#aa#aa#aa#aaa#...#bbbb######################b##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...########....####..####....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#cccccc#....#cccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#cccccc#....#cccccccc#....#aa#aa#aa#aa#aa#aa#aaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#cccccc.....#cccccccc#....#aaaaaaaaaaaaaaaaaaaaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '##bbbbbbbbbbbbbbbbbbbbbbbb#...#cccccc.....#cccccccc#....#aaaaaaaaaaaaaaaaaaaaa#...#bbbbbbbbbbbbbbbbbbbbbbbbbbb##',
  '###########################...########....##########....#######################...##############################',
  '####################################################SSS#########################################################'
  ]
};
