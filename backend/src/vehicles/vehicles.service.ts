import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Injectable()
export class VehiclesService {
  constructor(private readonly database: DatabaseService) {}
  async create(context: RequestContext, dto: CreateVehicleDto) {
    const customer = await this.database.query('SELECT id FROM customers WHERE id=$1 AND tenant_id=$2 AND workshop_id=$3 AND deleted_at IS NULL', [dto.customerId, context.tenantId, context.workshopId]);
    if (!customer.rowCount) throw new NotFoundException('Customer not found');
    try {
      const result = await this.database.query(
        `INSERT INTO vehicles (id, tenant_id, workshop_id, customer_id, vin, plate, make, model, model_year, engine)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [randomUUID(), context.tenantId, context.workshopId, dto.customerId, dto.vin?.toUpperCase() ?? null, dto.plate?.replace(/-/g, '').toUpperCase() ?? null, dto.make.trim(), dto.model.trim(), dto.modelYear ?? null, dto.engine ?? null],
      );
      return result.rows[0];
    } catch (error: unknown) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('VIN or plate is already registered');
      throw error;
    }
  }
  async list(context: RequestContext, offset = 0) {
    const result = await this.database.query(
      `SELECT v.*, c.display_name AS customer_name FROM vehicles v JOIN customers c ON c.id=v.customer_id
       WHERE v.tenant_id=$1 AND v.workshop_id=$2 ORDER BY v.updated_at DESC, v.id LIMIT 100 OFFSET $3`, [context.tenantId, context.workshopId, offset]);
    return result.rows;
  }
  async findOne(context: RequestContext, id: string) {
    const result = await this.database.query(`SELECT * FROM vehicles WHERE id=$1 AND tenant_id=$2 AND workshop_id=$3`, [id, context.tenantId, context.workshopId]);
    if (!result.rowCount) throw new NotFoundException('Vehicle not found');
    return result.rows[0];
  }
}
