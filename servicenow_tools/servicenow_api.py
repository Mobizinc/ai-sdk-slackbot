"""ServiceNow API client utilities for Mobizinc QA automation workflows.

The client supports multiple ServiceNow environments (DEV, UAT, PROD) and can
authenticate using either Basic Auth or OAuth client credentials. It provides
typed helper methods that wrap the ServiceNow Table API for common operations
needed by the QA scripts.

This module does not perform any I/O at import time. Instantiate
``ServiceNowAPIClient`` with the desired environment name to begin making
requests.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, MutableMapping, Optional
from urllib.parse import urljoin, urlparse

import requests
from requests import Response
from requests.auth import HTTPBasicAuth
from requests.sessions import Session

LOGGER = logging.getLogger(__name__)


class ServiceNowAPIError(RuntimeError):
    """Represents a failed response from the ServiceNow API."""

    def __init__(
        self,
        message: str,
        *,
        status_code: Optional[int] = None,
        response: Optional[Response] = None,
        payload: Optional[Any] = None,
    ) -> None:
        detail = message
        if status_code is not None:
            detail = f"{message} (HTTP {status_code})"
        super().__init__(detail)
        self.status_code = status_code
        self.response = response
        self.payload = payload


@dataclass(slots=True)
class ServiceNowEnvironmentConfig:
    """Configuration values for connecting to a ServiceNow instance."""

    name: str
    instance_url: str
    username: Optional[str] = None
    password: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    oauth_token_url: Optional[str] = None
    verify_ssl: bool = True
    request_timeout: int = 60

    def __post_init__(self) -> None:
        if not self.instance_url:
            raise ValueError(f"ServiceNow instance URL missing for {self.name}")
        if self.instance_url.endswith("/"):
            self.instance_url = self.instance_url.rstrip("/")


class ServiceNowAPIClient:
    """Reusable HTTP client for interacting with ServiceNow REST APIs."""

    def __init__(
        self,
        environment: str,
        *,
        configs: Optional[Mapping[str, ServiceNowEnvironmentConfig]] = None,
        session: Optional[Session] = None,
        auto_refresh_token: bool = True,
    ) -> None:
        self.environment = environment.upper()
        self._configs = dict(configs or {})
        self._auto_refresh_token = auto_refresh_token
        self._session = session or requests.Session()
        self._oauth_token: Optional[str] = None
        self._oauth_expiration_epoch: Optional[int] = None

        if self.environment not in self._configs:
            LOGGER.debug("Environment %s not provided; loading from env vars", self.environment)
            env_config = load_environment_config(self.environment)
            self._configs[self.environment] = env_config

        self.config = self._configs[self.environment]

        if self.config.username and self.config.password:
            LOGGER.debug("Using basic authentication for %s", self.environment)
            self._auth = HTTPBasicAuth(self.config.username, self.config.password)
        elif self.config.client_id and self.config.client_secret:
            LOGGER.debug("Using OAuth client credentials for %s", self.environment)
            if not self.config.oauth_token_url:
                raise ValueError(
                    f"OAuth token URL missing for {self.environment}; set "
                    f"SERVICENOW_{self.environment}_OAUTH_TOKEN_URL"
                )
            self._auth = None
            self._ensure_oauth_token()
        else:
            raise ValueError(
                f"No authentication method configured for {self.environment}. "
                "Provide username/password or client credentials."
            )

    # ------------------------------------------------------------------ #
    # Public API methods
    # ------------------------------------------------------------------ #

    def get_record(self, table: str, sys_id: str) -> dict[str, Any]:
        """Retrieve a single record by sys_id from the specified table."""
        endpoint = f"/api/now/table/{table}/{sys_id}"
        payload = self._request_json("GET", endpoint)
        result = payload.get("result")
        if result is None:
            raise ServiceNowAPIError(
                f"Record {sys_id} not found in {table}",
                status_code=payload.get("status") if isinstance(payload, dict) else None,
                payload=payload,
            )
        return result

    def query_table(
        self,
        table: str,
        sysparm_query: str | None = None,
        *,
        limit: Optional[int] = None,
        fields: Optional[Iterable[str]] = None,
        batch_size: int = 100,
    ) -> list[dict[str, Any]]:
        """Execute a sysparm_query against a table with optional pagination."""
        collected: list[dict[str, Any]] = []
        offset = 0
        remaining = limit
        while True:
            params: MutableMapping[str, Any] = {"sysparm_limit": batch_size, "sysparm_offset": offset}
            if sysparm_query:
                params["sysparm_query"] = sysparm_query
            if fields:
                params["sysparm_fields"] = ",".join(fields)
            if remaining is not None:
                params["sysparm_limit"] = min(batch_size, remaining)

            endpoint = f"/api/now/table/{table}"
            payload = self._request_json("GET", endpoint, params=params)
            results = payload.get("result", [])
            if not results:
                break
            collected.extend(results)
            fetched = len(results)
            LOGGER.debug(
                "Fetched %s records from %s (offset=%s, limit=%s)",
                fetched,
                table,
                offset,
                limit,
            )
            if remaining is not None:
                remaining -= fetched
                if remaining <= 0:
                    break
            if fetched < params["sysparm_limit"]:
                break
            offset += fetched
        return collected

    def get_clone_info(self, target_instance: Optional[str] = None) -> dict[str, Any]:
        """Return metadata about the most recent clone for the target instance.

        Args:
            target_instance: Instance name or sys_id of the clone target. When not
                provided, the instance name is derived from this client's base URL.
        """
        target_instance = target_instance or extract_instance_name(self.config.instance_url)
        query = f"target_instance.instance_name={target_instance}^ORDERBYDESCfinished"
        try:
            records = self.query_table(
                "sys_clone_history",
                query,
                limit=1,
                fields=[
                    "source_instance",
                    "target_instance",
                    "state",
                    "finished",
                    "sys_created_on",
                ],
            )
        except ServiceNowAPIError as exc:
            if not _is_invalid_table_error(exc):
                raise
            records = self._get_clone_info_from_requests(target_instance)
        else:
            if records:
                return records[0]
            records = self._get_clone_info_from_requests(target_instance)

        if not records:
            raise ServiceNowAPIError(f"No clone history found for target instance '{target_instance}'")
        return records[0]

    def get_catalog_item(self, sys_id_or_name: str) -> dict[str, Any]:
        """Fetch catalog item details using sys_id or exact name match."""
        if is_sys_id(sys_id_or_name):
            try:
                return self.get_record("sc_cat_item", sys_id_or_name)
            except ServiceNowAPIError as exc:
                raise ServiceNowAPIError(
                    f"Catalog item {sys_id_or_name} not found",
                    status_code=exc.status_code,
                    payload=exc.payload,
                ) from exc

        results = self.query_table(
            "sc_cat_item",
            sysparm_query=f"name={sys_id_or_name}",
            limit=1,
        )
        if not results:
            raise ServiceNowAPIError(f"Catalog item named '{sys_id_or_name}' not found", status_code=404)
        return results[0]

    def get_catalog_item_variables(self, catalog_item_sys_id: str) -> list[dict[str, Any]]:
        """Return variables attached to a catalog item."""
        if not is_sys_id(catalog_item_sys_id):
            raise ValueError("catalog_item_sys_id must be a valid sys_id")
        query = f"cat_item={catalog_item_sys_id}"
        fields = [
            "sys_id",
            "cat_item",
            "name",
            "question_text",
            "mandatory",
            "type",
            "active",
            "order",
            "help_text",
            "instructions",
            "show_help_on_load",
        ]
        try:
            return self.query_table(
                "sc_item_option_new",
                query,
                fields=fields,
            )
        except ServiceNowAPIError as exc:
            if not _is_invalid_table_error(exc):
                raise
        return self._get_catalog_item_variables_via_item_option(catalog_item_sys_id, fields)

    def get_workflow(self, sys_id_or_name: str) -> dict[str, Any]:
        """Fetch workflow definition by sys_id or name."""
        if is_sys_id(sys_id_or_name):
            return self.get_record("wf_workflow", sys_id_or_name)
        results = self.query_table("wf_workflow", f"name={sys_id_or_name}", limit=1)
        if not results:
            raise ServiceNowAPIError(f"Workflow '{sys_id_or_name}' not found", status_code=404)
        return results[0]

    def check_workflow_attached(self, catalog_item_sys_id: str) -> bool:
        """Check if a workflow is attached to the catalog item."""
        catalog_item = self.get_catalog_item(catalog_item_sys_id)
        workflow_sys_id = catalog_item.get("workflow")
        if workflow_sys_id:
            LOGGER.debug(
                "Catalog item %s has workflow %s attached", catalog_item_sys_id, workflow_sys_id
            )
            return True
        # Additional check for Flow Designer
        flow_reference = catalog_item.get("flow_designer_flow")
        if flow_reference:
            LOGGER.debug(
                "Catalog item %s has Flow Designer flow %s attached",
                catalog_item_sys_id,
                flow_reference,
            )
            return True
        LOGGER.debug("Catalog item %s has no workflow or flow attached", catalog_item_sys_id)
        return False

    def get_business_rule(self, sys_id_or_name: str) -> dict[str, Any]:
        """Retrieve a business rule definition."""
        if is_sys_id(sys_id_or_name):
            return self.get_record("sys_script", sys_id_or_name)
        results = self.query_table("sys_script", f"name={sys_id_or_name}", limit=1)
        if not results:
            raise ServiceNowAPIError(f"Business rule '{sys_id_or_name}' not found", status_code=404)
        return results[0]

    def get_ui_policy(self, sys_id_or_name: str) -> dict[str, Any]:
        """Retrieve a UI policy definition."""
        if is_sys_id(sys_id_or_name):
            return self.get_record("sys_ui_policy", sys_id_or_name)
        results = self.query_table("sys_ui_policy", f"name={sys_id_or_name}", limit=1)
        if not results:
            raise ServiceNowAPIError(f"UI policy '{sys_id_or_name}' not found", status_code=404)
        return results[0]

    # ------------------------------------------------------------------ #
    # Internal helpers
    # ------------------------------------------------------------------ #

    def _ensure_oauth_token(self) -> None:
        """Fetch or refresh the OAuth access token if needed."""
        if not self._auto_refresh_token:
            return
        if self._oauth_token and self._oauth_expiration_epoch:
            if time.time() < self._oauth_expiration_epoch - 30:
                return

        LOGGER.debug("Requesting OAuth token for %s", self.environment)
        data = {
            "grant_type": "client_credentials",
            "client_id": self.config.client_id,
            "client_secret": self.config.client_secret,
        }
        token_response = self._session.post(
            self.config.oauth_token_url,
            data=data,
            timeout=self.config.request_timeout,
            verify=self.config.verify_ssl,
        )
        if token_response.status_code >= 400:
            raise ServiceNowAPIError(
                "Failed to obtain OAuth token",
                status_code=token_response.status_code,
                response=token_response,
                payload=_safe_json(token_response),
            )
        payload = token_response.json()
        access_token = payload.get("access_token")
        if not access_token:
            raise ServiceNowAPIError("OAuth response missing access_token", payload=payload)
        expires_in = int(payload.get("expires_in", 1800))
        self._oauth_token = access_token
        self._oauth_expiration_epoch = int(time.time()) + expires_in
        LOGGER.debug("Obtained OAuth token for %s (expires in %s seconds)", self.environment, expires_in)

    def _request_json(
        self,
        method: str,
        endpoint: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json_body: Optional[Any] = None,
    ) -> dict[str, Any]:
        """Perform an HTTP request and return the parsed JSON payload."""
        response = self._request(method, endpoint, params=params, json_body=json_body)
        payload = _safe_json(response)
        if payload is None:
            raise ServiceNowAPIError(
                "ServiceNow response did not contain valid JSON",
                status_code=response.status_code,
                response=response,
            )
        if response.status_code >= 400:
            raise ServiceNowAPIError(
                "ServiceNow API request failed",
                status_code=response.status_code,
                response=response,
                payload=payload,
            )
        return payload

    def _request(
        self,
        method: str,
        endpoint: str,
        *,
        params: Optional[Mapping[str, Any]] = None,
        json_body: Optional[Any] = None,
    ) -> Response:
        """Internal request helper that manages authentication and logging."""
        url = urljoin(self.config.instance_url, endpoint)
        headers: dict[str, str] = {
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        auth = self._auth
        if self.config.client_id and self.config.client_secret:
            self._ensure_oauth_token()
            headers["Authorization"] = f"Bearer {self._oauth_token}"
            auth = None

        LOGGER.debug(
            "ServiceNow request %s %s (params=%s, body=%s)",
            method,
            endpoint,
            params,
            json_body,
        )
        response = self._session.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
            auth=auth,
            timeout=self.config.request_timeout,
            verify=self.config.verify_ssl,
        )
        LOGGER.debug(
            "ServiceNow response %s %s -> %s",
            method,
            endpoint,
            response.status_code,
        )
        if response.status_code == 401:
            raise ServiceNowAPIError(
                "Unauthorized when calling ServiceNow API; check credentials",
                status_code=response.status_code,
                response=response,
            )
        return response

    # ------------------------------------------------------------------ #
    # Private fallbacks
    # ------------------------------------------------------------------ #

    def _get_clone_info_from_requests(self, target_instance: str) -> list[dict[str, Any]]:
        """Fallback clone lookup using sn_instance_clone_request records."""
        query = (
            f"target_instance.instance_name={target_instance}"
            "^state=Completed^ORDERBYDESCcompleted"
        )
        fields = [
            "sys_id",
            "request_id",
            "source_instance",
            "target_instance",
            "state",
            "scheduled",
            "started",
            "completed",
            "sys_created_on",
        ]
        return self.query_table("sn_instance_clone_request", query, limit=1, fields=fields)

    def _get_catalog_item_variables_via_item_option(
        self,
        catalog_item_sys_id: str,
        fields: Iterable[str],
    ) -> list[dict[str, Any]]:
        """Fallback resolver for instances without sc_item_option_new table."""
        option_rows = self.query_table(
            "sc_item_option",
            f"item={catalog_item_sys_id}",
            fields=["item_option_new"],
            batch_size=200,
        )
        option_ids: list[str] = []
        for row in option_rows:
            item_option_new = row.get("item_option_new") or {}
            sys_id = item_option_new.get("value")
            if sys_id and sys_id not in option_ids:
                option_ids.append(sys_id)
        if not option_ids:
            return []
        records = self._fetch_records_by_sys_ids("item_option_new", option_ids, fields)
        # Preserve ordering as returned by sc_item_option
        return [records[sys_id] for sys_id in option_ids if sys_id in records]

    def _fetch_records_by_sys_ids(
        self,
        table: str,
        sys_ids: list[str],
        fields: Iterable[str],
        *,
        chunk_size: int = 50,
    ) -> dict[str, dict[str, Any]]:
        """Retrieve records in batches based on sys_ids."""
        results: dict[str, dict[str, Any]] = {}
        for start in range(0, len(sys_ids), chunk_size):
            chunk = sys_ids[start : start + chunk_size]
            query = "sys_idIN" + ",".join(chunk)
            records = self.query_table(
                table,
                query,
                fields=fields,
                limit=len(chunk),
            )
            for record in records:
                sys_id = record.get("sys_id")
                if sys_id:
                    results[sys_id] = record
        return results


def load_environment_config(environment: str) -> ServiceNowEnvironmentConfig:
    """Load an environment configuration from environment variables."""
    env = environment.upper()
    prefix = f"SERVICENOW_{env}"
    url = _lookup_env(
        [
            f"{prefix}_URL",
            f"{env}_SERVICENOW_URL",
            "SERVICENOW_URL",
        ]
    )
    if not url:
        raise EnvironmentError(f"{prefix}_URL not set in environment variables")

    username = _lookup_env(
        [
            f"{prefix}_USERNAME",
            f"{env}_SERVICENOW_USERNAME",
            "SERVICENOW_USERNAME",
        ]
    )
    password = _lookup_env(
        [
            f"{prefix}_PASSWORD",
            f"{env}_SERVICENOW_PASSWORD",
            "SERVICENOW_PASSWORD",
        ]
    )
    client_id = _lookup_env(
        [
            f"{prefix}_CLIENT_ID",
            f"{env}_SERVICENOW_CLIENT_ID",
            "SERVICENOW_CLIENT_ID",
        ]
    )
    client_secret = _lookup_env(
        [
            f"{prefix}_CLIENT_SECRET",
            f"{env}_SERVICENOW_CLIENT_SECRET",
            "SERVICENOW_CLIENT_SECRET",
        ]
    )
    oauth_token_url = _lookup_env(
        [
            f"{prefix}_OAUTH_TOKEN_URL",
            f"{env}_SERVICENOW_OAUTH_TOKEN_URL",
            "SERVICENOW_OAUTH_TOKEN_URL",
        ]
    )
    verify_ssl = _lookup_env(
        [
            f"{prefix}_VERIFY_SSL",
            f"{env}_SERVICENOW_VERIFY_SSL",
            "SERVICENOW_VERIFY_SSL",
        ]
    )
    timeout_raw = _lookup_env(
        [
            f"{prefix}_TIMEOUT",
            f"{env}_SERVICENOW_TIMEOUT",
            "SERVICENOW_TIMEOUT",
        ]
    )

    verify_ssl_flag = True if verify_ssl is None else verify_ssl.lower() != "false"
    timeout = int(timeout_raw or "60")

    return ServiceNowEnvironmentConfig(
        name=env,
        instance_url=url,
        username=username,
        password=password,
        client_id=client_id,
        client_secret=client_secret,
        oauth_token_url=oauth_token_url,
        verify_ssl=verify_ssl_flag,
        request_timeout=timeout,
    )


def is_sys_id(value: str) -> bool:
    """Return True if the value looks like a ServiceNow sys_id."""
    return bool(re.fullmatch(r"[0-9a-fA-F]{32}", value or ""))


def _safe_json(response: Response) -> Optional[Any]:
    """Attempt to parse a JSON body from a response."""
    try:
        return response.json()
    except ValueError:
        LOGGER.debug("Response did not contain JSON; falling back to raw text")
        try:
            return json.loads(response.text)
        except json.JSONDecodeError:
            return None


def _lookup_env(keys: Iterable[str]) -> Optional[str]:
    """Return the first environment variable value available."""
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None


def _is_invalid_table_error(exc: ServiceNowAPIError) -> bool:
    """Determine if an API error is due to an invalid table."""
    if getattr(exc, "status_code", None) != 400:
        return False
    payload = getattr(exc, "payload", None)
    if not isinstance(payload, Mapping):
        return False
    message = (
        ((payload.get("error") or {}).get("message") or "")
        if isinstance(payload.get("error"), Mapping)
        else payload.get("error", "")
    )
    return isinstance(message, str) and message.lower().startswith("invalid table")


def extract_instance_name(instance_url: str) -> str:
    """Extract the instance name from a ServiceNow instance URL."""
    try:
        hostname = urlparse(instance_url).hostname or ""
    except Exception:
        hostname = instance_url
    if not hostname:
        return ""
    return hostname.split(".")[0]
