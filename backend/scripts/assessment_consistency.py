"""
Manual stability check for the interview assessor's competency levels.

Assesses fixed transcripts several times through the real prompt and reports
how much the levels, the recommendation and the resume-contradiction flag move
between runs. A level that wanders from 2 to 4 on the same transcript means
nothing, so run this after changing the assessor prompt, the level
descriptions, or INTERVIEW_MODEL_NAME, before trusting the numbers.

Not a test: model output varies by design, and every run spends Gemini quota.

Usage:
    uv run -m scripts.assessment_consistency --dry-run        # print the prompt, no LLM call
    uv run -m scripts.assessment_consistency                  # 10 runs per fixture
    uv run -m scripts.assessment_consistency --runs 5 --fixture mixed

Cost: one model call per run per fixture (20 by default). LangChain may retry
once on malformed structured output. Nothing here touches the database or the
app's LLM budget counter.

Pass bar, per competency: at least 80% of runs on the same level, and no two
runs more than one level apart. Below that, tighten the level descriptions
before showing levels to recruiters.
"""

import argparse
import json
from collections import Counter
from types import SimpleNamespace
from typing import Any

from app.config import Config
from app.interview import assessor
from app.schemas.interview import Competency

MIN_MODAL_SHARE = 0.8
MAX_SPREAD = 1

# ---------------------------------------------------------------------------
# Fixtures: one backend role, two candidates. "mixed" is strong on database
# work but overstates API design on the resume, so it should land on
# borderline with one contradiction; "strong" should advance with none.
# ---------------------------------------------------------------------------

GROUNDING = {
    "job_title": "Backend Developer",
    "company_name": "Acme Analytics",
    "job_summary": (
        "Build and scale the APIs and data pipelines behind our survey "
        "analytics product."
    ),
    "requirements": {
        "critical_skills": ["Python", "PostgreSQL", "REST API design"],
        "required_skills": ["FastAPI or Django", "Message queues (SQS or Kafka)"],
        "min_years_experience": 3,
    },
}

RESUME = (
    "# Sam Lee\n\nBackend Developer, 3 years.\n\n"
    "- Optimized the survey analytics pipeline, cutting dashboard p95 latency.\n"
    "- Designed REST APIs for 3 services.\n"
    "- Moved report exports to an SQS-based job queue.\n"
    "- Skills: Python, FastAPI, Django, PostgreSQL, SQS."
)

SCRIPT = {
    "opening": "Hi Sam, thanks for joining. I'll ask four questions.",
    "questions": [
        {
            "id": 0,
            "focus": "role_competency",
            "subject": "Python backend fundamentals (JD critical skill)",
            "text": "Tell me briefly about the backend work you do day to day.",
        },
        {
            "id": 1,
            "focus": "experience_depth",
            "subject": "Resume claim: optimized the survey analytics pipeline",
            "text": (
                "Your resume says you optimized the analytics pipeline. What was "
                "slow, and how did you find and fix it?"
            ),
        },
        {
            "id": 2,
            "focus": "experience_depth",
            "subject": "Resume claim: designed REST APIs for 3 services",
            "text": (
                "You designed REST APIs for three services. How did you approach "
                "pagination and versioning?"
            ),
        },
        {
            "id": 3,
            "focus": "experience_depth",
            "subject": "Resume claim: moved report exports to an SQS job queue",
            "text": "Why did you move exports onto a queue, and how does it work?",
        },
    ],
    "closing": "Thanks for your time. The team will review and follow up.",
}

ANSWERS = {
    "mixed": [
        "Mostly Python services in FastAPI, some Django admin work, and a lot "
        "of time in Postgres.",
        "The dashboard query was scanning 40 million rows, so I ran EXPLAIN, "
        "saw a sequential scan, and added a composite index on survey_id and "
        "created_at. p95 went from about 8 seconds to 1.2 seconds, and I made "
        "that change on my own after noticing the alerts.",
        "Honestly I mostly worked on the data side, the APIs were already there "
        "when I joined. I added a few endpoints following the existing pattern, "
        "I think it was offset pagination.",
        "Exports were timing out the request, so we pushed them onto SQS and "
        "the request just returns a job id. A worker builds the file and the "
        "client polls for it.",
    ],
    "strong": [
        "I own two Python services end to end: FastAPI on Postgres, deployed on "
        "ECS, with SQS for anything slow.",
        "The dashboard query was scanning 40 million rows. EXPLAIN showed a "
        "sequential scan, so I added a composite index on survey_id and "
        "created_at and rewrote the date filter to be sargable. p95 went from "
        "8 seconds to 1.2. I noticed it from the alerts and drove the fix.",
        "I used cursor pagination keyed on created_at and id, because offset "
        "gets slow and skips rows when data shifts. Versioning was in the URL "
        "path, and I kept old versions alive for one release with a "
        "deprecation header. I designed all three services' APIs myself.",
        "Exports were timing out at 30 seconds, so the request now enqueues a "
        "job on SQS and returns its id. A worker builds the file, writes it to "
        "S3, and the client polls a status endpoint. I added a dead-letter "
        "queue after a malformed survey wedged the worker once.",
    ],
}


