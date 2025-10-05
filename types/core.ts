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
export type TimeseriesSeries = {
  name: string;
  values: number[];
  type?: 'line' | 'bar';
  yAxis?: 'y' | 'y2' | 'y3';
};

export type BandSummaryTable = {
  columns: string[];
  rows: Array<Record<string, string | number | null>>;
  metadata?: Record<string, unknown>;
};

export type BandSummaryMap = Record<string, BandSummaryTable[]>;

export type StationTimeseriesEntry = {
  station_id: string;
  station_name?: string;
  x: string[];
  series: TimeseriesSeries[];
  metadata?: Record<string, unknown>;
};

export type ModelTimeseriesEntry = {
  variable: string;
  level: string;
  x: string[];
  series: TimeseriesSeries[];
  metadata?: Record<string, unknown>;
};

export type BandTimeseriesMap<T> = Record<string, T[]>;

export interface RegionSummaryFile {
  region: string;
  run_time_utc?: string;
  version?: string;
  tiles_base?: string;
  quicklook_png?: string;
  forecast?: ForecastJSON;
  summary?: Record<string, unknown>;
  avalanches?: AvalancheObservation[];
  stations?: BandSummaryMap;
  model?: BandSummaryMap;
}

export interface RegionTimeseriesFile {
  region: string;
  generated_at?: string;
  stations?: BandTimeseriesMap<StationTimeseriesEntry>;
  model?: BandTimeseriesMap<ModelTimeseriesEntry>;
}

// Legacy bundle format support
export type RegionBundleJSON = {
  region: string;
  run_time_utc?: string;
  version?: string;
  tiles_base?: string;
  quicklook_png?: string;
  forecast?: ForecastJSON;
  summary?: Record<string, unknown>;
  weatherStations?: WeatherStationRow[];
  avalanches?: AvalancheObservation[];
  timeseries?: {
    x: string[];
    series: Array<{
      name: string;
      values: number[];
      type?: 'line' | 'bar';
      yAxis?: 'y' | 'y2' | 'y3';
    }>;
  };
  modelTable?: {
    title?: string;
    columns: string[];
    rows: Array<Record<string, string | number | null>>;
    metadata?: Record<string, unknown>;
  };
};
