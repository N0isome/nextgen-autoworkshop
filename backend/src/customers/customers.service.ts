import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RequestContext } from '../common/request-context';
import { DatabaseService } from '../database/database.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly database: DatabaseService) {}

  async create(context: RequestContext, dto: CreateCustomerDto) {
    const result = await this.database.query(
      `INSERT INTO customers (id, tenant_id, workshop_id, display_name, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [randomUUID(), context.tenantId, context.workshopId, dto.displayName.trim(), dto.email?.toLowerCase() ?? null, dto.phone ?? null],
    );
    return result.rows[0];
  }

  async list(context: RequestContext, offset = 0) {
    const result = await this.database.query(
      `SELECT id, display_name, email, phone, created_at FROM customers
       WHERE tenant_id = $1 AND workshop_id = $2 AND deleted_at IS NULL ORDER BY display_name, id LIMIT 100 OFFSET $3`,
      [context.tenantId, context.workshopId, offset],
    );
    return result.rows;
  }

  async findOne(context: RequestContext, id: string) {
    const result = await this.database.query(
      `SELECT id, display_name, email, phone, created_at FROM customers
       WHERE id = $1 AND tenant_id = $2 AND workshop_id = $3 AND deleted_at IS NULL`,
      [id, context.tenantId, context.workshopId],
    );
    if (!result.rowCount) throw new NotFoundException('Customer not found');
    return result.rows[0];
  }
}
