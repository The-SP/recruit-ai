"""Example usage of the skill, experience, education, and composite scorers"""

from uuid import UUID

from app.core.job_description_parser import parse_job_description
from app.core.resume_parser import parse_resume
from app.evaluation.composite_scorer import calculate_composite_score
from app.evaluation.education_scorer import calculate_education_score
from app.evaluation.experience_scorer import calculate_experience_score
from app.evaluation.skill_scorer import calculate_skill_score
from app.models.database import create_session
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.job_repository import JobRepository
from app.schemas.composite_evaluation import CompositeScoreResult
from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.experience_evaluation import ExperienceScoreResult
from app.schemas.job_description import (
    EducationRequirement,
    ExperienceRequirement,
    JobDescriptionResponse,
    JobRequirementsSchema,
    SkillGroup,
    SkillRequirements,
)
from app.schemas.skill_evaluation import SkillScoreResult

# =============================================================================
# CONFIGURATION - Set these to control behavior
# =============================================================================

# Set to None to parse fresh, or provide UUID string to fetch from DB
EXISTING_JOB_ID: str | None = "cf6c7877-389f-426f-a4cb-7c1b7be36f1f"
EXISTING_CANDIDATE_ID: str | None = "f8ace116-0ce2-4688-8db4-19f8c0aec656"

# File paths for parsing new data
JOB_FILE_PATH = "data/job.txt"
RESUME_PDF_PATH = "data/resume.pdf"

# =============================================================================
# Data Loaders
# =============================================================================


def load_job_description() -> tuple[JobDescriptionResponse, UUID]:
    """
    Load job description either from DB or by parsing file.
    Returns: (JobDescriptionResponse, job_id)
    """
    db = create_session()
    try:
        repo = JobRepository(db)

        if EXISTING_JOB_ID:
            print(f"\nFetching job from DB: {EXISTING_JOB_ID}")
            job_id = UUID(EXISTING_JOB_ID)
            job = repo.get_by_id(job_id, with_requirements=True)
            if not job:
                raise ValueError(f"Job not found: {EXISTING_JOB_ID}")
            jd = _job_model_to_response(job)
            print(f"✓ Loaded from DB: {jd.job_title}")
            return jd, job_id
        else:
            print("\nParsing job description from file...")
            with open(JOB_FILE_PATH) as f:
                jd_text = f.read()
            jd = parse_job_description(jd_text)
            print(f"✓ Parsed: {jd.job_title}")

            # Save to DB
            job = repo.create(jd, jd_text)
            print(f"✓ Saved job to DB: {job.id}")
            return jd, job.id
    finally:
        db.close()


def load_resume() -> tuple[str, UUID]:
    """
    Load resume markdown either from DB or by parsing PDF.
    Returns: (markdown_content, candidate_id)
    """
    db = create_session()
    try:
        repo = CandidateRepository(db)

        if EXISTING_CANDIDATE_ID:
            print(f"\nFetching candidate from DB: {EXISTING_CANDIDATE_ID}")
            candidate_id = UUID(EXISTING_CANDIDATE_ID)
            candidate = repo.get_by_id(candidate_id)
            if not candidate:
                raise ValueError(f"Candidate not found: {EXISTING_CANDIDATE_ID}")
            if not candidate.resume_markdown:
                raise ValueError(
                    f"Candidate has no resume markdown: {EXISTING_CANDIDATE_ID}"
                )
            print(f"✓ Loaded from DB: {candidate.name}")
            return candidate.resume_markdown, candidate_id
        else:
            print("\nParsing resume from PDF...")
            resume = parse_resume(RESUME_PDF_PATH)
            if not resume.is_resume or not resume.markdown_content:
                raise ValueError("Failed to parse resume or not a valid resume")
            name = (
                resume.personal_information.name
                if resume.personal_information
                else "Unknown"
            )
            print(f"✓ Parsed: {name}")

            # Save to DB
            filename = RESUME_PDF_PATH.split("/")[-1]
            candidate = repo.create(resume, filename, RESUME_PDF_PATH)
            print(f"✓ Saved candidate to DB: {candidate.id}")
            return resume.markdown_content, candidate.id
    finally:
        db.close()


def save_evaluation(
    candidate_id: UUID, job_id: UUID, result: CompositeScoreResult
) -> UUID:
    """Save evaluation result to DB. Returns evaluation ID."""
    db = create_session()
    try:
        repo = EvaluationRepository(db)
        evaluation = repo.upsert(candidate_id, job_id, result)
        print(f"✓ Saved evaluation to DB: {evaluation.id}")
        return evaluation.id
    finally:
        db.close()


def _job_model_to_response(job) -> JobDescriptionResponse:
    """Convert Job model to JobDescriptionResponse schema"""
    requirements = None
    if job.requirements:
        req = job.requirements
        skills = None
        if req.skills:
            skills = SkillRequirements(
                critical=[SkillGroup(**g) for g in req.skills.get("critical", [])],
                required=[SkillGroup(**g) for g in req.skills.get("required", [])],
                preferred=[SkillGroup(**g) for g in req.skills.get("preferred", [])],
            )
        requirements = JobRequirementsSchema(
            experience=ExperienceRequirement(
                min_years=req.exp_min_years,
                max_years=req.exp_max_years,
                level=req.exp_level,
                key_skills=req.exp_key_skills,
                key_responsibilities=req.exp_key_responsibilities,
            )
            if req.exp_min_years or req.exp_level
            else None,
            education=EducationRequirement(
                min_degree=req.edu_min_degree,
                preferred_fields=req.edu_preferred_fields,
                required=req.edu_required,
            )
            if req.edu_min_degree
            else None,
            skills=skills,
            certifications=req.certifications,
            other_requirements=req.other_requirements,
        )

    return JobDescriptionResponse(
        is_job_description=job.is_valid_jd or False,
        document_type=job.document_type,
        job_title=job.title,
        company_name=job.company_name,
        summary=job.summary,
        responsibilities=job.responsibilities,
        requirements=requirements,
        keywords=job.keywords,
    )


