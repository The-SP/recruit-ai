"""Runs synchronously at invite creation, so the recruiter waits a few seconds
(precedent: parse_job_description inside POST /batch/submit).

Grounding priority is deliberate: JD and resume are primary, scorer output
secondary. A script built only from flagged weaknesses would give a skewed
read of a strong candidate and inherit any scorer mistake wholesale.
"""

import json
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.interview.constants import (
    INTERVIEW_TIME_LIMIT_SECONDS,
    MAX_GAP_PROBES,
    QUESTION_COUNT,
    QUESTION_COUNT_TOLERANCE,
)
from app.models.candidate import Candidate
from app.models.evaluation import CandidateEvaluation
from app.models.job import Job
from app.schemas.interview import InterviewScript, QuestionFocus
from app.schemas.job_utils import build_job_requirements_schema
from app.schemas.skill_evaluation import MatchType, SkillScoreResult

logger = init_logger(__name__)

SYSTEM_PROMPT = (
    "You are an experienced technical interviewer. You design short, fair "
    "screening interviews and return structured JSON."
)

GENERATION_PROMPT = """Design a screening interview for this candidate and role.

## The role

Title: {job_title}
Company: {company_name}

Summary:
{job_summary}

Structured requirements:
{requirements}

## The candidate's resume

{resume_markdown}

## Automated resume screen (secondary — use sparingly)

Summary: {evaluation_summary}
Critical gaps: {critical_gaps}
Weak or missing skills: {weak_skills}

## What to produce

Exactly {question_count} core questions, in this mix:
- Mostly EXPERIENCE_DEPTH questions: pick the projects or roles on the resume
  most relevant to this job and dig into them. Ask about decisions the
  candidate personally made, trade-offs, and what went wrong. These verify the
  resume describes real work and reveal seniority.
- Some ROLE_COMPETENCY questions: grounded in the job's key requirements and
  responsibilities. Scenario-flavored is good.
- At most {max_gap_probes} GAP_PROBE questions, and only where the screen
  flagged something genuinely material to this role. If the candidate has no
  meaningful gaps, ask none — do not invent a weakness to probe.

Rules for every question:
- Answerable out loud in 1-3 minutes. This is a conversation, not a take-home.
- No leetcode-style puzzles, no trivia, no riddles.
- Never ask about age, gender, race, religion, nationality, disability,
  marital or family status, pregnancy, or any other protected characteristic.
- Reference the candidate's actual claims specifically. "Tell me about your
  experience with X" is weak; naming their project and asking about a concrete
  decision inside it is strong.
- Do not number the questions in their text, and do not restate the job title
  in every question.

Also write:
- `opening`: a two-sentence greeting that names the role and sets expectations
  ({question_count} questions, roughly {time_limit_minutes} minutes, answers
  typed). Do not ask a question in the opening.
- `closing`: two sentences thanking the candidate and saying the team will
  review and follow up. Do not promise a decision or a timeline.

For each question set `subject` to the specific JD requirement or resume claim
being probed, and `good_answer_covers` to 2-4 concrete things a strong answer
would mention. Both are read only by the recruiter and the assessor, never
shown to the candidate."""


def _json_block(value: Any) -> str:
    if value is None:
        return "Not provided"
    return json.dumps(value, indent=2, default=str)


def _extract_scorer_signals(
    evaluation: CandidateEvaluation,
) -> tuple[list[str], list[str]]:
    """Pull critical gaps and weak skills out of the scorer's JSONB result.

    Returns ([], []) when the result is missing or unparseable — the interview
    is JD- and resume-grounded, so a missing screen degrades the script's gap
    probes but never blocks invite creation.
    """
    if not evaluation.skill_result:
        return [], []

    try:
        skill_result = SkillScoreResult.model_validate(evaluation.skill_result)
    except Exception as e:
        logger.warning(
            f"Could not parse skill_result for evaluation {evaluation.id}: {e}"
        )
        return [], []

    weak_skills = [
        " / ".join(item.skill_options)
        for item in skill_result.llm_response.evaluations
        if item.match_type in (MatchType.PARTIAL, MatchType.NONE)
    ]
    return skill_result.critical_gaps, weak_skills


