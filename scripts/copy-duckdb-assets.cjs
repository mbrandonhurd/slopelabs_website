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
  // Primary dist dir: location of eh worker
  const distDir = path.dirname(
    require.resolve("@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js")
  );
  const p1 = path.join(distDir, rel);
  if (fs.existsSync(p1)) return p1;

  // Some releases put wasm under dist/wasm/
  const p2 = path.join(distDir, "wasm", rel);
  if (fs.existsSync(p2)) return p2;

  return null;
}

(function main() {
  const outDir = path.join(process.cwd(), "public", "duckdb");
  fs.mkdirSync(outDir, { recursive: true });

  const files = [
    "duckdb-browser-eh.worker.js",
    "duckdb-browser-mvp.worker.js",
    "duckdb-browser-coi.worker.js",
    "duckdb-wasm-eh.wasm",
    "duckdb-wasm-mvp.wasm",
  ];

  let copiedAny = false;
  for (const f of files) {
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
