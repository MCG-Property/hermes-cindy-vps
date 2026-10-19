"""Todo tool: in-memory, revisioned task list for multi-step work. State lives on the
AIAgent (one per session), is re-injected after context compression, and every write bumps
a monotonic revision so UI clients can reject stale updates. One ``todo_list`` tool: pass
``todos`` to write, omit to read; every call returns the full list. No system-prompt mutation."""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

VALID_STATUSES = {"pending", "in_progress", "completed", "cancelled"}
WORK_STATUSES = {"planned", "pending_review", "blocked"}
STATUS_ALIASES = {
    "planned": ("pending", "planned"),
    "pending_review": ("completed", "pending_review"),
    "blocked": ("cancelled", "blocked"),
}
# The list is re-read after every compression (format_for_injection), so unbounded
# content/count would defeat the compression it rides through. Caps apply equally to
# model-authored items and caller-replayed API history.
MAX_TODO_CONTENT_CHARS = 4000
MAX_TODO_ITEMS = 256
# Max single todo tool-result payload accepted during history hydration, so a forged
# oversized result is dropped before parsing (AIAgent._hydrate_todo_store).
MAX_TODO_RESULT_CHARS = 512_000
_TRUNCATION_MARKER = "… [truncated]"
# Persisted as ordinary message content; ContextCompressor keys on this stable header to
# tell the synthetic post-compaction row from a real user message.
TODO_INJECTION_HEADER = "[Your active task list was preserved across context compression]"
_STATUS_MARKERS = {"completed": "[x]", "in_progress": "[>]", "pending": "[ ]", "cancelled": "[~]"}
_ACTIVE_STATUSES = {"pending", "in_progress"}
_CODE_RE = re.compile(r"^([A-Z]+)(\d+)$")
_LABEL_RE = re.compile(
    r"^(?P<code>[A-Z]+\d+)_(?P<status>PLANNED|PENDING_REVIEW|BLOCKED):\s*"
    r"(?P<content>.*?)(?:_BLOCKED_REASON:\s*(?P<reason>.*))?$",
    re.S,
)


def parse_user_label(text: str) -> Optional[Tuple[str, str, str, str]]:
    """Parse ``A1_PLANNED: text`` / ``A3_BLOCKED: text_BLOCKED_REASON: why``."""
    match = _LABEL_RE.match((text or "").strip())
    if not match:
        return None
    return (
        match.group("code"),
        match.group("status").lower(),
        (match.group("content") or "").strip(),
        (match.group("reason") or "").strip(),
    )


def _parse_code(value: str) -> Optional[Tuple[str, int]]:
    match = _CODE_RE.match(str(value or "").strip())
    if not match:
        return None
    return match.group(1), int(match.group(2))


def _native_and_work(status: str, work_status: str = "") -> Tuple[str, str]:
    raw_work = str(work_status or "").strip().lower()
    raw_status = str(status or "").strip().lower()
    if raw_work in WORK_STATUSES:
        native, mapped = STATUS_ALIASES[raw_work]
        if raw_status in VALID_STATUSES:
            return raw_status, raw_work
        return native, mapped
    if raw_status in STATUS_ALIASES:
        return STATUS_ALIASES[raw_status]
    if raw_status == "cancelled":
        return "cancelled", "blocked"
    if raw_status == "completed":
        return "completed", "pending_review"
    if raw_status in VALID_STATUSES:
        return raw_status, "planned"
    return "pending", "planned"


