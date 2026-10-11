"""Tests for the configurable roast output language and roast target."""

import pytest

from app.config import settings
from app.models.enums import RoastIntensity
from app.services.roast_service import build_system_prompt


def test_defaults_are_chennai_and_coder() -> None:
    assert type(settings).model_fields["ROAST_LANGUAGE"].default == "chennai"
    assert type(settings).model_fields["ROAST_TARGET"].default == "coder"


def test_chennai_prompt_section(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ROAST_LANGUAGE", "chennai")
    prompt = build_system_prompt(RoastIntensity.SAVAGE)
    assert "CHENNAI TANGLISH" in prompt
    assert "Madras bashai" in prompt
    assert "Never use Tamil script" in prompt
    assert "no Tamil or English profanity" in prompt
    assert "Reply ONLY with a single JSON object" in prompt


def test_tanglish_prompt_section(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ROAST_LANGUAGE", "tanglish")
    prompt = build_system_prompt(RoastIntensity.MEDIUM)
    assert "TANGLISH" in prompt
    assert "CHENNAI" not in prompt
    assert "no Tamil or English profanity" in prompt


def test_english_prompt_section(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ROAST_LANGUAGE", "english")
    prompt = build_system_prompt(RoastIntensity.SAVAGE)
    assert "TANGLISH" not in prompt
    assert "clear, natural English" in prompt


def test_coder_target_allows_playful_person_roast(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ROAST_TARGET", "coder")
    prompt = build_system_prompt(RoastIntensity.SAVAGE)
    assert "You may roast the SUBMITTER too" in prompt
    assert "Never attack their intelligence" in prompt
    assert "Roast the CODE, never the person" not in prompt
    # Identity and profanity rules still apply.
    assert "No slurs, no profanity" in prompt


def test_code_target_keeps_code_only_rule(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ROAST_TARGET", "code")
    prompt = build_system_prompt(RoastIntensity.MILD)
    assert "Roast the CODE, never the person" in prompt
    assert "SUBMITTER" not in prompt
