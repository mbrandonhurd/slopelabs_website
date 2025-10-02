'use client';

import { useQuery } from '@tanstack/react-query';
import { getManifest, getForecast } from '@/lib/api';
import DangerCards from '@/components/DangerCards';
import ProblemsChips from '@/components/ProblemsChips';
import dynamic from 'next/dynamic';
import WeatherTable from "@/components/WeatherTable";
import AvalancheList from "@/components/AvalancheList";

// client-only components (duckdb-wasm, maplibre)
const ModelParquetTable = dynamic(() => import('@/components/ModelParquetTable'), { ssr: false });
const MapPanel = dynamic(() => import('@/components/MapPanel'), { ssr: false });
const TimeseriesPanel = dynamic(() => import('@/components/TimeseriesPanel'), { ssr: false });

export default function RegionPage({ params }: { params: { region: string } }) {
  console.debug('[RegionPage] params =', params);

  const region = params?.region;
  if (!region) {
    console.error('[RegionPage] missing region param; refusing to render content');
    return <div className="text-sm text-red-500">Missing region slug.</div>;
  }

  // 1) Fetch manifest for this region (this hits /api/regions/:region/manifest)
  const {
    data: manifest,
    isLoading: mLoading,
    error: mError,
  } = useQuery({
    queryKey: ['manifest', region],
    queryFn: () => getManifest(region),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  // helpful debug
  console.debug('[RegionPage] manifest =', manifest);
  if (mError) console.error('[RegionPage] manifest error =', mError);

  // 2) If the (legacy) forecast URL is present, fetch forecast; otherwise skip
  const forecastUrl = manifest?.artifacts?.forecast_json;
  const {
    data: forecast,
    isLoading: fLoading,
    error: fError,
  } = useQuery({
    enabled: !!forecastUrl,
    queryKey: ['forecast', forecastUrl],
    queryFn: () => getForecast(forecastUrl!),
    staleTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });

  console.debug('[RegionPage] forecastUrl =', forecastUrl);
  if (fError) console.error('[RegionPage] forecast error =', fError);

  // 3) Loading states
  if (mLoading || fLoading) return <div>Loading…</div>;

  // 4) If manifest failed hard
  if (!manifest) {
    return <div className="text-sm text-red-500">No manifest for region: {region}</div>;
  }

  // 5) Render
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize">
          {region.replace("_", " ")} — {manifest.run_time_utc ? new Date(manifest.run_time_utc).toUTCString() : '—'}
        </h2>
        <span className="text-sm text-gray-500">version {manifest.version ?? '—'}</span>
      </div>

      {/* If we have a forecast JSON, render the forecast cards; otherwise skip gracefully */}
      {forecast ? (
        <>
          <DangerCards forecast={forecast} />
          <ProblemsChips forecast={forecast} />
        </>
      ) : (
        <div className="text-xs text-neutral-500">
          No forecast JSON for this region (using shared model data instead).
        </div>
      )}

      {/* Map + demo timeseries */}
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 lg:col-span-7">
          <MapPanel
            tilesBase={manifest.artifacts?.tiles_base}
            quicklook={manifest.artifacts?.quicklook_png}
          />
        </section>
        <section className="col-span-12 lg:col-span-5">
          <TimeseriesPanel region={region} />
        </section>
      </div>

      {/* CSV-backed tables (optional) */}
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12">
          <WeatherTable region={region} kind="model" />
        </section>
        <section className="col-span-12">
          <WeatherTable region={region} kind="station" />
        </section>
        <section className="col-span-12">
          <AvalancheList region={region} />
        </section>
      </div>

      {/* Shared-parquet model table (filters by manifest.regionColumn) */}
      <section className="col-span-12">
        <ModelParquetTable region={region} />
      </section>
    </div>
  );
}
