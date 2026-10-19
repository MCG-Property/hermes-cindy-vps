"""Tests for the todo tool module."""

import json

from tools.todo_tool import TodoStore, todo_tool

class TestWriteAndRead:
    def test_write_replaces_list(self):
        store = TodoStore()
        items = [
            {"id": "1", "content": "First task", "status": "pending"},
            {"id": "2", "content": "Second task", "status": "in_progress"},
        ]
        result = store.write(items)
        assert len(result) == 2
        assert result[0]["id"] == "2"
        assert result[0]["status"] == "in_progress"
        assert result[1]["id"] == "1"

    def test_write_deduplicates_duplicate_ids(self):
        store = TodoStore()
        result = store.write([
            {"id": "1", "content": "First version", "status": "pending"},
            {"id": "2", "content": "Other task", "status": "pending"},
            {"id": "1", "content": "Latest version", "status": "in_progress"},
        ])
        assert [item["id"] for item in result] == ["1", "2"]
        assert result[0]["content"] == "Latest version"
        assert result[0]["status"] == "in_progress"
        assert result[0]["code"] == "A1"
        assert result[0]["work_status"] == "planned"
        assert result[1]["content"] == "Other task"

    def test_write_moves_active_item_before_earlier_pending_step(self):
        store = TodoStore()
        result = store.write([
            {"id": "1", "content": "Already done", "status": "completed"},
            {"id": "2", "content": "Verify freed space", "status": "pending"},
            {"id": "3", "content": "Move archives to Trash", "status": "in_progress"},
        ])
        assert [item["id"] for item in result] == ["1", "3", "2"]
        assert result[0]["work_status"] == "pending_review"
        assert result[1]["status"] == "in_progress"
        assert result[1]["code"] == "A3"

class TestHasItems:
    def test_empty_store(self):
        store = TodoStore()
        assert store.has_items() is False

    def test_non_empty_store(self):
        store = TodoStore()
        store.write([{"id": "1", "content": "x", "status": "pending"}])
        assert store.has_items() is True

class TestFormatForInjection:
    def test_empty_returns_none(self):
        store = TodoStore()
        assert store.format_for_injection() is None

    def test_non_empty_has_markers(self):
        store = TodoStore()
        store.write([
            {"id": "1", "content": "Do thing", "status": "completed"},
            {"id": "2", "content": "Next", "status": "pending"},
            {"id": "3", "content": "Working", "status": "in_progress"},
        ])
        text = store.format_for_injection()
        # Unconfirmed completed work stays as PENDING_REVIEW
        assert "A1_PENDING_REVIEW: Do thing" in text
        assert "A2_PLANNED: Next" in text
        assert "A3_PLANNED: Working" in text
        assert "context compression" in text.lower()

class TestMergeMode:
    def test_update_existing_by_id(self):
        store = TodoStore()
        store.write([
            {"id": "1", "content": "Original", "status": "pending"},
        ])
        store.write(
            [{"id": "1", "status": "completed"}],
            merge=True,
        )
        items = store.read()
        assert len(items) == 1
        assert items[0]["status"] == "completed"
        assert items[0]["content"] == "Original"

    def test_merge_appends_new(self):
        store = TodoStore()
        store.write([{"id": "1", "content": "First", "status": "pending"}])
        store.write(
            [{"id": "2", "content": "Second", "status": "pending"}],
            merge=True,
        )
        items = store.read()
        assert len(items) == 2

    def test_merge_reorders_active_item_ahead_of_earlier_pending_step(self):
        store = TodoStore()
        store.write([
            {"id": "1", "content": "Completed", "status": "completed"},
            {"id": "2", "content": "Verify freed space", "status": "pending"},
            {"id": "3", "content": "Move archives to Trash", "status": "pending"},
        ])
        result = store.write(
            [{"id": "3", "status": "in_progress"}],
            merge=True,
        )
        assert [item["id"] for item in result] == ["1", "3", "2"]
        assert result[1]["status"] == "in_progress"
        assert result[2]["status"] == "pending"

class TestTodoToolFunction:
    def test_read_mode(self):
        store = TodoStore()
        store.write([{"id": "1", "content": "Task", "status": "pending"}])
        result = json.loads(todo_tool(store=store))
        assert result["summary"]["total"] == 1
        assert result["summary"]["pending"] == 1
        assert result["revision"] == 1

    def test_no_store_returns_error(self):
        result = json.loads(todo_tool())
        assert "error" in result

