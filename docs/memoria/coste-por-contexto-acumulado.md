# Coste: manda el contexto acumulado

> Las reglas de coste de contexto viven en CLAUDE.md; esto es de dónde salieron y qué se midió.
>
> Tipo: forma de trabajar.

Las reglas operativas están en la sección "Coste de contexto" de `CLAUDE.md`, que se carga en cada sesión. Esto guarda solo la medición de la que salieron, para no volver a discutirla.

Sesión del 2 al 14 de agosto de 2026, 3.010 llamadas: lectura de caché 1.451M tokens, escritura 47,6M, salida 2,7M — unos 1.270 $ a precio de lista, de los que lo que yo escribí fue el 5%. El contexto llegó a 940k tokens por llamada.

El desglose que importa, porque es contraintuitivo: de los 45,2 MB de `Read`, **36,8 eran PNG y 5,9 GIF; solo 1,2 MB eran los 111 `Read` de código**. Más las 188 capturas de navegador, 65,7 MB. En tokens, las 219 imágenes eran ~657k de los 940k del contexto: **el 70%**. Leer `main.js` entero diecisiete veces costó 230 KB; abrir `ruleta-disco.png` una vez costó 620 KB.

**Por qué:** el instinto de "leer menos ficheros para ahorrar" es falso aquí y hace perder contexto útil a cambio de nada. Lo caro son las imágenes, y lo son porque se releen en cada llamada posterior de la sesión. El lanzador hacía `claude --continue`, así que nunca empezaba limpio — corregido, ver [Lanzador `extremadura`](lanzador-emerita.md).

**Cómo aplicarlo:** existe `herramientas\ver-assets.ps1` (medidas, alfa, caja del contenido, fotogramas, colores, en texto) — usarlo en lugar de abrir imágenes para comprobar hechos. Si Sergio vuelve a preguntar por gasto, medir sobre el `.jsonl` de la sesión en vez de estimar: los campos `cache_read_input_tokens` y `cache_creation_input_tokens` de cada mensaje `assistant` dan la cifra exacta.
