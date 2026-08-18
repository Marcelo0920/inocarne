import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { invalidarConfiguracion } from '../../src/services/configuracion.service.js';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearSesion, crearSesionPuesto } from '../helpers/factories.js';

const EVIDENCIA = { url: 'https://res.cloudinary.com/demo/image/upload/x.jpg', publicId: 'demo/x' };

/** Fecha desplazada en días respecto de hoy, en formato ISO. */
const enDias = (dias: number): string =>
  new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

const equipoBase = {
  codigo: 'REF-001',
  nombre: 'Refrigerador',
  marca: 'Electrolux',
  modelo: 'RF-220',
  numeroSerie: 'SN-99887',
  ubicacion: 'Detrás del mesón',
};

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

describe('POST /api/equipos', () => {
  it('registra un equipo del inventario inicial', async () => {
    const { sesion, puesto } = await crearSesionPuesto(1);

    const respuesta = await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ ...equipoBase, proximoMantenimiento: enDias(90), foto: EVIDENCIA });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.codigo).toBe('REF-001');
    expect(respuesta.body.puestoId).toBe(String(puesto._id));
    expect(respuesta.body.estadoMantenimiento).toBe('realizado');
  });

  it('no admite dos equipos con el mismo código', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);

    await request(app)
      .post('/api/equipos')
      .set('Authorization', puesto1.sesion.auth)
      .send(equipoBase);
    const repetido = await request(app)
      .post('/api/equipos')
      .set('Authorization', puesto2.sesion.auth)
      .send(equipoBase);

    expect(repetido.status).toBe(409);
  });

  it('exige el código y el nombre', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const respuesta = await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ marca: 'Electrolux' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('codigo');
    expect(respuesta.body.error.detalle).toHaveProperty('nombre');
  });
});

describe('estado del mantenimiento de cada equipo', () => {
  async function crearEquipoCon(proximoMantenimiento: string) {
    const { sesion, puesto } = await crearSesionPuesto(1);
    const respuesta = await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ ...equipoBase, proximoMantenimiento });
    return { sesion, puesto, equipo: respuesta.body };
  }

  it('marca vencido lo que ya pasó de fecha', async () => {
    const { equipo } = await crearEquipoCon(enDias(-30));
    expect(equipo.estadoMantenimiento).toBe('vencido');
  });

  it('marca próximo lo que vence dentro del plazo de aviso', async () => {
    const { equipo } = await crearEquipoCon(enDias(5));
    expect(equipo.estadoMantenimiento).toBe('proximo');
  });

  it('marca realizado lo que todavía está lejos', async () => {
    const { equipo } = await crearEquipoCon(enDias(120));
    expect(equipo.estadoMantenimiento).toBe('realizado');
  });

  it('permite filtrar por estado', async () => {
    const { sesion } = await crearSesionPuesto(1);
    await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ ...equipoBase, codigo: 'REF-001', proximoMantenimiento: enDias(-10) });
    await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({
        ...equipoBase,
        codigo: 'TM-001',
        nombre: 'Termómetro',
        proximoMantenimiento: enDias(200),
      });

    const vencidos = await request(app)
      .get('/api/equipos')
      .query({ estado: 'vencido' })
      .set('Authorization', sesion.auth);

    expect(vencidos.body).toHaveLength(1);
    expect(vencidos.body[0].codigo).toBe('REF-001');
  });
});

describe('POST /api/equipos/:id/mantenimientos', () => {
  it('registra el mantenimiento y pone al día la ficha del equipo', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const alta = await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ ...equipoBase, proximoMantenimiento: enDias(-10) });

    const mantenimiento = await request(app)
      .post(`/api/equipos/${alta.body.id}/mantenimientos`)
      .set('Authorization', sesion.auth)
      .send({
        fecha: enDias(0),
        tipo: 'preventivo',
        descripcion: 'Limpieza de condensador y cambio de filtro',
        tecnico: 'Servicio Técnico Frío Sur',
        documentos: [EVIDENCIA],
        proximoMantenimiento: enDias(90),
      });

    expect(mantenimiento.status).toBe(201);
    expect(mantenimiento.body.tipo).toBe('preventivo');
    expect(mantenimiento.body.documentos).toHaveLength(1);

    const equipo = await request(app)
      .get(`/api/equipos/${alta.body.id}`)
      .set('Authorization', sesion.auth);

    expect(equipo.body.estadoMantenimiento).toBe('realizado');
    expect(equipo.body.tipoUltimoMantenimiento).toBe('preventivo');
  });

  it('un mantenimiento antiguo no retrocede la ficha del equipo', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const alta = await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send({ ...equipoBase, ultimoMantenimiento: enDias(-5), proximoMantenimiento: enDias(85) });

    await request(app)
      .post(`/api/equipos/${alta.body.id}/mantenimientos`)
      .set('Authorization', sesion.auth)
      .send({
        fecha: enDias(-200),
        tipo: 'correctivo',
        descripcion: 'Reparación antigua que se carga ahora',
        proximoMantenimiento: enDias(-100),
      });

    const equipo = await request(app)
      .get(`/api/equipos/${alta.body.id}`)
      .set('Authorization', sesion.auth);

    expect(equipo.body.estadoMantenimiento).toBe('realizado');
    expect(new Date(equipo.body.proximoMantenimiento).toISOString().slice(0, 10)).toBe(enDias(85));
  });

  it('exige indicar si fue preventivo o correctivo', async () => {
    const { sesion } = await crearSesionPuesto(1);
    const alta = await request(app)
      .post('/api/equipos')
      .set('Authorization', sesion.auth)
      .send(equipoBase);

    const respuesta = await request(app)
      .post(`/api/equipos/${alta.body.id}/mantenimientos`)
      .set('Authorization', sesion.auth)
      .send({ fecha: enDias(0), descripcion: 'Revisión general' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.detalle).toHaveProperty('tipo');
  });

  it('un puesto no puede registrar mantenimientos de otro', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);
    const alta = await request(app)
      .post('/api/equipos')
      .set('Authorization', puesto1.sesion.auth)
      .send(equipoBase);

    const respuesta = await request(app)
      .post(`/api/equipos/${alta.body.id}/mantenimientos`)
      .set('Authorization', puesto2.sesion.auth)
      .send({ fecha: enDias(0), tipo: 'preventivo', descripcion: 'Intento indebido' });

    expect(respuesta.status).toBe(403);
  });
});

describe('base general de mantenimientos', () => {
  it('el supervisor ve los mantenimientos de todos los puestos', async () => {
    const puesto1 = await crearSesionPuesto(1);
    const puesto2 = await crearSesionPuesto(2);
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    for (const [indice, contexto] of [puesto1, puesto2].entries()) {
      const alta = await request(app)
        .post('/api/equipos')
        .set('Authorization', contexto.sesion.auth)
        .send({ ...equipoBase, codigo: `REF-00${indice + 1}` });
      await request(app)
        .post(`/api/equipos/${alta.body.id}/mantenimientos`)
        .set('Authorization', contexto.sesion.auth)
        .send({ fecha: enDias(0), tipo: 'preventivo', descripcion: 'Mantenimiento programado' });
    }

    const todos = await request(app)
      .get('/api/mantenimientos')
      .set('Authorization', supervisor.auth);
    const soloUno = await request(app)
      .get('/api/mantenimientos')
      .set('Authorization', puesto1.sesion.auth);

    expect(todos.body.data).toHaveLength(2);
    expect(soloUno.body.data).toHaveLength(1);
  });
});
