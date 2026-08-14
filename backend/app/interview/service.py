from datetime import datetime
from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.exceptions import NotFoundError, ValidationError
from app.config import Config
from app.core.file_storage import (
    file_exists,
    get_file_content,
    get_interview_audio_folder,
    save_uploaded_file,
)
from app.core.logger import init_logger
from app.interview.constants import (
    ANSWER_AUDIO_EXTENSIONS,
    MAX_QUESTIONS_PER_INTERVIEW,
    MIN_QUESTIONS_PER_INTERVIEW,
)
from app.interview.question_generator import build_grounding, generate_script
from app.interview.speaker import (
    is_safe_voice_key,
    resolve_voice_text,
    synthesize_and_store,
    voice_storage_path,
)
from app.models.evaluation_run import EvaluationRun
from app.models.interview import (
    Interview,
    InterviewMode,
    InterviewStatus,
    InterviewVoice,
    TurnRole,
)
from app.models.interview_template import InterviewTemplate
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.evaluation_run_repository import (
    EvaluationRunRepository,
    InterviewRow,
)
from app.repositories.interview_repository import OVERDUE_STATUSES, InterviewRepository
from app.repositories.interview_template_repository import InterviewTemplateRepository
from app.repositories.job_repository import JobRepository
from app.schemas.interview import FixedQuestion, InterviewScript, TemplateSettings
from app.worker.interview_tasks import assess_interview, synthesize_interview_voice

logger = init_logger(__name__)


def resolve_evaluation_id(db: Session, run: EvaluationRun, candidate_id: UUID) -> UUID:
    """Resolve a candidate within a run to its evaluation, or raise 404.

    Mirrors the candidate-breakdown endpoints: membership is checked against
    the run's items, then the evaluation is looked up by (candidate, job).
    """
    matching_item = next(
        (item for item in run.items if item.candidate_id == candidate_id),
        None,
    )
    if not matching_item:
        raise NotFoundError("Candidate", str(candidate_id))

    evaluation = EvaluationRepository(db).get_by_candidate_and_job(
        candidate_id, run.job_id
    )
    if not evaluation:
        raise NotFoundError("Evaluation", str(candidate_id))

    return evaluation.id


def apply_lazy_expiry(db: Session, interview: Interview) -> Interview:
    """Persist the `expired` state when the invite is overdue.

    There is no scheduler in this repo and nothing needs to *happen* at the
    expiry moment — the state only needs to be correct when observed, so
    whichever request notices writes it.

    InterviewRepository.expire_overdue_for_run is the bulk twin, used by the
    run listing so it doesn't commit once per stale invite. Both read
    OVERDUE_STATUSES, so the two can't disagree about which invites are stale.

    Drafts are excluded by having no expires_at at all: expiry bounds an
    invite, and a draft has none. DRAFT is deliberately absent from
    OVERDUE_STATUSES for the same reason.
    """
    if interview.expires_at is None:
        return interview

    if interview.status in OVERDUE_STATUSES and interview.expires_at < datetime.now():
        return InterviewRepository(db).mark_expired(interview)
    return interview


def list_interview_rows(db: Session, run: EvaluationRun) -> dict[UUID, InterviewRow]:
    """Interview state for every item in a run, keyed by run item id.

    The list-read counterpart to get_interview: it owns the same expire-then-read
    pairing, so a run listing can't show an invite as live that opening it would
    immediately expire. Kept here rather than in the route so every interview
    read semantic -- single or bulk -- has one home.
    """
    InterviewRepository(db).expire_overdue_for_run(run.id)
    return EvaluationRunRepository(db).get_interview_rows_for_run(run.id)


def _has_candidate_answers(repo: InterviewRepository, interview: Interview) -> bool:
    """Whether the candidate has answered at all.

    Reissue and assess are exact inverses on an expired interview (reissue
    only with no answers, assess only with them), so both must read this the
    same way — hence one definition.
    """
    return any(
        turn.role == TurnRole.CANDIDATE.value for turn in repo.get_turns(interview.id)
    )


