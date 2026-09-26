import test from 'node:test';
import assert from 'node:assert/strict';

import { crearBaraja, valoresDe, VALOR_MONA } from '../core/cartas.js';
import { planDeRepartos, TOTAL_CARTAS } from '../core/reparto.js';
import { particionable } from '../core/particion.js';
import { validarJugada, jugadasLegales, accionesPara, montonesJugables } from '../core/reglas.js';
import { crearPartida, jugar, siguienteRonda } from '../core/partida.js';
import { puntuarRonda } from '../core/puntaje.js';

/* ------------------------------ baraja ----------------------------- */

test('la baraja tiene 53 cartas únicas e incluye La Mona', () => {
  const b = crearBaraja();
  assert.equal(b.length, 53);
  assert.equal(new Set(b.map((c) => c.id)).size, 53);
  const mona = b.find((c) => c.mona);
  assert.equal(mona.valor, VALOR_MONA);
});

test('el As vale 1 o 14; La Mona vale 15', () => {
  const b = crearBaraja();
  assert.deepEqual(valoresDe(b.find((c) => c.id === 'C1')), [1, 14]);
  assert.deepEqual(valoresDe(b.find((c) => c.id === 'C7')), [7]);
  assert.deepEqual(valoresDe(b.find((c) => c.mona)), [15]);
});

/* ----------------------------- reparto ----------------------------- */

test('el reparto cuadra exacto y nunca da tandas de 1 o 2', () => {
  for (const n of [2, 3, 4]) {
    const { enMesa, porJugador, repartos } = planDeRepartos(n);
    assert.equal(enMesa + porJugador * n, TOTAL_CARTAS, `${n} jugadores`);
    assert.equal(repartos.reduce((a, b) => a + b, 0), porJugador);
    assert.ok(repartos.every((r) => r >= 3 && r <= 5), `tandas: ${repartos}`);
  }
  assert.deepEqual(planDeRepartos(2).repartos, [4, 4, 4, 4, 5, 5]);
  assert.deepEqual(planDeRepartos(3).repartos, [4, 4, 4, 5]);
  assert.deepEqual(planDeRepartos(4).repartos, [4, 4, 5]);
  assert.equal(planDeRepartos(3).enMesa, 2);
});

/* ---------------------- ejemplos del reglamento -------------------- */

test('los ejemplos del reglamento se parten correctamente', () => {
  assert.ok(particionable([3, 6], 9), 'un 3 y un 6 con un 9');
  assert.ok(particionable([2, 4, 4], 10), 'un 2, 4 y 4 con un 10');
  assert.ok(particionable([12, 1], 13), 'una reina y un as con un rey');
  assert.ok(particionable([13, 1], 14), 'un rey y un as con un as de 14');
  assert.ok(particionable([3, 4, 7], 7), 'un 3, un 4 y un 7 con un 7');
  assert.ok(particionable([5, 3, 8, 6, 2], 8), 'fila de ochos con 5 cartas');
  assert.ok(!particionable([3, 6], 8));
  assert.ok(!particionable([15], 14), 'nadie levanta un 15');
});

/* ------------------------- mesa de laboratorio --------------------- */

function mesaDe(montones) {
  return montones.map((m, i) => ({
    id: `m${i}`,
    tipo: m.tipo ?? 'suelta',
    valor: m.valor,
    valores: m.valores ?? [m.valor],
    cartas: m.cartas ?? [{ id: `x${i}`, valor: m.valor, palo: 'Espadas', nombre: 'x' }],
    dueño: m.dueño ?? null,
  }));
}

function escenario({ mano, mesa, turno = 0 }) {
  return {
    fase: 'jugando',
    turno,
    manos: [mano, []],
    mesa: mesaDe(mesa),
    config: { numJugadores: 2 },
  };
}

const c = (id, valor, palo = 'Espadas', extra = {}) => ({
  id, valor, palo, nombre: String(valor), mona: false, ...extra,
});

test('capturar combinando: un 9 se lleva el 3 y el 6', () => {
  const e = escenario({ mano: [c('E9', 9)], mesa: [{ valor: 3 }, { valor: 6 }] });
  assert.ok(validarJugada(e, 0, {
    tipo: 'capturar', cartaId: 'E9', valorCarta: 9, montones: ['m0', 'm1'],
  }).ok);
});

