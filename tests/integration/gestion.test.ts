import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { zonedDayKey, zonedTimeToUtc } from '../../src/domain/time.js';
import { NotificacionModel } from '../../src/models/Notificacion.js';
import { evaluarAlertas } from '../../src/modules/tareas/alertas.service.js';
import {
  actualizarConfiguracion,
  invalidarConfiguracion,
} from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const TZ = 'America/La_Paz';
const enDias = (dias: number): string =>
  new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

beforeAll(async () => {
  await conectarBaseDePrueba();
});

afterAll(async () => {
  await cerrarBaseDePrueba();
});

beforeEach(async () => {
  await limpiarBaseDePrueba();
  invalidarConfiguracion();
});

describe('control de plagas y sus avisos', () => {
  it('programa la actividad y crea un aviso por cada antelación configurada', async () => {
    await crearSesionPuesto(1);
    await crearSesionPuesto(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/control-plagas')
      .set('Authorization', supervisor.auth)
      .send({
        fechaProgramada: enDias(15),
        hora: '16:00',
        empresa: 'Fumigaciones del Sur',
        todosLosPuestos: true,
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.actividad.puestos).toHaveLength(2);
    // 4 antelaciones (7, 3, 1 y 0 días) × 2 puestos
    expect(respuesta.body.avisosProgramados).toBe(8);
  });

  it('el aviso lleva el texto que el vendedor debe leer', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/control-plagas')
      .set('Authorization', supervisor.auth)
      .send({ fechaProgramada: enDias(0), hora: '16:00', todosLosPuestos: true });

    const avisos = await request(app).get('/api/notificaciones').set('Authorization', sesion.auth);
    const aviso = avisos.body.data[0];

    expect(aviso.tipo).toBe('control_plagas');
    expect(aviso.mensaje).toMatch(/Se realizará control\/fumigación de plagas el día/);
    expect(aviso.mensaje).toMatch(/Tome las previsiones necesarias/);
  });

  it('los avisos futuros no se muestran hasta que llega su momento', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/control-plagas')
      .set('Authorization', supervisor.auth)
      .send({ fechaProgramada: enDias(30), hora: '16:00', todosLosPuestos: true });

    const visibles = await request(app)
      .get('/api/notificaciones')
      .set('Authorization', sesion.auth);
    const total = await NotificacionModel.countDocuments({});

    expect(total).toBe(4);
    expect(visibles.body.data).toHaveLength(0);
  });

  it('el vendedor no puede programar fumigaciones', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const respuesta = await request(app)
      .post('/api/control-plagas')
      .set('Authorization', sesion.auth)
      .send({ fechaProgramada: enDias(10), hora: '16:00' });

    expect(respuesta.status).toBe(403);
  });

  it('registra la actividad como realizada con su evidencia', async () => {
    await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const alta = await request(app)
      .post('/api/control-plagas')
      .set('Authorization', supervisor.auth)
      .send({ fechaProgramada: enDias(1), hora: '16:00', todosLosPuestos: true });

    const realizada = await request(app)
      .post(`/api/control-plagas/${alta.body.actividad.id}/realizada`)
      .set('Authorization', supervisor.auth)
      .send({ observaciones: 'Sin evidencia de roedores' });

    expect(realizada.body.estado).toBe('realizada');
    expect(realizada.body.estadoActual).toBe('realizada');
  });
});

