import { valoresDe, VALOR_MONA } from './cartas.js';
import { particionable } from './particion.js';

export const VARIANTE = 2; // Variante flexible (ver README)

// Un jugador con formación propia en mesa no puede jugar abierto. Si además le
// prohibiéramos capturar cartas sueltas podría quedarse sin ninguna jugada
// legal, así que la captura libre queda permitida.
export const PERMITIR_CAPTURA_LIBRE_CON_FORMACION_PROPIA = true;

/* ------------------------------------------------------------------ */
/* Lectura del estado                                                   */
/* ------------------------------------------------------------------ */

export function cartaEnMano(estado, jugador, cartaId) {
  return estado.manos[jugador].find((c) => c.id === cartaId) || null;
}

export function montonPorId(estado, montonId) {
  return estado.mesa.find((m) => m.id === montonId) || null;
}

/** ¿Tiene en mano otra carta que pueda valer `valor`? (exige formar/fila) */
export function tieneEnMano(estado, jugador, valor, exceptoId) {
  return estado.manos[jugador].some(
    (c) => c.id !== exceptoId && valoresDe(c).includes(valor),
  );
}

/**
 * ¿Son del mismo bando? Con 4 jugadores en parejas los compañeros van
 * cruzados (0-2 y 1-3), que es lo mismo que decir "igual paridad".
 */
export function mismoBando(estado, a, b) {
  if (a == null || b == null) return false;
  if (a === b) return true;
  if (!estado.config?.enParejas || estado.config?.numJugadores !== 4) return false;
  return a % 2 === b % 2;
}

/**
 * Valores que el jugador puede apilar sin tener la carta en su mano: los de
 * las pilas que ya formó su equipo.
 *
 * Jugando en parejas la carta se comparte, pero con un orden: primero forma
 * quien la tiene, y sólo entonces el compañero puede seguir apilando encima.
 * Por eso mira las pilas ya hechas, no las manos.
 */
export function valoresPrestadosPorElEquipo(estado, jugador) {
  const valores = new Set();
  for (const m of estado.mesa) {
    if (m.tipo !== 'suelta' && mismoBando(estado, jugador, m.dueño)) valores.add(m.valor);
  }
  return valores;
}

/** Formaciones y filas propias que el jugador tiene comprometidas en la mesa. */
export function formacionesPropias(estado, jugador) {
  return estado.mesa.filter((m) => m.tipo !== 'suelta' && m.dueño === jugador);
}

/* ------------------------------------------------------------------ */
/* Valores de los montones                                              */
/* ------------------------------------------------------------------ */

/**
 * Un montón suelto con un As puede contar como 1 o como 14, así que hay que
 * probar todas las combinaciones. Devuelve cada asignación posible de valores.
 */
function asignacionesDeValores(montones) {
  let asignaciones = [[]];
  for (const m of montones) {
    const opciones = m.tipo === 'suelta' ? m.valores : [m.valor];
    const siguiente = [];
    for (const parcial of asignaciones) {
      for (const v of opciones) siguiente.push([...parcial, v]);
    }
    asignaciones = siguiente;
    if (asignaciones.length > 4096) break; // tope de seguridad
  }
  return asignaciones;
}

/** ¿Los montones se reparten en grupos que suman `objetivo`? */
function montonesParticionables(montones, objetivo, extras = []) {
  if (montones.length === 0 && extras.length === 0) return false;
  for (const valores of asignacionesDeValores(montones)) {
    if (particionable([...valores, ...extras], objetivo)) return true;
  }
  return false;
}

/** Suma fija de los montones cuando ninguno admite valor alternativo. */
function sumaPosibles(montones) {
  return asignacionesDeValores(montones).map((vs) => vs.reduce((a, b) => a + b, 0));
}

/* ------------------------------------------------------------------ */
/* Validación de jugadas                                                */
/* ------------------------------------------------------------------ */

const ok = () => ({ ok: true });
const no = (motivo) => ({ ok: false, motivo });

/**
 * Comprueba una jugada contra el estado. Es la única autoridad: el servidor la
 * ejecuta sobre toda intención que llega del cliente.
 */
export function validarJugada(estado, jugador, jugada) {
  if (estado.fase !== 'jugando') return no('La ronda no está en juego');
  if (estado.turno !== jugador) return no('No es tu turno');

  const carta = cartaEnMano(estado, jugador, jugada.cartaId);
  if (!carta) return no('Esa carta no está en tu mano');

  const posibles = valoresDe(carta);
  const valorCarta = jugada.valorCarta ?? posibles[0];
  if (!posibles.includes(valorCarta)) {
    return no(`El ${carta.nombre} no puede jugarse con valor ${valorCarta}`);
  }

  const ids = jugada.montones || [];
  if (new Set(ids).size !== ids.length) return no('Montón repetido');
  const montones = ids.map((id) => montonPorId(estado, id));
  if (montones.some((m) => !m)) return no('Ese montón ya no está en la mesa');

  switch (jugada.tipo) {
    case 'abierto':
      return validarAbierto(estado, jugador, montones);
    case 'capturar':
      return validarCapturar(estado, jugador, carta, valorCarta, montones);
    case 'formar':
      return validarFormar(estado, jugador, carta, valorCarta, montones, jugada.valor);
    case 'fila':
      return validarFila(estado, jugador, carta, valorCarta, montones, jugada.valor);
    default:
      return no('Jugada desconocida');
  }
}

