# Number of core questions per interview.
#
# DEVELOPMENT VALUE: 3, so a test interview is a couple of minutes rather than
# fifteen. The planned production value is 5-6 with a 4..8 validation bound;
# both are restored at M8.
QUESTION_COUNT = 3

# Accepted spread around QUESTION_COUNT when validating LLM output.
QUESTION_COUNT_TOLERANCE = 1

# At most one adaptive follow-up per core question, enforced in code via
# Interview.followup_asked — never by trusting the model.
MAX_FOLLOWUPS_PER_QUESTION = 1

# At most this many scorer-gap questions; the interview is JD- and
# resume-first, not a gap interrogation.
MAX_GAP_PROBES = 2

# Wall clock for a single interview. Enforced server-side on every answer:
# past this, the engine accepts the final answer, closes the interview, and
# assesses whatever transcript exists.
INTERVIEW_TIME_LIMIT_SECONDS = 15 * 60

# How long an invite link stays valid before the interview lazily flips to
# `expired`.
INTERVIEW_INVITE_TTL_DAYS = 7
