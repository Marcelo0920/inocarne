import { Types, type FilterQuery } from 'mongoose';
import { env } from '../../config/env.js';
import type { Semaforo } from '../../domain/constants.js';
import { endOfZonedDay, startOfZonedDay, zonedTimeKey } from '../../domain/time.js';
import { ControlModel } from '../../models/Control.js';
import { InspeccionModel } from '../../models/Inspeccion.js';
import { LimpiezaModel } from '../../models/Limpieza.js';
import { MantenimientoModel } from '../../models/Mantenimiento.js';
import { PuestoModel } from '../../models/Puesto.js';
import { RecepcionModel } from '../../models/Recepcion.js';
import { UsuarioModel } from '../../models/Usuario.js';
import { buildPaginated, type Paginated } from '../../utils/pagination.js';
import type { ListarHistorialInput, TipoHistorial } from './historial.schemas.js';

const TZ = env.DISPLAY_TIMEZONE;

/**
 * Una fila del historial, ya normalizada: cada tipo de registro se traduce a la
 * misma forma para poder mostrarlos juntos en una sola lista.
 */
export interface EntradaHistorial {
  id: string;
  tipo: TipoHistorial;
  titulo: string;
  puestoId: string | null;
  puestoNumero: number | null;
  puestoNombre: string | null;
  registradoEn: string;
  dia: string;
  hora: string;
  usuario: string;
  semaforo: Semaforo;
  estadoTexto: string;
  detalle: string | null;
}

/** Los tipos que puede consultar cada rol. */
const TIPOS_DE_PUESTO: TipoHistorial[] = ['recepcion', 'exhibicion', 'refrigeracion', 'limpieza'];
const TIPOS_DE_SUPERVISION: TipoHistorial[] = [...TIPOS_DE_PUESTO, 'inspeccion', 'mantenimiento'];

/** Ventana máxima consultable de una vez, para no traer la base entera. */
const MAXIMO_DIAS = 92;

interface Contexto {
  puestos: Map<string, { numero: number; nombre: string }>;
  usuarios: Map<string, string>;
}

function datosPuesto(contexto: Contexto, puestoId: unknown) {
  const encontrado = contexto.puestos.get(String(puestoId));
  return {
    puestoId: puestoId ? String(puestoId) : null,
    puestoNumero: encontrado?.numero ?? null,
    puestoNombre: encontrado?.nombre ?? null,
  };
}

const nombreUsuario = (contexto: Contexto, usuarioId: unknown): string =>
  contexto.usuarios.get(String(usuarioId)) ?? '—';

const numero = (valor: number): string => String(valor).replace('.', ',');

/**
 * Historial unificado de todos los registros (punto 15).
 *
 * Cada colección se consulta por separado —tienen campos distintos— y luego se
 * combinan en memoria. La ventana de fechas está acotada, así que el volumen es
 * el de unos pocos días de un mercado: unas decenas de registros por día.
 */
