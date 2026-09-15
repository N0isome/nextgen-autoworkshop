const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadApi() {
  const storage = new Map();
  const module = { exports: {} };
  const sandbox = { module, exports: module.exports, Headers, AbortController, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: async () => { throw new Error('Unexpected network request in isolated test'); },
  };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/api.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(output, sandbox, { filename: 'api.ts' });
  return { api: module.exports, storage, sandbox };
}
function loadConnection() {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(__dirname, '../src/services/connection.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(output, { module, exports: module.exports }, { filename: 'connection.ts' });
  return module.exports;
}
const settings = { apiUrl: 'http://localhost:3000/v1', token: 'test-only', tenantId: 'tenant-a', workshopId: 'workshop-a', actorId: 'actor-a' };

test('legacy settings and unrelated properties survive reads without rewriting storage', () => {
  const { api, storage } = loadApi(); const raw = JSON.stringify({ ...settings, legacyOption: 'keep' });
  storage.set('workshop-settings', raw); const result = api.readSettings();
  for (const [key,value] of Object.entries(settings)) assert.equal(result[key], value);
  assert.equal(result.legacyOption, 'keep'); assert.equal(storage.get('workshop-settings'), raw);
});
test('malformed settings use a fallback without erasing the original entry', () => {
  const { api, storage } = loadApi(); storage.set('workshop-settings', '{damaged');
  assert.equal(api.readSettings().apiUrl, 'http://localhost:3000/v1');
  assert.equal(storage.get('workshop-settings'), '{damaged');
});
test('cached workshop data is isolated by API, tenant, workshop and actor', () => {
  const { api } = loadApi(); const data = { customers: [], vehicles: [], orders: [], overview: {}, savedAt: 'test' };
  api.writeCache(settings, data); assert.equal(api.readCache(settings).savedAt, 'test');
  for (const field of ['apiUrl','tenantId','workshopId','actorId']) assert.equal(api.readCache({ ...settings, [field]: 'different' }), undefined);
});
test('pagination loads every record and detects a backend that repeats the same page', async () => {
  const { api } = loadApi(); const records = Array.from({ length: 201 }, (_, i) => ({ id: String(i) }));
  const result = await api.readAll(async url => { const offset = Number(new URL('http://test'+url).searchParams.get('offset')); return records.slice(offset,offset+100); }, '/vehicles');
  assert.equal(result.length, 201); assert.equal(result[200].id, '200');
  await assert.rejects(api.readAll(async () => records.slice(0,100), '/vehicles'), /paginación/);
});
test('API requests use the saved URL and all five context headers', async () => {
  const { api, sandbox } = loadApi(); let captured;
  sandbox.fetch = async (url, init) => { captured = {url,init}; return {ok:true,json:async()=>({saved:true})}; };
  const client = api.createApi({ ...settings, apiUrl: 'http://localhost:4000/v1/', deviceId:'device-test' });
  assert.equal((await client('/vehicles', api.post({make:'Toyota'}))).saved, true);
  assert.equal(captured.url, 'http://localhost:4000/v1/vehicles');
  for (const [header,value] of Object.entries({'x-development-token':'test-only','x-tenant-id':'tenant-a','x-workshop-id':'workshop-a','x-actor-id':'actor-a','x-device-id':'device-test'})) assert.equal(captured.init.headers.get(header),value);
});
test('validation errors are shown and mutations are never retried automatically', async () => {
  const { api, sandbox } = loadApi(); let attempts = 0;
  sandbox.fetch = async () => { attempts++; return {ok:false,status:400,json:async()=>({message:['Revisa el vehículo','Falta el motivo']})}; };
  await assert.rejects(api.createApi(settings)('/receptions', api.post({})), /Revisa el vehículo · Falta el motivo/);
  assert.equal(attempts,1);
});
test('health scheduling uses steady intervals and bounded offline backoff', () => {
  const connection = loadConnection();
  assert.equal(connection.healthState({ status: 'healthy', database: 'connected' }), 'healthy');
  assert.equal(connection.healthState({ status: 'degraded', database: 'unavailable' }), 'degraded');
  assert.equal(connection.nextHealthCheckSeconds('healthy'), 300);
  assert.equal(connection.nextHealthCheckSeconds('degraded'), 180);
  assert.deepEqual([1, 2, 3, 4, 9].map(n => connection.nextHealthCheckSeconds('offline', n)), [60, 120, 300, 600, 600]);
  assert.equal(connection.nextHealthCheckSeconds('checking'), undefined);
});
