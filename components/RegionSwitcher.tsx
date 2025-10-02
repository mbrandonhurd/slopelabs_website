'use client';
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import * as duckdb from "@duckdb/duckdb-wasm";

async function discoverRegionsFromParquet(): Promise<string[]> {
  try {
    const mres = await fetch("/data/shared/model_manifest.json", { cache: "force-cache" });
    if (!mres.ok) return [];
    const manifest = await mres.json();
    const parquetPath: string = manifest.parquetPath || "/data/shared/weather_model.parquet";
    const regionCol: string = manifest.regionColumn || "region";

    const bundles = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(bundles);
    const worker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    const conn = await db.connect();

    const buf = new Uint8Array(await (await fetch(parquetPath, { cache: "force-cache" })).arrayBuffer());
    await db.registerFileBuffer("shared_model.parquet", buf);

    const res = await conn.query(
      `SELECT DISTINCT ${regionCol} AS region FROM parquet_scan('shared_model.parquet') ORDER BY 1`
    );
    const rows = (await res.toArray()) as Array<Record<string, unknown>>;
    const regions = rows.map(r => String(r["region"]));
    await conn.close();

    console.debug('[RegionSwitcher] discovered regions from parquet:', regions);
    return regions;
  } catch (e) {
    console.error('[RegionSwitcher] parquet discovery failed:', e);
    return [];
  }
}

export default function RegionSwitcher() {
  const [regions, setRegions] = useState<string[]>([]);
  const [value, setValue] = useState<string>("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    (async () => {
      // 1) Try API (/api/regions) — uses regions.json or legacy folder scan
      let list: string[] = [];
      try {
        const r = await fetch("/api/regions", { cache: "no-store" });
        const j = await r.json();
        if (Array.isArray(j.regions)) list = j.regions;
        console.debug('[RegionSwitcher] /api/regions ->', list);
      } catch (e) {
        console.error('[RegionSwitcher] /api/regions failed:', e);
      }

      // 2) If empty, fallback to discovering from shared parquet
      if (!list.length) list = await discoverRegionsFromParquet();

      setRegions(list);

      // Preselect current slug if we're on /r/<slug>
      const m = pathname?.match(/^\/r\/([^/?#]+)/);
      const currentFromPath = m?.[1] || "";
      console.debug('[RegionSwitcher] pathname =', pathname, 'currentFromPath =', currentFromPath);

      if (currentFromPath && list.includes(currentFromPath)) {
        setValue(currentFromPath);
      } else if (list.length && !value) {
        // Safe default: pick the first region (but DO NOT push yet; let user pick)
        console.warn('[RegionSwitcher] No current region in path; defaulting value to first region:', list[0]);
        setValue(list[0]);
      }
    })();
  }, [pathname]); // re-run if URL path changes

  return (
    <select
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        console.debug('[RegionSwitcher] onChange ->', next);
        setValue(next);
        if (next) router.push(`/r/${next}`);
        else console.error('[RegionSwitcher] refusing to push empty/undefined region');
      }}
      className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-sm text-black"
    >
      <option value="" disabled>Select region…</option>
      {regions.map(r => (
        <option key={r} value={r}>{r.replaceAll("_"," ")}</option>
      ))}
    </select>
  );
}
