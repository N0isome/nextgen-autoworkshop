import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports a healthy API and database with HTTP-success payload semantics', async () => {
    const controller = new HealthController({ isHealthy: jest.fn().mockResolvedValue(true) } as never);
    await expect(controller.check()).resolves.toMatchObject({ status: 'healthy', database: 'connected' });
  });

  it('reports a degraded database without turning the running API into a 503', async () => {
    const controller = new HealthController({ isHealthy: jest.fn().mockResolvedValue(false) } as never);
    await expect(controller.check()).resolves.toMatchObject({ status: 'degraded', database: 'unavailable' });
  });
});
