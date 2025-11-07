"""Check the freshness of the UAT clone."""

from __future__ import annotations

import argparse
import json
import logging
from datetime import UTC, datetime
from typing import Optional

from servicenow_tools.servicenow_api import ServiceNowClient, ServiceNowError

LOGGER = logging.getLogger(__name__)
DEFAULT_STALE_DAYS = 30


def configure_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="%(levelname)s %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check when UAT was last cloned from Prod.")
    parser.add_argument(
        "--source-environment",
        default="PROD",
        help="Environment that stores clone history (default: PROD).",
    )
    parser.add_argument(
        "--target-environment",
        default="UAT",
        help="Environment being validated (default: UAT).",
    )
    parser.add_argument(
        "--stale-after-days",
        type=int,
        default=DEFAULT_STALE_DAYS,
        help="Number of days after which the clone is considered stale.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Increase logging verbosity.",
    )
    return parser.parse_args()


def parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M:%S.%f"):
        try:
            dt = datetime.strptime(value, pattern)
            return dt.replace(tzinfo=UTC)
        except ValueError:
            continue
    LOGGER.warning("Unable to parse date value '%s'", value)
    return None


def fetch_last_clone_record(client: ServiceNowClient, target_instance: str) -> Optional[dict]:
    query = f"target_instance={target_instance}^state=completed^ORDERBYDESClast_completed_time"
    fields = "sys_id,source_instance,target_instance,state,sys_created_on,last_completed_time"
    try:
        results = client.query_table("sys_clone_history", query, limit=1, fields=fields)
        if results:
            LOGGER.debug("Using sys_clone_history table for clone data.")
            return results[0]
    except ServiceNowError as exc:
        if "Invalid table" not in str(exc):
            raise
        LOGGER.info("sys_clone_history not available; falling back to sn_instance_clone_request (%s)", exc)

    fallback_query = (
        f"target_instance.instance_name={target_instance}"
        "^state=Completed^ORDERBYDESCcompleted"
    )
    fallback_fields = "sys_id,target_instance,source_instance,state,sys_created_on,completed,started"
    results = client.query_table("sn_instance_clone_request", fallback_query, limit=1, fields=fallback_fields)
    return results[0] if results else None


def evaluate_clone_status(
    client: ServiceNowClient,
    target_instance: str,
    *,
    stale_after_days: int,
) -> dict:
    record = fetch_last_clone_record(client, target_instance)
    if not record:
        raise ServiceNowError(f"No clone history found for target '{target_instance}'.")

    timestamp = (
        record.get("last_completed_time")
        or record.get("completed")
        or record.get("sys_created_on")
    )
    clone_dt = parse_date(timestamp)
    if not clone_dt:
        raise ServiceNowError("Clone record is missing a usable timestamp.")

    now = datetime.now(tz=UTC)
    days_since = (now - clone_dt).days
    is_stale = days_since > stale_after_days
    status = "WARNING" if is_stale else "OK"

    return {
        "target_instance": target_instance,
        "last_clone_date": clone_dt.isoformat(),
        "days_since_clone": days_since,
        "is_stale": is_stale,
        "status": status,
        "raw_record_sys_id": record.get("sys_id"),
    }


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    client = ServiceNowClient.from_environment(args.source_environment)
    target_name = ServiceNowClient.from_environment(args.target_environment).credentials.instance_name

    status = evaluate_clone_status(
        client,
        target_instance=target_name,
        stale_after_days=args.stale_after_days,
    )
    print(json.dumps(status, indent=2))


if __name__ == "__main__":
    main()
