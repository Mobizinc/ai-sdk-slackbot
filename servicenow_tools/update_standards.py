"""Update living standards documentation based on recent validation data."""

from __future__ import annotations

import argparse
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

import psycopg2
import psycopg2.extras

LOGGER = logging.getLogger(__name__)

COMMON_MISTAKES_FILE = Path("common_mistakes.md")
STANDARDS_FILE = Path("standards.md")

COMMON_MARKER_START = "<!-- AUTO-GENERATED:VALIDATION_COMMON_ISSUES -->"
COMMON_MARKER_END = "<!-- /AUTO-GENERATED:VALIDATION_COMMON_ISSUES -->"

STANDARDS_MARKER_START = "<!-- AUTO-GENERATED:VALIDATION_STANDARD_SUGGESTIONS -->"
STANDARDS_MARKER_END = "<!-- /AUTO-GENERATED:VALIDATION_STANDARD_SUGGESTIONS -->"


@dataclass(slots=True)
class FrequentIssue:
    """Aggregated validation issue."""

    check_name: str
    occurrences: int
    sample_details: str


def configure_logging(verbosity: int) -> None:
    level = logging.WARNING
    if verbosity == 1:
        level = logging.INFO
    elif verbosity >= 2:
        level = logging.DEBUG
    logging.basicConfig(level=level, format="%(levelname)s %(name)s - %(message)s")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze validation history and update documentation.",
    )
    parser.add_argument(
        "--min-occurrences",
        type=int,
        default=3,
        help="Minimum repeated occurrences required to flag an issue.",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="count",
        default=0,
        help="Increase logging verbosity.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print suggested updates without modifying files.",
    )
    return parser.parse_args()


def fetch_common_issues(database_url: str, min_occurrences: int) -> list[FrequentIssue]:
    query = """
        SELECT
            checks_elem ->> 'name' AS check_name,
            COUNT(*) AS occurrences,
            MAX(checks_elem ->> 'details') FILTER (WHERE checks_elem ->> 'details' IS NOT NULL) AS sample_details
        FROM validation_results vr,
             LATERAL jsonb_array_elements(vr.checks) AS checks_elem
        WHERE COALESCE((checks_elem ->> 'passed')::boolean, false) IS FALSE
        GROUP BY check_name
        HAVING COUNT(*) >= %(min_occurrences)s
        ORDER BY occurrences DESC, check_name ASC;
    """
    with psycopg2.connect(database_url) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(query, {"min_occurrences": min_occurrences})
            rows = cur.fetchall()
    issues = [
        FrequentIssue(
            check_name=row["check_name"],
            occurrences=row["occurrences"],
            sample_details=row.get("sample_details") or "",
        )
        for row in rows
    ]
    LOGGER.info("Identified %d common issues meeting threshold.", len(issues))
    return issues


def build_common_issues_table(issues: Iterable[FrequentIssue]) -> str:
    """Render a markdown table for common issues."""
    lines = [
        "| Check | Occurrences | Sample Details |",
        "| --- | ---: | --- |",
    ]
    for issue in issues:
        details = issue.sample_details.replace("\n", " ").strip()
        if not details:
            details = "—"
        lines.append(f"| {issue.check_name} | {issue.occurrences} | {details} |")
    return "\n".join(lines)


def build_standard_suggestions(issues: Iterable[FrequentIssue]) -> str:
    lines = []
    for issue in issues:
        suggestion = (
            f"- Investigate recurring `{issue.check_name}` failures "
            f"(observed {issue.occurrences} times) and codify remediation steps."
        )
        lines.append(suggestion)
    if not lines:
        lines.append("- No new recurring issues met the threshold this run.")
    return "\n".join(lines)


def update_markdown_file(path: Path, start_marker: str, end_marker: str, content: str) -> None:
    if not path.exists():
        LOGGER.debug("Creating markdown file %s.", path)
        header = f"# {path.stem.replace('_', ' ').title()}\n\n"
        rendered = f"{header}{start_marker}\n{content}\n{end_marker}\n"
        path.write_text(rendered, encoding="utf-8")
        return

    current = path.read_text(encoding="utf-8")
    if start_marker in current and end_marker in current:
        before, _, remainder = current.partition(start_marker)
        _, _, after = remainder.partition(end_marker)
        new_content = f"{before}{start_marker}\n{content}\n{end_marker}{after}"
    else:
        if not current.endswith("\n"):
            current += "\n"
        new_content = f"{current}{start_marker}\n{content}\n{end_marker}\n"
    path.write_text(new_content, encoding="utf-8")


def main() -> None:
    args = parse_args()
    configure_logging(args.verbose)

    database_url = os.getenv("NEON_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("NEON_DATABASE_URL or DATABASE_URL is not configured.")

    issues = fetch_common_issues(database_url, args.min_occurrences)
    common_table = build_common_issues_table(issues)
    standards_list = build_standard_suggestions(issues)

    if args.dry_run:
        print("Common Issues Table:\n")
        print(common_table)
        print("\nSuggested Standards:\n")
        print(standards_list)
        return

    update_markdown_file(COMMON_MISTAKES_FILE, COMMON_MARKER_START, COMMON_MARKER_END, common_table)
    update_markdown_file(STANDARDS_FILE, STANDARDS_MARKER_START, STANDARDS_MARKER_END, standards_list)
    LOGGER.info("Documentation updated from validation history.")


if __name__ == "__main__":
    main()
