"""Pure derivations over an Interview row: progress and time remaining.

Split out of engine.py so the HTTP schema layer can render interview state
without importing the engine (and with it LangChain, the prompts, and the
model factory). Nothing here does I/O or touches the turn loop.
"""

from datetime import datetime

from app.interview.constants import INTERVIEW_TIME_LIMIT_SECONDS
from app.models.interview import Interview, InterviewStatus


def time_remaining_seconds(interview: Interview) -> int | None:
    if interview.status == InterviewStatus.CREATED.value:
        return INTERVIEW_TIME_LIMIT_SECONDS
    if (
        interview.status == InterviewStatus.IN_PROGRESS.value
        and interview.started_at is not None
    ):
        elapsed = (datetime.now() - interview.started_at).total_seconds()
        return max(0, INTERVIEW_TIME_LIMIT_SECONDS - int(elapsed))
    return None


def question_number(interview: Interview) -> int:
    """1-based position of the question currently on the table; 0 before start."""
    if interview.status == InterviewStatus.CREATED.value:
        return 0
    return interview.current_question_index + 1


def total_questions(interview: Interview) -> int:
    questions = interview.question_script.get("questions", [])
    return len(questions) if isinstance(questions, list) else 0