describe('capacitaciones', () => {
  it('convoca a todos los puestos y les avisa', async () => {
    const puesto1 = await crearSesionPuesto(1);
    await crearSesionPuesto(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/capacitaciones')
      .set('Authorization', supervisor.auth)
      .send({
        tema: 'Buenas prácticas de manipulación',
        fechaProgramada: enDias(10),
        hora: '15:00',
        lugar: 'Sala del mercado',
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.puestos).toHaveLength(2);
    expect(respuesta.body.estado).toBe('programada');

    const avisos = await request(app)
      .get('/api/notificaciones')
      .set('Authorization', puesto1.sesion.auth);
    expect(avisos.body.data[0].tipo).toBe('capacitacion');
    expect(avisos.body.data[0].mensaje).toMatch(/Buenas prácticas/);
  });

  it('registra la asistencia y la deja como realizada', async () => {
    const { puesto } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const alta = await request(app)
      .post('/api/capacitaciones')
      .set('Authorization', supervisor.auth)
      .send({ tema: 'HACCP básico', fechaProgramada: enDias(-1), hora: '15:00' });

    const cierre = await request(app)
      .post(`/api/capacitaciones/${alta.body.id}/asistencia`)
      .set('Authorization', supervisor.auth)
      .send({
        participantes: [{ puestoId: String(puesto._id), nombre: 'Juan Pérez', asistio: true }],
        observaciones: 'Asistencia completa',
      });

    expect(cierre.body.estado).toBe('realizada');
    expect(cierre.body.participantes).toHaveLength(1);
    expect(cierre.body.fechaRealizada).toBeTruthy();
  });

  it('avisa cuando la capacitación se reprograma', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const alta = await request(app)
      .post('/api/capacitaciones')
      .set('Authorization', supervisor.auth)
      .send({ tema: 'HACCP básico', fechaProgramada: enDias(5), hora: '15:00' });

    await request(app)
      .patch(`/api/capacitaciones/${alta.body.id}`)
      .set('Authorization', supervisor.auth)
      .send({ fechaProgramada: enDias(12), estado: 'reprogramada' });

    const avisos = await request(app).get('/api/notificaciones').set('Authorization', sesion.auth);
    expect(avisos.body.data.some((a: { titulo: string }) => /reprogramada/i.test(a.titulo))).toBe(
      true,
    );
  });
});

describe('tarea programada de alertas', () => {
  it('exige la clave del cron', async () => {
    const sinClave = await request(app).post('/api/tareas/alertas');
    const conClaveMala = await request(app)
      .post('/api/tareas/alertas')
      .set('x-cron-secret', 'equivocada');
    const correcta = await request(app)
      .post('/api/tareas/alertas')
      .set('x-cron-secret', 'cron-de-prueba');

    expect(sinClave.status).toBe(401);
    expect(conClaveMala.status).toBe(401);
    expect(correcta.status).toBe(200);
  });

  it('avisa de los controles que faltaron el día anterior', async () => {
    await actualizarConfiguracion({
      controlesExhibicionPorDia: 2,
      controlesRefrigeracionPorDia: 1,
    });
    const { sesion } = await crearSesionPuesto(1);
    const hoy = zonedDayKey(new Date(), TZ);
    const ayer = zonedDayKey(new Date(Date.now() - 24 * 60 * 60 * 1000), TZ);

    // Ayer hizo un control de exhibición de dos y el de refrigeración completo.
    await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({
        tipo: 'exhibicion',
        temperatura: 4,
        ph: 5.6,
        tipoCarne: 'res',
        horaDispositivo: zonedTimeToUtc(ayer, '09:00', TZ).toISOString(),
      });
    await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({
        tipo: 'refrigeracion',
        temperatura: 3,
        horaDispositivo: zonedTimeToUtc(ayer, '09:05', TZ).toISOString(),
      });

    const resultado = await evaluarAlertas(zonedTimeToUtc(hoy, '08:00', TZ));

    expect(resultado.controlesNoRealizados).toBe(1);

    const avisos = await request(app).get('/api/notificaciones').set('Authorization', sesion.auth);
    expect(avisos.body.data[0].tipo).toBe('control_pendiente');
    expect(avisos.body.data[0].mensaje).toMatch(/faltó 1 de 2 controles de exhibición/);
  });

  it('no avisa de los controles del día en curso, aunque sea tarde', async () => {
    await actualizarConfiguracion({
      controlesExhibicionPorDia: 1,
      controlesRefrigeracionPorDia: 1,
    });
    await crearSesionPuesto(1);
    const hoy = zonedDayKey(new Date(), TZ);

    // Ayer tampoco hubo registros (2 avisos), pero los de hoy no deben contar.
    const resultado = await evaluarAlertas(zonedTimeToUtc(hoy, '23:00', TZ));
    const avisosDeHoy = await NotificacionModel.find({
      'referencia.coleccion': { $regex: hoy },
    }).lean();

    expect(resultado.controlesNoRealizados).toBe(2);
    expect(avisosDeHoy).toHaveLength(0);
  });

  it('no repite el mismo aviso en cada ejecución', async () => {
    await actualizarConfiguracion({
      controlesExhibicionPorDia: 1,
      controlesRefrigeracionPorDia: 1,
    });
    await crearSesionPuesto(1);
    const dia = zonedDayKey(new Date(), TZ);
    const ahora = zonedTimeToUtc(dia, '12:00', TZ);

    const primera = await evaluarAlertas(ahora);
    const segunda = await evaluarAlertas(ahora);

    expect(primera.controlesNoRealizados).toBe(2);
    expect(segunda.controlesNoRealizados).toBe(0);
  });

  it('alerta de mantenimientos vencidos y acciones correctivas vencidas', async () => {
    const { sesion, puesto } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ codigo: 'REF-001', nombre: 'Refrigerador', proximoMantenimiento: enDias(-20) });
    await request(app)
      .post('/api/no-conformidades')
      .set('Authorization', supervisor.auth)
      .send({
        puestoId: String(puesto._id),
        hallazgo: 'Equipo deteriorado',
        accionCorrectiva: 'Reparación',
        fechaLimite: enDias(-2),
      });

    const resultado = await evaluarAlertas();

    expect(resultado.mantenimientosVencidos).toBe(1);
    expect(resultado.accionesVencidas).toBe(1);
  });

  it('marca como vencidas las fumigaciones que nunca se ejecutaron', async () => {
    await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    await request(app)
      .post('/api/control-plagas')
      .set('Authorization', supervisor.auth)
      .send({ fechaProgramada: enDias(-5), hora: '16:00', todosLosPuestos: true });

    const resultado = await evaluarAlertas();
    expect(resultado.actividadesVencidas).toBe(1);

    const lista = await request(app)
      .get('/api/control-plagas')
      .set('Authorization', supervisor.auth);
    expect(lista.body.data[0].estado).toBe('vencida');
  });
});

