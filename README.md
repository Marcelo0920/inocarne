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

| Comando                        | Qué hace                                                  |
| ------------------------------ | --------------------------------------------------------- |
| `npm run dev`                  | Servidor de desarrollo con recarga automática             |
| `npm test`                     | Toda la suite de pruebas (no necesita base de datos real) |
| `npm run test:watch`           | Pruebas en modo interactivo                               |
| `npm run test:coverage`        | Pruebas con informe de cobertura                          |
| `npm run typecheck`            | Verificación de tipos                                     |
| `npm run lint`                 | Análisis estático                                         |
| `npm run build` && `npm start` | Compilar y ejecutar en producción                         |
| `npm run seed`                 | Crea configuración, puestos y usuarios de ejemplo         |
| `npm run seed -- --reset`      | Borra y vuelve a crear (nunca en producción)              |
| `npm run migrar`               | Informa qué datos viejos hay que adaptar (no cambia nada) |
| `npm run migrar -- --confirmar` | Adapta los controles guardados con horario programado    |

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
                 · compliance.ts  realizado / pendiente / no realizado
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

| Regla                                                                                                        | Dónde vive                                     |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **R1** La hora del servidor (`registradoEn`) se guarda siempre y es `immutable`. En los controles diarios la hora que se muestra es la del teléfono (`horaDispositivo`); la del servidor queda solo para auditoría | modelos + servicios                            |
| **R2** Los registros no se editan ni se borran; toda operación queda en `auditoria`                          | `services/auditoria.service.ts`                |
| **R3** Temperatura ≤ 5 °C · pH 5,4–5,8 rojas · 5,8–6,2 pollo, según el tipo de carne                         | `domain/ranges.ts`                             |
| **R4** Los controles no tienen horario ni puntualidad: realizado, pendiente mientras dura el día, o no realizado cuando el día terminó. Cada tipo tiene una cantidad por día configurable (exhibición 3, refrigeración 2) | `domain/compliance.ts`                         |
| **R5** La recepción no tiene horario fijo: nunca se marca con retraso                                        | `modules/recepciones`                          |
| **R6** Evidencia fotográfica obligatoria cuando la carne no cumple; firma en pantalla en la recepción        | `modules/recepciones`                          |
| **R7** Un "no cumple" en una inspección crea la no conformidad con los datos ya cargados                     | `modules/inspecciones`                         |
| **R8** El semáforo y el plazo vencido se calculan al consultar; no se almacenan                              | `modules/dashboard`, `modules/noConformidades` |

El servidor numera los controles de cada día (1, 2, 3…) y no acepta más de los
configurados. Un índice único por `(tipo, puestoId, dia, numero)` impide que dos
registros ocupen el mismo número, otro por `(tipo, puestoId, horaDispositivo)` hace
que un reenvío de la cola sin conexión responda `409` en lugar de duplicarse, y uno
por `(puestoId, dia, turno)` impide repetir un checklist de limpieza. El día de un
control sale de la hora del teléfono.

---

## Endpoints

Todo cuelga de `/api`. Salvo el ingreso, todo exige `Authorization: Bearer <token>`.

### Sesión y administración

| Método           | Ruta                                 | Quién                                        |
| ---------------- | ------------------------------------ | -------------------------------------------- |
| `POST`           | `/auth/login`                        | público                                      |
| `GET`            | `/auth/yo`                           | autenticado                                  |
| `POST`           | `/auth/cambiar-password`             | autenticado                                  |
| `GET·PATCH`      | `/configuracion`                     | leer: autenticado · modificar: admin         |
| `GET·POST·PATCH` | `/puestos`                           | leer: autenticado · crear y modificar: admin |
| `GET·POST·PATCH` | `/usuarios`                          | admin                                        |
| `POST`           | `/usuarios/:id/restablecer-password` | admin                                        |

### Registros del puesto

| Método           | Ruta                                      | Qué hace                                                 |
| ---------------- | ----------------------------------------- | -------------------------------------------------------- |
| `POST·GET`       | `/recepciones`                            | Recepción de carne, con firma y evidencia                |
| `POST`           | `/controles`                              | Control de exhibición o de refrigeración (`horaDispositivo` obligatoria) |
| `GET`            | `/controles/dia`                          | Controles del día, hechos y pendientes                   |
| `POST·GET`       | `/limpiezas`                              | Checklist de limpieza por turno                          |
| `GET`            | `/limpiezas/plantilla` · `/limpiezas/dia` | Puntos del checklist y estado del día                    |
| `POST·GET·PATCH` | `/equipos`                                | Inventario de equipos                                    |
| `POST`           | `/equipos/:id/mantenimientos`             | Mantenimiento realizado                                  |
| `GET`            | `/historial`                              | Historial unificado de todos los tipos de registro       |
| `GET`            | `/mantenimientos`                         | Base general de mantenimientos                           |
| `POST`           | `/archivos`                               | Sube una evidencia a Cloudinary y devuelve su referencia |

### Supervisión

