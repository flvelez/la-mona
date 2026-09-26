import { ICONOS } from '../core/cartas.js';
import { estadoDesdeVista } from '../core/vista.js';
import { accionesPara, montonesJugables } from '../core/reglas.js';
import { animarCambios, instantanea } from './animacion.js';
import { alternarSonido, despertar, sonidoEncendido, tocar } from './sonido.js';

const $ = (id) => document.getElementById(id);

/**
 * La mesa. El jugador siempre se sienta abajo y los demás se reparten
 * alrededor en el orden en que les toca jugar (a la izquierda va el siguiente).
 */
const ASIENTOS = {
  2: [null, 'arriba'],
  3: [null, 'izq', 'der'],
  4: [null, 'izq', 'arriba', 'der'],
};

export class Mesa {
  constructor(conexion) {
    this.conexion = conexion;
    this.vista = null;
    this.cartaElegida = null;
    this.montonesElegidos = [];
    this.jugables = new Set();
    this.enviando = false;
    this.ultimoEventoPintado = null;
    this.vencimiento = null;   // cuándo se acaba el turno, en hora local
    this.avisadoEn = null;     // último segundo en que sonó el aviso de prisa
    this.reloj = null;

    $('btn-limpiar').onclick = () => {
      this.limpiarSeleccion();
      this.pintar();
    };
    $('btn-siguiente-ronda').onclick = () => this.conexion.siguienteRonda();
    $('btn-volver-lobby').onclick = () => this.conexion.volverAlLobby();

    $('btn-sonido').onclick = () => {
      alternarSonido();
      this.pintarBotonSonido();
    };
    this.pintarBotonSonido();

    // El navegador no deja sonar hasta que la persona toca la pantalla.
    document.addEventListener('pointerdown', () => despertar(), { once: true });

    // La cuenta atrás corre en el navegador: el servidor sólo dice cuánto
    // queda cuando manda un estado, y entre jugada y jugada pasa un rato.
    this.reloj = setInterval(() => this.pintarReloj(), 250);
  }

  pintarBotonSonido() {
    const activo = sonidoEncendido();
    $('btn-sonido').textContent = activo ? '🔊' : '🔇';
    $('btn-sonido').setAttribute(
      'aria-label', activo ? 'Silenciar el juego' : 'Activar el sonido',
    );
    $('btn-sonido').classList.toggle('apagado', !activo);
  }

  /* --------------------------- selección --------------------------- */

  limpiarSeleccion() {
    this.cartaElegida = null;
    this.montonesElegidos = [];
    this.jugables = new Set();
  }

  get partida() {
    return this.vista?.partida ?? null;
  }

  get esMiTurno() {
    const p = this.partida;
    return p && p.fase === 'jugando' && p.turno === p.yo;
  }

  estadoLocal() {
    return estadoDesdeVista(this.partida);
  }

  elegirCarta(cartaId) {
    if (!this.esMiTurno) return;
    if (this.cartaElegida === cartaId) {
      this.limpiarSeleccion();
    } else {
      this.cartaElegida = cartaId;
      this.montonesElegidos = [];
      // Pista visual: qué montones sirven con esta carta. Es una ayuda acotada;
      // la decisión de si una jugada vale la toma `accionesPara`, que es exacta.
      this.jugables = montonesJugables(this.estadoLocal(), this.partida.yo, cartaId);
    }
    this.pintar();
  }

  alternarMonton(montonId) {
    if (!this.esMiTurno || !this.cartaElegida) return;
    const i = this.montonesElegidos.indexOf(montonId);
    if (i >= 0) this.montonesElegidos.splice(i, 1);
    else this.montonesElegidos.push(montonId);
    this.pintar();
  }

  enviar(jugada) {
    if (this.enviando) return;
    this.enviando = true;
    this.conexion.jugar(jugada);
    this.limpiarSeleccion();
    // El servidor responde con el estado nuevo; mientras tanto no se toca nada.
    setTimeout(() => {
      this.enviando = false;
    }, 400);
    this.pintar();
  }

