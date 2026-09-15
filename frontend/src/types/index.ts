export type View = 'home' | 'reception' | 'vehicles' | 'diagnostic' | 'orders' | 'customers' | 'reports' | 'settings';
export type Settings = { apiUrl: string; token: string; tenantId: string; workshopId: string; actorId: string; deviceId?: string; mechanicName?: string; workshopName?: string; bays?: string[]; theme?: 'light' | 'dark' | 'system' };
export type Customer = { id: string; display_name: string; phone?: string; email?: string };
export type Vehicle = { id: string; customer_id: string; customer_name?: string; make: string; model: string; model_year?: number; engine?: string; plate?: string; vin?: string };
export type Status = 'DRAFT' | 'RECEIVED' | 'DIAGNOSING' | 'WAITING_APPROVAL' | 'APPROVED' | 'IN_PROGRESS' | 'QUALITY_CHECK' | 'READY_FOR_DELIVERY' | 'CLOSED' | 'ON_HOLD' | 'CANCELLED';
export type WorkOrder = {
  id: string; vehicle_id: string; customer_id: string; concern: string; status: Status; version: number;
  created_at: string; updated_at: string; make: string; model: string; model_year?: number; plate?: string; vin?: string; engine?: string;
  customer_name: string; customer_phone?: string; customer_email?: string; odometer_km?: number; fuel_level_percent?: number;
  exterior_condition?: string; received_at?: string; bay_label?: string; notes?: string; dtc_count: number; critical_count: number; completed_work?: string; delivery_notes?: string; delivered_at?: string;
  timeline?: { id: string; event_type: string; occurred_at: string; actor_id: string; payload: { fromStatus?: Status; toStatus?: Status; reason?: string; completedWork?: string; deliveryNotes?: string } }[];
};
export type PublicOrderStatus = { workshop: string; vehicle: string; plate: string; stage: string; status: Status; updatedAt: string; deliveredAt?: string | null; report?: { completedWork: string; deliveryNotes?: string | null } | null };
export type Metrics = { received: number; closed: number; averageCycleHours: number | null; eligible: number; completed: number; diagnostics: number; criticalDtcs: number };
export type Overview = {
  generatedAt: string; period: { from: string; to: string; previousFrom: string }; current: Metrics; previous: Metrics;
  workflow: { status: Status; count: number; averageHours: number }[]; plant: { status: Status; count: number }[];
  sync: { pending: number; lastPublishedAt: string | null }; bays: { label: string; count: number }[];
  dailyDiagnostics: { date: string; count: number }[];
};
export type TechnicalReference = { title: string; type: string; search_query_suggestion: string };
export type DtcResult = {
  code: string; title: string; description?: string; severity?: 'info' | 'warning' | 'critical'; generic_causes?: string[]; recommended_checks?: string[];
  technical_references?: TechnicalReference[]; attached_files?: string[]; local_solution_id?: string; data_source?: string;
  feedback?: { useful: boolean; manual_solution_saved: boolean } | null;
};
export type ScanResult = { sessionId: string; workOrderId?: string | null; vehicle: Vehicle; codes: DtcResult[] };
export type ScanHistory = { id: string; work_order_id?: string | null; source: string; scanner_model?: string; scanned_at: string; codes: string[] };
export type Api = <T>(path: string, init?: RequestInit) => Promise<T>;
export type WorkshopData = { customers: Customer[]; vehicles: Vehicle[]; orders: WorkOrder[]; overview: Overview; savedAt: string };
export type ConnectionState = 'checking' | 'healthy' | 'degraded' | 'offline' | 'unconfigured';
export type HealthPayload = { status?: string; database?: string; timestamp?: string };
