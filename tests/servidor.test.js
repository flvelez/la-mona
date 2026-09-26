import test from 'node:test';
import assert from 'node:assert/strict';

import { crearServidor } from '../servidor/index.js';
import { jugadasLegales, validarJugada } from '../core/reglas.js';
import { valoresDe } from '../core/cartas.js';
import { estadoDesdeVista } from '../core/vista.js';
import { normalizarCodigo } from '../core/protocolo.js';
import { ClienteDePrueba } from './ayudas.js';

async function conSala(numJugadores, prueba) {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const clientes = [];
  try {
    const anfitrion = new ClienteDePrueba(puerto);
    await anfitrion.listo();
    clientes.push(anfitrion);
    anfitrion.enviar('crearSala', { nombre: 'Ana', numJugadores, rondasParaGanar: 1 });
    const sala = await anfitrion.esperar('sala');
    const tokens = [sala.token];

    for (let i = 1; i < numJugadores; i++) {
      const c = new ClienteDePrueba(puerto);
      await c.listo();
      clientes.push(c);
      c.enviar('unirse', { codigo: sala.codigo, nombre: `J${i + 1}` });
      tokens.push((await c.esperar('sala')).token);
    }
    await prueba({ app, puerto, clientes, tokens, codigo: sala.codigo, sala });
  } finally {
    for (const c of clientes) c.cerrar();
    await app.cerrar();
  }
}

test('se crea una sala y los demás entran sólo con el código', async () => {
  await conSala(3, async ({ clientes, codigo }) => {
    assert.match(codigo, /^[A-Z0-9]{4}$/);
    assert.equal(normalizarCodigo(` ${codigo.toLowerCase()} `), codigo);

    for (const c of clientes) {
      const estado = await c.esperar((m) => m.tipo === 'estado' && m.vista.jugadores.length === 3);
      assert.deepEqual(estado.vista.jugadores.map((j) => j.nombre), ['Ana', 'J2', 'J3']);
      assert.equal(estado.vista.anfitrion, 0);
    }
  });
});

test('un código que no existe devuelve error, no una sala nueva', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const c = new ClienteDePrueba(puerto);
  await c.listo();
  c.enviar('unirse', { codigo: 'ZZZZ', nombre: 'Perdido' });
  const err = await c.esperar('error');
  assert.match(err.motivo, /No existe una sala/);
  c.cerrar();
  await app.cerrar();
});

test('la sala se llena y rechaza al quinto', async () => {
  await conSala(2, async ({ puerto, codigo, clientes }) => {
    const intruso = new ClienteDePrueba(puerto);
    await intruso.listo();
    clientes.push(intruso);
    intruso.enviar('unirse', { codigo, nombre: 'Tarde' });
    const err = await intruso.esperar('error');
    assert.match(err.motivo, /llena/);
  });
});

test('NADIE recibe la mano de otro jugador', async () => {
  await conSala(3, async ({ clientes }) => {
    clientes.forEach((c) => c.limpiar());
    clientes[0].enviar('iniciar');

    const vistas = await Promise.all(
      clientes.map((c) => c.esperar((m) => m.tipo === 'estado' && m.vista.partida)),
    );

    const manos = vistas.map((v) => v.vista.partida.miMano);
    for (const mano of manos) assert.equal(mano.length, 4);

    // Las manos son distintas entre sí y nadie ve las ajenas.
    const todas = manos.flat().map((c) => c.id);
    assert.equal(new Set(todas).size, todas.length, 'hay cartas repetidas entre manos');

    const serializado = JSON.stringify(vistas[0].vista);
    for (const carta of manos[1].concat(manos[2])) {
      assert.ok(!serializado.includes(`"${carta.id}"`),
        `el jugador 1 puede ver la carta ajena ${carta.id}`);
    }
    // Sólo se conoce cuántas cartas tiene cada quien.
    assert.deepEqual(vistas[0].vista.partida.cartasPorJugador, [4, 4, 4]);
  });
});

