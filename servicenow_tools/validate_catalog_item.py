"""Catalog item validation script for ServiceNow QA automation.

The validator inspects ServiceNow catalog items for common misconfigurations
prior to production deployment. It evaluates naming, metadata, attached
workflows, and variable definitions.
"""

from __future__ import annotations

import argparse
import json
import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Iterable, List, Mapping, Optional

from .servicenow_api import ServiceNowAPIClient, ServiceNowAPIError, is_sys_id

LOGGER = logging.getLogger(__name__)

PROHIBITED_NAME_TOKENS = ("copy of", "template", "draft", "test")
WEAK_DESCRIPTION_TOKENS = ("tbd", "lorem", "test", "sample")


@dataclass(slots=True)
class ValidationCheck:
    """Individual check outcome."""

    name: str
    passed: bool
    severity: str = "ERROR"
    details: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        return payload


@dataclass(slots=True)
class CatalogItemValidationResult:
    """Aggregate result for a single catalog item."""

    catalog_item_sys_id: str
    environment: str
    checks: List[ValidationCheck]
    overall_status: str
    duration_seconds: float
    item_snapshot: dict[str, Any] = field(default_factory=dict)
    variable_summary: dict[str, Any] = field(default_factory=dict)
    raw_item: Optional[dict[str, Any]] = None
    raw_variables: Optional[List[dict[str, Any]]] = None

    def to_serialisable(self) -> dict[str, Any]:
        return {
            "catalog_item_sys_id": self.catalog_item_sys_id,
            "environment": self.environment,
            "checks": [check.to_dict() for check in self.checks],
            "overall_status": self.overall_status,
            "duration_seconds": round(self.duration_seconds, 3),
            "item_snapshot": self.item_snapshot,
            "variable_summary": self.variable_summary,
            "raw_item": self.raw_item,
            "raw_variables": self.raw_variables,
        }