  /* ---------------------------- pintado ---------------------------- */

  actualizar(vista) {
    const antes = this.partida;
    // Dónde estaba cada carta ANTES de repintar: es el origen de la animación.
    const posiciones = instantanea();

    this.vista = vista;
    // Si cambió el turno o la ronda, la selección anterior ya no sirve.
    if (!antes || antes.turno !== vista.partida.turno || antes.ronda !== vista.partida.ronda) {
      this.limpiarSeleccion();
      this.enviando = false;
    }
    // Momento exacto en que vence el turno, según el reloj de este aparato.
    this.vencimiento = vista.segundosRestantes != null
      ? Date.now() + vista.segundosRestantes * 1000
      : null;
    this.avisadoEn = null;

    this.pintar();
    this.pintarReloj();

    const evento = vista.partida.ultimoEvento;
    const rondaNueva = !antes || antes.ronda !== vista.partida.ronda;
    // Reparto: a alguien le crecieron las cartas en la mano sin haber jugado.
    const hayReparto = rondaNueva || (antes
      ? vista.partida.cartasPorJugador.some((n, i) => n > antes.cartasPorJugador[i])
      : true);

    this.sonarSegunEvento(antes, vista.partida);
    animarCambios(posiciones, {
      // Sólo vuelan las cartas cuando alguien LEVANTA. En un reparto nuevo
      // también desaparecen cartas, pero ahí no hay a quién mandárselas.
      destinoVuelo: !rondaNueva && evento?.tipo === 'capturar'
        ? this.asientoDe(evento.jugador)
        : null,
      hayReparto,
    });
  }

  /** Pone voz a lo que acaba de ocurrir en la mesa. */
  sonarSegunEvento(antes, ahora) {
    const evento = ahora.ultimoEvento;
    const eventoNuevo = evento && evento !== this.ultimoEventoPintado;

    if (eventoNuevo) {
      this.ultimoEventoPintado = evento;
      if (evento.wincho) tocar('wincho');
      else if (evento.tipo === 'capturar') tocar('llevar');
      else if (evento.tipo === 'abierto') tocar('carta');
      else tocar('formar');
    }

    if (ahora.resultadoRonda && !antes?.resultadoRonda) {
      tocar('ronda');
      return;
    }

    // Que te toque es lo que más importa oír: puedes estar mirando otra cosa.
    const meTocaAhora = ahora.fase === 'jugando' && ahora.turno === ahora.yo;
    const meTocabaAntes = antes && antes.turno === antes.yo;
    if (meTocaAhora && !meTocabaAntes) tocar('turno');
  }

  /* ----------------------- cuenta atrás del turno ------------------- */

  /**
   * Actualiza sólo el reloj, sin repintar la mesa entera: se llama cuatro
   * veces por segundo.
   */
  pintarReloj() {
    const anillo = document.querySelector('.asiento.enturno .reloj-anillo');
    if (!anillo || this.vencimiento == null) return;

    const total = this.vista?.config?.segundosPorTurno || 0;
    const restan = Math.max(0, (this.vencimiento - Date.now()) / 1000);
    const parte = total > 0 ? Math.max(0, Math.min(1, restan / total)) : 0;

    anillo.style.setProperty('--resto', parte.toFixed(3));
    anillo.classList.toggle('apurado', restan <= 10);

    const marcador = anillo.parentElement.querySelector('.segundos');
    if (marcador) marcador.textContent = Math.ceil(restan);

    // Aviso sonoro en los últimos cinco segundos, una vez por segundo.
    const segundo = Math.ceil(restan);
    if (this.esMiTurno && segundo > 0 && segundo <= 5 && segundo !== this.avisadoEn) {
      this.avisadoEn = segundo;
      tocar('prisa');
    }
  }

  detener() {
    clearInterval(this.reloj);
  }

