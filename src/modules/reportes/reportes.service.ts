import ExcelJS from 'exceljs';
import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env.js';
import { endOfZonedDay, formatInZone, startOfZonedDay } from '../../domain/time.js';
import { ControlModel } from '../../models/Control.js';
import { InspeccionModel } from '../../models/Inspeccion.js';
import { LimpiezaModel } from '../../models/Limpieza.js';
import { MantenimientoModel } from '../../models/Mantenimiento.js';
import { NoConformidadModel } from '../../models/NoConformidad.js';
import { PuestoModel, type Puesto } from '../../models/Puesto.js';
import { RecepcionModel } from '../../models/Recepcion.js';

const TZ = env.DISPLAY_TIMEZONE;

export interface RangoReporte {
  desde: string;
  hasta: string;
  puestoId?: string;
}

/** Rango de fechas expresado en instantes UTC, a partir de días locales. */
function rangoUtc({ desde, hasta }: RangoReporte) {
  return { $gte: startOfZonedDay(desde, TZ), $lt: endOfZonedDay(hasta, TZ) };
}

function filtroBase(rango: RangoReporte, campoFecha: string): FilterQuery<unknown> {
  const filtro: Record<string, unknown> = { [campoFecha]: rangoUtc(rango) };
  if (rango.puestoId) filtro.puestoId = new Types.ObjectId(rango.puestoId);
  return filtro;
}

const SI_NO = (valor: boolean): string => (valor ? 'Sí' : 'No');

