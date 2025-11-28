"""Example usage of the skill scorer"""

from pprint import pprint

from app.core.job_description_parser import parse_job_description
from app.core.resume_parser import parse_resume
from app.core.skill_scorer import calculate_skill_score


def main():
    print("Starting skill scoring process...")

    # Step 1: Parse job description
    print("Step 1: Parsing job description...")
    jd_text = """
    ## Job Title: Mid-Level Python Developer
    **Experience:** 3+ Years
    
    ### Requirements
    * 3+ years of professional Python development experience
    * Strong proficiency in Django, FastAPI, or Flask
    * Experience with PostgreSQL/MySQL
    * Docker and Git
    
    ### Nice to Have
    * AWS or GCP experience
    * Kubernetes
    """

    jd = parse_job_description(jd_text)
    print(f"✓ Job description parsed.\n {jd.requirements.skills}")

    # Step 2: Parse resume
    print("Step 2: Loading resume content...")
    # resume = parse_resume("data/sp.pdf")
    # print(resume.markdown_content)

    with open("data/sp_md.txt") as f:
        resume_markdown_content = f.read()
    print(f"✓ Resume loaded.\n{resume_markdown_content}")

    # Step 3: Calculate skill score
    print("Step 3: Calculating skill scores...")
    result = calculate_skill_score(
        skill_requirements=jd.requirements.skills,
        resume_markdown=resume_markdown_content,
    )
    print("✓ Skill scoring completed")

    # Step 4: Review results
    print("\n" + "=" * 50)
    print("RESULTS")
    print("=" * 50)
    print(f"Final Score: {result.final_score}")
    print(f"Hire Signal: {result.hire_signal.value}")
    print(f"Summary: {result.summary}")
    print()

    # Detailed breakdown
    print("=== Skill Evaluations ===")
    pprint(result)


if __name__ == "__main__":
    main()
