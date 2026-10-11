"""IDE plugin: coding-agent stream parsers normalise each CLI's JSON events into one vocabulary."""

import importlib.util
import json
import sys
from pathlib import Path

_DIR = Path(__file__).resolve().parents[2] / "plugins" / "ide" / "dashboard"
spec = importlib.util.spec_from_file_location("ide_agents_under_test", _DIR / "ide_agents.py")
A = importlib.util.module_from_spec(spec)
sys.modules["ide_agents_under_test"] = A
spec.loader.exec_module(A)


def feed(agent, *objs):
    p = A.Parser(agent)
    out = []
    for o in objs:
        out += p.feed(json.dumps(o))
    return out


def test_claude_stream_text_tool_and_result():
    evs = feed(
        "claude",
        {"type": "system", "subtype": "init", "session_id": "s1", "model": "m"},
        {"type": "stream_event", "event": {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hi"}}},
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "Hi"}, {"type": "tool_use", "id": "t1", "name": "Read", "input": {"file_path": "a.txt"}}]}},
        {"type": "user", "message": {"content": [{"type": "tool_result", "tool_use_id": "t1", "content": "hello"}]}},
        {"type": "result", "usage": {"input_tokens": 3, "output_tokens": 4}, "total_cost_usd": 0.01},
    )
    kinds = [e["type"] for e in evs]
    assert kinds == ["session", "text", "tool", "tool_result", "usage"]  # partial text is not duplicated by the final message
    assert evs[2]["kind"] == "read" and evs[2]["arg"] == "a.txt"
    assert evs[3]["result"] == "hello" and evs[3]["ok"] is True


def test_codex_items():
    evs = feed(
        "codex",
        {"type": "thread.started", "thread_id": "th"},
        {"type": "item.started", "item": {"id": "i1", "type": "command_execution", "command": "ls"}},
        {"type": "item.completed", "item": {"id": "i1", "type": "command_execution", "command": "ls", "aggregated_output": "a\n", "exit_code": 0}},
        {"type": "item.completed", "item": {"id": "i2", "type": "agent_message", "text": "done"}},
        {"type": "turn.completed", "usage": {"input_tokens": 1, "output_tokens": 2}},
    )
    assert [e["type"] for e in evs] == ["session", "tool", "tool_result", "text", "usage"]
    assert evs[1]["kind"] == "shell" and evs[2]["ok"] is True


def test_opencode_tool_use_carries_result():
    evs = feed(
        "opencode",
        {"type": "step_start", "sessionID": "ses_1", "part": {"type": "step-start"}},
        {"type": "tool_use", "sessionID": "ses_1", "part": {"tool": "read", "callID": "c1", "state": {"status": "completed", "input": {"filePath": "x"}, "output": "ok"}}},
        {"type": "text", "sessionID": "ses_1", "part": {"text": "hello"}},
        {"type": "step_finish", "sessionID": "ses_1", "part": {"tokens": {"input": 1, "output": 2}, "cost": 0.5}},
    )
    assert [e["type"] for e in evs] == ["session", "tool", "tool_result", "text", "usage"]
    assert evs[1]["arg"] == "x" and evs[2]["ok"] is True


def test_cursor_tool_call_started_completed():
    evs = feed(
        "cursor",
        {"type": "system", "subtype": "init", "session_id": "c"},
        {"type": "tool_call", "subtype": "started", "call_id": "k", "tool_call": {"readToolCall": {"args": {"path": "a.txt"}}}},
        {"type": "tool_call", "subtype": "completed", "call_id": "k", "tool_call": {"readToolCall": {"args": {"path": "a.txt"}, "result": {"success": {"content": "hello"}}}}},
        {"type": "assistant", "message": {"content": [{"type": "text", "text": "hello"}]}},
    )
    assert [e["type"] for e in evs] == ["session", "tool", "tool_result", "text"]
    assert evs[1]["kind"] == "read" and evs[2]["result"] == "hello"


def test_garbage_lines_are_ignored():
    assert A.Parser("claude").feed("not json") == []
    assert A.Parser("codex").feed("") == []


def test_build_command_modes(monkeypatch):
    monkeypatch.setattr(A, "find_bin", lambda agent: f"/bin/{agent}")
    c = A.build_command("claude", "go", repo="/r", mode="plan")
    assert "--permission-mode" in c and c[c.index("--permission-mode") + 1] == "plan" and c[-1] == "go"
    assert "--sandbox" in A.build_command("codex", "go", repo="/r")
    assert "--dir" in A.build_command("opencode", "go", repo="/r")
    assert "--trust" in A.build_command("cursor", "go", repo="/r")
