import { env } from '../../config/env.js';
import { estadoCumplimiento } from '../../domain/compliance.js';
import { estadoMantenimiento, estaVencida } from '../../domain/maintenance.js';
import { addDays, diffInDays, formatInZone, zonedDayKey } from '../../domain/time.js';
import { ControlModel } from '../../models/Control.js';
import { ControlPlagasModel } from '../../models/ControlPlagas.js';
import { EquipoModel } from '../../models/Equipo.js';
import { NoConformidadModel } from '../../models/NoConformidad.js';
import { PuestoModel } from '../../models/Puesto.js';
import { obtenerConfiguracion } from '../../services/configuracion.service.js';
import { crearNotificacion, despacharPendientes } from '../../services/notificaciones.service.js';

const TZ = env.DISPLAY_TIMEZONE;

export interface ResultadoAlertas {
  ejecutadaEn: string;
  avisosDespachados: number;
  controlesNoRealizados: number;
  mantenimientosPorVencer: number;
  mantenimientosVencidos: number;
  accionesPorVencer: number;
  accionesVencidas: number;
  actividadesVencidas: number;
}

/**
 * Tarea programada que invoca el servicio de cron externo.
 * Entrega los avisos que ya tocaban y levanta las alertas de controles no
 * realizados, mantenimientos y acciones correctivas (parte 6 del brief).
 */
export async function evaluarAlertas(ahora: Date = new Date()): Promise<ResultadoAlertas> {
  const configuracion = await obtenerConfiguracion();

  const avisosDespachados = await despacharPendientes(ahora);

  const [controlesNoRealizados, mantenimientos, acciones, actividadesVencidas] = await Promise.all([
    alertarControlesNoRealizados(configuracion, ahora),
    alertarMantenimientos(configuracion, ahora),
    alertarAccionesCorrectivas(ahora),
    marcarActividadesVencidas(ahora),
  ]);

  return {
    ejecutadaEn: ahora.toISOString(),
    avisosDespachados,
    controlesNoRealizados,
    ...mantenimientos,
    ...acciones,
    actividadesVencidas,
  };
}

/** Un control cuya ventana cerró sin registro genera un aviso al puesto y a la supervisión. */
async function alertarControlesNoRealizados(
  configuracion: Awaited<ReturnType<typeof obtenerConfiguracion>>,
  ahora: Date,
): Promise<number> {
  const dia = zonedDayKey(ahora, TZ);
  const puestos = await PuestoModel.find({ activo: true }).lean();
  const registros = await ControlModel.find({ dia }).lean();

  let alertas = 0;
  for (const puesto of puestos) {
    for (const tipo of ['exhibicion', 'refrigeracion'] as const) {
      const horarios =
        tipo === 'exhibicion'
          ? configuracion.horariosExhibicion
          : configuracion.horariosRefrigeracion;

      for (const hora of horarios) {
        const existe = registros.some(
          (r) =>
            String(r.puestoId) === String(puesto._id) &&
            r.tipo === tipo &&
            r.franjaProgramada === hora,
        );
        if (existe) continue;

        const estado = estadoCumplimiento(
          {
            dia,
            horaProgramada: hora,
            toleranciaMinutos: configuracion.toleranciaMinutos,
            timeZone: TZ,
          },
          null,
          ahora,
        );
        if (estado !== 'no_realizado') continue;

        const referencia = {
          coleccion: `controles:${tipo}:${hora}:${dia}`,
          documentoId: puesto._id,
        };
        const titulo = 'Control no realizado';
        const mensaje =
          `El control de ${tipo === 'exhibicion' ? 'exhibición' : 'refrigeración'} de las ` +
          `${hora} no fue registrado.`;

        // Un aviso por puesto, control y día: no se repite en cada ejecución.
        const yaAvisado = await yaExisteAviso(referencia.coleccion, puesto._id);
        if (yaAvisado) continue;

        await crearNotificacion({
          puestoId: puesto._id,
          tipo: 'control_pendiente',
          titulo,
          mensaje,
          referencia,
        });
        await crearNotificacion({
          paraSupervision: true,
          tipo: 'control_pendiente',
          titulo: `Puesto ${puesto.numero}: control no realizado`,
          mensaje,
          referencia,
        });
        alertas += 1;
      }
    }
  }
  return alertas;
}

async function yaExisteAviso(coleccion: string, documentoId: unknown): Promise<boolean> {
  const { NotificacionModel } = await import('../../models/Notificacion.js');
  const encontrado = await NotificacionModel.exists({
    'referencia.coleccion': coleccion,
    'referencia.documentoId': documentoId,
  });
  return Boolean(encontrado);
}

