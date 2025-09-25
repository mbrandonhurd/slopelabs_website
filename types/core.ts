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
