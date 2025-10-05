#!/usr/bin/env python3
"""Generate a preprocessed region bundle JSON from model parquet + station CSV.

Example usage (single region):
  python scripts/generate_region_bundle.py \
    --region south_rockies \
    --model-parquet public/data/shared/weather_model.parquet \
    --station-csv public/data/shared/weather_station.csv \
    --output public/data/south_rockies/bundle.json \
    --model-spec TMP@ISBL_500hPa:mean_value,p05,p95 \
    --model-spec PRATE@Sfc:mean_value \
    --station-metrics temp_c,wind_mps,hs_cm \
    --model-time-column valid_date \
    --station-time-column obs_time

If --region is omitted the script discovers all regions present in both
datasets and writes <output>/<region>/bundle.json for each.

The script expects both datasets to contain a column identifying the target
region (defaults: `region`), an elevation band column (`elevation_band`), and a
timestamp (`valid_date` / `obs_time`). Adjust column names via CLI flags.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Sequence, Set, Tuple

import duckdb
import pandas as pd

BANDS = ["above_treeline", "treeline", "below_treeline"]


@dataclass
class ModelSpec:
    variable: str
    level: str
    metrics: List[str]

    @classmethod
    def parse(cls, raw: str) -> "ModelSpec":
        """Parse spec in the form VAR:LEVEL:metric1,metric2"""
        raw = raw.strip()
        if "@" in raw:
            head, metrics = raw.split(":", 1)
            variable, level = head.split("@", 1)
        else:
            parts = raw.split(":")
            if len(parts) < 3:
                raise argparse.ArgumentTypeError(
                    f"Model spec '{raw}' must look like VAR@LEVEL:metric1,metric2"
                )
            variable, level = parts[0], parts[1]
            metrics = ":".join(parts[2:])

        metric_list = [m.strip() for m in metrics.split(",") if m.strip()]
        if not metric_list:
            raise argparse.ArgumentTypeError(
                f"Model spec '{raw}' must include at least one metric"
            )
        return cls(variable=variable.strip(), level=level.strip(), metrics=metric_list)


def to_iso(series: Iterable[pd.Timestamp]) -> List[str]:
    out: List[str] = []
    for ts in series:
        if pd.isna(ts):
            out.append("")
        elif isinstance(ts, datetime):
            out.append(ts.strftime("%Y-%m-%dT%H:%M:%SZ"))
        else:
            out.append(pd.to_datetime(ts, utc=True).strftime("%Y-%m-%dT%H:%M:%SZ"))
    return out


def normalize_region_name(value: str) -> str:
    text = str(value or "").lower().replace("_", " ").replace("-", " ")
    parts = text.split()
    return " ".join(parts)


def slugify_region(value: str) -> str:
    return normalize_region_name(value).replace(" ", "_")


def region_aliases(slug: str) -> List[str]:
    base_norm = normalize_region_name(slug)
    return list({
        slug.lower(),
        base_norm,
        base_norm.replace(" ", "_"),
        base_norm.replace(" ", "-"),
    })


def discover_regions(
    model_parquet: Path,
    station_csv: Path,
    *,
    model_region_col: str,
    station_region_col: str,
) -> List[str]:
    if not model_parquet.exists():
        raise FileNotFoundError(model_parquet)
    if not station_csv.exists():
        raise FileNotFoundError(station_csv)

    con = duckdb.connect(database=":memory:")
    try:
        query = f"SELECT DISTINCT {model_region_col} FROM read_parquet(?) WHERE {model_region_col} IS NOT NULL"
        model_regions = {
            slugify_region(row[0])
            for row in con.execute(query, [str(model_parquet)]).fetchall()
            if row[0]
        }
    finally:
        con.close()

    try:
        station_df = pd.read_csv(station_csv, usecols=[station_region_col])
    except ValueError as exc:
        raise KeyError(
            f"Station region column '{station_region_col}' not found in {station_csv}"
        ) from exc
    station_regions = {
        slugify_region(value)
        for value in station_df[station_region_col].dropna().unique()
    }

    shared = sorted(model_regions & station_regions)
    if not shared:
        raise ValueError(
            "No overlapping regions found between model parquet and station CSV"
        )
    return shared


def load_model_dataframe(
    parquet_path: Path,
    region: str,
    *,
    region_col: str,
    band_col: str,
    time_col: str,
    variable_col: str,
    level_col: str,
) -> pd.DataFrame:
    if not parquet_path.exists():
        raise FileNotFoundError(parquet_path)

    aliases = region_aliases(region)
    placeholders = ",".join(["?"] * len(aliases))

    con = duckdb.connect(database=":memory:")
    try:
        con.execute(
            """
            SELECT *,
                   lower({band_col}) AS __band_lower,
                   lower({region_col}) AS __region_lower
            FROM read_parquet(?)
            WHERE lower({region_col}) IN ({aliases})
            """.format(region_col=region_col, band_col=band_col, aliases=placeholders),
            [str(parquet_path), *aliases],
        )
        df = con.df()
    finally:
        con.close()

    if df.empty:
        raise ValueError(
            f"No records matching region='{region}' in {parquet_path}"
        )

    required = {time_col, band_col, region_col, variable_col, level_col}
    missing = required.difference(df.columns)
    if missing:
        raise KeyError(
            f"Missing model columns {sorted(missing)}; available columns: {sorted(df.columns)}"
        )

    df[time_col] = pd.to_datetime(df[time_col], utc=True, errors="coerce")
    df = df[df[time_col].notna()]
    df = df.rename(
        columns={
            variable_col: "variable",
            level_col: "level",
            band_col: "__band_original",
        }
    )
    df["__band_lower"] = df["__band_original"].astype(str).str.lower()
    return df


def discover_model_specs(df: pd.DataFrame, time_col: str) -> List[ModelSpec]:
    exclude_cols = {time_col, "variable", "level", "__band_original", "__band_lower", "__region_lower"}
    numeric_cols = [
        col
        for col in df.columns
        if col not in exclude_cols and pd.api.types.is_numeric_dtype(df[col])
    ]
    specs: List[ModelSpec] = []
    seen: Set[Tuple[str, str]] = set()
    unique_pairs = df[["variable", "level"]].drop_duplicates()
    for _, row in unique_pairs.iterrows():
        variable = str(row["variable"])
        level = str(row["level"])
        subset = df[(df["variable"] == variable) & (df["level"] == level)]
        metrics = [col for col in numeric_cols if subset[col].notna().any()]
        if not metrics:
            continue
        key = (variable, level)
        if key in seen:
            continue
        seen.add(key)
        specs.append(ModelSpec(variable=variable, level=level, metrics=metrics))
    return specs


def load_station_dataframe(
    csv_path: Path,
    region: str,
    *,
    region_col: str,
    band_col: str,
    time_col: str,
) -> pd.DataFrame:
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)

    df = pd.read_csv(csv_path)
    df["__region_slug"] = df[region_col].apply(slugify_region)
    target_slug = slugify_region(region)
    df = df.loc[df["__region_slug"] == target_slug].copy()

    if df.empty:
        raise ValueError(
            f"No station rows matching region='{region}' in {csv_path}"
        )

    if time_col not in df.columns or band_col not in df.columns:
        raise KeyError(
            f"Station columns '{time_col}' and/or '{band_col}' not found; available columns: {sorted(df.columns)}"
        )

    df[time_col] = pd.to_datetime(df[time_col], utc=True, errors="coerce")
    df = df[df[time_col].notna()]
    df["__band_lower"] = df[band_col].astype(str).str.lower()
    return df


def build_model_payload(
    df: pd.DataFrame,
    specs: Sequence[ModelSpec],
    time_col: str,
) -> dict:
    summary = {band: [] for band in BANDS}
    timeseries = {band: [] for band in BANDS}

    for spec in specs:
        subset = df[(df["variable"] == spec.variable) & (df["level"] == spec.level)].copy()
        if subset.empty:
            continue

        subset = subset.sort_values(time_col)
        latest = subset.groupby("__band_lower").tail(1)

        summary_columns = [time_col] + spec.metrics
        for band, row in latest.groupby("__band_lower"):
            if band not in summary:
                continue
            summary[band].append(
                {
                    "columns": summary_columns,
                    "rows": [
                        {
                            col: (row.iloc[0][col] if col != time_col else to_iso([row.iloc[0][time_col]])[0])
                            for col in summary_columns
                        }
                    ],
                    "metadata": {
                        "variable": spec.variable,
                        "level": spec.level,
                        "metrics": spec.metrics,
                    },
                }
            )

        for band in BANDS:
            band_df = subset[subset["__band_lower"] == band]
            if band_df.empty:
                continue
            times = to_iso(band_df[time_col])
            series = []
            for idx, metric in enumerate(spec.metrics):
                if metric not in band_df.columns:
                    continue
                series.append(
                    {
                        "name": f"{spec.variable} {metric}",
                        "values": band_df[metric].astype(float).round(4).tolist(),
                        "yAxis": "y" if idx == 0 else "y2",
                    }
                )
            if series:
                timeseries[band].append(
                    {
                        "variable": spec.variable,
                        "level": spec.level,
                        "x": times,
                        "series": series,
                        "metadata": {"metrics": spec.metrics},
                    }
                )

    return {"summary": summary, "timeseries": timeseries}


def build_station_payload(
    df: pd.DataFrame,
    metrics: Sequence[str],
    *,
    time_col: str,
    id_col: str,
    name_col: str,
) -> dict:
    summary = {band: [] for band in BANDS}
    timeseries = {band: [] for band in BANDS}

    for band in BANDS:
        band_df = df[df["__band_lower"] == band]
        if band_df.empty:
            continue

        if id_col not in band_df.columns:
            band_df[id_col] = "station"
        latest = band_df.sort_values(time_col).groupby(id_col, as_index=False).tail(1)

        cols = [id_col]
        if name_col in latest.columns:
            cols.append(name_col)
        cols.append(time_col)
        cols.extend(metrics)
        filtered_cols = [c for c in cols if c in latest.columns]
        table_rows = []
        for _, row in latest.iterrows():
            entry = {}
            for col in filtered_cols:
                if col == time_col:
                    entry[col] = to_iso([row[time_col]])[0]
                else:
                    entry[col] = row[col]
            table_rows.append(entry)
        summary[band].append(
            {
                "columns": filtered_cols,
                "rows": table_rows,
                "metadata": {"count": len(table_rows)},
            }
        )

        # Build timeseries per station
        station_groups = band_df.groupby(id_col)
        for station_id, station_df in station_groups:
            station_df = station_df.sort_values(time_col)
            traces = []
            for metric in metrics:
                if metric not in station_df.columns:
                    continue
                traces.append(
                    {
                        "name": metric,
                        "values": station_df[metric].astype(float).round(4).tolist(),
                        "yAxis": "y",
                    }
                )
            if not traces:
                continue
            timeseries[band].append(
                {
                    "station_id": station_id,
                    "station_name": station_df.get(name_col, pd.Series([station_id])).iloc[0],
                    "x": to_iso(station_df[time_col]),
                    "series": traces,
                }
            )

    return {"summary": summary, "timeseries": timeseries}


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build region bundle JSON")
    parser.add_argument(
        "--region",
        help="Region slug (e.g. south_rockies). If omitted, bundles are generated for all shared regions",
    )
    parser.add_argument("--model-parquet", required=True, type=Path)
    parser.add_argument("--station-csv", required=True, type=Path)
    parser.add_argument(
        "--output",
        type=Path,
        help="Output file path (single region) or directory root (multi-region). Default: public/data/<region>/bundle.json",
    )
    parser.add_argument(
        "--model-spec",
        action="append",
        default=[],
        type=ModelSpec.parse,
        help="Model variable spec in VAR:LEVEL:metric1,metric2 form (repeatable)",
    )
    parser.add_argument(
        "--station-metrics",
        default="temp_c,wind_mps,hs_cm",
        help="Comma-separated station columns to include in summaries/timeseries",
    )
    parser.add_argument("--model-region-column", default="region")
    parser.add_argument("--model-band-column", default="elevation_band")
    parser.add_argument("--model-time-column", default="valid_date")
    parser.add_argument("--model-variable-column", default="variable")
    parser.add_argument("--model-level-column", default="level")
    parser.add_argument("--station-region-column", default="region")
    parser.add_argument("--station-band-column", default="elevation_band")
    parser.add_argument("--station-time-column", default="obs_time")
    parser.add_argument("--station-id-column", default="station_id")
    parser.add_argument("--station-name-column", default="station_name")
    parser.add_argument("--tiles-base", default="https://tile.openstreetmap.org/")
    parser.add_argument("--quicklook", default=None, help="Optional quicklook PNG path")

    args = parser.parse_args(argv)

    station_metrics = [m.strip() for m in args.station_metrics.split(",") if m.strip()]

    if args.region:
        regions = [args.region.strip().lower()]
    else:
        regions = discover_regions(
            args.model_parquet,
            args.station_csv,
            model_region_col=args.model_region_column,
            station_region_col=args.station_region_column,
        )

    multi_region = len(regions) > 1
    output_arg: Path | None = args.output
    if multi_region and output_arg and output_arg.suffix == ".json":
        parser.error("When generating multiple regions, --output must be a directory")

    generated = []

    for region_slug in regions:
        model_df = load_model_dataframe(
            args.model_parquet,
            region_slug,
            region_col=args.model_region_column,
            band_col=args.model_band_column,
            time_col=args.model_time_column,
            variable_col=args.model_variable_column,
            level_col=args.model_level_column,
        )
        station_df = load_station_dataframe(
            args.station_csv,
            region_slug,
            region_col=args.station_region_column,
            band_col=args.station_band_column,
            time_col=args.station_time_column,
        )

        bundle = {
            "region": region_slug,
            "run_time_utc": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "version": datetime.utcnow().strftime("%Y%m%d%H%M"),
            "tiles_base": args.tiles_base,
        }

        if args.quicklook:
            bundle["quicklook_png"] = args.quicklook

        model_specs = args.model_spec or discover_model_specs(model_df, args.model_time_column)
        if not model_specs:
            print(f"[warn] No model metrics discovered for region '{region_slug}'. Skipping model summary/time-series.")

        station_payload = build_station_payload(
            station_df,
            station_metrics,
            time_col=args.station_time_column,
            id_col=args.station_id_column,
            name_col=args.station_name_column,
        )
        model_payload = build_model_payload(
            model_df,
            model_specs,
            args.model_time_column,
        ) if model_specs else {"summary": {band: [] for band in BANDS}, "timeseries": {band: [] for band in BANDS}}

        summary_json = None
        timeseries_json = None

        if output_arg:
            if output_arg.suffix == ".json" and not multi_region:
                base_path = output_arg.with_suffix("")
            else:
                base_path = output_arg / region_slug
        else:
            base_path = Path("public/data") / region_slug

        summary_path = base_path / "summary.json"
        timeseries_path = base_path / "timeseries.json"
        base_path.mkdir(parents=True, exist_ok=True)

        summary_payload = {
            **bundle,
            "stations": station_payload["summary"],
            "model": model_payload["summary"],
        }
        with summary_path.open("w", encoding="utf-8") as fh:
            json.dump(summary_payload, fh, indent=2)
            fh.write("\n")

        timeseries_payload = {
            "region": region_slug,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "stations": station_payload["timeseries"],
            "model": model_payload["timeseries"],
        }
        with timeseries_path.open("w", encoding="utf-8") as fh:
            json.dump(timeseries_payload, fh, indent=2)
            fh.write("\n")

        generated.extend([summary_path, timeseries_path])
        print(f"Wrote summary -> {summary_path}")
        print(f"Wrote timeseries -> {timeseries_path}")

    print(f"Generated {len(generated)} bundle(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
