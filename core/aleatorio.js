// Aleatoriedad con semilla: el servidor baraja, y la misma semilla reproduce
// la partida exacta (indispensable para depurar y para los tests).

/** Generador mulberry32: rápido, determinista y suficiente para barajar. */
export function crearAleatorio(semilla) {
  let a = semilla >>> 0;
  return function siguiente() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function semillaAleatoria() {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Fisher-Yates. Devuelve un arreglo nuevo; no muta el original.
 * (El `sort(() => Math.random() - 0.5)` del prototipo no reparte parejo.)
 */
export function barajar(cartas, aleatorio) {
  const copia = cartas.slice();
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