test('un As puede capturar un rey más un as jugando como 14', () => {
  const e = escenario({ mano: [c('E1', 1)], mesa: [{ valor: 13 }, { valor: 1, valores: [1, 14] }] });
  assert.ok(validarJugada(e, 0, {
    tipo: 'capturar', cartaId: 'E1', valorCarta: 14, montones: ['m0', 'm1'],
  }).ok);
});

test('formar exige tener en mano la carta del total', () => {
  const conNueve = escenario({ mano: [c('E2', 2), c('E9', 9)], mesa: [{ valor: 7 }] });
  assert.ok(validarJugada(conNueve, 0, {
    tipo: 'formar', cartaId: 'E2', valorCarta: 2, montones: ['m0'], valor: 9,
  }).ok, 'con el 9 en mano sí se puede formar 9');

  const sinNueve = escenario({ mano: [c('E2', 2), c('E5', 5)], mesa: [{ valor: 7 }] });
  const r = validarJugada(sinNueve, 0, {
    tipo: 'formar', cartaId: 'E2', valorCarta: 2, montones: ['m0'], valor: 9,
  });
  assert.ok(!r.ok);
  assert.match(r.motivo, /Necesitas tener un 9/);
});

test('el valor de una fila no se puede cambiar', () => {
  const e = escenario({
    mano: [c('E1', 1), c('E9', 9)],
    mesa: [{ tipo: 'fila', valor: 8, dueño: 1 }],
  });
  const r = validarJugada(e, 0, {
    tipo: 'formar', cartaId: 'E1', valorCarta: 1, montones: ['m0'], valor: 9,
  });
  assert.ok(!r.ok);
  assert.match(r.motivo, /fila no se puede cambiar/);
});

test('una formación ajena sí se puede subir de valor', () => {
  const e = escenario({
    mano: [c('E1', 1), c('E9', 9)],
    mesa: [{ tipo: 'formacion', valor: 8, dueño: 1 }],
  });
  assert.ok(validarJugada(e, 0, {
    tipo: 'formar', cartaId: 'E1', valorCarta: 1, montones: ['m0'], valor: 9,
  }).ok);
});

test('fila de ochos: el ejemplo completo del reglamento', () => {
  // Mesa 2 K 6 5 8, en mano un 3 y un 8. El 3 va sobre el 5 (=8) y se juntan
  // el 8 y el 6+2 en una sola fila de ochos.
  const e = escenario({
    mano: [c('E3', 3), c('E8', 8)],
    mesa: [{ valor: 2 }, { valor: 13 }, { valor: 6 }, { valor: 5 }, { valor: 8 }],
  });
  assert.ok(validarJugada(e, 0, {
    tipo: 'fila', cartaId: 'E3', valorCarta: 3, montones: ['m0', 'm2', 'm3', 'm4'], valor: 8,
  }).ok);
});

test('con formación propia en mesa no se puede jugar abierto', () => {
  const e = escenario({
    mano: [c('E4', 4), c('E9', 9), c('E2', 2), c('E7', 7)],
    mesa: [{ tipo: 'formacion', valor: 9, dueño: 0 }, { valor: 5 }],
  });
  const r = validarJugada(e, 0, { tipo: 'abierto', cartaId: 'E4', valorCarta: 4 });
  assert.ok(!r.ok);
  assert.match(r.motivo, /no puedes jugar abierto/);
});

test('La Mona captura sumas de 15 y no forma ni hace fila', () => {
  const mona = c('MONA', 15, 'Especial', { mona: true, nombre: 'Mona' });
  const e = escenario({ mano: [mona, c('E7', 7)], mesa: [{ valor: 8 }, { valor: 7 }] });
  assert.ok(validarJugada(e, 0, {
    tipo: 'capturar', cartaId: 'MONA', valorCarta: 15, montones: ['m0', 'm1'],
  }).ok, 'levanta 8+7');
  assert.ok(!validarJugada(e, 0, {
    tipo: 'formar', cartaId: 'MONA', valorCarta: 15, montones: ['m0'], valor: 15,
  }).ok);
});

test('La Mona en la mesa no la levanta nadie: se ahoga', () => {
  const e = escenario({
    mano: [c('E1', 1), c('E2', 2)],
    mesa: [{ valor: 15, valores: [15] }],
  });
  for (const jugada of jugadasLegales(e, 0)) {
    assert.notEqual(jugada.tipo, 'capturar', `no debería poder capturar: ${JSON.stringify(jugada)}`);
  }
});

