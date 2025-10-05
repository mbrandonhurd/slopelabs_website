'use client';
import dynamic from 'next/dynamic';
import type { Layout } from 'plotly.js';
import type { TimeseriesPayload } from '@/types/core';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

type Props = {
  region: string;
  series?: TimeseriesPayload | null;
};

export default function TimeseriesPanel({ region, series }: Props) {
  if (!series || !Array.isArray(series.x) || !series.x.length || !Array.isArray(series.series)) {
    return (
      <div className="card">
        <div className="card-h"><h3 className="font-medium">Time Series</h3></div>
        <div className="card-c text-sm text-neutral-500">
          No preprocessed time-series data was provided for {region.replace(/_/g, ' ')}.
        </div>
      </div>
    );
  }

  const traces = series.series
    .filter((entry) => Array.isArray(entry.values) && entry.values.length === series.x.length)
    .map((entry) => ({
      x: series.x,
      y: entry.values,
      name: entry.name,
      type: entry.type === 'bar' ? 'bar' : 'scatter',
      mode: entry.type === 'bar' ? undefined : 'lines',
      yaxis: entry.yAxis && entry.yAxis !== 'y' ? entry.yAxis : undefined,
    }));

  const layout: Partial<Layout> = {
    height: 320,
    margin: { l: 48, r: 48, t: 10, b: 40 },
    xaxis: { title: { text: 'Valid time (UTC)' } },
    yaxis: { title: { text: traces[0]?.name ?? 'Value' } },
    legend: { orientation: 'h', y: -0.2 },
  };

  if (traces.some((t) => t.yaxis === 'y2')) {
    layout.yaxis2 = { overlaying: 'y', side: 'right', title: { text: 'Secondary' } };
  }
  if (traces.some((t) => t.yaxis === 'y3')) {
    layout.yaxis3 = { overlaying: 'y', side: 'right', position: 1.0, showgrid: false, title: { text: 'Tertiary' } };
  }

  return (
    <div className="card">
      <div className="card-h"><h3 className="font-medium">Time Series</h3></div>
      <div className="card-c">
        <Plot
          data={traces}
          layout={layout}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