/** Avisos de mantenimiento próximo y vencido (punto 10.6). */
async function alertarMantenimientos(
  configuracion: Awaited<ReturnType<typeof obtenerConfiguracion>>,
  ahora: Date,
): Promise<{ mantenimientosPorVencer: number; mantenimientosVencidos: number }> {
  const equipos = await EquipoModel.find({
    activo: true,
    proximoMantenimiento: { $ne: null },
  }).lean();

  let mantenimientosPorVencer = 0;
  let mantenimientosVencidos = 0;

  for (const equipo of equipos) {
    const estado = estadoMantenimiento(
      equipo.proximoMantenimiento,
      configuracion.diasAvisoMantenimiento,
      TZ,
      ahora,
    );
    if (estado === 'realizado') continue;

    const dia = zonedDayKey(ahora, TZ);
    const coleccion = `equipos:${estado}:${dia}`;
    if (await yaExisteAviso(coleccion, equipo._id)) continue;

    const fecha = equipo.proximoMantenimiento
      ? formatInZone(equipo.proximoMantenimiento, TZ).split(' ')[0]
      : '';
    const mensaje =
      estado === 'vencido'
        ? `El mantenimiento del equipo ${equipo.codigo} venció el ${fecha}.`
        : `El equipo ${equipo.codigo} tiene mantenimiento programado para el ${fecha}.`;

    await crearNotificacion({
      puestoId: equipo.puestoId,
      tipo: 'mantenimiento',
      titulo: estado === 'vencido' ? 'Mantenimiento vencido' : 'Mantenimiento próximo',
      mensaje,
      referencia: { coleccion, documentoId: equipo._id },
    });
    await crearNotificacion({
      paraSupervision: true,
      tipo: 'mantenimiento',
      titulo: estado === 'vencido' ? 'Mantenimiento vencido' : 'Mantenimiento próximo',
      mensaje,
      referencia: { coleccion, documentoId: equipo._id },
    });

    if (estado === 'vencido') mantenimientosVencidos += 1;
    else mantenimientosPorVencer += 1;
  }

  return { mantenimientosPorVencer, mantenimientosVencidos };
}

/** Alertas de acciones correctivas próximas a vencer y ya vencidas (punto 14.2). */
async function alertarAccionesCorrectivas(
  ahora: Date,
): Promise<{ accionesPorVencer: number; accionesVencidas: number }> {
  const abiertas = await NoConformidadModel.find({
    estado: { $in: ['pendiente', 'en_proceso'] },
    fechaLimite: { $ne: null, $lte: addDays(ahora, 3) },
  }).lean();

  let accionesPorVencer = 0;
  let accionesVencidas = 0;
  const dia = zonedDayKey(ahora, TZ);

  for (const nc of abiertas) {
    const vencida = estaVencida(nc.fechaLimite, TZ, ahora);
    const coleccion = `noConformidades:${vencida ? 'vencida' : 'por-vencer'}:${dia}`;
    if (await yaExisteAviso(coleccion, nc._id)) continue;

    const diasRestantes = nc.fechaLimite ? diffInDays(ahora, nc.fechaLimite, TZ) : 0;
    const mensaje = vencida
      ? `La acción correctiva N.° ${nc.numero} superó su fecha límite: ${nc.hallazgo}`
      : `La acción correctiva N.° ${nc.numero} vence en ${diasRestantes} día(s): ${nc.hallazgo}`;

    await crearNotificacion({
      paraSupervision: true,
      tipo: 'accion_correctiva',
      titulo: vencida ? 'Acción correctiva vencida' : 'Acción correctiva por vencer',
      mensaje,
      referencia: { coleccion, documentoId: nc._id },
    });
    if (nc.puestoId) {
      await crearNotificacion({
        puestoId: nc.puestoId,
        tipo: 'accion_correctiva',
        titulo: vencida ? 'Acción correctiva vencida' : 'Acción correctiva por vencer',
        mensaje,
        referencia: { coleccion, documentoId: nc._id },
      });
    }

    if (vencida) accionesVencidas += 1;
    else accionesPorVencer += 1;
  }

  if (accionesVencidas > 0) {
    // El estado guardado se pone al día para que los listados coincidan con las alertas.
    await NoConformidadModel.updateMany(
      { estado: { $in: ['pendiente', 'en_proceso'] }, fechaLimite: { $lt: ahora } },
      { $set: { estado: 'plazo_vencido' } },
    );
  }

  return { accionesPorVencer, accionesVencidas };
}

/** Marca como vencidas las actividades de plagas que nunca se ejecutaron. */
async function marcarActividadesVencidas(ahora: Date): Promise<number> {
  const resultado = await ControlPlagasModel.updateMany(
    { estado: 'programada', fechaProgramada: { $lt: ahora } },
    { $set: { estado: 'vencida' } },
  );
  return resultado.modifiedCount;
}
