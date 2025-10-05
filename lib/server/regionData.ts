import path from 'node:path';
import fs from 'node:fs/promises';
import { parse } from 'csv-parse/sync';

import type {
  AvalancheObservation,
  BandSummaryMap,
  BandTimeseriesMap,
  ForecastJSON,
  Manifest,
  ModelTimeseriesEntry,
  RegionBundleJSON,
  RegionSummaryFile,
  RegionTimeseriesFile,
  StationTimeseriesEntry,
  WeatherStationRow,
} from '@/types/core';

const DATA_ROOT = path.join(process.cwd(), 'public', 'data');
const SHARED_DIR = path.join(DATA_ROOT, 'shared');
const shouldCache = process.env.NODE_ENV === 'production';
const BANDS = ['above_treeline', 'treeline', 'below_treeline'];

type RegionBundle = {
  region: string;
  manifest: Manifest;
  forecast: ForecastJSON | null;
  summary: Record<string, unknown> | null;
  avalanches: AvalancheObservation[];
  stationSummary: BandSummaryMap;
  stationTimeseries: BandTimeseriesMap<StationTimeseriesEntry>;
  modelSummary: BandSummaryMap;
  modelTimeseries: BandTimeseriesMap<ModelTimeseriesEntry>;
};

const bundleCache = new Map<string, RegionBundle>();

