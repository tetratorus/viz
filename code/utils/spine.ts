import { JsonObject } from "@/types/json";

/**
 * Helpers for sg-urban-spine Gold layers served by `spine serve` (OGC API Features).
 * See https://github.com/tetratorus/sg-urban-spine (spec/LAYERS.md, views section).
 */
export const SPINE_BASELINE_SCENARIO = "baseline";
export const SPINE_COLLECTION_KEY = "spine-collection";
export const SPINE_LIMIT_KEY = "spine-limit";
export const SPINE_SCENARIO_OPTION_ID = "spine-scenario";

/**
 * Builds the OGC API Features items URL for a spine collection in a scenario.
 *
 * @param {string} spineUrl Base URL of `spine serve` or the Viz-Backend-Agent `/spine` proxy.
 * @param {string} collectionId Spine collection id, e.g. `gold.example.plot_capacity.plot_capacity`.
 * @param {string} scenario Spine scenario (branch) name.
 * @param {number} limit Optional maximum number of features.
 */
export function buildSpineItemsUrl(
  spineUrl: string,
  collectionId: string,
  scenario: string,
  limit?: number
): string {
  const base: string = spineUrl.replace(/\/+$/, "");
  const params: URLSearchParams = new URLSearchParams({
    scenario: scenario || SPINE_BASELINE_SCENARIO,
  });
  if (limit) {
    params.set("limit", limit.toString());
  }
  return `${base}/collections/${encodeURIComponent(collectionId)}/items?${params.toString()}`;
}

/**
 * Returns a copy of the map data settings where every source declaring a
 * `spine-collection` becomes a plain GeoJSON source pointing at the spine
 * items endpoint for the given scenario. All other sources (e.g. KG-backed
 * GeoServer layers) are returned untouched.
 *
 * @param {T} data Parsed map data settings (a data.json object or an array of them).
 * @param {string} spineUrl Base URL of `spine serve` or its proxy.
 * @param {string} scenario Spine scenario (branch) name.
 */
export function resolveSpineSources<T>(data: T, spineUrl: string, scenario: string): T {
  if (Array.isArray(data)) {
    return data.map((item) => resolveSpineSources(item, spineUrl, scenario)) as T;
  }
  if (data === null || typeof data !== "object") {
    return data;
  }
  const resolved: JsonObject = {};
  for (const [key, value] of Object.entries(data as JsonObject)) {
    resolved[key] = resolveSpineSources(value, spineUrl, scenario);
  }
  const collectionId = resolved[SPINE_COLLECTION_KEY];
  if (typeof collectionId === "string") {
    const limit = resolved[SPINE_LIMIT_KEY];
    resolved["type"] = "geojson";
    resolved["data"] = buildSpineItemsUrl(
      spineUrl,
      collectionId,
      scenario,
      typeof limit === "number" ? limit : undefined
    );
    delete resolved[SPINE_COLLECTION_KEY];
    delete resolved[SPINE_LIMIT_KEY];
  }
  return resolved as T;
}

/**
 * Fetches the scenario names known to the spine, baseline first.
 *
 * @param {string} spineUrl Base URL of `spine serve` or its proxy.
 */
export async function getSpineScenarios(spineUrl: string): Promise<string[]> {
  try {
    const res: Response = await fetch(`${spineUrl.replace(/\/+$/, "")}/scenarios`, {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error(`spine returned ${res.status}`);
    }
    const body: { scenarios?: string[] } = await res.json();
    const others: string[] = (body.scenarios ?? []).filter(
      (scenario) => scenario !== SPINE_BASELINE_SCENARIO
    );
    return [SPINE_BASELINE_SCENARIO, ...others];
  } catch (error) {
    console.error("Error fetching spine scenarios:", error);
    return [SPINE_BASELINE_SCENARIO];
  }
}