  /** El elemento del asiento de un jugador, para que las cartas vuelen ahí. */
  asientoDe(jugador) {
    const p = this.partida;
    if (jugador === p.yo) return $('mi-ficha');
    const n = p.config.numJugadores;
    const lugar = ASIENTOS[n][(jugador - p.yo + n) % n];
    return lugar ? $(`asiento-${lugar}`) : null;
  }

  pintar() {
    const p = this.partida;
    if (!p) return;
    this.pintarBarra(p);
    this.pintarAsientos(p);
    this.pintarMontones(p);
    this.pintarMano(p);
    this.pintarAcciones(p);
    this.pintarBitacora(p);
    this.pintarFinal(p);
  }

  pintarBarra(p) {
    $('info-ronda').textContent = `Ronda ${p.ronda}`;
    $('info-mazo').textContent = `${p.cartasEnMazo} en el mazo`;
    $('info-rondas').innerHTML = p.bandos
      .map((bando, i) => {
        const quienes = bando.map((j) => p.config.nombres[j]).join(' y ');
        return `<span>${escapar(quienes)}: <strong>${p.rondasGanadas[i]}</strong></span>`;
      })
      .join(' · ') + ` <span class="dato">(a ${p.config.rondasParaGanar})</span>`;
  }

  pintarAsientos(p) {
    const n = p.config.numJugadores;
    const mapa = ASIENTOS[n];
    for (const lugar of ['arriba', 'izq', 'der']) {
      $(`asiento-${lugar}`).innerHTML = '';
    }

    for (let j = 0; j < n; j++) {
      const relativo = (j - p.yo + n) % n;
      const lugar = mapa[relativo];
      if (!lugar) continue; // yo mismo, que voy abajo
      $(`asiento-${lugar}`).appendChild(this.asientoHTML(p, j));
    }
    // Mi propia ficha, debajo de mi mano.
    $('mi-ficha').innerHTML = '';
    $('mi-ficha').appendChild(this.asientoHTML(p, p.yo, true));
  }

  asientoHTML(p, j, soyYo = false) {
    const div = document.createElement('div');
    const companero = p.config.enParejas && !soyYo &&
      p.bandos.some((b) => b.includes(j) && b.includes(p.yo));
    div.className = [
      'asiento',
      j === p.turno ? 'enturno' : '',
      companero ? 'companero' : '',
    ].join(' ');

    const reloj = j === p.turno && this.vista.segundosRestantes != null
      ? '<span class="reloj-anillo"></span><span class="segundos"></span>'
      : '';
    const inicial = escapar((p.config.nombres[j] ?? '?').trim()[0] ?? '?');

    div.innerHTML = `
      <div class="ficha">${reloj}${inicial}</div>
      <span class="nombre">${escapar(p.config.nombres[j])}${soyYo ? ' (tú)' : ''}${companero ? ' 🤝' : ''}</span>
      ${soyYo ? '' : `<div class="dorsos">${'<span class="dorso"></span>'.repeat(p.cartasPorJugador[j])}</div>`}
      <span class="dato">${p.capturadasPorJugador[j]} ganadas${p.winchos[j] ? ` · ${p.winchos[j]} 🧹` : ''}</span>
    `;
    return div;
  }

