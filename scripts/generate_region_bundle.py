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
import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Sequence, Set, Tuple

import duckdb
import numpy as np
import pandas as pd

BANDS = ["above_treeline", "treeline", "below_treeline"]
BAND_ALIASES = {
    "above_treeline": "above_treeline",
    "above-treeline": "above_treeline",
    "alpine": "above_treeline",
    "upper": "above_treeline",
    "above": "above_treeline",
    "treeline": "treeline",
    "mid": "treeline",
    "middle": "treeline",
    "midline": "treeline",
    "between": "treeline",
    "below_treeline": "below_treeline",
    "below-treeline": "below_treeline",
    "below": "below_treeline",
    "valley": "below_treeline",
    "lower": "below_treeline",
}
BAND_TOKENS = sorted(BAND_ALIASES.keys(), key=len, reverse=True)

logger = logging.getLogger(__name__)


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


def to_jsonable(value):
    if pd.isna(value):
        return None
    if isinstance(value, (np.integer, np.int_)):
        return int(value)
    if isinstance(value, (np.floating, np.float_)):
        return float(value)
    if isinstance(value, (np.bool_,)):
        return bool(value)
    return value


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


def resolve_station_csv_paths(station_path: Path) -> List[Path]:
    """Return a sorted list of CSV files represented by `station_path`."""
    if station_path.is_file():
        return [station_path]
    if station_path.is_dir():
        candidates = []
        for pattern in ("*.csv", "*.CSV"):
            candidates.extend(station_path.glob(pattern))
        csv_paths = sorted(p for p in candidates if p.is_file())
        if not csv_paths:
            raise FileNotFoundError(
                f"No CSV files found in directory {station_path}"
            )
        logger.debug("Found %d station CSV files under %s", len(csv_paths), station_path)
        return csv_paths
    raise FileNotFoundError(station_path)


def infer_region_band_from_filename(path: Path) -> Tuple[str | None, str | None]:
    """Best-effort extraction of region slug and canonical band from file name."""
    stem = path.stem.lower()
    for token in BAND_TOKENS:
        marker = f"_{token}_"
        if marker in stem:
            region_slug = stem.split(marker, 1)[0]
            return region_slug, BAND_ALIASES[token]
    for token in BAND_TOKENS:
        suffix = f"_{token}"
        if stem.endswith(suffix):
            region_slug = stem[: -len(suffix)]
            if region_slug.endswith("_"):
                region_slug = region_slug[:-1]
            return region_slug, BAND_ALIASES[token]
    return None, None


def canonicalize_band(value) -> str | None:
    if pd.isna(value):
        return None
    key = str(value).strip().lower()
    return BAND_ALIASES.get(key)


def discover_regions(
    model_parquet: Sequence[Path],
    station_csv: Path,
    *,
    model_region_col: str,
    station_region_col: str,
) -> tuple[List[str], List[str]]:
    model_paths = [Path(p) for p in model_parquet]
    for path in model_paths:
        if not path.exists():
            raise FileNotFoundError(path)
    if not station_csv.exists():
        raise FileNotFoundError(station_csv)

    con = duckdb.connect(database=":memory:")
    try:
        query = f"SELECT DISTINCT {model_region_col} FROM read_parquet(?) WHERE {model_region_col} IS NOT NULL"
        model_regions = {
            slugify_region(row[0])
            for row in con.execute(query, [[str(p) for p in model_paths]]).fetchall()
            if row[0]
        }
    finally:
        con.close()

    station_paths = resolve_station_csv_paths(station_csv)
    station_regions: Set[str] = set()
    for path in station_paths:
        try:
            station_df = pd.read_csv(
                path,
                usecols=[station_region_col],
                dtype=str,
                low_memory=False,
            )
        except ValueError:
            region_hint, _ = infer_region_band_from_filename(path)
            if region_hint:
                station_regions.add(slugify_region(region_hint))
            continue
        station_regions.update(
            slugify_region(value)
            for value in station_df[station_region_col].dropna().unique()
        )

    logger.debug(
        "Model regions discovered: %s | Station regions discovered: %s",
        sorted(model_regions),
        sorted(station_regions),
    )
    missing_stations = sorted(model_regions - station_regions)
    if missing_stations:
        logger.warning(
            "Regions missing station data: %s",
            missing_stations,
        )
    return sorted(model_regions), sorted(station_regions)


