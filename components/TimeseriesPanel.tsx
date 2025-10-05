'use client';
import dynamic from 'next/dynamic';
import type { Data, Layout } from 'plotly.js';
import type { TimeseriesSeries } from '@/types/core';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

type TimeseriesInput = {
  x: string[];
  series: TimeseriesSeries[];
};

type PlotTrace = Partial<Data> & { yaxis?: 'y' | 'y2' | 'y3' };

type Props = {
  region: string;
  data?: TimeseriesInput | null;
  title?: string;
  subtitle?: string;
};

export default function TimeseriesPanel({ region, data, title, subtitle }: Props) {
  if (!data || !Array.isArray(data.x) || !data.x.length || !Array.isArray(data.series)) {
    return (
      <div className="card">
        <div className="card-h"><h3 className="font-medium">{title ?? 'Time Series'}</h3></div>
        <div className="card-c text-sm text-neutral-500">
          No preprocessed time-series data was provided for {region.replace(/_/g, ' ')}.
        </div>
      </div>
    );
  }

  const traces: PlotTrace[] = data.series
    .filter((entry) => Array.isArray(entry.values) && entry.values.length === data.x.length)
    .map<PlotTrace>((entry) => {
      const type = entry.type === 'bar' ? 'bar' : 'scatter';
      const yValues = entry.values.map((val) => Number(val));
      const trace: PlotTrace = {
        x: data.x,
        y: yValues,
        name: entry.name,
        type,
      };
      if (type === 'scatter') {
        trace.mode = 'lines';
      }
      if (entry.yAxis && entry.yAxis !== 'y') {
        trace.yaxis = entry.yAxis;
      }
      return trace;
    });

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
      <div className="card-h">
        <h3 className="font-medium">{title ?? 'Time Series'}</h3>
        {subtitle ? <p className="text-xs text-neutral-500 mt-1">{subtitle}</p> : null}
      </div>
      <div className="card-c">
        <Plot
          data={traces as Data[]}
          layout={layout}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}
