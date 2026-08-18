# INOCARNE — API

Backend del sistema de control sanitario de carne fresca (BPM / HACCP) para los puestos de venta de un mercado.

**Node 22 · TypeScript · Express · MongoDB (Mongoose) · Cloudinary · JWT**

---

## Puesta en marcha

```bash
npm install
cp .env.example .env      # completar MONGODB_URI, JWT_SECRET y Cloudinary
npm run seed              # datos iniciales (opcional)
npm run dev               # http://localhost:4000
```

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga automática |
| `npm test` | Toda la suite de pruebas (no necesita base de datos real) |
| `npm run test:watch` | Pruebas en modo interactivo |
| `npm run test:coverage` | Pruebas con informe de cobertura |
| `npm run typecheck` | Verificación de tipos |
| `npm run lint` | Análisis estático |
| `npm run build` && `npm start` | Compilar y ejecutar en producción |
| `npm run seed` | Crea configuración, puestos y usuarios de ejemplo |
| `npm run seed -- --reset` | Borra y vuelve a crear (nunca en producción) |

### Variables de entorno

Todas están documentadas en `.env.example`. Las claves se dejan en blanco a propósito:

- **`MONGODB_URI`** — cadena de conexión de MongoDB Atlas. Sin ella el servidor no arranca y lo dice con un mensaje claro.
- **`JWT_SECRET`** — clave para firmar la sesión. Generar con
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
- **`CLOUDINARY_*`** — si se dejan en blanco la aplicación funciona igual; solo los endpoints de subida responden que el almacenamiento no está configurado (`GET /api/archivos/estado` permite a la interfaz saberlo de antemano).
- **`CRON_SECRET`** — clave que el servicio de cron externo envía en la cabecera `x-cron-secret`.
- **`DISPLAY_TIMEZONE`** — zona horaria en la que se interpretan los horarios programados. Bolivia: `America/La_Paz`.

---

## Cómo está organizado

```
src/
  config/        entorno validado con Zod, conexión, logger
  domain/        reglas puras, sin base de datos ni Express
                 · time.ts        conversión entre UTC y hora local del mercado
                 · ranges.ts      validación de temperatura y pH
                 · compliance.ts  a tiempo / con retraso / pendiente / no realizado
                 · maintenance.ts realizado / próximo / vencido
  models/        14 modelos de Mongoose
  services/      configuración, auditoría, notificaciones, Cloudinary
  modules/       un directorio por funcionalidad: schemas + service + routes
  middleware/    autenticación, roles, validación, manejo de errores
  app.ts         aplicación Express sin `listen` (las pruebas la usan directamente)
  server.ts      arranque, conexión y cierre ordenado
```

La lógica de negocio vive en `domain/` como funciones puras. Por eso las reglas
—rangos, tolerancia horaria, estados— se prueban sin levantar nada.

---

## Reglas que aplica el servidor

| Regla | Dónde vive |
|---|---|
| **R1** La fecha y la hora las pone el servidor; el cliente no puede fijarlas (`registradoEn` es `immutable`) | modelos + servicios |
| **R2** Los registros no se editan ni se borran; toda operación queda en `auditoria` | `services/auditoria.service.ts` |
| **R3** Temperatura ≤ 5 °C · pH 5,4–5,8 rojas · 5,8–6,2 pollo, según el tipo de carne | `domain/ranges.ts` |
| **R4** A tiempo / con retraso / pendiente / no realizado, con tolerancia configurable (15 min) | `domain/compliance.ts` |
| **R5** La recepción no tiene horario fijo: nunca se marca con retraso | `modules/recepciones` |
| **R6** Evidencia fotográfica obligatoria cuando la carne no cumple; firma en pantalla en la recepción | `modules/recepciones` |
| **R7** Un "no cumple" en una inspección crea la no conformidad con los datos ya cargados | `modules/inspecciones` |
| **R8** El semáforo y el plazo vencido se calculan al consultar; no se almacenan | `modules/dashboard`, `modules/noConformidades` |

Un índice único por `(tipo, puestoId, dia, franjaProgramada)` impide registrar dos
veces el mismo control del mismo día, y otro por `(puestoId, dia, turno)` hace lo
mismo con los checklists de limpieza.

---

## Endpoints

Todo cuelga de `/api`. Salvo el ingreso, todo exige `Authorization: Bearer <token>`.

### Sesión y administración
| Método | Ruta | Quién |
|---|---|---|
| `POST` | `/auth/login` | público |
| `GET` | `/auth/yo` | autenticado |
| `POST` | `/auth/cambiar-password` | autenticado |
| `GET·PATCH` | `/configuracion` | leer: autenticado · modificar: admin |
| `GET·POST·PATCH` | `/puestos` | leer: autenticado · crear y modificar: admin |
| `GET·POST·PATCH` | `/usuarios` | admin |
| `POST` | `/usuarios/:id/restablecer-password` | admin |

