from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.config import Config
from app.interview import state
from app.interview.constants import (
    ALLOWED_TIME_LIMIT_SECONDS,
    INTERVIEW_TIME_LIMIT_SECONDS,
    MAX_QUESTIONS_PER_INTERVIEW,
    MIN_QUESTIONS_PER_INTERVIEW,
)
from app.interview.speaker import voice_key_for_turn
from app.models.interview import Interview, InterviewTurn
from app.models.interview_template import InterviewTemplate
from app.schemas.interview import (
    InterviewQuestion,
    InterviewScript,
    QuestionFocus,
    TemplateSettings,
)


def build_invite_url(access_token: str | None) -> str | None:
    """Candidate-facing link, same URL-building pattern as email_service.

    None for an unapproved draft, which has no token. Returning None rather
    than a broken URL is what stops the review UI from ever showing a link
    that would 404 -- the absence is the signal.
    """
    if access_token is None:
        return None
    return f"{Config.FRONTEND_URL}/interview?token={access_token}"


class TurnOut(BaseModel):
    """One transcript turn, safe for both candidate and recruiter surfaces."""

    seq: int
    role: str
    kind: str
    question_index: int | None = None
    content: str
    created_at: datetime
    # Whether a recording is attached. A flag, never the storage key: the path
    # must not cross the API, and this model also feeds the candidate's SSE
    # `turn` frames. Recruiters fetch the bytes from the JWT-gated endpoint.
    has_audio: bool = False
    # Which synthesized clip speaks this turn, for the candidate's player. A
    # slot name, not a storage path -- and useless without the invite token,
    # which is what makes it safe on a model the recruiter surface shares.
    # None on candidate turns, and on every turn when voice is off.
    voice_key: str | None = None


class QuestionOut(BaseModel):
    """A core question with its rubric. Never serve this to a candidate —
    subject is the answer."""

    id: int
    text: str
    focus: str
    subject: str


class AnswerRequest(BaseModel):
    """Candidate answer submission. after_seq is the last seq the client has;
    a mismatch with the server's last_seq returns 409."""

    content: str = Field(min_length=1, max_length=5000)
    after_seq: int = Field(ge=0)


class InterviewStateResponse(BaseModel):
    """Candidate-facing state. Must never carry the script, the rubric
    (subject), the assessment, or the access token."""

    status: str
    # InterviewMode, from the row's creation-time snapshot. The client renders
    # the recorder or the textarea from this and nothing else.
    answer_mode: str
    # InterviewVoice, same snapshot discipline: the client decides whether to
    # play question audio from this, never from a build-time flag.
    voice_mode: str
    job_title: str | None = None
    company_name: str | None = None
    question_number: int
    total_questions: int
    time_remaining_seconds: int | None = None
    turns: list[TurnOut] = Field(default_factory=list)


class FixedQuestionIO(BaseModel):
    """A recruiter-authored question, in and out.

    focus and subject are required, not optional conveniences: the assessor
    grades every question against its subject, so one without it leaves the
    model inventing a rubric.

    Whitespace is stripped before validation, so "   " fails min_length here
    rather than reaching the service as a technically-non-empty string.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=1000)
    focus: QuestionFocus
    subject: str = Field(min_length=1, max_length=500)


class InterviewTemplateRequest(BaseModel):
    """Structural settings applied to every interview generated from a run."""

    question_count: int = Field(
        ge=MIN_QUESTIONS_PER_INTERVIEW, le=MAX_QUESTIONS_PER_INTERVIEW
    )
    followups_enabled: bool = True
    # Validated against ALLOWED_TIME_LIMIT_SECONDS in the service, not here:
    # the message names the allowed durations, which is copy the client renders
    # directly.
    time_limit_seconds: int = INTERVIEW_TIME_LIMIT_SECONDS
    # Null or blank means "let the model write it".
    opening: str | None = Field(default=None, max_length=2000)
    closing: str | None = Field(default=None, max_length=2000)
    fixed_questions: list[FixedQuestionIO] = Field(default_factory=list)


class InterviewTemplateResponse(BaseModel):
    """The run's template, or the deployment defaults it would generate with.

    Always 200, never 404: the client must not have to guess what an unsaved
    template would do, because generating without saving really does use these
    values. `is_saved` false means nothing is stored yet and these came from
    Config.
    """

    run_id: UUID
    is_saved: bool
    question_count: int
    followups_enabled: bool
    time_limit_seconds: int
    # The durations a client may offer, so the picker cannot drift from what
    # the service accepts.
    allowed_time_limits: list[int] = Field(
        default_factory=lambda: list(ALLOWED_TIME_LIMIT_SECONDS)
    )
    opening: str | None = None
    closing: str | None = None
    fixed_questions: list[FixedQuestionIO] = Field(default_factory=list)
    # Null until the recruiter saves one.
    updated_at: datetime | None = None


class DraftQuestionIn(BaseModel):
    """One question as edited by the recruiter.

    focus and subject round-trip unchanged from generation -- the review step
    edits wording, not the rubric a question is graded against. `id` is
    accepted but reassigned server-side so deletions can't leave gaps.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

    id: int = 0
    text: str = Field(min_length=1, max_length=1000)
    focus: QuestionFocus
    subject: str = Field(min_length=1, max_length=500)


