"""
Utility script to manage the rate limit circuit breaker.

Usage:
    uv run -m scripts.circuit_breaker status
    uv run -m scripts.circuit_breaker reset
"""

import sys

from redis import Redis

from app.config import Config
from app.worker.circuit_breaker import CIRCUIT_BREAKER_KEY

redis_client = Redis.from_url(Config.REDIS_URL)


def check_status():
    """Check if circuit breaker is active"""
    is_active = redis_client.get(CIRCUIT_BREAKER_KEY)

    if is_active:
        print("""🚨 Circuit breaker is ACTIVE
   All evaluation tasks are blocked
   Reason: Daily API quota likely exhausted

   To resume:
   1. Wait for quota to reset (usually 24 hours)
   2. Run: make circuit-reset""")
    else:
        print("""✓ Circuit breaker is INACTIVE
  All tasks can proceed normally""")


def reset_circuit_breaker():
    """Manually reset the circuit breaker"""
    result = redis_client.delete(CIRCUIT_BREAKER_KEY)

    if result:
        print("""✓ Circuit breaker RESET successfully
  Tasks can now proceed

  ⚠️  Make sure your API quota has reset before running new batches""")
    else:
        print("ℹ️  Circuit breaker was not active")


def main():
    if len(sys.argv) < 2:
        print("""Usage:
  uv run -m scripts.circuit_breaker status   # Check circuit breaker status
  uv run -m scripts.circuit_breaker reset    # Manually reset circuit breaker""")
        sys.exit(1)

    command = sys.argv[1]

    if command == "status":
        check_status()
    elif command == "reset":
        reset_circuit_breaker()
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
