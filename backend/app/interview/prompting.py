"""Shared prompt-building helpers for the interview LLM call sites.

Question generation and assessment must serialize the same grounding snapshot
identically: the assessor is supposed to see exactly what generation saw, so
the rendering convention lives here rather than being copied per module.
"""

import json
from typing import Any


def json_block(value: Any) -> str:
    """Render a grounding value for embedding in a prompt."""
    if value is None:
        return "Not provided"
    return json.dumps(value, indent=2, default=str)
