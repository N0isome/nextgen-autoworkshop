import { Controller, Get, Param } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';

/** This endpoint intentionally exposes only the status covered by an unguessable link. */
@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get(':token')
  status(@Param('token') token: string) {
    return this.workOrders.getPublicStatus(token);
  }
}
