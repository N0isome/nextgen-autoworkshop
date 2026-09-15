import { Module } from '@nestjs/common';
import { DevelopmentAuthGuard } from '../common/request-context';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';

@Module({ controllers: [ServicesController], providers: [ServicesService, DevelopmentAuthGuard] })
export class ServicesModule {}
