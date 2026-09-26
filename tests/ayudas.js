import { WebSocket } from 'ws';

/**
 * Cliente de pruebas: envuelve un WebSocket con espera por tipo de mensaje.
 * `esperar` no borra el historial — sólo marca el mensaje como ya entregado —
 * para que `ultimaVista()` siga viendo el último estado recibido.
 */
export class ClienteDePrueba {
  constructor(puerto) {
    this.socket = new WebSocket(`ws://localhost:${puerto}`);
    this.recibidos = [];
    this.entregados = new WeakSet();
    this.esperas = [];
    this.socket.on('message', (crudo) => {
      const mensaje = JSON.parse(crudo);
      this.recibidos.push(mensaje);
      for (let i = this.esperas.length - 1; i >= 0; i--) {
        if (this.esperas[i].coincide(mensaje)) {
          this.entregados.add(mensaje);
          this.esperas.splice(i, 1)[0].resolver(mensaje);
          break;
        }
      }
    });
  }

  listo() {
    if (this.socket.readyState === 1) return Promise.resolve();
    return new Promise((r) => this.socket.once('open', r));
  }

  enviar(tipo, datos = {}) {
    this.socket.send(JSON.stringify({ tipo, ...datos }));
  }

  /** Espera el próximo mensaje que cumpla la condición (o del tipo dado). */
  esperar(condicion, ms = 3000) {
    const coincide = typeof condicion === 'string'
      ? (m) => m.tipo === condicion
      : condicion;

    const pendiente = this.recibidos.find((m) => !this.entregados.has(m) && coincide(m));
    if (pendiente) {
      this.entregados.add(pendiente);
      return Promise.resolve(pendiente);
    }

    return new Promise((resolver, rechazar) => {
      const espera = { coincide, resolver };
      this.esperas.push(espera);
      const t = setTimeout(() => {
        this.esperas = this.esperas.filter((e) => e !== espera);
        rechazar(new Error(`No llegó el mensaje esperado en ${ms}ms`));
      }, ms);
      t.unref?.();
    });
  }

  /** Olvida lo recibido para que la próxima espera sea de algo nuevo. */
  limpiar() {
    this.recibidos = [];
  }

  primero(tipo) {
    return this.recibidos.find((m) => m.tipo === tipo) ?? null;
  }

  ultimaVista() {
    for (let i = this.recibidos.length - 1; i >= 0; i--) {
      if (this.recibidos[i].tipo === 'estado') return this.recibidos[i].vista;
    }
    return null;
  }

  cerrar() {
    this.socket.close();
  }
}
