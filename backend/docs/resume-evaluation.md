# Resume Evaluation

How a PDF resume turns into a score against a job description. Candidates are scored
on three components — skills, experience, education — each producing a 0.0–1.0 score,
combined into a composite with weights that redistribute when a component is missing
from the JD.

Code: [`app/evaluation/`](../app/evaluation/), driven by [`app/worker/tasks.py`](../app/worker/tasks.py).

---

## 1. Pipeline

An evaluation run holds one job description and N resumes. `process_evaluation_run`
parses the JD once, then dispatches a Celery chord: one `evaluate_resume` task per
resume in parallel, with `finalize_evaluation_run` as the callback that sends the
result email.

Each `evaluate_resume` task:

1. `core/resume_parser.py` turns the PDF into markdown plus structured data via Gemini.
   A file that doesn't parse as a resume fails that item, not the run.
2. A `candidates` row is created from the parse.
3. `calculate_composite_score(jd, resume_markdown)` scores it.
4. The result is upserted into `candidate_evaluations` (unique on `candidate_id, job_id`,
   so re-evaluating overwrites).

Items fail independently — a timeout or LLM error marks that one item `failed` and the
run still completes with the rest. The circuit breaker short-circuits tasks while a
Gemini quota flag is set in Redis.

Up to three LLM calls per resume on top of the parse, all sequential within a task.
Resume-level parallelism comes from the chord, not from within a task.

---

## 2. Skill Scoring

`skill_scorer.py`

### Match types

The LLM evaluates each skill group and assigns one match type:

| Match Type | Score | Meaning |
|------------|-------|---------|
| `exact` | 1.0 | Skill explicitly present in the resume |
| `partial` | 0.65 | Related or equivalent skill (Django for FastAPI, React for Vue) |
| `none` | 0.0 | No evidence |

A skill group is a list of interchangeable options (`["Django", "FastAPI", "Flask"]`); the
candidate needs any one of them, and the best option in the group wins.

### Tier scores and weights

Each tier's score is the mean of its group scores. Base weights:

| Tier | Weight |
|------|--------|
| critical | 0.30 |
| required | 0.55 |
| preferred | 0.15 |

Only the tiers actually present in the JD are kept, then normalized to sum to 1.0. With
critical + required only: `0.30/0.85 = 0.353` and `0.55/0.85 = 0.647`.

```
base_score = W_critical × critical_score
           + W_required × required_score
           + W_preferred × preferred_score
```

If no skill tiers exist at all, `base_score = 1.0`.

### Critical gate

A critical group fails the gate when its match type is `none` (`exact` and `partial` both pass).

```
critical_penalty = 0.5 ^ critical_gaps        # 0 gaps → 1.0, 1 → 0.5, 2 → 0.25
skill_score      = base_score × critical_penalty
```

Critical skills count twice: once through their tier score, once through the gate. Note this
is a soft gate — one missing critical skill halves the score rather than zeroing it.

### Example

Critical: Python (`exact`). Required: FastAPI (`exact`), PostgreSQL (`partial`), Docker (`none`).
Preferred: AWS (`partial`), Kubernetes (`none`).

```
critical_score  = 1.0
required_score  = (1.0 + 0.65 + 0.0) / 3 = 0.55
preferred_score = (0.65 + 0.0) / 2       = 0.325

base_score  = 0.30 × 1.0 + 0.55 × 0.55 + 0.15 × 0.325 = 0.651
skill_score = 0.651 × 1.0 = 0.651
```

---

## 3. Experience Scoring

`experience_scorer.py`

### Relevance weights

The LLM rates each work-history entry and extracts `start_date` / `end_date` (`YYYY-MM`, null
for a current role).

| Relevance | Weight |
|-----------|--------|
| `high` | 1.0 |
| `medium` | 0.6 |
| `low` | 0.25 |
| `none` | 0.0 |

### Duration

Durations are computed in code, not by the LLM. Open-ended roles run to today.

**Overlapping roles are de-duplicated.** Intervals are sorted by start date descending and swept:
each role is truncated at the start of the next-most-recent one, so concurrent positions are
never double-counted and the more recent role wins the overlap. Entries with `none` relevance
still consume their span, so an irrelevant recent job blocks an older relevant one from being
counted over the same period.

```
effective_months = Σ (non_overlapping_months × relevance_weight)
experience_score = min(effective_months / 12 / required_years, 1.0)
```

