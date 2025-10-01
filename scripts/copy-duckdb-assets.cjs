/* Copy DuckDB-WASM runtime files into public/duckdb so workers load from same origin */
const fs = require("fs");
const path = require("path");

const srcDir = path.join(process.cwd(), "node_modules", "@duckdb", "duckdb-wasm", "dist");
const dstDir = path.join(process.cwd(), "public", "duckdb");

const FILES = [
  // workers
  "duckdb-browser-eh.worker.js",
  "duckdb-browser-coi.worker.js",
  // wasm modules
  "duckdb-wasm-eh.wasm",
  "duckdb-wasm.wasm",
];

fs.mkdirSync(dstDir, { recursive: true });

let copied = 0;
for (const f of FILES) {
  const src = path.join(srcDir, f);
  const dst = path.join(dstDir, f);
  if (!fs.existsSync(src)) {
    console.error(`[duckdb-copy] Missing file: ${src}`);
    process.exitCode = 1;
    continue;
  }
  fs.copyFileSync(src, dst);
  copied++;
  console.log(`[duckdb-copy] Copied ${f} -> ${path.relative(process.cwd(), dst)}`);
}

if (copied === FILES.length) {
  console.log("[duckdb-copy] All DuckDB assets copied.");
} else {
  console.warn("[duckdb-copy] Some files were not copied. See messages above.");
}
