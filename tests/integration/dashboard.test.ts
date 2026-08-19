import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { PUNTOS_LIMPIEZA } from '../../src/domain/constants.js';
import { zonedDayKey, zonedTimeKey, zonedTimeToUtc } from '../../src/domain/time.js';
import { construirDashboard } from '../../src/modules/dashboard/dashboard.service.js';
import {
  actualizarConfiguracion,
  invalidarConfiguracion,
} from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const TZ = 'America/La_Paz';
const EVIDENCIA = { url: 'https://res.cloudinary.com/demo/image/upload/x.jpg', publicId: 'demo/x' };
const hoy = () => zonedDayKey(new Date(), TZ);
const ahoraLocal = () => zonedTimeKey(new Date(), TZ);

const checklist = (cumple = true) => PUNTOS_LIMPIEZA.map((nombre) => ({ nombre, cumple }));

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

describe('GET /api/dashboard', () => {
  it('lista todos los puestos activos con sus columnas de control', async () => {
    await actualizarConfiguracion({
      horariosExhibicion: ['07:00', '10:30', '13:30'],
      horariosRefrigeracion: ['07:00', '13:30'],
    });
    await crearSesionPuesto(1);
    await crearSesionPuesto(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get('/api/dashboard')
      .set('Authorization', supervisor.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.filas).toHaveLength(2);
    // Recepción + 3 exhibición + 2 refrigeración + 2 limpiezas
    expect(respuesta.body.columnas).toHaveLength(8);
    expect(respuesta.body.filas[0].celdas).toHaveLength(8);
    expect(respuesta.body.resumen.puestos).toBe(2);
  });

  it('un usuario de puesto no puede ver el panel general', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const respuesta = await request(app).get('/api/dashboard').set('Authorization', sesion.auth);
    expect(respuesta.status).toBe(403);
  });

  it('pone en rojo el puesto que no realizó un control y explica el motivo', async () => {
    await actualizarConfiguracion({
      horariosExhibicion: ['07:00'],
      horariosRefrigeracion: ['07:00'],
      toleranciaMinutos: 15,
    });
    const { puesto } = await crearSesionPuesto(1);

    // A las 12:00 la ventana de las 07:00 ya cerró sin ningún registro.
    const dashboard = await construirDashboard(hoy(), zonedTimeToUtc(hoy(), '12:00', TZ));
    const fila = dashboard.filas[0]!;

    expect(fila.puestoId).toBe(String(puesto._id));
    expect(fila.semaforo).toBe('rojo');
    expect(fila.problemas).toContain('Control de 07:00 no realizado');
    expect(dashboard.resumen.conIncumplimiento).toBe(1);
  });

  it('queda en verde el puesto que registró todo correctamente', async () => {
    const franja = ahoraLocal();
    await actualizarConfiguracion({
      horariosExhibicion: [franja],
      horariosRefrigeracion: [franja],
      toleranciaMinutos: 60,
    });
    const { sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({
        proveedor: 'Frigorífico San Javier',
        tipoCarne: 'res',
        cantidad: 60,
        temperatura: 3,
        ph: 5.6,
        organolepticas: { color: true, olor: true, textura: true, grasa: true },
        resultado: 'aceptado',
        firma: EVIDENCIA,
        fotos: [],
      });
    await request(app).post('/api/controles').set('Authorization', sesion.auth).send({
      tipo: 'exhibicion',
      franjaProgramada: franja,
      temperatura: 4,
      ph: 5.6,
      tipoCarne: 'res',
    });
    await request(app)
      .post('/api/controles')
      .set('Authorization', sesion.auth)
      .send({ tipo: 'refrigeracion', franjaProgramada: franja, temperatura: 2 });
    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'inicial', items: checklist(), fotos: [] });
    await request(app)
      .post('/api/limpiezas')
      .set('Authorization', sesion.auth)
      .send({ turno: 'final', items: checklist(), fotos: [] });

    const respuesta = await request(app)
      .get('/api/dashboard')
      .set('Authorization', supervisor.auth);
    const fila = respuesta.body.filas[0];

    expect(fila.semaforo).toBe('verde');
    expect(fila.problemas).toHaveLength(0);
    expect(respuesta.body.resumen.conformes).toBe(1);
  });

  it('pone en rojo una recepción rechazada y muestra el motivo', async () => {
    await actualizarConfiguracion({ horariosExhibicion: [], horariosRefrigeracion: [] });
    const { sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/recepciones')
      .set('Authorization', sesion.auth)
      .send({
        proveedor: 'Proveedor X',
        tipoCarne: 'res',
        cantidad: 20,
        temperatura: 9,
        ph: 5.6,
        organolepticas: { color: true, olor: true, textura: true, grasa: true },
        resultado: 'rechazado',
        motivoRechazo: 'Cadena de frío interrumpida',
        firma: EVIDENCIA,
        fotos: [EVIDENCIA],
      });

    const respuesta = await request(app)
      .get('/api/dashboard')
      .set('Authorization', supervisor.auth);
    const celdaRecepcion = respuesta.body.filas[0].celdas.find(
      (c: { clave: string }) => c.clave === 'recepcion',
    );

    expect(celdaRecepcion.semaforo).toBe('rojo');
    expect(respuesta.body.filas[0].problemas.join(' ')).toMatch(/Cadena de frío interrumpida/);
  });

  it('cuenta las acciones correctivas abiertas y los mantenimientos vencidos', async () => {
    const { puesto, sesion } = await crearSesionPuesto(1);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    await request(app)
      .post('/api/no-conformidades')
      .set('Authorization', supervisor.auth)
      .send({
        puestoId: String(puesto._id),
        hallazgo: 'Equipo deteriorado',
        fechaLimite: '2020-01-01',
      });
    await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({
        codigo: 'REF-001',
        nombre: 'Refrigerador',
        proximoMantenimiento: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
      });

    const respuesta = await request(app)
      .get('/api/dashboard')
      .set('Authorization', supervisor.auth);

    expect(respuesta.body.resumen.noConformidadesAbiertas).toBe(1);
    expect(respuesta.body.resumen.noConformidadesVencidas).toBe(1);
    expect(respuesta.body.resumen.mantenimientosVencidos).toBe(1);
    expect(respuesta.body.filas[0].problemas).toContain('1 acción(es) correctiva(s) abierta(s)');
  });
});

describe('GET /api/dashboard/puesto/:puestoId', () => {
  it('el supervisor abre el detalle de cualquier puesto', async () => {
    const { puesto } = await crearSesionPuesto(4);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .get(`/api/dashboard/puesto/${String(puesto._id)}`)
      .set('Authorization', supervisor.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.puesto.numero).toBe(4);
    expect(Array.isArray(respuesta.body.celdas)).toBe(true);
  });

  it('el vendedor ve su propio detalle pero no el de otro puesto', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);

    const propio = await request(app)
      .get(`/api/dashboard/puesto/${String(puesto1.puesto._id)}`)
      .set('Authorization', puesto1.sesion.auth);
    const ajeno = await request(app)
      .get(`/api/dashboard/puesto/${String(puesto2.puesto._id)}`)
      .set('Authorization', puesto1.sesion.auth);

    expect(propio.status).toBe(200);
    expect(ajeno.status).toBe(403);
  });
});
