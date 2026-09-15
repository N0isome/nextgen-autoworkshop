import { DiagnosticsKnowledgeService } from './diagnostics-knowledge.service';

describe('DiagnosticsKnowledgeService', () => {
  const context = {
    tenantId: 'tenant-1',
    workshopId: 'workshop-1',
    actorId: 'actor-1',
    deviceId: 'device-1',
  };

  it('returns a verified workshop solution before the generic catalog', async () => {
    const database = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{
          id: 'solution-1',
          dtc_code: 'P0300',
          failed_component: 'Bobina de encendido',
          mechanic_notes: 'Bobina comprobada con intercambio entre cilindros.',
          repair_steps: ['Reemplazar bobina y repetir prueba bajo carga.'],
          attached_files: [],
        }],
      }),
    };
    const service = new DiagnosticsKnowledgeService(database as never);

    const result = await service.execute(context, {
      mechanic_id: 'mechanic-1',
      vehicle: { brand: 'Toyota', model: 'Yaris', year: 2010 },
      request_type: 'diagnostico_inicial',
      payload: { dtc_code: 'p0300' },
    });

    expect(result.data_source).toBe('Base de Datos Taller');
    expect(result.diagnostic_result.causes).toContain('Componente confirmado: Bobina de encendido');
    expect(database.query).toHaveBeenCalledTimes(1);
  });

  it('falls back to the generic catalog when the workshop has no solution', async () => {
    const database = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [{
            title: 'Fallo de encendido aleatorio o múltiple',
            description: 'Se detectan fallos de combustión.',
            generic_causes: ['Bujías o bobinas'],
            recommended_checks: ['Leer freeze frame'],
          }],
        }),
    };
    const service = new DiagnosticsKnowledgeService(database as never);

    const result = await service.execute(context, {
      mechanic_id: 'mechanic-1',
      vehicle: { brand: 'Toyota', model: 'Yaris', year: 2010 },
      request_type: 'diagnostico_inicial',
      payload: { dtc_code: 'P0300' },
    });

    expect(result.data_source).toBe('IA Genérica / Web');
    expect(result.ui_actions).toEqual({ show_override_button: true, prompt_validation: true });
    expect(database.query).toHaveBeenCalledTimes(2);
  });
});
