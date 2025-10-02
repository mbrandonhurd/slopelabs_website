'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
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

  // 1) Load manifest
  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const m = await loadModelManifest(region);
        setManifest(m);

        // select metric default
        if ((m as any).valueColumn) setMetric((m as any).valueColumn as string);
        else if (m.valueColumns && m.valueColumns.length) setMetric(m.valueColumns[0]);

        // seed var/level from manifest if provided
        const mv = (m.vars ?? []).map(v => v.code);
        const ml = m.levels ?? [];
        setVars(mv);
        setLevels(ml);
        setVarCode(mv[0] || "");
        setLevelCode(ml[0] || "");
        console.debug("[ModelParquetTable] manifest loaded", { mvCount: mv.length, mlCount: ml.length });
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, [region]);

  // 2) Fallback discovery of vars/levels if manifest didn't provide them
  useEffect(() => {
    (async () => {
      if (!manifest) return;
      if (vars.length && levels.length) return; // nothing to do

      try {
        const db = await getDB();
        const conn = await db.connect();

        const parquetUrl = manifest.parquetPath || `/data/${region}/weather_model.parquet`;
        const regionCol = manifest.regionColumn || "region";
        const varCol = manifest.varColumn;
        const lvlCol = manifest.levelColumn;

        // ensure file is registered (idempotent)
        const buf = new Uint8Array(await (await fetch(parquetUrl, { cache: "force-cache" })).arrayBuffer());
        await db.registerFileBuffer("model.parquet", buf);

        const whereRegion = `${regionCol} = '${region}'`;
        // discover variables/levels for this region
        let discoveredVars: string[] = vars;
        let discoveredLevels: string[] = levels;

        if (!discoveredVars.length) {
          const sqlV = `SELECT DISTINCT ${varCol} AS v FROM parquet_scan('model.parquet') WHERE ${whereRegion} ORDER BY 1`;
          const resV = await conn.query(sqlV);
          const arrV = (await resV.toArray()) as Array<Record<string, unknown>>;
          discoveredVars = arrV.map(x => String(x["v"]));
          setVars(discoveredVars);
          setVarCode(prev => prev || discoveredVars[0] || "");
          console.debug("[ModelParquetTable] discovered vars", discoveredVars.slice(0, 12), `(+${Math.max(0, discoveredVars.length-12)} more)`);
        }

        if (!discoveredLevels.length) {
          const sqlL = `SELECT DISTINCT ${lvlCol} AS l FROM parquet_scan('model.parquet') WHERE ${whereRegion} ORDER BY 1`;
          const resL = await conn.query(sqlL);
          const arrL = (await resL.toArray()) as Array<Record<string, unknown>>;
          discoveredLevels = arrL.map(x => String(x["l"]));
          setLevels(discoveredLevels);
          setLevelCode(prev => prev || discoveredLevels[0] || "");
          console.debug("[ModelParquetTable] discovered levels", discoveredLevels);
        }

        await conn.close();
      } catch (e: any) {
        console.error("[ModelParquetTable] discovery error", e);
        // don't block the page entirely—let main query show error if needed
      }
    })();
  }, [manifest, region, vars.length, levels.length]);

  // 3) Main query
  useEffect(() => {
    (async () => {
      if (!manifest) return;
      // If we still don't have defaults, defer query until discovery completes
      if (!varCode || !levelCode) return;

      setLoading(true); setErr(null);
      const qid = ++latestQuery.current;

      try {
        const db = await getDB();
        const conn = await db.connect();

        const parquetUrl = manifest.parquetPath || `/data/${region}/weather_model.parquet`;
        const tcol = manifest.timeColumn;
        const varCol = manifest.varColumn;
        const lvlCol = manifest.levelColumn;
        const regionCol = manifest.regionColumn || "region";
        const valCols = manifest.valueColumns ?? ((manifest as any).valueColumn ? [(manifest as any).valueColumn as string] : ["mean_value"]);
        const metricCol = metric && valCols.includes(metric) ? metric : valCols[0];

        const buf = new Uint8Array(await (await fetch(parquetUrl, { cache: "force-cache" })).arrayBuffer());
        await db.registerFileBuffer("model.parquet", buf);

        const whereParts: string[] = [];
        if (regionCol) whereParts.push(`${regionCol} = '${region}'`);
        whereParts.push(`${varCol} = '${varCode}'`);
        whereParts.push(`${lvlCol} = '${levelCode}'`);
        const whereSql = "WHERE " + whereParts.join(" AND ");

        const sql = [
          `SELECT ${tcol} AS time, ${metricCol} AS value`,
          `FROM parquet_scan('model.parquet')`,
          whereSql,
          `ORDER BY ${tcol} DESC`,
          `LIMIT 1000`
        ].join("\n");

        console.debug("[ModelParquetTable] parquetUrl", parquetUrl);
        console.debug("[ModelParquetTable] WHERE", whereSql);
        console.debug("[ModelParquetTable] metric", metricCol);

        const res = await conn.query(sql);
        const table = await res.toArray();

        if (qid === latestQuery.current) {
          setRows(table as Row[]);
          setCols(["time", "value"]);
          console.debug("[ModelParquetTable] rows", table.length);
        }

        await conn.close();
      } catch (e: any) {
        if (qid === latestQuery.current) setErr(e?.message || String(e));
        console.error("[ModelParquetTable] query error", e);
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
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        {manifest.valueColumns && manifest.valueColumns.length > 1 ? (
          <>
            <label className="text-xs text-neutral-500">Metric</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black">
              {manifest.valueColumns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </>
        ) : null}

        <span className="ml-auto text-xs text-neutral-500">
          {loading ? "Querying…" : `${rows.length} rows`}
        </span>
      </div>

      <div className="card-c overflow-auto">
        {!rows.length ? (
          <div className="text-sm text-neutral-500">
            No rows for {varCode || "(variable)"}@{levelCode || "(level)"}{manifest.regionColumn ? ` in ${region}` : ""}.
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr>{cols.map(c => <th key={c} className="text-left px-2 py-1 border-b font-semibold">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {cols.map(c => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(r[c] ?? "")}</td>)}
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
