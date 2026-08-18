import { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { semaforoAgregado, semaforoDeControl } from '../../domain/compliance.js';
import { estadoCumplimiento } from '../../domain/compliance.js';
import type { EstadoControl, Semaforo, TipoControl } from '../../domain/constants.js';
import { estadoMantenimiento } from '../../domain/maintenance.js';
import { estaVencida } from '../../domain/maintenance.js';
import { zonedDayKey } from '../../domain/time.js';
import { ControlModel } from '../../models/Control.js';
import { EquipoModel } from '../../models/Equipo.js';
import { LimpiezaModel } from '../../models/Limpieza.js';
import { NoConformidadModel } from '../../models/NoConformidad.js';
import { PuestoModel } from '../../models/Puesto.js';
import { RecepcionModel } from '../../models/Recepcion.js';
import { obtenerConfiguracion } from '../../services/configuracion.service.js';

const TZ = env.DISPLAY_TIMEZONE;

export interface CeldaDashboard {
  clave: string;
  etiqueta: string;
  semaforo: Semaforo;
  estado: EstadoControl | 'registrado' | 'sin_registro';
  detalle: string | null;
}

export interface FilaDashboard {
  puestoId: string;
  numero: number;
  nombre: string;
  celdas: CeldaDashboard[];
  semaforo: Semaforo;
  /** Motivos concretos, para que el supervisor sepa qué mirar sin abrir el detalle. */
  problemas: string[];
}

export interface ResumenDashboard {
  puestos: number;
  conformes: number;
  conAtencion: number;
  conIncumplimiento: number;
  noConformidadesAbiertas: number;
  noConformidadesVencidas: number;
  mantenimientosVencidos: number;
}

export interface Dashboard {
  dia: string;
  columnas: { clave: string; etiqueta: string; grupo: string }[];
  filas: FilaDashboard[];
  resumen: ResumenDashboard;
}

/**
 * Panel general de control (punto 5).
 * Cada celda se calcula al momento de consultar comparando la hora real de
 * registro contra el horario programado: el semáforo nunca se almacena (R8).
 */
export async function construirDashboard(
  dia: string | undefined,
  ahora: Date = new Date(),
): Promise<Dashboard> {
  const configuracion = await obtenerConfiguracion();
  const diaConsultado = dia ?? zonedDayKey(ahora, TZ);

  const puestos = await PuestoModel.find({ activo: true }).sort({ numero: 1 }).lean();
  const puestoIds = puestos.map((puesto) => puesto._id);

  const [recepciones, controles, limpiezas, noConformidades, equipos] = await Promise.all([
    RecepcionModel.find({ puestoId: { $in: puestoIds }, dia: diaConsultado }).lean(),
    ControlModel.find({ puestoId: { $in: puestoIds }, dia: diaConsultado }).lean(),
    LimpiezaModel.find({ puestoId: { $in: puestoIds }, dia: diaConsultado }).lean(),
    NoConformidadModel.find({ estado: { $in: ['pendiente', 'en_proceso'] } }).lean(),
    EquipoModel.find({ puestoId: { $in: puestoIds }, activo: true }).lean(),
  ]);

  const columnas = [
    { clave: 'recepcion', etiqueta: 'Recepción de carne', grupo: 'Recepción' },
    ...configuracion.horariosExhibicion.map((hora) => ({
      clave: `exhibicion-${hora}`,
      etiqueta: hora,
      grupo: 'Medición de temperatura y pH',
    })),
    ...configuracion.horariosRefrigeracion.map((hora) => ({
      clave: `refrigeracion-${hora}`,
      etiqueta: hora,
      grupo: 'Equipos de refrigeración',
    })),
    { clave: 'limpieza-inicial', etiqueta: 'Limp. inicial', grupo: 'Limpieza' },
    { clave: 'limpieza-final', etiqueta: 'Limp. final', grupo: 'Limpieza' },
  ];

  const filas: FilaDashboard[] = puestos.map((puesto) => {
    const id = String(puesto._id);
    const celdas: CeldaDashboard[] = [];
    const problemas: string[] = [];

    // Recepción: no tiene horario fijo (R5), así que su ausencia no es un retraso.
    const recepcionDelDia = recepciones.find((r) => String(r.puestoId) === id);
    if (recepcionDelDia) {
      const conforme = recepcionDelDia.dentroRango && recepcionDelDia.resultado === 'aceptado';
      if (!conforme) {
        problemas.push(
          recepcionDelDia.resultado === 'rechazado'
            ? `Recepción rechazada: ${recepcionDelDia.motivoRechazo ?? 'sin motivo indicado'}`
            : `Recepción con desviaciones: ${recepcionDelDia.desviaciones.join(' · ')}`,
        );
      }
      celdas.push({
        clave: 'recepcion',
        etiqueta: 'Recepción de carne',
        semaforo: conforme ? 'verde' : 'rojo',
        estado: 'registrado',
        detalle: conforme ? null : (problemas.at(-1) ?? null),
      });
    } else {
      celdas.push({
        clave: 'recepcion',
        etiqueta: 'Recepción de carne',
        semaforo: 'gris',
        estado: 'sin_registro',
        detalle: 'Sin recepción registrada hoy',
      });
    }

    // Controles horarios de exhibición y refrigeración.
    for (const tipo of ['exhibicion', 'refrigeracion'] as TipoControl[]) {
      const horarios =
        tipo === 'exhibicion'
          ? configuracion.horariosExhibicion
          : configuracion.horariosRefrigeracion;

      for (const hora of horarios) {
        const registro = controles.find(
          (c) => String(c.puestoId) === id && c.tipo === tipo && c.franjaProgramada === hora,
        );
        const estado = estadoCumplimiento(
          {
            dia: diaConsultado,
            horaProgramada: hora,
            toleranciaMinutos: configuracion.toleranciaMinutos,
            timeZone: TZ,
          },
          registro ? new Date(registro.registradoEn) : null,
          ahora,
        );
        const semaforo = semaforoDeControl(estado, registro?.dentroRango ?? true);

        let detalle: string | null = null;
        if (estado === 'no_realizado') detalle = `Control de ${hora} no realizado`;
        else if (estado === 'con_retraso') detalle = `Control de ${hora} registrado con retraso`;
        if (registro && !registro.dentroRango) detalle = registro.desviaciones.join(' · ');
        if (detalle && semaforo !== 'gris' && semaforo !== 'verde') problemas.push(detalle);

        celdas.push({
          clave: `${tipo}-${hora}`,
          etiqueta: hora,
          semaforo,
          estado,
          detalle,
        });
      }
    }

    // Checklists de limpieza: tampoco tienen hora exacta programada.
    for (const turno of ['inicial', 'final'] as const) {
      const registro = limpiezas.find((l) => String(l.puestoId) === id && l.turno === turno);
      let semaforo: Semaforo = 'gris';
      let detalle: string | null = `Limpieza ${turno} sin registrar`;

      if (registro) {
        semaforo = registro.cumple ? 'verde' : 'rojo';
        detalle = registro.cumple ? null : registro.incumplimientos.join(' · ');
        if (detalle) problemas.push(`Limpieza ${turno}: ${detalle}`);
      }

      celdas.push({
        clave: `limpieza-${turno}`,
        etiqueta: turno === 'inicial' ? 'Limp. inicial' : 'Limp. final',
        semaforo,
        estado: registro ? 'registrado' : 'sin_registro',
        detalle,
      });
    }

    const abiertas = noConformidades.filter((nc) => String(nc.puestoId) === id);
    if (abiertas.length > 0) {
      problemas.push(`${abiertas.length} acción(es) correctiva(s) abierta(s)`);
    }

    return {
      puestoId: id,
      numero: puesto.numero,
      nombre: puesto.nombre,
      celdas,
      semaforo: semaforoAgregado(celdas.map((celda) => celda.semaforo)),
      problemas,
    };
  });

  const vencidas = noConformidades.filter((nc) => estaVencida(nc.fechaLimite, TZ, ahora));
  const mantenimientosVencidos = equipos.filter(
    (equipo) =>
      estadoMantenimiento(
        equipo.proximoMantenimiento,
        configuracion.diasAvisoMantenimiento,
        TZ,
        ahora,
      ) === 'vencido',
  ).length;

  return {
    dia: diaConsultado,
    columnas,
    filas,
    resumen: {
      puestos: filas.length,
      conformes: filas.filter((f) => f.semaforo === 'verde').length,
      conAtencion: filas.filter((f) => f.semaforo === 'amarillo').length,
      conIncumplimiento: filas.filter((f) => f.semaforo === 'rojo').length,
      noConformidadesAbiertas: noConformidades.length,
      noConformidadesVencidas: vencidas.length,
      mantenimientosVencidos,
    },
  };
}

export interface DetallePuesto {
  puesto: { id: string; numero: number; nombre: string };
  dia: string;
  celdas: CeldaDashboard[];
  problemas: string[];
  semaforo: Semaforo;
}

/** Detalle de un puesto: exactamente cuál es el problema, al hacer clic. */
export async function detalleDelPuesto(
  puestoId: string,
  dia?: string,
  ahora: Date = new Date(),
): Promise<DetallePuesto> {
  const dashboard = await construirDashboard(dia, ahora);
  const fila = dashboard.filas.find((f) => f.puestoId === puestoId);
  if (!fila) {
    const puesto = await PuestoModel.findById(new Types.ObjectId(puestoId)).lean();
    return {
      puesto: puesto
        ? { id: String(puesto._id), numero: puesto.numero, nombre: puesto.nombre }
        : { id: puestoId, numero: 0, nombre: 'Puesto no encontrado' },
      dia: dashboard.dia,
      celdas: [],
      problemas: [],
      semaforo: 'gris',
    };
  }

  return {
    puesto: { id: fila.puestoId, numero: fila.numero, nombre: fila.nombre },
    dia: dashboard.dia,
    celdas: fila.celdas,
    problemas: fila.problemas,
    semaforo: fila.semaforo,
  };
}
