# Dejar el servidor levantado

> Al terminar cualquier tarea hay que dejar el servidor levantado en http://localhost:8000/ para que Sergio lo pruebe
>
> Tipo: forma de trabajar.

Al terminar CUALQUIER tarea, dejar el servidor arrancado y decir el enlace:
`python herramientas/servidor.py` (o `.\herramientas\jugar.ps1`, que además abre
el navegador). Sergio lo pidió el 19/09/2026.

**Por qué:** lo primero que hace al leer el resumen es ir a probarlo, y si el
servidor no está levantado tiene que arrancarlo él. Los módulos ES no cargan por
`file://`, así que sin servidor no hay forma de abrir el juego.

**Cómo aplicarlo:** antes de dar por cerrada la tarea, comprobar que
http://localhost:8000/ responde y, si no, levantarlo en segundo plano. Terminar
el mensaje con el enlace. Ojo: `jugar.ps1` levanta el servidor Y abre una
pestaña; si ya hay uno en pie, basta con decirlo. Ver [Lanzador `extremadura`](lanzador-emerita.md).
