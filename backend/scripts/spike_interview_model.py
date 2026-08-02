"""Throwaway spike: verify the interview model ID works through this repo's stack.

Checks unknown U1 from docs/ai-interviewer-plan.md: that langchain-google-genai
accepts the Gemini 3.5 Flash Lite model ID via init_chat_model and returns
structured output through ToolStrategy, using the same create_agent call shape
as app/evaluation/skill_scorer.py:241-249.

This script calls init_chat_model directly instead of build_model() because at
spike time build_model() takes no arguments. That is allowed here and nowhere
in app/ — see the plan's M1 notes.

Usage:
    uv run -m scripts.spike_interview_model
    uv run -m scripts.spike_interview_model --model google_genai:gemini-2.5-flash-lite

Delete this file at M4.
"""

import argparse
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy
from langchain.chat_models import init_chat_model
from pydantic import BaseModel, Field

from app.config import Config

CANDIDATE_MODEL_IDS = [
    "google_genai:gemini-3.5-flash-lite",
    "google_genai:gemini-2.5-flash-lite",
]


class SpikeResponse(BaseModel):
    """Trivial two-field schema to prove structured output round-trips."""

    question: str = Field(description="A single short interview question")
    focus: str = Field(description="One of: experience_depth, role_competency")


def try_model(model_name: str) -> SpikeResponse:
    api_key = Config.GOOGLE_API_KEYS[0] if Config.GOOGLE_API_KEYS else None
    model = (
        init_chat_model(model_name, google_api_key=api_key)
        if api_key
        else init_chat_model(model_name)
    )

    agent = create_agent(
        model=model,
        system_prompt="You are an interviewer that returns structured JSON.",
        response_format=ToolStrategy(SpikeResponse),
    )

    messages: list[Any] = [
        {
            "role": "user",
            "content": (
                "Write one interview question for a backend engineer whose resume "
                "claims they built a Celery pipeline on Redis."
            ),
        }
    ]
    result = agent.invoke({"messages": messages})
    response: SpikeResponse = result["structured_response"]
    return response


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        help="Model ID to test. Defaults to trying the candidate list in order.",
    )
    args = parser.parse_args()

    model_ids = [args.model] if args.model else CANDIDATE_MODEL_IDS

    if not Config.GOOGLE_API_KEYS:
        print("WARNING: no GOOGLE_API_KEY(S) configured; relying on ambient env.\n")

    working: list[str] = []
    for model_name in model_ids:
        print(f"--- Testing {model_name} ---")
        try:
            response = try_model(model_name)
        except Exception as e:
            print(f"  FAILED: {type(e).__name__}: {e}\n")
            continue
        print("  OK — parsed structured response:")
        print(f"    question: {response.question}")
        print(f"    focus:    {response.focus}\n")
        working.append(model_name)

    print("=" * 70)
    if working:
        print(f"Working model IDs: {', '.join(working)}")
        print(f"Use this as INTERVIEW_MODEL_NAME default: {working[0]}")
    else:
        print("No candidate model ID worked. Do NOT silently fall back —")
        print("find the correct ID and record it in docs/ai-interviewer-plan.md §0.")


if __name__ == "__main__":
    main()
