import { Body, ConflictException, Controller, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';

class BootstrapDto { @IsString() @Length(3, 120) workshopName!: string; }

@Controller('setup')
export class SetupController {
  constructor(private readonly database: DatabaseService) {}
  @Post('bootstrap')
  async bootstrap(@Body() dto: BootstrapDto) {
    return this.database.transaction(async (client) => {
      const existing = await client.query('SELECT id FROM tenants LIMIT 1');
      if (existing.rowCount) throw new ConflictException('System is already initialized');
      const tenantId = randomUUID(); const workshopId = randomUUID(); const actorId = randomUUID();
      await client.query('INSERT INTO tenants (id, legal_name) VALUES ($1,$2)', [tenantId, dto.workshopName.trim()]);
      await client.query('INSERT INTO workshops (id, tenant_id, name) VALUES ($1,$2,$3)', [workshopId, tenantId, dto.workshopName.trim()]);
      return { tenantId, workshopId, actorId, message: 'Save these IDs only in local development settings. OIDC will replace them in production.' };
    });
  }
}
