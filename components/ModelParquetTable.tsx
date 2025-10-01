'use client';

import { useEffect, useMemo, useRef, useState } from "react";
import * as duckdb from "@duckdb/duckdb-wasm";
import { loadModelManifest, type ModelManifest } from "@/lib/modelManifest";

let _dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;
async function getDB() {
  if (_dbPromise) return _dbPromise;

  // Self-hosted bundles (served from /public/duckdb on same origin)
  const bundles = {
    mvp: {
      mainModule: "/duckdb/duckdb-wasm-mvp.wasm",
      mainWorker: "/duckdb/duckdb-browser-mvp.worker.js",
    },
    eh: {
      mainModule: "/duckdb/duckdb-wasm-eh.wasm",
      mainWorker: "/duckdb/duckdb-browser-eh.worker.js",
      pthreadWorker: "/duckdb/duckdb-browser-eh.worker.js",
    },
  } as const;

  const bundle = await duckdb.selectBundle(bundles);
  const worker = new Worker(bundle.mainWorker!);
  const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  _dbPromise = Promise.resolve(db);
  return db;
}

type Row = Record<string, string | number | null | undefined>;

function levelVariants(normalized: string): string[] {
  // Accept canonical and common provider variants
  // ISBL_500hPa <-> ISBL_0500
  if (/^ISBL_\d{3}hPa$/.test(normalized)) {
    const n = normalized.match(/^ISBL_(\d{3})hPa$/)![1];
    return [normalized, `ISBL_0${n}`]; // ISBL_500hPa -> ISBL_0500
  }
  // AGL_10m <-> AGL-10m, AGL_2m <-> AGL-2m
  if (normalized === "AGL_10m") return ["AGL_10m", "AGL-10m"];
  if (normalized === "AGL_2m") return ["AGL_2m", "AGL-2m"];
  // Surface Sfc/sfc/surface
  if (normalized === "Sfc") return ["Sfc", "sfc", "Surface"];
  // Already canonical or no known variant
  return [normalized];
}

function regionVariants(slug: string): string[] {
  const r0 = slug;
  const r1 = slug.replace(/_/g, " ");
  const r2 = r1.replace(/\b\w/g, (c) => c.toUpperCase()); // Title Case
  return [r0, r1, r2, r0.toLowerCase(), r1.toLowerCase(), r2.toLowerCase()];
}