class DraftScriptUpdateRequest(BaseModel):
    """The full edited script. Sent whole rather than as a patch: the
    recruiter is approving one artifact, and a partial update would leave the
    server merging edits it can't see the intent of."""

    opening: str = Field(min_length=1, max_length=2000)
    questions: list[DraftQuestionIn] = Field(min_length=1)
    closing: str = Field(min_length=1, max_length=2000)
    # Set on the interview, not read back from the template. The template
    # supplies the default at generation; from then on this draft owns the
    # setting, so approve_interview's rule -- the draft you approve is exactly
    # the draft you reviewed -- still holds.
    #
    # Both settings here are ones generation did not consume: the engine reads
    # them per answer, and the opening states no duration, so neither is baked
    # into the frozen script.
    followups_enabled: bool
    time_limit_seconds: int


class OneMoreQuestionRequest(BaseModel):
    """The questions currently on the recruiter's screen, so the model can
    avoid duplicating them. Sent rather than read from the stored script
    because the draft may have unsaved edits."""

    questions: list[DraftQuestionIn] = Field(default_factory=list)


def build_template_response(
    template: InterviewTemplate,
) -> InterviewTemplateResponse:
    return InterviewTemplateResponse(
        run_id=template.evaluation_run_id,
        is_saved=True,
        question_count=template.question_count,
        followups_enabled=template.followups_enabled,
        time_limit_seconds=template.time_limit_seconds,
        opening=template.opening,
        closing=template.closing,
        fixed_questions=[
            FixedQuestionIO.model_validate(q) for q in template.fixed_questions
        ],
        updated_at=template.updated_at,
    )


def build_default_template_response(
    run_id: UUID, settings: TemplateSettings
) -> InterviewTemplateResponse:
    """What generation would use for a run with no saved template.

    Serving this instead of a 404 is what stops the client inventing a default
    of its own: the number shown in the form is then the number the server
    would actually generate with.
    """
    return InterviewTemplateResponse(
        run_id=run_id,
        is_saved=False,
        question_count=settings.question_count,
        followups_enabled=settings.followups_enabled,
        time_limit_seconds=settings.time_limit_seconds,
        opening=settings.opening,
        closing=settings.closing,
        fixed_questions=[
            FixedQuestionIO.model_validate(q.model_dump())
            for q in settings.fixed_questions
        ],
        updated_at=None,
    )


class InterviewSummaryResponse(BaseModel):
    """Response after drafting, approving, or reissuing an invite.

    invite_url, access_token and expires_at are null while the interview is a
    draft. That is the API-level expression of the review gate: there is no
    link to send because no human has approved the questions yet.
    """

    interview_id: UUID
    status: str
    invite_url: str | None = None
    access_token: str | None = None
    questions_count: int
    expires_at: datetime | None = None
    created_at: datetime
    approved_at: datetime | None = None


class InterviewDetailResponse(BaseModel):
    """Full recruiter view: invite, transcript, rubric, and assessment."""

    interview_id: UUID
    status: str
    # Null while draft -- see InterviewSummaryResponse.
    invite_url: str | None = None
    access_token: str | None = None
    model_name: str
    answer_mode: str
    voice_mode: str
    followups_enabled: bool
    # This interview's snapshotted wall clock, so the review page can state the
    # real duration rather than assuming the deployment default.
    time_limit_seconds: int
    # The script's greeting and sign-off. Recruiter-only, and the review step
    # needs them before any turn exists to read them from -- a draft has no
    # transcript, so the turns list can't be the only place they appear.
    opening: str
    closing: str
    questions_count: int
    current_question_index: int
    questions: list[QuestionOut] = Field(default_factory=list)
    turns: list[TurnOut] = Field(default_factory=list)
    assessment: dict[str, Any] | None = None
    assessment_error: str | None = None
    expires_at: datetime | None = None
    approved_at: datetime | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    assessed_at: datetime | None = None
    created_at: datetime


