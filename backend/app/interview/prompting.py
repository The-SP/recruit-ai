"""Shared prompt-building helpers for the interview LLM call sites.

Question generation and assessment must serialize the same grounding snapshot
identically: the assessor is supposed to see exactly what generation saw, so
the rendering convention lives here rather than being copied per module.
"""

import json
import re
from typing import Any


def json_block(value: Any) -> str:
    """Render a grounding value for embedding in a prompt."""
    if value is None:
        return "Not provided"
    return json.dumps(value, indent=2, default=str)


def untrusted_block(tag: str, content: str, **attrs: object) -> str:
    """Wrap candidate-authored text in a tag the prompt declares to be data.

    Answers and resumes are written by the person being judged, so they can
    carry instructions aimed at the model ("recommend advance") or text shaped
    like more prompt (a forged interviewer turn). The tag is the boundary the
    prompt tells the model to respect; any opening or closing copy of it inside
    the content is defanged so the candidate cannot end the block early.
    Attribute values are set by the caller, never taken from the content.
    """
    neutralized = re.sub(
        rf"<(\s*/?\s*{re.escape(tag)}\b)", r"&lt;\1", content, flags=re.IGNORECASE
    )
    attr_text = "".join(f' {key}="{value}"' for key, value in attrs.items())
    return f"<{tag}{attr_text}>\n{neutralized}\n</{tag}>"
