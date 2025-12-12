from datetime import date
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
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


def _parse_date(date_str: str) -> date:
    """Parse YYYY-MM string to date object"""
    parts = date_str.split("-")
    return date(int(parts[0]), int(parts[1]), 1)


def _calculate_duration_months(start_date: str, end_date: str | None) -> int:
    """Calculate duration in months between start and end date"""
    start = _parse_date(start_date)
    end = _parse_date(end_date) if end_date else date.today()

    months = (end.year - start.year) * 12 + (end.month - start.month)
    return max(months, 1)


def _calculate_effective_months(evaluations: list[ExperienceEvaluation]) -> float:
    """Calculate weighted effective months"""
    total = 0.0
    for e in evaluations:
        weight = RELEVANCE_WEIGHTS.get(e.relevance, 0.0)
        total += e.duration_months * weight
    return total


def _generate_summary(
    effective_years: float,
    required_years: float,
    score: float,
) -> str:
    """Generate summary"""
    score_pct = int(score * 100)

    if score >= 1.0:
        return f"Meets experience requirement ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"
    elif score >= 0.7:
        return f"Mostly meets requirement ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"
    elif score >= 0.4:
        return f"Partial experience match ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"
    else:
        return f"Limited relevant experience ({effective_years:.1f}/{required_years:.1f} years relevant, {score_pct}%)"


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
        model=Config.MODEL_NAME,
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

    effective_months = _calculate_effective_months(llm_response.evaluations)
    effective_years = effective_months / 12

    experience_score = min(effective_years / required_years, 1.0)

    # --- Generate summary ---

    summary = _generate_summary(effective_years, required_years, experience_score)

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
