import { Conexion } from './conexion.js';
import { Mesa } from './mesa.js';

const $ = (id) => document.getElementById(id);
const conexion = new Conexion();
const mesa = new Mesa(conexion);
let vista = null;

/* ------------------------------ pantallas --------------------------- */

function mostrar(cual) {
  for (const p of ['entrada', 'lobby', 'mesa']) {
    $(`pantalla-${p}`).hidden = p !== cual;
  }
  if (cual !== 'mesa') $('modal-puntaje').hidden = true;
}

let relojAviso = null;

/**
 * Los errores se muestran en un aviso flotante porque `#error` vive dentro de
 * la pantalla de entrada: durante la partida quedaba oculto y el jugador no
 * se enteraba de que el servidor le había rechazado la jugada.
 */
function avisarError(motivo) {
  $('error').textContent = motivo;
  $('error').hidden = !motivo;

  clearTimeout(relojAviso);
  $('aviso').textContent = motivo;
  $('aviso').hidden = !motivo;
  if (motivo) relojAviso = setTimeout(() => ($('aviso').hidden = true), 4000);
}

/* ------------------------------- entrada ---------------------------- */

for (const id of ['rondas', 'rondas-lobby']) {
  $(id).innerHTML = Array.from({ length: 10 }, (_, i) =>
    `<option value="${i + 1}"${i + 1 === 3 ? ' selected' : ''}>${i + 1}</option>`,
  ).join('');
}

$('nombre').value = conexion.sesion?.nombre || conexion.nombreRecordado();

$('btn-crear').onclick = () => {
  avisarError('');
  conexion.crearSala($('nombre').value, {
    numJugadores: Number($('cupo').value),
    rondasParaGanar: Number($('rondas').value),
  });
};

$('btn-unirse').onclick = () => {
  avisarError('');
  const codigo = $('codigo').value.trim();
  if (!codigo) return avisarError('Escribe el código de la sala');
  conexion.unirse(codigo, $('nombre').value);
};

$('codigo').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

/* -------------------------------- lobby ----------------------------- */

$('btn-copiar').onclick = async () => {
  try {
    await navigator.clipboard.writeText(vista.codigo);
    $('btn-copiar').textContent = '¡Copiado!';
    setTimeout(() => ($('btn-copiar').textContent = 'Copiar código'), 1500);
  } catch {
    $('btn-copiar').textContent = vista.codigo;
  }
};

$('rondas-lobby').onchange = (e) =>
  conexion.configurar({ rondasParaGanar: Number(e.target.value) });
$('parejas').onchange = (e) => conexion.configurar({ enParejas: e.target.checked });
$('btn-iniciar').onclick = () => conexion.iniciar();

for (const id of ['btn-salir', 'btn-salir-mesa']) {
  $(id).onclick = () => {
    conexion.salir();
    location.reload();
  };
}

function pintarLobby() {
  $('codigo-sala').textContent = vista.codigo;

  $('lista-jugadores').innerHTML = vista.jugadores
    .map((j, i) => `
      <li class="${j.conectado ? '' : 'fuera'}">
        <span class="punto"></span>
        <span>${escapar(j.nombre)}${i === vista.yo ? ' (tú)' : ''}</span>
        ${i === vista.anfitrion ? '<span class="corona">ANFITRIÓN</span>' : ''}
      </li>`)
    .join('');

  const soyAnfitrion = vista.yo === vista.anfitrion;
  $('opciones-anfitrion').hidden = !soyAnfitrion;
  $('rondas-lobby').value = vista.config.rondasParaGanar;
  $('parejas').checked = vista.config.enParejas;
  // Las parejas sólo tienen sentido con 4 jugadores.
  $('fila-parejas').hidden = vista.jugadores.length !== 4;

  const faltan = 2 - vista.jugadores.length;
  $('btn-iniciar').disabled = faltan > 0;
  $('aviso-lobby').textContent = faltan > 0
    ? 'Falta al menos un jugador más para empezar.'
    : soyAnfitrion
      ? `Listos para jugar ${vista.jugadores.length}.`
      : 'Esperando a que el anfitrión empiece la partida…';
}

/* ------------------------------ conexión ---------------------------- */

conexion.addEventListener('conectado', () => {
  $('conexion').textContent = 'En línea';
  $('conexion').className = 'chip chip-bien';
});

conexion.addEventListener('desconectado', () => {
  $('conexion').textContent = 'Reconectando…';
  $('conexion').className = 'chip chip-mal';
});

// Errores de los que ya no se vuelve: la sala se perdió (servidor reiniciado,
// sala barrida por inactividad) o el asiento dejó de existir. Antes el cliente
// se quedaba pidiendo entrar una y otra vez y el jugador sólo veía el aviso,
// sin poder hacer nada.
const CAUSAS_SIN_VUELTA = ['sala-desconocida', 'fuera-de-sala'];

conexion.addEventListener('error', (e) => {
  const { motivo, causa } = e.detail;

  if (CAUSAS_SIN_VUELTA.includes(causa)) {
    conexion.olvidarSala();
    vista = null;
    mostrar('entrada');
    avisarError('Esa sala ya no existe. Crea una nueva o pide el código otra vez.');
    return;
  }

  avisarError(motivo);
  if (/ya empezó|llena/.test(motivo) && !vista) conexion.olvidarSala();
});

conexion.addEventListener('estado', (e) => {
  vista = e.detail.vista;
  avisarError('');
  if (vista.partida) {
    mostrar('mesa');
    mesa.actualizar(vista);
  } else {
    mostrar('lobby');
    pintarLobby();
  }
});

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

conexion.conectar();
