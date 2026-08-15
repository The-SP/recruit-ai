"""Runs synchronously at invite creation, so the recruiter waits a few seconds
(precedent: parse_job_description inside POST /batch/submit).

Grounding priority is deliberate: JD and resume are primary, scorer output
secondary. A script built only from flagged weaknesses would give a skewed
read of a strong candidate and inherit any scorer mistake wholesale.
"""

from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.interview.constants import MAX_GAP_PROBES
from app.interview.prompting import json_block
from app.models.candidate import Candidate
from app.models.evaluation import CandidateEvaluation
from app.models.interview import InterviewMode
from app.models.job import Job
from app.schemas.interview import (
    InterviewQuestion,
    InterviewScript,
    QuestionFocus,
    TemplateSettings,
)
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
{fixed_questions_block}
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
  ({total_question_count} questions, answers {answer_medium}). Do not state a
  duration or any number of minutes -- the candidate already saw the length on
  the consent screen and watches a live timer, and this text is frozen into the
  script while the limit is not. Do not ask a question in the opening.
- `closing`: two sentences thanking the candidate and saying the team will
  review and follow up. Do not promise a decision or a timeline.

For each question set `subject` to the specific JD requirement or resume claim
being probed. It is read only by the recruiter and the assessor, never shown
to the candidate."""


ONE_MORE_QUESTION_PROMPT = """Write ONE more interview question for this
candidate and role, to be added to an interview that already exists.

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

## Already being asked — do not repeat or rephrase any of these

{existing_questions}

## What to produce

Exactly ONE question, in the `questions` list. It must cover new ground: a
different project, requirement, or competency than everything listed above.
Prefer EXPERIENCE_DEPTH or ROLE_COMPETENCY. Only use GAP_PROBE if the screen
flagged something material that no existing question touches.

Rules:
- Answerable out loud in 1-3 minutes. This is a conversation, not a take-home.
- No leetcode-style puzzles, no trivia, no riddles.
- Never ask about age, gender, race, religion, nationality, disability,
  marital or family status, pregnancy, or any other protected characteristic.
- Reference the candidate's actual claims specifically.
- Do not number the question in its text.
- Set `subject` to the specific JD requirement or resume claim being probed.

