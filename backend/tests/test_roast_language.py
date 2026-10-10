"""Tests for the configurable roast output language (Tanglish by default)."""

import pytest

from app.config import settings
from app.models.enums import RoastIntensity
from app.services.roast_service import build_system_prompt


def test_default_language_is_tanglish() -> None:
    assert settings.ROAST_LANGUAGE == "tanglish"


def test_tanglish_prompt_section(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ROAST_LANGUAGE", "tanglish")
    prompt = build_system_prompt(RoastIntensity.MEDIUM)
    assert "TANGLISH" in prompt
    assert "Never use Tamil script" in prompt
    assert "no Tamil or English profanity" in prompt
    # Safety rules and JSON contract are still present.
    assert "Roast the CODE, never the person" in prompt
    assert "Reply ONLY with a single JSON object" in prompt


def test_english_prompt_section(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ROAST_LANGUAGE", "english")
    prompt = build_system_prompt(RoastIntensity.SAVAGE)
    assert "TANGLISH" not in prompt
    assert "clear, natural English" in prompt