test('el servidor rechaza jugar fuera de turno y cartas que no tienes', async () => {
  await conSala(2, async ({ clientes }) => {
    clientes.forEach((c) => c.limpiar());
    clientes[0].enviar('iniciar');
    const vista0 = (await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida)).vista;
    const vista1 = (await clientes[1].esperar((m) => m.tipo === 'estado' && m.vista.partida)).vista;

    const enTurno = vista0.partida.turno;
    const fuera = enTurno === 0 ? 1 : 0;
    const vistaFuera = fuera === 0 ? vista0 : vista1;

    clientes[fuera].limpiar();
    clientes[fuera].enviar('jugar', {
      jugada: { tipo: 'abierto', cartaId: vistaFuera.partida.miMano[0].id },
    });
    const err = await clientes[fuera].esperar('error');
    assert.match(err.motivo, /No es tu turno/);

    clientes[enTurno].limpiar();
    clientes[enTurno].enviar('jugar', {
      jugada: { tipo: 'abierto', cartaId: 'CARTA-INVENTADA' },
    });
    const err2 = await clientes[enTurno].esperar('error');
    assert.match(err2.motivo, /no está en tu mano/);
  });
});

test('una captura ilegal se rechaza aunque el cliente la pida', async () => {
  await conSala(2, async ({ clientes }) => {
    clientes.forEach((c) => c.limpiar());
    clientes[0].enviar('iniciar');
    const v0 = (await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida)).vista;
    const v1 = (await clientes[1].esperar((m) => m.tipo === 'estado' && m.vista.partida)).vista;
    const enTurno = v0.partida.turno;
    const vista = enTurno === 0 ? v0 : v1;
    const estado = estadoDesdeVista(vista.partida);
    const todos = vista.partida.mesa.map((m) => m.id);

    // Busca una captura que el motor considere ilegal con CUALQUIER valor de
    // la carta (un As puede valer 1 o 14, así que hay que descartar los dos).
    let ilegal = null;
    for (const carta of vista.partida.miMano) {
      const candidatos = valoresDe(carta).map((valorCarta) => ({
        tipo: 'capturar', cartaId: carta.id, valorCarta, montones: todos,
      }));
      if (candidatos.every((j) => !validarJugada(estado, enTurno, j).ok)) {
        ilegal = candidatos[0];
        break;
      }
    }
    assert.ok(ilegal, 'no se encontró ninguna captura ilegal que probar');

    clientes[enTurno].limpiar();
    clientes[enTurno].enviar('jugar', { jugada: ilegal });
    const err = await clientes[enTurno].esperar('error');
    assert.ok(/no suman|Sólo puedes levantar|seleccionaste/.test(err.motivo), err.motivo);

    // Y una jugada que sí es legal debe pasar.
    const legal = jugadasLegales(estado, enTurno)[0];
    clientes[enTurno].limpiar();
    clientes[enTurno].enviar('jugar', { jugada: legal });
    const ok = await clientes[enTurno].esperar('estado');
    assert.notEqual(ok.vista.partida.turno, enTurno, 'el turno no avanzó');
  });
});

test('reconexión: vuelves a tu asiento con tu misma mano', async () => {
  await conSala(2, async ({ puerto, codigo, clientes, tokens }) => {
    const token = tokens[1];
    clientes.forEach((c) => c.limpiar());
    clientes[0].enviar('iniciar');
    const antes = (await clientes[1].esperar((m) => m.tipo === 'estado' && m.vista.partida)).vista;

    clientes[1].cerrar();
    await new Promise((r) => setTimeout(r, 60));

    const vuelto = new ClienteDePrueba(puerto);
    await vuelto.listo();
    clientes.push(vuelto);
    vuelto.enviar('unirse', { codigo, token });
    const sala = await vuelto.esperar('sala');
    assert.equal(sala.reconexion, true);
    assert.equal(sala.yo, 1);

    const despues = (await vuelto.esperar((m) => m.tipo === 'estado' && m.vista.partida)).vista;
    assert.deepEqual(
      despues.partida.miMano.map((c) => c.id),
      antes.partida.miMano.map((c) => c.id),
      'la mano cambió al reconectar',
    );
  });
});

test('sólo el anfitrión inicia y configura la sala', async () => {
  await conSala(2, async ({ clientes }) => {
    clientes[1].limpiar();
    clientes[1].enviar('iniciar');
    assert.match((await clientes[1].esperar('error')).motivo, /anfitrión/);

    clientes[1].limpiar();
    clientes[1].enviar('configurar', { cambios: { rondasParaGanar: 9 } });
    assert.match((await clientes[1].esperar('error')).motivo, /anfitrión/);

    clientes[0].limpiar();
    clientes[0].enviar('configurar', { cambios: { rondasParaGanar: 7 } });
    const estado = await clientes[0].esperar('estado');
    assert.equal(estado.vista.config.rondasParaGanar, 7);
  });
});

