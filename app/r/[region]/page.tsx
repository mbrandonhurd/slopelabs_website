import DangerCards from '@/components/DangerCards';
import ProblemsChips from '@/components/ProblemsChips';
import dynamic from 'next/dynamic';
import WeatherTable from "@/components/WeatherTable";
import AvalancheList from "@/components/AvalancheList";
import { loadRegionBundle } from '@/lib/server/regionData';

// client-only components (duckdb-wasm, maplibre)
const ModelParquetTable = dynamic(() => import('@/components/ModelParquetTable'), { ssr: false });
const MapPanel = dynamic(() => import('@/components/MapPanel'), { ssr: false });
const TimeseriesPanel = dynamic(() => import('@/components/TimeseriesPanel'), { ssr: false });

export default async function RegionPage({ params }: { params: { region: string } }) {
  const region = params?.region;
  if (!region) {
    return <div className="text-sm text-red-500">Missing region slug.</div>;
  }

  try {
    const bundle = await loadRegionBundle(region);
    const { manifest, forecast, summary, avalanches, weatherStations, timeseries, modelTable } = bundle;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold capitalize">
            {region.replace(/_/g, ' ')} — {manifest.run_time_utc ? new Date(manifest.run_time_utc).toUTCString() : '—'}
          </h2>
          <span className="text-sm text-gray-500">version {manifest.version ?? '—'}</span>
        </div>

        {forecast ? (
          <>
            <DangerCards forecast={forecast} />
            <ProblemsChips forecast={forecast} />
          </>
        ) : (
          <div className="text-xs text-neutral-500">
            No forecast data found for this region.
          </div>
        )}

        {(forecast?.summary || summary) ? (
          <div className="card">
            <div className="card-h"><h3 className="font-medium">Summary</h3></div>
            <div className="card-c space-y-2 text-sm text-neutral-700">
              {forecast?.summary ? <p>{forecast.summary}</p> : null}
              {summary && Object.entries(summary).map(([key, value]) => (
                <p key={key}>
                  <span className="font-medium capitalize">{key}:</span>{' '}
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-12 gap-4">
          <section className="col-span-12 lg:col-span-7">
            <MapPanel
              tilesBase={manifest.artifacts?.tiles_base}
              quicklook={manifest.artifacts?.quicklook_png}
            />
          </section>
          <section className="col-span-12 lg:col-span-5">
            <TimeseriesPanel region={region} series={timeseries} />
          </section>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <section className="col-span-12 lg:col-span-7">
            <WeatherTable region={region} kind="station" initialRows={weatherStations} />
          </section>
          <section className="col-span-12 lg:col-span-5">
            <AvalancheList region={region} initialList={avalanches} />
          </section>
        </div>

        <section className="col-span-12">
          <ModelParquetTable region={region} data={modelTable} />
        </section>
      </div>
    );
  } catch (err) {
    console.error('[RegionPage] bundle load failed', err);
    return <div className="text-sm text-red-500">Unable to load data for region: {region}</div>;
  }
}
