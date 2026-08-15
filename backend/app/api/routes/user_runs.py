from uuid import UUID

from fastapi import APIRouter, Depends, Form, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.dependencies import enforce_budget, enforce_cooldown, get_db
from app.api.exceptions import (
    NotFoundError,
    ServiceUnavailableError,
    ValidationError,
)
from app.api.schemas.interview import (
    DraftScriptUpdateRequest,
    InterviewDetailResponse,
    InterviewSummaryResponse,
    InterviewTemplateRequest,
    InterviewTemplateResponse,
    OneMoreQuestionRequest,
    QuestionOut,
    build_default_template_response,
    build_detail_response,
    build_invite_url,
    build_question_out,
    build_summary_response,
    build_template_response,
    to_interview_questions,
)
from app.api.schemas.public import (
    AddCandidatesResponse,
    CandidateBreakdownResponse,
    RetryFailedResponse,
)
from app.api.schemas.runs import (
    DashboardStatsResponse,
    EvaluationRunDetail,
    EvaluationRunListResponse,
    EvaluationRunSummary,
    RunItemInterview,
    RunItemSummary,
)
from app.auth.jwt import get_current_active_user
from app.core.file_storage import delete_file, resolve_file_path, save_uploaded_file
from app.core.file_upload import (
    process_uploaded_files,
    read_pdf_content,
    validate_pdf_filename,
)
from app.core.job_description_parser import parse_job_description
from app.core.rate_limit import (
    COST_ASSESSMENT,
    COST_JD_PARSE,
    COST_RESUME,
    interview_invite_cost,
    interview_one_question_cost,
    refund,
)
from app.interview.service import (
    approve_interview,
    create_interview_draft,
    default_template_settings,
    draft_one_more_question,
    get_interview,
    get_owned_interview_voice,
    get_turn_audio,
    list_interview_rows,
    reissue_interview,
    request_assessment,
    update_interview_draft,
    upsert_template,
)
from app.interview.speaker import (
    VOICE_MIME_TYPE,
    SynthesisError,
    voice_response_headers,
)
from app.models.evaluation_run import EvaluationRun, RunStatus
from app.models.user import User
from app.repositories.candidate_repository import CandidateRepository
from app.repositories.evaluation_repository import EvaluationRepository
from app.repositories.evaluation_run_repository import (
    EvaluationRunItemRepository,
    EvaluationRunRepository,
)
from app.repositories.interview_repository import InterviewRepository
from app.repositories.interview_template_repository import InterviewTemplateRepository
from app.repositories.job_repository import JobRepository
from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.experience_evaluation import ExperienceScoreResult
from app.schemas.interview import FixedQuestion, InterviewScript
from app.schemas.skill_evaluation import SkillScoreResult
from app.worker.tasks import process_evaluation_run

runs_router = APIRouter(prefix="/evaluations/runs", tags=["evaluation-runs"])
dashboard_router = APIRouter(prefix="/dashboard", tags=["dashboard"])

_RETRY_COOLDOWN_MESSAGE = (
    "This run was retried a moment ago. Give the current attempt time to "
    "finish before retrying again."
)
_ASSESS_COOLDOWN_MESSAGE = (
    "An assessment for this interview was just requested. Give it a moment to "
    "finish before requesting another."
)


def _build_run_summary(run: object) -> EvaluationRunSummary:
    return EvaluationRunSummary(
        id=run.id,  # type: ignore[attr-defined]
        job_id=run.job_id,  # type: ignore[attr-defined]
        job_title=run.job.title if run.job else None,  # type: ignore[attr-defined]
        company_name=run.job.company_name if run.job else None,  # type: ignore[attr-defined]
        status=run.status,  # type: ignore[attr-defined]
        total_count=run.total_count,  # type: ignore[attr-defined]
        processed_count=run.processed_count,  # type: ignore[attr-defined]
        failed_count=run.failed_count,  # type: ignore[attr-defined]
        processing_time_seconds=run.processing_time_seconds,  # type: ignore[attr-defined]
        created_at=run.created_at,  # type: ignore[attr-defined]
    )


