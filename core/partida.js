import { valoresDe } from './cartas.js';
import { barajar, crearAleatorio, semillaAleatoria } from './aleatorio.js';
import { prepararRonda } from './reparto.js';
import { validarJugada } from './reglas.js';
import { bandosDe, puntuarRonda } from './puntaje.js';

let contadorMonton = 0;
const nuevoIdMonton = () => `m${++contadorMonton}`;

function montonSuelto(carta) {
  return {
    id: nuevoIdMonton(),
    tipo: 'suelta',
    valores: valoresDe(carta),
    valor: valoresDe(carta)[0],
    cartas: [carta],
    dueño: null,
  };
}

/* ------------------------------------------------------------------ */
/* Creación                                                             */
/* ------------------------------------------------------------------ */

export function crearPartida({
  numJugadores,
  nombres = [],
  enParejas = false,
  rondasParaGanar = 3,
  semilla = semillaAleatoria(),
}) {
  if (numJugadores < 2 || numJugadores > 4) {
    throw new Error('La Mona se juega entre 2 y 4 jugadores');
  }
  const config = {
    numJugadores,
    nombres: Array.from({ length: numJugadores }, (_, i) => nombres[i] ?? `Jugador ${i + 1}`),
    enParejas: enParejas && numJugadores === 4,
    rondasParaGanar,
  };
  const partida = {
    config,
    bandos: bandosDe(numJugadores, config.enParejas),
    rondasGanadas: bandosDe(numJugadores, config.enParejas).map(() => 0),
    ronda: 0,
    repartidor: numJugadores - 1, // así el primero en jugar es el jugador 0
    semilla,
    fase: 'jugando',
    historial: [],
  };
  iniciarRonda(partida);
  return partida;
}

export function iniciarRonda(partida) {
  const { numJugadores } = partida.config;
  partida.ronda += 1;
  partida.repartidor = (partida.repartidor + 1) % numJugadores;

  const aleatorio = crearAleatorio(partida.semilla + partida.ronda * 7919);
  const { mazo, enMesa, repartos } = prepararRonda(numJugadores, (b) => barajar(b, aleatorio));

  partida.mazo = mazo;
  partida.repartos = repartos;
  partida.tanda = 0;
  partida.manos = Array.from({ length: numJugadores }, () => []);
  partida.capturadas = Array.from({ length: numJugadores }, () => []);
  partida.chupes = new Array(numJugadores).fill(0);
  partida.ultimoEnCapturar = null;
  partida.fase = 'jugando';
  partida.turno = (partida.repartidor + 1) % numJugadores;
  partida.mesa = partida.mazo.splice(0, enMesa).map(montonSuelto);

  repartirTanda(partida);
  return partida;
}

function repartirTanda(partida) {
  const cuantas = partida.repartos[partida.tanda];
  if (cuantas === undefined) return false;
  for (let i = 0; i < partida.config.numJugadores; i++) {
    // Se reparte empezando por la izquierda del repartidor.
    const j = (partida.repartidor + 1 + i) % partida.config.numJugadores;
    partida.manos[j].push(...partida.mazo.splice(0, cuantas));
  }
  partida.tanda += 1;
  return true;
}

/* ------------------------------------------------------------------ */
/* Jugar                                                                */
/* ------------------------------------------------------------------ */

/**
 * Aplica una jugada validada. Muta la partida (el servidor es dueño del
 * estado) y devuelve un resumen de lo ocurrido para animar el cliente.
 */
