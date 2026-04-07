"""Standalone script to test the experience scorer in isolation (no DB required)."""

import argparse
import json
import sys
from pathlib import Path

from app.core.job_description_parser import parse_job_description
from app.core.resume_parser import parse_resume
from app.evaluation.experience_scorer import calculate_experience_score
from app.schemas.experience_evaluation import ExperienceScoreResult
from app.schemas.job_description import ExperienceRequirement

# =============================================================================
# CONFIGURATION — edit these to switch input modes
# =============================================================================

# --- Resume input (pick one; RESUME_MD_PATH takes priority) ---
RESUME_MD_PATH: str | None = (
    "data/parsed_resumes/tika.txt"  # Read markdown .txt directly (no LLM call)
)
RESUME_PDF_PATH: str | None = None  # Parse PDF (triggers LLM call)

# --- Experience requirements input (pick one; priority: HARDCODED > JD_JSON > JD_TEXT) ---
HARDCODED_EXPERIENCE: ExperienceRequirement | None = ExperienceRequirement(
    min_years=3,
    max_years=None,
    level="Mid",
    key_skills=["Python", "FastAPI", "PostgreSQL"],
    key_responsibilities=[
        "Design and build scalable REST APIs",
        "Write and maintain unit and integration tests",
        "Review and improve database query performance",
    ],
)

JD_JSON_PATH: str | None = None  # Pre-parsed JSON (no LLM call)
JD_TEXT_PATH: str | None = None  # Raw JD text (triggers LLM call)

# Job title shown to the LLM for context (used when HARDCODED_EXPERIENCE is set)
HARDCODED_JOB_TITLE: str | None = "Backend Engineer"

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


def load_experience_requirement(
    hardcoded: ExperienceRequirement | None,
    json_path: str | None,
    txt_path: str | None,
) -> tuple[ExperienceRequirement, str | None]:
    """Returns (requirement, job_title)."""
    if hardcoded is not None:
        print("  Using hardcoded ExperienceRequirement")
        return hardcoded, HARDCODED_JOB_TITLE

    if json_path:
        print(f"  Loading experience requirements from JSON: {json_path}")
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        exp = data.get("requirements", {}).get("experience")
        if not exp:
            print(
                f"  Skipped: No 'requirements.experience' found in {json_path} — "
                "composite_scorer would not evaluate experience for this JD."
            )
            sys.exit(0)
        requirement = ExperienceRequirement(**exp)
        if requirement.min_years is None:
            print(
                f"  Skipped: 'min_years' is null in {json_path} — composite_scorer would not "
                "evaluate experience for this JD. Use a JD with min_years set, or use "
                "HARDCODED_EXPERIENCE to test directly."
            )
            sys.exit(0)
        job_title = data.get("job_title")
        return requirement, job_title

    if txt_path:
        print(f"  Parsing JD text file: {txt_path}")
        with open(txt_path, encoding="utf-8") as f:
            text = f.read()
        jd = parse_job_description(text)
        if not jd.is_job_description:
            raise ValueError(
                f"File does not appear to be a job description: {txt_path}"
            )
        if not jd.requirements or not jd.requirements.experience:
            print(
                f"  Skipped: No experience requirements found in parsed JD: {txt_path} — "
                "composite_scorer would not evaluate experience for this JD."
            )
            sys.exit(0)
        requirement = jd.requirements.experience
        if requirement.min_years is None:
            print(
                "  Skipped: 'min_years' is null in parsed JD — composite_scorer would not "
                "evaluate experience for this JD."
            )
            sys.exit(0)
        return requirement, jd.job_title

    raise ValueError(
        "No experience requirements input configured. "
        "Set HARDCODED_EXPERIENCE, JD_JSON_PATH, or JD_TEXT_PATH."
    )


# =============================================================================
# Printer
# =============================================================================


def print_experience_results(result: ExperienceScoreResult) -> None:
    sep = "=" * 52
    div = "-" * 52

    print(f"\n{sep}")
    print("EXPERIENCE SCORE RESULTS")
    print(sep)
    print(f"Score           : {result.experience_score}")
    print(f"Effective Years : {result.effective_years}")
    print(f"Required Years  : {result.required_years}")
    print(f"Summary         : {result.summary}")

    print(f"\n{div}")
    print("Per-Role Evaluations")
    print(div)

    evaluations = result.llm_response.evaluations
    if not evaluations:
        print("  (none)")
    else:
        for evaluation in evaluations:
            end_label = evaluation.end_date or "present"
            print(
                f"\n  {evaluation.job_title}"
                + (f" @ {evaluation.company}" if evaluation.company else "")
            )
            print(
                f"  {evaluation.start_date} – {end_label}  ({evaluation.duration_months} months)"
            )
            print(f"  Relevance : {evaluation.relevance.value.upper()}")
            print(f"  Evidence  : {evaluation.evidence}")

    if result.llm_response.notes:
        print(f"\n{div}")
        print(f"Notes: {result.llm_response.notes}")

    print(f"\n{sep}\n")


# =============================================================================
# Result Saver
# =============================================================================


def save_result(
    result: ExperienceScoreResult, resume_path: str | None, jd_path: str | None
) -> None:
    results_dir = Path("data/experience_results")
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
        description="Test the experience scorer in isolation (no DB required)"
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

    print("Loading experience requirements...")
    experience_requirement, job_title = load_experience_requirement(
        HARDCODED_EXPERIENCE, jd_json, jd_txt
    )
    print(f"  Job title       : {job_title or 'Not specified'}")
    print(f"  Min years       : {experience_requirement.min_years}")
    print(f"  Level           : {experience_requirement.level or 'Not specified'}")
    print(
        f"  Key skills      : {', '.join(experience_requirement.key_skills or []) or 'Not specified'}"
    )

    print("\nRunning experience scorer...")
    result = calculate_experience_score(
        experience_requirement, resume_markdown, job_title
    )

    print_experience_results(result)

    save_result(result, resume_md or resume_pdf, jd_json or jd_txt)


if __name__ == "__main__":
    main()