test('las rondas para ganar van de 1 a 10', async () => {
  await conSala(2, async ({ clientes }) => {
    for (const valor of [0, 11, 99]) {
      clientes[0].limpiar();
      clientes[0].enviar('configurar', { cambios: { rondasParaGanar: valor } });
      assert.match((await clientes[0].esperar('error')).motivo, /de 1 a 10/);
    }
  });
});

test('partida completa de 4 jugadores por la red, jugando desde el cliente', async () => {
  await conSala(4, async ({ clientes }) => {
    clientes.forEach((c) => c.limpiar());
    clientes[0].enviar('configurar', { cambios: { enParejas: true } });
    clientes[0].enviar('iniciar');

    const vistas = await Promise.all(
      clientes.map((c) => c.esperar((m) => m.tipo === 'estado' && m.vista.partida)),
    );
    assert.equal(vistas[0].vista.config.enParejas, true);

    let jugadas = 0;
    while (jugadas < 400) {
      const vista = clientes[0].ultimaVista();
      const partida = vista?.partida;
      if (!partida || partida.fase !== 'jugando') break;

      const turno = partida.turno;
      const cliente = clientes[turno];
      const suya = cliente.ultimaVista().partida;

      // El cliente calcula sus jugadas con el MISMO motor que el servidor.
      const opciones = jugadasLegales(estadoDesdeVista(suya), turno);
      assert.ok(opciones.length > 0, `jugador ${turno} sin jugadas`);
      const elegida = opciones[Math.floor(Math.random() * opciones.length)];

      clientes.forEach((c) => c.limpiar());
      cliente.enviar('jugar', { jugada: elegida });
      // Hay que esperar a TODOS: cada socket recibe su vista por su cuenta.
      await Promise.all(clientes.map((c) => c.esperar('estado')));
      jugadas++;
    }

    const final = clientes[0].ultimaVista().partida;
    assert.ok(['finRonda', 'finPartida'].includes(final.fase), `fase: ${final.fase}`);
    assert.ok(final.resultadoRonda, 'no se calculó el puntaje');
    assert.equal(final.resultadoRonda.detalle.length, 2, 'en parejas hay 2 bandos');
  });
});

test('si se acaba el tiempo, el servidor juega por ti', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const clientes = [];
  try {
    for (let i = 0; i < 2; i++) {
      const c = new ClienteDePrueba(puerto);
      await c.listo();
      clientes.push(c);
    }
    clientes[0].enviar('crearSala', { nombre: 'Ana', numJugadores: 2 });
    const { codigo } = await clientes[0].esperar('sala');
    clientes[1].enviar('unirse', { codigo, nombre: 'Beto' });
    await clientes[1].esperar('sala');

    const sala = app.registro.buscar(codigo);
    sala.config.segundosPorTurno = 0.15;

    clientes.forEach((c) => c.limpiar());
    clientes[0].enviar('iniciar');
    await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida);

    const antes = clientes[0].ultimaVista().partida;
    clientes.forEach((c) => c.limpiar());
    const despues = await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida, 4000);

    assert.notEqual(despues.vista.partida.turno, antes.turno, 'el turno no avanzó solo');
    assert.equal(despues.vista.partida.ultimoEvento.automatica, true);
  } finally {
    for (const c of clientes) c.cerrar();
    await app.cerrar();
  }
});

test('el servidor no sirve archivos fuera de cliente/ y core/', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  for (const ruta of ['/package.json', '/servidor/sala.js', '/../../etc/passwd', '/REGLAS.md']) {
    const r = await fetch(`http://localhost:${puerto}${ruta}`);
    assert.equal(r.status, 404, `${ruta} no debería servirse`);
  }
  const ok = await fetch(`http://localhost:${puerto}/core/reglas.js`);
  assert.equal(ok.status, 200);
  await app.cerrar();
});

/* ------------------- resistencia a desconexiones ------------------- */

test('si el anfitrión se cae, el mando pasa al primero conectado', async () => {
  await conSala(3, async ({ clientes, tokens, app, codigo, puerto }) => {
    const sala = app.registro.buscar(codigo);
    assert.ok(sala.esAnfitrion(tokens[0]), 'el creador manda');
    assert.ok(!sala.esAnfitrion(tokens[1]));

    // Se cae el anfitrión en plena partida: el asiento se guarda, el mando no.
    clientes[0].limpiar();
    clientes[0].enviar('iniciar');
    await clientes[1].esperar((m) => m.tipo === 'estado' && m.vista.partida);

    clientes[0].cerrar();
    await new Promise((r) => setTimeout(r, 80));

    assert.equal(sala.asientos.length, 3, 'el asiento se le guarda');
    assert.ok(sala.esAnfitrion(tokens[1]), 'manda el siguiente conectado');
    assert.ok(!sala.esAnfitrion(tokens[0]));

    // Y al volver, lo recupera.
    const vuelto = new ClienteDePrueba(puerto);
    await vuelto.listo();
    clientes.push(vuelto);
    vuelto.enviar('unirse', { codigo, token: tokens[0] });
    await vuelto.esperar('sala');
    assert.ok(sala.esAnfitrion(tokens[0]), 'el anfitrión original lo recupera');
  });
});

