import DangerCards from '@/components/DangerCards';
import ProblemsChips from '@/components/ProblemsChips';
import dynamic from 'next/dynamic';
import WeatherTable from "@/components/WeatherTable";
import AvalancheList from "@/components/AvalancheList";
import { loadRegionBundle } from '@/lib/server/regionData';

const MapPanel = dynamic(() => import('@/components/MapPanel'), { ssr: false });
const TimeseriesPanel = dynamic(() => import('@/components/TimeseriesPanel'), { ssr: false });

const BANDS: Array<{ key: string; label: string }> = [
  { key: 'above_treeline', label: 'Above Treeline' },
  { key: 'treeline', label: 'Treeline' },
  { key: 'below_treeline', label: 'Below Treeline' },
];

function formatBand(band: string): string {
  const preset = BANDS.find((b) => b.key === band);
  if (preset) return preset.label;
  return band.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function RegionPage({ params }: { params: { region: string } }) {
  const region = params?.region;
  if (!region) {
    return <div className="text-sm text-red-500">Missing region slug.</div>;
  }

  try {
    const bundle = await loadRegionBundle(region);
    const { manifest, forecast, summary, avalanches, stationSummary, stationTimeseries, modelSummary, modelTimeseries } = bundle;

    const bandOrder = Array.from(
      new Set([
        ...BANDS.map((b) => b.key),
        ...Object.keys(stationSummary || {}),
        ...Object.keys(modelSummary || {}),
        ...Object.keys(stationTimeseries || {}),
        ...Object.keys(modelTimeseries || {}),
      ])
    );

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
          <div className="card">
            <div className="card-h"><h3 className="font-medium">Forecast Unavailable</h3></div>
            <div className="card-c text-sm text-neutral-600">
              We don't have an avalanche forecast for this region yet. Live station snapshots and model summaries below still reflect the latest conditions.
            </div>
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
          <section className="col-span-12">
            <MapPanel
              tilesBase={manifest.artifacts?.tiles_base}
              quicklook={manifest.artifacts?.quicklook_png}
            />
          </section>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <section className="col-span-12 lg:col-span-7 space-y-4">
            {bandOrder.map((band) => {
              const tables = stationSummary?.[band] ?? [];
              if (!tables.length) return null;
              return tables.map((table, idx) => {
                const rows = table.rows.map((row) => ({ ...row, elevation_band: formatBand(band) }));
                const columns = Array.from(new Set([...(table.columns || []), 'elevation_band']));
                const title = `Station Summary · ${formatBand(band)}${tables.length > 1 ? ` (${idx + 1})` : ''}`;
                return (
                  <WeatherTable
                    key={`${band}-${idx}`}
                    region={region}
                    kind="station"
                    initialRows={rows}
                    columns={columns}
                    title={title}
                  />
                );
              });
            })}
          </section>
          <section className="col-span-12 lg:col-span-5 space-y-4">
            <AvalancheList region={region} initialList={avalanches} />
            {bandOrder.map((band) => {
              const tables = modelSummary?.[band] ?? [];
              if (!tables.length) return null;
              return tables.map((table, idx) => {
                const rows = table.rows.map((row) => ({ ...row, elevation_band: formatBand(band) }));
                const columns = Array.from(new Set([...(table.columns || []), 'elevation_band']));
                const title = `Model Summary · ${formatBand(band)}${tables.length > 1 ? ` (${idx + 1})` : ''}`;
                return (
                  <WeatherTable
                    key={`model-${band}-${idx}`}
                    region={region}
                    kind="model"
                    initialRows={rows}
                    columns={columns}
                    title={title}
                  />
                );
              });
            })}
          </section>
        </div>

        <section className="space-y-4">
          {bandOrder.flatMap((band) => {
            const entries = stationTimeseries?.[band] ?? [];
            return entries.map((entry, idx) => (
              <TimeseriesPanel
                key={`station-ts-${band}-${entry.station_id}-${idx}`}
                region={region}
                data={{ x: entry.x, series: entry.series }}
                title={`Station Timeseries · ${entry.station_name ?? entry.station_id}`}
                subtitle={formatBand(band)}
              />
            ));
          })}
          {bandOrder.flatMap((band) => {
            const entries = modelTimeseries?.[band] ?? [];
            return entries.map((entry, idx) => (
              <TimeseriesPanel
                key={`model-ts-${band}-${entry.variable}-${idx}`}
                region={region}
                data={{ x: entry.x, series: entry.series }}
                title={`Model Timeseries · ${entry.variable} @ ${entry.level}`}
                subtitle={formatBand(band)}
              />
            ));
          })}
        </section>
      </div>
    );
  } catch (err) {
    console.error('[RegionPage] bundle load failed', err);
    return <div className="text-sm text-red-500">Unable to load data for region: {region}</div>;
  }
}
