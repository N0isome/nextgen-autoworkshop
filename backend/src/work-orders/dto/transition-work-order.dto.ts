import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { WorkOrderStatus } from '../work-orders.types';

export class TransitionWorkOrderDto {
  @IsIn(['RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS', 'QUALITY_CHECK', 'READY_FOR_DELIVERY', 'CLOSED', 'ON_HOLD', 'CANCELLED'])
  toStatus!: WorkOrderStatus;

  @IsOptional()
  @IsString()
  @Length(3, 1000)
  reason?: string;

  @IsOptional()
  @IsString()
  @Length(3, 4000)
  completedWork?: string;

  @IsOptional()
  @IsString()
  @Length(3, 2000)
  deliveryNotes?: string;
}
