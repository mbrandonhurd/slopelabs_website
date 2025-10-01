'use client';
import { useQuery } from '@tanstack/react-query';
import { getManifest, getForecast } from '@/lib/api';
import DangerCards from '@/components/DangerCards';
import ProblemsChips from '@/components/ProblemsChips';
import dynamic from 'next/dynamic';
import WeatherTable from "@/components/WeatherTable";
import AvalancheList from "@/components/AvalancheList";
import ModelParquetTable from "@/components/ModelParquetTable";


const MapPanel = dynamic(() => import('@/components/MapPanel'), { ssr: false });
const TimeseriesPanel = dynamic(() => import('@/components/TimeseriesPanel'), { ssr: false });

<section className="col-span-12">
  <ModelParquetTable region={region} />
</section>

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
      {/* existing header / version */}
      <DangerCards forecast={forecast} />
      <ProblemsChips forecast={forecast} />

      {/* EXISTING first grid */}
      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 lg:col-span-7">
          <MapPanel
            tilesBase={manifest.artifacts.tiles_base}
            quicklook={manifest.artifacts.quicklook_png}
          />
        </section>
        <section className="col-span-12 lg:col-span-5">
          <TimeseriesPanel region={region} />
        </section>
      </div>

      {/* NEW: data tables + recent avalanches */}
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
    </div>
  );
}
