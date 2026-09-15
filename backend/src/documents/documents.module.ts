import { Module } from '@nestjs/common'; import { DevelopmentAuthGuard } from '../common/request-context'; import { DocumentsController } from './documents.controller'; import { DocumentsService } from './documents.service';
@Module({controllers:[DocumentsController],providers:[DocumentsService,DevelopmentAuthGuard]}) export class DocumentsModule {}
