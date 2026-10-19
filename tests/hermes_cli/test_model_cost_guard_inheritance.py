from hermes_cli.model_cost_guard import resolve_cost_guard_routes


def test_cost_guard_inherits_selected_paid_and_fallback_routes():
    config = {
        "model": {
            "default": "openai/gpt-5.6-luna",
            "provider": "openrouter",
            "reasoning_effort": "high",
            "fast_reasoning_effort": "low",
        },
        "fallback_providers": [
            {"provider": "openrouter", "model": "nvidia/nemotron-3-ultra-550b-a55b:free"},
            {"provider": "openrouter", "model": "nvidia/nemotron-3-super-120b-a12b:free"},
            {"provider": "openrouter", "model": "nex-agi/nex-n2.5-pro:free"},
        ],
    }
    routes = resolve_cost_guard_routes(config)
    assert routes["paid"]["model"] == "openai/gpt-5.6-luna"
    assert routes["paid"]["reasoning_effort"] == "high"
    assert routes["paid"]["fast_reasoning_effort"] == "low"
    assert [x["model"] for x in routes["fallback"]] == [
        "nvidia/nemotron-3-ultra-550b-a55b:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "nex-agi/nex-n2.5-pro:free",
    ]
    assert all(x["reasoning_effort"] == "high" for x in routes["fallback"])


def test_cost_guard_threshold_fallback_and_window_restore():
    from hermes_cli.model_cost_guard import select_cost_guard_route
    config = {
        "model": {"default": "openai/gpt-5.6-luna", "provider": "openrouter", "reasoning_effort": "high"},
        "fallback_providers": [{"provider": "openrouter", "model": "free/model"}],
    }
    paid = select_cost_guard_route(config, 0.99, 100)
    assert paid["route"]["model"] == "openai/gpt-5.6-luna"
    fallback = select_cost_guard_route(config, 1.01, 100)
    assert fallback["active"] is True
    assert fallback["route"]["model"] == "free/model"
    restored = select_cost_guard_route(config, 1.01, 3701, triggered_at=fallback["triggered_at"])
    assert restored["active"] is False
    assert restored["route"]["model"] == "openai/gpt-5.6-luna"


def test_unknown_reasoning_capability_is_conservative():
    from hermes_cli.model_cost_guard import highest_supported_reasoning
    assert highest_supported_reasoning("unknown/model", "openrouter") == "high"


def test_explicit_selected_paid_model_is_not_replaced_by_catalog_default():
    config = {
        "model": {"default": "openai/gpt-5.6-luna", "provider": "openrouter"},
        "fallback_providers": [],
    }
    assert resolve_cost_guard_routes(config)["paid"]["model"] == "openai/gpt-5.6-luna"
