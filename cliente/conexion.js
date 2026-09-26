import { DEL_CLIENTE, DEL_SERVIDOR, normalizarCodigo } from '../core/protocolo.js';

const LLAVE_SESION = 'lamona.sesion'; // por pestaña: el asiento en la sala
const LLAVE_NOMBRE = 'lamona.nombre'; // por navegador: el nombre del jugador

/**
 * Conexión con el servidor. Reconecta sola y vuelve a sentarse en la sala
 * usando el token guardado, así una caída de señal no bota al jugador.
 */
export class Conexion extends EventTarget {
  constructor() {
    super();
    this.socket = null;
    this.sesion = this.leerSesion();
    this.reintentos = 0;
    this.cerradaAdrede = false;
  }

  /**
   * El asiento va en sessionStorage, no en localStorage: es propio de cada
   * pestaña. Así dos pestañas del mismo navegador son dos jugadores distintos
   * en vez de pelearse el mismo asiento, y un recargar la página sigue
   * recuperando la sala.
   */
  leerSesion() {
    try {
      return JSON.parse(sessionStorage.getItem(LLAVE_SESION)) ?? null;
    } catch {
      return null;
    }
  }

  guardarSesion(sesion) {
    this.sesion = sesion;
    try {
      if (sesion) {
        sessionStorage.setItem(LLAVE_SESION, JSON.stringify(sesion));
        if (sesion.nombre) localStorage.setItem(LLAVE_NOMBRE, sesion.nombre);
      } else {
        sessionStorage.removeItem(LLAVE_SESION);
      }
    } catch {
      /* navegación privada: seguimos sin recordar la sesión */
    }
  }

  /** El nombre sí se recuerda entre visitas, para no volver a escribirlo. */
  nombreRecordado() {
    try {
      return localStorage.getItem(LLAVE_NOMBRE) ?? '';
    } catch {
      return '';
    }
  }

  avisar(nombre, detalle) {
    this.dispatchEvent(new CustomEvent(nombre, { detail: detalle }));
  }

  conectar() {
    this.cerradaAdrede = false;
    const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocolo}//${location.host}`);

    this.socket.onopen = () => {
      this.reintentos = 0;
      this.avisar('conectado');
      // Si veníamos de una sala, volvemos a sentarnos solos.
      if (this.sesion?.codigo && this.sesion?.token) {
        this.enviar(DEL_CLIENTE.UNIRSE, {
          codigo: this.sesion.codigo,
          token: this.sesion.token,
        });
      }
    };

    this.socket.onmessage = (evento) => {
      const mensaje = JSON.parse(evento.data);
      if (mensaje.tipo === DEL_SERVIDOR.SALA) {
        this.guardarSesion({
          codigo: mensaje.codigo,
          token: mensaje.token,
          nombre: mensaje.nombre,
        });
      }
      this.avisar(mensaje.tipo, mensaje);
    };

    this.socket.onclose = () => {
      this.avisar('desconectado');
      if (this.cerradaAdrede) return;
      // Reintento con espera creciente, hasta 10s.
      const espera = Math.min(1000 * 2 ** this.reintentos++, 10_000);
      setTimeout(() => this.conectar(), espera);
    };
  }

  enviar(tipo, datos = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify({ tipo, ...datos }));
    return true;
  }

  /**
   * Olvida la sala guardada para que al reconectar no se intente volver a
   * entrar. Se usa cuando el servidor avisa de que esa sala ya no existe.
   */
  olvidarSala() {
    this.guardarSesion(null);
  }

  crearSala(nombre, opciones) {
    this.enviar(DEL_CLIENTE.CREAR_SALA, { nombre, ...opciones });
  }

  unirse(codigo, nombre) {
    this.enviar(DEL_CLIENTE.UNIRSE, { codigo: normalizarCodigo(codigo), nombre });
  }

  configurar(cambios) {
    this.enviar(DEL_CLIENTE.CONFIGURAR, { cambios });
  }

  iniciar() {
    this.enviar(DEL_CLIENTE.INICIAR);
  }

  jugar(jugada) {
    this.enviar(DEL_CLIENTE.JUGAR, { jugada });
  }

  siguienteRonda() {
    this.enviar(DEL_CLIENTE.SIGUIENTE_RONDA);
  }

  volverAlLobby() {
    this.enviar(DEL_CLIENTE.VOLVER_LOBBY);
  }

  salir() {
    this.enviar(DEL_CLIENTE.SALIR);
    this.guardarSesion(null);
    this.cerradaAdrede = true;
    this.socket?.close();
  }
}