  pintarMontones(p) {
    const cont = $('montones');
    cont.innerHTML = '';
    if (p.mesa.length === 0) {
      cont.innerHTML = '<span class="mesa-vacia">La mesa está limpia</span>';
      return;
    }

    for (const monton of p.mesa) {
      const div = document.createElement('div');
      const elegido = this.montonesElegidos.includes(monton.id);
      const jugable = this.cartaElegida && this.jugables.has(monton.id);
      div.className = [
        'monton-mesa',
        monton.tipo,
        monton.dueño === p.yo ? 'mia' : '',
        jugable ? 'jugable' : '',
        elegido ? 'elegido' : '',
      ].join(' ');

      const apiladas = monton.cartas
        .map((c, i) => naipeHTML(c, `left:${i * 11}px; top:${i * 5}px; z-index:${i}`))
        .join('');
      const ancho = 50 + (monton.cartas.length - 1) * 11;
      const sello = monton.tipo === 'suelta'
        ? '&nbsp;'
        : `${monton.tipo === 'fila' ? 'fila' : 'formación'} de ${monton.valor}`;

      div.innerHTML = `<div class="apilado" style="width:${ancho}px">${apiladas}</div>
        <span class="sello">${sello}</span>`;

      // Siempre se puede tocar para seleccionar: si la jugada no vale, no
      // aparecerá ningún botón de acción.
      if (this.esMiTurno && this.cartaElegida) {
        div.onclick = () => this.alternarMonton(monton.id);
      }
      cont.appendChild(div);
    }
  }

  pintarMano(p) {
    const cont = $('mi-mano');
    cont.innerHTML = '';
    for (const carta of p.miMano) {
      const div = document.createElement('div');
      div.className = [
        'naipe',
        esRojaCarta(carta) ? 'roja' : '',
        carta.mona ? 'mona' : '',
        this.esMiTurno ? 'jugable' : 'bloqueada',
        this.cartaElegida === carta.id ? 'elegida' : '',
      ].join(' ');
      div.dataset.carta = carta.id;
      div.innerHTML = caraHTML(carta);
      if (this.esMiTurno) div.onclick = () => this.elegirCarta(carta.id);
      cont.appendChild(div);
    }
  }

  pintarAcciones(p) {
    const cont = $('acciones');
    cont.innerHTML = '';
    $('btn-limpiar').hidden = !this.cartaElegida;

    if (p.fase !== 'jugando') return;
    if (!this.esMiTurno) {
      $('pista').textContent = `Le toca a ${p.config.nombres[p.turno]}…`;
      $('pista').className = 'pista';
      return;
    }
    if (!this.cartaElegida) {
      $('pista').textContent = 'Toca una carta de tu mano';
      $('pista').className = 'pista urgente';
      return;
    }

    const acciones = accionesPara(
      this.estadoLocal(), p.yo, this.cartaElegida, this.montonesElegidos,
    );

    if (acciones.length === 0) {
      $('pista').textContent = this.montonesElegidos.length
        ? 'Esa combinación no vale. Toca los montones para cambiarla.'
        : 'Toca los montones resaltados, o botá la carta a la mesa.';
      $('pista').className = 'pista';
    } else {
      $('pista').textContent = '';
      $('pista').className = 'pista';
    }

    for (const accion of acciones) {
      const boton = document.createElement('button');
      boton.className = `btn-${claseDeAccion(accion.tipo)}`;
      boton.textContent = etiquetaDeAccion(accion, p);
      boton.onclick = () => this.enviar(accion);
      cont.appendChild(boton);
    }
  }

  pintarBitacora(p) {
    const e = p.ultimoEvento;
    if (!e) return ($('bitacora').innerHTML = '');
    const quien = p.config.nombres[e.jugador];
    const carta = e.carta.mona ? 'La Mona 🃏' : `${e.carta.nombre}${ICONOS[e.carta.palo] ?? ''}`;
    let texto;
    if (e.tipo === 'abierto') texto = `${quien} botó ${carta}`;
    else if (e.tipo === 'capturar') texto = `${quien} levantó ${e.capturadas} cartas con ${carta}`;
    else if (e.tipo === 'formar') texto = `${quien} formó ${e.valor} con ${carta}`;
    else texto = `${quien} hizo fila de ${e.valor} con ${carta}`;
    if (e.automatica) texto += ' (se le acabó el tiempo)';

    $('bitacora').innerHTML = escapar(texto) +
      (e.wincho ? ' <span class="wincho">¡WINCHO!</span>' : '');
  }

  /* ------------------------ fin de ronda / partida ------------------ */

