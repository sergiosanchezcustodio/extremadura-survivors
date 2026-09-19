// EL REGISTRO DE NIVELES. Datos puros: aquí no se decide nada, solo se dice
// qué archivos de datos/niveles/ existen y en qué orden se recorre la región.
//
// Antes de esto, main.js importaba `merida.js` por su nombre y en una sola
// línea fija. El contrato de docs/anadir-un-nivel.md decía que añadir un nivel
// era escribir un archivo de datos, y era verdad para las oleadas, la paleta y
// el tema — pero no para JUGARLO: había que editar ese import a mano. Con este
// índice, añadir Cáceres es escribir `caceres.js` y añadir su import a la lista
// de abajo. Nada más.
//
// POR QUÉ SE CARGAN TODOS AL ARRANCAR Y NO EL ELEGIDO. Un nivel es un objeto
// literal de unos pocos KB —oleadas, colores, decoración— y la pantalla de
// selección necesita el nombre, el subtítulo y la duración de TODOS para
// pintar la lista. Cargar solo el elegido obligaría a repetir esos tres campos
// aquí, y entonces habría dos verdades: la del índice y la del nivel. El arte
// —el suelo pintado, que sí pesa— NO se carga aquí; lo carga Recursos cuando
// se entra en el nivel.
const MODULOS = [
  () => import('./merida.js'),
  () => import('./lighthouse.js')
];

// LO QUE FALTA DE LA REGIÓN: los sitios anunciados y todavía sin escribir.
//
// Salen en la pantalla de elegir nivel, apagados y sin poder entrar. No son
// niveles a medias ni datos de mentira —aquí no hay oleadas, ni paleta, ni
// jefes—: son NOMBRES, y están por lo que enseña una lista con el camino
// entero. Un mapa que solo muestra donde ya puedes ir no es un mapa.
//
// Cuando uno de estos se escriba de verdad, se le añade su `import` arriba y se
// le quita el renglón de aquí. La pantalla no se entera: dibuja lo que le den.
//
// SON LOS SEIS QUE CIERRAN EL RECORRIDO, y van en el orden en que se juegan.
// Sergio los fijó en septiembre de 2026 y sustituyen a la lista anterior
// —Cáceres, Trujillo, Monfragüe, Guadalupe y Alcántara—, que era un puñado de
// sitios de Extremadura puestos como marcador de sitio antes de que hubiera
// decidido de qué iba cada uno.
//
// De qué va cada uno, quién es su jefe y qué falta por decidir está en
// docs/niveles.md. Aquí solo van los NOMBRES porque es lo único que la pantalla
// enseña de un nivel que todavía no existe.
export const PROXIMOS = [
  { nombre: 'Monfragüe' },
  { nombre: 'Necrópolis' },
  { nombre: 'Casas del Turuñuelo' },
  { nombre: 'Granadilla' },
  { nombre: 'Las Hurdes' }
];

export const Niveles = {
  // Los NIVEL de cada módulo, en el orden de MODULOS. Vacío hasta `cargar`.
  lista: [],

  async cargar() {
    const mods = await Promise.all(MODULOS.map((abrir) => abrir()));
    this.lista = mods.map((m) => m.NIVEL);
    return this.lista;
  },

  por(id) {
    for (let i = 0; i < this.lista.length; i++) {
      if (this.lista[i].id === id) return this.lista[i];
    }
    return null;
  },

  // ¿SE PUEDE ENTRAR? Un nivel puede declarar `requiere: '<id de otro nivel>'`
  // y queda cerrado hasta que ese otro se haya TERMINADO (victoria, no muerte
  // en el minuto 28: ver MetaProgreso.superarFase). Un nivel sin `requiere`
  // está siempre abierto, que es el caso de Mérida.
  //
  // `fases` es el mapa id -> true de MetaProgreso. Se pasa en vez de importarlo
  // porque datos/ no conoce el progreso: aquí solo se sabe QUÉ hace falta, no
  // quién lo ha conseguido.
  abierto(nivel, fases) {
    return !nivel.requiere || !!(fases && fases[nivel.requiere]);
  },

  // Los que hoy se pueden jugar. Con uno solo en la lista, main.js se salta la
  // pantalla de selección entera: una pantalla con una sola fila solo sirve
  // para pulsar otra vez.
  abiertos(fases) {
    return this.lista.filter((n) => this.abierto(n, fases));
  }
};
