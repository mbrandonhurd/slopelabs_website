'use client';
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, string | number | null | undefined>;

export default function WeatherTable({
  region,
  kind = "model", // "model" | "station"
  initialRows,
  columns: presetColumns,
  title,
}: {
  region: string;
  kind?: "model" | "station";
  initialRows?: Row[];
  columns?: string[];
  title?: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => initialRows ?? []);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (initialRows !== undefined) {
      setRows(initialRows);
      return;
    }

    if (kind !== "station") {
      setRows([]);
      return;
    }

    let cancelled = false;
    fetch(`/api/data/${region}/weather?kind=${kind}`)
      .then(r => r.json())
      .then((d) => {
        if (cancelled) return;
        setRows(Array.isArray(d.rows) ? d.rows : []);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [region, kind, initialRows]);

  const cols = useMemo(() => {
    if (presetColumns?.length) return presetColumns;
    const first = rows[0] || {};
    return Object.keys(first);
  }, [rows, presetColumns]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(r =>
      Object.values(r).some(v => String(v ?? "").toLowerCase().includes(term))
    );
  }, [rows, q]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const arr = [...filtered];
    arr.sort((a, b) => {
      const va = a[sortKey] as any, vb = b[sortKey] as any;
      if (va == null && vb != null) return -1;
      if (va != null && vb == null) return 1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va ?? ""), sb = String(vb ?? "");
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  return (
    <div className="card">
      <div className="card-h flex items-center gap-2">
        <h3 className="font-medium">
          {title ?? (kind === "model" ? "Weather Model Table" : "Weather Station Table")}
        </h3>
        <input
          placeholder="Filter…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="ml-auto rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
        />
      </div>
      <div className="card-c overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {cols.map(c => (
                <th
                  key={c}
                  className="sticky top-0 bg-white text-left font-semibold px-2 py-1 border-b cursor-pointer"
                  onClick={() => {
                    if (sortKey === c) setSortDir(d => (d === "asc" ? "desc" : "asc"));
                    setSortKey(c);
                  }}
                >
                  {c}{sortKey === c ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-b last:border-0">
                {cols.map(c => (
                  <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Variable/level cheat-sheet (hover help or footer) */}
      <div className="text-xs text-neutral-500 px-4 py-2">
        Variables at pressure/height levels support entries like TMP@ISBL_500hPa, UGRD@AGL_10m, PRES@Sfc, etc.
      </div>
    </div>
  );
}
