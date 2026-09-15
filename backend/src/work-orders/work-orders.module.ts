import { Module } from '@nestjs/common';
import { DevelopmentAuthGuard } from '../common/request-context';
import { WorkOrdersController } from './work-orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { WorkOrdersService } from './work-orders.service';
import { WorkshopOverviewService } from './workshop-overview.service';

@Module({ controllers: [WorkOrdersController, PublicOrdersController], providers: [WorkOrdersService, WorkshopOverviewService, DevelopmentAuthGuard] })
export class WorkOrdersModule {}
