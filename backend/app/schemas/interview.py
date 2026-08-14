from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Question generation
# ---------------------------------------------------------------------------


class QuestionFocus(str, Enum):
    """What a question is for. The mix is a prompt constraint (see the
    generator); only the gap_probe cap is validated in code."""

    EXPERIENCE_DEPTH = "experience_depth"  # dig into a claimed project/role
    ROLE_COMPETENCY = "role_competency"  # JD requirement or scenario
    GAP_PROBE = "gap_probe"  # scorer-flagged gap (0-2 per script)


class InterviewQuestion(BaseModel):
    """One core question, frozen into the script at invite time."""

    id: int = Field(description="0-based stable index of this question")
    text: str = Field(description="Exactly what the interviewer says")
    focus: QuestionFocus
    subject: str = Field(
        description="The JD requirement or resume claim being probed (recruiter-visible only)"
    )


class InterviewScript(BaseModel):
    """The full pre-generated backbone of an interview."""

    opening: str = Field(description="Greeting turn shown before the first question")
    questions: list[InterviewQuestion]
    closing: str = Field(description="Closing turn for normal completion")


class FixedQuestion(BaseModel):
    """A question the recruiter wrote, asked verbatim of every candidate.

    Carries focus and subject like any generated question because the assessor
    grades against both -- a fixed question missing its subject would leave the
    model inventing a rubric for it.
    """

    text: str
    focus: QuestionFocus
    subject: str


class TemplateSettings(BaseModel):
    """Resolved template settings for one generation.

    A plain value object rather than the InterviewTemplate ORM row, so the
    generator has one input shape whether or not a template exists: the
    service builds this from the row, or from deployment defaults when there
    is none.
    """

    question_count: int
    followups_enabled: bool = True
    opening: str | None = None
    closing: str | None = None
    fixed_questions: list[FixedQuestion] = Field(default_factory=list)

    @property
    def generated_count(self) -> int:
        """How many questions the model must write. Fixed questions count
        toward the total, so a template whose fixed questions fill it needs no
        generation at all."""
        return max(0, self.question_count - len(self.fixed_questions))


class FollowupDecision(BaseModel):
    """Whether to ask one adaptive follow-up after a candidate's answer.

    The engine enforces the <=1-per-question cap via Interview.followup_asked
    regardless of what the model returns here.
    """

    ask_followup: bool
    followup_question: str | None = Field(
        default=None, description="Required when ask_followup is true"
    )
    reason: str = Field(description="Why the follow-up is or isn't warranted (audit)")


# ---------------------------------------------------------------------------
# Assessment (populated at M5; full target shape defined now so it is settled)
# ---------------------------------------------------------------------------


class AnswerQuality(str, Enum):
    STRONG = "strong"
    ADEQUATE = "adequate"
    WEAK = "weak"
    NOT_ANSWERED = "not_answered"  # evaded, refused, or ran out of time


class ResumeConsistency(str, Enum):
    CONSISTENT = "consistent"  # answer supports the resume's claims
    INCONSISTENT = "inconsistent"  # answer conflicts with a resume claim
    NOT_APPLICABLE = "not_applicable"


class QuestionAssessment(BaseModel):
    question_id: int
    focus: QuestionFocus
    subject: str
    answer_quality: AnswerQuality
    resume_consistency: ResumeConsistency
    evidence: str = Field(description="Quote from the transcript")
    notes: str


class InterviewAssessment(BaseModel):
    """Verdict over the full transcript. Stored as JSONB on interviews."""

    per_question: list[QuestionAssessment]
    competency_summary: str = Field(
        description="How the candidate measures against the JD's core requirements"
    )
    strengths: list[str]
    concerns: list[str]
    gap_findings: str | None = Field(
        default=None, description="What gap probes showed, when any were asked"
    )
    overall_summary: str
    recommendation: Literal["advance", "borderline", "do_not_advance"]
