import { crearPartida, jugar, siguienteRonda, vistaPara } from '../core/partida.js';
import { jugadasLegales } from '../core/reglas.js';
import { generarToken, limpiarNombre } from '../core/protocolo.js';

// Ajustables al desplegar: SEGUNDOS_POR_TURNO=0 desactiva el turno automático.
export const SEGUNDOS_POR_TURNO = Number(process.env.SEGUNDOS_POR_TURNO ?? 45);
export const MINUTOS_SALA_VACIA = Number(process.env.MINUTOS_SALA_VACIA ?? 10);

/**
 * Una sala de juego. Es dueña absoluta del estado: los clientes mandan
 * intenciones, nunca resultados.
 */
export class Sala {
  constructor(codigo, opciones = {}) {
    this.codigo = codigo;
    this.fase = 'lobby'; // lobby | jugando | terminada
    this.asientos = []; // { nombre, token, conectado, socket }
    this.anfitrion = null; // token del que creó la sala
    this.config = {
      numJugadores: 4, // cupo máximo; se ajusta al iniciar
      enParejas: false,
      rondasParaGanar: 3,
      segundosPorTurno: SEGUNDOS_POR_TURNO,
      ...opciones,
    };
    this.partida = null;
    this.temporizador = null;
    this.vencimientoTurno = null;
    this.vaciaDesde = null;
    this.alCambiar = () => {};
  }

  /* --------------------------- asientos --------------------------- */

  get conectados() {
    return this.asientos.filter((a) => a.conectado).length;
  }

  asientoPorToken(token) {
    return this.asientos.findIndex((a) => a.token === token);
  }

  /**
   * Sienta a alguien. Si trae un token conocido, recupera su asiento
   * (reconexión); si no, ocupa uno libre.
   */
  sentar({ nombre, token, socket }) {
    const existente = this.asientoPorToken(token);
    if (existente >= 0) {
      const asiento = this.asientos[existente];
      asiento.conectado = true;
      asiento.socket = socket;
      if (nombre) asiento.nombre = limpiarNombre(nombre, asiento.nombre);
      this.vaciaDesde = null;
      return { ok: true, indice: existente, token: asiento.token, reconexion: true };
    }

    if (this.fase !== 'lobby') {
      return { ok: false, motivo: 'La partida ya empezó' };
    }
    if (this.asientos.length >= this.config.numJugadores) {
      return { ok: false, motivo: 'La sala está llena' };
    }

    const nuevo = {
      nombre: limpiarNombre(nombre, `Jugador ${this.asientos.length + 1}`),
      token: generarToken(),
      conectado: true,
      socket,
    };
    this.asientos.push(nuevo);
    if (this.anfitrion === null) this.anfitrion = nuevo.token;
    this.vaciaDesde = null;
    return { ok: true, indice: this.asientos.length - 1, token: nuevo.token, reconexion: false };
  }

  /**
   * Un socket se cerró. `socket` dice CUÁL, y es imprescindible: cuando se
   * cae la conexión, el cliente vuelve por un socket nuevo y el `close` del
   * viejo puede llegar DESPUÉS de que ya se sentó otra vez. Sin comprobarlo,
   * ese cierre tardío desasienta a alguien que está jugando tan tranquilo —
   * y en el lobby le borraba el asiento entero.
   */
  desconectar(token, socket = null) {
    const i = this.asientoPorToken(token);
    if (i < 0) return;
    const asiento = this.asientos[i];
    if (socket && asiento.socket && asiento.socket !== socket) return;

    asiento.conectado = false;
    asiento.socket = null;

    // En el lobby, quien se va libera el asiento; en partida se le guarda.
    if (this.fase === 'lobby') {
      this.asientos.splice(i, 1);
      if (this.anfitrion && this.asientoPorToken(this.anfitrion) < 0) {
        this.anfitrion = this.asientos[0]?.token ?? null;
      }
    }
    if (this.conectados === 0) this.vaciaDesde = Date.now();
  }

  /**
   * Quién manda ahora mismo. Si el anfitrión se cae en mitad de la partida, el
   * mando pasa al primero conectado: sin esto nadie podría pulsar "siguiente
   * ronda" y la partida se quedaría congelada. Cuando vuelve, lo recupera.
   */
  tokenAnfitrion() {
    const i = this.asientoPorToken(this.anfitrion);
    if (i >= 0 && this.asientos[i].conectado) return this.anfitrion;
    return this.asientos.find((a) => a.conectado)?.token ?? this.anfitrion;
  }

  esAnfitrion(token) {
    return token != null && this.tokenAnfitrion() === token;
  }

  abandonada() {
    return (
      this.conectados === 0 &&
      this.vaciaDesde !== null &&
      Date.now() - this.vaciaDesde > MINUTOS_SALA_VACIA * 60_000
    );
  }

  /* ------------------------- configuración ------------------------ */

  configurar(token, cambios) {
    if (!this.esAnfitrion(token)) return { ok: false, motivo: 'Sólo el anfitrión configura la sala' };
    if (this.fase !== 'lobby') return { ok: false, motivo: 'La partida ya empezó' };

    if (cambios.rondasParaGanar !== undefined) {
      const r = Number(cambios.rondasParaGanar);
      if (!Number.isInteger(r) || r < 1 || r > 10) {
        return { ok: false, motivo: 'Las rondas para ganar van de 1 a 10' };
      }
      this.config.rondasParaGanar = r;
    }
    if (cambios.enParejas !== undefined) {
      this.config.enParejas = Boolean(cambios.enParejas);
    }
    if (cambios.numJugadores !== undefined) {
      const n = Number(cambios.numJugadores);
      if (![2, 3, 4].includes(n)) return { ok: false, motivo: 'La Mona se juega entre 2 y 4' };
      if (n < this.asientos.length) {
        return { ok: false, motivo: `Ya hay ${this.asientos.length} jugadores en la sala` };
      }
      this.config.numJugadores = n;
    }
    // Las parejas sólo existen con 4 jugadores.
    if (this.config.numJugadores !== 4) this.config.enParejas = false;
    return { ok: true };
  }

