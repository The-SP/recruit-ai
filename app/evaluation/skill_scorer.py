from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.models.job_description import SkillGroup, SkillRequirements
from app.models.skill_evaluation import (
    LLMEvaluationResponse,
    MatchType,
    SkillGroupEvaluation,
    SkillScoreResult,
)

logger = init_logger(__name__)

# --- Constants ---

MATCH_TYPE_SCORES: dict[MatchType, float] = {
    MatchType.EXACT: 1.0,
    MatchType.EQUIVALENT: 0.85,
    MatchType.TRANSFERABLE: 0.65,
    MatchType.FOUNDATIONAL: 0.40,
    MatchType.NONE: 0.0,
}

CRITICAL_PASSING_TYPES: set[MatchType] = {MatchType.EXACT, MatchType.EQUIVALENT}

BASE_WEIGHTS = {"required": 85, "preferred": 15}

# --- Prompt ---

EVALUATION_PROMPT = """You are an expert technical recruiter evaluating skill matches between job requirements and a candidate's resume.

## Your Task

Evaluate EACH skill group below against the candidate's resume. For each skill group, determine the best match type.

## Match Type Definitions

- **exact**: Skill explicitly listed in resume (e.g., job needs "Python", resume lists "Python")
- **equivalent**: Different name but same capability (e.g., "FastAPI" ≈ "Django" for Python web frameworks)
- **transferable**: Related skill with knowledge transfer (e.g., "React" experience transfers to "Vue.js")
- **foundational**: Has prerequisite knowledge, can learn quickly (e.g., strong "JavaScript" for "TypeScript" role)
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


def _format_skill_groups(skill_groups: list[SkillGroup], tier: str) -> str:
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
    has_required: bool, has_preferred: bool
) -> dict[str, float]:
    """Calculate weights based on which tiers are present"""
    present = {}

    if has_required:
        present["required"] = BASE_WEIGHTS["required"]
    if has_preferred:
        present["preferred"] = BASE_WEIGHTS["preferred"]

    if not present:
        return {"required": 0.0, "preferred": 0.0}

    total = sum(present.values())

    return {
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

    critical_text = _format_skill_groups(skill_requirements.critical or [], "critical")
    required_text = _format_skill_groups(skill_requirements.required or [], "required")
    preferred_text = _format_skill_groups(
        skill_requirements.preferred or [], "preferred"
    )

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

    messages: Any = [{"role": "user", "content": prompt}]
    result = agent.invoke({"messages": messages})
    llm_response: LLMEvaluationResponse = result["structured_response"]

    # --- Step 3: Calculate tier scores ---

    required_evals = [e for e in llm_response.evaluations if e.tier == "required"]
    preferred_evals = [e for e in llm_response.evaluations if e.tier == "preferred"]

    required_score = _calculate_tier_score(required_evals) if required_evals else 1.0
    preferred_score = _calculate_tier_score(preferred_evals) if preferred_evals else 0.0

    # --- Step 4: Calculate dynamic weights ---

    weights = _calculate_dynamic_weights(
        has_required=bool(skill_requirements.required),
        has_preferred=bool(skill_requirements.preferred),
    )

    # --- Step 5: Calculate base score ---

    if weights["required"] == 0 and weights["preferred"] == 0:
        base_score = 1.0  # No required/preferred skills defined
    else:
        base_score = (
            weights["required"] * required_score
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
        required_score=round(required_score, 3),
        preferred_score=round(preferred_score, 3),
        critical_gaps=critical_gaps,
        critical_penalty=round(critical_penalty, 3),
        final_score=round(final_score, 3),
        summary=summary,
    )
