from typing import Any, cast

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy, ToolStrategy
from langchain.chat_models import init_chat_model

from app.config import Config
from app.core.redis_client import get_redis

_CURSOR_KEY = "google_api_key_cursor"

# Model names are "<provider>:<model>", LangChain's own convention. "openai:"
# models are pointed at OPENAI_BASE_URL, so any OpenAI-compatible API (OpenAI
# itself, or e.g. Meta's Muse Spark) works by overriding the base URL. Every
# other prefix goes to init_chat_model with a rotated Google key.
OPENAI_PREFIX = "openai:"


def is_openai_model(model_name: str | None = None) -> bool:
    return (model_name or Config.MODEL_NAME).startswith(OPENAI_PREFIX)


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

    "openai:" models go to Config.OPENAI_BASE_URL with Config.OPENAI_API_KEY.
    Google models are bound to the next rotated key from GOOGLE_API_KEYS; every
    call site, scoring and interview alike, shares that one pool.

    `reasoning_effort` only applies to OpenAI models, and is sent only when a
    call site or OPENAI_REASONING_EFFORT sets one: non-reasoning models
    (gpt-4o, gpt-4.1) reject the parameter outright.
    """
    name = model_name or Config.MODEL_NAME
    if is_openai_model(name):
        kwargs: dict[str, Any] = {}
        if effort := reasoning_effort or Config.OPENAI_REASONING_EFFORT:
            kwargs["reasoning_effort"] = effort
        return init_chat_model(
            name,
            base_url=Config.OPENAI_BASE_URL,
            api_key=Config.OPENAI_API_KEY,
            **kwargs,
        )

    key = _next_api_key()
    if key is None:
        return init_chat_model(name)
    return init_chat_model(name, google_api_key=key)


def _structured_strategy(
    schema: type[Any], model_name: str
) -> ToolStrategy[Any] | ProviderStrategy[Any]:
    """The create_agent response_format for `schema` on `model_name`'s provider.

    OpenAI models get native json_schema output. Muse Spark (served through
    the OpenAI-compatible path) rejects ToolStrategy, which forces tool_choice
    while Meta only accepts "auto". strict is not optional: without it Muse
    was seen emitting corrupted keys ("markdown_contentVEL") that Pydantic
    silently drops as unknown fields.
    Gemini keeps ToolStrategy, which is what its call sites were tuned on.
    """
    if is_openai_model(model_name):
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