export function jugar(partida, jugador, jugada) {
  const revision = validarJugada(partida, jugador, jugada);
  if (!revision.ok) return { ok: false, motivo: revision.motivo };

  const carta = partida.manos[jugador].find((c) => c.id === jugada.cartaId);
  const valorCarta = jugada.valorCarta ?? valoresDe(carta)[0];
  const objetivos = (jugada.montones || []).map((id) => partida.mesa.find((m) => m.id === id));

  partida.manos[jugador] = partida.manos[jugador].filter((c) => c.id !== carta.id);

  const evento = { jugador, tipo: jugada.tipo, carta, valorCarta, chupe: false };

  if (jugada.tipo === 'abierto') {
    partida.mesa.push(montonSuelto(carta));
  } else if (jugada.tipo === 'capturar') {
    const botin = [carta, ...objetivos.flatMap((m) => m.cartas)];
    partida.capturadas[jugador].push(...botin);
    partida.mesa = partida.mesa.filter((m) => !objetivos.includes(m));
    partida.ultimoEnCapturar = jugador;
    evento.capturadas = botin.length;
    if (partida.mesa.length === 0) {
      partida.chupes[jugador] += 1;
      evento.chupe = true;
    }
  } else {
    // formar / fila: los montones se funden en uno solo, con dueño.
    const cartas = [...objetivos.flatMap((m) => m.cartas), carta];
    partida.mesa = partida.mesa.filter((m) => !objetivos.includes(m));
    partida.mesa.push({
      id: nuevoIdMonton(),
      tipo: jugada.tipo === 'fila' ? 'fila' : 'formacion',
      valor: jugada.valor,
      valores: [jugada.valor],
      cartas,
      dueño: jugador,
    });
    evento.valor = jugada.valor;
  }

  partida.historial.push(evento);
  avanzar(partida);
  return { ok: true, evento };
}

function avanzar(partida) {
  const { numJugadores } = partida.config;
  const manosVacias = partida.manos.every((m) => m.length === 0);

  if (manosVacias) {
    if (!repartirTanda(partida)) {
      cerrarRonda(partida);
      return;
    }
  }
  partida.turno = (partida.turno + 1) % numJugadores;
}

/* ------------------------------------------------------------------ */
/* Cierre de ronda                                                      */
/* ------------------------------------------------------------------ */

function cerrarRonda(partida) {
  // Lo que quede en la mesa se lo lleva el último que capturó. Así es como se
  // gana La Mona ahogada: nadie puede levantar un 15, se queda hasta el final.
  const sobrante = partida.mesa.flatMap((m) => m.cartas);
  if (sobrante.length > 0 && partida.ultimoEnCapturar !== null) {
    partida.capturadas[partida.ultimoEnCapturar].push(...sobrante);
  }
  partida.mesa = [];

  const resultado = puntuarRonda({
    capturadas: partida.capturadas,
    chupes: partida.chupes,
    numJugadores: partida.config.numJugadores,
    enParejas: partida.config.enParejas,
  });

  partida.resultadoRonda = {
    ...resultado,
    sobrante: sobrante.length,
    seLlevoElSobrante: partida.ultimoEnCapturar,
  };
  if (resultado.ganador !== null) partida.rondasGanadas[resultado.ganador] += 1;

  const campeon = partida.rondasGanadas.findIndex(
    (r) => r >= partida.config.rondasParaGanar,
  );
  partida.fase = campeon >= 0 ? 'finPartida' : 'finRonda';
  if (campeon >= 0) partida.campeon = campeon;
}

/** Pasa a la siguiente ronda tras mostrar el marcador. */
export function siguienteRonda(partida) {
  if (partida.fase !== 'finRonda') return partida;
  delete partida.resultadoRonda;
  return iniciarRonda(partida);
}

/* ------------------------------------------------------------------ */
/* Vista por jugador                                                    */
/* ------------------------------------------------------------------ */

/**
 * Lo que se le envía a UN jugador. Nunca incluye las manos ajenas: sólo
 * cuántas cartas tiene cada quien. Esta función es la barrera anti-trampa.
 */
export function vistaPara(partida, jugador) {
  return {
    config: partida.config,
    bandos: partida.bandos,
    rondasGanadas: partida.rondasGanadas,
    ronda: partida.ronda,
    fase: partida.fase,
    turno: partida.turno,
    repartidor: partida.repartidor,
    yo: jugador,
    miMano: partida.manos[jugador],
    cartasPorJugador: partida.manos.map((m) => m.length),
    capturadasPorJugador: partida.capturadas.map((c) => c.length),
    chupes: partida.chupes,
    mesa: partida.mesa,
    cartasEnMazo: partida.mazo.length,
    ultimoEnCapturar: partida.ultimoEnCapturar,
    resultadoRonda: partida.resultadoRonda ?? null,
    campeon: partida.campeon ?? null,
    ultimoEvento: partida.historial.at(-1) ?? null,
  };
}
