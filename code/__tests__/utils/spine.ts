import {
    buildSpineItemsUrl,
    getSpineScenarios,
    resolveSpineSources,
} from '@/utils/spine';

describe('spine utils', () => {
    const spineUrl = 'http://localhost:3838/vis-backend-agent/spine/';
    const gold = 'gold.example.plot_capacity.plot_capacity';

    afterEach(() => {
        jest.resetAllMocks();
    });

    it('builds the OGC API Features items URL with the scenario', () => {
        expect(buildSpineItemsUrl(spineUrl, gold, 'rezone_p1')).toEqual(
            `http://localhost:3838/vis-backend-agent/spine/collections/${gold}/items?scenario=rezone_p1`);
        expect(buildSpineItemsUrl('http://localhost:8090', gold, '', 500)).toEqual(
            `http://localhost:8090/collections/${gold}/items?scenario=baseline&limit=500`);
    });

    it('turns spine sources into geojson sources and keeps KG sources untouched', () => {
        const kgSource = { id: 'kg-source', type: 'vector', tiles: ['https://geoserver/wms?layers=twa:buildings'] };
        const data = [{
            name: 'Singapore',
            stack: 'https://stack.example/',
            groups: [
                { name: 'KG buildings', sources: [kgSource], layers: [{ id: 'kg-layer', source: 'kg-source' }] },
                {
                    name: 'Spine Gold',
                    sources: [{ id: 'gfa', 'spine-collection': gold, 'spine-limit': 100 }],
                    layers: [{ id: 'gfa-layer', source: 'gfa', type: 'fill' }],
                },
            ],
        }];

        const resolved = resolveSpineSources(data, spineUrl, 'rezone_p1');

        expect(resolved[0].groups[0].sources[0]).toEqual(kgSource);
        expect(resolved[0].groups[1].sources[0]).toEqual({
            id: 'gfa',
            type: 'geojson',
            data: `http://localhost:3838/vis-backend-agent/spine/collections/${gold}/items?scenario=rezone_p1&limit=100`,
        });
        expect(resolved[0].groups[1].layers).toEqual(data[0].groups[1].layers);
        // Original settings are not mutated so switching scenario can re-resolve them
        expect(data[0].groups[1].sources[0]).toHaveProperty('spine-collection', gold);
    });

    it('fetches spine scenarios with baseline first', async () => {
        global.fetch = jest.fn().mockResolvedValueOnce({
            ok: true,
            json: jest.fn().mockResolvedValueOnce({ scenarios: ['rezone_p1', 'baseline', 'heat_2045'] }),
        });

        const result = await getSpineScenarios(spineUrl);

        expect(global.fetch).toHaveBeenCalledWith('http://localhost:3838/vis-backend-agent/spine/scenarios', {
            cache: 'no-store',
            credentials: 'same-origin',
        });
        expect(result).toEqual(['baseline', 'rezone_p1', 'heat_2045']);
    });

    it('falls back to baseline when the spine is unreachable', async () => {
        global.fetch = jest.fn().mockRejectedValueOnce(new Error('Network error'));
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

        expect(await getSpineScenarios(spineUrl)).toEqual(['baseline']);
        consoleSpy.mockRestore();
    });
});
