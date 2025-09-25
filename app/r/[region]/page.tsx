'use client';
import { useQuery } from '@tanstack/react-query';
import { getManifest, getForecast } from '@/lib/api';
import DangerCards from '@/components/DangerCards';
import ProblemsChips from '@/components/ProblemsChips';
import dynamic from 'next/dynamic';

const MapPanel = dynamic(() => import('@/components/MapPanel'), { ssr: false });
const TimeseriesPanel = dynamic(() => import('@/components/TimeseriesPanel'), { ssr: false });

export default function RegionPage({ params }: { params: { region: string } }) {
  const region = params.region;
  const { data: manifest, isLoading: mLoading } = useQuery({
    queryKey: ['manifest', region], queryFn: () => getManifest(region), refetchInterval: 15000,
  });
  const { data: forecast, isLoading: fLoading } = useQuery({
    enabled: !!manifest, queryKey: ['forecast', manifest?.artifacts?.forecast_json], queryFn: () => getForecast(manifest!.artifacts.forecast_json), staleTime: 1000 * 60 * 60,
  });

  if (mLoading || fLoading) return <div>Loading…</div>;
  if (!manifest || !forecast) return <div>No data for region: {region}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold capitalize">
          {region.replace("_"," ")} — {new Date(manifest.run_time_utc).toUTCString()}
        </h2>
        <span className="text-sm text-gray-500">version {manifest.version}</span>
      </div>

      <DangerCards forecast={forecast} />
      <ProblemsChips forecast={forecast} />

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 lg:col-span-7">
          <MapPanel tilesBase={manifest.artifacts.tiles_base} quicklook={manifest.artifacts.quicklook_png} />
        </section>
        <section className="col-span-12 lg:col-span-5">
          <TimeseriesPanel region={region} />
        </section>
      </div>

      <div className="card">
        <div className="card-h"><h3 className="font-medium">Summary</h3></div>
        <div className="card-c"><p className="text-sm text-gray-700">{forecast.summary}</p></div>
      </div>
    </div>
  );
}
