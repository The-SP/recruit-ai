# Question count and its validation tolerance are NOT here: they are
# env-driven via Config.INTERVIEW_QUESTION_COUNT and
# Config.INTERVIEW_QUESTION_COUNT_TOLERANCE, so a local checkout can run short
# test interviews while production asks the full 5-6. What IS here is the range
# a per-run template may override that default to (below).

# At most one adaptive follow-up per core question, enforced in code via
# Interview.followup_asked — never by trusting the model.
#
# Whether follow-ups happen *at all* is a per-template choice, snapshotted onto
# Interview.followups_enabled. This stays a constant so the cap can be raised
# later without that toggle having to become a count.
MAX_FOLLOWUPS_PER_QUESTION = 1

# Bounds on a template's question_count override. A product bound, not a
# deployment knob: unlike Config.INTERVIEW_QUESTION_COUNT, which is only the
# default a template starts from, dev and prod agree on these. Every question
# costs a generation slot, a TTS clip, a transcription and an assessment entry,
# so the ceiling is what stops one invite becoming unbounded spend.
MIN_QUESTIONS_PER_INTERVIEW = 1
MAX_QUESTIONS_PER_INTERVIEW = 8

# At most this many scorer-gap questions; the interview is JD- and
# resume-first, not a gap interrogation.
MAX_GAP_PROBES = 2

# Wall clock for a single interview. Enforced server-side on every answer:
# past this, the engine accepts the final answer, closes the interview, and
# assesses whatever transcript exists.
#
# The default a template starts from, and the fallback for interviews drafted
# before templates carried a limit. The live value is read from
# Interview.time_limit_seconds, snapshotted at approval.
INTERVIEW_TIME_LIMIT_SECONDS = 15 * 60

# What a template may set the limit to. A fixed set rather than a range,
# because the durations are coarse by nature and a free number invites both
# 3 minutes (too short to answer anything) and 90 (an unbounded transcription
# and assessment bill). The ceiling is deliberately modest for the same reason
# MAX_QUESTIONS_PER_INTERVIEW is: minutes of candidate talk are minutes of
# speech-to-text.
ALLOWED_TIME_LIMIT_SECONDS = (10 * 60, 15 * 60, 20 * 60, 30 * 60)

# How long an invite link stays valid before the interview lazily flips to
# `expired`.
INTERVIEW_INVITE_TTL_DAYS = 7

# Per-turn recording cap (audio mode). Questions are designed to be answerable
# verbally in 1-3 minutes (question_generator's prompt constraint); 3 minutes
# also bounds the transcript comfortably under the 5,000-char typed-answer cap
# (~150 wpm x 3 min ~ 450 words ~ 3,000 chars).
#
# No backend code reads this: measuring duration server-side would mean decoding
# audio, so the server bounds bytes instead (below) and the recorder auto-stops
# on time. It lives here because the duration is the product decision and the
# byte cap is derived from it; MAX_SECONDS in
# frontend/components/interview/recorder.tsx is the copy that enforces it.
MAX_ANSWER_AUDIO_SECONDS = 180

# Server-side byte cap for one uploaded answer. Opus at voice bitrates is ~1 MB
# for 3 minutes and AAC ~3 MB; 15 MB is generous headroom while staying under
# Gemini's ~20 MB inline-request limit and the 16 MB nginx client_max_body_size
# set at deploy.
MAX_ANSWER_AUDIO_BYTES = 15 * 1024 * 1024

# What MediaRecorder produces across current browsers: WebM/Opus on
# Chrome/Edge/Firefox, MP4/AAC on Safari. Matched as a prefix so the browser's
# ";codecs=..." suffix passes; a short allowlist, mirroring the PDF-only rule
# in core/file_upload.py.
#
# Paired with MIME_CANDIDATES in frontend/components/interview/recorder.tsx,
# which is what the browser actually offers to record in. Adding a format needs
# BOTH sides plus ANSWER_AUDIO_EXTENSIONS below: a recorder-only change makes
# every upload 400, a server-only change is dead config.
ALLOWED_ANSWER_AUDIO_MIME_TYPES = ("audio/webm", "audio/mp4")

# Extension for each allowed base MIME type, used to name the stored blob.
ANSWER_AUDIO_EXTENSIONS = {"audio/webm": "webm", "audio/mp4": "m4a"}
