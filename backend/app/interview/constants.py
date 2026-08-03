# Number of core questions per interview.
#
# DEVELOPMENT VALUE: 1, so a test interview takes seconds rather than
# minutes. The planned production value is 5-6 with a 4..8 validation bound;
# both are restored at M8.
QUESTION_COUNT = 1

# Accepted spread around QUESTION_COUNT when validating LLM output.
# DEVELOPMENT VALUE: 0, since QUESTION_COUNT=1 can't tolerate a -1 spread.
QUESTION_COUNT_TOLERANCE = 0

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
