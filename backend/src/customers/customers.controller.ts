import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { pageOffset } from '../common/pagination';
import { Request } from 'express';
import { DevelopmentAuthGuard } from '../common/request-context';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Controller('customers')
@UseGuards(DevelopmentAuthGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Post() create(@Req() request: Request, @Body() dto: CreateCustomerDto) { return this.customers.create(request.context!, dto); }
  @Get() list(@Req() request: Request, @Query('offset') offset?: string) { return this.customers.list(request.context!, pageOffset(offset)); }
  @Get(':id') findOne(@Req() request: Request, @Param('id') id: string) { return this.customers.findOne(request.context!, id); }
}
