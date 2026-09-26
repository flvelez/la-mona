// Baraja de La Mona: 53 cartas (52 + el comodín, que es "La Mona").

export const PALOS = ['Corazones', 'Diamantes', 'Tréboles', 'Espadas'];

export const ICONOS = {
  Corazones: '♥',
  Diamantes: '♦',
  Tréboles: '♣',
  Espadas: '♠',
  Especial: '🃏',
};

const INICIAL_PALO = { Corazones: 'C', Diamantes: 'D', Tréboles: 'T', Espadas: 'E' };

export const ID_MONA = 'MONA';
export const VALOR_MONA = 15;

/** Nombre corto de un valor numérico (1..13). */
export function nombreDeValor(valor) {
  if (valor === 1) return 'A';
  if (valor === 11) return 'J';
  if (valor === 12) return 'Q';
  if (valor === 13) return 'K';
  return String(valor);
}

/** Baraja completa de 53 cartas, en orden fijo. El barajado va aparte. */
export function crearBaraja() {
  const baraja = [];
  for (const palo of PALOS) {
    for (let valor = 1; valor <= 13; valor++) {
      baraja.push({
        id: `${INICIAL_PALO[palo]}${valor}`,
        palo,
        valor,
        nombre: nombreDeValor(valor),
        mona: false,
      });
    }
  }
  baraja.push({
    id: ID_MONA,
    palo: 'Especial',
    valor: VALOR_MONA,
    nombre: 'Mona',
    mona: true,
  });
  return baraja;
}

/**
 * Valores con los que una carta puede jugarse.
 * El As vale 1 o 14; La Mona vale 15; el resto, su número.
 */
export function valoresDe(carta) {
  if (carta.mona) return [VALOR_MONA];
  if (carta.valor === 1) return [1, 14];
  return [carta.valor];
}

export function esRoja(carta) {
  return carta.palo === 'Corazones' || carta.palo === 'Diamantes';
}

export function esEspada(carta) {
  return carta.palo === 'Espadas';
}

/** El 10♦, "el 10 bonito". */
export function esDiezBonito(carta) {
  return carta.palo === 'Diamantes' && carta.valor === 10;
}

/** El 2♠, "el 2 bonito". */
export function esDosBonito(carta) {
  return carta.palo === 'Espadas' && carta.valor === 2;
}

export function esAs(carta) {
  return !carta.mona && carta.valor === 1;
}
