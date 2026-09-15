import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { pageOffset } from '../common/pagination';
import { Request } from 'express';
import { DevelopmentAuthGuard } from '../common/request-context';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { VehiclesService } from './vehicles.service';
@Controller('vehicles') @UseGuards(DevelopmentAuthGuard)
export class VehiclesController {
  constructor(private readonly vehicles: VehiclesService) {}
  @Post() create(@Req() request: Request, @Body() dto: CreateVehicleDto) { return this.vehicles.create(request.context!, dto); }
  @Get() list(@Req() request: Request, @Query('offset') offset?: string) { return this.vehicles.list(request.context!, pageOffset(offset)); }
  @Get(':id') findOne(@Req() request: Request, @Param('id') id: string) { return this.vehicles.findOne(request.context!, id); }
}
