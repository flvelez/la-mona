import { Sala } from './sala.js';
import { generarCodigo, normalizarCodigo } from '../core/protocolo.js';

/** Registro de salas vivas, en memoria. */
export class RegistroDeSalas {
  constructor() {
    this.salas = new Map();
    this.barrido = setInterval(() => this.barrer(), 60_000);
    this.barrido.unref?.();
  }

  crear(opciones) {
    const codigo = generarCodigo((c) => this.salas.has(c));
    const sala = new Sala(codigo, opciones);
    this.salas.set(codigo, sala);
    return sala;
  }

  buscar(codigo) {
    return this.salas.get(normalizarCodigo(codigo)) ?? null;
  }

  cerrar(codigo) {
    const sala = this.salas.get(codigo);
    sala?.limpiarTemporizador();
    this.salas.delete(codigo);
  }

  /** Suelta las salas que quedaron sin nadie. */
  barrer() {
    for (const [codigo, sala] of this.salas) {
      if (sala.abandonada()) this.cerrar(codigo);
    }
  }

  detener() {
    clearInterval(this.barrido);
    for (const codigo of [...this.salas.keys()]) this.cerrar(codigo);
  }
}