def load_model_dataframe(
    parquet_paths: Sequence[Path],
    region: str,
    *,
    region_col: str,
    band_col: str,
    time_col: str,
    variable_col: str,
    level_col: str,
    start_ts: pd.Timestamp | None = None,
    end_ts: pd.Timestamp | None = None,
) -> pd.DataFrame:
    paths = [Path(p) for p in parquet_paths]
    for parquet_path in paths:
        if not parquet_path.exists():
            raise FileNotFoundError(parquet_path)

    aliases = region_aliases(region)
    placeholders = ",".join(["?"] * len(aliases))

    con = duckdb.connect(database=":memory:")
    try:
        con.execute("SELECT * FROM read_parquet(?) LIMIT 0", [[str(p) for p in paths]])
        available_cols = [desc[0] for desc in con.description]
        if region_col not in available_cols:
            raise KeyError(
                f"Model region column '{region_col}' not found in model parquet files; available columns: {sorted(available_cols)}"
            )
        band_candidates = [band_col, "elevation_band", "elevation", "band"]
        band_col_resolved = None
        for candidate in band_candidates:
            if candidate in available_cols:
                band_col_resolved = candidate
                break
        if band_col_resolved is None:
            raise KeyError(
                f"Model band column '{band_col}' not found in model parquet files; available columns: {sorted(available_cols)}"
            )
        time_candidates = [time_col, "valid_date", "timestamp", "time"]
        time_col_resolved = None
        for candidate in time_candidates:
            if candidate in available_cols:
                time_col_resolved = candidate
                break
        if time_col_resolved is None:
            raise KeyError(
                f"Model time column '{time_col}' not found in model parquet files; available columns: {sorted(available_cols)}"
            )
        variable_candidates = [variable_col, "variable"]
        for candidate in variable_candidates:
            if candidate in available_cols:
                variable_col_resolved = candidate
                break
        else:
            raise KeyError(
                f"Model variable column '{variable_col}' not found in model parquet files; available columns: {sorted(available_cols)}"
            )
        level_candidates = [level_col, "level"]
        for candidate in level_candidates:
            if candidate in available_cols:
                level_col_resolved = candidate
                break
        else:
            raise KeyError(
                f"Model level column '{level_col}' not found in model parquet files; available columns: {sorted(available_cols)}"
            )
        con.execute(
            """
            SELECT *,
                   lower({band_col}) AS __band_lower,
                   lower({region_col}) AS __region_lower
            FROM read_parquet(?)
            WHERE lower({region_col}) IN ({aliases})
            """.format(
                region_col=region_col,
                band_col=band_col_resolved,
                aliases=placeholders,
            ),
            [[str(p) for p in paths], *aliases],
        )
        df = con.df()
    finally:
        con.close()

    if df.empty:
        raise ValueError(
            f"No records matching region='{region}' in provided model parquet files"
        )

    logger.debug(
        "Model load for region '%s': %d rows before filtering (band column '%s', time column '%s')",
        region,
        len(df),
        band_col_resolved,
        time_col_resolved,
    )

    required = {
        time_col_resolved,
        band_col_resolved,
        region_col,
        variable_col_resolved,
        level_col_resolved,
    }
    missing = required.difference(df.columns)
    if missing:
        raise KeyError(
            f"Missing model columns {sorted(missing)}; available columns: {sorted(df.columns)}"
        )

    df[time_col_resolved] = pd.to_datetime(df[time_col_resolved], utc=True, errors="coerce")
    df = df[df[time_col_resolved].notna()]
    if start_ts is not None:
        df = df[df[time_col_resolved] >= start_ts]
    if end_ts is not None:
        df = df[df[time_col_resolved] <= end_ts]
    if df.empty:
        raise ValueError(
            "No model rows remaining after applying date filters for "
            f"region='{region}' in {parquet_path}"
        )
    df = df.rename(
        columns={
            variable_col_resolved: "variable",
            level_col_resolved: "level",
            band_col_resolved: "__band_original",
            time_col_resolved: time_col,
        }
    )
    df["__band_canonical"] = df["__band_original"].apply(canonicalize_band)
    df = df[df["__band_canonical"].notna()]
    if df.empty:
        raise ValueError(
            f"No model rows with recognized elevation bands for region='{region}'"
        )
    df["__band_original"] = df["__band_canonical"]
    df["__band_lower"] = df["__band_canonical"]
    logger.debug(
        "Model load for region '%s': %d rows after filters",
        region,
        len(df),
    )
    return df


