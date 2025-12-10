"""Example usage of the skill, experience, education, and composite scorers"""

from app.core.composite_scorer import calculate_composite_score
from app.core.education_scorer import calculate_education_score
from app.core.experience_scorer import calculate_experience_score
from app.core.job_description_parser import parse_job_description
from app.core.resume_parser import parse_resume
from app.core.skill_scorer import calculate_skill_score
from app.models.composite_evaluation import CompositeScoreResult
from app.models.education_evaluation import EducationScoreResult
from app.models.experience_evaluation import ExperienceScoreResult
from app.models.job_description import JobDescriptionResponse
from app.models.skill_evaluation import SkillScoreResult

# --- Individual Evaluators ---


def evaluate_skills(
    jd: JobDescriptionResponse, resume_markdown: str
) -> SkillScoreResult:
    """Evaluate skills and return result"""
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
    """Evaluate experience and return result"""
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
    """Evaluate education and return result"""
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
    """Evaluate composite score and return result"""
    print("\nEvaluating composite score...")
    result = calculate_composite_score(jd=jd, resume_markdown=resume_markdown)
    print("✓ Composite scoring completed")
    return result


# --- Result Printers ---


def print_skill_results(result: SkillScoreResult) -> None:
    """Print skill score results"""
    print("\n" + "=" * 50)
    print("SKILL SCORE RESULTS")
    print("=" * 50)
    print(f"Score: {result.final_score}")
    print(f"Summary: {result.summary}")
    if result.critical_gaps:
        print(f"Critical Gaps: {', '.join(result.critical_gaps)}")


def print_experience_results(result: ExperienceScoreResult) -> None:
    """Print experience score results"""
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
    """Print education score results"""
    print("\n" + "=" * 50)
    print("EDUCATION SCORE RESULTS")
    print("=" * 50)
    print(f"Score: {result.score}")
    print(f"Candidate Degree: {result.candidate_degree or 'N/A'}")
    print(f"Field of Study: {result.field_of_study or 'N/A'}")
    print(f"Summary: {result.summary}")


def print_composite_results(result: CompositeScoreResult) -> None:
    """Print composite score results"""
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


# --- Main ---


def main():
    print("Starting scoring process...")

    # Parse job description
    print("\nParsing job description...")
    with open("data/job.txt") as f:
        jd_text = f.read()
    jd = parse_job_description(jd_text)
    print(f"✓ Parsed: {jd.job_title}")

    # Load resume
    print("\nLoading resume...")
    with open("data/sp_md.txt") as f:
        resume_markdown = f.read()
    print("✓ Resume loaded")

    # # Parse resume
    # print("\nParsing resume...")
    # resume = parse_resume("data/resume.pdf")
    # if not resume.is_resume or not resume.markdown_content:
    #     print("✗ Failed to parse resume")
    #     return
    # print(f"✓ Parsed: {resume.personal_information.name if resume.personal_information else 'Unknown'}")
    # resume_markdown = resume.markdown_content

    # --- Individual Evaluations (comment out as needed) ---

    # skill_result = evaluate_skills(jd, resume_markdown)
    # print_skill_results(skill_result)

    # exp_result = evaluate_experience(jd, resume_markdown)
    # print_experience_results(exp_result)

    # edu_result = evaluate_education(jd, resume_markdown)
    # print_education_results(edu_result)

    # --- Composite Evaluation ---

    composite_result = evaluate_composite(jd, resume_markdown)
    print_composite_results(composite_result)


if __name__ == "__main__":
    main()
