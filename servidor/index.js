import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { RegistroDeSalas } from './salas.js';
import { DEL_CLIENTE, DEL_SERVIDOR, limpiarNombre } from '../core/protocolo.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(AQUI, '..');

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Sólo se sirve lo que el navegador necesita: el cliente y el motor de reglas.
const CARPETAS_PUBLICAS = ['cliente', 'core'];

function servirEstatico(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let ruta = decodeURIComponent(url.pathname);

  // Comprobación de salud para la plataforma de despliegue.
  if (ruta === '/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    // La máquina se informa a propósito: si dos jugadores ven ids distintos,
    // hay más de una instancia y las salas no se ven entre sí.
    res.end(JSON.stringify({
      ok: true,
      activo: Math.round(process.uptime()),
      maquina: process.env.FLY_MACHINE_ID ?? process.env.RENDER_INSTANCE_ID ?? 'local',
      salas: servidorActual?.registro.salas.size ?? 0,
    }));
    return;
  }

  // La página vive en /cliente/ y enlaza su CSS y su JS con rutas relativas,
  // así que la raíz redirige en vez de servir el HTML desde otro nivel.
  if (ruta === '/' || ruta === '') {
    res.writeHead(302, { Location: '/cliente/' }).end();
    return;
  }
  if (ruta.endsWith('/')) ruta += 'index.html';

  const destino = path.normalize(path.join(RAIZ, ruta));
  const relativa = path.relative(RAIZ, destino);
  const permitida = CARPETAS_PUBLICAS.some(
    (c) => relativa === c || relativa.startsWith(c + path.sep),
  );
  if (!permitida || relativa.startsWith('..')) {
    res.writeHead(404).end('No encontrado');
    return;
  }

  fs.stat(destino, (errStat, info) => {
    if (errStat || !info.isFile()) {
      res.writeHead(404).end('No encontrado');
      return;
    }

    // Sin cabeceras de caché el navegador decide por su cuenta y puede quedarse
    // con el JS viejo tras un redespliegue: cliente antiguo contra servidor
    // nuevo. Con `no-cache` sí guarda, pero pregunta siempre si cambió, y la
    // marca hace que la respuesta sea un 304 vacío cuando no cambió.
    const marca = `W/"${info.size}-${info.mtimeMs}"`;
    if (req.headers['if-none-match'] === marca) {
      res.writeHead(304, { ETag: marca, 'Cache-Control': 'no-cache' }).end();
      return;
    }

    fs.readFile(destino, (err, datos) => {
      if (err) {
        res.writeHead(404).end('No encontrado');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(destino)] ?? 'application/octet-stream',
        'Cache-Control': 'no-cache',
        ETag: marca,
      });
      res.end(datos);
    });
  });
}

// Referencia para que /salud pueda informar cuántas salas hay vivas.
let servidorActual = null;

