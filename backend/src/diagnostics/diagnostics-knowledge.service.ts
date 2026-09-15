import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';
import { DiagnosticFeedbackDto } from './dto/diagnostic-feedback.dto';
import { KnowledgeRequestDto } from './dto/knowledge-request.dto';

export type LocalSolution = {
  id: string;
  dtc_code: string;
  failed_component: string;
  mechanic_notes: string;
  repair_steps: string[];
  attached_files: string[];
};

@Injectable()
export class DiagnosticsKnowledgeService {
  constructor(private readonly database: DatabaseService) {}

  async execute(context: RequestContext, dto: KnowledgeRequestDto) {
    const code = dto.payload.dtc_code?.toUpperCase();
    if (!code) throw new BadRequestException('payload.dtc_code is required');

    if (dto.request_type === 'alimentacion_manual') {
      if (!dto.payload.real_solution_data) {
        throw new BadRequestException('payload.real_solution_data is required for alimentacion_manual');
      }
      return this.saveManualSolution(context, dto, code);
    }

    const local = await this.findBest(context, dto.vehicle, code);
    if (local) return this.localResponse(local);

    const knowledge = await this.database.query<{
      title: string;
      description: string;
      generic_causes: string[];
      recommended_checks: string[];
    }>(
      'SELECT title, description, generic_causes, recommended_checks FROM dtc_knowledge WHERE code=$1',
      [code],
    );
    const row = knowledge.rows[0];
    return {
      data_source: 'IA Genérica / Web',
      diagnostic_result: {
        definition: row
          ? `${row.title}. ${row.description}`
          : `${code}: sin definición verificada en el catálogo local. Confirmar con documentación OEM.`,
        causes: row?.generic_causes ?? ['No existe una causa verificada todavía para esta combinación de vehículo y DTC.'],
        solution: row?.recommended_checks ?? ['Guardar freeze frame y realizar pruebas antes de reemplazar componentes.'],
      },
      ui_actions: { show_override_button: true, prompt_validation: true },
    };
  }

  async findBest(
    context: RequestContext,
    vehicle: { brand: string; model: string; year: number; engine?: string },
    code: string,
  ): Promise<LocalSolution | undefined> {
    const result = await this.database.query<LocalSolution>(
      `WITH selected AS (
         SELECT id
           FROM soluciones_locales_taller
          WHERE tenant_id=$1 AND workshop_id=$2
            AND upper(make)=upper($3) AND upper(model)=upper($4)
            AND model_year=$5 AND dtc_code=$6 AND verification_status='VERIFIED'
            AND (engine IS NULL OR ($7::text IS NOT NULL AND upper(engine)=upper($7)))
          ORDER BY
            CASE WHEN engine IS NOT NULL AND $7::text IS NOT NULL AND upper(engine)=upper($7) THEN 0 ELSE 1 END,
            created_at DESC,
            helpful_count DESC,
            not_helpful_count ASC
          LIMIT 1
       )
       UPDATE soluciones_locales_taller solution
          SET last_used_at=now()
         FROM selected
        WHERE solution.id=selected.id
      RETURNING solution.id, solution.dtc_code, solution.failed_component, solution.mechanic_notes,
                solution.repair_steps, solution.attached_files`,
      [context.tenantId, context.workshopId, vehicle.brand, vehicle.model, vehicle.year, code.toUpperCase(), vehicle.engine ?? null],
    );
    return result.rows[0];
  }

  async findBestForCodes(
    context: RequestContext,
    vehicle: { make: string; model: string; model_year?: number | null; engine?: string | null },
    codes: string[],
  ): Promise<Record<string, LocalSolution>> {
    if (!vehicle.model_year || !codes.length) return {};
    const pairs = await Promise.all(codes.map(async (code) => {
      const solution = await this.findBest(context, {
        brand: vehicle.make,
        model: vehicle.model,
        year: vehicle.model_year!,
        engine: vehicle.engine ?? undefined,
      }, code);
      return [code, solution] as const;
    }));
    return Object.fromEntries(pairs.filter((pair): pair is readonly [string, LocalSolution] => Boolean(pair[1])));
  }

