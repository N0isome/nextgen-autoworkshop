const assert = require('node:assert/strict');
const { createHarness } = require('./workflow-fixture.cjs');

async function run() {
  const h = await createHarness(); const { request: api, pg, fixture: f } = h;
  let passed = 0;
  const pass = message => { passed++; console.log(`PASS ${message}`); };
  try {
    assert.equal((await api('/health')).status, 'healthy');
    assert.equal((await api(`/work-orders/${f.orderId}`)).concern, 'Ingreso anterior a la actualización');
    const legacy = await api(`/diagnostics/vehicles/${f.vehicleId}/history`);
    assert.equal(legacy[0].id, f.sessionId); assert.equal(legacy[0].work_order_id, null);
    pass('Migration preserves legacy orders and unlinked scan history');

    const customer = await api('/customers', { displayName: 'Cliente nuevo de prueba', phone: '+56 9 0000 0001' });
    const vehicle = await api('/vehicles', { customerId: customer.id, make: 'Toyota', model: 'Yaris', modelYear: 2010, plate: 'QA0002' });
    const another = await api('/vehicles', { customerId: customer.id, make: 'Kia', model: 'Rio', modelYear: 2018, plate: 'QA0003' });
    assert.notEqual(vehicle.id, another.id);
    await api('/vehicles', { customerId: customer.id, make: 'Kia', model: 'Rio', plate: 'QA0002' }, { expected: 409 });
    pass('Multiple optional VINs are accepted; actual duplicate plates are rejected');

    const reception = await api('/receptions', { customerId: customer.id, vehicleId: vehicle.id, concern: 'Prueba de fallo de encendido', odometerKm: 120000, fuelLevelPercent: 50, bayLabel: 'Bahía 1', notes: 'Ingreso de prueba' });
    const ticket = await api(`/work-orders/${reception.workOrderId}`);
    assert.equal(ticket.customer_name, customer.display_name); assert.equal(ticket.plate, 'QA0002'); assert.equal(ticket.bay_label, 'Bahía 1'); assert.equal(ticket.odometer_km, 120000);
    pass('Reception keeps customer, vehicle, mileage, bay and audit in one ticket');
    const move = (toStatus, expected = 201) => api(`/work-orders/${ticket.id}/transitions`, { toStatus, reason: 'Prueba de cambio de etapa' }, { expected });
    await move('DIAGNOSING');
    await api('/diagnostics/sessions', { vehicleId: another.id, workOrderId: ticket.id, source: 'MANUAL', dtcCodes: ['P0300'] }, { expected: 404 });
    await api('/diagnostics/sessions', { vehicleId: vehicle.id, workOrderId: ticket.id, source: 'MANUAL', dtcCodes: [] }, { expected: 400 });
    const scan = await api('/diagnostics/sessions', { vehicleId: vehicle.id, workOrderId: ticket.id, source: 'MANUAL', dtcCodes: ['p0300', 'P0171', 'P0300'] });
    assert.equal(scan.codes.length, 2); assert.equal(scan.workOrderId, ticket.id);
    await move('IN_PROGRESS', 409);
    pass('Scan validates vehicle/order association, deduplicates DTCs and prevents unchecked progress');

    await api(`/diagnostics/sessions/${scan.sessionId}/codes/P0300/feedback`, { useful: false });
    await move('IN_PROGRESS', 409);
    const manual = { mechanic_id: f.actorId, vehicle: { brand: 'Toyota', model: 'Yaris', year: 2010 }, request_type: 'alimentacion_manual', payload: { dtc_code: 'P0300', diagnostic_session_id: scan.sessionId, real_solution_data: { failed_component: 'Bobina comprobada', mechanic_notes: 'Prueba de intercambio entre cilindros y reparación confirmada.', attached_files: [] } } };
    await api('/diagnostics/knowledge', manual);
    await move('IN_PROGRESS', 409);
    await api(`/diagnostics/sessions/${scan.sessionId}/codes/P0171/feedback`, { useful: true });
    const recovered = await api(`/diagnostics/sessions/${scan.sessionId}`);
    assert.equal(recovered.codes.find(c => c.code === 'P0300').feedback.manual_solution_saved, true);
    assert.equal(recovered.codes.find(c => c.code === 'P0171').feedback.useful, true);
    await move('IN_PROGRESS');
    pass('Negative feedback requires a stored solution; every DTC must be resolved and validation survives reopening');

    const followup = await api('/diagnostics/sessions', { vehicleId: vehicle.id, source: 'MANUAL', dtcCodes: ['P0300'] });
    assert.equal(followup.codes[0].data_source, 'Base de Datos Taller');
    pass('Verified workshop solution has priority in the next equivalent diagnosis');

    await api('/diagnostics/knowledge', { ...manual, payload: { ...manual.payload, dtc_code: 'P0420' } }, { expected: 404 });
    const count = await pg.query('SELECT count(*)::int AS count FROM soluciones_locales_taller');
    assert.equal(count.rows[0].count, 1);
    pass('Invalid manual solution association rolls back without saving a stray solution');

    await move('QUALITY_CHECK'); await move('READY_FOR_DELIVERY'); await move('CLOSED');
    await api('/diagnostics/sessions', { vehicleId: vehicle.id, workOrderId: ticket.id, source: 'MANUAL', dtcCodes: ['P0300'] }, { expected: 409 });
    pass('Valid lifecycle reaches closure and closed orders reject new scans');

    const publicLink = await api(`/work-orders/${ticket.id}/public-link`, {});
    assert.match(publicLink.token, /^[A-Za-z0-9_-]{24,}$/);
    const publicStatus = await api(`/public/orders/${publicLink.token}`);
    assert.equal(publicStatus.stage, 'Entregado'); assert.equal(publicStatus.plate, 'QA0***');
    assert.equal(Object.hasOwn(publicStatus, 'customer_name'), false);
    pass('Public tracking uses an unguessable link and exposes no customer contact data');

    const overview = await api('/work-orders/overview');
    assert.equal(overview.current.received, 2); assert.equal(overview.current.closed, 1); assert.equal(overview.current.diagnostics, 3); assert.equal(overview.current.criticalDtcs, 2); assert.equal(overview.current.eligible, 2); assert.equal(overview.current.completed, 1);
    assert.equal(overview.workflow.reduce((n,s) => n+s.count,0), 1); assert.equal(overview.bays.length, 0); assert.ok(overview.sync.pending > 0);
    assert.ok(overview.current.averageCycleHours >= 0);
    pass('Dashboard totals, cycle time, critical codes, plant and pending events reflect the database');

    const scope = { tenantId: f.otherTenantId, workshopId: f.otherWorkshopId };
    assert.equal((await api('/work-orders', undefined, scope)).length, 0);
    assert.equal((await api('/work-orders/overview', undefined, scope)).current.received, 0);
    await api(`/work-orders/${ticket.id}`, undefined, { ...scope, expected: 404 });
    await api(`/diagnostics/sessions/${scan.sessionId}`, undefined, { ...scope, expected: 404 });
    pass('Cross-workshop reads do not expose tickets, scans or metrics');

    await pg.query("INSERT INTO customers (id,tenant_id,workshop_id,display_name) SELECT gen_random_uuid(), $1, $2, 'Prueba de paginación ' || n FROM generate_series(1,105) AS n", [f.tenantId,f.workshopId]);
    const page1 = await api('/customers?offset=0'); const page2 = await api('/customers?offset=100');
    assert.equal(page1.length, 100); assert.equal(page2.length, 7); assert.equal(new Set([...page1,...page2].map(c=>c.id)).size, 107);
    await api('/customers?offset=-1', undefined, { expected: 400 });
    await api('/work-orders/overview?from=invalid', undefined, { expected: 400 });
    pass('Pagination returns more than 100 records and rejects invalid query parameters');

    const serviceReception = await api('/receptions', { customerId: customer.id, vehicleId: vehicle.id, concern: 'Prueba contrato de servicio', odometerKm: 121000, fuelLevelPercent: 45 });
    const serviceId = serviceReception.workOrderId;
    const command = (path, body, idempotencyKey, expected = 201) => api(path, body, { expected, headers: { 'idempotency-key': idempotencyKey } });
    const inbox = await api('/services/inbox?bucket=TO_REVIEW');
    assert.ok(inbox.items.some(item => item.id === serviceId && item.next_action.type === 'SAVE_EVALUATION'));
    await command(`/services/${serviceId}/work`, { workSummary: 'No permitido sin evaluación' }, 'a1000000-0000-4000-8000-000000000001', 409);
    const serviceScan = await api('/diagnostics/sessions', { vehicleId: vehicle.id, workOrderId: serviceId, source: 'MANUAL', dtcCodes: ['P0128'] });
    await command(`/services/${serviceId}/evaluation`, { diagnosticSessionId: serviceScan.sessionId }, 'a1000000-0000-4000-8000-000000000002', 409);
    await api(`/diagnostics/sessions/${serviceScan.sessionId}/codes/P0128/feedback`, { useful: true });
    const evaluated = await command(`/services/${serviceId}/evaluation`, { diagnosticSessionId: serviceScan.sessionId }, 'a1000000-0000-4000-8000-000000000003');
    assert.equal(evaluated.service.stage, 'EVALUATED'); assert.equal(evaluated.next_action.type, 'REGISTER_WORK');
    const evaluatedRetry = await command(`/services/${serviceId}/evaluation`, { diagnosticSessionId: serviceScan.sessionId }, 'a1000000-0000-4000-8000-000000000003');
    assert.equal(evaluatedRetry.service.stage, 'EVALUATED');
    await command(`/services/${serviceId}/approval-requests`, { description: 'Cambio de termostato recomendado', estimatedAmount: 50000 }, 'a1000000-0000-4000-8000-000000000004');
    await command(`/services/${serviceId}/approval-requests`, { description: 'Segunda solicitud no permitida' }, 'a1000000-0000-4000-8000-000000000005', 409);
    const paused = await command(`/services/${serviceId}/pause`, { reason: 'Esperando respuesta telefónica' }, 'a1000000-0000-4000-8000-000000000006');
    assert.equal(paused.service.stage, 'EVALUATED'); assert.equal(paused.flags.is_paused, true); assert.equal(paused.flags.has_pending_approval, true); assert.equal(paused.next_action.type, 'RESUME_SERVICE');
    const approvalId = paused.approvals.find(item => item.status === 'PENDING').id;
    const withdrawn = await command(`/services/${serviceId}/approval-requests/${approvalId}/withdraw`, { reason: 'Aprobación recibida por teléfono' }, 'a1000000-0000-4000-8000-000000000007');
    assert.equal(withdrawn.flags.has_pending_approval, false);
    await command(`/services/${serviceId}/resume`, {}, 'a1000000-0000-4000-8000-000000000008');
    await command(`/services/${serviceId}/work`, { workSummary: 'Se reemplazó termostato y se verificó temperatura de operación.' }, 'a1000000-0000-4000-8000-000000000009');
    await command(`/services/${serviceId}/ready`, {}, 'a1000000-0000-4000-8000-000000000010');
    const delivered = await command(`/services/${serviceId}/deliver`, { deliveryNote: 'Controlar nivel de refrigerante durante la semana.' }, 'a1000000-0000-4000-8000-000000000011');
    assert.equal(delivered.service.stage, 'DELIVERED');
    const deliveredRetry = await command(`/services/${serviceId}/deliver`, { deliveryNote: 'Controlar nivel de refrigerante durante la semana.' }, 'a1000000-0000-4000-8000-000000000011');
    assert.equal(deliveredRetry.service.stage, 'DELIVERED');
    const reopened = await command(`/services/${serviceId}/reopen`, { reason: 'Cliente reporta revisión adicional' }, 'a1000000-0000-4000-8000-000000000012');
    assert.equal(reopened.service.stage, 'WORKING'); assert.equal(reopened.flags.cancelled_at, null);
    const cancelled = await command(`/services/${serviceId}/cancel`, { reason: 'Cliente retiró temporalmente el vehículo' }, 'a1000000-0000-4000-8000-000000000013');
    assert.ok(cancelled.flags.cancelled_at);
    const reopenedCancelled = await command(`/services/${serviceId}/reopen`, { reason: 'Cliente volvió para completar trabajo' }, 'a1000000-0000-4000-8000-000000000014');
    assert.equal(reopenedCancelled.service.stage, 'WORKING'); assert.equal(reopenedCancelled.flags.cancelled_at, null);
    pass('Service contract keeps stage, flags, approvals, idempotency and reopen behavior consistent');
    console.log(`\n${passed} integration scenarios passed using isolated PGlite/PostgreSQL semantics.`);
  } finally { await h.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
