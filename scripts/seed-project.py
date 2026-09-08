#!/usr/bin/env python3
"""Seed a development app with the bundled road-traffic Event Log."""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import sqlite3
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

try:
    import pyarrow as pa
    import pyarrow.compute as pc
    import pyarrow.csv as arrow_csv
    import pyarrow.parquet as parquet
except ImportError as error:
    raise SystemExit(
        "Seeding requires pyarrow. Install it with `python3 -m pip install pyarrow`."
    ) from error


REPO_ROOT = Path(__file__).resolve().parent.parent
SEED_CSV = Path(__file__).resolve().parent / "seed_log" / "road_traffic_fine_10k.csv"
PROJECT_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "compare:seed:road-traffic-fine"))
PROJECT_NAME = "Road traffic fine 10k (seed)"

COLUMNS = [
    {
        "name": "Case ID",
        "role": "case_id",
        "scope": "case",
        "caseResolution": "constant",
        "type": "string",
    },
    {"name": "Activity", "role": "activity_name", "scope": "event", "type": "string"},
    {
        "name": "Resource",
        "role": "other",
        "scope": "case",
        "caseResolution": "first",
        "type": "float",
    },
    {
        "name": "Complete Timestamp",
        "role": "complete_timestamp",
        "scope": "event",
        "type": "datetime",
        "timestampFormat": "YYYY-MM-DD HH:mm:ss.SSS",
    },
    {"name": "Variant", "role": "other", "scope": "event", "type": "string"},
    {"name": "Variant index", "role": "other", "scope": "event", "type": "integer"},
    {"name": "amount", "role": "other", "scope": "event", "type": "float"},
    {"name": "dismissal", "role": "other", "scope": "event", "type": "string"},
    {"name": "vehicleClass", "role": "other", "scope": "event", "type": "string"},
    {
        "name": "totalPaymentAmount",
        "role": "other",
        "scope": "case",
        "caseResolution": "last",
        "type": "float",
    },
    {
        "name": "lifecycle:transition",
        "role": "other",
        "scope": "event",
        "type": "string",
    },
    {"name": "article", "role": "other", "scope": "event", "type": "integer"},
    {"name": "points", "role": "other", "scope": "event", "type": "integer"},
    {"name": "expense", "role": "other", "scope": "event", "type": "float"},
    {"name": "notificationType", "role": "other", "scope": "event", "type": "string"},
    {"name": "lastSent", "role": "other", "scope": "event", "type": "string"},
    {"name": "paymentAmount", "role": "other", "scope": "event", "type": "float"},
    {"name": "matricola", "role": "other", "scope": "event", "type": "string"},
]

HIDDEN_COLUMNS = [
    "Variant",
    "Variant index",
    "amount",
    "dismissal",
    "vehicleClass",
    "lifecycle:transition",
    "article",
    "points",
    "expense",
    "notificationType",
    "lastSent",
    "paymentAmount",
    "matricola",
]

ARROW_TYPES = {
    "Case ID": pa.string(),
    "Activity": pa.string(),
    "Resource": pa.float64(),
    "Complete Timestamp": pa.timestamp("ms"),
    "Variant": pa.string(),
    "Variant index": pa.int64(),
    "amount": pa.float64(),
    "dismissal": pa.string(),
    "vehicleClass": pa.string(),
    "totalPaymentAmount": pa.float64(),
    "lifecycle:transition": pa.string(),
    "article": pa.int64(),
    "points": pa.int64(),
    "expense": pa.float64(),
    "notificationType": pa.string(),
    "lastSent": pa.string(),
    "paymentAmount": pa.float64(),
    "matricola": pa.string(),
}


def branch_app_id() -> str:
    result = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    branch = result.stdout.strip()
    if not branch:
        raise SystemExit(
            "Cannot derive a development app id from a detached HEAD; pass --app-id."
        )
    slug = "".join(character if character.isalnum() else "-" for character in branch)
    return f"com.nicoabarca.compare.dev-{slug}"


def default_app_data_dir(app_id: str) -> Path:
    system = platform.system()
    if system == "Darwin":
        return Path.home() / "Library" / "Application Support" / app_id
    if system == "Windows":
        base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
        return base / app_id
    base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
    return base / app_id


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create or reset the bundled road-traffic seed project."
    )
    target = parser.add_mutually_exclusive_group()
    target.add_argument(
        "--app-id",
        help="Tauri application identifier (defaults to the current dev branch identifier).",
    )
    target.add_argument(
        "--app-data-dir",
        type=Path,
        help="Explicit application-data directory containing compare.db.",
    )
    return parser.parse_args()


def read_event_log() -> pa.Table:
    if not SEED_CSV.is_file():
        raise SystemExit(f"Seed Event Log is missing: {SEED_CSV}")
    table = arrow_csv.read_csv(
        SEED_CSV,
        convert_options=arrow_csv.ConvertOptions(
            column_types=ARROW_TYPES,
            strings_can_be_null=True,
        ),
    )
    return table.sort_by(
        [("Case ID", "ascending"), ("Complete Timestamp", "ascending")]
    )


def iso_utc(value: datetime) -> str:
    return (
        value.replace(tzinfo=timezone.utc)
        .isoformat(timespec="seconds")
        .replace("+00:00", "Z")
    )