def _configured_mode() -> InterviewMode:
    """The deployment's answer mode, or TEXT if the env var is nonsense.

    Degrading to typing beats refusing to mint invites over a typo, and text
    mode works everywhere.
    """
    try:
        return InterviewMode(Config.INTERVIEW_MODE)
    except ValueError:
        logger.warning(
            f"Invalid INTERVIEW_MODE '{Config.INTERVIEW_MODE}'; falling back to "
            f"'{InterviewMode.TEXT.value}'"
        )
        return InterviewMode.TEXT


def _configured_voice() -> InterviewVoice:
    """The deployment's voice setting, or OFF if the env var is nonsense.

    Degrading to a silent (but complete) interview beats refusing to mint
    invites over a typo -- the questions are on screen either way.
    """
    try:
        return InterviewVoice(Config.INTERVIEW_VOICE)
    except ValueError:
        logger.warning(
            f"Invalid INTERVIEW_VOICE '{Config.INTERVIEW_VOICE}'; falling back to "
            f"'{InterviewVoice.OFF.value}'"
        )
        return InterviewVoice.OFF


def default_template_settings() -> TemplateSettings:
    """What generation uses for a run with no saved template."""
    return TemplateSettings(
        question_count=Config.INTERVIEW_QUESTION_COUNT,
        followups_enabled=True,
    )


def template_settings_from(template: InterviewTemplate) -> TemplateSettings:
    """A saved template as the value object generation reads.

    Split from resolve_template_settings so a caller that already holds the row
    -- the GET route, which must first check whether one exists -- doesn't
    re-query for it.
    """
    return TemplateSettings(
        question_count=template.question_count,
        followups_enabled=template.followups_enabled,
        opening=template.opening,
        closing=template.closing,
        fixed_questions=[
            FixedQuestion.model_validate(q) for q in template.fixed_questions
        ],
    )


def resolve_template_settings(db: Session, run_id: UUID) -> TemplateSettings:
    """The run's template, or deployment defaults when it has none.

    One resolver so generation has a single input shape: a recruiter who never
    opens the template step gets exactly today's behaviour, driven by
    Config.INTERVIEW_QUESTION_COUNT.
    """
    template = InterviewTemplateRepository(db).get_by_run_id(run_id)
    if template is None:
        return default_template_settings()
    return template_settings_from(template)


def upsert_template(
    db: Session,
    run: EvaluationRun,
    question_count: int,
    followups_enabled: bool,
    opening: str | None,
    closing: str | None,
    fixed_questions: list[FixedQuestion],
) -> InterviewTemplate:
    """Create or replace the run's template.

    Deliberately allowed at any time, including while interviews from it are
    live. Every interview snapshots its script, mode and follow-up setting at
    approval, so an edit here can only ever reach interviews generated after
    it. What a template equalizes across candidates is structure, not wording:
    the questions were always generated per resume.
    """
    if not MIN_QUESTIONS_PER_INTERVIEW <= question_count <= MAX_QUESTIONS_PER_INTERVIEW:
        raise ValidationError(
            f"Question count must be between {MIN_QUESTIONS_PER_INTERVIEW} and "
            f"{MAX_QUESTIONS_PER_INTERVIEW}."
        )

    if len(fixed_questions) > question_count:
        raise ValidationError(
            f"{len(fixed_questions)} fixed questions exceed the total of "
            f"{question_count}. Raise the question count or remove one."
        )

    for question in fixed_questions:
        if not question.text.strip():
            raise ValidationError("A fixed question cannot be empty.")
        if not question.subject.strip():
            raise ValidationError(
                "Every fixed question needs a subject saying what it tests, "
                "so the assessment can grade the answer against it."
            )

    return InterviewTemplateRepository(db).upsert(
        run_id=run.id,
        question_count=question_count,
        followups_enabled=followups_enabled,
        opening=(opening or "").strip() or None,
        closing=(closing or "").strip() or None,
        fixed_questions=[q.model_dump(mode="json") for q in fixed_questions],
    )


