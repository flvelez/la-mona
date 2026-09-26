import { crearBaraja } from './cartas.js';

export const TOTAL_CARTAS = 53;
export const CARTAS_POR_MANO = 4;

/**
 * Cuántas cartas van boca arriba a la mesa al iniciar la ronda.
 * Se eligen las mínimas para que el resto reparta parejo entre los jugadores:
 *   2 jugadores -> 1 (quedan 52, divisible entre 2)
 *   3 jugadores -> 2 (quedan 51, divisible entre 3; con 1 no cuadraría)
 *   4 jugadores -> 1 (quedan 52, divisible entre 4)
 */
export function cartasInicialesMesa(numJugadores) {
  for (let n = 1; n <= numJugadores; n++) {
    if ((TOTAL_CARTAS - n) % numJugadores === 0) return n;
  }
  throw new Error(`No hay reparto parejo para ${numJugadores} jugadores`);
}

/**
 * Plan de repartos de la ronda: cuántas cartas recibe cada jugador en cada
 * tanda. Base de 4; el sobrante se reparte sumando 1 a las últimas tandas, de
 * modo que nunca se reparta una tanda de 1 o 2 cartas sueltas.
 *
 *   2 jugadores: 26 c/u -> [4, 4, 4, 4, 5, 5]
 *   3 jugadores: 17 c/u -> [4, 4, 4, 5]
 *   4 jugadores: 13 c/u -> [4, 4, 5]
 */
export function planDeRepartos(numJugadores) {
  const enMesa = cartasInicialesMesa(numJugadores);
  const porJugador = (TOTAL_CARTAS - enMesa) / numJugadores;

  const tandas = Math.floor(porJugador / CARTAS_POR_MANO);
  const sobrante = porJugador - tandas * CARTAS_POR_MANO;

  const repartos = new Array(tandas).fill(CARTAS_POR_MANO);
  for (let i = 0; i < sobrante; i++) {
    repartos[tandas - 1 - i] += 1;
  }
  return { enMesa, porJugador, repartos };
}

/** Baraja ya mezclada más el plan de reparto de la ronda. */
export function prepararRonda(numJugadores, barajarCon) {
  const plan = planDeRepartos(numJugadores);
  return { mazo: barajarCon(crearBaraja()), ...plan };
}