class CatalogItemValidator:
    """Validator implementation using the ServiceNow API client."""

    def __init__(self, client: ServiceNowAPIClient, *, include_raw: bool = False) -> None:
        self.client = client
        self.include_raw = include_raw

    def validate(self, identifier: str) -> CatalogItemValidationResult:
        """Validate a catalog item identified by sys_id or name."""
        start = time.perf_counter()
        LOGGER.info("Validating catalog item %s", identifier)
        item = self.client.get_catalog_item(identifier)
        variables = self.client.get_catalog_item_variables(item["sys_id"])

        checks: list[ValidationCheck] = []
        checks.append(self._check_active(item))
        checks.append(self._check_display_name(item))
        checks.append(self._check_short_description(item))
        checks.append(self._check_workflow(item))
        checks.append(self._check_category(item))
        checks.append(self._check_media(item))
        checks.extend(self._check_variables(variables))

        overall_status = determine_overall_status(checks)
        duration = time.perf_counter() - start
        LOGGER.info(
            "Validation complete for %s (status=%s, duration=%.2fs)",
            identifier,
            overall_status,
            duration,
        )
        snapshot = {
            "name": item.get("name"),
            "short_description": item.get("short_description"),
            "active": item.get("active"),
            "category": item.get("category"),
            "workflow": item.get("workflow"),
            "flow_designer_flow": item.get("flow_designer_flow"),
            "sys_updated_on": item.get("sys_updated_on"),
            "icon": item.get("icon"),
            "picture": item.get("picture"),
        }

        return CatalogItemValidationResult(
            catalog_item_sys_id=item["sys_id"],
            environment=self.client.environment,
            checks=checks,
            overall_status=overall_status,
            duration_seconds=duration,
            item_snapshot=snapshot,
            variable_summary=self._summarise_variables(variables),
            raw_item=item if self.include_raw else None,
            raw_variables=variables if self.include_raw else None,
        )

    def _check_active(self, item: dict[str, Any]) -> ValidationCheck:
        active = _to_bool(item.get("active", True))
        details = None if active else "Catalog item is inactive."
        return ValidationCheck("item_active", active, "ERROR", details)

    def _check_display_name(self, item: dict[str, Any]) -> ValidationCheck:
        name = (item.get("name") or "").strip()
        lower = name.lower()
        for token in PROHIBITED_NAME_TOKENS:
            if token in lower:
                return ValidationCheck(
                    "display_name_clean",
                    False,
                    "ERROR",
                    f"Display name contains prohibited token '{token}'.",
                )
        return ValidationCheck("display_name_clean", True, "INFO")

    def _check_short_description(self, item: dict[str, Any]) -> ValidationCheck:
        short_description = (item.get("short_description") or "").strip()
        if not short_description:
            return ValidationCheck(
                "short_description_present",
                False,
                "ERROR",
                "Short description is missing.",
            )
        if len(short_description) < 15:
            return ValidationCheck(
                "short_description_length",
                False,
                "WARNING",
                "Short description is unusually short (<15 characters).",
            )
        lower = short_description.lower()
        if any(token in lower for token in WEAK_DESCRIPTION_TOKENS):
            return ValidationCheck(
                "short_description_quality",
                False,
                "WARNING",
                "Short description contains placeholder text.",
            )
        return ValidationCheck("short_description_quality", True, "INFO")

    def _check_workflow(self, item: dict[str, Any]) -> ValidationCheck:
        has_workflow = bool(item.get("workflow") or item.get("flow_designer_flow"))
        if has_workflow:
            return ValidationCheck("workflow_attached", True, "INFO")
        return ValidationCheck(
            "workflow_attached",
            False,
            "ERROR",
            "No workflow or Flow Designer flow is attached to the catalog item.",
        )

    def _check_category(self, item: dict[str, Any]) -> ValidationCheck:
        category = item.get("category") or item.get("categories")
        if category:
            return ValidationCheck("category_set", True, "INFO")
        return ValidationCheck("category_set", False, "ERROR", "Catalog item has no category.")

    def _check_media(self, item: dict[str, Any]) -> ValidationCheck:
        if item.get("picture") or item.get("icon"):
            return ValidationCheck("media_present", True, "INFO")
        return ValidationCheck(
            "media_present",
            False,
            "WARNING",
            "Catalog item is missing an icon or picture.",
        )

    def _check_variables(self, variables: Iterable[dict[str, Any]]) -> list[ValidationCheck]:
        variables = list(variables)
        checks: list[ValidationCheck] = []
        if not variables:
            checks.append(
                ValidationCheck(
                    "variables_defined",
                    False,
                    "WARNING",
                    "Catalog item has no variables defined.",
                )
            )
            return checks

        invalid_question = [
            var["name"]
            for var in variables
            if not (var.get("question_text") or "").strip()
        ]
        inactive_vars = [
            var["name"]
            for var in variables
            if not _to_bool(var.get("active", True))
        ]
        mandatory_missing_help = [
            var["name"]
            for var in variables
            if _to_bool(var.get("mandatory", False))
            and not (var.get("help_text") or "").strip()
        ]

        if invalid_question:
            checks.append(
                ValidationCheck(
                    "variable_question_text",
                    False,
                    "ERROR",
                    f"Variables missing question text: {format_list(invalid_question)}",
                )
            )
        else:
            checks.append(ValidationCheck("variable_question_text", True, "INFO"))

        if inactive_vars:
            checks.append(
                ValidationCheck(
                    "variable_active_state",
                    False,
                    "WARNING",
                    f"Inactive variables: {format_list(inactive_vars)}",
                )
            )
        else:
            checks.append(ValidationCheck("variable_active_state", True, "INFO"))

        if mandatory_missing_help:
            checks.append(
                ValidationCheck(
                    "variable_help_text",
                    False,
                    "WARNING",
                    "Mandatory variables missing help text: "
                    f"{format_list(mandatory_missing_help)}",
                )
            )
        else:
            checks.append(ValidationCheck("variable_help_text", True, "INFO"))

        return checks

    def _summarise_variables(self, variables: Iterable[dict[str, Any]]) -> dict[str, Any]:
        variables = list(variables)
        mandatory = [var for var in variables if _to_bool(var.get("mandatory"))]
        inactive = [var for var in variables if not _to_bool(var.get("active", True))]
        missing_question = [var for var in variables if not (var.get("question_text") or "").strip()]
        missing_help = [
            var
            for var in variables
            if _to_bool(var.get("mandatory"))
            and not (var.get("help_text") or var.get("instructions") or "").strip()
        ]
        return {
            "total": len(variables),
            "mandatory": len(mandatory),
            "inactive": len(inactive),
            "missing_question_text": len(missing_question),
            "mandatory_missing_help": len(missing_help),
            "sample_names": [var.get("name") for var in variables[:5]],
        }


