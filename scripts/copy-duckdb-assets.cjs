// scripts/copy-duckdb-assets.cjs
/* Copy duckdb-wasm browser worker + wasm into /public/duckdb (same-origin workers) */
const fs = require("fs");
const path = require("path");

function copyOne(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[duckdb-copy] Missing: ${src}`);
    return false;
  }
  fs.copyFileSync(src, dst);
  console.log(`[duckdb-copy] Copied ${path.basename(src)} -> ${dst}`);
  return true;
}

function resolveDistFile(rel) {
  // Base dist dir: where the EH worker lives for this package
  const distDir = path.dirname(
    require.resolve("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js")
  );
  const tries = [
    path.join(distDir, rel),
    path.join(distDir, "wasm", rel),
  ];
  for (const t of tries) {
    if (fs.existsSync(t)) return t;
  }
  return null;
}

(function main() {
  const outDir = path.join(process.cwd(), "public", "duckdb");
  fs.mkdirSync(outDir, { recursive: true });

  // Workers (names are stable)
  const workerFiles = [
    "duckdb-browser-eh.worker.js",
    "duckdb-browser-mvp.worker.js",
    "duckdb-browser-coi.worker.js",
  ];

  // WASM may be named with or without "-wasm-"
  const wasmCandidates = [
    "duckdb-wasm-eh.wasm",
    "duckdb-eh.wasm",
    "duckdb-wasm-mvp.wasm",
    "duckdb-mvp.wasm",
  ];

  let copiedAny = false;

  for (const f of workerFiles) {
    const src = resolveDistFile(f);
    const dst = path.join(outDir, f);
    if (src) copiedAny = copyOne(src, dst) || copiedAny;
    else console.warn(`[duckdb-copy] Missing: ${f}`);
  }

  for (const f of wasmCandidates) {
    const src = resolveDistFile(f);
    const dst = path.join(outDir, f);
    if (src) copiedAny = copyOne(src, dst) || copiedAny;
    else console.warn(`[duckdb-copy] Missing: ${f}`);
  }

  if (!copiedAny) {
    console.error("[duckdb-copy] ERROR: no duckdb assets could be copied");
    process.exit(1);
  }
})();
