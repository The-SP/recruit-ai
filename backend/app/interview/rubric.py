"""The interview rubric: default level descriptions and the rule that turns
competency levels into a recommendation.

Pure code, no model. The assessor model reads and rates; this module decides,
so every candidate in a run is judged by the same rule and a threshold change
can be re-applied to stored assessments without another model call.
"""

from app.schemas.interview import (
    Competency,
    CompetencyLevels,
    LevelDescriptions,
    Recommendation,
)

# Generic on purpose: they apply to any role. A run's template may override
# them with role-specific wording (InterviewTemplate.level_descriptions), and
# each interview snapshots whichever set applied at approval.
DEFAULT_LEVEL_DESCRIPTIONS = LevelDescriptions(
    technical_depth=CompetencyLevels(
        level_1="Names tools or concepts but cannot explain how or why they were used.",
        level_3=(
            "Explains what they built and the main choices behind it, but gets "
            "thin when pushed past the first layer."
        ),
        level_5=(
            "Explains trade-offs and alternatives, reasons from evidence when "
            "debugging, and holds up under follow-up questions."
        ),
    ),
    ownership_impact=CompetencyLevels(
        level_1="Describes team work with no clear personal part in it.",
        level_3="Has a clear personal part in the work, but states results loosely.",
        level_5="Drove the work themselves and gives measured outcomes.",
    ),
)

COMPETENCY_LABELS = {
    Competency.TECHNICAL_DEPTH: "Technical depth",
    Competency.OWNERSHIP_IMPACT: "Ownership & impact",
}

# Technical depth is a gate, the same way critical skills gate the resume
# skill score: no amount of ownership advances a candidate who can't explain
# their own work. Rules rather than an average, because with two competencies
# an average lets a 5 hide a 1.
REJECT_AT_OR_BELOW_TECHNICAL = 2
REJECT_AT_OR_BELOW_ANY = 1
ADVANCE_AT_OR_ABOVE_TECHNICAL = 4
ADVANCE_AT_OR_ABOVE_OWNERSHIP = 3


def derive_recommendation(
    levels: dict[Competency, int | None], has_contradiction: bool
) -> Recommendation:
    """Map competency levels to a recommendation; the first rule that matches wins.

    A level of None ("not enough evidence") can never reject or advance, so a
    partial transcript lands on borderline, matching the assessor's long-standing
    rule. A contradicted resume claim caps the result at borderline but never
    pushes it lower: one mismatch earns a human look, not a rejection.
    """
    technical = levels.get(Competency.TECHNICAL_DEPTH)
    ownership = levels.get(Competency.OWNERSHIP_IMPACT)
    rated = [level for level in levels.values() if level is not None]

    if (technical is not None and technical <= REJECT_AT_OR_BELOW_TECHNICAL) or any(
        level <= REJECT_AT_OR_BELOW_ANY for level in rated
    ):
        return "do_not_advance"

    if (
        technical is not None
        and technical >= ADVANCE_AT_OR_ABOVE_TECHNICAL
        and ownership is not None
        and ownership >= ADVANCE_AT_OR_ABOVE_OWNERSHIP
        and not has_contradiction
    ):
        return "advance"

    return "borderline"


def explain_recommendation(
    levels: dict[Competency, int | None], has_contradiction: bool
) -> list[str]:
    """Why derive_recommendation landed where it did, one short line per reason.

    Walks the same rules in the same order, so the explanation can't drift from
    the decision. Computed at read time rather than stored, so assessments made
    before this existed are explained too.
    """
    technical = levels.get(Competency.TECHNICAL_DEPTH)
    ownership = levels.get(Competency.OWNERSHIP_IMPACT)
    technical_label = COMPETENCY_LABELS[Competency.TECHNICAL_DEPTH]
    ownership_label = COMPETENCY_LABELS[Competency.OWNERSHIP_IMPACT]

    if technical is not None and technical <= REJECT_AT_OR_BELOW_TECHNICAL:
        return [
            f"{technical_label} is {technical}/5. "
            f"{REJECT_AT_OR_BELOW_TECHNICAL} or lower means do not advance."
        ]
    lowest = [
        COMPETENCY_LABELS[competency]
        for competency, level in levels.items()
        if level is not None and level <= REJECT_AT_OR_BELOW_ANY
    ]
    if lowest:
        return [
            f"{name} is {REJECT_AT_OR_BELOW_ANY}/5. Any competency at "
            f"{REJECT_AT_OR_BELOW_ANY} means do not advance."
            for name in lowest
        ]

    if derive_recommendation(levels, has_contradiction) == "advance":
        return [
            f"{technical_label} is {ADVANCE_AT_OR_ABOVE_TECHNICAL}+ and "
            f"{ownership_label.lower()} is {ADVANCE_AT_OR_ABOVE_OWNERSHIP}+, "
            "with no resume contradiction."
        ]

    # Borderline: name every advance condition that wasn't met.
    reasons = []
    for label, level, needed in (
        (technical_label, technical, ADVANCE_AT_OR_ABOVE_TECHNICAL),
        (ownership_label, ownership, ADVANCE_AT_OR_ABOVE_OWNERSHIP),
    ):
        if level is None:
            reasons.append(f"{label} wasn't rated: not enough evidence.")
        elif level < needed:
            reasons.append(f"{label} is {level}/5. It needs {needed} to advance.")
    if has_contradiction:
        reasons.append("An answer contradicts the resume, which caps at borderline.")
    return reasons
