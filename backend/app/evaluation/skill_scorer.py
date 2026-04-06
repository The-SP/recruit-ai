from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.schemas.job_description import SkillGroup, SkillRequirements
from app.schemas.skill_evaluation import (
    LLMEvaluationResponse,
    MatchType,
    SkillGroupEvaluation,
    SkillScoreResult,
)

logger = init_logger(__name__)

# --- Constants ---

MATCH_TYPE_SCORES: dict[MatchType, float] = {
    MatchType.EXACT: 1.0,
    MatchType.PARTIAL: 0.65,
    MatchType.NONE: 0.0,
}

CRITICAL_PASSING_TYPES: set[MatchType] = {MatchType.EXACT, MatchType.PARTIAL}

BASE_WEIGHTS: dict[str, float] = {"critical": 0.30, "required": 0.55, "preferred": 0.15}

# --- Prompt ---

EVALUATION_PROMPT = """You are an expert technical recruiter evaluating skill matches between job requirements and a candidate's resume.

## Your Task

Evaluate EACH skill group below against the candidate's resume. For each skill group, determine the best match type.

## Match Type Definitions

- **exact**: Skill explicitly listed in resume (e.g., job needs "Python", resume lists "Python")
- **partial**: Related or equivalent skill present (e.g., "Django" for a "FastAPI" role; "React" for "Vue.js"; strong "JavaScript" base for "TypeScript")
- **none**: No evidence of skill or related experience in resume

## Evaluation Rules

1. Check the ENTIRE resume: skills section, work experience, projects, certifications
2. For skill groups with multiple options (e.g., ["Django", "FastAPI", "Flask"]), candidate needs ANY ONE
3. Match the BEST option in each group - if candidate has Django, the group matches even if they lack FastAPI
4. Look for implicit skills demonstrated through experience, not just explicit listings
5. Provide specific evidence from the resume for each evaluation

## Skill Groups to Evaluate

### Critical Skills (dealbreakers if missing)
{critical_skills}

### Required Skills (important for the role)
{required_skills}

### Preferred Skills (nice to have)
{preferred_skills}

---

## Candidate Resume

{resume_markdown}

---

Evaluate each skill group and respond with the LLMEvaluationResponse schema."""


# --- Helper Functions ---


def _format_skill_groups(skill_groups: list[SkillGroup]) -> str:
    """Format skill groups for prompt"""
    if not skill_groups:
        return "None specified"

    lines = []
    for i, group in enumerate(skill_groups, 1):
        options_str = ", ".join(group.options)
        parts = [f"{i}. [{options_str}]"]

        if group.min_years:
            parts.append(f"({group.min_years}+ years)")
        if group.min_proficiency:
            parts.append(f"(proficiency: {group.min_proficiency})")

        lines.append(" ".join(parts))

    return "\n".join(lines)


def _calculate_dynamic_weights(
    has_critical: bool, has_required: bool, has_preferred: bool
) -> dict[str, float]:
    """Calculate weights based on which tiers are present"""
    present = {}

    if has_critical:
        present["critical"] = BASE_WEIGHTS["critical"]
    if has_required:
        present["required"] = BASE_WEIGHTS["required"]
    if has_preferred:
        present["preferred"] = BASE_WEIGHTS["preferred"]

    if not present:
        return {"critical": 0.0, "required": 0.0, "preferred": 0.0}

    total = sum(present.values())

    return {
        "critical": present.get("critical", 0) / total,
        "required": present.get("required", 0) / total,
        "preferred": present.get("preferred", 0) / total,
    }


def _calculate_tier_score(evaluations: list[SkillGroupEvaluation]) -> float:
    """Calculate average score for a tier"""
    if not evaluations:
        return 0.0

    scores = [MATCH_TYPE_SCORES[e.match_type] for e in evaluations]
    return sum(scores) / len(scores)


def _identify_critical_gaps(
    evaluations: list[SkillGroupEvaluation],
) -> list[str]:
    """Find critical skills that don't pass the gate"""
    gaps = []

    critical_evals = [e for e in evaluations if e.tier == "critical"]

    for eval in critical_evals:
        if eval.match_type not in CRITICAL_PASSING_TYPES:
            gaps.append(", ".join(eval.skill_options))

    return gaps


def _calculate_critical_penalty(gaps_count: int) -> float:
    """Calculate penalty multiplier for critical gaps"""
    if gaps_count == 0:
        return 1.0
    return 0.5**gaps_count


def _validate_evaluation_counts(
    llm_response: LLMEvaluationResponse,
    skill_requirements: SkillRequirements,
) -> None:
    """Log warnings if LLM evaluation counts don't match expected skill groups."""
    expected = {
        "critical": len(skill_requirements.critical or []),
        "required": len(skill_requirements.required or []),
        "preferred": len(skill_requirements.preferred or []),
    }

    actual: dict[str, int] = {"critical": 0, "required": 0, "preferred": 0}
    for e in llm_response.evaluations:
        if e.tier in actual:
            actual[e.tier] += 1

    for tier in ("critical", "required", "preferred"):
        if expected[tier] != actual[tier]:
            logger.warning(
                f"Tier '{tier}' count mismatch: expected {expected[tier]}, got {actual[tier]}"
            )