def _parse_script(script_data: dict[str, Any]) -> InterviewScript | None:
    """Rehydrate the frozen script, or None when it can't be validated.

    One parse per response: a detail view needs the questions and both
    bookends, and validating the same JSONB blob once per field would re-build
    every InterviewQuestion to read two strings. Returning None rather than
    raising keeps the forgiving contract -- a detail view should still render
    if an older script shape no longer validates.
    """
    try:
        return InterviewScript.model_validate(script_data)
    except Exception:
        return None


def build_question_out(question: InterviewQuestion) -> QuestionOut:
    """One question for the wire.

    The single constructor for QuestionOut, because that model is the
    candidate-safety boundary: a field added there must not be silently
    omitted by a second hand-rolled copy.
    """
    return QuestionOut(
        id=question.id,
        text=question.text,
        focus=question.focus.value,
        subject=question.subject,
    )


def to_interview_questions(questions: list[DraftQuestionIn]) -> list[InterviewQuestion]:
    """Recruiter-edited questions as the domain objects the service takes.

    Lives here with the other wire<->domain conversions rather than in the
    route, so both endpoints that accept edited questions convert them the
    same way.
    """
    return [
        InterviewQuestion(id=q.id, text=q.text, focus=q.focus, subject=q.subject)
        for q in questions
    ]


def _questions_out(script: InterviewScript | None) -> list[QuestionOut]:
    if script is None:
        return []
    return [build_question_out(q) for q in script.questions]


def build_turn_out(turn: InterviewTurn, voice: bool) -> TurnOut:
    """One turn for the wire. `voice` is Interview.voice_on, passed as a bool
    rather than the interview itself so this stays a pure turn mapper.

    Required rather than defaulted: a caller that omitted it would emit turns
    with no voice_key, so live SSE turns would lose their audio while the same
    turns refetched from GET kept it. mypy enforcing that is worth more than a
    default that is wrong every time it is used.
    """
    return TurnOut(
        seq=turn.seq,
        role=turn.role,
        kind=turn.kind,
        question_index=turn.question_index,
        content=turn.content,
        created_at=turn.created_at,
        has_audio=turn.audio_path is not None,
        voice_key=voice_key_for_turn(turn) if voice else None,
    )


def build_state_response(
    interview: Interview, turns: list[InterviewTurn]
) -> InterviewStateResponse:
    grounding = interview.grounding or {}
    voice = interview.voice_on
    return InterviewStateResponse(
        status=interview.status,
        answer_mode=interview.answer_mode,
        voice_mode=interview.voice_mode,
        job_title=grounding.get("job_title"),
        company_name=grounding.get("company_name"),
        question_number=state.question_number(interview),
        total_questions=state.total_questions(interview),
        time_remaining_seconds=state.time_remaining_seconds(interview),
        turns=[build_turn_out(t, voice) for t in turns],
    )


def build_summary_response(interview: Interview) -> InterviewSummaryResponse:
    questions = interview.question_script.get("questions", [])
    return InterviewSummaryResponse(
        interview_id=interview.id,
        status=interview.status,
        invite_url=build_invite_url(interview.access_token),
        access_token=interview.access_token,
        questions_count=len(questions),
        expires_at=interview.expires_at,
        created_at=interview.created_at,
        approved_at=interview.approved_at,
    )


def build_detail_response(
    interview: Interview, turns: list[InterviewTurn]
) -> InterviewDetailResponse:
    script = _parse_script(interview.question_script)
    questions = _questions_out(script)
    opening = script.opening if script else ""
    closing = script.closing if script else ""
    voice = interview.voice_on
    return InterviewDetailResponse(
        interview_id=interview.id,
        status=interview.status,
        invite_url=build_invite_url(interview.access_token),
        access_token=interview.access_token,
        model_name=interview.model_name,
        answer_mode=interview.answer_mode,
        voice_mode=interview.voice_mode,
        followups_enabled=interview.followups_enabled,
        time_limit_seconds=interview.time_limit_seconds,
        opening=opening,
        closing=closing,
        questions_count=len(questions),
        current_question_index=interview.current_question_index,
        # The rubric itself (text, focus, subject), recruiter-only. Never sent
        # to the candidate surface -- InterviewStateResponse has no such field.
        questions=questions,
        # Recruiters get voice_key too: they have their own JWT-gated endpoint
        # for the clips, so the key is actionable on this surface. (It was
        # withheld here until that endpoint existed.)
        turns=[build_turn_out(t, voice) for t in turns],
        assessment=interview.assessment,
        assessment_error=interview.assessment_error,
        expires_at=interview.expires_at,
        approved_at=interview.approved_at,
        started_at=interview.started_at,
        completed_at=interview.completed_at,
        assessed_at=interview.assessed_at,
        created_at=interview.created_at,
    )
