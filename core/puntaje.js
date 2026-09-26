import { esAs, esDiezBonito, esDosBonito, esEspada } from './cartas.js';

export const PUNTOS = {
  masCartas: 3,
  masEspadas: 1,
  mona: 3,
  diezBonito: 2,
  dosBonito: 1,
  as: 1,
  wincho: 1,
};

/**
 * Reparto de jugadores en bandos.
 * Con 4 jugadores en parejas, los compañeros van cruzados: 0-2 y 1-3.
 * En cualquier otro caso cada jugador es su propio bando.
 */
export function bandosDe(numJugadores, enParejas) {
  if (enParejas && numJugadores === 4) return [[0, 2], [1, 3]];
  return Array.from({ length: numJugadores }, (_, i) => [i]);
}

export function nombreBando(bando, nombres) {
  return bando.map((i) => nombres?.[i] ?? `J${i + 1}`).join(' y ');
}

/**
 * Puntaje de la ronda. Devuelve un desglose por bando para poder mostrarlo
 * en pantalla, no sólo el total.
 */
export function puntuarRonda({ capturadas, winchos, numJugadores, enParejas }) {
  const bandos = bandosDe(numJugadores, enParejas);

  const detalle = bandos.map((bando) => {
    const cartas = bando.flatMap((j) => capturadas[j]);
    return {
      bando,
      cartas: cartas.length,
      espadas: cartas.filter(esEspada).length,
      mona: cartas.some((c) => c.mona),
      diezBonito: cartas.some(esDiezBonito),
      dosBonito: cartas.some(esDosBonito),
      ases: cartas.filter(esAs).length,
      winchos: bando.reduce((a, j) => a + winchos[j], 0),
      puntos: 0,
      conceptos: [],
    };
  });

  const sumar = (d, puntos, concepto) => {
    d.puntos += puntos;
    d.conceptos.push({ concepto, puntos });
  };

  // Mayorías: si hay empate en la cima, nadie se lleva esos puntos.
  for (const [campo, etiqueta, valor] of [
    ['cartas', 'Más cartas', PUNTOS.masCartas],
    ['espadas', 'Más espadas', PUNTOS.masEspadas],
  ]) {
    const max = Math.max(...detalle.map((d) => d[campo]));
    const lideres = detalle.filter((d) => d[campo] === max && max > 0);
    if (lideres.length === 1) sumar(lideres[0], valor, etiqueta);
  }

  for (const d of detalle) {
    if (d.mona) sumar(d, PUNTOS.mona, 'La Mona');
    if (d.diezBonito) sumar(d, PUNTOS.diezBonito, 'El 10 bonito (10♦)');
    if (d.dosBonito) sumar(d, PUNTOS.dosBonito, 'El 2 bonito (2♠)');
    if (d.ases > 0) sumar(d, d.ases * PUNTOS.as, `Ases (${d.ases})`);
    if (d.winchos > 0) sumar(d, d.winchos * PUNTOS.wincho, `Winchos (${d.winchos})`);
  }

  const max = Math.max(...detalle.map((d) => d.puntos));
  const lideres = detalle.filter((d) => d.puntos === max);
  // Empate en puntos: la ronda no se la adjudica nadie.
  const ganador = lideres.length === 1 ? detalle.indexOf(lideres[0]) : null;

  return { detalle, ganador };
}