describe('reportes', () => {
  it('devuelve el resumen del período', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({
        proveedor: 'Frigorífico San Javier',
        tipoCarne: 'res',
        cantidad: 50,
        temperatura: 4,
        ph: 5.6,
        organolepticas: { color: true, olor: true, textura: true, grasa: true },
        resultado: 'aceptado',
        firma: { url: 'https://res.cloudinary.com/demo/image/upload/f.jpg', publicId: 'demo/f' },
        fotos: [],
      });

    const resumen = await request(app)
      .get('/api/reportes/resumen')
      .query({ desde: enDias(-1), hasta: enDias(1) })
      .set('Authorization', supervisor.auth);

    expect(resumen.status).toBe(200);
    expect(resumen.body.recepciones).toBe(1);
  });

  it('descarga un archivo Excel válido', async () => {
    await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/reportes/excel')
      .query({ desde: enDias(-7), hasta: enDias(0) })
      .set('Authorization', supervisor.auth)
      .buffer()
      .parse((res, callback) => {
        const trozos: Buffer[] = [];
        res.on('data', (trozo: Buffer) => trozos.push(trozo));
        res.on('end', () => callback(null, Buffer.concat(trozos)));
      });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toMatch(/spreadsheetml/);
    expect(respuesta.headers['content-disposition']).toMatch(/\.xlsx/);
    // Un .xlsx es un zip: siempre empieza con la firma PK.
    expect((respuesta.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('rechaza un rango de fechas invertido', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const respuesta = await request(app)
      .get('/api/reportes/resumen')
      .query({ desde: enDias(5), hasta: enDias(1) })
      .set('Authorization', supervisor.auth);

    expect(respuesta.status).toBe(400);
  });

  it('el vendedor no accede a los reportes generales', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const respuesta = await request(app)
      .get('/api/reportes/resumen')
      .query({ desde: enDias(-1), hasta: enDias(0) })
      .set('Authorization', sesion.auth);

    expect(respuesta.status).toBe(403);
  });
});
