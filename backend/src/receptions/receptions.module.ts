import { Module } from '@nestjs/common';
import { DevelopmentAuthGuard } from '../common/request-context';
import { ReceptionsController } from './receptions.controller';
import { ReceptionsService } from './receptions.service';
@Module({ controllers: [ReceptionsController], providers: [ReceptionsService, DevelopmentAuthGuard] }) export class ReceptionsModule {}
