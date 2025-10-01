'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import { loadModelManifest, type ModelManifest } from "@/lib/modelManifest";

let _dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
async function getDB() {
  if (_dbPromise) return _dbPromise;
  // 1) Get the available bundles (SIMD / non-SIMD, etc.)
  // 2) Select the best bundle for this environment
  // 3) Create a Worker from the selected bundle
  //
  // In many bundlers, `new Worker(bundle.mainWorker!)` is enough.
  // If your setup requires a URL object, uncomment the next two lines
  // and replace the Worker creation accordingly.
  //
  // const workerUrl = new URL(bundle.mainWorker!, window.location.href);
  // const worker = new Worker(workerUrl);

// Self-hosted bundles (served from /public/duckdb on the same origin).
  const bundles = {
    mvp: {
      mainModule: "/duckdb/duckdb-wasm-mvp.wasm",
      mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
    },
    eh: {
      mainModule: "/duckdb/duckdb-wasm-eh.wasm",
      mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
      // Some versions need pthreadWorker. If missing, selectBundle will still pick MVP.
      pthreadWorker: "/duckdb/duckdb-browser-eh.worker.js",
    },
  } as const;
  
  const bundle = await duckdb.selectBundle(bundles);
  const worker = new Worker(bundle.mainWorker!); // classic worker
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);


  const logger = new duckdb.ConsoleLogger();



  _dbPromise = Promise.resolve(db);
  return db;
}

type Row = Record<string, string | number | null | undefined>;

export default function ModelParquetTable({ region }: { region: string }) {
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [vars, setVars] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>("mean_value");     // default metric
  const [varCode, setVarCode] = useState<string>("");
  const [levelCode, setLevelCode] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latestQuery = useRef<number>(0);

  // load the manifest
  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const m = await loadModelManifest(region);
        setManifest(m);
        // vars/levels from manifest
        const v = (m.vars ?? []).map(v => v.code);
        setVars(v);
        setVarCode(v[0] || "");
        setLevels(m.levels ?? []);
        setLevelCode((m.levels ?? [])[0] || "");
        // default metric: use valueColumn if present
        if ((m as any).valueColumn) setMetric((m as any).valueColumn as string);
        else if (m.valueColumns && m.valueColumns.length) setMetric(m.valueColumns[0]);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, [region]);

  // run the parquet query any time selections change
  useEffect(() => {
    (async () => {
      if (!manifest || !varCode || !levelCode) return;
      setLoading(true); setErr(null);

      const qid = ++latestQuery.current;
      try {
        const db = await getDB();
        const conn = await db.connect();

        // pick file path: manifest.parquetPath or region file
        const parquetUrl = manifest.parquetPath || `/data/${region}/weather_model.parquet`;

        // load parquet file into DuckDB virtual FS (cacheable by browser)
        const buf = new Uint8Array(await (await fetch(parquetUrl, { cache: "force-cache" })).arrayBuffer());
        await db.registerFileBuffer("model.parquet", buf);

        // Columns from manifest
        const tcol = manifest.timeColumn;
        const varCol = manifest.varColumn;
        const lvlCol = manifest.levelColumn;
        const regionCol = manifest.regionColumn; // e.g., "region"
        const valCols = manifest.valueColumns ?? ((manifest as any).valueColumn ? [(manifest as any).valueColumn as string] : ["mean_value"]);
        const metricCol = metric && valCols.includes(metric) ? metric : valCols[0];

        // SQL with region filter (only when regionCol exists)
        const whereParts: string[] = [];
        if (regionCol) whereParts.push(`${regionCol} = '${region}'`);
        whereParts.push(`${varCol} = '${varCode}'`);
        whereParts.push(`${lvlCol} = '${levelCode}'`);
        const whereSql = "WHERE " + whereParts.join(" AND ");

        // SQL (long layout): filter var/level(/region), select time + metric
        const sql = `
          SELECT ${tcol} AS time, ${metricCol} AS value
          FROM parquet_scan('model.parquet')
          ${whereSql}
          ORDER BY ${tcol} DESC
          LIMIT 1000
        `;

        const res = await conn.query(sql);
        const table = await res.toArray(); // array of { time, value }

        // prevent out-of-order sets
        if (qid === latestQuery.current) {
          setRows(table as Row[]);
          setCols(["time", "value"]);
        }

        await conn.close();
      } catch (e: any) {
        if (qid === latestQuery.current) setErr(e?.message || String(e));
      } finally {
        if (qid === latestQuery.current) setLoading(false);
      }
    })();
  }, [manifest, varCode, levelCode, metric, region]);

  const varLabelMap = useMemo(() => {
    const m: Record<string, string> = {};
    (manifest?.vars || []).forEach(v => m[v.code] = (v as any).name ? `${v.code} — ${(v as any).name}` : v.code);
    return m;
  }, [manifest]);

  if (err) {
    return <div className="text-sm text-red-500">Model data error: {err}</div>;
  }
  if (!manifest) {
    return <div className="text-sm text-neutral-400">Loading model manifest…</div>;
  }

  // for footer note: reflect actual parquet source
  const parquetUrlForFooter = manifest.parquetPath || `/data/${region}/weather_model.parquet`;

  return (
    <div className="card">
      <div className="card-h flex flex-wrap items-center gap-2">
        <h3 className="font-medium mr-2">Weather Model (Parquet)</h3>

        {/* Variable selector */}
        <label className="text-xs text-neutral-500">Variable</label>
        <select
          value={varCode}
          onChange={(e) => setVarCode(e.target.value)}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
        >
          {vars.map(v => (
            <option key={v} value={v}>
              {varLabelMap[v] ?? v}
            </option>
          ))}
        </select>

        {/* Level selector */}
        <label className="text-xs text-neutral-500">Level</label>
        <select
          value={levelCode}
          onChange={(e) => setLevelCode(e.target.value)}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
        >
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        {/* Metric selector (if multiple) */}
        {(manifest.valueColumns && manifest.valueColumns.length > 1) ? (
          <>
            <label className="text-xs text-neutral-500">Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
            >
              {manifest.valueColumns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        ) : null }

        <span className="ml-auto text-xs text-neutral-500">
          {loading ? "Querying…" : `${rows.length} rows`}
        </span>
      </div>

      <div className="card-c overflow-auto">
        {!rows.length ? (
          <div className="text-sm text-neutral-500">No rows for {varCode}@{levelCode}{manifest.regionColumn ? ` in ${region}` : ""}.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                {cols.map(c => (
                  <th key={c} className="text-left px-2 py-1 border-b font-semibold">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {cols.map(c => (
                    <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="px-4 py-2 text-xs text-neutral-500">
        Data from <code>{parquetUrlForFooter}</code> • columns: <code>{manifest.varColumn}</code>, <code>{manifest.levelColumn}</code>, <code>{manifest.timeColumn}</code>, <code>{(manifest as any).valueColumn ?? (manifest.valueColumns || []).join(", ")}</code>
        {manifest.regionColumn ? <> • region filter column: <code>{manifest.regionColumn}</code></> : null}
      </div>
    </div>
  );
}
