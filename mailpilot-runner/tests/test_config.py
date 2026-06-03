from mailpilot.config import get_openai_api_key


def test_reads_openai_api_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fallback")

    assert get_openai_api_key() == "sk-fallback"
