"""Standalone script to test the skill scorer in isolation (no DB required)."""

import argparse
import json
from pathlib import Path

from app.core.job_description_parser import parse_job_description
from app.core.resume_parser import parse_resume
from app.evaluation.skill_scorer import calculate_skill_score
from app.schemas.job_description import SkillGroup, SkillRequirements
from app.schemas.skill_evaluation import SkillScoreResult

# =============================================================================
# CONFIGURATION — edit these to switch input modes
# =============================================================================

# --- Resume input (pick one; RESUME_MD_PATH takes priority) ---
RESUME_MD_PATH: str | None = (
    "data/parsed_resumes/sp.txt"  # Read markdown .txt directly (no LLM call)
)
RESUME_PDF_PATH: str | None = None  # Parse PDF (triggers LLM call)

# --- Skill requirements input (pick one; priority: HARDCODED > JD_JSON > JD_TEXT) ---
HARDCODED_SKILLS: SkillRequirements | None = None  # Inline object — highest priority
# Example:
# HARDCODED_SKILLS = SkillRequirements(
#     critical=[SkillGroup(options=["Python"], min_years=3)],
#     required=[SkillGroup(options=["FastAPI", "Django"], min_proficiency="advanced")],
#     preferred=[SkillGroup(options=["Docker"])],
# )

JD_JSON_PATH: str | None = (
    "data/parsed_jobs/job1_parsed.json"  # Pre-parsed JSON (no LLM call)
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


def load_skill_requirements(
    hardcoded: SkillRequirements | None,
    json_path: str | None,
    txt_path: str | None,
) -> SkillRequirements:
    if hardcoded is not None:
        print("  Using hardcoded SkillRequirements")
        return hardcoded

    if json_path:
        print(f"  Loading skill requirements from JSON: {json_path}")
        with open(json_path, encoding="utf-8") as f:
            data = json.load(f)
        skills = data.get("requirements", {}).get("skills")
        if not skills:
            raise ValueError(f"No 'requirements.skills' found in {json_path}")
        return SkillRequirements(
            critical=[SkillGroup(**g) for g in skills.get("critical", [])],
            required=[SkillGroup(**g) for g in skills.get("required", [])],
            preferred=[SkillGroup(**g) for g in skills.get("preferred", [])],
        )

    if txt_path:
        print(f"  Parsing JD text file: {txt_path}")
        with open(txt_path, encoding="utf-8") as f:
            text = f.read()
        jd = parse_job_description(text)
        if not jd.is_job_description:
            raise ValueError(
                f"File does not appear to be a job description: {txt_path}"
            )
        if not jd.requirements or not jd.requirements.skills:
            raise ValueError(f"No skill requirements found in parsed JD: {txt_path}")
        return jd.requirements.skills

    raise ValueError(
        "No skill requirements input configured. "
        "Set HARDCODED_SKILLS, JD_JSON_PATH, or JD_TEXT_PATH."
    )


# =============================================================================
# Printer
# =============================================================================


def print_skill_results_detailed(
    result: SkillScoreResult,
    skill_requirements: SkillRequirements,
) -> None:
    sep = "=" * 52
    div = "-" * 52

    print(f"\n{sep}")
    print("SKILL SCORE RESULTS")
    print(sep)
    print(f"Final Score     : {result.final_score}")
    print(f"Summary         : {result.summary}")
    print(f"Critical Penalty: {result.critical_penalty}")

    print("\n--- Component Scores ---")
    print(f"  Critical : {result.critical_score}")
    print(f"  Required : {result.required_score}")
    print(f"  Preferred: {result.preferred_score}")

    print("\n--- Critical Gaps ---")
    if result.critical_gaps:
        for gap in result.critical_gaps:
            print(f"  - {gap}")
    else:
        print("  (none)")

    print("\n--- Per-Skill Evaluations ---")

    tier_groups: dict[str, list[SkillGroup]] = {
        "critical": list(skill_requirements.critical or []),
        "required": list(skill_requirements.required or []),
        "preferred": list(skill_requirements.preferred or []),
    }

    for tier_name in ("critical", "required", "preferred"):
        evals = [e for e in result.llm_response.evaluations if e.tier == tier_name]
        if not evals:
            continue

        print(f"\n  {tier_name.upper()}")
        print(f"  {div[: len(tier_name) + 2]}")

        original_groups = tier_groups[tier_name]

        for i, evaluation in enumerate(evals):
            # Build skill label
            options_str = " / ".join(evaluation.skill_options)
            constraints = []
            if i < len(original_groups):
                grp = original_groups[i]
                if grp.min_years:
                    constraints.append(f"{grp.min_years}+ yrs")
                if grp.min_proficiency:
                    constraints.append(grp.min_proficiency)
            constraint_str = f"  ({', '.join(constraints)})" if constraints else ""

            print(
                f"\n  [{i + 1}] {options_str}{constraint_str}  ->  {evaluation.match_type.value.upper()}"
            )
            if (
                evaluation.matched_by
                and evaluation.matched_by not in evaluation.skill_options
            ):
                print(f"      Matched by : {evaluation.matched_by}")
            print(f"      Evidence   : {evaluation.evidence}")
            print(f"      Reasoning  : {evaluation.reasoning}")

    if result.llm_response.strengths:
        print("\n--- Strengths ---")
        for s in result.llm_response.strengths:
            print(f"  - {s}")

    print(f"\n{sep}\n")


# =============================================================================
# Result Saver
# =============================================================================


def save_result(
    result: SkillScoreResult, resume_path: str | None, jd_path: str | None
) -> None:
    results_dir = Path("data/skill_results")
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
        description="Test the skill scorer in isolation (no DB required)"
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

    print("Loading skill requirements...")
    skill_requirements = load_skill_requirements(HARDCODED_SKILLS, jd_json, jd_txt)
    print(
        f"  Skills: {len(skill_requirements.critical)} critical, "
        f"{len(skill_requirements.required)} required, "
        f"{len(skill_requirements.preferred)} preferred"
    )

    print("\nRunning skill scorer...")
    result = calculate_skill_score(skill_requirements, resume_markdown)

    print_skill_results_detailed(result, skill_requirements)

    save_result(result, resume_md or resume_pdf, jd_json or jd_txt)


if __name__ == "__main__":
    main()