function validarAbierto(estado, jugador, montones) {
  if (montones.length > 0) return no('Jugar abierto no lleva montones');
  if (formacionesPropias(estado, jugador).length > 0) {
    // Escape para no trabar la partida: sólo si no hay ninguna otra jugada.
    if (hayOtraJugada(estado, jugador)) {
      return no('Tienes una formación en la mesa: no puedes jugar abierto');
    }
  }
  return ok();
}

function validarCapturar(estado, jugador, carta, valorCarta, montones) {
  if (montones.length === 0) return no('No seleccionaste nada que capturar');

  // Formaciones y filas no se parten: cada una vale su total declarado.
  const bloqueados = montones.filter((m) => m.tipo !== 'suelta');
  if (bloqueados.some((m) => m.valor !== valorCarta)) {
    return no(`Sólo puedes levantar formaciones que valgan ${valorCarta}`);
  }

  const sueltas = montones.filter((m) => m.tipo === 'suelta');
  if (sueltas.length > 0 && !montonesParticionables(sueltas, valorCarta)) {
    return no(`Esas cartas no suman ${valorCarta}`);
  }

  if (
    !PERMITIR_CAPTURA_LIBRE_CON_FORMACION_PROPIA &&
    formacionesPropias(estado, jugador).length > 0 &&
    !montones.some((m) => m.tipo !== 'suelta')
  ) {
    return no('Tienes una formación en la mesa: resuélvela primero');
  }

  return ok();
}

function validarFormar(estado, jugador, carta, valorCarta, montones, valor) {
  if (carta.mona) return no('La Mona no forma: sólo captura sumas de 15');
  if (!Number.isInteger(valor) || valor < 2 || valor > VALOR_MONA) {
    return no('Valor a formar inválido');
  }
  if (montones.length === 0) return no('Formar necesita al menos un montón');
  if (montones.some((m) => m.tipo === 'fila')) {
    return no('El valor de una fila no se puede cambiar');
  }
  if (!tieneEnMano(estado, jugador, valor, carta.id)) {
    return no(`Necesitas tener un ${valor} en la mano para formar ${valor}`);
  }
  // Formar es UN solo grupo: la carta más los montones suman el valor declarado.
  if (!sumaPosibles(montones).some((s) => s + valorCarta === valor)) {
    return no(`Eso no suma ${valor}`);
  }
  const conflicto = formacionesPropias(estado, jugador).some(
    (m) => m.valor === valor && !montones.includes(m),
  );
  if (conflicto) return no(`Ya tienes una formación de ${valor} en la mesa`);
  return ok();
}

function validarFila(estado, jugador, carta, valorCarta, montones, valor) {
  if (carta.mona) return no('La Mona no hace fila');
  // Hasta 15: se puede seguir apilando grupos de 15 sobre una formación de 15
  // (un 6 de la mano sobre un 9 de la mesa, por ejemplo). No hacen falta dos
  // cartas de quince — los grupos están en la mesa y basta con tener La Mona
  // en la mano para levantarlos después.
  if (!Number.isInteger(valor) || valor < 2 || valor > VALOR_MONA) {
    return no('Valor de fila inválido');
  }
  if (montones.length === 0) return no('Una fila necesita al menos un montón');
  // Se puede apilar teniendo la carta… o sobre una pila que ya formó tu
  // compañero: en parejas la carta es del equipo una vez que está en juego.
  const prestada = montones.some(
    (m) => m.tipo !== 'suelta' && m.valor === valor && mismoBando(estado, jugador, m.dueño),
  );
  if (!prestada && !tieneEnMano(estado, jugador, valor, carta.id)) {
    return no(`Necesitas tener un ${valor} en la mano para hacer fila de ${valor}`);
  }

  const bloqueados = montones.filter((m) => m.tipo !== 'suelta');
  if (bloqueados.some((m) => m.valor !== valor)) {
    return no(`En una fila de ${valor} todo debe valer ${valor}`);
  }

  // La carta jugada entra en uno de los grupos y todos suman el mismo valor.
  // Una fila son DOS O MÁS grupos de ese valor: si sale uno solo, eso es una
  // formación, no una fila.
  const sueltas = montones.filter((m) => m.tipo === 'suelta');
  let arma = false;
  for (const valores of asignacionesDeValores(sueltas)) {
    const conjunto = [...valores, valorCarta];
    if (!particionable(conjunto, valor)) continue;
    const grupos = conjunto.reduce((a, b) => a + b, 0) / valor + bloqueados.length;
    if (grupos >= 2) {
      arma = true;
      break;
    }
  }
  if (!arma) return no(`Esas cartas no arman dos o más grupos de ${valor}`);

  const conflicto = formacionesPropias(estado, jugador).some(
    (m) => m.valor === valor && !montones.includes(m),
  );
  if (conflicto) return no(`Ya tienes una formación de ${valor} en la mesa`);
  return ok();
}

