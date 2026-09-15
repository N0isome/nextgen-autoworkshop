import { BadRequestException } from '@nestjs/common';

export function pageOffset(value?: string): number {
  if (value === undefined) return 0;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    throw new BadRequestException('offset debe ser un entero mayor o igual a cero.');
  }
  return Number(value);
}