export function crearServidor({ puerto = 3000 } = {}) {
  const registro = new RegistroDeSalas();
  const servidor = http.createServer(servirEstatico);
  const wss = new WebSocketServer({ server: servidor });

  const enviar = (socket, tipo, datos) => {
    if (socket?.readyState === 1) socket.send(JSON.stringify({ tipo, ...datos }));
  };
  // `causa` permite al cliente reaccionar sin adivinar por el texto: si la
  // sala ya no existe (servidor reiniciado, sala barrida) tiene que volver a
  // la entrada en vez de insistir en entrar a algo que no está.
  const fallo = (socket, motivo, causa) =>
    enviar(socket, DEL_SERVIDOR.ERROR, { motivo, causa });

  /** Manda a cada jugador su propia vista: nunca la mano de los demás. */
  function difundir(sala) {
    for (const asiento of sala.asientos) {
      if (!asiento.socket) continue;
      enviar(asiento.socket, DEL_SERVIDOR.ESTADO, { vista: sala.vistaPara(asiento.token) });
    }
  }

  /**
   * Latido. Los proxies (Fly, Render, Cloudflare…) cortan las conexiones
   * inactivas al minuto, y en La Mona un turno puede pasar ese rato sin
   * tráfico. El servidor pregunta cada 25 s y cierra las que no contestan,
   * para que el cliente reconecte en vez de quedarse mudo.
   */
  const latido = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.vivo === false) {
        socket.terminate();
        continue;
      }
      socket.vivo = false;
      socket.ping();
    }
  }, 25_000);
  latido.unref?.();

  wss.on('connection', (socket) => {
    const sesion = { sala: null, token: null };
    socket.vivo = true;
    socket.on('pong', () => {
      socket.vivo = true;
    });

    const entrar = (sala, resultado, nombre) => {
      sesion.sala = sala;
      sesion.token = resultado.token;
      sala.alCambiar = () => difundir(sala);
      enviar(socket, DEL_SERVIDOR.SALA, {
        codigo: sala.codigo,
        token: resultado.token,
        yo: resultado.indice,
        nombre,
        reconexion: resultado.reconexion,
      });
      difundir(sala);
    };

    socket.on('message', (crudo) => {
      let mensaje;
      try {
        mensaje = JSON.parse(crudo);
      } catch {
        return fallo(socket, 'Mensaje ilegible');
      }

      const sala = sesion.sala;

      switch (mensaje.tipo) {
        case DEL_CLIENTE.PING:
          return enviar(socket, DEL_SERVIDOR.PONG, {});

        case DEL_CLIENTE.CREAR_SALA: {
          const nombre = limpiarNombre(mensaje.nombre, 'Anfitrión');
          const nueva = registro.crear({
            numJugadores: [2, 3, 4].includes(Number(mensaje.numJugadores))
              ? Number(mensaje.numJugadores)
              : 4,
            enParejas: Boolean(mensaje.enParejas),
            rondasParaGanar: Number(mensaje.rondasParaGanar) || 3,
          });
          const r = nueva.sentar({ nombre, socket });
          if (!r.ok) return fallo(socket, r.motivo);
          return entrar(nueva, r, nombre);
        }

        case DEL_CLIENTE.UNIRSE: {
          const destino = registro.buscar(mensaje.codigo);
          if (!destino) {
            return fallo(socket, 'No existe una sala con ese código', 'sala-desconocida');
          }
          const nombre = limpiarNombre(mensaje.nombre, null);
          const r = destino.sentar({ nombre, token: mensaje.token, socket });
          if (!r.ok) return fallo(socket, r.motivo);
          return entrar(destino, r, destino.asientos[r.indice].nombre);
        }

        case DEL_CLIENTE.CONFIGURAR: {
          if (!sala) return fallo(socket, 'No estás en una sala');
          const r = sala.configurar(sesion.token, mensaje.cambios ?? {});
          if (!r.ok) return fallo(socket, r.motivo);
          return difundir(sala);
        }

        case DEL_CLIENTE.INICIAR: {
          if (!sala) return fallo(socket, 'No estás en una sala');
          const r = sala.iniciar(sesion.token);
          if (!r.ok) return fallo(socket, r.motivo);
          return difundir(sala);
        }

        case DEL_CLIENTE.JUGAR: {
          if (!sala) return fallo(socket, 'No estás en una sala');
          const r = sala.jugar(sesion.token, mensaje.jugada ?? {});
          if (!r.ok) return fallo(socket, r.motivo, r.causa);
          return difundir(sala);
        }

        case DEL_CLIENTE.SIGUIENTE_RONDA: {
          if (!sala) return fallo(socket, 'No estás en una sala');
          const r = sala.siguienteRonda(sesion.token);
          if (!r.ok) return fallo(socket, r.motivo);
          return difundir(sala);
        }

        case DEL_CLIENTE.VOLVER_LOBBY: {
          if (!sala) return fallo(socket, 'No estás en una sala');
          const r = sala.volverAlLobby(sesion.token);
          if (!r.ok) return fallo(socket, r.motivo);
          return difundir(sala);
        }

        case DEL_CLIENTE.SALIR: {
          if (!sala) return;
          sala.desconectar(sesion.token, socket);
          difundir(sala);
          sesion.sala = null;
          sesion.token = null;
          return;
        }

        default:
          return fallo(socket, `Mensaje desconocido: ${mensaje.tipo}`);
      }
    });

    socket.on('close', () => {
      if (!sesion.sala) return;
      // Se pasa ESTE socket para que un cierre tardío no eche a quien ya volvió.
      sesion.sala.desconectar(sesion.token, socket);
      difundir(sesion.sala);
    });
  });

  const api = {
    servidor,
    registro,
    escuchar: () =>
      new Promise((listo) => {
        // 0.0.0.0 para que la plataforma pueda alcanzarlo desde fuera.
        servidor.listen(puerto, '0.0.0.0', () => listo(servidor.address().port));
      }),
    cerrar: () =>
      new Promise((listo) => {
        clearInterval(latido);
        registro.detener();
        for (const c of wss.clients) c.terminate();
        if (servidorActual === api) servidorActual = null;
        wss.close(() => servidor.close(listo));
      }),
  };

  servidorActual = api;
  return api;
}

// Arranque directo: `node servidor/index.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.env.PORT) || 3000;
  const app = crearServidor({ puerto });
  app.escuchar().then((p) => {
    console.log(`La Mona escuchando en el puerto ${p}`);
  });

  // La plataforma manda SIGTERM al redesplegar: se cierra sin dejar sockets
  // colgando, y los jugadores reconectan solos a la versión nueva.
  for (const senal of ['SIGTERM', 'SIGINT']) {
    process.on(senal, () => {
      console.log(`${senal}: cerrando…`);
      app.cerrar().then(() => process.exit(0));
      setTimeout(() => process.exit(0), 5000).unref();
    });
  }
}