Capped at 1.0 — no bonus for exceeding the requirement. If the JD specifies no minimum years,
the score is 1.0.

### Example

Requirement: 3 years.

| Role | Span | Relevance |
|------|------|-----------|
| Software Engineer | 19 months | high (1.0) |
| Junior Developer | 9 months | medium (0.6) |
| IT Support | 12 months | none (0.0) |

```
effective_months = 19 × 1.0 + 9 × 0.6 + 12 × 0.0 = 24.4
effective_years  = 2.03
experience_score = min(2.033 / 3.0, 1.0) = 0.678
```

---

## 4. Education Scoring

`education_scorer.py`

The LLM returns a holistic 0.0–1.0 score directly, using these bands:

| Score | Criteria |
|-------|----------|
| 0.9 – 1.0 | Meets/exceeds degree requirement, directly relevant field |
| 0.7 – 0.89 | Meets degree with related field, or exceeds with tangential field |
| 0.5 – 0.69 | Lower degree with relevant field, or degree met with unrelated field |
| 0.3 – 0.49 | Below requirement but has some formal education |
| 0.0 – 0.29 | No relevant education where education is required |

The prompt tells the model that in tech, field relevance matters more than degree level, and that
education is rarely a dealbreaker.

Two code-side rules:

- If the JD has neither `min_degree` nor `preferred_fields`, the score is 1.0 without an LLM call.
- If education is not required (nice-to-have), the score is floored at **0.4**.

---

## 5. Composite Scoring

`composite_scorer.py`

### Active components

A component is active only if the JD actually specifies it:

- **skills** — any critical, required, or preferred skill group
- **experience** — `min_years` is set
- **education** — `min_degree` is set

If none are active, `final_score` is null and the hire signal is `undetermined` — no fake score.

### Weights

| Component | Base Weight |
|-----------|-------------|
| skills | 0.45 |
| experience | 0.40 |
| education | 0.15 |

Inactive components drop out and the rest are normalized proportionally (rounded to 2 decimals,
with the last component absorbing the remainder so weights sum to exactly 1.0).

| Components Present | W_skills | W_experience | W_education |
|--------------------|----------|--------------|-------------|
| All three | 0.45 | 0.40 | 0.15 |
| Skills + Experience | 0.53 | 0.47 | — |
| Skills + Education | 0.75 | — | 0.25 |
| Experience + Education | — | 0.73 | 0.27 |
| Any one alone | 1.00 | 1.00 | 1.00 |

```
final_score = W_skills × skill_score
            + W_experience × experience_score
            + W_education × education_score
```

Rounded to 3 decimals.

### Hire signal

| Score | Signal |
|-------|--------|
| ≥ 0.85 | `strong_match` |
| 0.70 – 0.84 | `good_match` |
| 0.55 – 0.69 | `partial_match` |
| 0.40 – 0.54 | `weak_match` |
| < 0.40 | `no_match` |
| — | `undetermined` (no requirements in JD) |

### Example

All three components active, `skill_score = 0.72`, `experience_score = 0.68`,
`education_score = 0.85`:

```
final_score = 0.45 × 0.72 + 0.40 × 0.68 + 0.15 × 0.85
            = 0.324 + 0.272 + 0.1275
            = 0.724  →  good_match
```

The returned `CompositeScoreResult` carries the final score, per-component scores, the weights
actually used, and each scorer's full result object for the UI breakdown panel.

---

## Summary

```
skill_score      = (W_crit × crit_avg + W_req × req_avg + W_pref × pref_avg) × 0.5^critical_gaps
experience_score = min(Σ(non_overlapping_months × relevance) / (12 × required_years), 1.0)
education_score  = LLM holistic score, floored at 0.4 when education is optional

final_score = W_skills × skill_score + W_exp × experience_score + W_edu × education_score
```

Tier weights and component weights are both normalized over whatever is present, so each set
always sums to 1.0.

Two structural notes:

- Every scorer goes through `core/model_factory.build_model()` and uses LangChain `create_agent`
  with a `ToolStrategy` structured-output schema, so each returns a validated Pydantic object
  rather than free text.
- The LLM decides *matching* — does this resume show this skill, how relevant is this role. All
  arithmetic (weights, tier scores, the critical penalty, overlap handling, thresholds) is plain
  Python and deterministic.