def create_interview_draft(
    db: Session, run: EvaluationRun, candidate_id: UUID
) -> tuple[Interview, bool]:
    """Generate an unapproved interview draft for a candidate in a run.

    The draft has no access_token, so nothing exists for a candidate to open
    until a human approves it. That is the whole review gate; see
    InterviewRepository.create_draft.

    Idempotent: if one already exists for the evaluation it is returned
    untouched. Returns (interview, created) so the route can pick 200 vs 201.
    """
    evaluation_id = resolve_evaluation_id(db, run, candidate_id)
    interview_repo = InterviewRepository(db)

    existing = interview_repo.get_by_evaluation_id(evaluation_id)
    if existing:
        logger.info(
            f"Interview already exists for evaluation {evaluation_id}; returning it"
        )
        return apply_lazy_expiry(db, existing), False

    evaluation = EvaluationRepository(db).get_by_id(evaluation_id)
    if not evaluation:
        raise NotFoundError("Evaluation", str(evaluation_id))

    candidate = CandidateRepository(db).get_by_id(candidate_id)
    if not candidate:
        raise NotFoundError("Candidate", str(candidate_id))

    job = JobRepository(db).get_by_id(run.job_id, with_requirements=True)
    if not job:
        raise NotFoundError("Job", str(run.job_id))

    # Read the env var once, here: the mode is snapshotted onto the row and the
    # generated opening tells the candidate how to answer, so both have to come
    # from the same read.
    mode = _configured_mode()
    voice = _configured_voice()

    template = resolve_template_settings(db, run.id)
    grounding = build_grounding(job, candidate, evaluation)
    script = generate_script(grounding, mode, template)

    try:
        interview = interview_repo.create_draft(
            evaluation_id=evaluation_id,
            question_script=script.model_dump(mode="json"),
            grounding=grounding,
            model_name=Config.INTERVIEW_MODEL_NAME,
            answer_mode=mode.value,
            voice_mode=voice.value,
            followups_enabled=template.followups_enabled,
        )
    except IntegrityError:
        # Two clicks raced: both passed the check above while generation ran
        # (~20s), and the other request inserted first. The unique constraint
        # on evaluation_id is what makes that safe to recover from -- discard
        # this script and return the winner's interview.
        db.rollback()
        existing = interview_repo.get_by_evaluation_id(evaluation_id)
        if not existing:
            raise
        logger.info(
            f"Concurrent interview creation for evaluation {evaluation_id}; "
            "returning the interview that won"
        )
        return apply_lazy_expiry(db, existing), False

    # Voice synthesis deliberately does NOT happen here -- it waits for
    # approve_interview. A draft's questions can still be edited or deleted,
    # and synthesizing them now would pay for audio of text nobody agreed to
    # send.
    return interview, True


def update_interview_draft(
    db: Session, run: EvaluationRun, candidate_id: UUID, script: InterviewScript
) -> Interview:
    """Save recruiter edits to a draft's script.

    Only while `draft`: once approved the script is frozen, so a live
    transcript can never drift from the rubric the assessor grades against.
    """
    interview = get_interview(db, run, candidate_id)

    if interview.status != InterviewStatus.DRAFT.value:
        raise ValidationError(
            "This interview has already been approved and can no longer be edited."
        )

    if not script.questions:
        raise ValidationError("An interview needs at least one question.")

    if len(script.questions) > MAX_QUESTIONS_PER_INTERVIEW:
        raise ValidationError(
            f"An interview can have at most {MAX_QUESTIONS_PER_INTERVIEW} questions."
        )

    for question in script.questions:
        if not question.text.strip():
            raise ValidationError("A question cannot be empty.")

    if not script.opening.strip() or not script.closing.strip():
        raise ValidationError("The opening and closing cannot be empty.")

    # Renumber so ids stay 0-based and contiguous after deletions; the engine
    # and the assessor both index questions by position.
    for index, question in enumerate(script.questions):
        question.id = index

    return InterviewRepository(db).update_draft_script(
        interview, script.model_dump(mode="json")
    )


