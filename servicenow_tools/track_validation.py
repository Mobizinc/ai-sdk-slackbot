"""NeonDB logging utilities for catalog item validation results."""

from __future__ import annotations

import argparse
import json
import logging
import os
import uuid
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, List, Optional

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg.types.json import Json

LOGGER = logging.getLogger(__name__)

TABLE_NAME = "validation_results"

CREATE_TABLE_SQL = f"""
CREATE TABLE IF NOT EXISTS {TABLE_NAME} (
    validation_id UUID PRIMARY KEY,
    change_number TEXT,
    component_type TEXT NOT NULL,
    component_sys_id TEXT NOT NULL,
    environment TEXT NOT NULL,
    validation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    overall_status TEXT NOT NULL,
    checks JSONB NOT NULL,
    duration_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
    duration_recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


@dataclass(slots=True)
class ValidationRecord:
    """Structure representing a validation result to persist."""

    component_type: str
    component_sys_id: str
    environment: str
    overall_status: str
    checks: List[dict[str, Any]]
    duration_seconds: float
    validation_id: uuid.UUID = field(default_factory=uuid.uuid4)
    change_number: Optional[str] = None
    validation_date: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["validation_id"] = str(self.validation_id)
        return payload


class ValidationTracker:
    """Helper class for inserting and querying validation results."""

    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise EnvironmentError("NEON_DATABASE_URL or DATABASE_URL is not configured.")
        self.database_url = database_url

    def ensure_schema(self) -> None:
        LOGGER.debug("Ensuring validation_results table exists.")
        with psycopg.connect(self.database_url, autocommit=True) as conn:
            conn.execute(CREATE_TABLE_SQL)

    def log_result(self, record: ValidationRecord) -> None:
        LOGGER.info(
            "Logging validation result %s (%s %s)",
            record.validation_id,
            record.component_type,
            record.component_sys_id,
        )
        self.ensure_schema()
        insert_sql = sql.SQL(
            """
            INSERT INTO {table} (
                validation_id,
                change_number,
                component_type,
                component_sys_id,
                environment,
                validation_date,
                overall_status,
                checks,
                duration_seconds
            )
            VALUES (%(validation_id)s, %(change_number)s, %(component_type)s,
                    %(component_sys_id)s, %(environment)s, %(validation_date)s,
                    %(overall_status)s, %(checks)s, %(duration_seconds)s)
            ON CONFLICT (validation_id)
            DO UPDATE SET
                change_number = EXCLUDED.change_number,
                component_type = EXCLUDED.component_type,
                component_sys_id = EXCLUDED.component_sys_id,
                environment = EXCLUDED.environment,
                validation_date = EXCLUDED.validation_date,
                overall_status = EXCLUDED.overall_status,
                checks = EXCLUDED.checks,
                duration_seconds = EXCLUDED.duration_seconds
            ;
            """
        ).format(table=sql.Identifier(TABLE_NAME))

        with psycopg.connect(self.database_url, autocommit=True) as conn:
            conn.execute(
                insert_sql,
                {
                    "validation_id": record.validation_id,
                    "change_number": record.change_number,
                    "component_type": record.component_type,
                    "component_sys_id": record.component_sys_id,
                    "environment": record.environment,
                    "validation_date": record.validation_date,
                    "overall_status": record.overall_status,
                    "checks": Json(record.checks),
                    "duration_seconds": record.duration_seconds,
                },
            )

    def list_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        self.ensure_schema()
        query = sql.SQL(
            """
            SELECT *
            FROM {table}
            ORDER BY validation_date DESC
            LIMIT %(limit)s;
            """
        ).format(table=sql.Identifier(TABLE_NAME))

        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            rows = conn.execute(query, {"limit": limit}).fetchall()
        LOGGER.debug("Fetched %d records from validation_results.", len(rows))
        return rows


def configure_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="%(levelname)s %(name)s - %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Log ServiceNow validation results to NeonDB.")
    parser.add_argument(
        "--input-json",
        help="Path to JSON file containing validation results.",
    )
    parser.add_argument(
        "--list-recent",
        action="store_true",
        help="List recent validation results instead of logging a new one.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Number of records to list when using --list-recent.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Increase logging verbosity.",
    )
    return parser.parse_args()


def load_records_from_file(path: str) -> Iterable[ValidationRecord]:
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if isinstance(payload, dict):
        payload = [payload]
    records: list[ValidationRecord] = []
    for item in payload:
        records.append(
            ValidationRecord(
                validation_id=uuid.UUID(item.get("validation_id")) if item.get("validation_id") else uuid.uuid4(),
                change_number=item.get("change_number"),
                component_type=item["component_type"],
                component_sys_id=item["component_sys_id"],
                environment=item["environment"],
                overall_status=item["overall_status"],
                checks=item.get("checks", []),
                duration_seconds=float(item.get("duration_seconds", 0)),
                validation_date=item.get("validation_date"),
            )
        )
    return records


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    database_url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
    tracker = ValidationTracker(database_url)

    if args.list_recent:
        results = tracker.list_recent(limit=args.limit)
        print(json.dumps(results, indent=2, default=str))
        return

    if not args.input_json:
        raise SystemExit("Provide --input-json when logging validation results.")

    records = load_records_from_file(args.input_json)
    for record in records:
        tracker.log_result(record)
    LOGGER.info("Logged %d validation records.", len(records))


if __name__ == "__main__":
    main()
