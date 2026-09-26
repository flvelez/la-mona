/**
 * Puente entre la vista que recibe el cliente y el motor de reglas.
 *
 * El cliente sólo conoce su propia mano, pero eso basta para calcular sus
 * jugadas legales: la mesa es información pública. Así el navegador usa
 * EXACTAMENTE el mismo `core/reglas.js` que el servidor — el cliente para
 * iluminar opciones, el servidor para validar. Una sola fuente de verdad.
 */
export function estadoDesdeVista(vista) {
  const manos = Array.from({ length: vista.config.numJugadores }, () => []);
  manos[vista.yo] = vista.miMano;
  return {
    fase: vista.fase,
    turno: vista.turno,
    mesa: vista.mesa,
    manos,
    config: vista.config,
  };
}