def build_summary_lines(result: CatalogItemValidationResult) -> List[str]:
    """Create human-readable summary lines for a validation result."""
    snapshot = result.item_snapshot or {}
    summary = result.variable_summary or _empty_variable_summary()
    check_map = {check.name: check for check in result.checks}

    name = snapshot.get("name") or result.catalog_item_sys_id or "<unknown>"
    active = _to_bool(snapshot.get("active", True))
    lines: list[str] = []

    api_error = check_map.get("api_error")
    if api_error and len(check_map) == 1:
        lines.append(f"{status_symbol(False)} Catalog Item: \"{name}\" - validation failed")
        lines.append(f"  • {api_error.details or 'ServiceNow API error'}")
        return lines

    lines.append(f"{status_symbol(active)} Catalog Item: \"{name}\" ({'active' if active else 'inactive'})")

    display_check = check_map.get("display_name_clean")
    if display_check:
        if display_check.passed:
            lines.append(f"{status_symbol(True)} Display name is valid (no clone/template markers)")
        else:
            lines.append(f"{status_symbol(False)} Display name issue: {display_check.details or 'Requires update.'}")

    lines.append(describe_short_description(snapshot, check_map))
    lines.append(describe_workflow(snapshot, check_map))
    lines.append(describe_category(snapshot, check_map))
    lines.append(describe_media(snapshot, check_map))
    lines.extend(describe_variables(summary, check_map))

    # Remove any empty strings that helper functions may return.
    return [line for line in lines if line]


def determine_overall_status(checks: Iterable[ValidationCheck]) -> str:
    """Compute the overall status from individual checks."""
    has_error = any((not check.passed) and check.severity == "ERROR" for check in checks)
    has_warning = any((not check.passed) and check.severity == "WARNING" for check in checks)
    if has_error:
        return "FAILED"
    if has_warning:
        return "PASSED_WITH_WARNINGS"
    return "PASSED"


def status_symbol(passed: bool) -> str:
    return "✓" if passed else "✗"


def describe_short_description(
    snapshot: Mapping[str, Any],
    check_map: Mapping[str, ValidationCheck],
) -> str:
    short_description = (snapshot.get("short_description") or "").strip()
    present_check = check_map.get("short_description_present")
    length_check = check_map.get("short_description_length")
    quality_check = check_map.get("short_description_quality")

    if not short_description:
        detail = present_check.details if present_check else "Short description is missing."
        return f"{status_symbol(False)} Short description missing: {detail}"

    if quality_check and not quality_check.passed:
        detail = quality_check.details or "Short description needs better context."
        return f"{status_symbol(False)} Short description issue: {detail} (\"{short_description}\")"

    if length_check and not length_check.passed:
        detail = length_check.details or "Short description length warning."
        return f"{status_symbol(False)} Short description warning: {detail} (\"{short_description}\")"

    return f"{status_symbol(True)} Short description looks good: \"{short_description}\""


def describe_workflow(
    snapshot: Mapping[str, Any],
    check_map: Mapping[str, ValidationCheck],
) -> str:
    workflow_check = check_map.get("workflow_attached")
    workflow_ref = _format_reference(snapshot.get("workflow")) or _format_reference(snapshot.get("flow_designer_flow"))
    if workflow_check and workflow_check.passed:
        label = workflow_ref or "Workflow configured"
        return f"{status_symbol(True)} Workflow attached: {label}"
    detail = (workflow_check.details if workflow_check else None) or "No workflow or flow configured."
    return f"{status_symbol(False)} Workflow attached: {detail}"


def describe_category(
    snapshot: Mapping[str, Any],
    check_map: Mapping[str, ValidationCheck],
) -> str:
    category_check = check_map.get("category_set")
    category_label = _format_reference(snapshot.get("category"))
    if category_check and category_check.passed:
        label = category_label or "Assigned category"
        return f"{status_symbol(True)} Category assigned: {label}"
    if category_check:
        detail = category_check.details or "Category missing."
    else:
        detail = "Category not evaluated."
    return f"{status_symbol(False)} Category issue: {detail}"