def event_log_stats(table: pa.Table) -> dict[str, int | str]:
    valid = table.filter(
        pc.and_(
            pc.and_(pc.is_valid(table["Case ID"]), pc.is_valid(table["Activity"])),
            pc.is_valid(table["Complete Timestamp"]),
        )
    )
    cases = valid["Case ID"].to_pylist()
    activities = valid["Activity"].to_pylist()
    timestamps = valid["Complete Timestamp"].to_pylist()

    traces: set[tuple[str, ...]] = set()
    current_case: str | None = None
    current_trace: list[str] = []
    for case_id, activity in zip(cases, activities):
        if current_case is not None and case_id != current_case:
            traces.add(tuple(current_trace))
            current_trace = []
        current_case = case_id
        current_trace.append(activity)
    if current_case is not None:
        traces.add(tuple(current_trace))

    return {
        "events": valid.num_rows,
        "cases": len(set(cases)),
        "activities": len(set(activities)),
        "variants": len(traces),
        "timespan_start": iso_utc(min(timestamps)),
        "timespan_end": iso_utc(max(timestamps)),
    }


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects (
          id text PRIMARY KEY NOT NULL,
          name text NOT NULL,
          file_name text NOT NULL,
          original_path text NOT NULL,
          event_log_path text NOT NULL,
          columns text NOT NULL,
          hidden_columns text NOT NULL,
          events integer NOT NULL,
          cases integer NOT NULL,
          activities integer NOT NULL,
          variants integer NOT NULL,
          timespan_start text,
          timespan_end text,
          created_at text NOT NULL
        );
        CREATE TABLE IF NOT EXISTS groups (
          id text PRIMARY KEY NOT NULL,
          project_id text NOT NULL,
          name text NOT NULL,
          color text NOT NULL,
          position integer NOT NULL,
          filters text NOT NULL,
          stats text,
          created_at text NOT NULL,
          edited_at text NOT NULL
        );
        CREATE TABLE IF NOT EXISTS comparisons (
          project_id text PRIMARY KEY NOT NULL,
          group_ids text NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tree_settings (
          project_id text PRIMARY KEY NOT NULL,
          attributes text NOT NULL,
          selected_variants text NOT NULL
        );
        """
    )


def write_project_files(app_data_dir: Path, table: pa.Table) -> tuple[Path, Path]:
    projects_dir = app_data_dir / "projects"
    projects_dir.mkdir(parents=True, exist_ok=True)
    destination = projects_dir / PROJECT_ID

    with tempfile.TemporaryDirectory(
        prefix=f".{PROJECT_ID}-", dir=projects_dir
    ) as temp_name:
        temp_dir = Path(temp_name)
        shutil.copyfile(SEED_CSV, temp_dir / "original.csv")
        parquet.write_table(table, temp_dir / "event_log.parquet")
        if destination.exists():
            shutil.rmtree(destination)
        temp_dir.rename(destination)

    return destination / "original.csv", destination / "event_log.parquet"


def write_database(
    app_data_dir: Path,
    original_path: Path,
    event_log_path: Path,
    stats: dict[str, int | str],
) -> None:
    app_data_dir.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(app_data_dir / "compare.db") as connection:
        ensure_schema(connection)
        connection.execute("DELETE FROM groups WHERE project_id = ?", (PROJECT_ID,))
        connection.execute(
            "DELETE FROM comparisons WHERE project_id = ?", (PROJECT_ID,)
        )
        connection.execute(
            "DELETE FROM tree_settings WHERE project_id = ?", (PROJECT_ID,)
        )
        connection.execute(
            """
            INSERT INTO projects (
              id, name, file_name, original_path, event_log_path, columns, hidden_columns,
              events, cases, activities, variants, timespan_start, timespan_end, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              file_name = excluded.file_name,
              original_path = excluded.original_path,
              event_log_path = excluded.event_log_path,
              columns = excluded.columns,
              hidden_columns = excluded.hidden_columns,
              events = excluded.events,
              cases = excluded.cases,
              activities = excluded.activities,
              variants = excluded.variants,
              timespan_start = excluded.timespan_start,
              timespan_end = excluded.timespan_end,
              created_at = excluded.created_at
            """,
            (
                PROJECT_ID,
                PROJECT_NAME,
                SEED_CSV.name,
                str(original_path),
                str(event_log_path),
                json.dumps(COLUMNS, separators=(",", ":")),
                json.dumps(HIDDEN_COLUMNS, separators=(",", ":")),
                stats["events"],
                stats["cases"],
                stats["activities"],
                stats["variants"],
                stats["timespan_start"],
                stats["timespan_end"],
                datetime.now(timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z"),
            ),
        )


def main() -> None:
    args = parse_args()
    app_id = args.app_id or branch_app_id()
    app_data_dir = (
        (args.app_data_dir or default_app_data_dir(app_id)).expanduser().resolve()
    )
    table = read_event_log()
    stats = event_log_stats(table)
    if stats["cases"] != 10_000:
        raise SystemExit(
            f"Expected 10,000 cases in {SEED_CSV}, found {stats['cases']}."
        )

    original_path, event_log_path = write_project_files(app_data_dir, table)
    write_database(app_data_dir, original_path, event_log_path, stats)

    print(f"Seeded {PROJECT_NAME}")
    print(f"  App data: {app_data_dir}")
    print(f"  Project:  {PROJECT_ID}")
    print(f"  Cases:    {stats['cases']:,}")
    print(f"  Events:   {stats['events']:,}")


if __name__ == "__main__":
    main()