export async function listarHistorial(
  filtros: ListarHistorialInput,
  puestoObligatorio: string | null,
): Promise<Paginated<EntradaHistorial>> {
  const hoy = new Date();
  const hasta = filtros.hasta ? endOfZonedDay(filtros.hasta, TZ) : endOfZonedDay(zonedDia(hoy), TZ);
  const desdeSolicitado = filtros.desde
    ? startOfZonedDay(filtros.desde, TZ)
    : new Date(hasta.getTime() - 7 * 86_400_000);
  const limiteInferior = new Date(hasta.getTime() - MAXIMO_DIAS * 86_400_000);
  const desde = desdeSolicitado < limiteInferior ? limiteInferior : desdeSolicitado;

  const permitidos = puestoObligatorio ? TIPOS_DE_PUESTO : TIPOS_DE_SUPERVISION;
  const tipos = filtros.tipo ? permitidos.filter((tipo) => tipo === filtros.tipo) : permitidos;

  const puestoId = puestoObligatorio ?? filtros.puestoId;
  const rango = { $gte: desde, $lt: hasta };
  const filtroPuesto: FilterQuery<{ puestoId: Types.ObjectId }> = puestoId
    ? { puestoId: new Types.ObjectId(puestoId) }
    : {};

  const [puestos, usuarios] = await Promise.all([
    PuestoModel.find().lean(),
    UsuarioModel.find().select('nombre usuario').lean(),
  ]);
  const contexto: Contexto = {
    puestos: new Map(puestos.map((p) => [String(p._id), { numero: p.numero, nombre: p.nombre }])),
    usuarios: new Map(usuarios.map((u) => [String(u._id), u.usuario])),
  };

  const entradas: EntradaHistorial[] = [];

  if (tipos.includes('recepcion')) {
    const recepciones = await RecepcionModel.find({ ...filtroPuesto, registradoEn: rango }).lean();
    for (const r of recepciones) {
      const rechazada = r.resultado === 'rechazado';
      entradas.push({
        id: String(r._id),
        tipo: 'recepcion',
        titulo: rechazada ? 'Recepción — RECHAZADA' : 'Recepción — Aceptada',
        ...datosPuesto(contexto, r.puestoId),
        registradoEn: r.registradoEn.toISOString(),
        dia: r.dia,
        hora: zonedTimeKey(r.registradoEn, TZ),
        usuario: nombreUsuario(contexto, r.usuarioId),
        semaforo: rechazada || !r.dentroRango ? 'rojo' : 'verde',
        estadoTexto: rechazada ? 'Incumplimiento' : r.dentroRango ? 'Aceptada' : 'Fuera de rango',
        detalle: rechazada
          ? (r.motivoRechazo ?? null)
          : `${r.proveedor} · ${numero(r.temperatura)} °C · pH ${numero(r.ph)}`,
      });
    }
  }

  const tiposControl = (['exhibicion', 'refrigeracion'] as const).filter((t) => tipos.includes(t));
  if (tiposControl.length > 0) {
    // Un control se muestra con la hora del teléfono; la del servidor no se expone.
    const controles = await ControlModel.find({
      ...filtroPuesto,
      tipo: { $in: tiposControl },
      horaDispositivo: rango,
    }).lean();
    for (const c of controles) {
      const nombre = c.tipo === 'exhibicion' ? 'Exhibición' : 'Refrigeración';
      entradas.push({
        id: String(c._id),
        tipo: c.tipo,
        titulo: c.dentroRango
          ? `${nombre} · control ${c.numero}`
          : `${nombre} · control ${c.numero} — ${numero(c.temperatura)} °C`,
        ...datosPuesto(contexto, c.puestoId),
        registradoEn: c.horaDispositivo.toISOString(),
        dia: c.dia,
        hora: zonedTimeKey(c.horaDispositivo, TZ),
        usuario: nombreUsuario(contexto, c.usuarioId),
        semaforo: c.dentroRango ? 'verde' : 'rojo',
        estadoTexto: c.dentroRango ? 'Dentro de rango' : 'Fuera de rango',
        detalle: c.desviaciones.length > 0 ? c.desviaciones.join(' · ') : null,
      });
    }
  }

  if (tipos.includes('limpieza')) {
    const limpiezas = await LimpiezaModel.find({ ...filtroPuesto, registradoEn: rango }).lean();
    for (const l of limpiezas) {
      const total = l.items.length;
      const cumplen = total - l.incumplimientos.length;
      entradas.push({
        id: String(l._id),
        tipo: 'limpieza',
        titulo: l.cumple
          ? `Limpieza ${l.turno}`
          : `Limpieza ${l.turno} — ${l.incumplimientos.length} no cumple`,
        ...datosPuesto(contexto, l.puestoId),
        registradoEn: l.registradoEn.toISOString(),
        dia: l.dia,
        hora: zonedTimeKey(l.registradoEn, TZ),
        usuario: nombreUsuario(contexto, l.usuarioId),
        semaforo: l.cumple ? 'verde' : 'amarillo',
        estadoTexto: `${cumplen}/${total} cumple`,
        detalle: l.incumplimientos.length > 0 ? l.incumplimientos.join(' · ') : null,
      });
    }
  }

  if (tipos.includes('inspeccion')) {
    const inspecciones = await InspeccionModel.find({
      ...(puestoId ? { puestoId: new Types.ObjectId(puestoId) } : {}),
      registradoEn: rango,
    }).lean();
    for (const i of inspecciones) {
      entradas.push({
        id: String(i._id),
        tipo: 'inspeccion',
        titulo: i.tipo === 'mercado' ? 'Inspección del mercado' : 'Inspección por puesto',
        ...datosPuesto(contexto, i.puestoId),
        registradoEn: i.registradoEn.toISOString(),
        dia: i.dia,
        hora: zonedTimeKey(i.registradoEn, TZ),
        usuario: nombreUsuario(contexto, i.supervisorId),
        semaforo: i.cumple ? 'verde' : 'amarillo',
        estadoTexto: i.cumple ? 'Sin hallazgos' : `${i.incumplimientos.length} no cumple`,
        detalle: i.incumplimientos.length > 0 ? i.incumplimientos.join(' · ') : null,
      });
    }
  }

  if (tipos.includes('mantenimiento')) {
    const mantenimientos = await MantenimientoModel.find({
      ...filtroPuesto,
      registradoEn: rango,
    })
      .populate('equipoId', 'codigo nombre')
      .lean();
    for (const m of mantenimientos) {
      const equipo = m.equipoId as unknown as { codigo?: string; nombre?: string } | null;
      entradas.push({
        id: String(m._id),
        tipo: 'mantenimiento',
        titulo: `Mantenimiento ${m.tipo} — ${equipo?.nombre ?? 'equipo'}`,
        ...datosPuesto(contexto, m.puestoId),
        registradoEn: m.registradoEn.toISOString(),
        dia: zonedDia(m.registradoEn),
        hora: zonedTimeKey(m.registradoEn, TZ),
        usuario: nombreUsuario(contexto, m.usuarioId),
        semaforo: 'verde',
        estadoTexto: 'Registrado',
        detalle: `${equipo?.codigo ?? ''} · ${m.descripcion}`.trim(),
      });
    }
  }

  // Se ordena por el instante real de registro: es el criterio del historial.
  entradas.sort((a, b) => new Date(b.registradoEn).getTime() - new Date(a.registradoEn).getTime());

  const filtradas = filtros.semaforo
    ? entradas.filter((entrada) => entrada.semaforo === filtros.semaforo)
    : entradas;

  const { page, limit } = filtros;
  const inicio = (page - 1) * limit;
  return buildPaginated(filtradas.slice(inicio, inicio + limit), filtradas.length, { page, limit });
}

/** Día local de un instante, en `YYYY-MM-DD`. */
function zonedDia(instante: Date): string {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
  return iso;
}