def discover_model_specs(df: pd.DataFrame, time_col: str) -> List[ModelSpec]:
    exclude_cols = {
        time_col,
        "variable",
        "level",
        "__band_original",
        "__band_lower",
        "__band_canonical",
        "__region_lower",
    }
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
    start_ts: pd.Timestamp | None = None,
    end_ts: pd.Timestamp | None = None,
) -> pd.DataFrame:
    if not csv_path.exists():
        raise FileNotFoundError(csv_path)

    station_paths = resolve_station_csv_paths(csv_path)
    target_slug = slugify_region(region)
    time_candidates = [time_col, "obs_time", "timestamp", "UTC_DATE", "utc_date"]
    logger.debug(
        "Loading %d station CSV files for region '%s'",
        len(station_paths),
        region,
    )
    frames: List[pd.DataFrame] = []
    for path in station_paths:
        df = pd.read_csv(path, dtype=str, low_memory=False)
        region_source_col = region_col
        if region_col not in df.columns:
            region_hint, band_hint = infer_region_band_from_filename(path)
            if not region_hint:
                raise KeyError(
                    f"Station region column '{region_col}' not found in {path}"
                )
            df[region_col] = region_hint
            region_source_col = region_col
            if band_col not in df.columns and band_hint:
                df[band_col] = band_hint
        elif band_col not in df.columns:
            _, band_hint = infer_region_band_from_filename(path)
            if band_hint:
                df[band_col] = band_hint
        df["__region_slug"] = df[region_source_col].apply(slugify_region)
        df = df.loc[df["__region_slug"] == target_slug].copy()
        if df.empty:
            continue
        frames.append(df)

    if not frames:
        raise ValueError(
            f"No station rows matching region='{region}' in provided station CSV files"
        )

    df = pd.concat(frames, ignore_index=True)
    logger.debug(
        "Station load for region '%s': %d rows before filtering",
        region,
        len(df),
    )

    if band_col not in df.columns:
        raise KeyError(
            f"Station column '{band_col}' not found; available columns: {sorted(df.columns)}"
        )

    time_col_resolved = None
    for candidate in time_candidates:
        if candidate in df.columns:
            time_col_resolved = candidate
            break
    if time_col_resolved is None:
        raise KeyError(
            f"Station time column '{time_col}' not found; available columns: {sorted(df.columns)}"
        )
    if time_col_resolved != time_col:
        logger.debug(
            "Station time column '%s' not found, using '%s' instead",
            time_col,
            time_col_resolved,
        )

    df[band_col] = df[band_col].apply(canonicalize_band)
    df = df[df[band_col].notna()]

    df[time_col_resolved] = pd.to_datetime(df[time_col_resolved], utc=True, errors="coerce")
    df = df[df[time_col_resolved].notna()]
    if start_ts is not None:
        df = df[df[time_col_resolved] >= start_ts]
    if end_ts is not None:
        df = df[df[time_col_resolved] <= end_ts]
    if df.empty:
        raise ValueError(
            "No station rows remaining after applying date filters for "
            f"region='{region}'"
        )
    df = df.rename(columns={time_col_resolved: time_col})
    df["__band_lower"] = df[band_col].astype(str).str.lower()
    logger.debug(
        "Station load for region '%s': %d rows after filters",
        region,
        len(df),
    )
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
            summary_row = {}
            for col in summary_columns:
                if col == time_col:
                    summary_row[col] = to_iso([row.iloc[0][time_col]])[0]
                else:
                    summary_row[col] = to_jsonable(row.iloc[0][col])
            summary[band].append(
                {
                    "columns": summary_columns,
                    "rows": [summary_row],
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
        band_df = df[df["__band_lower"] == band].copy()
        if band_df.empty:
            continue

        if id_col not in band_df.columns:
            band_df.loc[:, id_col] = "station"
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
                elif col in metrics:
                    value = pd.to_numeric(row[col], errors="coerce")
                    entry[col] = None if pd.isna(value) else float(value)
                else:
                    entry[col] = to_jsonable(row[col])
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
                values_series = pd.to_numeric(station_df[metric], errors="coerce")
                traces.append(
                    {
                        "name": metric,
                        "values": values_series.round(4).tolist(),
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
    parser.add_argument(
        "--model-parquet",
        required=True,
        type=Path,
        nargs="+",
        help="One or more weather model parquet files",
    )
    parser.add_argument(
        "--station-csv",
        required=True,
        type=Path,
        help="Path to a station CSV file or a directory containing station CSV files",
    )
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
    parser.add_argument(
        "--start-date",
        help="Inclusive UTC start date/time (e.g. 2024-01-01 or 2024-01-01T12:00Z) for filtering model and station data",
    )
    parser.add_argument(
        "--end-date",
        help="Inclusive UTC end date/time for filtering model and station data",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable progress logging",
    )

    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s | %(levelname)s | %(message)s",
    )
    logger.setLevel(logging.INFO if args.verbose else logging.WARNING)
    if args.verbose:
        logger.info("Starting region bundle generation")

    def parse_date_arg(label: str, value: str | None) -> pd.Timestamp | None:
        if value is None:
            return None
        try:
            ts = pd.to_datetime(value, utc=True)
        except (TypeError, ValueError) as exc:
            parser.error(f"Invalid --{label} value '{value}': {exc}")
        if isinstance(ts, pd.DatetimeIndex):
            if ts.empty:
                parser.error(f"Invalid --{label} value '{value}'")
            ts = ts[0]
        if ts.tzinfo is None:
            ts = ts.tz_localize("UTC")
        return ts

    start_ts = parse_date_arg("start-date", args.start_date)
    end_ts = parse_date_arg("end-date", args.end_date)
    if start_ts is not None and end_ts is not None and start_ts > end_ts:
        parser.error("--start-date must be before or equal to --end-date")

    station_metrics = [m.strip() for m in args.station_metrics.split(",") if m.strip()]

    if args.region:
        regions = [slugify_region(args.region.strip())]
        station_region_list = []
    else:
        regions, station_region_list = discover_regions(
            args.model_parquet,
            args.station_csv,
            model_region_col=args.model_region_column,
            station_region_col=args.station_region_column,
        )
    station_region_set = {slugify_region(r) for r in station_region_list}

    logger.info("Regions to process: %s", regions)

    multi_region = len(regions) > 1
    output_arg: Path | None = args.output
    if multi_region and output_arg and output_arg.suffix == ".json":
        parser.error("When generating multiple regions, --output must be a directory")

    generated = []

    for index, region_slug in enumerate(regions, start=1):
        logger.info(
            "[%d/%d] Processing region '%s'",
            index,
            len(regions),
            region_slug,
        )
        model_df = load_model_dataframe(
            args.model_parquet,
            region_slug,
            region_col=args.model_region_column,
            band_col=args.model_band_column,
            time_col=args.model_time_column,
            variable_col=args.model_variable_column,
            level_col=args.model_level_column,
            start_ts=start_ts,
            end_ts=end_ts,
        )
        logger.info(
            "[%d/%d] Loaded model data (%d rows) for region '%s'",
            index,
            len(regions),
            len(model_df),
            region_slug,
        )
        station_df = None
        if station_region_set and region_slug not in station_region_set:
            logger.info(
                "[%d/%d] No station CSVs detected for region '%s'; proceeding with model data only",
                index,
                len(regions),
                region_slug,
            )
        else:
            try:
                station_df = load_station_dataframe(
                    args.station_csv,
                    region_slug,
                    region_col=args.station_region_column,
                    band_col=args.station_band_column,
                    time_col=args.station_time_column,
                    start_ts=start_ts,
                    end_ts=end_ts,
                )
                logger.info(
                    "[%d/%d] Loaded station data (%d rows) for region '%s'",
                    index,
                    len(regions),
                    len(station_df),
                    region_slug,
                )
            except (ValueError, KeyError) as exc:
                logger.warning(
                    "[%d/%d] Station data unavailable for region '%s': %s",
                    index,
                    len(regions),
                    region_slug,
                    exc,
                )
        if station_df is None:
            empty_cols = {
                args.station_time_column: pd.Series(dtype="datetime64[ns, UTC]"),
                "__band_lower": pd.Series(dtype=str),
            }
            empty_cols[args.station_band_column] = pd.Series(dtype=str)
            empty_cols[args.station_region_column] = pd.Series(dtype=str)
            empty_cols[args.station_id_column] = pd.Series(dtype=str)
            empty_cols[args.station_name_column] = pd.Series(dtype=str)
            for metric in station_metrics:
                empty_cols[metric] = pd.Series(dtype=float)
            station_df = pd.DataFrame(empty_cols)

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
        else:
            logger.info(
                "[%d/%d] Using %d model specs for region '%s'",
                index,
                len(regions),
                len(model_specs),
                region_slug,
            )

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
        logger.info(
            "[%d/%d] Writing outputs under %s",
            index,
            len(regions),
            base_path,
        )

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

    logger.info("Completed generation of %d bundle outputs", len(generated))
    print(f"Generated {len(generated)} bundle(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