Return the existing opening and closing unchanged in `opening` and `closing`;
only the single new question is used."""


def _grounding_fields(grounding: dict[str, Any]) -> dict[str, str]:
    """The grounding snapshot as prompt substitutions, with its fallbacks.

    Shared by both prompts because build_grounding is the single producer of
    these keys: adding a field there should mean editing one unpacking site,
    not two that have to agree.
    """
    return {
        "job_title": grounding.get("job_title") or "Not specified",
        "company_name": grounding.get("company_name") or "Not specified",
        "job_summary": grounding.get("job_summary") or "Not provided",
        "requirements": json_block(grounding.get("requirements")),
        "resume_markdown": grounding.get("resume_markdown") or "Not available",
        "evaluation_summary": grounding.get("evaluation_summary") or "Not available",
        "critical_gaps": ", ".join(grounding.get("critical_gaps") or []) or "None",
        "weak_skills": ", ".join(grounding.get("weak_skills") or []) or "None",
    }


def generate_one_question(
    grounding: dict[str, Any], existing: list[InterviewQuestion]
) -> InterviewQuestion:
    """Write one additional question for a draft the recruiter is reviewing.

    Separate from generate_script because the job is different: the script call
    designs a balanced set against a target count, while this one fills a
    single slot in a set that already exists. Passing the current questions in
    is what stops it rewording one of them -- the model cannot avoid a
    duplicate it was never shown.

    Returns the question with a placeholder id; the caller renumbers, as
    every other path into question_script does.
    """
    existing_block = (
        "\n".join(f"- {q.text} (tests: {q.subject})" for q in existing)
        or "Nothing yet."
    )

    prompt = ONE_MORE_QUESTION_PROMPT.format(
        **_grounding_fields(grounding),
        existing_questions=existing_block,
    )

    script = _invoke(prompt)

    if not script.questions:
        raise ValueError("The model returned no question.")

    # Take the first and ignore any extras rather than rejecting: one usable
    # question is the whole request, and a retry would cost a second call to
    # fix a surplus the recruiter would never see.
    question = script.questions[0]

    if not question.text.strip():
        raise ValueError("The model returned an empty question.")

    return question


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


def _validate_script(script: InterviewScript, expected_count: int) -> str | None:
    """Return a reason string when the script is unusable, else None.

    `expected_count` is how many questions the *model* was asked for, not the
    interview's total: fixed questions are appended after validation, so
    counting them here would reject every template that has any. The tolerance
    stays env-driven because it describes how loosely the model follows an
    instruction, which is a property of the model, not of the template.
    """
    low = expected_count - Config.INTERVIEW_QUESTION_COUNT_TOLERANCE
    high = expected_count + Config.INTERVIEW_QUESTION_COUNT_TOLERANCE
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


def _fixed_questions_block(template: TemplateSettings) -> str:
    """The prompt section telling the model what is already being asked.

    Without it the model re-asks whatever the recruiter pinned, and the
    candidate pays for the duplicate twice: once in synthesis and transcription,
    once in an assessment that grades the same subject two ways.
    """
    if not template.fixed_questions:
        return ""

    lines = "\n".join(
        f"- {q.text}\n  (already covers: {q.subject})" for q in template.fixed_questions
    )
    return (
        "\nThe recruiter has already fixed these questions, which will be asked "
        "alongside yours:\n"
        f"{lines}\n"
        "Do not repeat them or probe the same subjects again. Your questions "
        "must cover different ground.\n"
    )


def _default_opening(template: TemplateSettings, mode: InterviewMode) -> str:
    """Greeting for a script with no generated questions.

    Only reached when fixed questions fill the interview, so there is no model
    call to write one. Mirrors what GENERATION_PROMPT asks for: names the
    shape, sets expectations, asks nothing.

    States no duration, for the same reason the prompt doesn't: this text is
    frozen into question_script, so a number here would outlive any change to
    the limit. The candidate gets the length from the consent screen and the
    live countdown, both served from server state.
    """
    medium = "spoken aloud" if mode is InterviewMode.AUDIO else "typed"
    return (
        f"Thanks for making the time. This is a short screening interview: "
        f"{template.question_count} question"
        f"{'s' if template.question_count != 1 else ''}, "
        f"and your answers are {medium}."
    )


DEFAULT_CLOSING = (
    "Thank you for taking the time to talk through your experience. "
    "The team will review your responses and follow up."
)


def generate_script(
    grounding: dict[str, Any], mode: InterviewMode, template: TemplateSettings
) -> InterviewScript:
    """Generate the interview backbone from a grounding snapshot.

    Regenerates once if the first attempt violates the count or gap-probe
    constraints, then raises.

    `mode` only reaches the opening greeting, which tells the candidate how to
    answer. The script is frozen at approval alongside the mode snapshot, so
    the greeting can never contradict the composer the candidate is looking at.

    `template` supplies the structural decisions a recruiter made once for the
    whole run. Its fixed questions count toward question_count and are appended
    after the generated ones, so a template that fills the interview skips the
    model entirely.
    """
    answer_medium = "spoken aloud" if mode is InterviewMode.AUDIO else "typed"
    generated_count = template.generated_count

    if generated_count == 0:
        # Fully hand-written interview. No LLM call, no cost, and nothing to
        # validate -- the recruiter wrote every question themselves.
        script = InterviewScript(
            opening=template.opening or _default_opening(template, mode),
            questions=[],
            closing=template.closing or DEFAULT_CLOSING,
        )
        logger.info("Skipped generation: fixed questions fill the interview")
    else:
        prompt = GENERATION_PROMPT.format(
            **_grounding_fields(grounding),
            answer_medium=answer_medium,
            question_count=generated_count,
            total_question_count=template.question_count,
            fixed_questions_block=_fixed_questions_block(template),
            max_gap_probes=MAX_GAP_PROBES,
        )

        script = _invoke(prompt)
        problem = _validate_script(script, generated_count)

        if problem:
            logger.warning(f"Regenerating interview script: {problem}")
            script = _invoke(
                f"{prompt}\n\nYour previous attempt was rejected because {problem}. "
                "Follow the constraints exactly this time."
            )
            problem = _validate_script(script, generated_count)
            if problem:
                raise ValueError(
                    f"Could not generate a valid interview script: {problem}"
                )

        # Recruiter copy wins over the model's, so the template's voice carries
        # even when the model was asked to write a greeting.
        if template.opening:
            script.opening = template.opening
        if template.closing:
            script.closing = template.closing

    # Fixed questions go last: the generated ones open on the candidate's own
    # experience, which is the gentler start.
    script.questions.extend(
        InterviewQuestion(id=0, text=q.text, focus=q.focus, subject=q.subject)
        for q in template.fixed_questions
    )

    # Renumber defensively so ids are always 0-based and contiguous; the
    # assessor and the engine both index questions by position.
    for index, question in enumerate(script.questions):
        question.id = index

    logger.info(f"Generated interview script with {len(script.questions)} questions")
    return script
