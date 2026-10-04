"""Expensive-model confirmation helpers for model selection surfaces."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Optional

from agent.models_dev import ModelInfo, PROVIDER_TO_MODELS_DEV


INPUT_COST_WARNING_THRESHOLD = Decimal("20")
OUTPUT_COST_WARNING_THRESHOLD = Decimal("100")
GPT55_PRO_OPENROUTER_ID = "openai/gpt-5.5-pro"
GPT55_SUGGESTION = "did you mean to select openai/gpt-5.5?"


@dataclass(frozen=True)
class ExpensiveModelWarning:
    """Confirmation payload for models above Hermes' cost guardrail."""

    model: str
    provider: str
    input_cost_per_million: Optional[Decimal]
    output_cost_per_million: Optional[Decimal]
    source: str
    message: str


def _to_decimal(value: object) -> Optional[Decimal]:
    try:
        return None if value is None else Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _format_money(value: Optional[Decimal]) -> str:
    return "unknown" if value is None else f"${value:.2f}/M"


def _pricing_from_model_info(
    model_info: Optional[ModelInfo]) -> tuple[Optional[Decimal], Optional[Decimal], str]:
    if model_info is None or not model_info.has_cost_data():
        return None, None, ""
    return _to_decimal(model_info.cost_input), _to_decimal(model_info.cost_output), "models.dev"


def _known_models_dev_provider(provider: Optional[str]) -> Optional[str]:
    normalized = (provider or "").strip().lower()
    return PROVIDER_TO_MODELS_DEV.get(normalized) if normalized else None


def _can_trust_model_info_pricing(
    provider: Optional[str], model_info: Optional[ModelInfo]) -> bool:
    expected_provider = _known_models_dev_provider(provider)
    if not expected_provider or model_info is None:
        return False
    actual_provider = str(getattr(model_info, "provider_id", "") or "").strip().lower()
    return not actual_provider or actual_provider == expected_provider


def _can_trust_pricing_lookup(
    model_name: str, *, provider: Optional[str], base_url: Optional[str]) -> bool:
    try:
        from agent.usage_pricing import resolve_billing_route

        route = resolve_billing_route(model_name, provider=provider, base_url=base_url)
    except Exception:
        return False
    return route.billing_mode != "unknown"


def expensive_model_warning(
    model_name: str, *, provider: Optional[str] = None, base_url: Optional[str] = None,
    api_key: Optional[str] = None, model_info: Optional[ModelInfo] = None,
) -> Optional[ExpensiveModelWarning]:
    """Warning payload when KNOWN pricing exceeds the safety thresholds (never fires on unknown
    pricing). Call after model resolution so aliases / provider-specific ids have settled."""
    model = (model_name or "").strip()
    if not model:
        return None

    input_cost: Optional[Decimal] = None
    output_cost: Optional[Decimal] = None
    source = ""
    if _can_trust_model_info_pricing(provider, model_info):
        input_cost, output_cost, source = _pricing_from_model_info(model_info)

    def _unpriced() -> bool:
        return input_cost is None and output_cost is None

    if _unpriced() and _known_models_dev_provider(provider):
        try:
            from agent.models_dev import get_model_info

            input_cost, output_cost, source = _pricing_from_model_info(get_model_info(provider, model))
        except Exception:
            pass

    if _unpriced() and _can_trust_pricing_lookup(model, provider=provider, base_url=base_url):
        try:
            from agent.usage_pricing import get_pricing_entry

            entry = get_pricing_entry(model, provider=provider, base_url=base_url, api_key=api_key)
        except Exception:
            entry = None
        if entry is not None:
            input_cost = entry.input_cost_per_million
            output_cost = entry.output_cost_per_million
            source = entry.source

    is_known_gpt55_pro_confusion = model.lower() == GPT55_PRO_OPENROUTER_ID
    over_input = input_cost is not None and input_cost > INPUT_COST_WARNING_THRESHOLD
    over_output = output_cost is not None and output_cost > OUTPUT_COST_WARNING_THRESHOLD
    if not over_input and not over_output and not is_known_gpt55_pro_confusion:
        return None

    lines = [
        "!!! EXPENSIVE MODEL WARNING !!!",
        "",
        f"{model} has known pricing above Hermes' safety threshold.",
        f"Input tokens: {_format_money(input_cost)}",
        f"Output tokens: {_format_money(output_cost)}",
        "Threshold: more than $20/M input tokens or more than $100/M output tokens."]
    if source:
        lines.append(f"Pricing source: {source}.")
    if is_known_gpt55_pro_confusion:
        lines.append(GPT55_SUGGESTION)
    lines.append("Confirm only if you intend to use this model.")

    return ExpensiveModelWarning(
        model=model, provider=(provider or "").strip(), input_cost_per_million=input_cost,
        output_cost_per_million=output_cost, source=source or "unknown", message="\n".join(lines))