def build_grounding(
    job: Job, candidate: Candidate, evaluation: CandidateEvaluation
) -> dict[str, Any]:
    """Snapshot everything generation and assessment need.

    Snapshotting is load-bearing: candidate_evaluations rows are overwritten in
    place on re-evaluation, so reading skill_result at assessment time could
    see different data than question generation saw. Storing the JD content and
    resume here too makes the interview row fully self-contained.
    """
    critical_gaps, weak_skills = _extract_scorer_signals(evaluation)

    return {
        "job_title": job.title,
        "company_name": job.company_name,
        "job_summary": job.summary,
        "requirements": build_job_requirements_schema(job.requirements).model_dump(
            mode="json"
        ),
        "resume_markdown": candidate.resume_markdown,
        "candidate_name": candidate.name,
        "evaluation_summary": evaluation.summary,
        "critical_gaps": critical_gaps,
        "weak_skills": weak_skills,
    }


def _validate_script(script: InterviewScript) -> str | None:
    """Return a reason string when the script is unusable, else None."""
    low = QUESTION_COUNT - QUESTION_COUNT_TOLERANCE
    high = QUESTION_COUNT + QUESTION_COUNT_TOLERANCE
    count = len(script.questions)
    if not low <= count <= high:
        return f"expected {low}-{high} questions, got {count}"

    gap_probes = sum(1 for q in script.questions if q.focus == QuestionFocus.GAP_PROBE)
    if gap_probes > MAX_GAP_PROBES:
        return f"expected at most {MAX_GAP_PROBES} gap probes, got {gap_probes}"

    if not script.opening.strip() or not script.closing.strip():
        return "opening or closing is empty"

    return None


def _invoke(prompt: str) -> InterviewScript:
    """One structured LLM call, same shape as the scorers use.

    Deliberately does NOT consult the circuit breaker: that exists to stop a
    runaway batch from burning the shared scoring quota, while interview calls
    are singular, interactive, and use their own key.
    """
    agent = create_agent(
        model=build_model(
            Config.INTERVIEW_MODEL_NAME, Config.INTERVIEW_GOOGLE_API_KEY or None
        ),
        system_prompt=SYSTEM_PROMPT,
        response_format=ToolStrategy(InterviewScript),
    )
    messages: list[Any] = [{"role": "user", "content": prompt}]
    result = agent.invoke({"messages": messages})
    script: InterviewScript = result["structured_response"]
    return script


def generate_script(grounding: dict[str, Any]) -> InterviewScript:
    """Generate the interview backbone from a grounding snapshot.

    Regenerates once if the first attempt violates the count or gap-probe
    constraints, then raises.
    """
    prompt = GENERATION_PROMPT.format(
        job_title=grounding.get("job_title") or "Not specified",
        company_name=grounding.get("company_name") or "Not specified",
        job_summary=grounding.get("job_summary") or "Not provided",
        requirements=_json_block(grounding.get("requirements")),
        resume_markdown=grounding.get("resume_markdown") or "Not available",
        evaluation_summary=grounding.get("evaluation_summary") or "Not available",
        critical_gaps=", ".join(grounding.get("critical_gaps") or []) or "None",
        weak_skills=", ".join(grounding.get("weak_skills") or []) or "None",
        question_count=QUESTION_COUNT,
        max_gap_probes=MAX_GAP_PROBES,
        time_limit_minutes=INTERVIEW_TIME_LIMIT_SECONDS // 60,
    )

    script = _invoke(prompt)
    problem = _validate_script(script)

    if problem:
        logger.warning(f"Regenerating interview script: {problem}")
        script = _invoke(
            f"{prompt}\n\nYour previous attempt was rejected because {problem}. "
            "Follow the constraints exactly this time."
        )
        problem = _validate_script(script)
        if problem:
            raise ValueError(f"Could not generate a valid interview script: {problem}")

    # Renumber defensively so ids are always 0-based and contiguous; the
    # assessor and the engine both index questions by position.
    for index, question in enumerate(script.questions):
        question.id = index

    logger.info(f"Generated interview script with {len(script.questions)} questions")
    return script
