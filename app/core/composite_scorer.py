from app.core.education_scorer import calculate_education_score
from app.core.experience_scorer import calculate_experience_score
from app.core.logger import init_logger
from app.core.skill_scorer import calculate_skill_score
from app.models.composite_evaluation import CompositeScoreResult, HireSignal
from app.models.education_evaluation import EducationScoreResult
from app.models.experience_evaluation import ExperienceScoreResult
from app.models.job_description import JobDescriptionResponse
from app.models.skill_evaluation import SkillScoreResult

logger = init_logger(__name__)

# --- Constants ---

BASE_WEIGHTS = {
    "skills": 0.45,
    "experience": 0.40,
    "education": 0.15,
}

HIRE_SIGNAL_THRESHOLDS = [
    (0.85, HireSignal.STRONG_MATCH),
    (0.70, HireSignal.GOOD_MATCH),
    (0.55, HireSignal.PARTIAL_MATCH),
    (0.40, HireSignal.WEAK_MATCH),
    (0.0, HireSignal.NO_MATCH),
]

# --- Helper Functions ---


def _has_skill_requirements(jd: JobDescriptionResponse) -> bool:
    """Check if JD has skill requirements"""
    if not jd.requirements or not jd.requirements.skills:
        return False
    s = jd.requirements.skills
    return bool(s.critical or s.required or s.preferred)


def _has_experience_requirements(jd: JobDescriptionResponse) -> bool:
    """Check if JD has experience requirements"""
    if not jd.requirements or not jd.requirements.experience:
        return False
    return jd.requirements.experience.min_years is not None


def _has_education_requirements(jd: JobDescriptionResponse) -> bool:
    """Check if JD has education requirements"""
    if not jd.requirements or not jd.requirements.education:
        return False
    return bool(jd.requirements.education.min_degree)


def _redistribute_weights(active: list[str]) -> dict[str, float]:
    """Redistribute weights proportionally among active components"""
    if not active:
        return {"skills": 0.0, "experience": 0.0, "education": 0.0}

    active_base_total = sum(BASE_WEIGHTS[c] for c in active)

    result = {c: 0.0 for c in BASE_WEIGHTS}

    rounded_sum = 0.0
    for c in active[:-1]:
        w = round(BASE_WEIGHTS[c] / active_base_total, 2)
        result[c] = w
        rounded_sum += w

    # Last component gets the remainder
    result[active[-1]] = round(1.0 - rounded_sum, 2)

    return result


def _determine_hire_signal(score: float) -> HireSignal:
    """Map final score to hire signal"""
    for threshold, signal in HIRE_SIGNAL_THRESHOLDS:
        if score >= threshold:
            return signal
    return HireSignal.NO_MATCH


def _get_hire_signal_text(signal: HireSignal) -> str:
    """Map hire signal to human-readable text"""
    return {
        HireSignal.STRONG_MATCH: "Strong candidate match",
        HireSignal.GOOD_MATCH: "Good candidate match",
        HireSignal.PARTIAL_MATCH: "Partial candidate match",
        HireSignal.WEAK_MATCH: "Weak candidate match",
        HireSignal.NO_MATCH: "Poor candidate match",
        HireSignal.UNDETERMINED: "Cannot determine match",
    }.get(signal, "Unknown")


def _generate_summary(
    final_score: float | None,
    hire_signal: HireSignal,
    active_components: list[str],
    skill_score: float | None,
    experience_score: float | None,
    education_score: float | None,
) -> str:
    """Generate summary of composite score"""
    if final_score is None:
        return (
            "No requirements specified in job description. Cannot evaluate candidate."
        )

    score_pct = int(final_score * 100)
    parts = [f"{_get_hire_signal_text(hire_signal)} ({score_pct}%)."]

    # Component breakdown
    breakdown = []
    if skill_score is not None:
        breakdown.append(f"Skills: {int(skill_score * 100)}%")
    if experience_score is not None:
        breakdown.append(f"Experience: {int(experience_score * 100)}%")
    if education_score is not None:
        breakdown.append(f"Education: {int(education_score * 100)}%")

    if breakdown:
        parts.append(f"Breakdown: {', '.join(breakdown)}.")

    if len(active_components) < 3:
        inactive = set(BASE_WEIGHTS.keys()) - set(active_components)
        parts.append(f"Not evaluated: {', '.join(inactive)}.")

    return " ".join(parts)


