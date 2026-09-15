import { Module } from '@nestjs/common';
import { DevelopmentAuthGuard } from '../common/request-context';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
@Module({ controllers: [VehiclesController], providers: [VehiclesService, DevelopmentAuthGuard] })
export class VehiclesModule {}
