# Extremadura Survivors

## Restricciones (no negociables)
- Cero dependencias externas. Solo HTML/CSS/JS con módulos ES6 nativos.
- Canvas 2D puro. Nada de WebGL ni librerías.
- Object pooling obligatorio: cero `new` durante la partida.
- Colisiones vía spatial hash. Nunca N².
- `datos/` contiene datos puros, jamás lógica.
- Resolución interna 480x270, escalado entero, imageSmoothingEnabled = false.
- Nombres de dominio en español, técnicos en inglés. Comentarios en español.
- El estado de LA PARTIDA EN CURSO vive solo en memoria (sin `sessionStorage`
  ni nada equivalente): con la misma semilla de RNG, dos partidas producen las
  mismas oleadas, y persistir estado a medio jugar rompería esa reproducibilidad.
  `localStorage` SÍ está permitido, pero únicamente para progreso META que
  sobrevive entre partidas —denarios, héroes y potenciadores desbloqueados—,
  nunca para nada que se lea durante la simulación de una partida activa.

## Comandos
- `.\herramientas\jugar.ps1` — levanta el servidor y abre el juego (`jugar.bat` a doble clic)
- `python -m http.server 8000` — servidor local a mano; abrir http://localhost:8000
- `.\herramientas\procesar-assets.ps1` — convierte `resources/` en sprites
- `.\herramientas\ver-assets.ps1 <ruta>` — describe imágenes sin abrirlas
- `.\herramientas\medir-lapida.ps1` — dónde caen los renglones del menú del título
- `.\herramientas\instalar-lanzador.ps1` — deja el comando `emerita` en su sitio
- `node herramientas/generar-imagen.js "<lo que sea>" -s <ruta>` — genera una
  imagen con Replicate (ver más abajo)

## Coste de contexto (no negociable)
El coste de un resultado de herramienta es su tamaño **multiplicado por las
llamadas que quedan en la sesión**: lo que entra se relee en cada paso
posterior. Una imagen cuesta hasta ~4.700 tokens y ya no se va; los 48 ficheros
JS del proyecto juntos suman 763 KB y son calderilla. Medido sobre una sesión
real: las imágenes eran el 70% del contexto y el 95% del gasto.

- **Leer código es gratis.** No racionar `Read` sobre `.js`, `.json`, `.md` ni
  `.ps1`. Leer `main.js` entero diecisiete veces costó menos que abrir un PNG.
- **Nunca abrir una imagen para comprobar un hecho.** Medidas, transparencia,
  centrado, fotogramas y colores los da `ver-assets.ps1` en una línea de texto.
  Abrir la imagen es sólo para opinar sobre el dibujo.
- **Nunca abrir dos veces la misma imagen.** Si ya se abrió en esta sesión, ya
  está en el contexto: volver a leerla es pagarla dos veces.
- **Captura de pantalla sólo para juzgar lo visual.** Si la pregunta tiene
  respuesta de texto —¿existe el elemento?, ¿qué valor tiene?, ¿hay error en
  consola?— va por `javascript_tool` o `read_console_messages`: ~1 KB frente a
  los ~260 KB de una captura. Y antes de capturar, encoger la ventana.
- **Los lotes de imágenes, a un subagente.** Revisar ocho hojas de sprites entra
  en el contexto del subagente y muere con él; a la sesión llega el resumen.
- **Una tarea, una sesión.** `/clear` al cerrar cada tarea. Un contexto que
  cruza días multiplica todo lo anterior por miles de llamadas.

## Imágenes generadas (Replicate)

Hay cuenta de Replicate y una herramienta para usarla:

```
node herramientas/generar-imagen.js "un anfora romana rota, pixel art" -s resources/generadas/anfora.png
```

El token vive en `.env` (`REPLICATE_API_TOKEN=r8_...`), que está en `.gitignore`
y no se sube nunca. Sin token la herramienta lo dice y no llama a la API.

- **Se puede usar sin preguntar** cuando Sergio pide una imagen o un boceto.
- **Esto NO es arte final.** El arte del juego lo dibuja Sergio; esto sirve para
  probar una idea, sacar una referencia o rellenar un hueco mientras tanto.
  Nada de lo que salga de aquí entra en `assets/` sin que él lo haya visto.
- **Cuesta dinero de verdad**, unos céntimos por imagen con el modelo por
  defecto (`flux-schnell`) y bastante más con los grandes. Cuatro variantes de
  una idea, sí; cuarenta a ver qué sale, no. Y si una tanda va a costar más que
  un café, se dice antes.
- **Lo generado NO se mira sin motivo.** Vale la regla de arriba: `ver-assets.ps1`
  da medidas, transparencia y colores en una línea de texto; abrir el PNG cuesta
  ~4.700 tokens y no se va. Se abre para OPINAR sobre el dibujo, no para
  comprobar que existe.
- `resources/generadas/` está en `.gitignore`: es un cajón de bocetos. Lo que
  valga se mueve a mano a su carpeta de `resources/` y ahí sí se versiona.

## Plan
El plan completo por fases está en prompt-emerita-survivors.md. Implementar UNA fase por sesión y parar.

Las cinco fases del plan están cerradas, y también la lista de armas y objetos
que pasó Sergio: cinco armas, veintiún objetos de gameplay y cinco de tienda.
Qué es cada cosa y **las decisiones que se tomaron por el camino —para no volver
a discutirlas— están en
[docs/armas-y-objetos.md](docs/armas-y-objetos.md)**, junto con lo único que
quedó fuera a propósito y el arte provisional que hay que sustituir.