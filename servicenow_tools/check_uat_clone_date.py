"""Utility script to evaluate the freshness of the UAT environment clone.

The script calls the ServiceNow clone history API and determines whether the
UAT instance is older than the configured freshness threshold (default 30 days).
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Any, Optional

from .servicenow_api import (
    ServiceNowAPIClient,
    ServiceNowAPIError,
    extract_instance_name,
    load_environment_config,
)

LOGGER = logging.getLogger(__name__)

DEFAULT_STALE_DAYS = 30


@dataclass(slots=True)
class CloneStatus:
    """Structured summary of the UAT clone freshness."""

    last_clone_date: Optional[datetime]
    days_since_clone: Optional[int]
    is_stale: bool
    warning_message: Optional[str]
    raw_record: Optional[dict[str, Any]] = None
    target_instance_name: Optional[str] = None

    def to_serialisable(self) -> dict[str, Any]:
        """Render the dataclass as a JSON-ready dictionary."""
        payload = asdict(self)
        if self.last_clone_date:
            payload["last_clone_date"] = self.last_clone_date.isoformat()
        return payload


def parse_servicenow_date(value: str | None) -> Optional[datetime]:
    """Parse a ServiceNow date string into a timezone-aware datetime."""
    if not value:
        return None

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S.%f%z",
    ]
    for fmt in formats:
        try:
            parsed = datetime.strptime(value, fmt)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC)
        except ValueError:
            continue
    raise ValueError(f"Unable to parse ServiceNow date '{value}'")


def evaluate_clone_status(
    client: ServiceNowAPIClient,
    target_instance_name: str,
    *,
    stale_after_days: int = DEFAULT_STALE_DAYS,
) -> CloneStatus:
    """Retrieve clone history and compute freshness metrics."""
    try:
        record = client.get_clone_info(target_instance=target_instance_name)
    except ServiceNowAPIError as exc:
        LOGGER.error("Failed to retrieve clone info: %s", exc)
        raise

    timestamp_value = (
        record.get("completed")
        or record.get("finished")
        or record.get("sys_created_on")
        or record.get("scheduled")
    )
    finished_at = parse_servicenow_date(timestamp_value)
    if not finished_at:
        warning = "Clone history record is missing a finished timestamp."
        LOGGER.warning(warning)
        return CloneStatus(
            last_clone_date=None,
            days_since_clone=None,
            is_stale=True,
            warning_message=warning,
            raw_record=record,
            target_instance_name=target_instance_name,
        )

    now_utc = datetime.now(tz=UTC)
    days_since = (now_utc - finished_at).days
    is_stale = days_since > stale_after_days
    warning_message = None
    if is_stale:
        warning_message = (
            f"UAT clone is stale: {days_since} days since clone "
            f"(threshold {stale_after_days} days)."
        )
        LOGGER.warning(warning_message)

    return CloneStatus(
        last_clone_date=finished_at,
        days_since_clone=days_since,
        is_stale=is_stale,
        warning_message=warning_message,
        raw_record=record,
        target_instance_name=target_instance_name,
    )


def configure_logging(verbosity: int) -> None:
    """Configure root logging level based on verbosity count."""
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="%(levelname)s %(name)s - %(message)s")


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description="Check UAT clone freshness.")
    parser.add_argument(
        "--target-environment",
        "-t",
        default="UAT",
        help="Target environment to evaluate (default: UAT).",
    )
    parser.add_argument(
        "--environment",
        dest="target_environment",
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--source-environment",
        "-s",
        default="PROD",
        help="Environment that holds clone history (default: PROD).",
    )
    parser.add_argument(
        "--stale-after-days",
        type=int,
        default=DEFAULT_STALE_DAYS,
        help="Threshold in days before marking the clone as stale.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Increase logging verbosity.",
    )
    return parser.parse_args()


def main() -> None:
    """Entrypoint for CLI usage."""
    args = parse_args()
    configure_logging(args.verbose)

    target_env = (args.target_environment or "UAT").upper()
    source_env = (args.source_environment or "PROD").upper()

    target_config = load_environment_config(target_env)
    target_instance_name = extract_instance_name(target_config.instance_url)

    client = ServiceNowAPIClient(source_env)
    status = evaluate_clone_status(
        client,
        target_instance_name,
        stale_after_days=args.stale_after_days,
    )
    print(json.dumps(status.to_serialisable(), indent=2))


if __name__ == "__main__":
    main()