@runs_router.post("", response_model=EvaluationRunSummary, status_code=201)
async def create_evaluation_run(
    job_text: str = Form(...),
    files: list[UploadFile] = [],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> EvaluationRunSummary:
    """
    Create a new evaluation run for the authenticated user.

    Parses the job description, uploads resume PDFs, and starts background
    processing. Results are accessible via GET /evaluations/runs/{run_id}.
    """
    if not files:
        raise ValidationError("At least one PDF file is required")

    # Signed-in runs have no resume cap (that is the point of an account), so
    # the hourly unit budget is the only thing bounding this endpoint. Charged
    # before the JD parse, which is itself a model call.
    enforce_budget(COST_JD_PARSE + len(files) * COST_RESUME)

    jd = parse_job_description(job_text)
    if not jd.is_job_description:
        raise ValidationError(
            f"Invalid job description. Detected: {jd.document_type or 'unknown document type'}"
        )

    job_repo = JobRepository(db)
    job = job_repo.create(jd, job_text, user_id=current_user.id)

    run_repo = EvaluationRunRepository(db)
    run = run_repo.create_for_user(job.id, user_id=current_user.id)

    item_repo = EvaluationRunItemRepository(db)
    uploaded, failed, errors = await process_uploaded_files(
        run.id, run.folder_path, files, item_repo, run_repo
    )

    # The JD parse already spent, so only unused resume units come back.
    refund((len(files) - uploaded) * COST_RESUME)

    if uploaded == 0:
        run_repo.delete(run.id)
        job_repo.delete(job.id)
        raise ValidationError(
            f"No valid PDF files uploaded. Errors: {'; '.join(errors)}"
        )

    item_repo.mark_uploaded_as_pending(run.id)
    run_repo.mark_pending(run.id)

    try:
        process_evaluation_run.delay(str(run.id))
    except Exception as e:
        run_repo.mark_failed(run.id, str(e))
        raise ValidationError(f"Failed to start evaluation: {e}")

    db.refresh(run)
    db.refresh(job)
    run.job = job

    return _build_run_summary(run)


@runs_router.get("", response_model=EvaluationRunListResponse)
def list_evaluation_runs(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> EvaluationRunListResponse:
    """List all evaluation runs for the current user, newest first."""
    run_repo = EvaluationRunRepository(db)
    runs = run_repo.get_by_user(
        current_user.id, limit=limit, offset=offset, with_job=True
    )
    total = run_repo.count_by_user(current_user.id)
    return EvaluationRunListResponse(
        items=[_build_run_summary(r) for r in runs],
        total=total,
    )


@runs_router.get("/{run_id}", response_model=EvaluationRunDetail)
def get_evaluation_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> EvaluationRunDetail:
    """Get a single evaluation run by ID (must belong to current user).

    Note this GET writes: list_interview_rows expires overdue invites in bulk
    before reading them, so the listing can't disagree with what opening a
    single interview would show. Same lazy-expiry contract as the rest of the
    interview read paths, and owned by the same service.
    """
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id_for_user(
        run_id, current_user.id, with_items=True, with_job=True
    )
    if not run:
        raise NotFoundError("Evaluation run", str(run_id))

    interview_rows = list_interview_rows(db, run)
    candidate_names = CandidateRepository(db).get_names_by_ids(
        [item.candidate_id for item in run.items if item.candidate_id]
    )

    items: list[RunItemSummary] = []
    for item in sorted(
        run.items,
        key=lambda x: (
            x.status != "completed",
            -(
                x.evaluation.final_score
                if x.evaluation and x.evaluation.final_score
                else 0
            ),
        ),
    ):
        row = interview_rows.get(item.id)

        items.append(
            RunItemSummary(
                item_id=item.id,
                candidate_id=item.candidate_id,
                candidate_name=candidate_names.get(item.candidate_id)
                if item.candidate_id
                else None,
                filename=item.pdf_filename,
                final_score=item.evaluation.final_score if item.evaluation else None,
                hire_signal=item.evaluation.hire_signal if item.evaluation else None,
                status=item.status,
                interview=(
                    RunItemInterview(
                        status=row.status,
                        recommendation=row.recommendation,
                        answered=row.answered,
                        has_assessment_error=row.has_assessment_error,
                        invite_url=build_invite_url(row.access_token),
                        expires_at=row.expires_at,
                        completed_at=row.completed_at,
                        assessed_at=row.assessed_at,
                    )
                    if row
                    else None
                ),
            )
        )

    summary = _build_run_summary(run)
    return EvaluationRunDetail(**summary.model_dump(), items=items)


@runs_router.post("/{run_id}/add-candidates", response_model=AddCandidatesResponse)
async def add_candidates(
    run_id: UUID,
    files: list[UploadFile] = [],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> AddCandidatesResponse:
    """Add more resume PDFs to a completed or failed evaluation run."""
    if not files:
        raise ValidationError("At least one PDF file is required")

    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id_for_user_for_update(run_id, current_user.id)
    if not run:
        raise NotFoundError("Evaluation run", str(run_id))

    allowed = {RunStatus.COMPLETED.value, RunStatus.FAILED.value}
    if run.status not in allowed:
        raise ValidationError(
            f"Cannot add candidates to a run with status '{run.status}'. "
            "The run must be completed or failed."
        )

    enforce_budget(len(files) * COST_RESUME)

    item_repo = EvaluationRunItemRepository(db)
    uploaded_items: list[tuple[str, UUID]] = []
    failed = 0
    errors: list[str] = []
    duplicate_files: list[str] = []

    for file in files:
        try:
            filename = validate_pdf_filename(file.filename)
            if item_repo.filename_exists(run.id, filename):
                duplicate_files.append(filename)
                failed += 1
                continue
            content, file_size = await read_pdf_content(file)
            save_uploaded_file(run.folder_path, filename, content)
            item = item_repo.create_uploaded(run.id, filename, file_size)
            uploaded_items.append((filename, item.id))
        except ValidationError as e:
            errors.append(f"{file.filename or 'unknown'}: {e.message}")
            failed += 1
        except Exception as e:
            errors.append(f"{file.filename or 'unknown'}: {str(e)[:100]}")
            failed += 1

    uploaded = len(uploaded_items)
    if duplicate_files:
        errors.append(f"{', '.join(duplicate_files)}: already exists in this batch")

    refund((len(files) - uploaded) * COST_RESUME)

    if uploaded == 0:
        raise ValidationError(
            f"No valid PDF files uploaded. Errors: {'; '.join(errors)}"
        )

    run_repo.adjust_total_count(run.id, uploaded)
    item_repo.mark_uploaded_as_pending(run.id)
    run_repo.mark_reopened(run.id)

    try:
        process_evaluation_run.delay(str(run.id))
    except Exception as e:
        run_repo.mark_failed(run.id, str(e))
        for filename, item_id in uploaded_items:
            file_path = resolve_file_path(run.folder_path, filename)
            delete_file(file_path)
            item_repo.delete_item(item_id)
        run_repo.adjust_total_count(run.id, -uploaded)
        raise ValidationError(f"Failed to start evaluation: {e}")

    return AddCandidatesResponse(
        uploaded=uploaded,
        failed=failed,
        errors=errors,
        run_status=RunStatus.PENDING.value,
    )


@runs_router.post("/{run_id}/retry-failed", response_model=RetryFailedResponse)
def retry_failed(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> RetryFailedResponse:
    """Retry all failed items in a completed or failed evaluation run."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id_for_user_for_update(run_id, current_user.id)
    if not run:
        raise NotFoundError("Evaluation run", str(run_id))

    allowed = {RunStatus.COMPLETED.value, RunStatus.FAILED.value}
    if run.status not in allowed:
        raise ValidationError(
            f"Cannot retry items in a run with status '{run.status}'. "
            "The run must be completed or failed."
        )

    item_repo = EvaluationRunItemRepository(db)
    failed_items = item_repo.get_failed_items(run.id)
    if not failed_items:
        raise ValidationError("No failed items to retry.")

    enforce_cooldown(f"retry:{run.id}", _RETRY_COOLDOWN_MESSAGE)
    enforce_budget(len(failed_items) * COST_RESUME)

    item_repo.mark_items_as_pending([item.id for item in failed_items])
    run_repo.mark_reopened(run.id)

    try:
        process_evaluation_run.delay(str(run.id))
    except Exception as e:
        run_repo.mark_failed(run.id, str(e))
        raise ValidationError(f"Failed to start evaluation: {e}")

    return RetryFailedResponse(
        retried=len(failed_items),
        run_status=RunStatus.PENDING.value,
    )


# Deletion is owner-only, and only from a settled run. The status allow-list is
# the same one add_candidates and retry_failed use, for a stronger reason here:
# a run in flight has evaluate_resume tasks running over exactly these rows, and
# they would recreate candidates and evaluations after the delete committed.
# There is deliberately no token-flavored twin in batch.py -- an access token is
# shareable by design, so a forwarded link must not be able to destroy a run --
# and no admin twin, because the admin surface is read-only.
_DELETABLE_STATUSES = {
    RunStatus.DRAFT.value,
    RunStatus.COMPLETED.value,
    RunStatus.FAILED.value,
}


@runs_router.delete("/{run_id}", status_code=204)
def delete_run(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    """Delete an evaluation run and everything it produced."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id_for_user_for_update(run_id, current_user.id)
    if not run:
        raise NotFoundError("Evaluation run", str(run_id))

    if run.status not in _DELETABLE_STATUSES:
        raise ValidationError(
            f"Cannot delete a run with status '{run.status}'. "
            "Wait for it to finish, then try again."
        )

    run_repo.delete(run_id, actor=current_user)


@runs_router.delete("/{run_id}/items/{item_id}", status_code=204)
def delete_run_item(
    run_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    """Remove a single candidate from an evaluation run."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id_for_user_for_update(run_id, current_user.id)
    if not run:
        raise NotFoundError("Evaluation run", str(run_id))

    if run.status not in _DELETABLE_STATUSES:
        raise ValidationError(
            f"Cannot remove a candidate from a run with status '{run.status}'. "
            "Wait for it to finish, then try again."
        )

    item_repo = EvaluationRunItemRepository(db)
    item = item_repo.get_by_id(item_id)
    # Checked against this run, so an item id belonging to someone else's run is
    # not reachable through a run the caller does own.
    if not item or item.evaluation_run_id != run_id:
        raise NotFoundError("Run item", str(item_id))

    if len(item_repo.get_by_run(run_id)) <= 1:
        raise ValidationError(
            "Cannot remove the last candidate from a run. Delete the run instead."
        )

    item_repo.delete_item_fully(item, run.folder_path, actor=current_user)


@runs_router.get(
    "/{run_id}/candidate/{candidate_id}", response_model=CandidateBreakdownResponse
)
def get_run_candidate_breakdown(
    run_id: UUID,
    candidate_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CandidateBreakdownResponse:
    """Get full evaluation breakdown for a candidate in an authenticated run."""
    run_repo = EvaluationRunRepository(db)
    run = run_repo.get_by_id_for_user(
        run_id, current_user.id, with_items=True, with_job=True
    )
    if not run:
        raise NotFoundError("Evaluation run", str(run_id))

    matching_item = next(
        (item for item in run.items if item.candidate_id == candidate_id),
        None,
    )
    if not matching_item:
        raise NotFoundError("Candidate", str(candidate_id))

    eval_repo = EvaluationRepository(db)
    evaluation = eval_repo.get_by_candidate_and_job(candidate_id, run.job_id)
    if not evaluation:
        raise NotFoundError("Evaluation", str(candidate_id))

    candidate_repo = CandidateRepository(db)
    candidate = candidate_repo.get_by_id(candidate_id)

    skills = (
        SkillScoreResult.model_validate(evaluation.skill_result)
        if evaluation.skill_result
        else None
    )
    experience = (
        ExperienceScoreResult.model_validate(evaluation.experience_result)
        if evaluation.experience_result
        else None
    )
    education = (
        EducationScoreResult.model_validate(evaluation.education_result)
        if evaluation.education_result
        else None
    )

    return CandidateBreakdownResponse(
        candidate_id=candidate_id,
        candidate_name=candidate.name if candidate else None,
        resume_markdown=candidate.resume_markdown if candidate else None,
        filename=matching_item.pdf_filename,
        final_score=evaluation.final_score,
        hire_signal=evaluation.hire_signal,
        skill_score=evaluation.skill_score,
        experience_score=evaluation.experience_score,
        education_score=evaluation.education_score,
        summary=evaluation.summary,
        skills=skills,
        experience=experience,
        education=education,
    )


# =============================================================================
# Interviews (owned flavor — JWT plus ownership check)
# =============================================================================


def _load_owned_run(db: Session, run_id: UUID, user: User) -> EvaluationRun:
    run = EvaluationRunRepository(db).get_by_id_for_user(
        run_id, user.id, with_items=True
    )
    if not run:
        raise NotFoundError("Evaluation run", str(run_id))
    return run


@runs_router.get(
    "/{run_id}/interview-template",
    response_model=InterviewTemplateResponse,
)
def get_owned_run_interview_template(
    run_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewTemplateResponse:
    """The run's interview template, or the defaults generation would use.

    Deliberately not a 404 when unset: the review page has to show the count
    that will actually be used, and a client-side default would drift from
    Config.INTERVIEW_QUESTION_COUNT the moment they disagreed. `is_saved`
    tells the page whether to open the setup step.
    """
    run = _load_owned_run(db, run_id, current_user)
    template = InterviewTemplateRepository(db).get_by_run_id(run.id)
    if template:
        return build_template_response(template)
    # Defaults built directly rather than via resolve_template_settings, which
    # would re-run the SELECT just missed above.
    return build_default_template_response(run.id, default_template_settings())


@runs_router.put(
    "/{run_id}/interview-template",
    response_model=InterviewTemplateResponse,
)
def save_owned_run_interview_template(
    run_id: UUID,
    payload: InterviewTemplateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewTemplateResponse:
    """Create or replace the run's interview template.

    Allowed while interviews from it are live: each one snapshotted its script
    and settings at approval, so this can only reach interviews drafted after
    it. No budget charge -- nothing here calls a model.
    """
    run = _load_owned_run(db, run_id, current_user)
    template = upsert_template(
        db,
        run,
        question_count=payload.question_count,
        followups_enabled=payload.followups_enabled,
        time_limit_seconds=payload.time_limit_seconds,
        opening=payload.opening,
        closing=payload.closing,
        fixed_questions=[
            FixedQuestion.model_validate(q.model_dump())
            for q in payload.fixed_questions
        ],
    )
    return build_template_response(template)


@runs_router.post(
    "/{run_id}/candidate/{candidate_id}/interview",
    response_model=InterviewSummaryResponse,
    status_code=201,
)
def create_owned_candidate_interview(
    run_id: UUID,
    candidate_id: UUID,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewSummaryResponse:
    """Draft an interview for a candidate in an owned run.

    Returns an unapproved draft with no invite link: a human reviews the
    questions and calls .../interview/approve to mint the token. Question
    generation runs synchronously, so expect a few seconds.

    Idempotent: returns the existing interview with 200 rather than creating a
    second one.
    """
    run = _load_owned_run(db, run_id, current_user)

    cost = interview_invite_cost()
    enforce_budget(cost)

    interview, created = create_interview_draft(db, run, candidate_id)
    if not created:
        # Idempotent hit: no script was generated, so the units go back.
        refund(cost)
        response.status_code = 200
    return build_summary_response(interview)


@runs_router.post(
    "/{run_id}/candidate/{candidate_id}/interview/question",
    response_model=QuestionOut,
)
def draft_owned_candidate_interview_question(
    run_id: UUID,
    candidate_id: UUID,
    payload: OneMoreQuestionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> QuestionOut:
    """Write one more question for a draft under review.

    Draft-only, and charged: this is a real generation call, unlike the rest of
    the review step. Returns the question alone without saving it -- the
    recruiter's unsaved edits live in the client, so it is persisted by the
    next PATCH along with everything else.
    """
    run = _load_owned_run(db, run_id, current_user)

    enforce_budget(interview_one_question_cost())

    question = draft_one_more_question(
        db, run, candidate_id, to_interview_questions(payload.questions)
    )
    return build_question_out(question)


@runs_router.patch(
    "/{run_id}/candidate/{candidate_id}/interview/draft",
    response_model=InterviewDetailResponse,
)
def update_owned_candidate_interview_draft(
    run_id: UUID,
    candidate_id: UUID,
    payload: DraftScriptUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewDetailResponse:
    """Save recruiter edits to a draft's questions.

    Draft-only: an approved script is frozen. No budget charge -- editing text
    calls no model.
    """
    run = _load_owned_run(db, run_id, current_user)
    script = InterviewScript(
        opening=payload.opening,
        questions=to_interview_questions(payload.questions),
        closing=payload.closing,
    )
    interview = update_interview_draft(
        db,
        run,
        candidate_id,
        script,
        payload.followups_enabled,
        payload.time_limit_seconds,
    )
    turns = InterviewRepository(db).get_turns(interview.id)
    return build_detail_response(interview, turns)


@runs_router.post(
    "/{run_id}/candidate/{candidate_id}/interview/approve",
    response_model=InterviewSummaryResponse,
)
def approve_owned_candidate_interview(
    run_id: UUID,
    candidate_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewSummaryResponse:
    """Approve a reviewed draft and mint its invite link.

    The human gate: before this call the interview has no token and cannot be
    opened. No budget charge -- generation was already paid for at draft time,
    and voice synthesis is queued to a worker.
    """
    run = _load_owned_run(db, run_id, current_user)
    interview = approve_interview(db, run, candidate_id)
    return build_summary_response(interview)


@runs_router.get(
    "/{run_id}/candidate/{candidate_id}/interview",
    response_model=InterviewDetailResponse,
)
def get_owned_candidate_interview(
    run_id: UUID,
    candidate_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewDetailResponse:
    """Recruiter view of an interview: transcript, rubric, and assessment."""
    run = _load_owned_run(db, run_id, current_user)
    interview = get_interview(db, run, candidate_id)
    turns = InterviewRepository(db).get_turns(interview.id)
    return build_detail_response(interview, turns)


@runs_router.post(
    "/{run_id}/candidate/{candidate_id}/interview/reissue",
    response_model=InterviewSummaryResponse,
)
def reissue_owned_candidate_interview(
    run_id: UUID,
    candidate_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewSummaryResponse:
    """Rotate the invite token and expiry. Never wipes a transcript."""
    run = _load_owned_run(db, run_id, current_user)
    interview = reissue_interview(db, run, candidate_id)
    return build_summary_response(interview)


@runs_router.post(
    "/{run_id}/candidate/{candidate_id}/interview/assess",
    response_model=InterviewDetailResponse,
)
def assess_owned_candidate_interview(
    run_id: UUID,
    candidate_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> InterviewDetailResponse:
    """Manually dispatch assessment: retry after a failure, or assess the
    partial transcript of an expired interview."""
    run = _load_owned_run(db, run_id, current_user)

    # This route re-dispatches on purpose, so repeat clicks each cost a real
    # assessment call. Cooldown plus budget, same pairing as retry.
    enforce_cooldown(f"assess:{run.id}:{candidate_id}", _ASSESS_COOLDOWN_MESSAGE)
    enforce_budget(COST_ASSESSMENT)

    interview = request_assessment(db, run, candidate_id)
    turns = InterviewRepository(db).get_turns(interview.id)
    return build_detail_response(interview, turns)


@runs_router.get("/{run_id}/candidate/{candidate_id}/interview/voice/{key}")
def get_owned_candidate_interview_voice(
    run_id: UUID,
    candidate_id: UUID,
    key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Response:
    """The interviewer's spoken question for one turn, for recruiter review.

    The recruiter twin of the candidate's /interviews/{token}/voice/{key}: same
    clips, same lazy synthesis, different door. A recruiter has no invite token,
    so this resolves the interview through run membership and the JWT instead.
    """
    run = _load_owned_run(db, run_id, current_user)
    try:
        content = get_owned_interview_voice(db, run, candidate_id, key)
    except SynthesisError as e:
        raise ServiceUnavailableError(
            "We couldn't load the audio for this question. Please try again."
        ) from e

    return Response(
        content=content, media_type=VOICE_MIME_TYPE, headers=voice_response_headers()
    )


@runs_router.get("/{run_id}/candidate/{candidate_id}/interview/audio/{seq}")
def get_owned_candidate_interview_audio(
    run_id: UUID,
    candidate_id: UUID,
    seq: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Response:
    """The recording behind one answer, so a recruiter can hear what a
    transcript flattens.

    Recruiter-only by construction. The candidate token surface does serve
    audio — the interviewer's synthesized questions, at
    GET /interviews/{token}/voice/{key} — but never this: a candidate's own
    recording is evidence collected about them, and the asymmetry is the point.

    The bytes are served directly rather than as a presigned URL — files are
    small, the storage facade returns bytes for both backends, and presigning
    would open a second auth path outside the JWT.
    """
    run = _load_owned_run(db, run_id, current_user)
    content, mime_type = get_turn_audio(db, run, candidate_id, seq)
    return Response(
        content=content,
        media_type=mime_type,
        # Immutable once written, and a recruiter replaying an answer shouldn't
        # refetch from S3 on every click.
        headers={"Cache-Control": "private, max-age=3600"},
    )


@dashboard_router.get("/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> DashboardStatsResponse:
    """Return aggregate stats for the current user's evaluation runs."""
    run_repo = EvaluationRunRepository(db)
    return DashboardStatsResponse(
        total_runs=run_repo.count_by_user(current_user.id),
        total_candidates=run_repo.sum_candidates_by_user(current_user.id),
        interviews_completed=run_repo.count_completed_interviews_by_user(
            current_user.id
        ),
        last_active=run_repo.last_active_by_user(current_user.id),
    )