test('se puede formar 15 si tienes La Mona en la mano', () => {
  const mona = c('MONA', 15, 'Especial', { mona: true, nombre: 'Mona' });
  const e = escenario({ mano: [c('E7', 7), mona], mesa: [{ valor: 8 }] });
  assert.ok(validarJugada(e, 0, {
    tipo: 'formar', cartaId: 'E7', valorCarta: 7, montones: ['m0'], valor: 15,
  }).ok);
});

/* ----------------------------- puntaje ----------------------------- */

test('puntaje de ronda: 14 puntos en juego más winchos', () => {
  const baraja = crearBaraja();
  const r = puntuarRonda({
    capturadas: [baraja, []],
    winchos: [2, 0],
    numJugadores: 2,
    enParejas: false,
  });
  // 3 más cartas + 1 más espadas + 3 Mona + 2 el 10♦ + 1 el 2♠ + 4 ases = 14
  assert.equal(r.detalle[0].puntos, 14 + 2);
  assert.equal(r.detalle[1].puntos, 0);
  assert.equal(r.ganador, 0);
});

test('empate en cartas o espadas: esos puntos no los gana nadie', () => {
  const baraja = crearBaraja();
  const mitad = baraja.filter((c) => c.palo === 'Corazones' || c.palo === 'Tréboles');
  const otra = baraja.filter((c) => c.palo === 'Diamantes' || c.palo === 'Espadas');
  const r = puntuarRonda({
    capturadas: [mitad, otra.slice(0, mitad.length)],
    winchos: [0, 0],
    numJugadores: 2,
    enParejas: false,
  });
  assert.ok(!r.detalle[0].conceptos.some((x) => x.concepto === 'Más cartas'));
  assert.ok(!r.detalle[1].conceptos.some((x) => x.concepto === 'Más cartas'));
});

test('en parejas los compañeros van cruzados y suman juntos', () => {
  const r = puntuarRonda({
    capturadas: [[{ palo: 'Espadas', valor: 2, mona: false }], [], [{ palo: 'Diamantes', valor: 10, mona: false }], []],
    winchos: [0, 0, 0, 0],
    numJugadores: 4,
    enParejas: true,
  });
  assert.deepEqual(r.detalle[0].bando, [0, 2]);
  assert.equal(r.detalle[0].dosBonito, true);
  assert.equal(r.detalle[0].diezBonito, true);
});

/* --------------------- partidas completas al azar ------------------ */

function jugarRondaCompleta(partida) {
  let vueltas = 0;
  while (partida.fase === 'jugando') {
    if (++vueltas > 500) throw new Error('la ronda no termina: posible bloqueo');
    const opciones = jugadasLegales(partida, partida.turno);
    assert.ok(opciones.length > 0, `jugador ${partida.turno} sin jugadas legales`);
    const elegida = opciones[Math.floor(Math.random() * opciones.length)];
    const r = jugar(partida, partida.turno, elegida);
    assert.ok(r.ok, r.motivo);
  }
}

for (const [n, parejas] of [[2, false], [3, false], [4, false], [4, true]]) {
  test(`partida completa con ${n} jugadores${parejas ? ' en parejas' : ''}: nunca se traba y no se pierde ninguna carta`, () => {
    for (let intento = 0; intento < 15; intento++) {
      const partida = crearPartida({
        numJugadores: n,
        enParejas: parejas,
        rondasParaGanar: 1,
        semilla: intento * 1000 + n,
      });
      jugarRondaCompleta(partida);

      const capturadas = partida.capturadas.flat().length;
      const enMano = partida.manos.flat().length;
      assert.equal(partida.mesa.length, 0, 'la mesa queda vacía al cerrar');
      assert.equal(capturadas + enMano + partida.mazo.length, TOTAL_CARTAS,
        `se perdieron cartas (intento ${intento})`);
      const ids = partida.capturadas.flat().map((c) => c.id);
      assert.equal(new Set(ids).size, ids.length, 'hay cartas duplicadas');
      assert.ok(partida.resultadoRonda, 'se calculó el puntaje');
    }
  });
}

