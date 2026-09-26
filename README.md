# La Mona

Juego de naipes de la costa ecuatoriana, para jugar en línea entre 2 y 4
personas que se unen a una sala con un código.

**Jugar: https://la-mona-ri4e.onrender.com**

Desplegado en Render. Ver [DESPLIEGUE.md](DESPLIEGUE.md).

El reglamento implementado está en **[REGLAS.md](REGLAS.md)**.

## Correr el proyecto

```bash
npm install
npm start          # http://localhost:3000
npm test           # 51 pruebas
```

Para desplegarlo en internet, ver **[DESPLIEGUE.md](DESPLIEGUE.md)**.

Para jugar desde el celular en la misma red WiFi, abre `http://<tu-ip>:3000`
(en macOS, tu IP sale con `ipconfig getifaddr en0`).

## Cómo está armado

```
core/       Motor puro: reglas, puntaje, baraja. Sin DOM ni red.
            Corre igual en Node y en el navegador.
servidor/   Salas, turnos y validación. Dueño único del estado.
cliente/    Interfaz. Vanilla JS, sin dependencias.
tests/      Motor + integración por WebSocket.
```

### Las animaciones

La mesa se repinta entera en cada actualización, así que las cartas no se
mueven solas: desaparecen y reaparecen. `cliente/animacion.js` usa la técnica
**FLIP** — apunta dónde estaba cada carta antes de repintar y, ya repintada, la
coloca de vuelta en su sitio viejo y la deja viajar. Las cartas se siguen entre
repintados por su atributo `data-carta`.

Las que desaparecen del todo son las que alguien levantó: se clonan en su
último sitio y vuelan hacia el asiento de quien las capturó. Un jugador sólo ve
volar las cartas **que podía ver**: si el rival capturó con una carta de su
mano, esa no vuela desde ningún lado, porque nunca estuvo en pantalla.

No se anima nada si la pestaña está oculta (el navegador congela las
animaciones y los clones se quedarían pegados) ni si el sistema pide movimiento
reducido.

Tres decisiones que sostienen todo lo demás:

1. **El servidor es la autoridad.** El cliente manda *intenciones*
   (`{tipo, cartaId, montones}`), nunca resultados. El servidor revalida todo
   con `core/reglas.js` y rechaza lo ilegal.
2. **Nadie recibe la mano de otro.** `vistaPara(partida, jugador)` es la barrera:
   devuelve tu mano completa y sólo el *conteo* de cartas de los demás.
3. **Un solo motor de reglas.** El mismo `core/` corre en el navegador (para
   iluminar jugadas válidas) y en el servidor (para validarlas). No hay dos
   versiones de las reglas que se puedan desincronizar.

## Estado

- [x] Motor de reglas y puntaje, con pruebas
- [x] Servidor de salas: códigos, reconexión, temporizador de turno
- [x] Lobby jugable en el navegador
- [x] Mesa jugable con toques, jugadores alrededor y cartas ajenas ocultas
- [x] Aguanta desconexiones: el mando pasa solo, y se vuelve al lobby al terminar
- [x] **Desplegado en https://la-mona-ri4e.onrender.com** — ver [DESPLIEGUE.md](DESPLIEGUE.md)
- [ ] Probar en un celular de verdad (sólo se verificó hasta 606px, el mínimo de Chrome)
- [x] Animación de las cartas al moverse
- [x] Cuenta atrás del turno en vivo
- [x] Sonido y vibración (se puede silenciar; la preferencia se recuerda)

## Variables de entorno

| Variable | Por defecto | Para qué |
|---|---|---|
| `PORT` | 3000 | Puerto del servidor |
| `SEGUNDOS_POR_TURNO` | 45 | Tiempo por turno; `0` desactiva el turno automático |
| `MINUTOS_SALA_VACIA` | 10 | Cuánto sobrevive una sala sin nadie conectado |

### Sonido

`cliente/sonido.js` genera los tonos con la Web Audio API: ni un archivo que
descargar. Los navegadores no dejan sonar hasta que la persona toca la
pantalla, así que el audio se despierta en el primer toque. El botón 🔊 de la
barra superior lo silencia y la preferencia se recuerda entre partidas.

### Cuenta atrás

El servidor sólo dice cuánto queda cuando manda un estado, y entre jugada y
jugada pasa un rato. Así que el navegador calcula el vencimiento del turno al
recibir cada estado y refresca sólo el reloj cuatro veces por segundo, sin
repintar la mesa. En los últimos cinco segundos el anillo se pone rojo y suena
un aviso por segundo.

## Cómo se juega en pantalla

1. Tocas una carta de tu mano: se levanta y se resaltan en verde los montones
   que sirven con ella.
2. Tocas los montones que quieres usar. Puedes tocar varios.
3. Aparecen sólo las acciones que de verdad valen para esa combinación exacta
   (LLEVAR, FORMAR 9, FILA DE 7, BOTAR). Con un As se aclara si juega como 1
   o como 14.

El resaltado verde es una *pista* acotada a combinaciones de hasta 3 montones;
los botones, en cambio, son exactos: salen de `validarJugada`, la misma función
con la que el servidor acepta o rechaza la jugada.

Los archivos `index.html`, `script.js` y `style.css` de la raíz son el prototipo
original y ya no se usan.
