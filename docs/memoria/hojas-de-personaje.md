# Animación de personaje

> Sergio anima él mismo a los personajes; van por GIF de 16 fotogramas y las hojas 4x3 quedaron obsoletas.
>
> Tipo: decisión del proyecto.

Sergio aporta él mismo la animación de los cuatro personajes, y ha ido cambiando
de formato. Lo vigente desde el 2026-08-10 es **un GIF por personaje**
(`resources/characters/<Nombre>.gif`), ciclo de andar frontal de 16 fotogramas y
**sin pose de reposo**.

Las hojas en rejilla 4x3 (`<Nombre>-der.png` / `-izq.png`) fueron el formato
anterior y solo llegó a existir la de Eric. **Están obsoletas**: cuando Sergio
dibujó también `Eric.gif`, teniendo Eric ya sus hojas, quedó claro que el GIF las
sustituye. El camino de hojas sigue en la herramienta y funciona, pero no lo usa
nadie.

**Por qué importa:** el catálogo de `herramientas/procesar-assets.ps1` elige rama
por el campo que declares —`gifAnim` manda sobre `hojaDer`, y `hojaDer` sobre la
animación procedural de `cadera`—, así que los tres modos conviven sin tocar
código. **Cómo aplicarlo:** un personaje nuevo se declara con `gifAnim`, `idle` y
`nQuieto`; `src` tiene que seguir apuntando a la ILUSTRACIÓN grande, porque de
ahí salen el retrato y el cuerpo entero de la ficha a resolución completa. El
reposo se sintetiza (`AnyadirReposo`) porque el GIF no lo trae: si alguna tanda
futura sí lo incluye, hay que declarar los clips en vez de sintetizarlo.

Ver [Dirección artística: todo animado](direccion-artistica-animada.md).
