import { Module } from '@nestjs/common';
import { DevelopmentAuthGuard } from '../common/request-context';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
@Module({ controllers: [CustomersController], providers: [CustomersService, DevelopmentAuthGuard] })
export class CustomersModule {}
