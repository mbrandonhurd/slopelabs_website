"use client";
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
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

  const validSeries = useMemo(
    () => data.series.filter((entry) => Array.isArray(entry.values) && entry.values.length === data.x.length),
    [data.series, data.x]
  );

  const traces: PlotTrace[] = useMemo(
    () =>
      validSeries.map<PlotTrace>((entry) => {
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
      }),
    [validSeries, data.x]
  );

  const [showPlot, setShowPlot] = useState(false);

  const latestIndex = data.x.length - 1;
  const latestIso = data.x[latestIndex];
  const latestTimestamp = latestIso ? new Date(latestIso) : null;
  const latestDisplay = latestTimestamp ? latestTimestamp.toUTCString() : '—';

  const summaryRows = useMemo(
    () =>
      validSeries.map((entry) => {
        const raw = entry.values?.[latestIndex];
        const numeric = raw === undefined || raw === null || Number.isNaN(Number(raw)) ? null : Number(raw);
        return {
          id: entry.name,
          label: entry.name,
          value: numeric,
          axis: entry.yAxis ?? 'y',
        };
      }),
    [validSeries, latestIndex]
  );

  const hasChart = traces.length > 0;

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
      <div className="card-c space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="py-1 pr-4">Metric</th>
                <th className="py-1 pr-2 text-right">Latest</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.id} className="border-t border-neutral-200">
                  <td className="py-1 pr-4 text-neutral-700">{row.label}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {row.value === null ? '—' : row.value.toFixed(2)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-neutral-200 text-xs text-neutral-500">
                <td className="py-1 pr-4">Timestamp (UTC)</td>
                <td className="py-1 pr-2 text-right">{latestDisplay}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {hasChart ? (
          <div className="space-y-2">
            <button
              type="button"
              className="text-xs font-medium text-sky-600 hover:text-sky-700 transition"
              onClick={() => setShowPlot((prev) => !prev)}
            >
              {showPlot ? 'Hide chart' : 'Show chart'}
            </button>
            {showPlot ? (
              <div className="pt-2">
                <Plot
                  data={traces as Data[]}
                  layout={layout}
                  config={{ displayModeBar: false, responsive: true }}
                  style={{ width: '100%', height: '100%' }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