  pintarFinal(p) {
    const modal = $('modal-puntaje');
    if (!p.resultadoRonda) return (modal.hidden = true);

    const { detalle, ganador, sobrante, seLlevoElSobrante } = p.resultadoRonda;
    const campeon = p.fase === 'finPartida';

    $('titulo-puntaje').textContent = campeon
      ? `¡Ganó ${nombreBando(p, p.campeon)}!`
      : `Fin de la ronda ${p.ronda}`;

    const sobra = sobrante > 0 && seLlevoElSobrante != null
      ? `<p class="dato">${escapar(p.config.nombres[seLlevoElSobrante])} se llevó las ${sobrante} cartas que quedaron en la mesa.</p>`
      : '';

    const filas = detalle.map((d, i) => `
      <tr class="${i === ganador ? 'gana' : ''}">
        <td>
          ${escapar(nombreBando(p, i))}
          <div class="conceptos">${d.conceptos.map((c) => `${escapar(c.concepto)} +${c.puntos}`).join(' · ') || 'sin puntos'}</div>
        </td>
        <td>${d.puntos}</td>
      </tr>`).join('');

    $('cuerpo-puntaje').innerHTML = `
      ${sobra}
      <table class="tabla-puntos">
        <thead><tr><th>Jugador</th><th>Puntos</th></tr></thead>
        <tbody>${filas}</tbody>
      </table>
      <p class="dato">Rondas ganadas: ${p.bandos.map((b, i) =>
        `${escapar(nombreBando(p, i))} ${p.rondasGanadas[i]}`).join(' · ')}
        (a ${p.config.rondasParaGanar})</p>
      ${ganador === null ? '<p class="dato">Hubo empate: la ronda no se la lleva nadie.</p>' : ''}
    `;

    // Al coronar campeón el modal no puede quedarse sin salida: tapa toda la
    // pantalla, así que sin un botón los jugadores quedaban atrapados.
    const soyAnfitrion = this.vista.yo === this.vista.anfitrion;
    $('btn-siguiente-ronda').hidden = campeon || !soyAnfitrion;
    $('espera-ronda').hidden = campeon || soyAnfitrion;
    $('btn-volver-lobby').hidden = !campeon || !soyAnfitrion;
    $('espera-lobby').hidden = !campeon || soyAnfitrion;
    modal.hidden = false;
  }
}

/* ------------------------------ ayudas ---------------------------- */

function nombreBando(p, i) {
  return p.bandos[i].map((j) => p.config.nombres[j]).join(' y ');
}

function esRojaCarta(c) {
  return c.palo === 'Corazones' || c.palo === 'Diamantes';
}

function caraHTML(carta) {
  return `<span class="esquina">${escapar(carta.nombre)}</span>
    <span class="centro">${ICONOS[carta.palo] ?? ''}</span>`;
}

function naipeHTML(carta, estilo = '') {
  const clases = ['naipe', esRojaCarta(carta) ? 'roja' : '', carta.mona ? 'mona' : ''].join(' ');
  return `<div class="${clases}" data-carta="${carta.id}" style="${estilo}">${caraHTML(carta)}</div>`;
}

function claseDeAccion(tipo) {
  return { capturar: 'llevar', formar: 'formar', fila: 'fila', abierto: 'botar' }[tipo];
}

function etiquetaDeAccion(accion, p) {
  // Sólo se aclara el valor del As cuando de verdad hay ambigüedad.
  const carta = p.miMano.find((c) => c.id === accion.cartaId);
  const conAs = carta && !carta.mona && carta.valor === 1 ? ` (As = ${accion.valorCarta})` : '';
  if (accion.tipo === 'abierto') return 'BOTAR A LA MESA';
  if (accion.tipo === 'capturar') return `LLEVAR${conAs}`;
  if (accion.tipo === 'formar') return `FORMAR ${accion.valor}${conAs}`;
  return `FILA DE ${accion.valor}${conAs}`;
}

function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
