"""Lightweight ServiceNow API helper for QA automation scripts."""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Optional
from urllib.parse import urlparse

import requests
from requests import Response, Session

LOGGER = logging.getLogger(__name__)


class ServiceNowError(RuntimeError):
    """Raised when the ServiceNow API returns a failure."""


@dataclass(slots=True)
class ServiceNowCredentials:
    """Container for ServiceNow connection settings."""

    url: str
    username: str
    password: str
    verify_ssl: bool = True
    timeout: int = 30

    @property
    def instance_name(self) -> str:
        parsed = urlparse(self.url)
        host = parsed.hostname or self.url
        return host.split(".")[0]


class ServiceNowClient:
    """Minimal REST client for ServiceNow table endpoints."""

    def __init__(self, credentials: ServiceNowCredentials, session: Optional[Session] = None) -> None:
        self.credentials = credentials
        self.session = session or requests.Session()

    # ------------------------------------------------------------------ #
    # Helper constructors
    # ------------------------------------------------------------------ #
    @classmethod
    def from_environment(cls, environment: str) -> "ServiceNowClient":
        """Instantiate a client using SERVICENOW_<ENV>_* environment variables."""
        env = environment.upper()
        prefixes = [
            f"{env}_SERVICENOW",
            f"SERVICENOW_{env}",
            "SERVICENOW",
        ]

        def _lookup(key_suffix: str) -> Optional[str]:
            for prefix in prefixes:
                value = os.getenv(f"{prefix}_{key_suffix}")
                if value:
                    return value
            return None

        url = _lookup("URL")
        username = _lookup("USERNAME")
        password = _lookup("PASSWORD")
        if not all([url, username, password]):
            raise EnvironmentError(
                f"Missing ServiceNow credentials for {environment}. "
                f"Ensure SERVICENOW_{env}_URL/USERNAME/PASSWORD are set."
            )

        verify_ssl = (_lookup("VERIFY_SSL") or "true").lower() != "false"
        timeout = int(_lookup("TIMEOUT") or "30")
        creds = ServiceNowCredentials(
            url=url.rstrip("/"),
            username=username,
            password=password,
            verify_ssl=verify_ssl,
            timeout=timeout,
        )
        return cls(creds)

    # ------------------------------------------------------------------ #
    # Core REST helpers
    # ------------------------------------------------------------------ #
    def get_record(self, table: str, sys_id: str, fields: Optional[str] = None) -> dict[str, Any]:
        """Retrieve a single record from a table.

        Args:
            table: The name of the ServiceNow table.
            sys_id: The sys_id of the record to retrieve.
            fields: Optional comma-separated list of fields to return.

        Returns:
            The record as a dictionary.

        Raises:
            ServiceNowError: If the ServiceNow API returns a 4xx or 5xx status code.
        """
        params = {"sysparm_fields": fields} if fields else None
        response = self._request("GET", f"/api/now/table/{table}/{sys_id}", params=params)
        return self._extract_result(response)

    def query_table(
        self,
        table: str,
        query: str,
        *,
        limit: int = 10,
        fields: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Execute a sysparm_query on a table."""
        params = {
            "sysparm_query": query,
            "sysparm_limit": limit,
        }
        if fields:
            params["sysparm_fields"] = fields
        response = self._request("GET", f"/api/now/table/{table}", params=params)
        payload = response.json()
        return payload.get("result", [])

    def get_catalog_item(self, sys_id: str, fields: Optional[str] = None) -> dict[str, Any]:
        """Convenience wrapper for retrieving catalog items."""
        return self.get_record("sc_cat_item", sys_id, fields=fields)

    def post_change_comment(self, change_sys_id: str, comment: str) -> dict[str, Any]:
        """Append a work note to a change request."""
        response = self._request(
            "PATCH",
            f"/api/now/table/change_request/{change_sys_id}",
            json_payload={"work_notes": comment},
        )
        return self._extract_result(response)

    # ------------------------------------------------------------------ #
    # Internal utilities
    # ------------------------------------------------------------------ #
    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json_payload: Optional[Mapping[str, Any]] = None,
    ) -> Response:
        url = f"{self.credentials.url}{path}"
        LOGGER.debug("ServiceNow request %s %s", method, url)
        response = self.session.request(
            method,
            url,
            auth=(self.credentials.username, self.credentials.password),
            params=params,
            json=json_payload,
            timeout=self.credentials.timeout,
            verify=self.credentials.verify_ssl,
        )
        if response.status_code >= 400:
            try:
                detail = response.json()
            except ValueError:
                detail = response.text
            raise ServiceNowError(f"ServiceNow request failed ({response.status_code}): {detail}")
        return response

    @staticmethod
    def _extract_result(response: Response) -> dict[str, Any]:
        payload = response.json()
        result = payload.get("result")
        if result is None:
            raise ServiceNowError("ServiceNow response missing 'result'")
        return result

