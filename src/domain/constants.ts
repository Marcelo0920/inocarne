/** Roles de usuario (R2 del brief funcional). */
export const ROLES = ['puesto', 'supervisor', 'coordinador', 'admin'] as const;
export type Rol = (typeof ROLES)[number];

/** Roles que pueden ver la información de todos los puestos. */
export const ROLES_SUPERVISION: readonly Rol[] = ['supervisor', 'coordinador', 'admin'];

/** Tipos de carne, de los que depende el rango de pH aceptado. */
export const TIPOS_CARNE = ['res', 'cerdo', 'pollo'] as const;
export type TipoCarne = (typeof TIPOS_CARNE)[number];

/** Las carnes rojas comparten rango de pH; el pollo tiene el suyo. */
export const CARNES_ROJAS: readonly TipoCarne[] = ['res', 'cerdo'];

/** Resultado de una recepción de carne. */
export const RESULTADOS_RECEPCION = ['aceptado', 'rechazado'] as const;
export type ResultadoRecepcion = (typeof RESULTADOS_RECEPCION)[number];

/** Tipo de control horario programado. */
export const TIPOS_CONTROL = ['exhibicion', 'refrigeracion'] as const;
export type TipoControl = (typeof TIPOS_CONTROL)[number];

/** Turnos del checklist de limpieza. */
export const TURNOS_LIMPIEZA = ['inicial', 'final'] as const;
export type TurnoLimpieza = (typeof TURNOS_LIMPIEZA)[number];

/** Estado de cumplimiento de un control programado (R4). */
export const ESTADOS_CONTROL = ['a_tiempo', 'con_retraso', 'pendiente', 'no_realizado'] as const;
export type EstadoControl = (typeof ESTADOS_CONTROL)[number];

/** Semáforo de la plataforma. `gris` = todavía no corresponde realizarlo. */
export const SEMAFOROS = ['verde', 'amarillo', 'rojo', 'gris'] as const;
export type Semaforo = (typeof SEMAFOROS)[number];

/** Tipos de mantenimiento. */
export const TIPOS_MANTENIMIENTO = ['preventivo', 'correctivo'] as const;
export type TipoMantenimiento = (typeof TIPOS_MANTENIMIENTO)[number];

/** Estado del mantenimiento de un equipo. */
export const ESTADOS_MANTENIMIENTO = ['realizado', 'proximo', 'vencido'] as const;
export type EstadoMantenimiento = (typeof ESTADOS_MANTENIMIENTO)[number];

/** Estados de una acción correctiva / no conformidad. */
export const ESTADOS_ACCION = ['pendiente', 'en_proceso', 'realizado', 'plazo_vencido'] as const;
export type EstadoAccion = (typeof ESTADOS_ACCION)[number];

/** Estados de una capacitación. */
export const ESTADOS_CAPACITACION = [
  'programada',
  'realizada',
  'pendiente',
  'reprogramada',
] as const;
export type EstadoCapacitacion = (typeof ESTADOS_CAPACITACION)[number];

/** Estados de una actividad de control de plagas. */
export const ESTADOS_PLAGA = ['programada', 'realizada', 'vencida'] as const;
export type EstadoPlaga = (typeof ESTADOS_PLAGA)[number];

/** Tipos de inspección del supervisor. */
export const TIPOS_INSPECCION = ['mercado', 'puesto'] as const;
export type TipoInspeccion = (typeof TIPOS_INSPECCION)[number];

/** Los diez puntos del checklist de limpieza y desinfección (punto 9). */
export const PUNTOS_LIMPIEZA = [
  'Higiene del personal',
  'Limpieza y desinfección de utensilios',
  'Limpieza y desinfección de ganchos para exhibición',
  'Limpieza y desinfección de bandejas',
  'Limpieza y desinfección de vitrina refrigerada',
  'Limpieza de equipos de refrigeración',
  'Limpieza y desinfección del mesón',
  'Limpieza y desinfección del piso',
  'Limpieza del termómetro',
  'Limpieza del pHmetro',
] as const;

/** Checklist de condiciones generales del mercado (punto 11.1). */
export const PUNTOS_INSPECCION_MERCADO = [
  'Pasillos limpios',
  'Techos sin polvo ni telarañas',
  'Luminarias limpias y protegidas contra ruptura',
  'Drenajes funcionales y sin residuos',
  'Sanitarios limpios',
  'Lavamanos limpios con jabón y desinfectante',
  'Manejo adecuado de residuos',
  'Ausencia de olores desagradables',
  'Ausencia de animales y roedores',
  'Disponibilidad de agua en condiciones óptimas',
] as const;

/** Checklist de inspección por puesto de venta (punto 11.2). */
export const PUNTOS_INSPECCION_PUESTO = [
  'Limpieza — mesones',
  'Limpieza — superficies',
  'Limpieza — piso',
  'Limpieza — pared',
  'Limpieza — materiales de limpieza',
  'Utensilios — cuchillos',
  'Utensilios — ganchos',
  'Utensilios — tablas',
  'Utensilios — bandejas',
  'Mantenimiento y estado de equipos, utensilios e infraestructura',
  'Condiciones de recepción',
  'Condiciones de almacenamiento y exhibición de carne',
  'Rotación de carne (PEPS)',
  'Carne etiquetada',
] as const;

/** Condiciones organolépticas evaluadas en la recepción (punto 6). */
export const CONDICIONES_ORGANOLEPTICAS = ['color', 'olor', 'textura', 'grasa'] as const;
export type CondicionOrganoleptica = (typeof CONDICIONES_ORGANOLEPTICAS)[number];

/** Valores por defecto de la configuración del sistema. */
export const CONFIGURACION_POR_DEFECTO = {
  temperaturaMaxima: 5,
  rangoPhRojas: { min: 5.4, max: 5.8 },
  rangoPhPollo: { min: 5.8, max: 6.2 },
  horariosExhibicion: ['07:00', '10:30', '13:30'],
  horariosRefrigeracion: ['07:00', '13:30'],
  toleranciaMinutos: 15,
  diasAvisoPlagas: [7, 3, 1, 0],
  diasAvisoMantenimiento: 15,
} as const;
