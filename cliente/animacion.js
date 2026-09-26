/**
 * Animación de las cartas.
 *
 * La mesa se repinta entera en cada actualización, así que las cartas no se
 * mueven: desaparecen y reaparecen en otro sitio. Aquí se usa la técnica FLIP
 * (First, Last, Invert, Play): se apunta dónde estaba cada carta ANTES de
 * repintar y, ya repintada, se la coloca de vuelta en su sitio viejo con una
 * transformación y se la deja viajar sola hasta el nuevo.
 *
 * Las cartas se reconocen entre repintados por su atributo `data-carta`.
 */

const MOVER_MS = 340;
const REPARTO_MS = 300;
const VUELO_MS = 460;
const SALIDA = 'cubic-bezier(.2,.7,.3,1)';

function sinMovimiento() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Con la pestaña en segundo plano el navegador congela las animaciones, así
 * que `onfinish` no llega nunca y los clones se quedarían para siempre en el
 * DOM. Como además nadie las está viendo, ahí no se anima nada.
 */
function nadieMirando() {
  return document.hidden;
}

/** Dónde está cada carta ahora mismo, y cómo se ve (para poder clonarla). */
export function instantanea() {
  const mapa = new Map();
  for (const el of document.querySelectorAll('[data-carta]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue; // oculta: no sirve de origen
    mapa.set(el.dataset.carta, { x: r.left, y: r.top, ancho: r.width, html: el.outerHTML });
  }
  return mapa;
}

/**
 * @param antes        instantánea tomada justo antes de repintar
 * @param destinoVuelo elemento al que vuelan las cartas capturadas (un asiento)
 * @param hayReparto   true si acaban de repartirse cartas nuevas
 */
export function animarCambios(antes, { destinoVuelo = null, hayReparto = false } = {}) {
  if (sinMovimiento() || nadieMirando()) return;

  const ahora = new Map();
  for (const el of document.querySelectorAll('[data-carta]')) {
    ahora.set(el.dataset.carta, el);
  }

  let nuevas = 0;
  for (const [id, el] of ahora) {
    const previo = antes.get(id);

    if (!previo) {
      entrar(el, hayReparto ? nuevas++ : 0);
      continue;
    }

    const r = el.getBoundingClientRect();
    const dx = previo.x - r.left;
    const dy = previo.y - r.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) continue;

    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)`, zIndex: 20 }, { transform: 'none' }],
      { duration: MOVER_MS, easing: SALIDA },
    );
  }

  // Las cartas que ya no están en pantalla se las llevó alguien: se clonan en
  // su último sitio y se las manda volando hacia su asiento.
  if (destinoVuelo) {
    const caja = destinoVuelo.getBoundingClientRect();
    const idas = [...antes].filter(([id]) => !ahora.has(id));
    idas.forEach(([, previo], i) => volar(previo, caja, i));
  }
}

function entrar(el, indice) {
  el.animate(
    [
      { opacity: 0, transform: 'translateY(16px) scale(.9)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: REPARTO_MS, easing: SALIDA, delay: indice * 55, fill: 'backwards' },
  );
}

function volar(previo, caja, indice) {
  const molde = document.createElement('div');
  molde.innerHTML = previo.html;
  const clon = molde.firstElementChild;
  if (!clon) return;

  // El clon es decorativo: fuera estados de selección y de interacción.
  clon.classList.remove('elegida', 'elegido', 'jugable', 'bloqueada');
  clon.removeAttribute('style');
  Object.assign(clon.style, {
    position: 'fixed',
    left: `${previo.x}px`,
    top: `${previo.y}px`,
    margin: '0',
    zIndex: '90',
    pointerEvents: 'none',
  });
  document.body.appendChild(clon);

  const dx = caja.left + caja.width / 2 - previo.x - previo.ancho / 2;
  const dy = caja.top + caja.height / 2 - previo.y;

  const retraso = indice * 35;
  const viaje = clon.animate(
    [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(.35) rotate(${indice % 2 ? 8 : -8}deg)`, opacity: 0 },
    ],
    { duration: VUELO_MS, easing: 'cubic-bezier(.5,0,.8,.4)', delay: retraso, fill: 'forwards' },
  );

  const quitar = () => clon.remove();
  viaje.onfinish = quitar;
  viaje.oncancel = quitar;
  // Red de seguridad: si la animación se congela (pestaña oculta, sistema
  // cargado), el clon se retira igual. `remove()` no molesta si ya se fue.
  setTimeout(quitar, VUELO_MS + retraso + 400);
}
