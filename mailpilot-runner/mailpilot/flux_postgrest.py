"""
Minimal PostgREST client for Flux (duck-types the supabase-py surface used by mailpilot repos).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import requests


@dataclass
class ExecuteResult:
    data: Any


def _format_filter_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return "null"
    return str(value)


class FluxPostgrestClient:
    def __init__(self, base_url: str, service_token: str, schema: str = "api") -> None:
        self._base = base_url.rstrip("/")
        self._token = service_token.strip()
        self._schema = schema.strip() or "api"
        self._session = requests.Session()

    def table(self, name: str) -> TableQuery:
        return TableQuery(self, name)

    def rpc(self, name: str, params: dict[str, Any] | None = None) -> RpcCall:
        return RpcCall(self, name, params or {})


class TableQuery:
    def __init__(self, client: FluxPostgrestClient, table: str) -> None:
        self._client = client
        self._table = table
        self._method = "GET"
        self._select = "*"
        self._filters: list[tuple[str, str, Any]] = []
        self._order: str | None = None
        self._limit: int | None = None
        self._body: Any = None

    def select(self, columns: str) -> TableQuery:
        self._select = columns
        return self

    def eq(self, column: str, value: Any) -> TableQuery:
        self._filters.append((column, "eq", value))
        return self

    def gte(self, column: str, value: Any) -> TableQuery:
        self._filters.append((column, "gte", value))
        return self

    def lt(self, column: str, value: Any) -> TableQuery:
        self._filters.append((column, "lt", value))
        return self

    def ilike(self, column: str, value: str) -> TableQuery:
        self._filters.append((column, "ilike", value))
        return self

    def order(self, column: str, *, desc: bool = False) -> TableQuery:
        self._order = f"{column}.{'desc' if desc else 'asc'}"
        return self

    def limit(self, count: int) -> TableQuery:
        self._limit = count
        return self

    def insert(self, row: dict[str, Any]) -> TableQuery:
        self._method = "POST"
        self._body = row
        return self

    def update(self, row: dict[str, Any]) -> TableQuery:
        self._method = "PATCH"
        self._body = row
        return self

    def delete(self) -> TableQuery:
        self._method = "DELETE"
        return self

    def _query_params(self) -> dict[str, str]:
        params: dict[str, str] = {}
        if self._method == "POST":
            return params
        params["select"] = self._select
        for column, op, value in self._filters:
            params[column] = f"{op}.{_format_filter_value(value)}"
        if self._order:
            params["order"] = self._order
        if self._limit is not None:
            params["limit"] = str(self._limit)
        return params

    def _headers(self) -> dict[str, str]:
        method = self._method
        profile = "Accept-Profile" if method in ("GET", "HEAD", "DELETE") else "Content-Profile"
        headers = {
            profile: self._client._schema,
            "Authorization": f"Bearer {self._client._token}",
            "apikey": self._client._token,
        }
        if self._body is not None:
            headers["Content-Type"] = "application/json"
            headers["Prefer"] = "return=representation"
        return headers

    def execute(self) -> ExecuteResult:
        url = f"{self._client._base}/{self._table}"
        kwargs: dict[str, Any] = {
            "headers": self._headers(),
            "timeout": 120,
        }
        if self._method in ("GET", "DELETE", "PATCH"):
            kwargs["params"] = self._query_params()
        if self._body is not None and self._method in ("POST", "PATCH"):
            kwargs["json"] = self._body
        resp = self._client._session.request(self._method, url, **kwargs)
        if not resp.ok:
            detail = resp.text
            raise RuntimeError(
                f"Flux PostgREST {self._method} {self._table} failed ({resp.status_code}): {detail}"
            )
        if resp.status_code == 204 or not resp.content:
            return ExecuteResult(data=[])
        payload = resp.json()
        if isinstance(payload, list):
            return ExecuteResult(data=payload)
        return ExecuteResult(data=payload)


class RpcCall:
    def __init__(
        self,
        client: FluxPostgrestClient,
        name: str,
        params: dict[str, Any],
    ) -> None:
        self._client = client
        self._name = name
        self._params = params

    def execute(self) -> ExecuteResult:
        url = f"{self._client._base}/rpc/{self._name}"
        headers = {
            "Content-Profile": self._client._schema,
            "Authorization": f"Bearer {self._client._token}",
            "apikey": self._client._token,
            "Content-Type": "application/json",
        }
        resp = self._client._session.post(
            url, headers=headers, json=self._params, timeout=120
        )
        if not resp.ok:
            raise RuntimeError(
                f"Flux RPC {self._name} failed ({resp.status_code}): {resp.text}"
            )
        if not resp.content:
            return ExecuteResult(data=None)
        payload = resp.json()
        return ExecuteResult(data=payload)
