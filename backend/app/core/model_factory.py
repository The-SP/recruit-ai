from typing import Any, cast

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy, ToolStrategy
from langchain.chat_models import init_chat_model

from app.config import Config
from app.core.redis_client import get_redis

_CURSOR_KEY = "google_api_key_cursor"

# Model names are "<provider>:<model>". "meta:" is ours, not LangChain's: Meta's
# API is OpenAI-compatible, so it is served by langchain-openai pointed at
# META_BASE_URL. Every other prefix goes to init_chat_model unchanged.
META_PREFIX = "meta:"

# Muse Spark always reasons ("none" is a 400), and reasoning tokens bill as
# output. "low" is the default; latency-bound call sites pass "minimal".
META_REASONING_EFFORT = "low"


def is_meta_model(model_name: str | None = None) -> bool:
    return (model_name or Config.MODEL_NAME).startswith(META_PREFIX)


def _next_api_key() -> str | None:
    """Return the next Google API key in round-robin order.

    Uses an atomic Redis INCR cursor so rotation stays correct across the
    separate Celery worker processes. A single key needs no cursor, so scripts
    with one key run without Redis. Returns None when no keys are configured,
    in which case the caller falls back to the ambient GOOGLE_API_KEY.
    """
    keys = Config.GOOGLE_API_KEYS
    if not keys:
        return None
    if len(keys) == 1:
        return keys[0]
    idx = cast(int, get_redis().incr(_CURSOR_KEY)) % len(keys)
    return keys[idx]


def build_model(
    model_name: str | None = None, reasoning_effort: str | None = None
) -> Any:
    """Build a chat model for `model_name` (default Config.MODEL_NAME).

    Google models are bound to the next rotated key from GOOGLE_API_KEYS; every
    call site, scoring and interview alike, shares that one pool. Meta models
    use Config.META_API_KEY. `reasoning_effort` only applies to Meta models.
    """
    name = model_name or Config.MODEL_NAME
    if name.startswith(META_PREFIX):
        return init_chat_model(
            name.removeprefix(META_PREFIX),
            model_provider="openai",
            base_url=Config.META_BASE_URL,
            api_key=Config.META_API_KEY,
            reasoning_effort=reasoning_effort or META_REASONING_EFFORT,
        )

    key = _next_api_key()
    if key is None:
        return init_chat_model(name)
    return init_chat_model(name, google_api_key=key)


def _structured_strategy(
    schema: type[Any], model_name: str
) -> ToolStrategy[Any] | ProviderStrategy[Any]:
    """The create_agent response_format for `schema` on `model_name`'s provider.

    Muse Spark rejects ToolStrategy (it forces tool_choice, and Meta only
    accepts "auto"), so Meta gets native json_schema output instead. strict is
    not optional there: without it the model was seen emitting corrupted keys
    ("markdown_contentVEL") that Pydantic silently drops as unknown fields.
    Gemini keeps ToolStrategy, which is what its call sites were tuned on.
    """
    if is_meta_model(model_name):
        return ProviderStrategy(schema, strict=True)
    return ToolStrategy(schema)


def invoke_structured[T](
    schema: type[T],
    system_prompt: str,
    messages: list[Any],
    *,
    model_name: str | None = None,
    reasoning_effort: str | None = None,
) -> T:
    """One structured LLM call: build the model, invoke, return the parsed `schema`.

    The single place a structured call site's provider is decided, so the model
    and its output strategy always come from the same `model_name` (defaults to
    Config.MODEL_NAME). `reasoning_effort` is as in build_model().
    create_agent is used only for structured output, never tools.
    """
    name = model_name or Config.MODEL_NAME
    agent = create_agent(
        model=build_model(name, reasoning_effort),
        system_prompt=system_prompt,
        response_format=_structured_strategy(schema, name),
    )
    result = agent.invoke({"messages": messages})
    return cast(T, result["structured_response"])