class TodoStore:
    """In-memory todo list, one per AIAgent. List position is priority; items are
    ``{id, content, status, code, work_status, parent?}`` — ``parent`` nests a subtask."""

    def __init__(self):
        self._items: list[dict[str, str]] = []
        self._revision = 0
        self._user_confirmed: list[str] = []
        self._keep_open = False

    def _fresh_items(self, todos: list[dict[str, Any]]) -> list[dict[str, str]]:
        """Validate, dedupe and order a whole new list (replace / restore)."""
        return self._normalize_order([self._validate(t) for t in self._dedupe_by_id(todos)])

    def write(self, todos: list[dict[str, Any]], merge: bool = False) -> list[dict[str, str]]:
        """Replace the list (default) or merge by id; returns the full list after writing.
        Raises ValueError (leaving the list untouched) if any item is invalid."""
        before = self.read()
        try:
            if merge:
                self._merge(todos)
            else:
                self._items = self._fresh_items(todos)
        except ValueError:
            self._items = before  # rejected write must not leave a partial list behind
            raise
        del self._items[MAX_TODO_ITEMS:]  # keep the priority head; replays can't grow unbounded
        self._sanitize_parents(self._items)
        if self._items != before:
            self._revision += 1
        return self.read()

    def _merge(self, todos: list[dict[str, Any]]) -> None:
        """Update existing items only in the fields provided; append new ones (validated)."""
        existing = {item["id"]: item for item in self._items}
        for t in self._dedupe_by_id(todos):
            item_id = str(t.get("id", "")).strip()
            if not item_id:
                continue  # can't merge without an id
            cur = existing.get(item_id)
            if cur is None:
                validated = self._validate(t)
                existing[validated["id"]] = validated
                self._items.append(validated)
                continue
            if t.get("content"):
                cur["content"] = self._cap_content(self._content_from_text(str(t["content"]).strip()))
            if "status" in t or "work_status" in t:
                native, work = _native_and_work(
                    str(t.get("status") or cur.get("status") or "pending"),
                    str(t.get("work_status") or ""),
                )
                if "status" in t and str(t.get("status") or "").strip().lower() in VALID_STATUSES:
                    native = str(t.get("status") or "").strip().lower()
                    if "work_status" not in t:
                        _, work = _native_and_work(native, "")
                cur["status"] = native
                cur["work_status"] = work
                if work != "blocked":
                    cur.pop("blocked_reason", None)
            if t.get("blocked_reason"):
                cur["blocked_reason"] = self._cap_content(str(t.get("blocked_reason") or "").strip())
                cur["work_status"] = "blocked"
                if cur.get("status") not in VALID_STATUSES:
                    cur["status"] = "cancelled"
            if t.get("code"):
                cur["code"] = str(t.get("code") or cur.get("code") or cur["id"])
            if "parent" in t:
                parent = str(t["parent"] or "").strip()
                if parent:
                    cur["parent"] = parent
                else:
                    cur.pop("parent", None)
        # Rebuild preserving original order for existing items (first occurrence wins).
        rebuilt = {item["id"]: existing.get(item["id"], item) for item in self._items}
        self._items = self._normalize_order(list(rebuilt.values()))

    def read(self) -> list[dict[str, str]]:
        return [item.copy() for item in self._items]

    def has_items(self) -> bool:
        return bool(self._items)

    def snapshot(self) -> dict[str, Any]:
        """Full state clients can reconcile atomically."""
        presented = [self._present(item) for item in self._items]
        outstanding = [item for item in presented if item.get("outstanding")]
        return {
            "todos": presented,
            "revision": self._revision,
            "user_confirmed": list(self._user_confirmed),
            "keep_open": self.keep_open(),
            "outstanding_labels": [item["label"] for item in outstanding],
        }

    def keep_open(self) -> bool:
        """True while any unfinished task remains or the user pinned the list."""
        return bool(self._keep_open or any(self._is_outstanding(item) for item in self._items))

    def _next_seq(self) -> int:
        nums: List[int] = []
        for item in self._items:
            for raw in (item.get("code"), item.get("id")):
                parsed = _parse_code(str(raw or ""))
                if parsed:
                    nums.append(parsed[1])
                    continue
                try:
                    nums.append(int(str(raw)))
                except (TypeError, ValueError):
                    continue
        return (max(nums) + 1) if nums else 1

    def _next_group_letter(self, *, new_group: bool) -> str:
        letters: List[str] = []
        for item in self._items:
            parsed = _parse_code(str(item.get("code") or item.get("id") or ""))
            if parsed and len(parsed[0]) == 1:
                letters.append(parsed[0])
        if not letters:
            return "A"
        last = max(letters)
        if new_group:
            return chr(ord(last) + 1) if last < "Z" else "Z"
        return last

    def _code_in_use(self, code: str) -> bool:
        want = str(code or "").strip()
        return any(item.get("code") == want or item["id"] == want for item in self._items)

    def add_item(
        self,
        content: str,
        parent: Optional[str] = None,
        *,
        group: Optional[str] = None,
        new_group: bool = False,
        work_status: str = "planned",
        blocked_reason: str = "",
    ) -> Dict[str, str]:
        """Append a user-authored planned task and keep the list open."""
        added = self.add_items(
            [content],
            parent=parent,
            group=group,
            new_group=new_group,
            work_status=work_status,
            blocked_reason=blocked_reason,
        )
        return added[0] if added else {"id": "A1", "content": "(no description)", "status": "pending"}

    def add_items(
        self,
        contents: List[str],
        parent: Optional[str] = None,
        *,
        group: Optional[str] = None,
        new_group: bool = True,
        work_status: str = "planned",
        blocked_reason: str = "",
    ) -> List[Dict[str, str]]:
        """Append one submit-batch. A new batch gets the next letter group (A then B)."""
        added: List[Dict[str, str]] = []
        texts = [str(item or "").strip() for item in contents if str(item or "").strip()]
        if not texts:
            return added
        batch_group = str(group or "").strip().upper() or self._next_group_letter(new_group=new_group)
        parent_id = str(parent or "").strip()
        for raw in texts:
            parsed = parse_user_label(raw)
            if parsed:
                code, parsed_work, text, reason = parsed
                if self._code_in_use(code):
                    code = f"{batch_group}{self._next_seq()}"
            else:
                code = f"{batch_group}{self._next_seq()}"
                parsed_work, text, reason = work_status, raw, blocked_reason
            native, work = _native_and_work("pending", parsed_work or "planned")
            item: Dict[str, str] = {
                "id": code,
                "content": self._cap_content(text or "(no description)"),
                "status": native if work != "pending_review" else "pending",
                "code": code,
                "work_status": "planned" if work == "pending_review" else work,
            }
            if work == "blocked" and (reason or blocked_reason):
                item["status"] = "cancelled"
                item["work_status"] = "blocked"
                item["blocked_reason"] = self._cap_content(reason or blocked_reason)
            if parent_id and parent_id != item["id"]:
                item["parent"] = parent_id
            self._items.append(item)
            added.append(item.copy())
        self._sanitize_parents(self._items)
        self._revision += 1
        self._keep_open = True
        return added

    def delete_ids(self, ids: List[str]) -> List[Dict[str, str]]:
        """Remove tasks (and their nested children) the user dismissed."""
        want = {str(item).replace("todo:", "").strip() for item in ids if str(item).strip()}
        if not want:
            return self.read()
        before = [item.copy() for item in self._items]
        self._items = [
            item for item in self._items
            if item["id"] not in want and item.get("code") not in want
        ]
        # Drop children whose parent was removed.
        living = {item["id"] for item in self._items}
        self._items = [item for item in self._items if not item.get("parent") or item["parent"] in living]
        self._user_confirmed = [item_id for item_id in self._user_confirmed if item_id in living]
        if self._items != before:
            self._revision += 1
        if not any(self._is_outstanding(item) for item in self._items):
            self._keep_open = False
        return self.read()

    def cancel_ids(self, ids: List[str]) -> List[Dict[str, str]]:
        """User dismissed tasks. They leave the outstanding list."""
        want = {str(item).replace("todo:", "").strip() for item in ids if str(item).strip()}
        cancelled = [
            item.copy()
            for item in self._items
            if item["id"] in want or item.get("code") in want
        ]
        if cancelled:
            self.delete_ids([item["id"] for item in cancelled])
        return cancelled

    def confirm_ids(self, ids: List[str]) -> List[str]:
        """User accepted the work. Finished tasks leave the outstanding list."""
        want = {str(item).replace("todo:", "").strip() for item in ids if str(item).strip()}
        confirmed: List[str] = []
        changed = False
        for item in self._items:
            if item["id"] not in want and item.get("code") not in want:
                continue
            if item["status"] != "completed":
                item["status"] = "completed"
                changed = True
            if item.get("work_status") != "pending_review":
                item["work_status"] = "pending_review"
                changed = True
            if item["id"] not in self._user_confirmed:
                self._user_confirmed.append(item["id"])
            confirmed.append(item["id"])
        if changed:
            self._revision += 1
        if not any(self._is_outstanding(item) for item in self._items):
            self._keep_open = False
        return confirmed

    def restore(self, todos: list[dict[str, Any]], *, revision: Any = 0) -> list[dict[str, str]]:
        """Restore a trusted snapshot without manufacturing a new revision."""
        self._items = self._fresh_items(todos)[:MAX_TODO_ITEMS]
        try:
            self._revision = max(0, int(revision or 0))
        except (TypeError, ValueError):
            self._revision = 0
        return self.read()

    def _is_outstanding(self, item: Dict[str, str]) -> bool:
        if item.get("id") in self._user_confirmed:
            return False
        work = str(item.get("work_status") or "").strip().lower()
        if work in WORK_STATUSES:
            return True
        return item.get("status") in _ACTIVE_STATUSES or item.get("status") == "cancelled"

    def _label(self, item: Dict[str, str]) -> str:
        code = str(item.get("code") or item.get("id") or "?").strip()
        work = str(item.get("work_status") or "planned").strip().lower()
        if item.get("id") in self._user_confirmed:
            work = "pending_review"
        if work not in WORK_STATUSES:
            _, work = _native_and_work(str(item.get("status") or "pending"), work)
        line = f"{code}_{work.upper()}: {item.get('content') or ''}"
        if work == "blocked" and item.get("blocked_reason"):
            line += f"_BLOCKED_REASON: {item['blocked_reason']}"
        return line

    def _present(self, item: Dict[str, str]) -> Dict[str, Any]:
        out = item.copy()
        out["outstanding"] = self._is_outstanding(item)
        out["user_confirmed"] = item.get("id") in self._user_confirmed
        out["label"] = self._label(item)
        return out

    def format_outstanding(self) -> List[str]:
        """Unfinished tasks in Cam's letter-number status format."""
        return [self._label(item) for item in self._items if self._is_outstanding(item)]

    def format_for_injection(self) -> Optional[str]:
        """Render unfinished tasks for post-compression injection, or None if none remain."""
        lines = [TODO_INJECTION_HEADER]
        children: dict[str, list[dict[str, str]]] = {}
        for item in self._items:
            if item.get("parent"):
                children.setdefault(item["parent"], []).append(item)

        def render(item: dict[str, str], depth: int, out: list[str]) -> bool:
            kid_lines: list[str] = []
            has_active_kid = False
            for kid in children.get(item["id"], []):
                has_active_kid |= render(kid, depth + 1, kid_lines)
            keep = self._is_outstanding(item) or has_active_kid
            if keep:
                out.append(f"{'  ' * depth}- {self._label(item)}")
                out.extend(kid_lines)
            return keep

        for item in self._items:
            if not item.get("parent"):
                render(item, 0, lines)
        return "\n".join(lines) if len(lines) > 1 else None

    @staticmethod
    def _cap_content(content: str) -> str:
        """Truncate to MAX_TODO_CONTENT_CHARS keeping the head (the actionable part) + marker."""
        if len(content) > MAX_TODO_CONTENT_CHARS:
            return content[:MAX_TODO_CONTENT_CHARS - len(_TRUNCATION_MARKER)] + _TRUNCATION_MARKER
        return content

    @staticmethod
    def _content_from_text(content: str) -> str:
        parsed = parse_user_label(content)
        return parsed[2] if parsed and parsed[2] else content

    @staticmethod
    def _validate(item: dict[str, Any]) -> dict[str, str]:
        """Normalize one item to id/content/status plus code/work_status."""
        if not isinstance(item, dict):
            return {
                "id": "?",
                "content": "(invalid item)",
                "status": "pending",
                "code": "A0",
                "work_status": "planned",
            }
        item_id = str(item.get("id", "")).strip() or "?"
        raw_content = str(item.get("content", "")).strip()
        parsed = parse_user_label(raw_content)
        if parsed and not str(item.get("code") or "").strip():
            item_id = item_id if item_id not in {"?", ""} else parsed[0]
            work_in = parsed[1]
            content = parsed[2]
            reason = parsed[3]
        else:
            work_in = str(item.get("work_status") or "")
            content = raw_content
            reason = str(item.get("blocked_reason") or "").strip()
        if not content:
            raise ValueError(
                f"Todo item '{item_id}' has empty or missing content. "
                "Each item must have a non-empty description."
            )
        native, work = _native_and_work(str(item.get("status", "pending")), work_in)
        parsed_id = _parse_code(item_id)
        if parsed_id:
            code = item_id
        elif item_id.isdigit():
            code = f"A{item_id}"
        else:
            code = str(item.get("code") or "").strip() or item_id
        result = {
            "id": item_id,
            "content": TodoStore._cap_content(content),
            "status": native,
            "code": code,
            "work_status": work,
        }
        if work == "blocked" and reason:
            result["blocked_reason"] = TodoStore._cap_content(reason)
        parent = str(item.get("parent") or "").strip()
        if parent and parent != item_id:
            result["parent"] = parent
        return result

    @staticmethod
    def _sanitize_parents(items: list[dict[str, str]]) -> None:
        """Drop dangling parent refs and break cycles in place (such items become roots)."""
        by_id = {item["id"]: item for item in items}
        for item in items:
            if item.get("parent") and item["parent"] not in by_id:
                item.pop("parent", None)
        for item in items:
            seen, node = {item["id"]}, item
            while node.get("parent"):
                if node["parent"] in seen:
                    item.pop("parent", None)
                    break
                seen.add(node["parent"])
                node = by_id[node["parent"]]

    @staticmethod
    def _dedupe_by_id(todos: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Collapse duplicate ids, keeping the last occurrence in its position."""
        last_index: dict[str, int] = {}
        for i, item in enumerate(todos):  # non-dicts get a synthetic key; _validate handles them
            key = str(item.get("id", "")).strip() if isinstance(item, dict) else f"__invalid_{i}"
            last_index[key or "?"] = i
        return [todos[i] for i in sorted(last_index.values())]

    @staticmethod
    def _normalize_order(items: list[dict[str, str]]) -> list[dict[str, str]]:
        """Lift the in_progress step ahead of any earlier pending placeholder. Nested lists
        keep authored order — reordering would tear a subtask from its siblings."""
        statuses = [item["status"] for item in items]
        if any(item.get("parent") for item in items) or "in_progress" not in statuses:
            return items
        active_index = statuses.index("in_progress")
        if "pending" not in statuses[:active_index]:
            return items
        normalized = items.copy()
        normalized.insert(statuses.index("pending"), normalized.pop(active_index))
        return normalized


_DONE_RE = re.compile(
    r"(?i)\b("
    r"done|complete|completed|finished|resolved|checked off|"
    r"approved|verified|confirmed|accepted|lgtm|"
    r"ship(?:ped)?(?:\s+it)?|all good|looks good|sounds good|"
    r"good to go|works(?: for me)?"
    r")\b"
    r"|^\s*(yes|yep|yeah|ok|okay|perfect|great|nice)\s*[.!]*\s*$"
)
# Cam's confirmations are short. Long prompts (task-board instructions, tool
# dumps) must never auto-remove PENDING_REVIEW items.
_MAX_CONFIRM_CHARS = 280
_CONFIRM_SKIP_RE = re.compile(
    r"(?i)todo_list|use the existing todo|task board|pending_review only after|"
    r"flip to pending_review|standing todo"
)


def confirm_from_user_text(store: Optional[TodoStore], text: str) -> list[str]:
    """Confirm tasks Cam explicitly accepted. Never runs on long/system prompts.

    Named tasks win. Short bare affirmations confirm PENDING_REVIEW items only.
    ``all`` / ``everything`` with done-language confirms every outstanding item.
    Removals from the visible list otherwise require Cam's x button.
    """
    if store is None or not text:
        return []
    stripped = text.strip()
    if not stripped or len(stripped) > _MAX_CONFIRM_CHARS:
        return []
    if _CONFIRM_SKIP_RE.search(stripped):
        return []
    if not _DONE_RE.search(stripped):
        return []
    blob = stripped.lower()
    outstanding = [item for item in store.read() if store._is_outstanding(item)]
    if not outstanding:
        return []
    matched: list[str] = []
    for item in outstanding:
        content = str(item.get("content") or "").strip().lower()
        code = str(item.get("code") or item.get("id") or "").lower()
        if content and re.search(rf"(?<!\w){re.escape(content)}(?!\w)", blob):
            matched.append(item["id"])
        elif code and re.search(rf"\b{re.escape(code)}\b", blob):
            matched.append(item["id"])
    if not matched:
        pending_review = [
            item["id"]
            for item in outstanding
            if str(item.get("work_status") or "").lower() == "pending_review"
            or str(item.get("status") or "").lower() == "completed"
        ]
        if re.search(r"(?i)\b(all|everything|these|those)\b", stripped):
            matched = [item["id"] for item in outstanding]
        elif pending_review:
            matched = pending_review
    return store.confirm_ids(matched) if matched else []


def todo_tool(todos: Optional[list[dict[str, Any]]] = None, merge: bool = False,
              store: Optional[TodoStore] = None) -> str:
    """Write ``todos`` (always merge — never drop Cam's tasks) or read when None."""
    if store is None:
        return tool_error("TodoStore not initialized")
    if todos is None:
        items = store.read()
    else:
        if not isinstance(todos, list):
            return tool_error(f"todos must be a list, got {type(todos).__name__}")
        # Cam-only removals: the model may update status / add items, never drop rows.
        try:
            items = store.write(todos, merge=True)
        except ValueError as e:
            return tool_error(str(e))
    summary = {"total": len(items)}
    for status in ("pending", "in_progress", "completed", "cancelled"):
        summary[status] = sum(1 for i in items if i["status"] == status)
    for work in ("planned", "pending_review", "blocked"):
        summary[work] = sum(1 for i in items if i.get("work_status") == work)
    summary["outstanding"] = len(store.format_outstanding())
    return json.dumps({
        "todos": items,
        "revision": store.snapshot()["revision"],
        "outstanding": store.format_outstanding(),
        "summary": summary,
    }, ensure_ascii=False)


def check_todo_requirements() -> bool:
    """Todo tool has no external requirements -- always available."""
    return True


# Behavioral guidance is baked into the (static, cached) description; item shape and merge
# semantics live ONLY in the parameter schema.
TODO_SCHEMA = {
    "name": "todo_list",
    "description": (
        # See #95681.
        "Track a task list for multi-step work (3+ steps). Use for complex tasks "
        "with 3+ steps or when the user provides multiple tasks. "
        "For 'all N items' tasks, enumerate every instance as its own checklist "
        "item so none are silently dropped. "
        "Call with no parameters to read the current list.\n"
        "Cam's statuses are only PLANNED, PENDING_REVIEW, and BLOCKED. "
        "Ids use letter-number codes: A1 A2 A3 for one theme, B4 B5 for the next, "
        "AB7 for work that joins A and B. "
        "Set work_status to planned while doing the work. Flip to pending_review "
        "only after the work is verified and working; Cam confirms before it "
        "leaves the outstanding list. Use blocked plus blocked_reason when stuck. "
        "NEVER delete, cancel, or omit tasks. Removals are Cam-only (x button or "
        "Cam's explicit confirmation). Writes always merge by id. "
        "Native pending/in_progress map to PLANNED. Native completed maps to "
        "PENDING_REVIEW until Cam confirms. End every reply with the outstanding "
        "list. List order is priority. Break large phases into subtasks via parent. "
        "Always returns the full current list."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "todos": {
                "type": "array",
                "description": "Task items to write.",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Letter-number code such as A1, B4, or AB7."
                        },
                        "content": {
                            "type": "string",
                            "description": "Paraphrase of the user task, without the status prefix."
                        },
                        "status": {
                            "type": "string",
                            "enum": ["pending", "in_progress", "completed", "cancelled",
                                     "planned", "pending_review", "blocked"]
                        },
                        "work_status": {
                            "type": "string",
                            "enum": ["planned", "pending_review", "blocked"]
                        },
                        "blocked_reason": {
                            "type": "string",
                            "description": "Required when the task is blocked."
                        },
                        "parent": {
                            "type": "string",
                            "description": "Optional id of another item, making this a nested subtask. Omit for top-level."
                        }
                    },
                    "required": ["id", "content", "status"]
                }
            },
            "merge": {
                "type": "boolean",
                "description": (
                    "Ignored for safety: writes always merge by id so existing "
                    "tasks cannot be dropped. Finish work with work_status "
                    "pending_review (or status completed). Only Cam removes tasks."
                ),
                "default": True
            }
        },
        "required": []
    }
}

