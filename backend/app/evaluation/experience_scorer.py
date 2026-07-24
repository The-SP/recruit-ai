from datetime import date
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.schemas.experience_evaluation import (
    ExperienceEvaluation,
    ExperienceRelevance,
    ExperienceScoreResult,
    LLMExperienceResponse,
)
from app.schemas.job_description import ExperienceRequirement

logger = init_logger(__name__)

# --- Constants ---

RELEVANCE_WEIGHTS: dict[ExperienceRelevance, float] = {
    ExperienceRelevance.HIGH: 1.0,
    ExperienceRelevance.MEDIUM: 0.6,
    ExperienceRelevance.LOW: 0.25,
    ExperienceRelevance.NONE: 0.0,
}

# --- Prompt ---

EVALUATION_PROMPT = """You are an expert recruiter evaluating work experience relevance.

## Your Task

Evaluate EACH work experience entry from the candidate's resume against the job requirements.

## Date Extraction

- Extract start_date in YYYY-MM format (e.g., "May 2024" → "2024-05")
- Extract end_date in YYYY-MM format, or null if "present"/"current"/"ongoing"
- If only year given, use January (e.g., "2023" → "2023-01")

## Relevance Levels

- **high**: Role directly matches target job (same title, same responsibilities, same domain)
- **medium**: Related role with transferable responsibilities (adjacent position, overlapping skills)
- **low**: Tangentially related (some relevant exposure but different focus)
- **none**: Unrelated to target role

## Job Requirements

**Title:** {job_title}
**Level:** {level}
**Required Experience:** {min_years} years
**Key Skills:** {key_skills}
**Key Responsibilities:** {key_responsibilities}

## Evaluation Rules

1. Assess each position independently
2. Consider job title, responsibilities, and skills used
3. Higher relevance if candidate's past work involved the key skills and responsibilities
4. Provide brief evidence for each relevance rating
5. Be realistic—don't inflate relevance for loosely related work

---

## Candidate Resume

{resume_markdown}

---

Respond with the LLMExperienceResponse schema."""


# --- Helper Functions ---


_PRESENT_STRINGS = {
    "present",
    "current",
    "ongoing",
    "now",
    "today",
    "null",
    "none",
    "n/a",
    "-",
}


def _parse_date(date_str: str) -> date:
    """Parse YYYY-MM string to date object"""
    parts = date_str.split("-")
    return date(int(parts[0]), int(parts[1]), 1)


def _is_present(date_str: str | None) -> bool:
    """Return True if the date string means 'currently employed'."""
    return date_str is None or date_str.strip().lower() in _PRESENT_STRINGS


def _calculate_duration_months(start_date: str, end_date: str | None) -> int:
    """Calculate duration in months between start and end date"""
    start = _parse_date(start_date)
    end = (
        _parse_date(end_date)
        if (end_date and not _is_present(end_date))
        else date.today()
    )

    months = (end.year - start.year) * 12 + (end.month - start.month)
    return max(months, 1)


def _calculate_effective_months(
    evaluations: list[ExperienceEvaluation],
) -> tuple[float, bool]:
    """Calculate weighted effective months, handling overlapping roles.

    Uses a sweep-line over interval boundaries. For each segment between
    consecutive boundary dates, picks the most recently started overlapping
    role (recency wins), preventing double-counting of concurrent positions.
    All intervals (including NONE-relevance) participate in cutoff tracking
    so that irrelevant recent roles correctly block older relevant ones.

    Returns:
        (effective_months, had_overlap) — had_overlap is True if any roles
        overlapped in time, for use in summary messaging.
    """
    if not evaluations:
        return 0.0, False

    intervals: list[tuple[date, date, float]] = []
    for e in evaluations:
        weight = RELEVANCE_WEIGHTS.get(e.relevance, 0.0)
        start = _parse_date(e.start_date)
        end = (
            _parse_date(e.end_date)
            if (e.end_date and not _is_present(e.end_date))
            else date.today()
        )
        intervals.append((start, end, weight))

    # Sort by start descending so most recently started role takes priority
    intervals.sort(key=lambda x: x[0], reverse=True)

    total = 0.0
    had_overlap = False
    cutoff = None
    for interval_start, interval_end, weight in intervals:
        if cutoff is not None and interval_end > cutoff:
            had_overlap = True
            interval_end = cutoff
        if weight > 0.0 and interval_end > interval_start:
            months = (interval_end.year - interval_start.year) * 12 + (
                interval_end.month - interval_start.month
            )
            total += months * weight
        cutoff = interval_start

    return total, had_overlap


