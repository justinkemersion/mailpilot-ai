"""Account processing_enabled: worker list_active vs lookup by email."""

from .fakes import InMemoryAccountRepository


def test_list_active_excludes_processing_disabled():
    repo = InMemoryAccountRepository()
    repo.add(email="on@example.com")
    repo.add(email="off@example.com", processing_enabled=False)
    listed = repo.list_active()
    assert [a.email for a in listed] == ["on@example.com"]


def test_get_by_email_still_finds_processing_disabled_account():
    repo = InMemoryAccountRepository()
    repo.add(email="paused@example.com", processing_enabled=False)
    found = repo.get_by_email("paused@example.com")
    assert found is not None
    assert found.email == "paused@example.com"
