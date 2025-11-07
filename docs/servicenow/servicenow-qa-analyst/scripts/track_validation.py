"""Simple NeonDB logger for validation results."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict

import psycopg2


def log_validation(change_number: str, validation_results: Dict[str, Any]) -> None:
    """Persist validation results to the Neon/Postgres database."""
    database_url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        raise EnvironmentError("NEON_DATABASE_URL or DATABASE_URL is not configured.")

    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS change_validations (
                    id SERIAL PRIMARY KEY,
                    change_number VARCHAR(50),
                    validation_date TIMESTAMP WITH TIME ZONE,
                    overall_status VARCHAR(20),
                    checks JSONB,
                    duration_seconds DOUBLE PRECISION
                )
                """
            )
            cur.execute(
                """
                INSERT INTO change_validations (
                    change_number,
                    validation_date,
                    overall_status,
                    checks,
                    duration_seconds
                ) VALUES (%s, %s, %s, %s, %s)
                """,
                (
                    change_number,
                    datetime.now(tz=timezone.utc),
                    validation_results.get("overall_status"),
                    json.dumps(validation_results.get("checks", {})),
                    validation_results.get("duration_seconds", 0.0),
                ),
            )
    finally:
        conn.close()


if __name__ == "__main__":
    sample = {
        "overall_status": "PASSED",
        "checks": {"exists": True, "active": True},
        "duration_seconds": 1.23,
    }
    log_validation("CHG-DEMO", sample)
    print("Logged validation result for CHG-DEMO.")
