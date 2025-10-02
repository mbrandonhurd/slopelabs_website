#!/usr/bin/env node
/* Inspect a Parquet for regions/vars/levels and date range (Node DuckDB).
 * Usage:
 *   node scripts/inspect-parquet.cjs public/data/shared/weather_model.parquet
 */
const duckdb = require("duckdb");
const fs = require("fs");
const path = require("path");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node scripts/inspect-parquet.cjs <parquet path>");
  process.exit(1);
}
const abs = path.resolve(input);
if (!fs.existsSync(abs)) {
  console.error("File not found:", abs);
  process.exit(1);
}

// escape ' for SQL literal
const ep = abs.replace(/'/g, "''");

const db = new duckdb.Database(":memory:");
const conn = db.connect();

/** promisified conn.all — only pass params if provided */
function all(sql, params) {
  return new Promise((resolve, reject) => {
    const cb = (err, rows) => (err ? reject(err) : resolve(rows));
    if (Array.isArray(params) && params.length > 0) conn.all(sql, params, cb);
    else conn.all(sql, cb);
  });
}

(async () => {
  try {
    console.log("File:", abs);

    // 0) Describe schema so we know real column names
    const desc = await all(`DESCRIBE SELECT * FROM read_parquet('${ep}')`);
    console.log("Columns:");
    desc.forEach((d) => {
      console.log(` - ${d.column_name}: ${d.column_type}`);
    });

    const has = (name) => desc.some((d) => d.column_name === name);
    const timeCol =
      (has("valid_date") && "valid_date") ||
      (has("valid_time") && "valid_time") ||
      (has("time") && "time") ||
      (has("date") && "date") ||
      null;

    const regionCol = (has("region") && "region") || null;
    const varCol    = (has("variable") && "variable") || (has("var") && "var") || null;
    const levelCol  = (has("level") && "level") || null;
    const valCol    =
      (has("mean_value") && "mean_value") ||
      (has("value") && "value") ||
      null;

    console.log("\nDetected columns:", { timeCol, regionCol, varCol, levelCol, valCol });

    // 1) Time min/max + head/tail
    if (timeCol) {
      const mm   = await all(`SELECT MIN(${timeCol}) AS mn, MAX(${timeCol}) AS mx FROM read_parquet('${ep}')`);
      const head = await all(`SELECT ${timeCol} FROM read_parquet('${ep}') ORDER BY ${timeCol} ASC LIMIT 5`);
      const tail = await all(`SELECT ${timeCol} FROM read_parquet('${ep}') ORDER BY ${timeCol} DESC LIMIT 5`);
      console.log(`\n${timeCol} min/max:`, mm[0]?.mn, mm[0]?.mx);
      console.log(`head ${timeCol}:`, head.map((r) => r[timeCol]));
      console.log(`tail ${timeCol}:`, tail.map((r) => r[timeCol]));
    } else {
      console.warn("\nNo time-like column detected (valid_date/valid_time/time/date).");
    }

    // 2) Regions / variables / levels
    if (regionCol) {
      const regions = await all(
        `SELECT ${regionCol} AS region, COUNT(*) AS n
         FROM read_parquet('${ep}')
         GROUP BY 1 ORDER BY 1 LIMIT 50`
      );
      console.log("\nregions (first 50):", regions);
    } else {
      console.warn("\nNo 'region' column detected.");
    }

    if (varCol) {
      const vars = await all(
        `SELECT ${varCol} AS variable, COUNT(*) AS n
         FROM read_parquet('${ep}')
         GROUP BY 1 ORDER BY 2 DESC LIMIT 20`
      );
      console.log("\nvariables (top 20):", vars);
    } else {
      console.warn("\nNo 'variable' column detected.");
    }

    if (levelCol) {
      const levels = await all(
        `SELECT ${levelCol} AS level, COUNT(*) AS n
         FROM read_parquet('${ep}')
         GROUP BY 1 ORDER BY 2 DESC LIMIT 20`
      );
      console.log("\nlevels (top 20):", levels);
    } else {
      console.warn("\nNo 'level' column detected.");
    }

    // 3) Small sample to mirror UI filters
    if (regionCol && varCol && levelCol && timeCol && valCol) {
      const sample = await all(
        `
        SELECT ${timeCol} AS time, ${varCol} AS variable, ${levelCol} AS level, ${valCol} AS value
        FROM read_parquet('${ep}')
        WHERE lower(${regionCol}) IN ('south_rockies','south rockies')
          AND ${varCol} = 'TMP'
          AND (${levelCol} IN ('ISBL_500hPa','ISBL_0500'))
        ORDER BY ${timeCol} DESC
        LIMIT 5
        `
      );
      console.log("\nsample (TMP@500hPa in south_rockies):", sample);
    } else {
      console.log("\nSkipping sample query (missing one of region/variable/level/time/value).");
    }
  } catch (e) {
    console.error("\ninspect error:", e);
  } finally {
    conn.close();
    db.close();
  }
})();
