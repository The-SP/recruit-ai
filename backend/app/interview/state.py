"""Pure derivations over an Interview row: progress and time remaining.

Split out of engine.py so the HTTP schema layer can render interview state
without importing the engine (and with it LangChain, the prompts, and the
model factory). Nothing here does I/O or touches the turn loop.
"""

from datetime import datetime

from app.models.interview import Interview, InterviewStatus


def time_remaining_seconds(interview: Interview) -> int | None:
    """Seconds left, from the interview's own snapshotted limit.

    Reads interview.time_limit_seconds rather than the module constant so a
    template's choice actually reaches the countdown -- and so an interview
    already in flight keeps the limit it was approved under even if the
    template changes underneath it.
    """
    limit = interview.time_limit_seconds
    if interview.status == InterviewStatus.CREATED.value:
        return limit
    if (
        interview.status == InterviewStatus.IN_PROGRESS.value
        and interview.started_at is not None
    ):
        elapsed = (datetime.now() - interview.started_at).total_seconds()
        return max(0, limit - int(elapsed))
    return None


def question_number(interview: Interview) -> int:
    """1-based position of the question currently on the table; 0 before start."""
    if interview.status == InterviewStatus.CREATED.value:
        return 0
    return interview.current_question_index + 1


def total_questions(interview: Interview) -> int:
    questions = interview.question_script.get("questions", [])
    return len(questions) if isinstance(questions, list) else 0
