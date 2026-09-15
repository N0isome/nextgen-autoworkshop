import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from './database/database.service';

@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check() {
    const database = await this.database.isHealthy();
    // The HTTP server is still available when PostgreSQL is not. Returning 200 here
    // lets local clients distinguish a limited workshop from an unreachable API.
    return {
      status: database ? 'healthy' : 'degraded',
      database: database ? 'connected' : 'unavailable',
      timestamp: new Date().toISOString(),
    };
  }
}
