from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.job_description import EducationRequirement

logger = init_logger(__name__)

EDUCATION_OPTIONAL_SCORE_FLOOR = 0.4

# --- Prompt ---

EVALUATION_PROMPT = """You are an expert recruiter evaluating education qualifications.

## Your Task

Evaluate the candidate's education against the job requirements and provide a score from 0.0 to 1.0.

## Scoring Guidelines

| Score Range | Criteria |
|-------------|----------|
| 0.9 - 1.0  | Meets/exceeds degree requirement with directly relevant field |
| 0.7 - 0.89 | Meets degree requirement with related field, OR exceeds requirement with tangential field |
| 0.5 - 0.69 | Partially meets (lower degree but relevant field, OR meets degree but unrelated field) |
| 0.3 - 0.49 | Doesn't meet requirement but has some formal education |
| 0.0 - 0.29 | No relevant education when education is required |

## Field Relevance (for tech roles)

- **Directly relevant**: Computer Science, Software Engineering, Information Technology
- **Related**: Mathematics, Physics, Data Science, Statistics, Electrical Engineering
- **Tangential**: Other Engineering, Economics, Business Analytics
- **Unrelated**: Non-technical fields with no transferable quantitative skills

## Important Notes

1. In tech, field relevance often matters more than degree level
2. Be generous — education is rarely a dealbreaker in tech hiring

---

## Job Education Requirements

**Minimum Degree:** {min_degree}
**Preferred Fields:** {preferred_fields}
**Education Required:** {education_required}

---

## Candidate Resume

{resume_markdown}

---

Evaluate the candidate's education and respond with the EducationScoreResult schema."""


# --- Main Function ---


def calculate_education_score(
    education_requirement: EducationRequirement,
    resume_markdown: str,
) -> EducationScoreResult:
    """
    Calculate education match score.

    Args:
        education_requirement: Parsed education requirements from JD
        resume_markdown: Full markdown content of resume

    Returns:
        EducationScoreResult with score and summary
    """
    logger.info("Starting education evaluation")

    # --- Handle no requirements ---

    if (
        not education_requirement.min_degree
        and not education_requirement.preferred_fields
    ):
        logger.info("No education requirement specified, returning perfect score")
        return EducationScoreResult(
            score=1.0,
            candidate_degree=None,
            field_of_study=None,
            summary="No education requirement specified",
        )

    # --- Build prompt ---

    min_degree = education_requirement.min_degree or "Not specified"
    preferred_fields = (
        ", ".join(education_requirement.preferred_fields)
        if education_requirement.preferred_fields
        else "Not specified"
    )
    education_required = (
        "Yes" if education_requirement.required else "No (nice-to-have)"
    )

    prompt = EVALUATION_PROMPT.format(
        min_degree=min_degree,
        preferred_fields=preferred_fields,
        education_required=education_required,
        resume_markdown=resume_markdown,
    )

    # --- Call LLM ---

    agent = create_agent(
        model=Config.MODEL_NAME,
        system_prompt="You evaluate education qualifications and return structured JSON.",
        response_format=ToolStrategy(EducationScoreResult),
    )

    messages: Any = [{"role": "user", "content": prompt}]
    result = agent.invoke({"messages": messages})
    llm_response: EducationScoreResult = result["structured_response"]

    # --- Apply floor if education not required ---

    if not education_requirement.required:
        llm_response.score = max(llm_response.score, EDUCATION_OPTIONAL_SCORE_FLOOR)

    logger.info(
        f"Education evaluation complete - Score: {llm_response.score:.2f} | "
        f"Degree: {llm_response.candidate_degree} | Field: {llm_response.field_of_study}"
    )

    return llm_response
