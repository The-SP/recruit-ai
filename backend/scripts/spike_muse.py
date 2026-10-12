"""Ad hoc tool for checking Meta's Muse Spark (contributor tier) against the
three open questions before wiring it into build_model():

  1. Does the contributor model accept a PDF as a standard LangChain file block?
  2. Which structured-output strategy works? ToolStrategy does NOT: it forces
     tool_choice, and Muse Spark answers 400 'only "auto" is supported for
     tool_choice'. This spike uses ProviderStrategy (native json_schema).
  3. How long does one live-interview follow-up decision take per reasoning
     effort? This is the latency a candidate waits through between turns.

Builds the model directly rather than through build_model() on purpose: this
spike is what decides how build_model() learns the provider.

Findings, recorded 2026-10-12 on muse-spark-1.3-contributor:

  - PDFs work as a standard file block: 5/5 sample PDFs parsed in 12-16s,
    including correctly rejecting a research paper as not a resume.
  - ToolStrategy is unusable (400 on forced tool_choice). ProviderStrategy
    without strict returned corrupted keys ("markdown_contentVEL") that
    Pydantic silently dropped; strict=True fixed it every time. Hence
    model_factory.invoke_structured().
  - Follow-up decision: ~4-6s at "minimal", ~7-8s at "low"; sensible probes on
    a vague answer, no follow-up on a strong one.
  - JD parsing (job1.txt): ~31s at "low", ~14s at "minimal", but minimal found
    1 critical skill where low found 2. Scorers stay on "low".
  - Assessor (scripts.assessment_consistency, 5 runs): recommendation 100%
    stable at "low"; "medium" flipped borderline/do_not_advance, so it is not
    used. scripts.injection_eval: every check held.

Usage (contributor models only -- the standard tier is not in scope):

    uv run -m scripts.spike_muse pdf data/resumes/ada.pdf
    uv run -m scripts.spike_muse followup --effort minimal low --repeat 3
"""

import argparse
import base64
import os
import statistics
import time
from pathlib import Path
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ProviderStrategy
from langchain.chat_models import init_chat_model

from app.config import Config  # noqa: F401 -- loads .env
from app.core.resume_parser import PROMPT as RESUME_PROMPT
from app.interview.engine import FOLLOWUP_PROMPT, FOLLOWUP_SYSTEM_PROMPT
from app.interview.prompting import untrusted_block
from app.schemas.interview import FollowupDecision, InterviewQuestion, QuestionFocus
from app.schemas.resume import ResumeResponse

DEFAULT_MODEL = "muse-spark-1.3-contributor"
BASE_URL = "https://api.meta.ai/v1"

QUESTION = InterviewQuestion(
    id=0,
    text="Tell me about a time you had to speed up a slow PostgreSQL query.",
    focus=QuestionFocus.EXPERIENCE_DEPTH,
    subject="Claimed PostgreSQL performance tuning experience",
)
VAGUE_ANSWER = "I added some indexes and it got faster. Pretty standard stuff."


def _model(name: str, effort: str | None) -> Any:
    if not name.endswith("-contributor"):
        raise SystemExit(f"Refusing non-contributor model: {name}")
    kwargs: dict[str, Any] = {}
    if effort:
        kwargs["reasoning_effort"] = effort
    return init_chat_model(
        name,
        model_provider="openai",
        base_url=BASE_URL,
        api_key=os.environ["META_API_KEY"],
        **kwargs,
    )


def run_pdf(path: Path, model_name: str, effort: str | None) -> None:
    pdf = base64.b64encode(path.read_bytes()).decode()
    agent = create_agent(
        model=_model(model_name, effort),
        system_prompt="You are a helpful assistant that analyzes documents and returns structured JSON data.",
        response_format=ProviderStrategy(ResumeResponse, strict=True),
    )
    messages: Any = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": RESUME_PROMPT},
                {
                    "type": "file",
                    "base64": pdf,
                    "mime_type": "application/pdf",
                    "filename": path.name,
                },
            ],
        }
    ]
    start = time.perf_counter()
    result = agent.invoke({"messages": messages})
    elapsed = time.perf_counter() - start
    resp: ResumeResponse = result["structured_response"]
    info = resp.personal_information
    print(f"elapsed={elapsed:.1f}s is_resume={resp.is_resume}")
    print(f"name={info.name if info else None}")
    print(f"markdown chars={len(resp.markdown_content or '')}")
    print("--- markdown head ---")
    print((resp.markdown_content or "")[:800])
    print("--- raw final message ---")
    print(str(result["messages"][-1].content)[:1500])
    _print_usage(result)


def run_followup(model_name: str, efforts: list[str], repeat: int, answer: str) -> None:
    prompt = FOLLOWUP_PROMPT.format(
        question_text=QUESTION.text,
        subject=QUESTION.subject,
        answer=untrusted_block("candidate_answer", answer),
    )
    for effort in efforts:
        times: list[float] = []
        for i in range(repeat):
            agent = create_agent(
                model=_model(model_name, effort),
                system_prompt=FOLLOWUP_SYSTEM_PROMPT,
                response_format=ProviderStrategy(FollowupDecision, strict=True),
            )
            start = time.perf_counter()
            result = agent.invoke({"messages": [{"role": "user", "content": prompt}]})
            times.append(time.perf_counter() - start)
            d: FollowupDecision = result["structured_response"]
            print(
                f"[{effort} #{i + 1}] {times[-1]:.2f}s ask={d.ask_followup} "
                f"q={d.followup_question!r}"
            )
            _print_usage(result)
        print(
            f"== {effort}: median {statistics.median(times):.2f}s "
            f"min {min(times):.2f}s max {max(times):.2f}s\n"
        )


def _print_usage(result: dict[str, Any]) -> None:
    for msg in result["messages"]:
        usage = getattr(msg, "usage_metadata", None)
        if usage:
            print(f"    usage: {usage}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=DEFAULT_MODEL)
    sub = parser.add_subparsers(dest="cmd", required=True)

    pdf = sub.add_parser("pdf")
    pdf.add_argument("path", type=Path)
    pdf.add_argument("--effort", default="low")

    fu = sub.add_parser("followup")
    fu.add_argument("--effort", nargs="+", default=["minimal", "low"])
    fu.add_argument("--repeat", type=int, default=3)
    fu.add_argument("--answer", default=VAGUE_ANSWER)

    args = parser.parse_args()
    if args.cmd == "pdf":
        run_pdf(args.path, args.model, args.effort)
    else:
        run_followup(args.model, args.effort, args.repeat, args.answer)


if __name__ == "__main__":
    main()