### Registros del puesto
| Método | Ruta | Qué hace |
|---|---|---|
| `POST·GET` | `/recepciones` | Recepción de carne, con firma y evidencia |
| `POST` | `/controles` | Control de exhibición o de refrigeración |
| `GET` | `/controles/dia` | Estado de las franjas del día |
| `POST·GET` | `/limpiezas` | Checklist de limpieza por turno |
| `GET` | `/limpiezas/plantilla` · `/limpiezas/dia` | Puntos del checklist y estado del día |
| `POST·GET·PATCH` | `/equipos` | Inventario de equipos |
| `POST` | `/equipos/:id/mantenimientos` | Mantenimiento realizado |
| `GET` | `/mantenimientos` | Base general de mantenimientos |
| `POST` | `/archivos` | Sube una evidencia a Cloudinary y devuelve su referencia |

### Supervisión
| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/dashboard` | Panel semáforo de todos los puestos |
| `GET` | `/dashboard/puesto/:puestoId` | Detalle de un puesto |
| `POST·GET` | `/inspecciones` | Inspección del mercado o de un puesto |
| `GET` | `/inspecciones/plantillas` | Puntos de cada checklist |
| `GET·PATCH` | `/no-conformidades` | Seguimiento de acciones correctivas |
| `POST` | `/no-conformidades/:id/cerrar` | Verificación y cierre |
| `POST·GET·PATCH` | `/capacitaciones` | Cronograma de capacitaciones |
| `POST` | `/capacitaciones/:id/asistencia` | Lista de asistentes y evidencia |
| `POST·GET·PATCH` | `/control-plagas` | Cronograma de fumigaciones |
| `POST` | `/control-plagas/:id/realizada` | Registro de la actividad ejecutada |
| `GET` | `/notificaciones` · `/notificaciones/sin-leer` | Avisos |
| `GET` | `/reportes/resumen` · `/reportes/excel` | Reporte y descarga en Excel |

### Tarea programada
| Método | Ruta | Autenticación |
|---|---|---|
| `POST` | `/tareas/alertas` | cabecera `x-cron-secret` |
| `POST` | `/tareas/alertas/manual` | admin |

Evalúa controles no realizados, mantenimientos próximos y vencidos, acciones
correctivas por vencer y entrega los avisos programados de fumigación.
Conviene llamarla cada hora dentro del horario del mercado; la misma llamada
mantiene despierto el servidor en planes gratuitos que suspenden por inactividad.

### Formato de las respuestas

Los listados devuelven `{ data: [...], meta: { page, limit, total, totalPages } }`.
Los errores siempre tienen la misma forma, con el mensaje ya redactado en español:

```json
{ "error": { "codigo": "BAD_REQUEST", "mensaje": "...", "detalle": { "campo": "..." } } }
```

---

## Subida de fotografías

El archivo no se envía junto con el registro. Primero se sube a `POST /api/archivos`
(campo `archivo`, más `subcarpeta`), que responde `{ url, publicId }`; esa referencia
es la que se adjunta al registro. Así el registro se crea en una sola petición JSON
y la base de datos nunca guarda imágenes, solo su dirección.

Las imágenes se limitan a 1600 px y se comprimen en Cloudinary; conviene además
reducirlas en el navegador antes de subirlas, porque el plan gratuito tiene cuota.

---

## Pruebas

```bash
npm test
```

**151 pruebas.** Las de dominio no tocan la base de datos; las de integración
levantan un MongoDB en memoria (`mongodb-memory-server`) y llaman a las rutas
HTTP reales con Supertest. No hace falta ninguna credencial ni conexión a Atlas.

```
tests/unit/          time · ranges · compliance
tests/integration/   auth · recepciones · controles · limpiezas ·
                     inspecciones · equipos · dashboard · gestion
```

---

## Despliegue

Pensado para Render (backend) y MongoDB Atlas:

1. Build `npm install && npm run build`, arranque `npm start`.
2. Cargar las variables de entorno del `.env.example`.
3. Añadir el dominio del frontend a `CORS_ORIGINS`.
4. Programar el cron externo contra `POST /api/tareas/alertas` con la cabecera `x-cron-secret`.

En el plan gratuito el servidor se suspende tras un período de inactividad y la
primera petición puede tardar cerca de un minuto. Conviene limitar el ping
programado al horario del mercado, porque el plan tiene un tope de horas al mes.
