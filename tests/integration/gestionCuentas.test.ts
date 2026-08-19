import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cerrarBaseDePrueba, conectarBaseDePrueba, limpiarBaseDePrueba } from '../helpers/db.js';
import { app, crearPuesto, crearSesion, crearUsuario } from '../helpers/factories.js';

beforeAll(async () => {
  await conectarBaseDePrueba();
});

afterAll(async () => {
  await cerrarBaseDePrueba();
});

beforeEach(async () => {
  await limpiarBaseDePrueba();
});

const nuevoVendedor = (puestoId: string) => ({
  nombre: 'Juan Pérez',
  usuario: 'puesto9',
  password: 'clave1234',
  rol: 'puesto' as const,
  puestoId,
});

describe('la supervisión da de alta puestos', () => {
  it('crea un puesto nuevo', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/puestos')
      .set('Authorization', supervisor.auth)
      .send({ numero: 9, nombre: 'Puesto 9', responsable: 'Ana Quispe' });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ numero: 9, nombre: 'Puesto 9', activo: true });
  });

  it('el coordinador HACCP también puede', async () => {
    const coordinador = await crearSesion({ rol: 'coordinador', usuario: 'coordinador' });

    const respuesta = await request(app)
      .post('/api/puestos')
      .set('Authorization', coordinador.auth)
      .send({ numero: 10, nombre: 'Puesto 10' });

    expect(respuesta.status).toBe(201);
  });

  it('puede desactivar un puesto que ya no opera', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(4);

    const respuesta = await request(app)
      .patch(`/api/puestos/${String(puesto._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ activo: false });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.activo).toBe(false);
  });

  it('un vendedor no puede crear puestos', async () => {
    const puesto = await crearPuesto(1);
    const vendedor = await crearSesion({
      rol: 'puesto',
      usuario: 'puesto1',
      puestoId: String(puesto._id),
    });

    const respuesta = await request(app)
      .post('/api/puestos')
      .set('Authorization', vendedor.auth)
      .send({ numero: 11, nombre: 'Puesto 11' });

    expect(respuesta.status).toBe(403);
  });
});

describe('la supervisión da de alta vendedores', () => {
  it('crea la cuenta del puesto', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(9);

    const respuesta = await request(app)
      .post('/api/usuarios')
      .set('Authorization', supervisor.auth)
      .send(nuevoVendedor(String(puesto._id)));

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ usuario: 'puesto9', rol: 'puesto' });
    expect(JSON.stringify(respuesta.body)).not.toContain('passwordHash');
  });

  it('el vendedor creado puede ingresar de inmediato', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(9);

    await request(app)
      .post('/api/usuarios')
      .set('Authorization', supervisor.auth)
      .send(nuevoVendedor(String(puesto._id)));

    const ingreso = await request(app)
      .post('/api/auth/login')
      .send({ usuario: 'puesto9', password: 'clave1234' });

    expect(ingreso.status).toBe(200);
    expect(ingreso.body.usuario.puesto).toMatchObject({ numero: 9 });
  });

  it('puede desactivar y restablecer la contraseña de un vendedor', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(2);
    const vendedor = await crearUsuario({
      rol: 'puesto',
      usuario: 'puesto2',
      puestoId: String(puesto._id),
    });

    const clave = await request(app)
      .post(`/api/usuarios/${String(vendedor._id)}/restablecer-password`)
      .set('Authorization', supervisor.auth)
      .send({ password: 'nuevaclave9' });
    const baja = await request(app)
      .patch(`/api/usuarios/${String(vendedor._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ activo: false });

    expect(clave.status).toBe(200);
    expect(baja.body.activo).toBe(false);
  });

  it('ve la lista de cuentas para saber qué puesto tiene la suya', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(1);
    await crearUsuario({ rol: 'puesto', usuario: 'puesto1', puestoId: String(puesto._id) });

    const respuesta = await request(app).get('/api/usuarios').set('Authorization', supervisor.auth);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.map((u: { usuario: string }) => u.usuario)).toContain('puesto1');
  });
});

describe('la supervisión no puede ampliar sus propios permisos', () => {
  it('no crea cuentas de administrador', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    const respuesta = await request(app)
      .post('/api/usuarios')
      .set('Authorization', supervisor.auth)
      .send({ nombre: 'Otro', usuario: 'otroadmin', password: 'clave1234', rol: 'admin' });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error.mensaje).toMatch(/solo el administrador/i);
  });

  it('tampoco crea otras cuentas de supervisión', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });

    for (const rol of ['supervisor', 'coordinador']) {
      const respuesta = await request(app)
        .post('/api/usuarios')
        .set('Authorization', supervisor.auth)
        .send({ nombre: 'Otro', usuario: `otro-${rol}`, password: 'clave1234', rol });

      expect(respuesta.status).toBe(403);
    }
  });

  it('no asciende a un vendedor a un rol con mando', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(3);
    const vendedor = await crearUsuario({
      rol: 'puesto',
      usuario: 'puesto3',
      puestoId: String(puesto._id),
    });

    const respuesta = await request(app)
      .patch(`/api/usuarios/${String(vendedor._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ rol: 'admin' });

    expect(respuesta.status).toBe(403);
  });

  it('no toca la cuenta de otro supervisor ni la del administrador', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const administrador = await crearUsuario({ rol: 'admin', usuario: 'admin' });

    const cambio = await request(app)
      .patch(`/api/usuarios/${String(administrador._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ activo: false });
    const clave = await request(app)
      .post(`/api/usuarios/${String(administrador._id)}/restablecer-password`)
      .set('Authorization', supervisor.auth)
      .send({ password: 'meloapropio' });

    expect(cambio.status).toBe(403);
    expect(clave.status).toBe(403);
  });

  it('un vendedor no llega a la gestión de cuentas', async () => {
    const puesto = await crearPuesto(1);
    const vendedor = await crearSesion({
      rol: 'puesto',
      usuario: 'puesto1',
      puestoId: String(puesto._id),
    });

    const lista = await request(app).get('/api/usuarios').set('Authorization', vendedor.auth);
    const alta = await request(app)
      .post('/api/usuarios')
      .set('Authorization', vendedor.auth)
      .send(nuevoVendedor(String(puesto._id)));

    expect(lista.status).toBe(403);
    expect(alta.status).toBe(403);
  });
});

