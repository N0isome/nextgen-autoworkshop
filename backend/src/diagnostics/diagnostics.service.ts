import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';
import { CreateDiagnosticSessionDto } from './dto/create-diagnostic-session.dto';
import { AnalyzeDtcDto } from './dto/analyze-dtc.dto';
import { DiagnosticsKnowledgeService } from './diagnostics-knowledge.service';
import { OfficialTechnicalSourcesService, TechnicalReference } from './official-technical-sources.service';

@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly knowledge: DiagnosticsKnowledgeService,
    private readonly officialSources: OfficialTechnicalSourcesService,
  ) {}

  async analyze(context: RequestContext, dto: AnalyzeDtcDto) {
    const code = dto.diagnostics.dtc_code.toUpperCase();
    const knowledge = await this.database.query<{
      title: string; description: string; severity: string;
      generic_causes: string[]; recommended_checks: string[];
    }>('SELECT title, description, severity, generic_causes, recommended_checks FROM dtc_knowledge WHERE code = $1', [code]);

    const row = knowledge.rows[0];
    const documents = await this.database.query<{
      title: string; document_type: string; source_url: string; publisher: string;
    }>(`SELECT title, document_type, source_url, publisher FROM public_technical_documents
       WHERE tenant_id=$1 AND workshop_id=$2
         AND (make IS NULL OR make=$3) AND (model IS NULL OR model=$4)
         AND (year_from IS NULL OR year_from <= $5) AND (year_to IS NULL OR year_to >= $5)
         AND (jsonb_array_length(dtc_codes)=0 OR dtc_codes @> to_jsonb(ARRAY[$6]::text[]))
       ORDER BY created_at DESC LIMIT 10`, [context.tenantId, context.workshopId, dto.vehicle.brand.toUpperCase(), dto.vehicle.model.toUpperCase(), dto.vehicle.year, code]);

    const referenceType: Record<string, string> = {
      SERVICE_BULLETIN: 'TSB', OWNER_MANUAL: 'Manual de Taller', RECALL: 'Artículo Web', PUBLICATION: 'Artículo Web',
    };
    const vehicleName = `${dto.vehicle.brand} ${dto.vehicle.model} ${dto.vehicle.year}${dto.vehicle.engine ? ` ${dto.vehicle.engine}` : ''}`;
    const automaticReferences = await this.officialSources.findForCodes({
      make: dto.vehicle.brand,
      model: dto.vehicle.model,
      modelYear: dto.vehicle.year,
      engine: dto.vehicle.engine,
    }, [code]);
    const localReferences: TechnicalReference[] = documents.rows.map((doc) => ({
      title: doc.title,
      type: (referenceType[doc.document_type] ?? 'Artículo Web') as TechnicalReference['type'],
      search_query_suggestion: doc.source_url,
    }));

    return {
      error_definition: row ? `${row.title}. ${row.description}` : `${code}: definición específica no disponible en el catálogo local para ${vehicleName}. Validar en documentación oficial del fabricante.`,
      possible_causes: row?.generic_causes ?? ['Información específica pendiente de documentación OEM pública o proveedor técnico licenciado.'],
      diagnostic_steps: row?.recommended_checks ?? ['Confirmar el código y guardar freeze frame.', 'Consultar el procedimiento OEM aplicable al vehículo.', 'Realizar pruebas eléctricas o mecánicas antes de reemplazar componentes.'],
      technical_references: [...localReferences, ...(automaticReferences[code] ?? [])],
      severity_level: row?.severity === 'critical' ? 'Peligro Crítico' : row?.severity === 'warning' ? 'Media' : 'Baja',
    };
  }

  async createSession(context: RequestContext, dto: CreateDiagnosticSessionDto) {
    const saved = await this.database.transaction(async (client) => {
      if (dto.workOrderId) {
        const order = await client.query(
          'SELECT status FROM work_orders WHERE id=$1 AND vehicle_id=$2 AND tenant_id=$3 AND workshop_id=$4 FOR UPDATE',
          [dto.workOrderId, dto.vehicleId, context.tenantId, context.workshopId],
        );
        if (!order.rowCount) throw new NotFoundException('La orden no corresponde a este vehículo.');
        if (['CLOSED', 'CANCELLED'].includes(order.rows[0].status)) throw new ConflictException('La orden está cerrada o cancelada.');
      }
      const vehicle = await client.query(
        'SELECT id, make, model, model_year, engine, vin FROM vehicles WHERE id = $1 AND tenant_id = $2 AND workshop_id = $3',
        [dto.vehicleId, context.tenantId, context.workshopId],
      );
      if (!vehicle.rowCount) throw new NotFoundException('Vehicle not found');
      const sessionId = randomUUID();
      await client.query(
        `INSERT INTO diagnostic_sessions (id, tenant_id, workshop_id, vehicle_id, source, scanner_model, raw_payload, scanned_by, work_order_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
        [sessionId, context.tenantId, context.workshopId, dto.vehicleId, dto.source, dto.scannerModel ?? null, dto.rawPayload ? JSON.stringify({ raw: dto.rawPayload }) : '{}', context.actorId, dto.workOrderId ?? null],
      );
      const codes = [...new Set(dto.dtcCodes.map((code) => code.trim().toUpperCase()))];
      for (const code of codes) {
        await client.query('INSERT INTO diagnostic_codes (session_id, code) VALUES ($1,$2)', [sessionId, code]);
      }
      const enrichment = await client.query(
        `SELECT dc.code, COALESCE(k.title, 'Código no disponible en catálogo local') AS title,
                k.description, k.severity, k.generic_causes, k.recommended_checks
           FROM diagnostic_codes dc
           LEFT JOIN dtc_knowledge k ON k.code = dc.code
          WHERE dc.session_id = $1 ORDER BY dc.code`, [sessionId],
      );
      return { sessionId, workOrderId: dto.workOrderId ?? null, vehicle: vehicle.rows[0], codes: enrichment.rows };
    });

    return this.enrichSession(context, saved);
  }

  async getSession(context: RequestContext, sessionId: string) {
    const session = await this.database.query(
      `SELECT s.id, s.work_order_id, s.vehicle_id FROM diagnostic_sessions s
       WHERE s.id=$1 AND s.tenant_id=$2 AND s.workshop_id=$3`,
      [sessionId, context.tenantId, context.workshopId],
    );
    if (!session.rowCount) throw new NotFoundException('Escaneo no encontrado.');
    const vehicle = await this.database.query<{ id: string; make: string; model: string; model_year?: number; engine?: string }>('SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 AND workshop_id=$3',
      [session.rows[0].vehicle_id, context.tenantId, context.workshopId]);
    const codes = await this.database.query<{ code: string; [key: string]: unknown }>(
      `SELECT c.code, COALESCE(k.title, 'Código no disponible en catálogo local') AS title,
        k.description, k.severity, k.generic_causes, k.recommended_checks,
        CASE WHEN f.id IS NULL THEN NULL ELSE jsonb_build_object('useful', f.useful, 'manual_solution_saved', f.manual_solution_saved) END AS feedback
       FROM diagnostic_codes c LEFT JOIN dtc_knowledge k ON k.code=c.code
       LEFT JOIN LATERAL (SELECT df.* FROM diagnostic_feedback df
         WHERE df.diagnostic_session_id=c.session_id AND df.dtc_code=c.code
         AND df.tenant_id=$2 AND df.workshop_id=$3 ORDER BY df.updated_at DESC, df.id DESC LIMIT 1) f ON true
       WHERE c.session_id=$1 ORDER BY c.code`, [sessionId, context.tenantId, context.workshopId]);
    return this.enrichSession(context, { sessionId, workOrderId: session.rows[0].work_order_id, vehicle: vehicle.rows[0], codes: codes.rows });
  }

  private async enrichSession(context: RequestContext, saved: {
    sessionId: string; workOrderId: string | null;
    vehicle: { id: string; make: string; model: string; model_year?: number; engine?: string };
    codes: Array<{ code: string; [key: string]: unknown }>;
  }) {

    const codeValues = saved.codes.map((item) => item.code);

    // The workshop's verified experience is deliberately queried before any
    // external provider. This ordering is part of the diagnostic contract.
    const localSolutions = await this.knowledge.findBestForCodes(context, saved.vehicle, codeValues);
    const [references, storedReferences] = await Promise.all([
      this.officialSources.findForCodes({
        make: saved.vehicle.make,
        model: saved.vehicle.model,
        modelYear: saved.vehicle.model_year,
        engine: saved.vehicle.engine,
      }, codeValues),
      this.findStoredReferences(context, saved.vehicle, codeValues),
    ]);

    return {
      ...saved,
      codes: saved.codes.map((item) => {
        const local = localSolutions[item.code];
        const technicalReferences = this.deduplicateReferences([
          ...(storedReferences[item.code] ?? []),
          ...(references[item.code] ?? []),
        ]);
        if (!local) return {
          ...item,
          data_source: 'IA Genérica / Web',
          technical_references: technicalReferences,
          ui_actions: { show_override_button: true, prompt_validation: true },
        };
        return {
          ...item,
          title: `${local.failed_component} — solución verificada por el taller`,
          description: local.mechanic_notes,
          generic_causes: [`Componente confirmado: ${local.failed_component}`],
          recommended_checks: local.repair_steps.length ? local.repair_steps : [local.mechanic_notes],
          attached_files: local.attached_files,
          local_solution_id: local.id,
          data_source: 'Base de Datos Taller',
          technical_references: technicalReferences,
          ui_actions: { show_override_button: true, prompt_validation: true },
        };
      }),
      providerStatus: 'workshop-first-and-automatic-public-sources',
    };
  }

  private async findStoredReferences(
    context: RequestContext,
    vehicle: { make: string; model: string; model_year?: number | null },
    codes: string[],
  ): Promise<Record<string, TechnicalReference[]>> {
    if (!codes.length) return {};
    const documents = await this.database.query<{
      title: string;
      document_type: string;
      source_url: string;
      dtc_codes: string[];
    }>(
      `SELECT title, document_type, source_url, dtc_codes
         FROM public_technical_documents
        WHERE tenant_id=$1 AND workshop_id=$2 AND public_access_confirmed=true
          AND (make IS NULL OR upper(make)=upper($3))
          AND (model IS NULL OR upper(model)=upper($4))
          AND (year_from IS NULL OR year_from <= $5)
          AND (year_to IS NULL OR year_to >= $5)
          AND (jsonb_array_length(dtc_codes)=0 OR dtc_codes ?| $6::text[])
        ORDER BY created_at DESC
        LIMIT 30`,
      [context.tenantId, context.workshopId, vehicle.make, vehicle.model, vehicle.model_year ?? null, codes],
    );
    const typeMap: Record<string, TechnicalReference['type']> = {
      SERVICE_BULLETIN: 'TSB',
      OWNER_MANUAL: 'Manual de Taller',
      RECALL: 'Artículo Web',
      PUBLICATION: 'Artículo Web',
    };
    return Object.fromEntries(codes.map((code) => [
      code,
      documents.rows
        .filter((document) => !document.dtc_codes.length || document.dtc_codes.includes(code))
        .map((document) => ({
          title: document.title,
          type: typeMap[document.document_type] ?? 'Artículo Web',
          search_query_suggestion: document.source_url,
        })),
    ]));
  }

  private deduplicateReferences(references: TechnicalReference[]): TechnicalReference[] {
    const seen = new Set<string>();
    return references.filter((reference) => {
      const key = reference.search_query_suggestion.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async history(context: RequestContext, vehicleId: string) {
    const result = await this.database.query(
      `SELECT s.id, s.work_order_id, s.source, s.scanner_model, s.scanned_at, array_agg(c.code ORDER BY c.code) AS codes
         FROM diagnostic_sessions s JOIN diagnostic_codes c ON c.session_id = s.id
        WHERE s.vehicle_id = $1 AND s.tenant_id = $2 AND s.workshop_id = $3
        GROUP BY s.id ORDER BY s.scanned_at DESC`, [vehicleId, context.tenantId, context.workshopId],
    );
    return result.rows;
  }
}
