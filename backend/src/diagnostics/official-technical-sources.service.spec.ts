import { OfficialTechnicalSourcesService } from './official-technical-sources.service';

describe('OfficialTechnicalSourcesService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds official Toyota and public NHTSA references automatically', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    } as Response);
    const service = new OfficialTechnicalSourcesService();

    const result = await service.findForCodes({
      make: 'Toyota',
      model: 'Yaris',
      modelYear: 2010,
    }, ['P0300']);

    expect(result.P0300.some((reference) => reference.search_query_suggestion.includes('toyota.com/owners'))).toBe(true);
    expect(result.P0300.some((reference) => reference.search_query_suggestion === 'https://www.nhtsa.gov/vehicle')).toBe(true);
  });

  it('keeps local diagnosis available when public lookup has no internet', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('Offline'));
    const service = new OfficialTechnicalSourcesService();
    const results = await service.findForCodes({ make: 'Toyota', model: 'Yaris', modelYear: 2010 }, ['P0300']);
    expect(results.P0300.length).toBeGreaterThan(0);
    expect(results.P0300.some(r => r.search_query_suggestion === 'https://www.toyota.com/owners/warranty-owners-manuals/')).toBe(true);
    expect(results.P0300.filter(r => r.type === 'TSB')).toEqual([]);
  });
});
