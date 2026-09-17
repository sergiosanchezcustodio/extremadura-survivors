# Servidor local de desarrollo. Lo levanta herramientas\jugar.ps1.
#
#   python herramientas/servidor.py [puerto]
#
# Es `python -m http.server` con UNA diferencia, y la diferencia es el motivo de
# que este fichero exista: manda `Cache-Control: no-store` en todo.
#
# POR QUE. Con el servidor pelado, el navegador se queda con la copia que ya
# tiene y no vuelve a pedirla. Eso, en un repositorio donde el arte se sustituye
# encima del anterior -misma ruta, mismo nombre-, sale como el fallo mas caro de
# diagnosticar que hay: se cambia la lamina, se recarga y SIGUE SALIENDO LA
# VIEJA. No hay error, no hay aviso, y el fichero del disco es el nuevo, asi que
# se busca el fallo en el codigo, que es donde no esta. Ha pasado con los
# modulos .js y ha pasado con las ilustraciones de los menus.
#
# El coste de no cachear es que cada recarga vuelve a bajar los assets desde
# localhost, o sea desde el disco. En desarrollo eso no se nota; equivocarse de
# lamina durante media hora, si.
#
# Esto NO afecta a como se sirve el juego publicado: ahi el cacheo es deseable y
# lo pone quien lo aloje (ver docs/publicar.md).

import functools
import http.server
import os
import sys


class SinCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    manejador = functools.partial(SinCache, directory=raiz)
    with http.server.ThreadingHTTPServer(('', puerto), manejador) as servidor:
        print('Sirviendo %s en http://localhost:%d  (sin cache)' % (raiz, puerto))
        servidor.serve_forever()


if __name__ == '__main__':
    main()
