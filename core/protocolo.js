// Mensajes que viajan entre navegador y servidor. Lo comparten los dos lados.

export const DEL_CLIENTE = {
  CREAR_SALA: 'crearSala',
  UNIRSE: 'unirse',
  CONFIGURAR: 'configurar',
  INICIAR: 'iniciar',
  JUGAR: 'jugar',
  SIGUIENTE_RONDA: 'siguienteRonda',
  VOLVER_LOBBY: 'volverAlLobby',
  SALIR: 'salir',
  PING: 'ping',
};

export const DEL_SERVIDOR = {
  SALA: 'sala',
  ESTADO: 'estado',
  ERROR: 'error',
  PONG: 'pong',
};

// Alfabeto sin caracteres que se confundan al dictar un código por teléfono:
// fuera 0/O, 1/I/L.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO = 4;

export function generarCodigo(existe = () => false) {
  for (let intento = 0; intento < 200; intento++) {
    let codigo = '';
    for (let i = 0; i < LARGO_CODIGO; i++) {
      codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
    }
    if (!existe(codigo)) return codigo;
  }
  throw new Error('No se pudo generar un código de sala libre');
}

/** Acepta el código escrito de cualquier forma: "k7 qm", "k7qm", "K7QM". */
export function normalizarCodigo(texto) {
  return String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function generarToken() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  ).toUpperCase();
}

export function limpiarNombre(texto, porDefecto) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim().slice(0, 16);
  return limpio || porDefecto;
}
