from typing import Any

import pytest

from app.evaluation import (
    composite_scorer,
    education_scorer,
    experience_scorer,
    skill_scorer,
)
from app.schemas.composite_evaluation import HireSignal
from app.schemas.education_evaluation import EducationScoreResult
from app.schemas.experience_evaluation import ExperienceEvaluation, ExperienceRelevance
from app.schemas.job_description import (
    EducationRequirement,
    JobDescriptionResponse,
    JobRequirementsSchema,
    SkillGroup,
    SkillRequirements,
)
from app.schemas.skill_evaluation import (
    LLMEvaluationResponse,
    MatchType,
    SkillGroupEvaluation,
)


def _llm_returns(monkeypatch: pytest.MonkeyPatch, module: Any, result: Any) -> None:
    monkeypatch.setattr(module, "invoke_structured", lambda *a, **k: result)


def _eval(tier: str, match: MatchType) -> SkillGroupEvaluation:
    return SkillGroupEvaluation(
        skill_options=[f"{tier}-skill"],
        tier=tier,  # type: ignore[arg-type]
        match_type=match,
        evidence="",
        reasoning="",
    )


def _groups(n: int, tier: str) -> list[SkillGroup]:
    return [SkillGroup(options=[f"{tier}-skill"]) for _ in range(n)]


@pytest.mark.parametrize(
    ("active", "expected"),
    [
        (
            ["skills", "experience", "education"],
            {"skills": 0.45, "experience": 0.40, "education": 0.15},
        ),
        (["skills"], {"skills": 1.0, "experience": 0.0, "education": 0.0}),
        (
            ["skills", "experience"],
            {"skills": 0.53, "experience": 0.47, "education": 0.0},
        ),
    ],
)
def test_weights_redistribute_over_active_components(
    active: list[str], expected: dict[str, float]
) -> None:
    weights = composite_scorer._redistribute_weights(active)
    assert weights == expected
    assert sum(weights.values()) == pytest.approx(1.0)


@pytest.mark.parametrize(
    ("score", "signal"),
    [
        (0.85, HireSignal.STRONG_MATCH),
        (0.849, HireSignal.GOOD_MATCH),
        (0.70, HireSignal.GOOD_MATCH),
        (0.55, HireSignal.PARTIAL_MATCH),
        (0.40, HireSignal.WEAK_MATCH),
        (0.399, HireSignal.NO_MATCH),
    ],
)
def test_hire_signal_thresholds(score: float, signal: HireSignal) -> None:
    assert composite_scorer._determine_hire_signal(score) == signal


def test_job_without_requirements_is_undetermined_and_calls_no_model() -> None:
    jd = JobDescriptionResponse(
        is_job_description=True,
        requirements=JobRequirementsSchema(
            skills=SkillRequirements(critical=[], required=[], preferred=[])
        ),
    )
    result = composite_scorer.calculate_composite_score(jd, "# resume")
    assert result.hire_signal == HireSignal.UNDETERMINED
    assert result.final_score is None


def test_missing_critical_skill_halves_the_score(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reqs = SkillRequirements(
        critical=_groups(1, "critical"), required=_groups(1, "required"), preferred=[]
    )
    _llm_returns(
        monkeypatch,
        skill_scorer,
        LLMEvaluationResponse(
            evaluations=[
                _eval("critical", MatchType.NONE),
                _eval("required", MatchType.EXACT),
            ],
            strengths=[],
        ),
    )

    result = skill_scorer.calculate_skill_score(reqs, "# resume")

    # Critical/Required renormalized to 0.30/0.85 and 0.55/0.85, then gated.
    assert result.critical_penalty == 0.5
    assert len(result.critical_gaps) == 1
    assert result.final_score == pytest.approx(0.55 / 0.85 * 0.5, abs=1e-3)


def test_tiers_renormalize_when_job_has_no_critical_skills(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    reqs = SkillRequirements(
        critical=[], required=_groups(1, "required"), preferred=_groups(1, "preferred")
    )
    _llm_returns(
        monkeypatch,
        skill_scorer,
        LLMEvaluationResponse(
            evaluations=[
                _eval("required", MatchType.PARTIAL),
                _eval("preferred", MatchType.NONE),
            ],
            strengths=[],
        ),
    )

    result = skill_scorer.calculate_skill_score(reqs, "# resume")

    assert result.critical_penalty == 1.0
    assert result.final_score == pytest.approx(0.55 / 0.70 * 0.65, abs=1e-3)


@pytest.mark.parametrize(("required", "expected"), [(False, 0.4), (True, 0.1)])
def test_optional_education_has_a_score_floor(
    monkeypatch: pytest.MonkeyPatch, required: bool, expected: float
) -> None:
    _llm_returns(
        monkeypatch,
        education_scorer,
        EducationScoreResult(score=0.1, summary=""),
    )
    req = EducationRequirement(min_degree="Bachelor", required=required)
    assert education_scorer.calculate_education_score(req, "# resume").score == expected


def test_no_education_requirement_scores_full_without_a_model_call() -> None:
    result = education_scorer.calculate_education_score(
        EducationRequirement(), "# resume"
    )
    assert result.score == 1.0


def _role(start: str, end: str, relevance: ExperienceRelevance) -> ExperienceEvaluation:
    return ExperienceEvaluation(
        job_title="Engineer",
        start_date=start,
        end_date=end,
        relevance=relevance,
        evidence="",
    )


def test_overlapping_roles_are_not_double_counted() -> None:
    months, overlap = experience_scorer._calculate_effective_months(
        [
            _role("2020-01", "2022-01", ExperienceRelevance.HIGH),
            _role("2021-01", "2023-01", ExperienceRelevance.HIGH),
        ]
    )
    # 2020-01..2023-01 is 36 calendar months, not 24 + 24.
    assert months == 36
    assert overlap is True


def test_relevance_weights_scale_months() -> None:
    months, _ = experience_scorer._calculate_effective_months(
        [_role("2020-01", "2021-01", ExperienceRelevance.MEDIUM)]
    )
    assert months == pytest.approx(12 * 0.6)