/** ¿El jugador tiene alguna jugada que no sea jugar abierto? */
function hayOtraJugada(estado, jugador) {
  for (const carta of estado.manos[jugador]) {
    for (const valorCarta of valoresDe(carta)) {
      for (const m of estado.mesa) {
        const r = validarCapturar(estado, jugador, carta, valorCarta, [m]);
        if (r.ok) return true;
      }
      for (let valor = 2; valor <= VALOR_MONA; valor++) {
        for (const m of estado.mesa) {
          if (validarFormar(estado, jugador, carta, valorCarta, [m], valor).ok) return true;
          if (valor <= 14 && validarFila(estado, jugador, carta, valorCarta, [m], valor).ok) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* Enumeración de jugadas (para resaltar opciones en pantalla)          */
/* ------------------------------------------------------------------ */

/** Subconjuntos no vacíos de la mesa, acotados para no explotar. */
function* subconjuntos(mesa, maxTam) {
  const n = mesa.length;
  if (n === 0) return;
  const combinar = function* (desde, actual) {
    if (actual.length > 0) yield actual;
    if (actual.length === maxTam) return;
    for (let i = desde; i < n; i++) yield* combinar(i + 1, [...actual, mesa[i]]);
  };
  yield* combinar(0, []);
}

/**
 * Jugadas legales del jugador. La usa el servidor (para detectar que alguien
 * quedó sin salida y para jugar automático) y el navegador (para resaltar
 * opciones sobre la mesa).
 *
 * `opciones.cartaId` limita la búsqueda a una sola carta y `opciones.maxMontones`
 * al tamaño de las combinaciones: enumerar todo en cada toque de pantalla sería
 * demasiado lento. Para decidir si una jugada CONCRETA vale, usa
 * `validarJugada`, que es exacta y barata.
 */
export function jugadasLegales(estado, jugador = estado.turno, opciones = {}) {
  const jugadas = [];
  const mano = estado.manos[jugador];
  const cartas = opciones.cartaId
    ? mano.filter((c) => c.id === opciones.cartaId)
    : mano;
  const maxTam = Math.min(
    opciones.maxMontones ?? estado.mesa.length,
    estado.mesa.length,
    12,
  );

  const agregar = (jugada) => {
    if (validarJugada(estado, jugador, jugada).ok) jugadas.push(jugada);
  };

  for (const carta of cartas) {
    // Valores que el jugador conserva en mano: los únicos a los que puede
    // formar o hacer fila, porque necesita la carta que los levante.
    const valoresEnMano = new Set([
      ...mano.filter((c) => c.id !== carta.id).flatMap(valoresDe),
      ...valoresPrestadosPorElEquipo(estado, jugador),
    ]);

    for (const valorCarta of valoresDe(carta)) {
      agregar({ tipo: 'abierto', cartaId: carta.id, valorCarta });

      for (const grupo of subconjuntos(estado.mesa, maxTam)) {
        const ids = grupo.map((m) => m.id);
        agregar({ tipo: 'capturar', cartaId: carta.id, valorCarta, montones: ids });

        for (const valor of valoresEnMano) {
          agregar({ tipo: 'formar', cartaId: carta.id, valorCarta, montones: ids, valor });
          agregar({ tipo: 'fila', cartaId: carta.id, valorCarta, montones: ids, valor });
        }
      }
    }
  }
  return jugadas;
}

/**
 * Las acciones posibles con una carta y una selección EXACTA de montones.
 * Sólo valida esa combinación, así que es instantánea: es lo que alimenta los
 * botones de la mesa.
 */
export function accionesPara(estado, jugador, cartaId, montonesIds) {
  const carta = cartaEnMano(estado, jugador, cartaId);
  if (!carta) return [];

  const mano = estado.manos[jugador];
  const valoresEnMano = [...new Set([
    ...mano.filter((c) => c.id !== cartaId).flatMap(valoresDe),
    ...valoresPrestadosPorElEquipo(estado, jugador),
  ])];

  const acciones = [];
  const probar = (jugada) => {
    if (validarJugada(estado, jugador, jugada).ok) acciones.push(jugada);
  };

  for (const valorCarta of valoresDe(carta)) {
    if (montonesIds.length === 0) {
      probar({ tipo: 'abierto', cartaId, valorCarta });
      continue;
    }
    probar({ tipo: 'capturar', cartaId, valorCarta, montones: montonesIds });
    for (const valor of valoresEnMano) {
      probar({ tipo: 'formar', cartaId, valorCarta, montones: montonesIds, valor });
      probar({ tipo: 'fila', cartaId, valorCarta, montones: montonesIds, valor });
    }
  }
  return acciones;
}

/** Montones que pueden entrar en alguna jugada con esta carta (pista visual). */
export function montonesJugables(estado, jugador, cartaId, maxMontones = 3) {
  const utiles = new Set();
  for (const j of jugadasLegales(estado, jugador, { cartaId, maxMontones })) {
    for (const id of j.montones ?? []) utiles.add(id);
  }
  return utiles;
}