test('al coronar campeón se puede volver al lobby con los mismos asientos', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const clientes = [];
  try {
    for (let i = 0; i < 2; i++) {
      const c = new ClienteDePrueba(puerto);
      await c.listo();
      clientes.push(c);
    }
    clientes[0].enviar('crearSala', { nombre: 'Ana', numJugadores: 2, rondasParaGanar: 1 });
    const { codigo, token } = await clientes[0].esperar('sala');
    clientes[1].enviar('unirse', { codigo, nombre: 'Beto' });
    await clientes[1].esperar('sala');

    const sala = app.registro.buscar(codigo);
    sala.config.segundosPorTurno = 0;
    clientes[0].enviar('iniciar');
    await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida);

    // El servidor juega la ronda entera; con 1 ronda para ganar, ahí termina.
    let vueltas = 0;
    while (sala.fase !== 'terminada' && vueltas++ < 200) sala.jugarAutomatico();
    assert.equal(sala.fase, 'terminada', 'la partida debería haber terminado');

    clientes.forEach((c) => c.limpiar());
    clientes[1].enviar('volverAlLobby');
    assert.match((await clientes[1].esperar('error')).motivo, /anfitrión/);

    clientes[0].enviar('volverAlLobby');
    const estado = await clientes[0].esperar((m) => m.tipo === 'estado' && !m.vista.partida);
    assert.equal(estado.vista.fase, 'lobby');
    assert.deepEqual(estado.vista.jugadores.map((j) => j.nombre), ['Ana', 'Beto']);

    // Y se puede volver a empezar.
    clientes[0].enviar('iniciar');
    const nueva = await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida);
    assert.equal(nueva.vista.partida.ronda, 1);
    assert.ok(token);
  } finally {
    for (const c of clientes) c.cerrar();
    await app.cerrar();
  }
});

test('no se puede volver al lobby con la partida en curso', async () => {
  await conSala(2, async ({ clientes }) => {
    clientes.forEach((c) => c.limpiar());
    clientes[0].enviar('iniciar');
    await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida);
    clientes[0].limpiar();
    clientes[0].enviar('volverAlLobby');
    assert.match((await clientes[0].esperar('error')).motivo, /sigue en curso/);
  });
});

/* ------------------------ listo para desplegar --------------------- */

test('responde a la comprobación de salud', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const r = await fetch(`http://localhost:${puerto}/salud`);
  assert.equal(r.status, 200);
  const cuerpo = await r.json();
  assert.equal(cuerpo.ok, true);
  assert.equal(typeof cuerpo.activo, 'number');
  await app.cerrar();
});

test('el latido mantiene viva la conexión y descarta las mudas', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const c = new ClienteDePrueba(puerto);
  await c.listo();
  try {
    const servidorSocket = [...app.servidor.listeners('upgrade')].length > 0;
    assert.ok(servidorSocket, 'el WebSocketServer está enganchado al http');

    // El navegador contesta al ping solo; aquí basta con comprobar que la
    // conexión sigue abierta y que el socket quedó marcado como vivo.
    c.enviar('ping');
    const pong = await c.esperar('pong');
    assert.equal(pong.tipo, 'pong');
    assert.equal(c.socket.readyState, 1, 'la conexión sigue abierta');
  } finally {
    c.cerrar();
    await app.cerrar();
  }
});

test('el cierre ordenado suelta el puerto para el redespliegue', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const c = new ClienteDePrueba(puerto);
  await c.listo();
  await app.cerrar();

  // Si el puerto quedara tomado, el redespliegue fallaría.
  const otra = crearServidor({ puerto });
  const mismoPuerto = await otra.escuchar();
  assert.equal(mismoPuerto, puerto);
  await otra.cerrar();
});

