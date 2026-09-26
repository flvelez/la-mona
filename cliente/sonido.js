/**
 * Sonido del juego, generado con la Web Audio API: sin archivos que descargar
 * y sin dependencias.
 *
 * Los navegadores sólo dejan sonar después de que la persona toque la
 * pantalla, así que el audio se despierta en el primer toque. Y como en un
 * juego el sonido puede molestar, se puede apagar y la preferencia se recuerda.
 */

const LLAVE = 'lamona.sonido';

let contexto = null;
let encendido = leerPreferencia();

function leerPreferencia() {
  try {
    return localStorage.getItem(LLAVE) !== 'no';
  } catch {
    return true;
  }
}

export function sonidoEncendido() {
  return encendido;
}

export function alternarSonido() {
  encendido = !encendido;
  try {
    localStorage.setItem(LLAVE, encendido ? 'si' : 'no');
  } catch {
    /* navegación privada: al menos vale para esta sesión */
  }
  if (encendido) despertar();
  return encendido;
}

/** Se llama en el primer toque: sin un gesto previo el navegador no deja sonar. */
export function despertar() {
  try {
    contexto ??= new (window.AudioContext ?? window.webkitAudioContext)();
    if (contexto.state === 'suspended') contexto.resume();
  } catch {
    contexto = null; // sin audio disponible; el juego sigue igual
  }
}

/** Una nota simple. `tipo` cambia el timbre; el volumen baja hasta callar. */
function nota(hz, { inicio = 0, duracion = 0.12, volumen = 0.14, tipo = 'sine' } = {}) {
  if (!contexto) return;
  const t = contexto.currentTime + inicio;
  const osc = contexto.createOscillator();
  const gan = contexto.createGain();

  osc.type = tipo;
  osc.frequency.setValueAtTime(hz, t);

  // Subida rápida y caída suave: un corte seco suena a "clic" molesto.
  gan.gain.setValueAtTime(0.0001, t);
  gan.gain.exponentialRampToValueAtTime(volumen, t + 0.012);
  gan.gain.exponentialRampToValueAtTime(0.0001, t + duracion);

  osc.connect(gan).connect(contexto.destination);
  osc.start(t);
  osc.stop(t + duracion + 0.02);
}

const TOQUES = {
  // Dejar una carta: golpe corto y seco, como el naipe sobre la mesa.
  carta: () => nota(190, { duracion: 0.09, volumen: 0.1, tipo: 'triangle' }),

  // Levantar cartas: dos notas que suben, sensación de recoger.
  llevar: () => {
    nota(523, { duracion: 0.1, volumen: 0.12 });
    nota(784, { inicio: 0.08, duracion: 0.14, volumen: 0.12 });
  },

  // Formar o hacer fila: una nota media, más apagada que una captura.
  formar: () => nota(392, { duracion: 0.13, volumen: 0.1, tipo: 'triangle' }),

  // Chupe: arpegio alegre, es la jugada que más se celebra.
  chupe: () => {
    [523, 659, 784, 1047].forEach((hz, i) =>
      nota(hz, { inicio: i * 0.075, duracion: 0.2, volumen: 0.13 }));
  },

  // Te toca: dos golpes suaves para que levantes la vista del teléfono.
  turno: () => {
    nota(660, { duracion: 0.1, volumen: 0.1 });
    nota(880, { inicio: 0.11, duracion: 0.12, volumen: 0.1 });
  },

  // Se acaba el tiempo: tic de aviso, discreto pero claro.
  prisa: () => nota(1200, { duracion: 0.06, volumen: 0.09, tipo: 'square' }),

  // Fin de ronda.
  ronda: () => {
    [392, 523, 659].forEach((hz, i) =>
      nota(hz, { inicio: i * 0.1, duracion: 0.25, volumen: 0.11 }));
  },
};

/** Vibración corta; muchos teléfonos la agradecen más que el sonido. */
function vibrar(patron) {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* no todos los navegadores la tienen */
  }
}

const VIBRACIONES = {
  llevar: [18, 40, 25],
  chupe: [25, 50, 25, 50, 45],
  turno: [30],
  carta: [12],
};

export function tocar(nombre) {
  if (!encendido) return;
  despertar();
  TOQUES[nombre]?.();
  if (VIBRACIONES[nombre]) vibrar(VIBRACIONES[nombre]);
}
