"""Example usage of the skill, experience, and education scorers"""

from app.core.education_scorer import calculate_education_score
from app.core.experience_scorer import calculate_experience_score
from app.core.job_description_parser import parse_job_description
from app.core.skill_scorer import calculate_skill_score
from app.models.education_evaluation import EducationScoreResult
from app.models.experience_evaluation import ExperienceScoreResult
from app.models.job_description import JobDescriptionResponse
from app.models.skill_evaluation import SkillScoreResult


def evaluate_skills(
    jd: JobDescriptionResponse, resume_markdown: str
) -> SkillScoreResult:
    """Evaluate skills and return result"""
    print("\nEvaluating skills...")
    if jd.requirements and jd.requirements.skills:
        print(f"Requirements: {jd.requirements.skills}")
        result = calculate_skill_score(
            skill_requirements=jd.requirements.skills,
            resume_markdown=resume_markdown,
        )
    else:
        raise ValueError("No skill requirements found in job description")
    print("✓ Skill scoring completed")
    return result


def evaluate_experience(
    jd: JobDescriptionResponse, resume_markdown: str
) -> ExperienceScoreResult:
    """Evaluate experience and return result"""
    print("\nEvaluating experience...")
    if jd.requirements and jd.requirements.experience:
        print(f"Requirements: {jd.requirements.experience}")
        result = calculate_experience_score(
            experience_requirement=jd.requirements.experience,
            resume_markdown=resume_markdown,
            job_title=jd.job_title,
        )
    else:
        raise ValueError("No experience requirements found in job description")
    print("✓ Experience scoring completed")
    return result


def evaluate_education(
    jd: JobDescriptionResponse, resume_markdown: str
) -> EducationScoreResult:
    """Evaluate education and return result"""
    print("\nEvaluating education...")
    if jd.requirements and jd.requirements.education:
        print(f"Requirements: {jd.requirements.education}")
        result = calculate_education_score(
            education_requirement=jd.requirements.education,
            resume_markdown=resume_markdown,
        )
    else:
        raise ValueError("No education requirements found in job description")
    print("✓ Education scoring completed")
    return result


def print_skill_results(result: SkillScoreResult) -> None:
    """Print skill score results"""
    print("\n" + "=" * 50)
    print("SKILL SCORE RESULTS")
    print("=" * 50)
    print(f"Score: {result.final_score}")
    print(f"Hire Signal: {result.hire_signal.value}")
    print(f"Summary: {result.summary}")


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


def main():
    print("Starting scoring process...")

    # Parse job description
    print("\nParsing job description...")
    with open("data/job2.txt") as f:
        jd_text = f.read()
    jd = parse_job_description(jd_text)
    print(f"✓ Parsed: {jd.job_title}")

    # Load resume
    print("\nLoading resume...")
    with open("data/sp_md.txt") as f:
        resume_markdown = f.read()
    print("✓ Resume loaded")

    # Evaluate and print results
    # skill_result = evaluate_skills(jd, resume_markdown)
    # print_skill_results(skill_result)

    # exp_result = evaluate_experience(jd, resume_markdown)
    # print_experience_results(exp_result)

    edu_result = evaluate_education(jd, resume_markdown)
    print_education_results(edu_result)


if __name__ == "__main__":
    main()
