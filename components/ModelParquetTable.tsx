'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import { loadModelManifest, type ModelManifest } from "@/lib/modelManifest";

let _dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
async function getDB() {
  if (_dbPromise) return _dbPromise;
  const bundles = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(bundles);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.ConsoleLogger();
  const db = new duckdb.AsyncDuckDB(logger, worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  _dbPromise = Promise.resolve(db);
  return db;
}

type Row = Record<string, string | number | null | undefined>;

export default function ModelParquetTable({ region }: { region: string }) {
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [vars, setVars] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>("mean_value");
  const [varCode, setVarCode] = useState<string>("");
  const [levelCode, setLevelCode] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const latestQuery = useRef<number>(0);

  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const m = await loadModelManifest(region);
        setManifest(m);
        const v = (m.vars ?? []).map(v => v.code);
        setVars(v);
        setVarCode(v[0] || "");
        setLevels(m.levels ?? []);
        setLevelCode((m.levels ?? [])[0] || "");
        if ((m as any).valueColumn) setMetric((m as any).valueColumn as string);
        else if (m.valueColumns && m.valueColumns.length) setMetric(m.valueColumns[0]);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, [region]);

  useEffect(() => {
    (async () => {
      if (!manifest || !varCode || !levelCode) return;
      setLoading(true); setErr(null);

      const qid = ++latestQuery.current;
      try {
        const db = await getDB();
        const conn = await db.connect();

        // pick the shared parquet (or fallback) from the manifest
        const parquetUrl = manifest.parquetPath || `/data/${region}/weather_model.parquet`;

        // load parquet into DuckDB FS
        const buf = new Uint8Array(await (await fetch(parquetUrl, { cache: "force-cache" })).arrayBuffer());
        await db.registerFileBuffer("model.parquet", buf);

        const tcol = manifest.timeColumn;
        const varCol = manifest.varColumn;
        const lvlCol = manifest.levelColumn;
        const regionCol = manifest.regionColumn; // optional

        const valCols = manifest.valueColumns ?? ((manifest as any).valueColumn ? [(manifest as any).valueColumn as string] : ["mean_value"]);
        const metricCol = metric && valCols.includes(metric) ? metric : valCols[0];

        // WHERE clause with region filter if present
        const whereParts: string[] = [];
        if (regionCol) whereParts.push(`${regionCol} = '${region}'`);
        whereParts.push(`${varCol} = '${varCode}'`);
        whereParts.push(`${lvlCol} = '${levelCode}'`);
        const whereSql = "WHERE " + whereParts.join(" AND ");

        const sql = `
          SELECT ${tcol} AS time, ${metricCol} AS value
          FROM parquet_scan('model.parquet')
          ${whereSql}
          ORDER BY ${tcol} DESC
          LIMIT 1000
        `;

        const res = await conn.query(sql);
        const table = await res.toArray();

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
    (manifest?.vars || []).forEach(v => (m[v.code] = (v as any).name ? `${v.code} — ${(v as any).name}` : v.code));
    return m;
  }, [manifest]);

  if (err) return <div className="text-sm text-red-500">Model data error: {err}</div>;
  if (!manifest) return <div className="text-sm text-neutral-400">Loading model manifest…</div>;

  const parquetUrlForFooter = manifest.parquetPath || `/data/${region}/weather_model.parquet`;

  return (
    <div className="card">
      <div className="card-h flex flex-wrap items-center gap-2">
        <h3 className="font-medium mr-2">Weather Model (Parquet)</h3>

        <label className="text-xs text-neutral-500">Variable</label>
        <select value={varCode} onChange={(e) => setVarCode(e.target.value)} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
          {vars.map(v => <option key={v} value={v}>{varLabelMap[v] ?? v}</option>)}
        </select>

        <label className="text-xs text-neutral-500">Level</label>
        <select value={levelCode} onChange={(e) => setLevelCode(e.target.value)} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
          {(manifest.levels ?? []).map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        {manifest.valueColumns && manifest.valueColumns.length > 1 ? (
          <>
            <label className="text-xs text-neutral-500">Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
              {manifest.valueColumns.map(c => <option key={c} value={c}>{c}</option>)}
            </sele
