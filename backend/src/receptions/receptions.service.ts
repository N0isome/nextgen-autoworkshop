import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';
import { CreateReceptionDto } from './dto/create-reception.dto';

@Injectable()
export class ReceptionsService {
  constructor(private readonly database: DatabaseService) {}
  async create(context: RequestContext, dto: CreateReceptionDto) {
    return this.database.transaction(async (client) => {
      const vehicle = await client.query('SELECT id FROM vehicles WHERE id=$1 AND customer_id=$2 AND tenant_id=$3 AND workshop_id=$4', [dto.vehicleId, dto.customerId, context.tenantId, context.workshopId]);
      if (!vehicle.rowCount) throw new NotFoundException('Vehicle does not belong to this customer');
      const workOrderId = randomUUID(); const receptionId = randomUUID(); const eventId = randomUUID(); const occurredAt = new Date().toISOString();
      await client.query(`INSERT INTO work_orders (id,tenant_id,workshop_id,customer_id,vehicle_id,concern,status,public_tracking_token) VALUES ($1,$2,$3,$4,$5,$6,'RECEIVED',$7)`, [workOrderId, context.tenantId, context.workshopId, dto.customerId, dto.vehicleId, dto.concern, randomBytes(24).toString('base64url')]);
      await client.query(`INSERT INTO vehicle_receptions (id,tenant_id,workshop_id,work_order_id,odometer_km,fuel_level_percent,exterior_condition,received_by,bay_label,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [receptionId, context.tenantId, context.workshopId, workOrderId, dto.odometerKm, dto.fuelLevelPercent, dto.exteriorCondition ?? null, context.actorId, dto.bayLabel?.trim() || null, dto.notes ?? null]);
      const payload = { receptionId, workOrderId, vehicleId: dto.vehicleId, odometerKm: dto.odometerKm, fuelLevelPercent: dto.fuelLevelPercent };
      const previous = await client.query<{ event_hash: string }>('SELECT event_hash FROM audit_events WHERE tenant_id=$1 ORDER BY occurred_at DESC LIMIT 1', [context.tenantId]);
      const previousHash = previous.rows[0]?.event_hash ?? createHash('sha256').update('GENESIS').digest('hex');
      const eventHash = createHash('sha256').update([previousHash,eventId,'Vehicle.Received.v1',workOrderId,occurredAt,JSON.stringify(payload)].join('|')).digest('hex');
      await client.query(`INSERT INTO audit_events (id,tenant_id,workshop_id,aggregate_type,aggregate_id,event_type,actor_id,device_id,occurred_at,payload,previous_hash,event_hash) VALUES ($1,$2,$3,'work_order',$4,'Vehicle.Received.v1',$5,$6,$7,$8::jsonb,$9,$10)`, [eventId,context.tenantId,context.workshopId,workOrderId,context.actorId,context.deviceId,occurredAt,JSON.stringify(payload),previousHash,eventHash]);
      await client.query(`INSERT INTO outbox_events (id,tenant_id,workshop_id,aggregate_type,aggregate_id,event_type,payload,occurred_at) VALUES ($1,$2,$3,'work_order',$4,'Vehicle.Received.v1',$5::jsonb,$6)`, [eventId,context.tenantId,context.workshopId,workOrderId,JSON.stringify(payload),occurredAt]);
      return { receptionId, workOrderId, status: 'RECEIVED' };
    });
  }
}
