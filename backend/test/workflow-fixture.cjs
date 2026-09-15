// Isolated test harness. No .env credentials or external database are used.
require('reflect-metadata');
const { PGlite } = require('@electric-sql/pglite');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { AppModule } = require('../dist/app.module');
const { DatabaseService } = require('../dist/database/database.service');
const { OfficialTechnicalSourcesService } = require('../dist/diagnostics/official-technical-sources.service');

const fixture = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  workshopId: '22222222-2222-4222-8222-222222222222',
  actorId: '33333333-3333-4333-8333-333333333333',
  customerId: '44444444-4444-4444-8444-444444444444',
  vehicleId: '55555555-5555-4555-8555-555555555555',
  orderId: '66666666-6666-4666-8666-666666666666',
  sessionId: '77777777-7777-4777-8777-777777777777',
  otherTenantId: '88888888-8888-4888-8888-888888888888',
  otherWorkshopId: '99999999-9999-4999-8999-999999999999',
  token: 'qa-development-only',
};

async function createHarness(port = 0) {
  const pg = new PGlite();
  await pg.waitReady;
  const migrations = join(__dirname, '../migrations');
  const apply = async name => {
    // PGlite provides gen_random_uuid() natively; this extension installation
    // statement is the only difference from the PostgreSQL migrations.
    const sql = readFileSync(join(migrations, name), 'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '');
    await pg.exec(sql);
  };
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql') && n < '006').sort()) await apply(name);
  await pg.query('INSERT INTO tenants (id,legal_name) VALUES ($1,$2),($3,$4)', [fixture.tenantId, 'Taller QA', fixture.otherTenantId, 'Otro taller QA']);
  await pg.query('INSERT INTO workshops (id,tenant_id,name,timezone) VALUES ($1,$2,$3,$4),($5,$6,$7,$4)', [fixture.workshopId, fixture.tenantId, 'Ruta 5 — datos de prueba', 'America/Santiago', fixture.otherWorkshopId, fixture.otherTenantId, 'Otro taller QA']);
  await pg.query('INSERT INTO customers (id,tenant_id,workshop_id,display_name,phone) VALUES ($1,$2,$3,$4,$5)', [fixture.customerId,fixture.tenantId,fixture.workshopId,'Cliente de prueba anterior','+56 9 0000 0000']);
  await pg.query('INSERT INTO vehicles (id,tenant_id,workshop_id,customer_id,make,model,model_year,plate) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [fixture.vehicleId,fixture.tenantId,fixture.workshopId,fixture.customerId,'Toyota','Yaris',2010,'QA0001']);
  await pg.query("INSERT INTO work_orders (id,tenant_id,workshop_id,customer_id,vehicle_id,concern,status) VALUES ($1,$2,$3,$4,$5,'Ingreso anterior a la actualización','RECEIVED')", [fixture.orderId,fixture.tenantId,fixture.workshopId,fixture.customerId,fixture.vehicleId]);
  await pg.query("INSERT INTO diagnostic_sessions (id,tenant_id,workshop_id,vehicle_id,source,scanned_by) VALUES ($1,$2,$3,$4,'MANUAL',$5)", [fixture.sessionId,fixture.tenantId,fixture.workshopId,fixture.vehicleId,fixture.actorId]);
  await pg.query("INSERT INTO diagnostic_codes (session_id,code) VALUES ($1,'P0128')", [fixture.sessionId]);
  for (const name of readdirSync(migrations).filter(n => n.endsWith('.sql') && n >= '006').sort()) await apply(name);
  const query = client => async (sql, args = []) => {
    const result = await client.query(sql, args);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  };
  const database = { query: query(pg), transaction: fn => pg.transaction(tx => fn({ query: query(tx) })), isHealthy: async () => true, onModuleDestroy: async () => {} };
  process.env.NODE_ENV = 'test'; process.env.DEVELOPMENT_TOKEN = fixture.token;
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DatabaseService).useValue(database)
    .overrideProvider(OfficialTechnicalSourcesService).useValue({ findForCodes: async (_vehicle, codes) => Object.fromEntries(codes.map(code => [code, []])) }).compile();
  const app = module.createNestApplication({ logger: false });
  app.setGlobalPrefix('v1'); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(port, '127.0.0.1');
  const baseUrl = `http://127.0.0.1:${app.getHttpServer().address().port}/v1`;
  async function request(path, body, { expected = body === undefined ? 200 : 201, tenantId = fixture.tenantId, workshopId = fixture.workshopId, headers: extraHeaders = {} } = {}) {
    const response = await fetch(baseUrl + path, { method: body === undefined ? 'GET' : 'POST', headers: {
      'Content-Type': 'application/json', 'x-development-token': fixture.token, 'x-tenant-id': tenantId,
      'x-workshop-id': workshopId, 'x-actor-id': fixture.actorId, 'x-device-id': 'qa-isolated', ...extraHeaders,
    }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json();
    if (response.status !== expected) throw new Error(`${path}: HTTP ${response.status}, expected ${expected}: ${JSON.stringify(data)}`);
    return data;
  }
  return { pg, app, fixture, request, baseUrl, close: async () => { await app.close(); await pg.close(); } };
}
module.exports = { createHarness, fixture };
