"""Assesses a finished interview: one structured LLM call over the whole
transcript, run from the assess_interview Celery task.

Reads nothing outside the interview row and its turns — the grounding and
question_script snapshots exist precisely so assessment sees the same data
question generation saw, even if the evaluation row was overwritten since.
"""

from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.interview.prompting import json_block
from app.models.interview import (
    Interview,
    InterviewMode,
    InterviewTurn,
    TurnRole,
)
from app.schemas.interview import (
    AnswerQuality,
    InterviewAssessment,
    InterviewScript,
    QuestionAssessment,
    ResumeConsistency,
)

logger = init_logger(__name__)

SYSTEM_PROMPT = (
    "You are an experienced technical interviewer reviewing a completed "
    "screening interview. You judge answers fairly, quote evidence, and "
    "return structured JSON."
)

ASSESSMENT_PROMPT = """Assess this screening interview: how does the candidate \
measure against the role, given the transcript below?

## The role

Title: {job_title}
Company: {company_name}

Summary:
{job_summary}

Structured requirements:
{requirements}

## The candidate's resume

{resume_markdown}

## The interview script

Each question was designed to probe a specific subject:
{questions}

## The transcript
{transcription_note}
{transcript}

## What to produce

For each core question in the script, one per_question entry:
- `question_id`: the question's id from the script.
- `answer_quality`: strong / adequate / weak, or not_answered when the
  candidate evaded it, refused, or never reached it (the interview may have
  ended early — judge only what was actually said).
- `resume_consistency`: whether the answer supports the resume claim named in
  the question's subject. Use not_applicable when the question does not probe
  a resume claim or was not answered.
- `evidence`: a short verbatim quote from the candidate's answer that best
  supports your judgment. Empty string when there is no answer.
- `notes`: one or two sentences of reasoning a recruiter can act on.
- Weigh follow-up answers together with the original answer for that question.

Overall:
- `competency_summary`: how the candidate measures against the role's core
  requirements, based only on the transcript.
- `strengths` / `concerns`: concrete, transcript-grounded bullets.
- `gap_findings`: only if the script contained GAP_PROBE questions — what the
  probes showed. Omit otherwise.
- `overall_summary`: two or three sentences a recruiter reads first.
- `recommendation`: advance / borderline / do_not_advance. This is a screening
  signal, not a hiring decision; do_not_advance requires concrete evidence,
  and a partial transcript alone should push toward borderline rather than
  do_not_advance.

Judge only what is in the transcript. Do not reward confident wording over
substance, and never penalize or reward anything related to a protected
characteristic."""

# Injected only for audio-mode interviews. The transcriber's verbatim prompt
# preserves disfluency on purpose, so without this the assessor would
# systematically mark spoken answers down against typed ones.
TRANSCRIPTION_NOTE = """
Candidate answers in this transcript were transcribed verbatim from speech.
Filler words, false starts, and transcription artifacts are normal — judge the
substance of the answers, not spoken-language disfluency, and do not treat odd
word choices that resemble mis-transcriptions as claims.
"""


def _render_questions(script: InterviewScript) -> str:
    lines = []
    for q in script.questions:
        lines.append(
            f"- id {q.id} [{q.focus.value}] subject: {q.subject}\n  asked: {q.text}"
        )
    return "\n".join(lines)


def _render_transcript(turns: list[InterviewTurn]) -> str:
    """Render turns as a readable interview log, tagging each with its
    question index so the model can group answers (and follow-ups) per
    question."""
    lines = []
    for turn in turns:
        speaker = (
            "Interviewer" if turn.role == TurnRole.INTERVIEWER.value else "Candidate"
        )
        marker = (
            f" (question {turn.question_index})"
            if turn.question_index is not None
            else ""
        )
        lines.append(f"[{turn.seq}] {speaker} ({turn.kind}){marker}: {turn.content}")
    return "\n".join(lines)


def _repair_per_question(
    assessment: InterviewAssessment, script: InterviewScript
) -> InterviewAssessment:
    """Force per_question into one entry per script question, in script order.

    The model's judgment fields are kept where it produced an entry; ids,
    focus, and subject are always taken from the script (it is authoritative),
    and questions the model skipped get a not_answered entry rather than
    failing the whole assessment.
    """
    by_id = {entry.question_id: entry for entry in assessment.per_question}

    repaired: list[QuestionAssessment] = []
    for question in script.questions:
        entry = by_id.get(question.id)
        if entry is None:
            logger.warning(
                f"Assessor omitted question {question.id}; recording not_answered"
            )
            entry = QuestionAssessment(
                question_id=question.id,
                focus=question.focus,
                subject=question.subject,
                answer_quality=AnswerQuality.NOT_ANSWERED,
                resume_consistency=ResumeConsistency.NOT_APPLICABLE,
                evidence="",
                notes="The assessor produced no entry for this question.",
            )
        else:
            entry.question_id = question.id
            entry.focus = question.focus
            entry.subject = question.subject
        repaired.append(entry)

    assessment.per_question = repaired
    return assessment


def _invoke(prompt: str) -> InterviewAssessment:
    """One structured LLM call, same shape as the scorers use.

    Deliberately does NOT consult the circuit breaker: that exists to stop a
    runaway batch from burning the shared scoring quota, while interview calls
    are singular, background, and use their own key.
    """
    agent = create_agent(
        model=build_model(
            Config.INTERVIEW_MODEL_NAME, Config.INTERVIEW_GOOGLE_API_KEY or None
        ),
        system_prompt=SYSTEM_PROMPT,
        response_format=ToolStrategy(InterviewAssessment),
    )
    messages: list[Any] = [{"role": "user", "content": prompt}]
    result = agent.invoke({"messages": messages})
    assessment: InterviewAssessment = result["structured_response"]
    return assessment


def assess_transcript(
    interview: Interview, turns: list[InterviewTurn]
) -> InterviewAssessment:
    """Assess the full transcript against the interview's own snapshots."""
    script = InterviewScript.model_validate(interview.question_script)
    grounding = interview.grounding

    prompt = ASSESSMENT_PROMPT.format(
        job_title=grounding.get("job_title") or "Not specified",
        company_name=grounding.get("company_name") or "Not specified",
        job_summary=grounding.get("job_summary") or "Not provided",
        requirements=json_block(grounding.get("requirements")),
        resume_markdown=grounding.get("resume_markdown") or "Not available",
        questions=_render_questions(script),
        transcription_note=(
            TRANSCRIPTION_NOTE
            if interview.answer_mode == InterviewMode.AUDIO.value
            else ""
        ),
        transcript=_render_transcript(turns) or "No turns recorded.",
    )

    assessment = _invoke(prompt)
    assessment = _repair_per_question(assessment, script)

    logger.info(
        f"Assessed interview {interview.id}: recommendation={assessment.recommendation}"
    )
    return assessment
