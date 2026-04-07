"""Standalone script to test the education scorer in isolation (no DB required)."""

import argparse
import json
import sys
from pathlib import Path

from app.core.job_description_parser import parse_job_description
from app.core.resume_parser import parse_resume
from app.evaluation.education_scorer import calculate_education_score
from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.job_description import EducationRequirement

# =============================================================================
# CONFIGURATION — edit these to switch input modes
# =============================================================================

# --- Resume input (pick one; RESUME_MD_PATH takes priority) ---
RESUME_MD_PATH: str | None = (
    "data/parsed_resumes/sp.txt"  # Read markdown .txt directly (no LLM call)
)
RESUME_PDF_PATH: str | None = None  # Parse PDF (triggers LLM call)

# --- Education requirements input (pick one; priority: HARDCODED > JD_JSON > JD_TEXT) ---
HARDCODED_EDUCATION: EducationRequirement | None = (
    None  # Inline object — highest priority
)
# Example:
# HARDCODED_EDUCATION = EducationRequirement(
#     min_degree="bachelors",
#     preferred_fields=["Computer Science", "Engineering"],
#     required=True,
# )

JD_JSON_PATH: str | None = (
    "data/parsed_jobs/job2_parsed.json"  # Pre-parsed JSON (no LLM call)
)
JD_TEXT_PATH: str | None = None  # Raw JD text (triggers LLM call)

# =============================================================================
# Loaders
# =============================================================================


def load_resume_markdown(md_path: str | None, pdf_path: str | None) -> str:
    if md_path:
        print(f"  Reading resume markdown from: {md_path}")
        with open(md_path, encoding="utf-8") as f:
            return f.read()
    if pdf_path:
        print(f"  Parsing resume PDF: {pdf_path}")
        result = parse_resume(pdf_path)
        if not result.is_resume or not result.markdown_content:
            raise ValueError(
                f"File is not a valid resume or has no content: {pdf_path}"
            )
        return result.markdown_content
    raise ValueError(
        "No resume input configured. Set RESUME_MD_PATH or RESUME_PDF_PATH."
    )


def load_education_requirement(
    hardcoded: EducationRequirement | None,
    json_path: str | None,
    txt_path: str | None,
) -> EducationRequirement:
    if hardcoded is not None:
        print("  Using hardcoded EducationRequirement")
        return hardcoded

    if json_path:
        print(f"  Loading education requirements from JSON: {json_path}")
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        edu = data.get("requirements", {}).get("education")
        if not edu:
            print(
                f"  Skipped: No 'requirements.education' found in {json_path} — composite_scorer would not evaluate education for this JD."
            )
            sys.exit(0)
        requirement = EducationRequirement(**edu)
        # Simulate composite_scorer behaviour: education is skipped when min_degree is null
        if not requirement.min_degree:
            print(
                f"  Skipped: 'min_degree' is null in {json_path} — composite_scorer would not "
                "evaluate education for this JD. Use a JD with min_degree set, or use "
                "HARDCODED_EDUCATION to test directly."
            )
            sys.exit(0)
        return requirement

    if txt_path:
        print(f"  Parsing JD text file: {txt_path}")
        with open(txt_path, encoding="utf-8") as f:
            text = f.read()
        jd = parse_job_description(text)
        if not jd.is_job_description:
            raise ValueError(
                f"File does not appear to be a job description: {txt_path}"
            )
        if not jd.requirements or not jd.requirements.education:
            print(
                f"  Skipped: No education requirements found in parsed JD: {txt_path} — composite_scorer would not evaluate education for this JD."
            )
            sys.exit(0)
        requirement = jd.requirements.education
        if not requirement.min_degree:
            print(
                "  Skipped: 'min_degree' is null in parsed JD — composite_scorer would not "
                "evaluate education for this JD."
            )
            sys.exit(0)
        return requirement

    raise ValueError(
        "No education requirements input configured. "
        "Set HARDCODED_EDUCATION, JD_JSON_PATH, or JD_TEXT_PATH."
    )


# =============================================================================
# Printer
# =============================================================================


def print_education_results(result: EducationScoreResult) -> None:
    sep = "=" * 52

    print(f"\n{sep}")
    print("EDUCATION SCORE RESULTS")
    print(sep)
    print(f"Score           : {result.score}")
    print(f"Candidate Degree: {result.candidate_degree or '(not found)'}")
    print(f"Field of Study  : {result.field_of_study or '(not found)'}")
    print(f"Summary         : {result.summary}")
    print(f"\n{sep}\n")


# =============================================================================
# Result Saver
# =============================================================================


def save_result(
    result: EducationScoreResult, resume_path: str | None, jd_path: str | None
) -> None:
    results_dir = Path("data/education_results")
    if not results_dir.exists():
        print(f"  Skipping save: {results_dir} does not exist")
        return

    resume_stem = Path(resume_path).stem if resume_path else "resume"
    jd_stem = Path(jd_path).stem.replace("_parsed", "") if jd_path else "job"
    filename = f"{resume_stem}_{jd_stem}.json"
    output_path = results_dir / filename

    output_path.write_text(result.model_dump_json(indent=2), encoding="utf-8")
    print(f"  Result saved to: {output_path}")


# =============================================================================
# CLI
# =============================================================================


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Test the education scorer in isolation (no DB required)"
    )
    parser.add_argument("--resume-md", help="Path to resume markdown .txt file")
    parser.add_argument("--resume-pdf", help="Path to resume PDF file")
    parser.add_argument("--jd-json", help="Path to pre-parsed JD JSON file")
    parser.add_argument("--jd-txt", help="Path to raw JD text file to parse")
    return parser.parse_args()


# =============================================================================
# Main
# =============================================================================


def main() -> None:
    args = parse_args()

    resume_md = args.resume_md or RESUME_MD_PATH
    resume_pdf = args.resume_pdf or RESUME_PDF_PATH
    jd_json = args.jd_json or JD_JSON_PATH
    jd_txt = args.jd_txt or JD_TEXT_PATH

    print("Loading resume...")
    resume_markdown = load_resume_markdown(resume_md, resume_pdf)
    print(f"  Loaded ({len(resume_markdown)} chars)")

    print("Loading education requirements...")
    education_requirement = load_education_requirement(
        HARDCODED_EDUCATION, jd_json, jd_txt
    )
    print(f"  Min degree      : {education_requirement.min_degree}")
    print(
        f"  Preferred fields: {', '.join(education_requirement.preferred_fields) if education_requirement.preferred_fields else 'Not specified'}"
    )
    print(f"  Required        : {education_requirement.required}")

    print("\nRunning education scorer...")
    result = calculate_education_score(education_requirement, resume_markdown)

    print_education_results(result)

    save_result(result, resume_md or resume_pdf, jd_json or jd_txt)


if __name__ == "__main__":
    main()
