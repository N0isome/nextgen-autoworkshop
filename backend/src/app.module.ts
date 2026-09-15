import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { CustomersModule } from './customers/customers.module';
import { DocumentsModule } from './documents/documents.module';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { HealthController } from './health.controller';
import { ReceptionsModule } from './receptions/receptions.module';
import { SetupModule } from './setup/setup.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { ServicesModule } from './services/services.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, DocumentsModule, WorkOrdersModule, ServicesModule, DiagnosticsModule, CustomersModule, VehiclesModule, ReceptionsModule, SetupModule],
  controllers: [HealthController],
})
export class AppModule {}