def describe_media(
    snapshot: Mapping[str, Any],
    check_map: Mapping[str, ValidationCheck],
) -> str:
    media_check = check_map.get("media_present")
    icon_or_picture = snapshot.get("icon") or snapshot.get("picture")
    if media_check and media_check.passed:
        asset = icon_or_picture or "Icon/Picture configured"
        return f"{status_symbol(True)} Icon set ({asset})"
    if media_check:
        detail = media_check.details or "Icon or picture missing."
        return f"{status_symbol(False)} Icon missing: {detail}"
    return ""


def describe_variables(
    summary: Mapping[str, Any],
    check_map: Mapping[str, ValidationCheck],
) -> list[str]:
    total = int(summary.get("total") or 0)
    issue_checks = [
        check
        for name, check in check_map.items()
        if name in {"variable_question_text", "variable_active_state", "variable_help_text"}
        and not check.passed
    ]
    issue_count = len(issue_checks)
    estimated_valid = max(total - issue_count, 0)
    lines = [
        f"{status_symbol(issue_count == 0)} Variables configured: {total} total, "
        f"{estimated_valid} passing, {issue_count} issue{'s' if issue_count != 1 else ''}"
    ]
    for check in issue_checks:
        detail = check.details or f"{check.name} failed."
        lines.append(f"  • {detail}")
    return lines


def _to_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in {"true", "1", "yes"}
    return bool(value)


def _empty_variable_summary() -> dict[str, Any]:
    return {
        "total": 0,
        "mandatory": 0,
        "inactive": 0,
        "missing_question_text": 0,
        "mandatory_missing_help": 0,
        "sample_names": [],
    }


def format_list(values: Iterable[str], limit: int = 12) -> str:
    seq = [v for v in values if v]
    if not seq:
        return ""
    if len(seq) <= limit:
        return ", ".join(seq)
    remainder = len(seq) - limit
    return ", ".join(seq[:limit]) + f", ... (+{remainder} more)"


def _format_reference(value: Any) -> str:
    if isinstance(value, Mapping):
        return value.get("display_value") or value.get("value") or ""
    return str(value) if value else ""


def configure_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="%(levelname)s %(name)s - %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate a ServiceNow catalog item.")
    parser.add_argument(
        "catalog_items",
        nargs="+",
        help="Catalog item sys_id(s) or names to validate.",
    )
    parser.add_argument(
        "--environment",
        default="UAT",
        help="ServiceNow environment (default: UAT).",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print full JSON payloads in addition to the summary output.",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        help="Write the full validation payload (including raw data) to a file.",
    )
    parser.add_argument(
        "--catalog-limit",
        type=int,
        default=1,
        help="Maximum number of catalog items to validate (default: 1).",
    )
    parser.add_argument(
        "-v",
        "--log-verbose",
        dest="log_verbose",
        action="count",
        default=0,
        help="Increase logging verbosity.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    configure_logging(args.log_verbose)

    include_raw = args.verbose or bool(args.output_json)
    client = ServiceNowAPIClient(args.environment)
    validator = CatalogItemValidator(client, include_raw=include_raw)

    catalog_items = args.catalog_items
    if args.catalog_limit and args.catalog_limit > 0:
        catalog_items = catalog_items[: args.catalog_limit]

    results: list[CatalogItemValidationResult] = []
    for identifier in catalog_items:
        try:
            result = validator.validate(identifier)
            results.append(result)
        except ServiceNowAPIError as exc:
            LOGGER.error("Validation failed for %s: %s", identifier, exc)
            error_result = CatalogItemValidationResult(
                catalog_item_sys_id=identifier if is_sys_id(identifier) else identifier,
                environment=args.environment.upper(),
                checks=[
                    ValidationCheck(
                        name="api_error",
                        passed=False,
                        severity="ERROR",
                        details=str(exc),
                    )
                ],
                overall_status="FAILED",
                duration_seconds=0.0,
                item_snapshot={"name": identifier},
                variable_summary=_empty_variable_summary(),
            )
            results.append(error_result)

    for result in results:
        for line in build_summary_lines(result):
            print(line)
        print()

    serialised = [result.to_serialisable() for result in results]
    if args.verbose:
        print(json.dumps(serialised, indent=2))

    if args.output_json:
        with open(args.output_json, "w", encoding="utf-8") as handle:
            json.dump(serialised, handle, indent=2)
        print(f"Full validation payload written to {args.output_json}")


if __name__ == "__main__":
    main()