  /* ---------------------------- partida --------------------------- */

  iniciar(token) {
    if (!this.esAnfitrion(token)) return { ok: false, motivo: 'Sólo el anfitrión inicia la partida' };
    if (this.fase !== 'lobby') return { ok: false, motivo: 'La partida ya empezó' };
    const n = this.asientos.length;
    if (n < 2) return { ok: false, motivo: 'Hacen falta al menos 2 jugadores' };
    if (n > 4) return { ok: false, motivo: 'Máximo 4 jugadores' };

    this.config.numJugadores = n;
    if (n !== 4) this.config.enParejas = false;

    this.partida = crearPartida({
      numJugadores: n,
      nombres: this.asientos.map((a) => a.nombre),
      enParejas: this.config.enParejas,
      rondasParaGanar: this.config.rondasParaGanar,
    });
    this.fase = 'jugando';
    this.armarTemporizador();
    return { ok: true };
  }

  jugar(token, jugada) {
    if (this.fase !== 'jugando') return { ok: false, motivo: 'No hay partida en curso' };
    const i = this.asientoPorToken(token);
    if (i < 0) return { ok: false, motivo: 'Ya no estás en esta sala', causa: 'fuera-de-sala' };

    const r = jugar(this.partida, i, jugada);
    if (!r.ok) return r;
    this.trasJugada();
    return r;
  }

  siguienteRonda(token) {
    if (this.partida?.fase !== 'finRonda') {
      return { ok: false, motivo: 'La ronda no ha terminado' };
    }
    if (!this.esAnfitrion(token)) {
      return { ok: false, motivo: 'El anfitrión continúa la partida' };
    }
    siguienteRonda(this.partida);
    this.armarTemporizador();
    return { ok: true };
  }

  /** Tras coronar campeón, devuelve la sala al lobby con los mismos asientos. */
  volverAlLobby(token) {
    if (this.fase !== 'terminada') return { ok: false, motivo: 'La partida sigue en curso' };
    if (!this.esAnfitrion(token)) return { ok: false, motivo: 'El anfitrión decide' };
    this.limpiarTemporizador();
    this.partida = null;
    this.fase = 'lobby';
    return { ok: true };
  }

  trasJugada() {
    if (this.partida.fase === 'finPartida') {
      this.fase = 'terminada';
      this.limpiarTemporizador();
    } else if (this.partida.fase === 'finRonda') {
      this.limpiarTemporizador();
    } else {
      this.armarTemporizador();
    }
  }

  /* ------------------------ turno automático ---------------------- */

  armarTemporizador() {
    this.limpiarTemporizador();
    if (this.fase !== 'jugando' || this.partida?.fase !== 'jugando') return;
    if (!this.config.segundosPorTurno) return;

    this.vencimientoTurno = Date.now() + this.config.segundosPorTurno * 1000;
    this.temporizador = setTimeout(() => {
      this.jugarAutomatico();
      this.alCambiar();
    }, this.config.segundosPorTurno * 1000);
    this.temporizador.unref?.();
  }

  limpiarTemporizador() {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.vencimientoTurno = null;
  }

  /**
   * Si a alguien se le acaba el tiempo (o se desconectó), juega por él.
   * Prefiere la captura más grande; si no hay, bota la carta más baja.
   */
  jugarAutomatico() {
    if (this.partida?.fase !== 'jugando') return null;
    const jugador = this.partida.turno;
    const opciones = jugadasLegales(this.partida, jugador);
    if (opciones.length === 0) return null;

    const capturas = opciones.filter((j) => j.tipo === 'capturar');
    let elegida;
    if (capturas.length > 0) {
      elegida = capturas.reduce((mejor, j) =>
        (j.montones?.length ?? 0) > (mejor.montones?.length ?? 0) ? j : mejor,
      );
    } else {
      const abiertas = opciones.filter((j) => j.tipo === 'abierto');
      const candidatas = abiertas.length > 0 ? abiertas : opciones;
      elegida = candidatas.reduce((mejor, j) =>
        (j.valorCarta ?? 99) < (mejor.valorCarta ?? 99) ? j : mejor,
      );
    }

    const r = jugar(this.partida, jugador, elegida);
    if (r.ok) {
      r.evento.automatica = true;
      this.trasJugada();
    }
    return r;
  }

  /* ----------------------------- vistas --------------------------- */

  resumenSala() {
    return {
      codigo: this.codigo,
      fase: this.fase,
      config: this.config,
      anfitrion: this.asientoPorToken(this.tokenAnfitrion()),
      jugadores: this.asientos.map((a) => ({
        nombre: a.nombre,
        conectado: a.conectado,
      })),
    };
  }

  vistaPara(token) {
    const i = this.asientoPorToken(token);
    const base = { ...this.resumenSala(), yo: i };
    if (!this.partida || i < 0) return base;
    return {
      ...base,
      partida: vistaPara(this.partida, i),
      segundosRestantes: this.vencimientoTurno
        ? Math.max(0, Math.round((this.vencimientoTurno - Date.now()) / 1000))
        : null,
    };
  }
}
