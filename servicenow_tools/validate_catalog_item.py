"""Lightweight catalog item validation for ServiceNow QA."""

from __future__ import annotations

import argparse
import json
import logging
import time
from typing import Any, Dict

from servicenow_tools.servicenow_api import ServiceNowClient, ServiceNowError

LOGGER = logging.getLogger(__name__)
CATALOG_FIELDS = "sys_id,name,active,short_description,workflow,category,sc_catalogs"


def configure_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="%(levelname)s %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Lightweight ServiceNow catalog item validation.")
    parser.add_argument(
        "catalog_items",
        nargs="+",
        help="Catalog item sys_id(s) to validate.",
    )
    parser.add_argument(
        "--environment",
        default="UAT",
        help="ServiceNow environment (default: UAT).",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        help="Optional path to write validation results as JSON.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Increase logging verbosity.",
    )
    parser.add_argument(
        "--catalog-limit",
        type=int,
        default=None,
        help="Validate at most N catalog items.",
    )
    return parser.parse_args()


def to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"true", "1", "yes"}
    return bool(value)


def validate_catalog_item(client: ServiceNowClient, sys_id: str) -> Dict[str, Any]:
    start = time.perf_counter()
    try:
        item = client.get_catalog_item(sys_id, fields=CATALOG_FIELDS)
    except ServiceNowError as exc:
        LOGGER.error("Failed to load catalog item %s: %s", sys_id, exc)
        duration = time.perf_counter() - start
        return {
            "catalog_item_sys_id": sys_id,
            "item_name": None,
            "overall_status": "FAILED",
            "duration_seconds": duration,
            "checks": {
                "exists": False,
                "active": False,
                "display_name_valid": False,
                "has_workflow": False,
                "has_category": False,
            },
            "details": {"error": str(exc)},
        }

    name = item.get("name") or ""
    checks = {
        "exists": True,
        "active": to_bool(item.get("active", "true")),
        "display_name_valid": not any(
            token in name.lower() for token in ("copy of", "template", "test", "draft")
        ),
        "has_workflow": bool(item.get("workflow")),
        "has_category": bool(item.get("category") or item.get("sc_catalogs")),
    }
    overall_status = "PASSED" if all(checks.values()) else "FAILED"
    duration = time.perf_counter() - start

    return {
        "catalog_item_sys_id": sys_id,
        "item_name": name,
        "overall_status": overall_status,
        "duration_seconds": duration,
        "checks": checks,
        "snapshot": item,
    }


def format_summary(result: Dict[str, Any]) -> str:
    symbol = "✓" if result["overall_status"] == "PASSED" else "✗"
    lines = [
        f"{symbol} Catalog Item: \"{result.get('item_name') or result['catalog_item_sys_id']}\" "
        f"({result['overall_status']})",
    ]
    checks = result["checks"]
    lines.append(f"  • Exists: {'✓' if checks['exists'] else '✗'}")
    lines.append(f"  • Active: {'✓' if checks['active'] else '✗'}")
    lines.append(f"  • Display name valid: {'✓' if checks['display_name_valid'] else '✗'}")
    lines.append(f"  • Workflow attached: {'✓' if checks['has_workflow'] else '✗'}")
    lines.append(f"  • Category assigned: {'✓' if checks['has_category'] else '✗'}")
    if "details" in result:
        lines.append(f"  • Error: {result['details']['error']}")
    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    client = ServiceNowClient.from_environment(args.environment)
    targets = args.catalog_items[: args.catalog_limit] if args.catalog_limit else args.catalog_items

    results = [validate_catalog_item(client, sys_id) for sys_id in targets]

    for result in results:
        print(format_summary(result))
        print()

    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as handle:
            json.dump(results, handle, indent=2)
        print(f"Validation payload written to {args.output_json}")


if __name__ == "__main__":
    main()
