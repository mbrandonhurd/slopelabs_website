/* Copy DuckDB-WASM runtime files into public/duckdb so workers load from same origin */
const fs = require("fs");
const path = require("path");

const srcDir = path.join(process.cwd(), "node_modules", "@duckdb", "duckdb-wasm", "dist");
const dstDir = path.join(process.cwd(), "public", "duckdb");

fs.mkdirSync(dstDir, { recursive: true });

/** Try to copy a file only if present; never fail the build. */
function tryCopy(baseName) {
  const src = path.join(srcDir, baseName);
  const dst = path.join(dstDir, baseName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log(`[duckdb-copy] Copied ${baseName} -> ${path.relative(process.cwd(), dst)}`);
    return true;
  } else {
    console.warn(`[duckdb-copy] Missing: ${src}`);
    return false;
  }
}

// Known names across versions:
const wanted = [
  // Workers
  "duckdb-browser-eh.worker.js",
  "duckdb-browser-mvp.worker.js",
  // Some versions ship this too; harmless if absent
  "duckdb-browser-coi.worker.js",
  // WASM modules
  "duckdb-wasm-eh.wasm",
  "duckdb-wasm-mvp.wasm",
];

let copiedAny = false;
for (const f of wanted) copiedAny = tryCopy(f) || copiedAny;

if (!copiedAny) {
  console.warn("[duckdb-copy] No DuckDB assets were copied. Check @duckdb/duckdb-wasm install/version.");
}

// IMPORTANT: never set a non-zero exit code — we do not want to fail the build if some files moved.
process.exit(0);
