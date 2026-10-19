from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SKILL = ROOT / "skills" / "creative" / "claude-design" / "SKILL.md"


def test_claude_design_skill_requires_desktop_preview_directive():
    text = SKILL.read_text(encoding="utf-8")
    assert '::preview{file="' in text
    assert "data-hermes-send" in text
    assert "MEDIA:" in text
    assert "not" in text.lower() and "download card" in text
    assert "show_html()" in text