/** Da formato a la cabecera y ajusta el ancho de las columnas. */
function prepararHoja(hoja: ExcelJS.Worksheet, columnas: Partial<ExcelJS.Column>[]): void {
  hoja.columns = columnas;
  hoja.getRow(1).font = { bold: true };
  hoja.getRow(1).alignment = { vertical: 'middle' };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Genera el reporte de todas las operaciones del período (punto 16).
 * Una hoja por tipo de registro, para que el supervisor pueda filtrar en Excel.
 */
export async function generarReporteExcel(rango: RangoReporte): Promise<ExcelJS.Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'INOCARNE';
  libro.created = new Date();

  const puestos = await PuestoModel.find().lean();
  const nombrePuesto = (id: unknown): string => {
    const puesto = puestos.find(
      (p: Puesto & { _id: Types.ObjectId }) => String(p._id) === String(id),
    );
    return puesto ? `Puesto ${puesto.numero} — ${puesto.nombre}` : '—';
  };

  // ── Recepciones ─────────────────────────────────────────────
  const recepciones = await RecepcionModel.find(filtroBase(rango, 'registradoEn'))
    .sort({ registradoEn: 1 })
    .lean();
  const hojaRecepciones = libro.addWorksheet('Recepciones');
  prepararHoja(hojaRecepciones, [
    { header: 'Puesto', key: 'puesto', width: 28 },
    { header: 'Fecha y hora', key: 'fecha', width: 18 },
    { header: 'Proveedor', key: 'proveedor', width: 24 },
    { header: 'Tipo de carne', key: 'tipoCarne', width: 14 },
    { header: 'Cantidad', key: 'cantidad', width: 12 },
    { header: 'Temperatura (°C)', key: 'temperatura', width: 16 },
    { header: 'pH', key: 'ph', width: 10 },
    { header: 'Dentro de rango', key: 'dentroRango', width: 16 },
    { header: 'Resultado', key: 'resultado', width: 14 },
    { header: 'Motivo del rechazo', key: 'motivo', width: 34 },
    { header: 'Desviaciones', key: 'desviaciones', width: 44 },
  ]);
  for (const r of recepciones) {
    hojaRecepciones.addRow({
      puesto: nombrePuesto(r.puestoId),
      fecha: formatInZone(r.registradoEn, TZ),
      proveedor: r.proveedor,
      tipoCarne: r.tipoCarne,
      cantidad: `${r.cantidad} ${r.unidad}`,
      temperatura: r.temperatura,
      ph: r.ph,
      dentroRango: SI_NO(r.dentroRango),
      resultado: r.resultado,
      motivo: r.motivoRechazo ?? '',
      desviaciones: r.desviaciones.join(' · '),
    });
  }

  // ── Controles diarios (hora del teléfono) ───────────────────
  const controles = await ControlModel.find(filtroBase(rango, 'horaDispositivo'))
    .sort({ horaDispositivo: 1 })
    .lean();
  const hojaControles = libro.addWorksheet('Controles');
  prepararHoja(hojaControles, [
    { header: 'Puesto', key: 'puesto', width: 28 },
    { header: 'Fecha y hora', key: 'fecha', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 16 },
    { header: 'N.º de control', key: 'numero', width: 14 },
    { header: 'Temperatura (°C)', key: 'temperatura', width: 16 },
    { header: 'pH', key: 'ph', width: 10 },
    { header: 'Tipo de carne', key: 'tipoCarne', width: 14 },
    { header: 'Dentro de rango', key: 'dentroRango', width: 16 },
    { header: 'Desviaciones', key: 'desviaciones', width: 44 },
  ]);
  for (const c of controles) {
    hojaControles.addRow({
      puesto: nombrePuesto(c.puestoId),
      fecha: formatInZone(c.horaDispositivo, TZ),
      tipo: c.tipo,
      numero: c.numero,
      temperatura: c.temperatura,
      ph: c.ph ?? '',
      tipoCarne: c.tipoCarne ?? '',
      dentroRango: SI_NO(c.dentroRango),
      desviaciones: c.desviaciones.join(' · '),
    });
  }

  // ── Limpieza y desinfección ─────────────────────────────────
  const limpiezas = await LimpiezaModel.find(filtroBase(rango, 'registradoEn'))
    .sort({ registradoEn: 1 })
    .lean();
  const hojaLimpiezas = libro.addWorksheet('Limpieza');
  prepararHoja(hojaLimpiezas, [
    { header: 'Puesto', key: 'puesto', width: 28 },
    { header: 'Fecha y hora', key: 'fecha', width: 18 },
    { header: 'Turno', key: 'turno', width: 12 },
    { header: 'Cumple', key: 'cumple', width: 10 },
    { header: 'Incumplimientos', key: 'incumplimientos', width: 60 },
    { header: 'Observaciones', key: 'observaciones', width: 40 },
  ]);
  for (const l of limpiezas) {
    hojaLimpiezas.addRow({
      puesto: nombrePuesto(l.puestoId),
      fecha: formatInZone(l.registradoEn, TZ),
      turno: l.turno,
      cumple: SI_NO(l.cumple),
      incumplimientos: l.incumplimientos.join(' · '),
      observaciones: l.observaciones ?? '',
    });
  }

  // ── Inspecciones ────────────────────────────────────────────
  const inspecciones = await InspeccionModel.find(filtroBase(rango, 'registradoEn'))
    .sort({ registradoEn: 1 })
    .lean();
  const hojaInspecciones = libro.addWorksheet('Inspecciones');
  prepararHoja(hojaInspecciones, [
    { header: 'Tipo', key: 'tipo', width: 12 },
    { header: 'Puesto', key: 'puesto', width: 28 },
    { header: 'Fecha y hora', key: 'fecha', width: 18 },
    { header: 'Cumple', key: 'cumple', width: 10 },
    { header: 'Incumplimientos', key: 'incumplimientos', width: 60 },
    { header: 'Temperatura (°C)', key: 'temperatura', width: 16 },
    { header: 'pH', key: 'ph', width: 10 },
    { header: 'Observaciones', key: 'observaciones', width: 40 },
  ]);
  for (const i of inspecciones) {
    hojaInspecciones.addRow({
      tipo: i.tipo,
      puesto: i.puestoId ? nombrePuesto(i.puestoId) : 'Mercado',
      fecha: formatInZone(i.registradoEn, TZ),
      cumple: SI_NO(i.cumple),
      incumplimientos: i.incumplimientos.join(' · '),
      temperatura: i.medicion?.temperatura ?? '',
      ph: i.medicion?.ph ?? '',
      observaciones: i.observaciones ?? '',
    });
  }

  // ── Acciones correctivas ────────────────────────────────────
  const noConformidades = await NoConformidadModel.find(filtroBase(rango, 'detectadaEn'))
    .sort({ numero: 1 })
    .lean();
  const hojaNc = libro.addWorksheet('Acciones correctivas');
  prepararHoja(hojaNc, [
    { header: 'N.°', key: 'numero', width: 8 },
    { header: 'Puesto', key: 'puesto', width: 28 },
    { header: 'Detectada', key: 'detectada', width: 18 },
    { header: 'Hallazgo', key: 'hallazgo', width: 50 },
    { header: 'Acción correctiva', key: 'accion', width: 44 },
    { header: 'Responsable', key: 'responsable', width: 24 },
    { header: 'Fecha límite', key: 'limite', width: 16 },
    { header: 'Estado', key: 'estado', width: 16 },
    { header: 'Verificada', key: 'verificada', width: 18 },
  ]);
  for (const nc of noConformidades) {
    hojaNc.addRow({
      numero: nc.numero,
      puesto: nc.puestoId ? nombrePuesto(nc.puestoId) : 'Mercado',
      detectada: formatInZone(nc.detectadaEn, TZ),
      hallazgo: nc.hallazgo,
      accion: nc.accionCorrectiva ?? '',
      responsable: nc.responsable ?? '',
      limite: nc.fechaLimite ? formatInZone(nc.fechaLimite, TZ).split(' ')[0] : '',
      estado: nc.estado,
      verificada: nc.verificadaEn ? formatInZone(nc.verificadaEn, TZ) : '',
    });
  }

  // ── Mantenimientos ──────────────────────────────────────────
  const mantenimientos = await MantenimientoModel.find(filtroBase(rango, 'fecha'))
    .populate('equipoId', 'codigo nombre')
    .sort({ fecha: 1 })
    .lean();
  const hojaMantenimientos = libro.addWorksheet('Mantenimientos');
  prepararHoja(hojaMantenimientos, [
    { header: 'Puesto', key: 'puesto', width: 28 },
    { header: 'Equipo', key: 'equipo', width: 30 },
    { header: 'Fecha', key: 'fecha', width: 16 },
    { header: 'Tipo', key: 'tipo', width: 14 },
    { header: 'Trabajo realizado', key: 'descripcion', width: 50 },
    { header: 'Técnico', key: 'tecnico', width: 24 },
    { header: 'Próximo mantenimiento', key: 'proximo', width: 22 },
  ]);
  for (const m of mantenimientos) {
    const equipo = m.equipoId as unknown as { codigo?: string; nombre?: string } | null;
    hojaMantenimientos.addRow({
      puesto: nombrePuesto(m.puestoId),
      equipo: equipo?.codigo ? `${equipo.codigo} — ${equipo.nombre ?? ''}` : '',
      fecha: formatInZone(m.fecha, TZ).split(' ')[0],
      tipo: m.tipo,
      descripcion: m.descripcion,
      tecnico: m.tecnico ?? '',
      proximo: m.proximoMantenimiento ? formatInZone(m.proximoMantenimiento, TZ).split(' ')[0] : '',
    });
  }

  return libro.xlsx.writeBuffer();
}

/** Cifras del período, para mostrar antes de descargar el archivo. */
export async function resumenReporte(rango: RangoReporte) {
  const [recepciones, controles, limpiezas, inspecciones, noConformidades, mantenimientos] =
    await Promise.all([
      RecepcionModel.countDocuments(filtroBase(rango, 'registradoEn')),
      ControlModel.countDocuments(filtroBase(rango, 'registradoEn')),
      LimpiezaModel.countDocuments(filtroBase(rango, 'registradoEn')),
      InspeccionModel.countDocuments(filtroBase(rango, 'registradoEn')),
      NoConformidadModel.countDocuments(filtroBase(rango, 'detectadaEn')),
      MantenimientoModel.countDocuments(filtroBase(rango, 'fecha')),
    ]);

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    recepciones,
    controles,
    limpiezas,
    inspecciones,
    noConformidades,
    mantenimientos,
  };
}
