import { Injectable, Logger } from '@nestjs/common';

export type TechnicalReferenceType = 'TSB' | 'Diagrama Eléctrico' | 'Manual de Taller' | 'Artículo Web' | 'Portal de consulta' | 'Proveedor técnico';

export type TechnicalReference = {
  title: string;
  type: TechnicalReferenceType;
  search_query_suggestion: string;
};

export type VehicleReferenceContext = {
  make: string;
  model: string;
  modelYear?: number | null;
  engine?: string | null;
};

type NhtsaRecall = {
  NHTSACampaignNumber?: string;
  Component?: string;
  Summary?: string;
  Consequence?: string;
};

type NhtsaRecallResponse = {
  results?: NhtsaRecall[];
  Results?: NhtsaRecall[];
};

@Injectable()
export class OfficialTechnicalSourcesService {
  private readonly logger = new Logger(OfficialTechnicalSourcesService.name);

  async findForCodes(vehicle: VehicleReferenceContext, codes: string[]): Promise<Record<string, TechnicalReference[]>> {
    const recalls = await this.fetchNhtsaRecalls(vehicle);
    return Object.fromEntries(codes.map((rawCode) => {
      const code = rawCode.toUpperCase();
      const references = [
        ...this.manufacturerReferences(vehicle),
        this.nhtsaCommunicationsReference(vehicle, code),
        ...this.relevantRecallReferences(recalls, code),
      ];
      return [code, this.deduplicate(references)];
    }));
  }

  private manufacturerReferences(vehicle: VehicleReferenceContext): TechnicalReference[] {
    const make = this.normalize(vehicle.make);
    if (make !== 'toyota') return [];

    // Use the verified public catalog. Do not invent a model/year URL or claim
    // that a specific manual was found when only a catalog link is available.
    const manualUrl = 'https://www.toyota.com/owners/warranty-owners-manuals/';
    const vehicleLabel = `${vehicle.modelYear ?? ''} Toyota ${vehicle.model}`.trim();

    return [
      {
        title: `Catálogo oficial Toyota — seleccionar ${vehicleLabel} (EE. UU.)`,
        type: 'Portal de consulta',
        search_query_suggestion: manualUrl,
      },
      {
        title: 'Toyota Technical Information System — documentación de reparación (puede requerir licencia)',
        type: 'Proveedor técnico',
        search_query_suggestion: 'https://techinfo.toyota.com/',
      },
    ];
  }

  private nhtsaCommunicationsReference(vehicle: VehicleReferenceContext, code: string): TechnicalReference {
    const label = `${vehicle.modelYear ?? ''} ${vehicle.make} ${vehicle.model}`.trim();
    return {
      title: `Portal NHTSA: buscar ${label} y comprobar la relación con ${code} (EE. UU.)`,
      type: 'Portal de consulta',
      search_query_suggestion: 'https://www.nhtsa.gov/vehicle',
    };
  }

  private async fetchNhtsaRecalls(vehicle: VehicleReferenceContext): Promise<NhtsaRecall[]> {
    if (!vehicle.modelYear) return [];

    const params = new URLSearchParams({
      make: vehicle.make,
      model: vehicle.model,
      modelYear: String(vehicle.modelYear),
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    try {
      const response = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?${params.toString()}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json() as NhtsaRecallResponse;
      return payload.results ?? payload.Results ?? [];
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`NHTSA lookup unavailable; continuing with local sources (${reason})`);
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  private relevantRecallReferences(recalls: NhtsaRecall[], code: string): TechnicalReference[] {
    return recalls
      .filter((recall) => this.isPotentiallyRelated(recall, code))
      .slice(0, 3)
      .map((recall) => {
        const campaign = recall.NHTSACampaignNumber ?? 'sin identificador';
        const component = recall.Component ?? 'componente no indicado';
        return {
          title: `Campaña NHTSA ${campaign} — ${component} (confirmar relación con ${code})`,
          type: 'Artículo Web' as const,
          search_query_suggestion: recall.NHTSACampaignNumber
            ? `https://api.nhtsa.gov/recalls/campaignNumber?campaignNumber=${encodeURIComponent(recall.NHTSACampaignNumber)}`
            : 'https://www.nhtsa.gov/recalls',
        };
      });
  }

  private isPotentiallyRelated(recall: NhtsaRecall, code: string): boolean {
    const text = `${recall.Component ?? ''} ${recall.Summary ?? ''} ${recall.Consequence ?? ''}`.toUpperCase();
    const prefix = code.slice(0, 3);
    const keywordsByPrefix: Record<string, string[]> = {
      P01: ['FUEL', 'AIR', 'ENGINE', 'THROTTLE', 'SENSOR'],
      P02: ['FUEL', 'INJECT', 'ENGINE', 'SENSOR'],
      P03: ['ENGINE', 'IGNITION', 'FUEL', 'POWER TRAIN'],
      P04: ['EMISSION', 'EXHAUST', 'EVAP', 'ENGINE', 'CATALYTIC'],
      P05: ['IDLE', 'SPEED', 'ENGINE', 'THROTTLE'],
      P06: ['COMPUTER', 'ELECTRICAL', 'CONTROL MODULE', 'ENGINE'],
      P07: ['POWER TRAIN', 'TRANSMISSION'],
      P08: ['POWER TRAIN', 'TRANSMISSION'],
      C00: ['STEERING', 'SUSPENSION', 'BRAKE', 'ABS'],
      B00: ['AIR BAG', 'SEAT BELT', 'BODY'],
      U00: ['ELECTRICAL', 'SOFTWARE', 'COMMUNICATION', 'CONTROL MODULE'],
    };
    const fallback = code.startsWith('P')
      ? ['ENGINE', 'POWER TRAIN', 'FUEL', 'ELECTRICAL']
      : code.startsWith('C')
        ? ['STEERING', 'SUSPENSION', 'BRAKE']
        : code.startsWith('B')
          ? ['AIR BAG', 'SEAT BELT', 'BODY']
          : ['ELECTRICAL', 'SOFTWARE', 'CONTROL MODULE'];
    return (keywordsByPrefix[prefix] ?? fallback).some((keyword) => text.includes(keyword));
  }

  private deduplicate(references: TechnicalReference[]): TechnicalReference[] {
    const seen = new Set<string>();
    return references.filter((reference) => {
      const key = `${reference.title}|${reference.search_query_suggestion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  private slug(value: string): string {
    return this.normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
