import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

export interface RequestContext {
  tenantId: string;
  workshopId: string;
  actorId: string;
  deviceId: string;
}

declare module 'express-serve-static-core' {
  interface Request { context?: RequestContext }
}

/** Temporary local-development boundary. Replace with OIDC validation before production. */
@Injectable()
export class DevelopmentAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (process.env.NODE_ENV === 'production') throw new UnauthorizedException('OIDC authentication is required');
    if (request.header('x-development-token') !== process.env.DEVELOPMENT_TOKEN) {
      throw new UnauthorizedException('Invalid development token');
    }
    const tenantId = request.header('x-tenant-id');
    const workshopId = request.header('x-workshop-id');
    const actorId = request.header('x-actor-id');
    const deviceId = request.header('x-device-id') ?? 'local-development-device';
    if (!tenantId || !workshopId || !actorId) throw new UnauthorizedException('Missing request context');
    request.context = { tenantId, workshopId, actorId, deviceId };
    return true;
  }
}
