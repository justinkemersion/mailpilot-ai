"""Shared pytest env — Flux is the sole database plane."""

import pytest


@pytest.fixture(autouse=True)
def _flux_test_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FLUX_API_URL", "http://127.0.0.1:54321")
    monkeypatch.setenv("FLUX_SERVICE_TOKEN", "test-flux-service-token")
    monkeypatch.setenv("FLUX_POSTGREST_SCHEMA", "api")
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(key, raising=False)
