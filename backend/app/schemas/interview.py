from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.interview.constants import INTERVIEW_TIME_LIMIT_SECONDS

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


# ---------------------------------------------------------------------------
# Rubric (read by the assessor; carried on templates and interviews)
# ---------------------------------------------------------------------------


class Competency(str, Enum):
    """The fixed axes every candidate is rated on. Fixed rather than derived
    from the JD so every candidate in a run is rated the same way; what a role
    expects of each lives in the level descriptions, not in more axes."""

    TECHNICAL_DEPTH = "technical_depth"
    OWNERSHIP_IMPACT = "ownership_impact"


class CompetencyLevels(BaseModel):
    """What levels 1, 3 and 5 look like for one competency. Levels 2 and 4 sit
    between them; the model places answers there."""

    model_config = ConfigDict(str_strip_whitespace=True)

    level_1: str = Field(min_length=1, max_length=500)
    level_3: str = Field(min_length=1, max_length=500)
    level_5: str = Field(min_length=1, max_length=500)


class LevelDescriptions(BaseModel):
    """Level descriptions for every competency. One field per Competency
    member, so a description can't exist for an axis that isn't rated."""

    technical_depth: CompetencyLevels
    ownership_impact: CompetencyLevels

    def for_competency(self, competency: Competency) -> CompetencyLevels:
        levels: CompetencyLevels = getattr(self, competency.value)
        return levels


class TemplateSettings(BaseModel):
    """Resolved template settings for one generation.

    A plain value object rather than the InterviewTemplate ORM row, so the
    generator has one input shape whether or not a template exists: the
    service builds this from the row, or from deployment defaults when there
    is none.
    """

    question_count: int
    followups_enabled: bool = True
    # Not used by generation -- the opening deliberately states no duration --
    # but carried here so the service has one settings object to snapshot onto
    # the interview at approval.
    time_limit_seconds: int = INTERVIEW_TIME_LIMIT_SECONDS
    opening: str | None = None
    closing: str | None = None
    fixed_questions: list[FixedQuestion] = Field(default_factory=list)
    # Not used by generation either; snapshotted onto the interview for the
    # assessor. None means the code defaults.
    level_descriptions: LevelDescriptions | None = None

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
# Assessment
# ---------------------------------------------------------------------------


class ResumeConsistency(str, Enum):
    SUPPORTED = "supported"  # the answer backs the resume claim it probes
    # The answer conflicts with the claim itself: a different role, smaller
    # scope, or different numbers. Never extra knowledge or a vague answer.
    CONTRADICTED = "contradicted"
    NOT_TESTED = "not_tested"  # not a resume-claim question, or not answered


class QuestionAssessment(BaseModel):
    """Findings for one core question. Deliberately carries no quality label:
    judgement lives on the competencies, which cite these entries. No answer
    quote either: the review page shows the real exchange beside each entry."""

    question_id: int
    focus: QuestionFocus
    subject: str
    # Notes before the consistency verdict: the model generates fields in order.
    notes: str = Field(description="One or two sentences a recruiter can act on")
    resume_consistency: ResumeConsistency
    resume_quote: str = Field(
        default="",
        description="Verbatim resume line the answer contradicts; empty unless contradicted",
    )


class CompetencyRating(BaseModel):
    """One competency rated across the whole interview."""

    name: Competency
    # Cited before the level so the model commits to evidence before it rates.
    seen_in: list[int] = Field(
        description="question_ids of every answer that moved this rating, up or down"
    )
    rationale: str = Field(
        description="Which answers raised the rating and which lowered it"
    )
    level: int | None = Field(
        default=None,
        ge=1,
        le=5,
        description="1-5 against the level descriptions; null when no answer is evidence",
    )


class AssessorOutput(BaseModel):
    """What the assessor model fills in. per_question comes before
    competencies so the per-answer notes are written before any rating."""

    per_question: list[QuestionAssessment]
    competencies: list[CompetencyRating]
    strengths: list[str]
    concerns: list[str]
    overall_summary: str = Field(
        description="Two or three sentences a recruiter reads first"
    )


Recommendation = Literal["advance", "borderline", "do_not_advance"]


class InterviewAssessment(AssessorOutput):
    """The stored verdict (JSONB on interviews): the model's output after the
    code-side repairs, plus the recommendation code derives from the levels.

    The key stays `recommendation` because the run table reads it straight out
    of the JSONB (EvaluationRunRepository).
    """

    recommendation: Recommendation
