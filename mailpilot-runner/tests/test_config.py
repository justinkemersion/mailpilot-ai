from mailpilot.config import get_classifier_info, get_openai_api_key


def test_reads_openai_api_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fallback")

    assert get_openai_api_key() == "sk-fallback"


def test_classifier_info_openai(monkeypatch):
    monkeypatch.setenv("MAILPILOT_AI_PROVIDER", "openai")
    monkeypatch.setenv("MAILPILOT_OPENAI_MODEL", "gpt-4.1-mini")

    info = get_classifier_info()

    assert info["ai_provider"] == "openai"
    assert info["ai_model"] == "gpt-4.1-mini"
    assert info["ai_label"] == "OpenAI · gpt-4.1-mini"


def test_classifier_info_cloudflare(monkeypatch):
    monkeypatch.setenv("MAILPILOT_AI_PROVIDER", "cloudflare")
    monkeypatch.setenv(
        "MAILPILOT_CLOUDFLARE_MODEL", "@cf/meta/llama-3.1-8b-instruct-fast"
    )

    info = get_classifier_info()

    assert info["ai_provider"] == "cloudflare"
    assert "llama 3.1 8b instruct fast" in info["ai_label"].lower()