# Routing helpers for the hourly spend guard.  These deliberately resolve from
# the active model/fallback configuration instead of maintaining a second model
# list that can drift from the user's selected settings.
FREE_REASONING_LEVELS = ("minimal", "low", "medium", "high", "xhigh", "max", "ultra")


def highest_supported_reasoning(model: str, provider: str = "") -> str:
    """Return a conservative reasoning level supported by catalog metadata.

    Unknown models intentionally use ``high``: blindly sending ``ultra`` causes
    providers that implement the standard ladder only to reject the request.
    """
    try:
        from hermes_cli.model_catalog import get_catalog
        catalog = get_catalog()
        providers = catalog.get("providers", {}) if isinstance(catalog, dict) else {}
        block = providers.get(provider, {}) if isinstance(providers, dict) else {}
        models = block.get("models", {}) if isinstance(block, dict) else {}
        entry = models.get(model, {}) if isinstance(models, dict) else {}
        caps = entry.get("reasoning_efforts") or entry.get("reasoning_levels")
        if isinstance(caps, (list, tuple)):
            supported = [x for x in FREE_REASONING_LEVELS if x in caps]
            if supported:
                return supported[-1]
    except Exception:
        pass
    return "high"


def cost_guard_enabled(config: dict) -> bool:
    guard = config.get("cost_guard") or {}
    return bool(guard.get("enabled", True))


def select_cost_guard_route(config: dict, hourly_cost_usd: float, now: float, *, triggered_at: float | None = None) -> dict:
    """Select paid route unless the configured hourly threshold is exceeded.

    The window is rolling from the first trigger; once it expires the paid route
    is returned and the trigger is cleared by the caller.
    """
    routes = resolve_cost_guard_routes(config)
    guard = config.get("cost_guard") or {}
    limit = float(guard.get("threshold_usd", 1.0))
    window = float(guard.get("window_seconds", 3600))
    active = triggered_at is not None and now - triggered_at < window
    if triggered_at is not None and now - triggered_at >= window:
        # A new hourly window starts after expiry. Do not immediately re-trigger
        # from the prior window's accumulated amount.
        hourly_cost_usd = 0.0
        triggered_at = None
    if not active and hourly_cost_usd >= limit:
        active = True
        triggered_at = now
    return {"route": (routes["fallback"][0] if active and routes["fallback"] else routes["paid"]),
            "active": active, "triggered_at": triggered_at, "hourly_cost_usd": hourly_cost_usd,
            "limit_usd": limit, "window_seconds": window}


def resolve_cost_guard_routes(config: dict) -> dict:
    """Build hourly paid/free routes from the active model configuration.

    ``cost_guard.free_fallback`` and ``paid_default`` are intentionally ignored.
    Legacy guard-owned model identifiers are only excluded when they differ from
    the currently active inherited route, so a stale guard cannot override a
    user's current paid model.
    """
    model_cfg = config.get("model") or {}
    selected_model = model_cfg.get("default") or config.get("model_default") or ""
    paid = {
        "provider": model_cfg.get("provider", ""),
        "model": selected_model,
        "reasoning_effort": model_cfg.get("reasoning_effort") or "medium",
        "fast_reasoning_effort": model_cfg.get("fast_reasoning_effort") or "medium",
    }
    fallback = []
    for item in config.get("fallback_providers") or []:
        if not isinstance(item, dict) or not item.get("model"):
            continue
        route = dict(item)
        route["reasoning_effort"] = highest_supported_reasoning(
            route["model"], route.get("provider", ""))
        fallback.append(route)
    return {"paid": paid, "fallback": fallback}