describe('el administrador conserva el control total', () => {
  it('crea cuentas de supervisión', async () => {
    const administrador = await crearSesion({ rol: 'admin', usuario: 'admin' });

    const respuesta = await request(app)
      .post('/api/usuarios')
      .set('Authorization', administrador.auth)
      .send({
        nombre: 'Nueva supervisora',
        usuario: 'supervisora2',
        password: 'clave1234',
        rol: 'supervisor',
      });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.rol).toBe('supervisor');
  });

  it('puede modificar cualquier cuenta', async () => {
    const administrador = await crearSesion({ rol: 'admin', usuario: 'admin' });
    const otro = await crearUsuario({ rol: 'coordinador', usuario: 'coordinador' });

    const respuesta = await request(app)
      .patch(`/api/usuarios/${String(otro._id)}`)
      .set('Authorization', administrador.auth)
      .send({ activo: false });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.activo).toBe(false);
  });
});

describe('un puesto atendido no admite otra cuenta', () => {
  it('rechaza asignar un puesto que ya tiene vendedor activo', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(5);
    await crearUsuario({ rol: 'puesto', usuario: 'puesto5', puestoId: String(puesto._id) });

    const respuesta = await request(app)
      .post('/api/usuarios')
      .set('Authorization', supervisor.auth)
      .send({
        nombre: 'Otro vendedor',
        usuario: 'puesto5bis',
        password: 'clave1234',
        rol: 'puesto',
        puestoId: String(puesto._id),
      });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error.mensaje).toMatch(/ya tiene asignada la cuenta "puesto5"/);
  });

  it('al desactivar al vendedor el puesto vuelve a quedar libre', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(5);
    const anterior = await crearUsuario({
      rol: 'puesto',
      usuario: 'puesto5',
      puestoId: String(puesto._id),
    });

    await request(app)
      .patch(`/api/usuarios/${String(anterior._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ activo: false });

    const respuesta = await request(app)
      .post('/api/usuarios')
      .set('Authorization', supervisor.auth)
      .send({
        nombre: 'Vendedor nuevo',
        usuario: 'puesto5nuevo',
        password: 'clave1234',
        rol: 'puesto',
        puestoId: String(puesto._id),
      });

    expect(respuesta.status).toBe(201);
  });

  it('no deja reactivar al vendedor anterior si el puesto ya se reasignó', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(5);
    const anterior = await crearUsuario({
      rol: 'puesto',
      usuario: 'puesto5',
      puestoId: String(puesto._id),
    });

    await request(app)
      .patch(`/api/usuarios/${String(anterior._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ activo: false });
    await request(app)
      .post('/api/usuarios')
      .set('Authorization', supervisor.auth)
      .send({
        nombre: 'Vendedor nuevo',
        usuario: 'puesto5nuevo',
        password: 'clave1234',
        rol: 'puesto',
        puestoId: String(puesto._id),
      });

    const reactivar = await request(app)
      .patch(`/api/usuarios/${String(anterior._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ activo: true });

    expect(reactivar.status).toBe(409);
  });

  it('mudar una cuenta a un puesto ocupado también se rechaza', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const primero = await crearPuesto(1);
    const segundo = await crearPuesto(2);
    await crearUsuario({ rol: 'puesto', usuario: 'puesto1', puestoId: String(primero._id) });
    const otro = await crearUsuario({
      rol: 'puesto',
      usuario: 'puesto2',
      puestoId: String(segundo._id),
    });

    const respuesta = await request(app)
      .patch(`/api/usuarios/${String(otro._id)}`)
      .set('Authorization', supervisor.auth)
      .send({ puestoId: String(primero._id) });

    expect(respuesta.status).toBe(409);
  });

  it('desactivar y volver a activar la misma cuenta sigue siendo posible', async () => {
    const supervisor = await crearSesion({ rol: 'supervisor', usuario: 'supervisora' });
    const puesto = await crearPuesto(3);
    const vendedor = await crearUsuario({
      rol: 'puesto',
      usuario: 'puesto3',
      puestoId: String(puesto._id),
    });
    const ruta = `/api/usuarios/${String(vendedor._id)}`;

    await request(app).patch(ruta).set('Authorization', supervisor.auth).send({ activo: false });
    const respuesta = await request(app)
      .patch(ruta)
      .set('Authorization', supervisor.auth)
      .send({ activo: true });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.activo).toBe(true);
  });
});