def approve_interview(db: Session, run: EvaluationRun, candidate_id: UUID) -> Interview:
    """Approve a draft and mint its invite.

    The human gate: before this call the interview has no token and cannot be
    opened by anyone. Only now is the voice cache warmed -- the script is
    frozen from here, so synthesized audio can no longer be wasted.

    Deliberately does NOT re-read the template. Everything a template governs
    was applied when the draft was generated, so re-reading only
    followups_enabled would make one of four settings quietly retroactive
    while the rest weren't -- the worst of both rules. The draft the recruiter
    approves is exactly the draft they reviewed.
    """
    interview = get_interview(db, run, candidate_id)

    if interview.status != InterviewStatus.DRAFT.value:
        raise ValidationError(
            f"Cannot approve an interview with status '{interview.status}'."
        )

    interview = InterviewRepository(db).approve(interview)

    if interview.voice_on:
        # Warm the cache for every slot whose text is verbatim from the frozen
        # script, so the candidate never waits on the questions that matter.
        # Routes dispatch, workers execute -- the same split as assessment. A
        # failure here is invisible: the audio endpoint synthesizes on demand.
        synthesize_interview_voice.delay(str(interview.id))

    return interview


def get_interview(db: Session, run: EvaluationRun, candidate_id: UUID) -> Interview:
    """Load the interview for a candidate in a run, applying lazy expiry."""
    evaluation_id = resolve_evaluation_id(db, run, candidate_id)
    interview = InterviewRepository(db).get_by_evaluation_id(evaluation_id)
    if not interview:
        raise NotFoundError("Interview", str(candidate_id))
    return apply_lazy_expiry(db, interview)


def reissue_interview(db: Session, run: EvaluationRun, candidate_id: UUID) -> Interview:
    """Rotate the token and expiry so a fresh link can be sent.

    Allowed only while `created`, or `expired` with no answers yet — reissuing
    can never wipe a transcript.
    """
    interview = get_interview(db, run, candidate_id)
    repo = InterviewRepository(db)

    if interview.status == InterviewStatus.DRAFT.value:
        raise ValidationError(
            "This interview has not been approved yet, so there is no invite "
            "to reissue. Approve it to create the link."
        )

    if interview.status == InterviewStatus.CREATED.value:
        return repo.rotate_token(interview)

    if interview.status == InterviewStatus.EXPIRED.value:
        if not _has_candidate_answers(repo, interview):
            return repo.rotate_token(interview)
        raise ValidationError(
            "Cannot reissue an expired interview that already has answers. "
            "Assess the partial transcript instead."
        )

    raise ValidationError(
        f"Cannot reissue an interview with status '{interview.status}'."
    )


def request_assessment(
    db: Session, run: EvaluationRun, candidate_id: UUID
) -> Interview:
    """Dispatch a manual assessment on the recruiter's behalf.

    Allowed from either terminal state: `completed` (the automatic dispatch on
    completion failed, or never ran because no worker was up to consume it) or
    `expired` with at least one answer (assess the partial transcript).

    A plain `completed` interview is deliberately included even though the
    engine already dispatched for it. From the recruiter's side a task that was
    never consumed is indistinguishable from one still in flight, so refusing
    here would leave the interview permanently stuck on "pending" with no way
    out. Re-dispatching is cheap to get wrong in that direction: the task
    returns early once the status is `assessed`, so a genuine duplicate costs
    at most one redundant LLM call.
    """
    interview = get_interview(db, run, candidate_id)
    repo = InterviewRepository(db)

    if interview.status not in (
        InterviewStatus.EXPIRED.value,
        InterviewStatus.COMPLETED.value,
    ):
        raise ValidationError(
            f"Cannot assess an interview with status '{interview.status}'."
        )

    if interview.status == InterviewStatus.EXPIRED.value and not _has_candidate_answers(
        repo, interview
    ):
        raise ValidationError(
            "Cannot assess an expired interview with no answers. "
            "Reissue the invite instead."
        )

    assess_interview.delay(str(interview.id))
    logger.info(f"Dispatched manual assessment for interview {interview.id}")
    return interview


