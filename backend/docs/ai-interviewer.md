# AI Interviewer

An AI-run interview a recruiter attaches to a scored candidate. Questions are
generated from the resume and the job description, **reviewed and approved by
a human**, and only then does the candidate get an unguessable invite link, no
account required; the recruiter reads a transcript and an AI assessment
afterward. Text and voice are both supported, configured per deployment.

## Lifecycle

A recruiter creates an interview from an existing evaluation run
(`interview/service.py`) — this requires login; the anonymous batch flow
cannot create interviews (see below). The interview snapshots its question
script, answer mode, voice mode, follow-up setting, and time limit, and never
rereads config afterward.

States: `draft` → `created` → `in_progress` → `completed` → `assessed`, with
`expired` if the invite sits unopened past its TTL. The candidate opens the
link at `/interview?token=` (frontend) against `api/routes/interview.py`
(backend), answers each question in turn, and on completion the transcript is
handed to `interview/assessor.py` for a post-interview assessment the
recruiter reads alongside the candidate's score.

- **A human approves every interview before a candidate can reach it.**
  Generation produces a `draft`, and approval is what mints the invite. See
  [The review gate](#the-review-gate).
- **Expiry is lazy** — nothing runs on a timer; a request just notices the
  invite is overdue and writes `expired` at that point, both for a single
  interview and in bulk for a run. `draft` is deliberately absent from
  `OVERDUE_STATUSES`: expiry bounds an invite, and a draft has none.
- **Re-assessment is a manual fallback.** If auto-assessment never ran or
  failed, a recruiter can trigger it again from `completed` or an
  `expired`-with-answers interview; it's safe to call repeatedly since it
  no-ops once the interview is already `assessed`.
- **Creation is idempotent** — there's one interview per evaluation, and
  creating again just returns the existing draft untouched, without
  regenerating. A race between two concurrent creates is resolved by
  recovering from the resulting `IntegrityError`, not by locking.
- **Reissue is restricted.** A recruiter can reissue an invite from
  `created`, or from `expired` if the candidate never answered anything — a
  reissue never wipes an existing transcript. Reissuing a `draft` is rejected:
  there is no invite to rotate until it is approved.

## The review gate

Generated questions used to go straight onto a live invite link with no human
having read them, leaving the protected-characteristics rule in
`GENERATION_PROMPT` as the model policing itself. Creation is now split into
**draft → review → approve**.

- A draft has **no `access_token` at all** (the column is nullable). That is
  the gate: with no token there is nothing for `get_by_token` to match, so a
  draft is unreachable by a candidate without any route having to exclude it.
  `_token_match` returns SQL `false` for a `None` token rather than compiling
  to `IS NULL`, which would otherwise match every draft in the table.
- `POST .../interview` generates and returns a draft — `invite_url` and
  `access_token` are null in the response, which is the API-level expression
  of the gate.
- `PATCH .../interview/draft` saves the recruiter's edited opening, questions,
  and closing, plus `followups_enabled` and `time_limit_seconds`. Question ids
  are renumbered server-side so deletions can't leave gaps. Those two settings
  are editable here — and the question count and fixed questions are not —
  because generation already consumed the latter, while the former are read by
  the engine at run time and so can still change without contradicting the
  script on screen. They write to the interview row, never back to the
  template, so approval still hands over exactly the draft that was reviewed.
- `POST .../interview/approve` mints the token, sets the expiry, stamps
  `approved_at`, and **only then** dispatches voice synthesis — previously
  scripts were synthesized at creation, paying for audio of text the recruiter
  might still rewrite.
- `POST .../interview/question` writes **one** additional question grounded in
  the resume, given the questions currently on the recruiter's screen so the
  model can avoid repeating them. It returns the question **without saving
  it**: the draft may hold unsaved edits, so it is persisted by the next
  PATCH like a hand-written one. This is the only endpoint in the review step
  that calls a model, and the only one that charges budget after creation.

Approved is final: the script is frozen once a link exists, so the editor is
replaced by the invite link and there is nothing left to review.

## The interview template

A per-run template (`models/interview_template.py`, keyed on
`evaluation_run_id`) fixes the structural decisions once instead of per
candidate: question count, follow-ups on/off, interview length, opening and
closing copy, and fixed questions asked verbatim of every candidate.

- **Editable at any time, including while interviews from it are live.**
  Fairness comes from the per-interview snapshot, not from locking the
  template: each interview captures what it needs, so an edit only ever
  reaches interviews drafted afterward. What a template equalizes is
  structure, not wording — the questions were always generated per resume.
- **`GET /{run_id}/interview-template` always returns a body, never 404.**
  When nothing is saved it returns the defaults generation *would* use, with
  `is_saved: false`, so the client never has to invent a question count the
  server would disagree with. It also carries `allowed_time_limits` so the
  duration picker can't offer a value the service would reject.
- **Fixed questions count toward the total**, because one costs the same TTS,
  transcription, and assessment entry as a generated one. A template whose
  fixed questions fill the interview skips the model entirely — a fully
  hand-written interview is a legitimate, free mode.
- `opening`/`closing` are nullable; NULL means "let the model write it", which
  keeps the template skippable.

## The engine and the voice seam

`interview/engine.py` runs the interview as a turn loop and speaks only typed
`EngineEvent`s — it has no notion of audio, HTTP, or SSE. Text is the
substrate; voice is layered on both sides without touching the engine:

- **Answers**: an audio submission is transcribed by `transcriber.py` before
  reaching the engine, so `engine.submit_answer` sees text either way.
- **Questions**: `speaker.py` synthesizes speech for what the engine already
  wrote; the engine never knows whether anyone is listening.

- Each interview snapshots `answer_mode`, `voice_mode`, `followups_enabled`,
  and `time_limit_seconds`, so neither a config change nor a template edit
  ever silently alters an interview already in flight. The engine and
  `state.py` read the row, never the module constant.
- Answering a question holds a row lock across the whole reaction — including
  the follow-up decision, a separate structured LLM call — so the turn
  commits atomically. A client that submits against a stale `after_seq` gets
  a 409 rather than a silently-applied out-of-order answer.
- If the follow-up decision call fails or comes back empty, the engine just
  skips the follow-up rather than failing the interview.
- If the wall-clock time limit is hit while an answer is in flight, the
  engine still accepts that final answer, then closes with a
  time-limit-prefixed variant of the normal closing rather than cutting the
  candidate off mid-turn.

## Question flow

`question_generator.py` produces a `question_script` (opening, core questions,
closing) at draft time, grounded in the job description and the candidate's
resume — probing claimed experience and role competencies, not just
scorer-flagged gaps. The script is editable until approval and frozen after
it. Beyond the script, the engine allows:

- At most one adaptive follow-up per core question, and only when the
  interview's `followups_enabled` snapshot permits them at all.
- Up to two questions probing scorer-flagged gaps.

All core questions come from **one** LLM call, not one call per question; a
second call happens only when the first output fails count or gap-probe
validation. Fixed questions reduce what the model is asked for and are
appended after the generated ones, so a template that fills the interview
costs nothing.

**The opening deliberately states no duration.** It is frozen into
`question_script` while the time limit is not, so a number there would outlive
any change to the limit. The candidate learns the length from the consent
screen and the live countdown, both served from server state.

`MAX_FOLLOWUPS_PER_QUESTION`, `MAX_GAP_PROBES`, `MIN`/`MAX_QUESTIONS_PER_INTERVIEW`,
`ALLOWED_TIME_LIMIT_SECONDS`, and the invite TTL are constants in
`interview/constants.py`, not env vars — deliberately, so they can't be tuned
per deployment. They are product bounds; what a recruiter picks *within* them
lives on the template.

## SSE protocol

The candidate page talks to `api/routes/interview.py` over an SSE stream with
four frame types:

- `ack` — the just-committed turn, echoed back. Needed so a spoken answer's
  transcript can be rendered, since the client never authored the text
  itself.
- `turn` — the interviewer's next turn.
- `state` — lifecycle transitions like completion.
- `error`

Typed and audio answers share one internal stream function; validation runs
once up front (so a bad request gets a real HTTP status) and again under the
row lock (so the SSE-visible outcome can never disagree with it).

Reconnection has no special-cased protocol: `GET /interviews/{token}` returns
current state as the source of truth, and the client just re-opens SSE for
whatever happens next — a hard refresh or dropped connection loses nothing.
An audio answer is persisted under its *next* sequence number before
streaming starts, so retrying a failed submission simply overwrites the same
file rather than accumulating orphaned recordings.

## Speech

**Answers (speech-to-text).** `transcriber.py` transcribes with a mandatory
verbatim-transcription prompt, using the same `INTERVIEW_MODEL_NAME` model as
question generation, the turn engine, and assessment (default
`gemini-3.5-flash-lite`) — there's no separate STT-specific model setting.

- Without the verbatim prompt, the model paraphrases into fluent but false
  text instead of transcribing; verbatim mode catches that failure mode at
  the cost of occasionally mishearing rare technical terms (see
  Limitations).
- The recorder (`recorder.tsx`) auto-stops at 180 seconds with a 30-second
  warning countdown, and handles mic-permission-denied and
  unsupported-browser states.
- A failed upload retries by resending the exact same blob rather than
  re-recording.

**Questions (text-to-speech).** `speaker.py` synthesizes speech using
`INTERVIEW_TTS_MODEL_NAME` (default `gemini-2.5-flash-preview-tts`).

- Only the opening and the core questions are precomputed at invite
  creation — closings and follow-ups are always synthesized lazily.
  Closings can't be precomputed because there are two different closing
  texts (normal completion vs. time-limit cutoff) and which one plays isn't
  known until the interview actually ends; follow-ups don't exist as text
  until the engine decides to ask one.
- All synthesized audio is served through a single token-gated endpoint,
  `GET /interviews/{token}/voice/{key}`, which resolves the key against the
  interview's real turns/script — an unknown key 404s rather than
  triggering synthesis, the abuse bound on an otherwise unauthenticated
  surface.
- Recorded candidate answers and synthesized interviewer speech both live
  under `interviews/{interview_id}/` in the storage façade
  (`core/file_storage.py`).

**Frontend playback** (`use-interview-voice.ts`):

- Reuses a single `<audio>` element for the whole interview rather than
  creating one per turn, because browser autoplay permission is granted
  per-element on a user gesture — a fresh element per turn would be blocked
  from the second question onward.
- A silent clip is played synchronously inside the Start button's click
  handler to "prime" that element before any question arrives.
- Turns play from a strict sequential queue so two questions can never
  overlap; muting drops the queued backlog rather than deferring it, and a
  mute toggled during a cache-miss fetch is re-checked once the fetch
  resolves.
- Every interviewer turn also has a manual replay button, independent of
  autoplay.

## What the candidate never sees

`question_script`, `grounding`, and a question's `subject`/`good_answer_covers`
are the rubric the assessor and recruiter use. None of it ever crosses to the
candidate-facing API or UI.

## Recruiter-facing surface

Recruiter endpoints live in `api/routes/user_runs.py`, thin wrappers over the
same `interview/service.py` the candidate routes use, gated by JWT and by
run ownership (not by any notion of `user_id` inside the interview code
itself). From there a recruiter can:

- Set the run's template, from the review flow's first step or standalone at
  `/evaluation/[id]/interview-template`.
- Review a draft: read every question, edit its wording, delete one, write a
  new one, or ask the model for one more — then approve, which is what mints
  the link.
- Read the transcript and assessment.
- Replay a candidate's recorded answers and interviewer TTS clips
  (synthesizing on demand if a clip hasn't been requested yet).
- Copy or reissue the invite link.
- Open the candidate's resume in a side panel without leaving the interview
  view.

Once an assessment exists, the raw transcript is demoted into a collapsible
section — the assessment is the primary view, not the transcript.

The assessment itself is structured, not a single blob of text:

- Per-question `answer_quality`, `resume_consistency`, `evidence`, and
  `notes`.
- An overall `competency_summary`, `strengths`, `concerns`, and optional
  `gap_findings`.
- An `overall_summary` and an `advance` / `borderline` / `do_not_advance`
  recommendation.

If assessment generation fails, the interview stores an `assessment_error`
and the recruiter UI shows a retry button rather than leaving the run stuck.

## Configuration

| Variable | Controls | Typical dev / prod |
| --- | --- | --- |
| `INTERVIEW_MODE` | `text` or `audio` answers | `text` locally (no mic needed), `audio` in production |
| `INTERVIEW_VOICE` | `on`/`off` — whether questions are spoken. Defaults to `off` even when `INTERVIEW_MODE=audio`; an unrecognized value for either setting degrades silently to the safe default rather than failing invite creation | `off` locally, `on` in production |
| `INTERVIEW_QUESTION_COUNT` / `INTERVIEW_QUESTION_COUNT_TOLERANCE` | The **default** question count for a run with no saved template, and the tolerance its generated output is validated against. A template overrides the count, bounded by `MIN`/`MAX_QUESTIONS_PER_INTERVIEW` | Code default `1`/`0` for fast local test interviews, full 5-6 in production |
| `INTERVIEW_MODEL_NAME` | Model used for question generation, the turn engine, transcription, and assessment (there's no separate STT model setting) | — |
| `INTERVIEW_TTS_MODEL_NAME` | Model used for speech synthesis | — |
| `INTERVIEW_GOOGLE_API_KEY` | API key(s) for interview LLM calls | — |

**Interview length is not an env var.** It is a per-run template setting
chosen from `ALLOWED_TIME_LIMIT_SECONDS` (10/15/20/30 minutes), defaulting to
`INTERVIEW_TIME_LIMIT_SECONDS`. A fixed set rather than a free number, because
the durations are coarse and an open range invites both 3 minutes (too short
to answer anything) and 90 (an unbounded transcription and assessment bill).
The same reasoning caps questions at 8: minutes of candidate talk are minutes
of speech-to-text.

A deploy renders config from SSM Parameter Store, not from the repo — a new
or changed variable must be seeded with `make seed-ssm` or production keeps
running the code default silently.

## Known limitations

- Verbatim transcription is reliable on ordinary speech but can mis-hear rare
  technical tokens (e.g. `nginx`, `JSONB`), sometimes rendering a plausible
  but wrong word with no signal anything was lost. The stored recording is the
  recruiter's recourse; this is intentionally not patched with
  post-processing or a bigger model. Because verbatim transcription also
  preserves filler words and false starts, the assessor is explicitly told
  not to penalize disfluencies — a normal side effect of asking for verbatim
  text, not a scoring bug.
- Audio answers are capped at 180 seconds and 15 MB, restricted to
  `audio/webm` and `audio/mp4`. Duration isn't verified server-side — only
  the recorder enforces the 180s cutoff, and the backend checks byte size.
- There is no TTS voice selection — the synthesis provider doesn't expose it
  through the client library in use.
- The anonymous, token-based batch flow cannot create interviews. This is
  deliberate: each interview spends model quota with no account behind it to
  attribute or throttle against. Interviews are correspondingly absent from
  demo mode entirely — there are no interview fixtures.