  async feedback(context: RequestContext, sessionId: string, codeValue: string, dto: DiagnosticFeedbackDto) {
    const code = codeValue.toUpperCase();
    return this.database.transaction(async (client) => {
      const diagnostic = await client.query(
        `SELECT 1 FROM diagnostic_sessions s
          JOIN diagnostic_codes c ON c.session_id=s.id
         WHERE s.id=$1 AND c.code=$2 AND s.tenant_id=$3 AND s.workshop_id=$4`,
        [sessionId, code, context.tenantId, context.workshopId],
      );
      if (!diagnostic.rowCount) throw new NotFoundException('Diagnostic session or DTC not found');

      if (dto.localSolutionId) {
        const solution = await client.query(
          'SELECT 1 FROM soluciones_locales_taller WHERE id=$1 AND tenant_id=$2 AND workshop_id=$3',
          [dto.localSolutionId, context.tenantId, context.workshopId],
        );
        if (!solution.rowCount) throw new NotFoundException('Local solution not found');
      }

      await client.query(
        `INSERT INTO diagnostic_feedback
          (id, tenant_id, workshop_id, diagnostic_session_id, dtc_code, mechanic_id, useful, local_solution_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (diagnostic_session_id, dtc_code, mechanic_id)
         DO UPDATE SET useful=EXCLUDED.useful, local_solution_id=EXCLUDED.local_solution_id, manual_solution_saved=false, updated_at=now()`,
        [randomUUID(), context.tenantId, context.workshopId, sessionId, code, context.actorId, dto.useful, dto.localSolutionId ?? null],
      );

      if (dto.localSolutionId) {
        await client.query(
          `UPDATE soluciones_locales_taller s SET
             helpful_count=(SELECT count(*) FROM diagnostic_feedback f WHERE f.local_solution_id=s.id AND f.useful),
             not_helpful_count=(SELECT count(*) FROM diagnostic_feedback f WHERE f.local_solution_id=s.id AND NOT f.useful),
             last_used_at=now()
           WHERE s.id=$1`,
          [dto.localSolutionId],
        );
      }
      return { saved: true, useful: dto.useful, requiresManualSolution: !dto.useful };
    });
  }

  private async saveManualSolution(context: RequestContext, dto: KnowledgeRequestDto, code: string) {
    const input = dto.payload.real_solution_data!;
    const solutionId = randomUUID();
    await this.database.transaction(async (client) => {
      await client.query(
        `INSERT INTO soluciones_locales_taller
          (id, tenant_id, workshop_id, make, model, model_year, engine, dtc_code,
           failed_component, mechanic_notes, repair_steps, attached_files, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)`,
        [
          solutionId, context.tenantId, context.workshopId, dto.vehicle.brand.trim(), dto.vehicle.model.trim(),
          dto.vehicle.year, dto.vehicle.engine ?? null, code, input.failed_component.trim(), input.mechanic_notes.trim(),
          JSON.stringify([input.mechanic_notes.trim()]), JSON.stringify(input.attached_files ?? []), context.actorId,
        ],
      );

      if (dto.payload.diagnostic_session_id) {
        const session = await client.query(
          `SELECT 1 FROM diagnostic_sessions s JOIN diagnostic_codes c ON c.session_id=s.id
           JOIN vehicles v ON v.id=s.vehicle_id
           WHERE s.id=$1 AND s.tenant_id=$2 AND s.workshop_id=$3 AND c.code=$4
           AND upper(v.make)=upper($5) AND upper(v.model)=upper($6)
           AND (v.model_year IS NULL OR v.model_year=$7)
           AND (v.engine IS NULL OR upper(v.engine)=upper($8))`,
          [dto.payload.diagnostic_session_id, context.tenantId, context.workshopId, code, dto.vehicle.brand, dto.vehicle.model, dto.vehicle.year, dto.vehicle.engine ?? null],
        );
        if (!session.rowCount) throw new NotFoundException('Diagnostic session not found');
        await client.query(
          `INSERT INTO diagnostic_feedback
            (id, tenant_id, workshop_id, diagnostic_session_id, dtc_code, mechanic_id, useful, local_solution_id, manual_solution_saved)
           VALUES ($1,$2,$3,$4,$5,$6,false,$7,true)
           ON CONFLICT (diagnostic_session_id, dtc_code, mechanic_id)
           DO UPDATE SET useful=false, local_solution_id=EXCLUDED.local_solution_id, manual_solution_saved=true, updated_at=now()`,
          [randomUUID(), context.tenantId, context.workshopId, dto.payload.diagnostic_session_id, code, context.actorId, solutionId],
        );
      }

      await client.query(
        `INSERT INTO outbox_events (id, tenant_id, workshop_id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
         VALUES ($1,$2,$3,'WORKSHOP_LOCAL_SOLUTION',$4,'LOCAL_SOLUTION_VERIFIED',$5::jsonb,now())`,
        [randomUUID(), context.tenantId, context.workshopId, solutionId, JSON.stringify({ code, make: dto.vehicle.brand, model: dto.vehicle.model, year: dto.vehicle.year })],
      );
    });

    return this.localResponse({
      id: solutionId,
      dtc_code: code,
      failed_component: input.failed_component,
      mechanic_notes: input.mechanic_notes,
      repair_steps: [input.mechanic_notes],
      attached_files: input.attached_files ?? [],
    });
  }

  private localResponse(solution: LocalSolution) {
    return {
      data_source: 'Base de Datos Taller',
      diagnostic_result: {
        definition: `${solution.dtc_code}: solución real verificada por el taller.`,
        causes: [`Componente confirmado: ${solution.failed_component}`],
        solution: solution.repair_steps.length ? solution.repair_steps : [solution.mechanic_notes],
      },
      ui_actions: { show_override_button: true, prompt_validation: true },
    };
  }
}
