import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { DevelopmentAuthGuard } from '../common/request-context';
import { CreateReceptionDto } from './dto/create-reception.dto';
import { ReceptionsService } from './receptions.service';
@Controller('receptions') @UseGuards(DevelopmentAuthGuard)
export class ReceptionsController { constructor(private readonly receptions: ReceptionsService) {} @Post() create(@Req() request: Request, @Body() dto: CreateReceptionDto) { return this.receptions.create(request.context!, dto); } }