# =============================================================================
# Individual Evaluators
# =============================================================================


def evaluate_skills(
    jd: JobDescriptionResponse, resume_markdown: str
) -> SkillScoreResult:
    print("\nEvaluating skills...")
    if not jd.requirements or not jd.requirements.skills:
        raise ValueError("No skill requirements found in job description")
    result = calculate_skill_score(
        skill_requirements=jd.requirements.skills,
        resume_markdown=resume_markdown,
    )
    print("✓ Skill scoring completed")
    return result


def evaluate_experience(
    jd: JobDescriptionResponse, resume_markdown: str
) -> ExperienceScoreResult:
    print("\nEvaluating experience...")
    if not jd.requirements or not jd.requirements.experience:
        raise ValueError("No experience requirements found in job description")
    result = calculate_experience_score(
        experience_requirement=jd.requirements.experience,
        resume_markdown=resume_markdown,
        job_title=jd.job_title,
    )
    print("✓ Experience scoring completed")
    return result


def evaluate_education(
    jd: JobDescriptionResponse, resume_markdown: str
) -> EducationScoreResult:
    print("\nEvaluating education...")
    if not jd.requirements or not jd.requirements.education:
        raise ValueError("No education requirements found in job description")
    result = calculate_education_score(
        education_requirement=jd.requirements.education,
        resume_markdown=resume_markdown,
    )
    print("✓ Education scoring completed")
    return result


def evaluate_composite(
    jd: JobDescriptionResponse, resume_markdown: str
) -> CompositeScoreResult:
    print("\nEvaluating composite score...")
    result = calculate_composite_score(jd=jd, resume_markdown=resume_markdown)
    print("✓ Composite scoring completed")
    return result


# =============================================================================
# Result Printers
# =============================================================================


def print_skill_results(result: SkillScoreResult) -> None:
    print("\n" + "=" * 50)
    print("SKILL SCORE RESULTS")
    print("=" * 50)
    print(f"Score: {result.final_score}")
    print(f"Summary: {result.summary}")
    if result.critical_gaps:
        print(f"Critical Gaps: {', '.join(result.critical_gaps)}")


def print_experience_results(result: ExperienceScoreResult) -> None:
    print("\n" + "=" * 50)
    print("EXPERIENCE SCORE RESULTS")
    print("=" * 50)
    print(f"Score: {result.experience_score}")
    print(f"Effective Years: {result.effective_years}")
    print(f"Required Years: {result.required_years}")
    print(f"Summary: {result.summary}")

    print("\n--- Evaluations ---")
    for e in result.llm_response.evaluations:
        end_display = e.end_date or "present"
        print(f"  {e.job_title} @ {e.company}")
        print(
            f"    Period: {e.start_date} to {end_display} ({e.duration_months} months)"
        )
        print(f"    Relevance: {e.relevance.value}")
        print(f"    Evidence: {e.evidence}")
        print()


def print_education_results(result: EducationScoreResult) -> None:
    print("\n" + "=" * 50)
    print("EDUCATION SCORE RESULTS")
    print("=" * 50)
    print(f"Score: {result.score}")
    print(f"Candidate Degree: {result.candidate_degree or 'N/A'}")
    print(f"Field of Study: {result.field_of_study or 'N/A'}")
    print(f"Summary: {result.summary}")


def print_composite_results(result: CompositeScoreResult) -> None:
    print("\n" + "=" * 60)
    print("COMPOSITE SCORE RESULTS")
    print("=" * 60)

    print(f"\nFinal Score: {result.final_score}")
    print(f"Hire Signal: {result.hire_signal.value}")
    print(f"Summary: {result.summary}")

    print("\n--- Component Scores ---")
    if result.skill_score is not None:
        print(
            f"  Skills: {result.skill_score:.3f} (weight: {result.weights_used['skills']:.2f})"
        )
    if result.experience_score is not None:
        print(
            f"  Experience: {result.experience_score:.3f} (weight: {result.weights_used['experience']:.2f})"
        )
    if result.education_score is not None:
        print(
            f"  Education: {result.education_score:.3f} (weight: {result.weights_used['education']:.2f})"
        )

    print(f"\nActive Components: {', '.join(result.active_components)}")

    if result.skill_result and result.skill_result.critical_gaps:
        print(f"\nCritical Skill Gaps: {', '.join(result.skill_result.critical_gaps)}")

    print("\n" + "=" * 60)


# =============================================================================
# Main
# =============================================================================


def main():
    print("Starting scoring process...")

    # Load job description (from DB or parse new)
    jd, job_id = load_job_description()
    print(f"Job ID: {job_id}")

    # Load resume (from DB or parse new)
    resume_markdown, candidate_id = load_resume()
    print(f"Candidate ID: {candidate_id}")

    # --- Individual Evaluations (uncomment as needed) ---

    # skill_result = evaluate_skills(jd, resume_markdown)
    # print_skill_results(skill_result)

    # exp_result = evaluate_experience(jd, resume_markdown)
    # print_experience_results(exp_result)

    # edu_result = evaluate_education(jd, resume_markdown)
    # print_education_results(edu_result)

    # --- Composite Evaluation ---

    composite_result = evaluate_composite(jd, resume_markdown)
    print_composite_results(composite_result)

    # Save evaluation to DB
    evaluation_id = save_evaluation(candidate_id, job_id, composite_result)
    print(f"Evaluation ID: {evaluation_id}")


if __name__ == "__main__":
    main()