class TestTodoStoreSnapshots:
    def test_revision_only_advances_when_state_changes(self):
        store = TodoStore()
        items = [{"id": "1", "content": "Task", "status": "pending"}]

        store.write(items)
        first = store.snapshot()
        store.write(items)

        assert first["revision"] == 1
        assert store.snapshot() == first

    def test_restore_adopts_a_trusted_revision(self):
        store = TodoStore()
        store.restore(
            [{"id": "1", "content": "Task", "status": "pending"}], revision=7
        )

        assert store.snapshot()["revision"] == 7

        store.write([{"id": "1", "content": "Task", "status": "completed"}])
        assert store.snapshot()["revision"] == 8

class TestTodoStoreBounds:
    """Bounds on persisted todo state (GHSA-5g4g-6jrg-mw3g hardening).

    The todo list is re-injected into context after every compression event,
    so an unbounded item — whether authored by the model or replayed from
    caller-supplied history on the API server's _hydrate_todo_store path —
    would defeat the compression it rides through. These pin the caps.
    Not a security boundary (the API surface is authenticated and the caller
    supplies their own history); this is footgun containment / parity.
    """

    def test_oversized_content_is_truncated(self):
        from tools.todo_tool import MAX_TODO_CONTENT_CHARS
        store = TodoStore()
        store.write([{"id": "1", "content": "A" * 50001, "status": "pending"}])
        item = store.read()[0]
        assert len(item["content"]) <= MAX_TODO_CONTENT_CHARS
        assert item["content"].endswith("… [truncated]")

    def test_injection_block_is_bounded(self):
        from tools.todo_tool import MAX_TODO_CONTENT_CHARS
        store = TodoStore()
        store.write([{"id": "1", "content": "A" * 50001, "status": "pending"}])
        inj = store.format_for_injection()
        # Before the fix this was ~50085 chars; now it tracks the cap.
        assert len(inj) < MAX_TODO_CONTENT_CHARS + 200

    def test_item_count_is_bounded(self):
        from tools.todo_tool import MAX_TODO_ITEMS
        store = TodoStore()
        store.write([
            {"id": str(i), "content": f"task {i}", "status": "pending"}
            for i in range(5000)
        ])
        assert len(store.read()) == MAX_TODO_ITEMS

    def test_normal_list_is_unchanged(self):
        """No regression: ordinary plans pass through untouched (no marker,
        same content, same order)."""
        store = TodoStore()
        store.write([
            {"id": "1", "content": "write the report", "status": "in_progress"},
            {"id": "2", "content": "review PR", "status": "pending"},
        ])
        items = store.read()
        assert [i["content"] for i in items] == ["write the report", "review PR"]
        assert "[truncated]" not in items[0]["content"]


class TestUserOwnedTodos:
    def test_add_confirm_delete(self):
        store = TodoStore()
        first = store.add_item("Plus button")
        assert first["id"] == "A1"
        assert first["code"] == "A1"
        assert first["work_status"] == "planned"
        assert first["status"] == "pending"
        assert store.keep_open() is True
        store.confirm_ids(["A1"])
        assert store.read()[0]["status"] == "completed"
        assert store.keep_open() is False
        assert store.format_outstanding() == []
        store.add_item("Remove me")
        store.delete_ids(["A2"])
        assert [item["id"] for item in store.read()] == ["A1"]
        extra = store.add_item("Cancel me")
        cancelled = store.cancel_ids([extra["id"]])
        assert cancelled[0]["content"] == "Cancel me"
        assert all(item["id"] != extra["id"] for item in store.read())

    def test_batch_uses_next_letter_and_pending_review_stays_open(self):
        store = TodoStore()
        store.add_items(["Task menu", "Queue with Cmd+Enter"], new_group=True)
        store.add_items(["Status codes"], new_group=True)
        labels = store.format_outstanding()
        assert labels == [
            "A1_PLANNED: Task menu",
            "A2_PLANNED: Queue with Cmd+Enter",
            "B3_PLANNED: Status codes",
        ]
        store.write([{"id": "A1", "status": "completed"}], merge=True)
        assert store.read()[0]["work_status"] == "pending_review"
        assert store.keep_open() is True
        assert "A1_PENDING_REVIEW: Task menu" in store.format_outstanding()
        store.confirm_ids(["A1"])
        assert "A1_PENDING_REVIEW: Task menu" not in store.format_outstanding()
        assert store.keep_open() is True

    def test_blocked_reason_label(self):
        store = TodoStore()
        store.add_item(
            "Use occasional emojis",
            work_status="blocked",
            blocked_reason="User changed their mind",
        )
        assert store.format_outstanding() == [
            "A1_BLOCKED: Use occasional emojis_BLOCKED_REASON: User changed their mind"
        ]

    def test_normal_list_is_unchanged(self):
        """No regression: ordinary plans pass through untouched (no marker,
        same content, same order)."""
        store = TodoStore()
        store.write([
            {"id": "1", "content": "write the report", "status": "in_progress"},
            {"id": "2", "content": "review PR", "status": "pending"},
        ])
        items = store.read()
        assert [i["content"] for i in items] == ["write the report", "review PR"]
        assert "[truncated]" not in items[0]["content"]


