/**
 * El corazón de las reglas de La Mona.
 *
 * "Tomar", "combinar" y "hacer fila" son la misma operación por debajo:
 * se elige un conjunto de montones de la mesa y se reparte en grupos donde
 * CADA grupo suma exactamente el valor objetivo.
 *
 *   tomar un 7 con un 7        -> grupos: [7]
 *   tomar un 3 y un 6 con un 9 -> grupos: [3+6]
 *   tomar 3, 4 y 7 con un 7    -> grupos: [3+4], [7]
 *
 * Los montones ya formados o en fila no se pueden partir: cada uno tiene que
 * ser un grupo completo por sí solo, así que su valor debe ser el objetivo.
 */

/**
 * ¿Se pueden repartir todos estos valores en grupos que sumen `objetivo`?
 * Backtracking clásico de "partition to k equal-sum subsets".
 */
export function particionable(valores, objetivo) {
  if (objetivo <= 0) return false;
  if (valores.length === 0) return false;

  const total = valores.reduce((a, b) => a + b, 0);
  if (total % objetivo !== 0) return false;
  if (valores.some((v) => v > objetivo)) return false;

  const orden = valores.slice().sort((a, b) => b - a);
  const grupos = total / objetivo;
  const usado = new Array(orden.length).fill(false);

  function llenar(gruposRestantes, acumulado, desde) {
    if (gruposRestantes === 0) return true;
    if (acumulado === objetivo) return llenar(gruposRestantes - 1, 0, 0);

    let anterior = -1;
    for (let i = desde; i < orden.length; i++) {
      if (usado[i]) continue;
      if (orden[i] === anterior) continue; // poda: valores repetidos ya probados
      if (acumulado + orden[i] > objetivo) continue;

      usado[i] = true;
      if (llenar(gruposRestantes, acumulado + orden[i], i + 1)) return true;
      usado[i] = false;
      anterior = orden[i];

      // Si al abrir un grupo el primer candidato falla, ninguno servirá.
      if (acumulado === 0) return false;
    }
    return false;
  }

  return llenar(grupos, 0, 0);
}

/** Cuántos grupos de valor `objetivo` salen de estos valores. */
export function cuantosGrupos(valores, objetivo) {
  const total = valores.reduce((a, b) => a + b, 0);
  return total / objetivo;
}
