from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.core import rate_limit
from app.models import (
    Candidate,
    CandidateEvaluation,
    EvaluationRun,
    EvaluationRunItem,
    Interview,
    InterviewTurn,
    Job,
    User,
)
from app.schemas.job_description import (
    JobDescriptionResponse,
    JobRequirementsSchema,
    SkillGroup,
    SkillRequirements,
)

# Planted in the interview rubric; seeing it in a candidate response is a leak.
RUBRIC_SENTINEL = "RUBRIC-SENTINEL"

PDF_BYTES = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': user.google_id})}"}


def budget_used() -> int:
    return rate_limit.global_usage()[0]


def pdf_files(n: int, prefix: str = "resume") -> list[tuple[str, Any]]:
    return [
        ("files", (f"{prefix}{i}.pdf", PDF_BYTES, "application/pdf")) for i in range(n)
    ]


def valid_jd() -> JobDescriptionResponse:
    return JobDescriptionResponse(
        is_job_description=True,
        job_title="Backend Engineer",
        requirements=JobRequirementsSchema(
            skills=SkillRequirements(
                critical=[SkillGroup(options=["Python"])], required=[], preferred=[]
            )
        ),
    )


def all_keys(data: Any) -> set[str]:
    if isinstance(data, dict):
        return set(data) | {k for v in data.values() for k in all_keys(v)}
    if isinstance(data, list):
        return {k for v in data for k in all_keys(v)}
    return set()


class Factory:
    def __init__(self, db: Session):
        self.db = db

    def _save(self, obj: Any) -> Any:
        self.db.add(obj)
        self.db.commit()
        self.db.refresh(obj)
        return obj

    def user(self, *, admin: bool = False, active: bool = True) -> User:
        uid = uuid4().hex[:8]
        return self._save(
            User(
                email=f"{uid}@example.com",
                google_id=f"google-{uid}",
                full_name="Test User",
                is_admin=admin,
                is_active=active,
            )
        )

    def run(
        self,
        *,
        user: User | None = None,
        status: str = "completed",
        total: int = 0,
        token: str | None = None,
    ) -> EvaluationRun:
        job = self._save(
            Job(raw_text="A job", title="Engineer", user_id=user and user.id)
        )
        if user is None and token is None:
            token = f"tok-{uuid4().hex}"
        return self._save(
            EvaluationRun(
                job_id=job.id,
                folder_path=f"resumes/{uuid4()}",
                status=status,
                user_id=user and user.id,
                access_token=token,
                total_count=total,
            )
        )

    def scored_candidate(
        self, run: EvaluationRun, *, status: str = "completed"
    ) -> tuple[Candidate, CandidateEvaluation, EvaluationRunItem]:
        candidate = self._save(Candidate(name="Ada", resume_markdown="# Ada"))
        evaluation = self._save(
            CandidateEvaluation(
                candidate_id=candidate.id,
                job_id=run.job_id,
                final_score=0.8,
                hire_signal="good_match",
            )
        )
        item = self._save(
            EvaluationRunItem(
                evaluation_run_id=run.id,
                pdf_filename=f"{uuid4().hex[:6]}.pdf",
                status=status,
                candidate_id=candidate.id,
                evaluation_id=evaluation.id,
            )
        )
        return candidate, evaluation, item

    def interview(
        self,
        evaluation: CandidateEvaluation,
        *,
        status: str = "created",
        mode: str = "text",
        expires_in: timedelta = timedelta(days=3),
    ) -> Interview:
        rubric = {"subject": RUBRIC_SENTINEL, "good_answer_covers": [RUBRIC_SENTINEL]}
        return self._save(
            Interview(
                evaluation_id=evaluation.id,
                access_token=f"itok-{uuid4().hex}",
                status=status,
                question_script={
                    "opening": "Hi",
                    "questions": [
                        {
                            "id": 0,
                            "text": "Tell me about X",
                            "focus": "experience_depth",
                            **rubric,
                        }
                    ],
                    "closing": "Bye",
                },
                grounding={"job_title": "Engineer", "notes": RUBRIC_SENTINEL},
                model_name="test",
                answer_mode=mode,
                expires_at=datetime.now() + expires_in,
                started_at=datetime.now() if status == "in_progress" else None,
            )
        )

    def turn(
        self, interview: Interview, seq: int, role: str, kind: str, **kw: Any
    ) -> InterviewTurn:
        turn = self._save(
            InterviewTurn(
                interview_id=interview.id,
                seq=seq,
                role=role,
                kind=kind,
                question_index=0,
                content=kw.pop("content", "text"),
                **kw,
            )
        )
        interview.last_seq = seq
        self.db.commit()
        return turn