function normalizeRegion(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readJsonIfPresent<T>(absPath: string | null): Promise<T | null> {
  if (!absPath) return null;
  try {
    const raw = await fs.readFile(absPath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readCsvIfPresent(absPath: string | null): Promise<WeatherStationRow[] | null> {
  if (!absPath) return null;
  try {
    const raw = await fs.readFile(absPath, 'utf-8');
    const rows = parse(raw, { columns: true, skip_empty_lines: true }) as WeatherStationRow[];
    return rows;
  } catch {
    return null;
  }
}

function resolvePublicAsset(assetPath?: string | null): string | null {
  if (!assetPath) return null;
  if (/^https?:/i.test(assetPath)) return null;
  const cleaned = assetPath.startsWith('/') ? assetPath.slice(1) : assetPath;
  return path.join(process.cwd(), 'public', cleaned);
}

function withArtifactDefaults(region: string, manifest: Partial<Manifest> | null): Manifest {
  const artifacts = manifest?.artifacts ?? ({} as Manifest['artifacts']);
  return {
    region,
    run_time_utc: manifest?.run_time_utc ?? new Date().toISOString(),
    version: manifest?.version ?? 'v0',
    artifacts: {
      forecast_json: artifacts.forecast_json ?? `/data/${region}/forecast.json`,
      summary_json: artifacts.summary_json ?? `/data/${region}/summary.json`,
      tiles_base: artifacts.tiles_base ?? 'https://tile.openstreetmap.org/',
      station_parquet: artifacts.station_parquet,
      quicklook_png: artifacts.quicklook_png,
    },
  };
}

function extractAvalancheArray(source: unknown): AvalancheObservation[] {
  if (!source) return [];
  if (Array.isArray(source)) return source as AvalancheObservation[];
  if (Array.isArray((source as any).items)) return (source as any).items as AvalancheObservation[];
  return [];
}

function ensureBandSummary(map?: BandSummaryMap): BandSummaryMap {
  const result: BandSummaryMap = {};
  if (map) {
    for (const [key, value] of Object.entries(map)) {
      result[key] = Array.isArray(value) ? value : [];
    }
  }
  for (const band of BANDS) {
    if (!result[band]) result[band] = [];
  }
  return result;
}

function ensureBandTimeseries<T>(map?: BandTimeseriesMap<T>): BandTimeseriesMap<T> {
  const result: BandTimeseriesMap<T> = {};
  if (map) {
    for (const [key, value] of Object.entries(map)) {
      result[key] = Array.isArray(value) ? value : [];
    }
  }
  for (const band of BANDS) {
    if (!result[band]) result[band] = [];
  }
  return result;
}

async function loadStructuredBundle(region: string): Promise<RegionBundle | null> {
  const summaryPath = path.join(DATA_ROOT, region, 'summary.json');
  const summaryData = await readJsonIfPresent<RegionSummaryFile>(summaryPath);
  if (!summaryData) return null;

  const timeseriesPath = path.join(DATA_ROOT, region, 'timeseries.json');
  const timeseriesData = await readJsonIfPresent<RegionTimeseriesFile>(timeseriesPath);

  const manifest = withArtifactDefaults(region, {
    run_time_utc: summaryData.run_time_utc,
    version: summaryData.version,
    artifacts: {
      forecast_json: summaryData.forecast ? `/data/${region}/summary.json` : `/data/${region}/forecast.json`,
      summary_json: `/data/${region}/summary.json`,
      tiles_base: summaryData.tiles_base ?? 'https://tile.openstreetmap.org/',
      quicklook_png: summaryData.quicklook_png,
    },
  });

  return {
    region,
    manifest,
    forecast: summaryData.forecast ?? null,
    summary: summaryData.summary ?? null,
    avalanches: summaryData.avalanches ?? [],
    stationSummary: ensureBandSummary(summaryData.stations),
    stationTimeseries: ensureBandTimeseries(timeseriesData?.stations),
    modelSummary: ensureBandSummary(summaryData.model),
    modelTimeseries: ensureBandTimeseries(timeseriesData?.model),
  };
}

async function loadBundleJson(region: string): Promise<RegionBundle | null> {
  const bundlePath = path.join(DATA_ROOT, region, 'bundle.json');
  const payload = await readJsonIfPresent<RegionBundleJSON>(bundlePath);
  if (!payload) return null;

  const manifest = withArtifactDefaults(region, {
    run_time_utc: payload.run_time_utc,
    version: payload.version,
    artifacts: {
      forecast_json: `/data/${region}/bundle.json`,
      summary_json: `/data/${region}/bundle.json`,
      tiles_base: payload.tiles_base ?? 'https://tile.openstreetmap.org/',
      quicklook_png: payload.quicklook_png,
    },
  });

  return {
    region,
    manifest,
    forecast: payload.forecast ?? null,
    summary: payload.summary ?? null,
    avalanches: payload.avalanches ?? [],
    stationSummary: ensureBandSummary(
      payload.weatherStations && payload.weatherStations.length
        ? {
            legacy: [
              {
                columns: Object.keys(payload.weatherStations[0] ?? {}),
                rows: payload.weatherStations,
                metadata: { note: 'legacy bundle rows' },
              },
            ],
          }
        : undefined
    ),
    stationTimeseries: ensureBandTimeseries(
      payload.timeseries
        ? {
            legacy: [
              {
                station_id: 'legacy',
                station_name: 'Legacy',
                x: payload.timeseries.x,
                series: payload.timeseries.series,
              },
            ],
          }
        : undefined
    ),
    modelSummary: ensureBandSummary(
      payload.modelTable
        ? {
            legacy: [
              {
                columns: payload.modelTable.columns,
                rows: payload.modelTable.rows,
                metadata: payload.modelTable.metadata,
              },
            ],
          }
        : undefined
    ),
    modelTimeseries: ensureBandTimeseries(
      payload.timeseries
        ? {
            legacy_model: [
              {
                variable: 'legacy',
                level: 'legacy',
                x: payload.timeseries.x,
                series: payload.timeseries.series,
              },
            ],
          }
        : undefined
    ),
  };
}

async function loadAvalanches(region: string): Promise<AvalancheObservation[]> {
  const want = normalizeRegion(region);
  const shared = extractAvalancheArray(await readJsonIfPresent<unknown>(path.join(SHARED_DIR, 'avalanches.json')));
  const regional = extractAvalancheArray(await readJsonIfPresent<unknown>(path.join(DATA_ROOT, region, 'avalanches.json')));
  return [...shared, ...regional].filter((entry) => normalizeRegion((entry as any)?.region) === want);
}

async function loadWeatherStations(region: string): Promise<WeatherStationRow[]> {
  const want = normalizeRegion(region);
  const candidates = [
    path.join(SHARED_DIR, 'weather_station.csv'),
    path.join(DATA_ROOT, region, 'weather_station.csv'),
  ];

  for (const abs of candidates) {
    const rows = await readCsvIfPresent(abs);
    if (!rows) continue;
    const filtered = rows.filter((row) => normalizeRegion((row as any).region) === want);
    if (filtered.length || abs.endsWith(`${region}/weather_station.csv`)) {
      return filtered;
    }
  }

  return [];
}

async function loadSummary(manifest: Manifest): Promise<Record<string, unknown> | null> {
  const abs = resolvePublicAsset(manifest.artifacts.summary_json);
  return readJsonIfPresent<Record<string, unknown>>(abs);
}

async function loadForecast(manifest: Manifest): Promise<ForecastJSON | null> {
  const abs = resolvePublicAsset(manifest.artifacts.forecast_json);
  return readJsonIfPresent<ForecastJSON>(abs);
}

async function loadManifest(region: string): Promise<Manifest> {
  const regionalPath = path.join(DATA_ROOT, region, 'manifest.json');
  const regional = await readJsonIfPresent<Manifest>(regionalPath);
  return withArtifactDefaults(region, regional);
}

export async function loadRegionBundle(regionParam: string): Promise<RegionBundle> {
  const region = regionParam.toLowerCase();
  if (shouldCache && bundleCache.has(region)) {
    return bundleCache.get(region)!;
  }

  const structured = await loadStructuredBundle(region);
  if (structured) {
    if (shouldCache) bundleCache.set(region, structured);
    return structured;
  }

  const preprocessed = await loadBundleJson(region);
  if (preprocessed) {
    if (shouldCache) bundleCache.set(region, preprocessed);
    return preprocessed;
  }

  const manifest = await loadManifest(region);
  const [forecast, summary, avalanches, weatherStations] = await Promise.all([
    loadForecast(manifest),
    loadSummary(manifest),
    loadAvalanches(region),
    loadWeatherStations(region),
  ]);

  const legacySummary = weatherStations.length
    ? ensureBandSummary({ legacy: [
        { columns: Object.keys(weatherStations[0] ?? {}), rows: weatherStations },
      ] })
    : ensureBandSummary();

  const bundle: RegionBundle = {
    region,
    manifest,
    forecast,
    summary,
    avalanches,
    stationSummary: legacySummary,
    stationTimeseries: ensureBandTimeseries(),
    modelSummary: ensureBandSummary(),
    modelTimeseries: ensureBandTimeseries(),
  };

  if (shouldCache) {
    bundleCache.set(region, bundle);
  }

  return bundle;
}

export async function listRegions(): Promise<string[]> {
  const sharedList = await readJsonIfPresent<string[]>(path.join(SHARED_DIR, 'regions.json'));
  if (sharedList?.length) return sharedList;

  try {
    const entries = await fs.readdir(DATA_ROOT, { withFileTypes: true });
    return entries.filter((dirent) => dirent.isDirectory() && dirent.name !== 'shared').map((dirent) => dirent.name);
  } catch {
    return [];
  }
}

export type { RegionBundle };