test('la partida termina cuando un bando llega a las rondas pactadas', () => {
  const partida = crearPartida({ numJugadores: 2, rondasParaGanar: 2, semilla: 42 });
  let rondas = 0;
  while (partida.fase !== 'finPartida') {
    if (++rondas > 30) throw new Error('la partida no termina');
    jugarRondaCompleta(partida);
    if (partida.fase === 'finRonda') siguienteRonda(partida);
  }
  assert.ok(partida.campeon !== null);
  assert.ok(partida.rondasGanadas[partida.campeon] >= 2);
});

/* ------------------- acciones exactas para la mesa ----------------- */

test('accionesPara devuelve sólo lo que cabe con esa selección exacta', () => {
  const e = escenario({
    mano: [c('E2', 2), c('E9', 9), c('E7', 7)],
    mesa: [{ valor: 7 }, { valor: 3 }],
  });

  // El 2 sobre el 7: puede formar 9 (tiene el 9) pero no capturar.
  const conSiete = accionesPara(e, 0, 'E2', ['m0']);
  assert.deepEqual(conSiete.map((a) => a.tipo).sort(), ['formar']);
  assert.equal(conSiete[0].valor, 9);

  // El 7 sobre el 7: captura, y también puede hacer fila de sietes... pero no,
  // porque no le queda otro 7 en la mano.
  const sieteSobreSiete = accionesPara(e, 0, 'E7', ['m0']);
  assert.deepEqual(sieteSobreSiete.map((a) => a.tipo), ['capturar']);

  // Sin selección, la única acción es jugar abierto.
  assert.deepEqual(accionesPara(e, 0, 'E9', []).map((a) => a.tipo), ['abierto']);
});

test('con un As se ofrecen las dos acciones: como 1 y como 14', () => {
  const e = escenario({
    mano: [c('E1', 1), c('E5', 5)],
    mesa: [{ valor: 13 }, { valor: 1, valores: [1, 14] }],
  });
  const acciones = accionesPara(e, 0, 'E1', ['m0', 'm1']);
  assert.ok(acciones.some((a) => a.tipo === 'capturar' && a.valorCarta === 14),
    'debería poder llevárselos jugando el As como 14');
});

test('montonesJugables señala sólo los montones que sirven', () => {
  const e = escenario({
    mano: [c('E9', 9), c('E2', 2)],
    mesa: [{ valor: 3 }, { valor: 6 }, { valor: 11 }],
  });
  const utiles = montonesJugables(e, 0, 'E9');
  assert.ok(utiles.has('m0') && utiles.has('m1'), 'el 3 y el 6 suman 9');
  assert.ok(!utiles.has('m2'), 'la J no entra en ninguna jugada con el 9');
});

test('acotar la búsqueda no inventa jugadas ilegales', () => {
  const e = escenario({
    mano: [c('E8', 8), c('E4', 4)],
    mesa: [{ valor: 5 }, { valor: 3 }, { valor: 2 }, { valor: 6 }, { valor: 8 }],
  });
  for (const j of jugadasLegales(e, 0, { maxMontones: 3 })) {
    assert.ok(validarJugada(e, 0, j).ok, `jugada inválida: ${JSON.stringify(j)}`);
  }
});

test('una fila necesita DOS grupos: un solo grupo es una formación', () => {
  const e = escenario({
    mano: [c('E2', 2), c('E9', 9), c('E7', 7)],
    mesa: [{ valor: 7 }],
  });
  // 2 sobre 7 = un solo grupo de 9 -> formación, nunca fila.
  assert.ok(validarJugada(e, 0, {
    tipo: 'formar', cartaId: 'E2', valorCarta: 2, montones: ['m0'], valor: 9,
  }).ok);
  const fila = validarJugada(e, 0, {
    tipo: 'fila', cartaId: 'E2', valorCarta: 2, montones: ['m0'], valor: 9,
  });
  assert.ok(!fila.ok);
  assert.match(fila.motivo, /dos o más grupos/);

  // 7 sobre 7 con otro 7 en mano sí son dos grupos de siete.
  const conDosSietes = escenario({
    mano: [c('E7', 7), c('C7', 7)],
    mesa: [{ valor: 7 }],
  });
  assert.ok(validarJugada(conDosSietes, 0, {
    tipo: 'fila', cartaId: 'E7', valorCarta: 7, montones: ['m0'], valor: 7,
  }).ok);
});