# Pre-rename names that replay as the Todo tool. model_tools._LEGACY_TOOL_ALIASES derives its todo
# entries from this, so the alias map and the transcript/TUI predicates below cannot drift.
TODO_LEGACY_ALIASES = ("todo",)
TODO_TOOL_NAMES = frozenset((TODO_SCHEMA["name"], *TODO_LEGACY_ALIASES))


def is_todo_tool_name(name: Any) -> bool:
    """True for the Todo tool's current name or a legacy alias (an already-unwrapped dispatch name)."""
    return isinstance(name, str) and name in TODO_TOOL_NAMES


def is_todo_tool_call(tool_call: Any) -> bool:
    """True when a transcript tool_call entry (dict or object) invoked the Todo tool.

    Covers the current name, legacy aliases, and the ``tool_call`` bridge (``todo_list`` is deferred by
    default, and the transcript keeps the bridge name). The bridge is peeled from the recorded arguments
    only, never live tool-search config, and must wrap exactly one call. Keep this module free of model_tools / agent.tool_executor
    imports: TUI resume and run_agent call this without loading either.
    """
    from agent.message_sanitization import _tc_field

    fn = _tc_field(tool_call, "function")
    name, raw_args = _tc_field(fn, "name") or "", _tc_field(fn, "arguments")
    if is_todo_tool_name(name):
        return True
    # Cheap heuristic before the bridge modules load: skip args without a literal "todo". Only a
    # unicode-escaped name slips past, which json.dumps never writes for ASCII.
    if isinstance(raw_args, str) and "todo" not in raw_args:
        return False
    from tools.tool_search_catalog import TOOL_CALL_NAME

    if name != TOOL_CALL_NAME:
        return False
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    except json.JSONDecodeError:
        return False
    if not isinstance(args, dict):
        return False
    from tools.tool_search_validation import normalize_tool_call_entries

    entries, error = normalize_tool_call_entries(args)
    return not error and len(entries) == 1 and is_todo_tool_name(entries[0]["name"])


from tools.registry import registry, tool_error

registry.register(
    name="todo_list", toolset="todo", schema=TODO_SCHEMA, check_fn=check_todo_requirements,
    handler=lambda args, **kw: todo_tool(
        todos=args.get("todos"), merge=True, store=kw.get("store")),
    emoji="📋")