| Método           | Ruta                                           | Qué hace                                         |
| ---------------- | ---------------------------------------------- | ------------------------------------------------ |
| `GET`            | `/dashboard`                                   | Panel semáforo de todos los puestos              |
| `GET`            | `/dashboard/puesto/:puestoId`                  | Detalle de un puesto                             |
| `POST·GET`       | `/inspecciones`                                | Inspección del mercado o de un puesto            |
| `GET`            | `/inspecciones/plantillas`                     | Puntos de cada checklist                         |
| `GET·PATCH`      | `/no-conformidades`                            | Seguimiento de acciones correctivas              |
| `POST`           | `/no-conformidades/:id/evidencia-cierre`       | El responsable adjunta la prueba de la ejecución |
| `POST`           | `/no-conformidades/:id/cerrar`                 | Verificación y cierre                            |
| `POST·GET·PATCH` | `/capacitaciones`                              | Cronograma de capacitaciones                     |
| `POST`           | `/capacitaciones/:id/asistencia`               | Lista de asistentes y evidencia                  |
| `POST·GET·PATCH` | `/control-plagas`                              | Cronograma de fumigaciones                       |
| `POST`           | `/control-plagas/:id/realizada`                | Registro de la actividad ejecutada               |
| `GET`            | `/notificaciones` · `/notificaciones/sin-leer` | Avisos                                           |
| `GET`            | `/reportes/resumen` · `/reportes/excel`        | Reporte y descarga en Excel                      |

### Tarea programada

| Método | Ruta                     | Autenticación            |
| ------ | ------------------------ | ------------------------ |
| `POST` | `/tareas/alertas`        | cabecera `x-cron-secret` |
| `POST` | `/tareas/alertas/manual` | admin                    |

Avisa de los controles que faltaron el día anterior, mantenimientos próximos y vencidos, acciones
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

**218 pruebas.** Las de dominio no tocan la base de datos; las de integración
levantan un MongoDB en memoria (`mongodb-memory-server`) y llaman a las rutas
HTTP reales con Supertest. No hace falta ninguna credencial ni conexión a Atlas.

```
tests/unit/          time · ranges · compliance
tests/integration/   auth · recepciones · controles · limpiezas · inspecciones ·
                     equipos · dashboard · historial · gestion · migracion
```

---

## Despliegue

Pensado para Render (backend) y MongoDB Atlas. El repositorio trae un
`render.yaml`: creando el servicio como _Blueprint_, Render toma de ahí los
comandos y pide los secretos uno por uno. A mano, la configuración es:

| Ajuste            | Valor                                   |
| ----------------- | --------------------------------------- |
| Build Command     | `npm ci --include=dev && npm run build` |
| Start Command     | `npm run start`                         |
| Health Check Path | `/health`                               |

**El `--include=dev` no es opcional.** Render define `NODE_ENV=production` en el
entorno del build y, con esa variable, `npm install` omite las dependencias de
desarrollo. Como el proyecto compila TypeScript antes de arrancar, sin ellas no
hay compilador ni `@types/node`, y el build termina en
`error TS2688: Cannot find type definition file for 'node'`.

Después:

1. Cargar las variables de entorno del `.env.example`.
2. Programar el cron externo contra `POST /api/tareas/alertas` con la cabecera `x-cron-secret`.
3. Si la base ya tiene controles guardados con horario programado, correr una vez
   `npm run migrar -- --confirmar` apenas se despliega esta versión: hasta entonces
   el índice viejo por franja rechazaría el segundo control del día.

En el plan gratuito el servidor se suspende tras un período de inactividad y la
primera petición puede tardar cerca de un minuto. Conviene limitar el ping
programado al horario del mercado, porque el plan tiene un tope de horas al mes.

---

## Detalles que conviene conocer

**El código del equipo lo asigna el sistema.** El vendedor no lo inventa: si
`POST /api/equipos` llega sin `codigo`, el servidor genera el primer correlativo
libre del puesto (`EQ-P3-01`, `EQ-P3-02`…). Se puede enviar uno propio y se
respeta; un equipo dado de baja conserva su código y no se reutiliza.

**El historial es un endpoint aparte, no la suma de los otros.**
`GET /api/historial` consulta cada colección, normaliza cada registro a la misma
forma (`icono`, `titulo`, `hora`, `usuario`, `semaforo`, `estadoTexto`) y los
combina en una sola lista ordenada por hora de registro. El vendedor recibe solo
su puesto y sus cuatro tipos; la supervisión recibe todos los puestos e incluye
inspecciones y mantenimientos. Sin fechas se devuelven los últimos 7 días y la
ventana máxima consultable es de 92 días, para no traer la base entera de una vez.

**Quién adjunta la evidencia del cierre.** El responsable del puesto sube la
prueba de que ejecutó la acción con
`POST /api/no-conformidades/:id/evidencia-cierre`; eso no cierra nada, solo pasa
la acción a _en proceso_, acumula la evidencia y avisa a la supervisión. Cerrar
sigue siendo exclusivo del supervisor, que verifica primero. La respuesta incluye
`listaParaVerificar` para que la interfaz sepa cuándo ofrecer el botón de cierre.