def store_answer_audio(
    interview_id: UUID, seq: int, content: bytes, mime_type: str
) -> str:
    """Persist one recorded answer and return its storage reference.

    Owns the layout (`interviews/{interview_id}/turn-{seq}.{ext}`) so the
    filename convention stays in the interview domain rather than in a route.
    Writes through the file_storage facade, so USE_S3 picks the backend.
    """
    extension = ANSWER_AUDIO_EXTENSIONS[mime_type]
    return save_uploaded_file(
        get_interview_audio_folder(interview_id),
        f"turn-{seq}.{extension}",
        content,
    )


def get_interview_voice(db: Session, interview: Interview, key: str) -> bytes:
    """One interviewer clip for the candidate: cached if present, synthesized
    on demand if not.

    The cache miss is what lets precompute be a pure optimization -- if the
    task never ran, failed, or no worker was up, the interview still speaks;
    the first fetch just pays the synthesis latency.

    Raises NotFoundError when the key names nothing in this interview, which is
    also the bound on what an invite token can be made to spend: text comes
    only from this interview's own script or turns, and each real key is
    synthesized at most once before it is cached. SynthesisError propagates for
    the route to map to a 503.
    """
    if not interview.voice_on or not is_safe_voice_key(key):
        raise NotFoundError("Interview audio", key)

    # Cache hit short-circuits before any query or script parse. A stored clip
    # was written through the resolver below, so its existence already proves
    # the key was legitimate -- re-deriving that on every replay would spend a
    # turns query and a script validation to learn what the file says. The key
    # pattern is still checked first, above: it guards the filename this
    # interpolates, and skipping the resolver skips nothing else.
    path = voice_storage_path(interview.id, key)
    if file_exists(path):
        return get_file_content(path)

    turns = InterviewRepository(db).get_turns(interview.id)
    text = resolve_voice_text(interview, turns, key)
    if text is None:
        raise NotFoundError("Interview audio", key)

    logger.info(f"Synthesizing interview {interview.id} voice key '{key}' on demand")
    return synthesize_and_store(interview.id, key, text)


def get_owned_interview_voice(
    db: Session, run: EvaluationRun, candidate_id: UUID, key: str
) -> bytes:
    """One interviewer clip for the recruiter, resolved by run membership.

    The same lazy path the candidate endpoint uses, so a recruiter reviewing an
    interview can hear a question the candidate never played — at the cost of
    synthesizing it then. That is bounded the same way: only keys belonging to
    this interview resolve, and each is paid for once before it is cached.

    Authorization is run-membership only, as everywhere else here; the user_id
    filter lives in the route's owned-run loader.
    """
    interview = get_interview(db, run, candidate_id)
    return get_interview_voice(db, interview, key)


def get_turn_audio(
    db: Session, run: EvaluationRun, candidate_id: UUID, seq: int
) -> tuple[bytes, str]:
    """The recording behind one answer turn, for recruiter playback.

    Returns (bytes, mime_type). Like everything else here, authorization is
    run-membership only — the user_id filter lives in the route's owned-run
    loader, which is what keeps this off the candidate token surface.
    """
    interview = get_interview(db, run, candidate_id)

    turn = InterviewRepository(db).get_turn_by_seq(interview.id, seq)
    if turn is None or turn.audio_path is None or turn.audio_mime_type is None:
        raise NotFoundError("Interview answer recording", f"seq {seq}")

    return get_file_content(turn.audio_path), turn.audio_mime_type