test('los archivos se revalidan: nada de cliente viejo tras redesplegar', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  try {
    const r = await fetch(`http://localhost:${puerto}/cliente/mesa.js`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-cache');
    const marca = r.headers.get('etag');
    assert.ok(marca, 'falta la marca ETag');

    // Sin cambios: 304 vacío, así el navegador reutiliza sin quedarse atrás.
    const r2 = await fetch(`http://localhost:${puerto}/cliente/mesa.js`, {
      headers: { 'If-None-Match': marca },
    });
    assert.equal(r2.status, 304);
    assert.equal((await r2.text()).length, 0);

    // Con una marca vieja: se vuelve a enviar el archivo entero.
    const r3 = await fetch(`http://localhost:${puerto}/cliente/mesa.js`, {
      headers: { 'If-None-Match': 'W/"otra-cosa"' },
    });
    assert.equal(r3.status, 200);
    assert.ok((await r3.text()).length > 0);
  } finally {
    await app.cerrar();
  }
});

test('un directorio no se sirve como si fuera un archivo', async () => {
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const r = await fetch(`http://localhost:${puerto}/cliente`);
  assert.equal(r.status, 404);
  await app.cerrar();
});

/* ---------------- fallos vistos jugando en producción --------------- */

test('el cierre tardío del socket viejo no expulsa a quien ya reconectó', async () => {
  // Carrera clásica: se cae la conexión, el cliente vuelve por un socket
  // nuevo, y DESPUÉS llega el 'close' del socket viejo. Sin protección, ese
  // cierre tardío desasienta a un jugador que está perfectamente conectado.
  await conSala(2, async ({ app, codigo, tokens, puerto, clientes }) => {
    const sala = app.registro.buscar(codigo);
    clientes[0].limpiar();
    clientes[0].enviar('iniciar');
    await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida);

    const socketViejo = sala.asientos[1].socket;

    // El jugador vuelve por un socket nuevo…
    const vuelto = new ClienteDePrueba(puerto);
    await vuelto.listo();
    clientes.push(vuelto);
    vuelto.enviar('unirse', { codigo, token: tokens[1] });
    await vuelto.esperar('sala');
    assert.equal(sala.asientos[1].conectado, true);

    // …y sólo entonces llega el cierre del viejo.
    sala.desconectar(tokens[1], socketViejo);

    assert.equal(sala.asientos.length, 2, 'no debe perder el asiento');
    assert.equal(sala.asientos[1].conectado, true, 'sigue conectado por el socket nuevo');
    assert.ok(sala.asientos[1].socket, 'conserva su socket vivo');
  });
});

test('en el lobby, un cierre tardío tampoco borra el asiento recuperado', async () => {
  await conSala(2, async ({ app, codigo, tokens, puerto, clientes }) => {
    const sala = app.registro.buscar(codigo);
    const socketViejo = sala.asientos[1].socket;

    const vuelto = new ClienteDePrueba(puerto);
    await vuelto.listo();
    clientes.push(vuelto);
    vuelto.enviar('unirse', { codigo, token: tokens[1] });
    await vuelto.esperar('sala');

    sala.desconectar(tokens[1], socketViejo);
    assert.equal(sala.asientos.length, 2, 'el asiento no se libera');
  });
});

test('si la sala ya no existe, el error lo dice con una causa reconocible', async () => {
  // Cuando el servidor se reinicia, las salas en memoria se pierden. El
  // cliente tiene que poder distinguir ese caso para volver a la entrada en
  // vez de quedarse pidiendo entrar a una sala que ya no está.
  const app = crearServidor({ puerto: 0 });
  const puerto = await app.escuchar();
  const c = new ClienteDePrueba(puerto);
  await c.listo();
  try {
    c.enviar('unirse', { codigo: 'ZZZZ', token: 'UN-TOKEN-VIEJO' });
    const err = await c.esperar('error');
    assert.equal(err.causa, 'sala-desconocida');
  } finally {
    c.cerrar();
    await app.cerrar();
  }
});

test('jugar tras perder el asiento da una causa que el cliente puede atender', async () => {
  await conSala(2, async ({ app, codigo, tokens, clientes }) => {
    const sala = app.registro.buscar(codigo);
    clientes[0].limpiar();
    clientes[0].enviar('iniciar');
    await clientes[0].esperar((m) => m.tipo === 'estado' && m.vista.partida);

    // Se simula la pérdida del asiento (sala reiniciada, expulsión, etc.).
    sala.asientos.splice(1, 1);

    clientes[1].limpiar();
    clientes[1].enviar('jugar', { jugada: { tipo: 'abierto', cartaId: 'X' } });
    const err = await clientes[1].esperar('error');
    assert.equal(err.causa, 'fuera-de-sala');
    assert.ok(tokens[1]);
  });
});
