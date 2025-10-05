export type ElevationBand = "above_treeline" | "treeline" | "below_treeline";
export type DangerLevel = "low" | "moderate" | "considerable" | "high" | "extreme";
export interface ForecastJSON {
  dateIssued: string;
  region: string;
  dangerRatings: Record<ElevationBand, DangerLevel>;
  problems: Array<{ type: string; likelihood: string; size: string; where: ElevationBand[]; }>;
  summary: string;
}
export interface Manifest {
  region: string;
  run_time_utc: string;
  version: string;
  artifacts: {
    forecast_json: string;
    summary_json: string;
    tiles_base: string;
    station_parquet?: string;
    quicklook_png?: string;
  };
}

export type AvalancheObservation = {
  id?: string | number;
  region?: string;
  date?: string;
  location?: string;
  elevationBand?: ElevationBand | string;
  type?: string;
  size?: string;
  notes?: string;
  [key: string]: unknown;
};

export type WeatherStationRow = Record<string, string | number | null>;

export type TimeseriesPayload = {
  x: string[];
  series: Array<{
    name: string;
    values: number[];
    type?: 'line' | 'bar';
    yAxis?: 'y' | 'y2' | 'y3';
  }>;
};

export type ModelTablePayload = {
  title?: string;
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  metadata?: Record<string, unknown>;
};

export interface RegionBundleJSON {
  region: string;
  run_time_utc?: string;
  version?: string;
  tiles_base?: string;
  quicklook_png?: string;
  forecast?: ForecastJSON;
  summary?: Record<string, unknown>;
  weatherStations?: WeatherStationRow[];
  avalanches?: AvalancheObservation[];
  timeseries?: TimeseriesPayload;
  modelTable?: ModelTablePayload;
}
