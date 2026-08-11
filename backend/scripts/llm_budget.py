"""
Utility script to inspect the LLM rate limiter.

Usage:
    uv run -m scripts.llm_budget status    # today's global budget
    uv run -m scripts.llm_budget reset     # clear today's global counter
    uv run -m scripts.llm_budget keys      # every active rate limit key
    uv run -m scripts.llm_budget clear [KEY]      # release a stuck cooldown

This is the only override. There is deliberately no HTTP endpoint for it: an
authenticated "reset my own limit" route is just a rate limiter with extra
steps, and an unauthenticated one is no rate limiter at all.

Distinct from scripts/circuit_breaker.py on purpose: the circuit breaker is
reactive (Gemini already returned a 429) and latches until manually reset, while
this budget is proactive (our own ceiling) and self-heals at UTC midnight.
"""

import sys

from app.config import Config
from app.core.rate_limit import clear, global_usage, peek, reset_global


def check_status():
    """Show today's global LLM budget usage."""
    used, limit = global_usage()
    pct = (used / limit * 100) if limit else 0
    state = "EXHAUSTED" if used >= limit else "OK"

    print(f"""LLM daily budget: {state}
  Used:  {used} / {limit} units ({pct:.1f}%)
  Mode:  RATE_LIMIT_ENABLED={Config.RATE_LIMIT_ENABLED}

  Resets automatically at UTC midnight.
  To clear it early: make budget-reset""")


def reset_budget():
    """Clear today's global counter."""
    if reset_global():
        print("""✓ Global LLM budget RESET
  Today's counter is back to zero.""")
    else:
        print("ℹ️  No usage recorded today; nothing to reset.")


def show_keys():
    """List every active rate limit key: the daily budget plus any cooldowns."""
    rows = peek()
    if not rows:
        print("No active rate limit keys.")
        return

    width = max(len(key) for key, _, _ in rows)
    print(f"{'KEY'.ljust(width)}  {'USED':>6}  {'TTL':>7}")
    for key, used, ttl in rows:
        ttl_text = f"{ttl}s" if ttl >= 0 else "none"
        print(f"{key.ljust(width)}  {used:>6}  {ttl_text:>7}")


def clear_keys(key=None):
    """Release a stuck cooldown, or all of them."""
    removed = clear(key)

    if key:
        if removed:
            print(f"✓ Cleared rl:{key}")
        else:
            print(f"""ℹ️  No key matched rl:{key}
  Run `make rate-limit-status` to see the exact key names.""")
        return

    print(f"""✓ Cleared {removed} cooldown(s)

  Today's budget was NOT touched -- use `make budget-reset` for that.""")


def main():
    if len(sys.argv) < 2:
        print("""Usage:
  uv run -m scripts.llm_budget status          # Today's global LLM budget
  uv run -m scripts.llm_budget reset           # Clear today's global counter
  uv run -m scripts.llm_budget keys            # Every active rate limit key
  uv run -m scripts.llm_budget clear           # Release ALL cooldowns
  uv run -m scripts.llm_budget clear <KEY>     # Release one

There is a single global budget, so there is nothing per-caller to clear.
KEY is a cooldown, WITHOUT the "rl:" prefix:
  retry:<run-id>                   a stuck retry cooldown
  assess:<run-id>:<candidate-id>   a stuck assessment cooldown""")
        sys.exit(1)

    command = sys.argv[1]

    if command == "status":
        check_status()
    elif command == "reset":
        reset_budget()
    elif command == "keys":
        show_keys()
    elif command == "clear":
        clear_keys(sys.argv[2] if len(sys.argv) > 2 else None)
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