export default function ModelParquetTable({ region }: { region: string }) {
  const [manifest, setManifest] = useState<ModelManifest | null>(null);
  const [vars, setVars] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [metric, setMetric] = useState<string>("mean_value"); // will be replaced by manifest if present
  const [varCode, setVarCode] = useState<string>("");
  const [levelCode, setLevelCode] = useState<string>("");
  const [rows, setRows] = useState<Row[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const latestQuery = useRef<number>(0);

  // 1) load manifest
  useEffect(() => {
    (async () => {
      setErr(null); setNote(null);
      try {
        const m = await loadModelManifest(region);
        setManifest(m);
        // metric default
        if (m.valueColumn) setMetric(m.valueColumn);
        else if (m.valueColumns?.length) setMetric(m.valueColumns[0]);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();
  }, [region]);

  // 2) load parquet + discover var/level for this region
  useEffect(() => {
    (async () => {
      if (!manifest) return;
      setLoading(true); setErr(null); setNote(null);
      try {
        const db = await getDB();
        const conn = await db.connect();
        const parquetUrl = manifest.parquetPath || `/data/${region}/weather_model.parquet`;
        const buf = new Uint8Array(await (await fetch(parquetUrl, { cache: "force-cache" })).arrayBuffer());
        await db.registerFileBuffer("model.parquet", buf);
  
        const varCol = manifest.varColumn;
        const lvlCol = manifest.levelColumn;
        const rCol   = manifest.regionColumn; // optional
        const regList = rCol ? regionVariants(region) : [];
        const regWhere = rCol ? `WHERE lower(${rCol}) IN (${regList.map(r => `'${r.toLowerCase()}'`).join(",")})` : "";
  
        // discover vars and levels (filtered by region if regionCol exists)
        const varSql = `SELECT DISTINCT ${varCol} as v FROM parquet_scan('model.parquet') ${regWhere} ORDER BY 1`;
        const lvlSql = `SELECT DISTINCT ${lvlCol} as l FROM parquet_scan('model.parquet') ${regWhere} ORDER BY 1`;
  
        // No generic here; let TS treat as unknown/any and read aliases
        const varsRes = await conn.query(varSql);
        const levelsRes = await conn.query(lvlSql);
  
        const varRows = await varsRes.toArray();
        const lvlRows = await levelsRes.toArray();
  
        const varList = (varRows as any[]).map(r => String((r as any).v));
        const lvlList = (lvlRows as any[]).map(r => String((r as any).l));
  
        setVars(varList);
        setLevels(lvlList);
  
        // choose defaults that actually exist
        const defVar = manifest.vars?.[0]?.code && varList.includes(manifest.vars[0].code)
          ? manifest.vars[0].code
          : (varList[0] || "");
  
        const defLvl = manifest.levels?.[0] &&
          (lvlList.includes(manifest.levels[0]) || levelVariants(manifest.levels[0]).some(v => lvlList.includes(v)))
          ? manifest.levels[0]
          : (lvlList[0] || "");
  
        setVarCode(defVar);
        setLevelCode(defLvl);
  
        await conn.close();
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [manifest, region]);

  // 3) query rows whenever selections change
  useEffect(() => {
    (async () => {
      if (!manifest || !varCode || !levelCode) return;
      setLoading(true); setErr(null); setNote(null);
      const qid = ++latestQuery.current;

      try {
        const db = await getDB();
        const conn = await db.connect();

        const parquetUrl = manifest.parquetPath || `/data/${region}/weather_model.parquet`;
        const buf = new Uint8Array(await (await fetch(parquetUrl, { cache: "force-cache" })).arrayBuffer());
        await db.registerFileBuffer("model.parquet", buf);

        const tcol = manifest.timeColumn;
        const varCol = manifest.varColumn;
        const lvlCol = manifest.levelColumn;
        const rCol = manifest.regionColumn;
        const valCols = manifest.valueColumns ?? (manifest.valueColumn ? [manifest.valueColumn] : ["mean_value"]);
        const metricCol = metric && valCols.includes(metric) ? metric : valCols[0];

        const lvlList = levelVariants(levelCode);
        const lvlIn = lvlList.map(l => `'${l}'`).join(",");
        const regList = rCol ? regionVariants(region) : [];
        const regPred = rCol ? `AND lower(${rCol}) IN (${regList.map(r => `'${r.toLowerCase()}'`).join(",")})` : "";

        const whereSql = `
          WHERE ${varCol} = '${varCode}'
            AND ${lvlCol} IN (${lvlIn})
            ${regPred}
        `;

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
          if ((table as Row[]).length === 0) {
            setNote(`No rows for ${varCode}@${levelCode}. WHERE used: ${whereSql.replace(/\s+/g," ").trim()}`);
          }
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
    (manifest?.vars || []).forEach(v => m[v.code] = v.name ? `${v.code} — ${v.name}` : v.code);
    return m;
  }, [manifest]);

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
          {!vars.length && <option value="">(none)</option>}
          {vars.map(v => (
            <option key={v} value={v}>{varLabelMap[v] ?? v}</option>
          ))}
        </select>

        {/* Level selector */}
        <label className="text-xs text-neutral-500">Level</label>
        <select
          value={levelCode}
          onChange={(e) => setLevelCode(e.target.value)}
          className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
        >
          {!levels.length && <option value="">(none)</option>}
          {levels.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        {/* Metric selector (if multiple in manifest) */}
        { (manifest?.valueColumns && manifest.valueColumns.length > 1) ? (
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
        {err && <div className="text-sm text-red-500">Model data error: {err}</div>}
        {!err && note && <div className="text-xs text-amber-600 mb-2">{note}</div>}

        {!rows.length ? (
          <div className="text-sm text-neutral-500">No rows.</div>
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
        Source: <code>{manifest?.parquetPath || `/data/${region}/weather_model.parquet`}</code>
      </div>
    </div>
  );
}