class TestRejectEmptyContent:
    """Empty or missing content must fail the call instead of substituting
    '(no description)'. See #44496."""

    def test_write_rejects_empty_content(self):
        store = TodoStore()
        try:
            store.write([{"id": "1", "content": "", "status": "pending"}])
            assert False, "should have raised ValueError"
        except ValueError as e:
            assert "empty or missing content" in str(e)

    def test_write_rejects_missing_content_key(self):
        store = TodoStore()
        try:
            store.write([{"id": "2", "status": "pending"}])
            assert False, "should have raised ValueError"
        except ValueError as e:
            assert "empty or missing content" in str(e)

    def test_write_rejects_whitespace_content(self):
        store = TodoStore()
        try:
            store.write([{"id": "3", "content": "   ", "status": "pending"}])
            assert False, "should have raised ValueError"
        except ValueError as e:
            assert "empty or missing content" in str(e)

    def test_partial_write_does_not_mutate_existing_list(self):
        """A failed write with mixed valid/invalid items leaves the prior list
        untouched (acceptance criterion #3 from #44496)."""
        store = TodoStore()
        store.write([
            {"id": "1", "content": "Keep me", "status": "pending"},
            {"id": "2", "content": "Also keep me", "status": "completed"},
        ])
        try:
            store.write([
                {"id": "1", "content": "Updated", "status": "pending"},  # valid
                {"id": "2", "content": "",        "status": "pending"},  # invalid
            ])
        except ValueError:
            pass
        items = store.read()
        assert [i["content"] for i in items] == ["Keep me", "Also keep me"]
        assert [i["status"]  for i in items] == ["pending", "completed"]

    def test_todo_tool_returns_error_on_empty_content(self):
        result = json.loads(todo_tool(
            todos=[{"id": "1", "content": "", "status": "pending"}],
            store=TodoStore(),
        ))
        assert "error" in result
        assert "empty or missing content" in result["error"]

    def test_merge_new_item_rejects_empty_content(self):
        """Merge mode: new items with empty content are rejected."""
        store = TodoStore()
        store.write([{"id": "1", "content": "Existing", "status": "pending"}])
        try:
            store.write([{"id": "2", "content": "", "status": "pending"}], merge=True)
            assert False, "should have raised ValueError"
        except ValueError as e:
            assert "empty or missing content" in str(e)

    def test_merge_new_item_rejects_whitespace_content(self):
        """Merge mode: new items with whitespace-only content are rejected."""
        store = TodoStore()
        store.write([{"id": "1", "content": "Existing", "status": "pending"}])
        try:
            store.write([{"id": "2", "content": "   ", "status": "pending"}], merge=True)
            assert False, "should have raised ValueError"
        except ValueError as e:
            assert "empty or missing content" in str(e)

    def test_merge_existing_item_keeps_content_on_status_only_update(self):
        """Merge mode: updating only status (no content key) preserves existing content."""
        store = TodoStore()
        store.write([{"id": "1", "content": "Keep this", "status": "pending"}])
        store.write([{"id": "1", "status": "completed"}], merge=True)
        items = store.read()
        assert items[0]["content"] == "Keep this"
        assert items[0]["status"] == "completed"

    def test_valid_content_still_works(self):
        """Regression: valid items still pass through normally."""
        store = TodoStore()
        items = store.write([
            {"id": "1", "content": "A real task", "status": "pending"},
        ])
        assert items[0]["content"] == "A real task"