def _turn(seq: int, role: str, kind: str, q: int | None, content: str) -> Any:
    return SimpleNamespace(
        seq=seq, role=role, kind=kind, question_index=q, content=content
    )


def _turns(fixture: str) -> list[Any]:
    turns = [_turn(1, "interviewer", "opening", None, SCRIPT["opening"])]
    seq = 2
    for question, answer in zip(SCRIPT["questions"], ANSWERS[fixture]):
        turns.append(
            _turn(seq, "interviewer", "question", question["id"], question["text"])
        )
        turns.append(_turn(seq + 1, "candidate", "answer", question["id"], answer))
        seq += 2
    turns.append(_turn(seq, "interviewer", "closing", None, SCRIPT["closing"]))
    return turns


def _interview(fixture: str) -> Any:
    return SimpleNamespace(
        id=f"consistency-{fixture}",
        question_script=SCRIPT,
        grounding={**GROUNDING, "resume_markdown": RESUME},
        answer_mode="text",
        status="completed",
        level_descriptions=None,
    )


# ---------------------------------------------------------------------------
# Runs
# ---------------------------------------------------------------------------


class _Captured(Exception):
    """Raised by the dry-run agent once it has the prompt."""


def _print_prompt(fixture: str) -> None:
    prompts: list[str] = []

    def _invoke_structured(
        schema: Any, system_prompt: str, messages: list[Any], **_: Any
    ) -> Any:
        prompts.append(messages[0]["content"])
        raise _Captured()

    assessor.invoke_structured = _invoke_structured  # type: ignore[attr-defined]
    try:
        assessor.assess_transcript(_interview(fixture), _turns(fixture))
    except _Captured:
        print(prompts[0])


def _run(fixture: str, runs: int) -> dict[str, Any]:
    levels: dict[str, list[int | None]] = {c.value: [] for c in Competency}
    recommendations: list[str] = []
    contradictions: list[int] = []

    for i in range(runs):
        result = assessor.assess_transcript(_interview(fixture), _turns(fixture))
        for rating in result.competencies:
            levels[rating.name.value].append(rating.level)
        recommendations.append(result.recommendation)
        contradictions.append(
            sum(
                e.resume_consistency.value == "contradicted"
                for e in result.per_question
            )
        )
        print(
            f"  run {i + 1:>2}: levels={[r.level for r in result.competencies]} "
            f"recommendation={result.recommendation} contradictions={contradictions[-1]}"
        )

    return {
        "levels": levels,
        "recommendations": recommendations,
        "contradictions": contradictions,
    }


def _modal_share(values: list[Any]) -> tuple[Any, float]:
    value, count = Counter(values).most_common(1)[0]
    return value, count / len(values)


def _report(fixture: str, data: dict[str, Any]) -> bool:
    print(f"\n== {fixture} ==")
    passed = True
    for name, values in data["levels"].items():
        mode, share = _modal_share(values)
        rated = [v for v in values if v is not None]
        spread = max(rated) - min(rated) if rated else 0
        ok = share >= MIN_MODAL_SHARE and spread <= MAX_SPREAD
        passed &= ok
        print(
            f"  {name:<17} mode={mode!s:<5} share={share:.0%} spread={spread} "
            f"{'PASS' if ok else 'FAIL'}   {values}"
        )
    for key in ("recommendations", "contradictions"):
        mode, share = _modal_share(data[key])
        print(f"  {key:<17} mode={mode!s:<15} agreement={share:.0%}")
    return passed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[1])
    parser.add_argument("--runs", type=int, default=10, help="runs per fixture")
    parser.add_argument("--fixture", choices=sorted(ANSWERS), help="only this fixture")
    parser.add_argument("--dry-run", action="store_true", help="print the prompt only")
    parser.add_argument("--out", help="write the raw results as JSON here")
    args = parser.parse_args()

    fixtures = [args.fixture] if args.fixture else sorted(ANSWERS)

    if args.dry_run:
        _print_prompt(fixtures[0])
        return

    print(f"model={Config.INTERVIEW_MODEL_NAME} runs={args.runs}")
    results: dict[str, Any] = {}
    for fixture in fixtures:
        print(f"\n-- {fixture} --")
        results[fixture] = _run(fixture, args.runs)

    all_passed = all(_report(f, results[f]) for f in fixtures)
    print(f"\nOverall: {'PASS' if all_passed else 'FAIL'}")

    if args.out:
        with open(args.out, "w") as f:
            json.dump(results, f, indent=2)


if __name__ == "__main__":
    main()
