// components/ModelParquetTable.tsx
'use client';

import type { ModelTablePayload } from '@/types/core';

type Props = {
  region: string;
  data?: ModelTablePayload | null;
};

export default function ModelParquetTable({ region, data }: Props) {
  if (!data || !data.columns || data.columns.length === 0) {
    return (
      <div className="card">
        <div className="card-h"><h3 className="font-medium">Model Data</h3></div>
        <div className="card-c text-sm text-neutral-500">
          No preprocessed model table was provided for {region.replace(/_/g, ' ')}.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-h flex flex-wrap items-center gap-2">
        <h3 className="font-medium">
          {data.title ?? 'Model Data'}
        </h3>
        {data.metadata?.variable ? (
          <span className="text-xs text-neutral-500">
            {String(data.metadata.variable)}{data.metadata.level ? ` · ${data.metadata.level}` : ''}
          </span>
        ) : null}
      </div>
      <div className="card-c overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {data.columns.map((col) => (
                <th key={col} className="text-left px-2 py-1 border-b font-semibold">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => (
              <tr key={idx} className="border-b last:border-0">
                {data.columns.map((col) => (
                  <td key={col} className="px-2 py-1 whitespace-nowrap">
                    {row[col] === null || row[col] === undefined ? '' : String(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.metadata ? (
        <div className="px-4 py-2 text-xs text-neutral-500 space-x-2 space-y-1">
          {Object.entries(data.metadata).map(([key, value]) => (
            <span key={key} className="inline-flex items-center gap-1">
              <span className="uppercase tracking-wide">{key}:</span>
              <span>{typeof value === 'string' ? value : JSON.stringify(value)}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