# --- Main Function ---


def calculate_composite_score(
    jd: JobDescriptionResponse,
    resume_markdown: str,
) -> CompositeScoreResult:
    """
    Calculate composite score for a candidate against job requirements.

    Args:
        jd: Parsed job description
        resume_markdown: Full markdown content of resume

    Returns:
        CompositeScoreResult with final score and component breakdown
    """
    logger.info("Starting composite scoring")

    # --- Step 1: Detect active components ---

    active_components: list[str] = []

    has_skills = _has_skill_requirements(jd)
    has_experience = _has_experience_requirements(jd)
    has_education = _has_education_requirements(jd)

    if has_skills:
        active_components.append("skills")
    if has_experience:
        active_components.append("experience")
    if has_education:
        active_components.append("education")

    logger.info(f"Active components: {active_components}")

    # --- Step 2: Handle edge case - no requirements ---

    if not active_components:
        logger.warning("No requirements specified in job description")
        return CompositeScoreResult(
            final_score=None,
            hire_signal=HireSignal.UNDETERMINED,
            weights_used={"skills": 0.0, "experience": 0.0, "education": 0.0},
            active_components=[],
            summary="No requirements specified in job description. Cannot evaluate candidate.",
        )

    # --- Step 3: Redistribute weights ---

    weights = _redistribute_weights(active_components)
    logger.info(f"Adjusted weights: {weights}")

    # --- Step 4: Evaluate active components ---

    skill_result: SkillScoreResult | None = None
    experience_result: ExperienceScoreResult | None = None
    education_result: EducationScoreResult | None = None

    skill_score: float | None = None
    experience_score: float | None = None
    education_score: float | None = None

    if has_skills and jd.requirements and jd.requirements.skills:
        logger.info("Evaluating skills...")
        skill_result = calculate_skill_score(
            skill_requirements=jd.requirements.skills,
            resume_markdown=resume_markdown,
        )
        skill_score = skill_result.final_score

    if has_experience and jd.requirements and jd.requirements.experience:
        logger.info("Evaluating experience...")
        experience_result = calculate_experience_score(
            experience_requirement=jd.requirements.experience,
            resume_markdown=resume_markdown,
            job_title=jd.job_title,
        )
        experience_score = experience_result.experience_score

    if has_education and jd.requirements and jd.requirements.education:
        logger.info("Evaluating education...")
        education_result = calculate_education_score(
            education_requirement=jd.requirements.education,
            resume_markdown=resume_markdown,
        )
        education_score = education_result.score

    # --- Step 5: Calculate composite score ---

    final_score = 0.0
    if skill_score is not None:
        final_score += skill_score * weights["skills"]
    if experience_score is not None:
        final_score += experience_score * weights["experience"]
    if education_score is not None:
        final_score += education_score * weights["education"]

    final_score = round(final_score, 3)

    # --- Step 6: Determine hire signal ---

    hire_signal = _determine_hire_signal(final_score)

    # --- Step 7: Generate summary ---

    summary = _generate_summary(
        final_score=final_score,
        hire_signal=hire_signal,
        active_components=active_components,
        skill_score=skill_score,
        experience_score=experience_score,
        education_score=education_score,
    )

    logger.info(
        f"Composite scoring complete - Score: {final_score} | Signal: {hire_signal.value}"
    )

    return CompositeScoreResult(
        final_score=final_score,
        hire_signal=hire_signal,
        skill_score=skill_score,
        experience_score=experience_score,
        education_score=education_score,
        weights_used=weights,
        active_components=active_components,
        skill_result=skill_result,
        experience_result=experience_result,
        education_result=education_result,
        summary=summary,
    )