def _generate_summary(
    final_score: float,
    strengths: list[str],
    critical_gaps: list[str],
) -> str:
    """Generate HR-friendly summary"""
    score_pct = int(final_score * 100)

    if final_score >= 0.85:
        opener = f"Excellent skills match ({score_pct}%)."
    elif final_score >= 0.70:
        opener = f"Good skills match ({score_pct}%)."
    elif final_score >= 0.55:
        opener = f"Partial skills match ({score_pct}%)."
    elif final_score >= 0.40:
        opener = f"Weak skills match ({score_pct}%)."
    else:
        opener = f"Poor skills match ({score_pct}%)."

    parts = [opener]

    if strengths:
        parts.append(f"Strong in: {', '.join(strengths[:3])}.")

    if critical_gaps:
        parts.append(f"Missing critical: {', '.join(critical_gaps)}.")

    return " ".join(parts)


# --- Main Function ---


def calculate_skill_score(
    skill_requirements: SkillRequirements,
    resume_markdown: str,
) -> SkillScoreResult:
    """
    Calculate skill match score between job requirements and resume.

    Args:
        skill_requirements: Parsed skill requirements from job description
        resume_markdown: Full markdown content of resume

    Returns:
        SkillScoreResult with scores and evaluations
    """

    logger.info("Starting skill evaluation")

    # --- Step 1: Build prompt ---

    critical_text = _format_skill_groups(skill_requirements.critical or [])
    required_text = _format_skill_groups(skill_requirements.required or [])
    preferred_text = _format_skill_groups(skill_requirements.preferred or [])

    prompt = EVALUATION_PROMPT.format(
        critical_skills=critical_text,
        required_skills=required_text,
        preferred_skills=preferred_text,
        resume_markdown=resume_markdown,
    )

    # --- Step 2: Call LLM ---

    agent = create_agent(
        model=Config.MODEL_NAME,
        system_prompt="You are a helpful assistant that evaluates candidate-job fit and returns structured JSON.",
        response_format=ToolStrategy(LLMEvaluationResponse),
    )

    messages: list[Any] = [{"role": "user", "content": prompt}]
    result = agent.invoke({"messages": messages})
    llm_response: LLMEvaluationResponse = result["structured_response"]

    _validate_evaluation_counts(llm_response, skill_requirements)

    # --- Step 3: Calculate tier scores ---

    critical_evals = [e for e in llm_response.evaluations if e.tier == "critical"]
    required_evals = [e for e in llm_response.evaluations if e.tier == "required"]
    preferred_evals = [e for e in llm_response.evaluations if e.tier == "preferred"]

    if critical_evals:
        critical_score = _calculate_tier_score(critical_evals)
    elif skill_requirements.critical:
        logger.warning(
            f"LLM returned 0 critical evaluations but {len(skill_requirements.critical)} critical skill groups exist"
        )
        critical_score = 0.0
    else:
        critical_score = 0.0

    if required_evals:
        required_score = _calculate_tier_score(required_evals)
    elif skill_requirements.required:
        logger.warning(
            f"LLM returned 0 required evaluations but {len(skill_requirements.required)} required skill groups exist"
        )
        required_score = 0.0
    else:
        required_score = 0.0

    if preferred_evals:
        preferred_score = _calculate_tier_score(preferred_evals)
    elif skill_requirements.preferred:
        logger.warning(
            f"LLM returned 0 preferred evaluations but {len(skill_requirements.preferred)} preferred skill groups exist"
        )
        preferred_score = 0.0
    else:
        preferred_score = 0.0

    # --- Step 4: Calculate dynamic weights ---

    weights = _calculate_dynamic_weights(
        has_critical=bool(skill_requirements.critical),
        has_required=bool(skill_requirements.required),
        has_preferred=bool(skill_requirements.preferred),
    )

    # --- Step 5: Calculate base score ---

    if all(w == 0 for w in weights.values()):
        base_score = 1.0  # No skills defined at all
    else:
        base_score = (
            weights["critical"] * critical_score
            + weights["required"] * required_score
            + weights["preferred"] * preferred_score
        )

    # --- Step 6: Apply critical gate ---

    critical_gaps = _identify_critical_gaps(llm_response.evaluations)
    critical_penalty = _calculate_critical_penalty(len(critical_gaps))

    # --- Step 7: Final score ---

    final_score = base_score * critical_penalty

    # --- Step 8: Generate summary ---

    summary = _generate_summary(
        final_score=final_score,
        strengths=llm_response.strengths,
        critical_gaps=critical_gaps,
    )

    logger.info(
        f"Skill evaluation complete - Final score: {final_score:.3f} | Critical gaps: {len(critical_gaps)}"
    )

    # --- Return result ---

    return SkillScoreResult(
        llm_response=llm_response,
        critical_score=round(critical_score, 3),
        required_score=round(required_score, 3),
        preferred_score=round(preferred_score, 3),
        critical_gaps=critical_gaps,
        critical_penalty=round(critical_penalty, 3),
        final_score=round(final_score, 3),
        summary=summary,
    )
