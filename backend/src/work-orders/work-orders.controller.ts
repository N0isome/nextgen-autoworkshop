import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { pageOffset } from '../common/pagination';
import { WorkshopOverviewService } from './workshop-overview.service';
import { Request } from 'express';
import { DevelopmentAuthGuard } from '../common/request-context';
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { TransitionWorkOrderDto } from './dto/transition-work-order.dto';
import { WorkOrdersService } from './work-orders.service';

@Controller('work-orders')
@UseGuards(DevelopmentAuthGuard)
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService, private readonly overviewService: WorkshopOverviewService) {}

  @Post()
  create(@Req() request: Request, @Body() dto: CreateWorkOrderDto) {
    return this.workOrders.create(request.context!, dto);
  }

  @Get()
  list(@Req() request: Request, @Query('offset') offset?: string) {
    return this.workOrders.list(request.context!, pageOffset(offset));
  }

  @Get('overview')
  overview(@Req() request: Request, @Query('from') from?: string, @Query('to') to?: string) {
    return this.overviewService.overview(request.context!, from, to);
  }

  @Get(':id')
  findOne(@Req() request: Request, @Param('id') id: string) {
    return this.workOrders.findOne(request.context!, id);
  }

  @Post(':id/transitions')
  transition(@Req() request: Request, @Param('id') id: string, @Body() dto: TransitionWorkOrderDto) {
    return this.workOrders.transition(request.context!, id, dto);
  }

  @Post(':id/public-link')
  publicLink(@Req() request: Request, @Param('id') id: string) {
    return this.workOrders.getPublicLink(request.context!, id);
  }
}