def _generate_summary(
    effective_years: float,
    required_years: float,
    score: float,
    had_overlap: bool = False,
) -> str:
    """Generate summary"""
    score_pct = int(score * 100)

    if score >= 1.0:
        base = f"Meets experience requirement ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"
    elif score >= 0.7:
        base = f"Mostly meets requirement ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"
    elif score >= 0.4:
        base = f"Partial experience match ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"
    else:
        base = f"Limited relevant experience ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"

    if had_overlap:
        base += " | [Concurrent roles detected: only the most recent role was counted per overlapping period]"

    return base


# --- Main Function ---


def calculate_experience_score(
    experience_requirement: ExperienceRequirement,
    resume_markdown: str,
    job_title: str | None = None,
) -> ExperienceScoreResult:
    """
    Calculate experience match score.

    Args:
        experience_requirement: Parsed experience requirements from JD
        resume_markdown: Full markdown content of resume
        job_title: Job title for context

    Returns:
        ExperienceScoreResult with score and evaluations
    """
    logger.info("Starting experience evaluation")

    # --- Handle missing requirements ---

    required_years = experience_requirement.min_years or 0.0

    if required_years == 0:
        logger.info("No experience requirement specified, returning perfect score")
        return ExperienceScoreResult(
            llm_response=LLMExperienceResponse(evaluations=[]),
            effective_months=0,
            effective_years=0,
            required_years=0,
            experience_score=1.0,
            summary="No experience requirement specified",
        )

    # --- Build prompt ---

    key_skills_text = (
        ", ".join(experience_requirement.key_skills or []) or "None specified"
    )
    key_resp_text = (
        "\n- ".join(experience_requirement.key_responsibilities or [])
        if experience_requirement.key_responsibilities
        else "None specified"
    )
    if experience_requirement.key_responsibilities:
        key_resp_text = "- " + key_resp_text

    prompt = EVALUATION_PROMPT.format(
        job_title=job_title or "Not specified",
        level=experience_requirement.level or "Not specified",
        min_years=required_years,
        key_skills=key_skills_text,
        key_responsibilities=key_resp_text,
        resume_markdown=resume_markdown,
    )

    # --- Call LLM ---

    agent = create_agent(
        model=build_model(),
        system_prompt="You evaluate work experience relevance and return structured JSON.",
        response_format=ToolStrategy(LLMExperienceResponse),
    )

    messages: Any = [{"role": "user", "content": prompt}]
    result = agent.invoke({"messages": messages})
    llm_response: LLMExperienceResponse = result["structured_response"]

    # --- Populate duration_months ---

    for e in llm_response.evaluations:
        e.duration_months = _calculate_duration_months(e.start_date, e.end_date)

    # --- Calculate score ---

    effective_months, had_overlap = _calculate_effective_months(
        llm_response.evaluations
    )
    effective_years = effective_months / 12

    experience_score = min(effective_years / required_years, 1.0)

    # --- Generate summary ---

    summary = _generate_summary(
        effective_years, required_years, experience_score, had_overlap
    )

    logger.info(
        f"Experience evaluation complete - Score: {experience_score:.3f} | "
        f"Effective: {effective_years:.1f} years | Required: {required_years} years"
    )

    return ExperienceScoreResult(
        llm_response=llm_response,
        effective_months=round(effective_months, 1),
        effective_years=round(effective_years, 2),
        required_years=required_years,
        experience_score=round(experience_score, 3),
        summary=summary,
    )
