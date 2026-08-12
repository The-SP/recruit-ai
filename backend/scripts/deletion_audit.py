"""
Utility script to read the deletion audit log.

Usage:
    uv run -m scripts.deletion_audit list [LIMIT]   # most recent deletions
    uv run -m scripts.deletion_audit run RUN_ID     # one run's full history
    uv run -m scripts.deletion_audit show AUDIT_ID  # full JSON snapshot

Read-only by design, and deliberately not an HTTP endpoint. The audit exists
because deletion is irreversible and cascades far past the row the user
clicked; exposing it over the API would mean a compromised admin JWT could read
(or, one refactor later, prune) the record of its own actions. SSH plus psql is
the gate, the same argument scripts/llm_budget.py makes for the budget.

There is no delete/prune command here at all: an audit log you can erase from
the tool that reads it is not an audit log.
"""

import json
import sys
from contextlib import closing
from uuid import UUID

from app.models.database import create_session
from app.repositories.deletion_audit_repository import DeletionAuditRepository


def _fmt(audit) -> str:  # type: ignore[no-untyped-def]
    when = audit.created_at.strftime("%Y-%m-%d %H:%M:%S")
    who = audit.actor_email or "(account deleted)"
    d = audit.details or {}
    if audit.target_type == "run":
        what = (
            f"run '{d.get('job_title') or 'Untitled'}' "
            f"({d.get('candidate_count', 0)} candidates, "
            f"{d.get('interview_count', 0)} interviews)"
        )
    else:
        what = f"candidate '{d.get('candidate_name') or d.get('filename')}'"
    return (
        f"{when}  {who:<32}  deleted {what}\n{'':22}audit={audit.id} run={audit.run_id}"
    )


def cmd_list(limit: int = 50) -> None:
    with closing(create_session()) as db:
        rows = DeletionAuditRepository(db).list_recent(limit)
        if not rows:
            print("No deletions recorded.")
            return
        print(f"{len(rows)} most recent deletion(s):\n")
        for audit in rows:
            print(_fmt(audit))
            print()


def cmd_run(run_id: str) -> None:
    with closing(create_session()) as db:
        rows = DeletionAuditRepository(db).list_for_run(UUID(run_id))
        if not rows:
            print(f"No deletions recorded for run {run_id}.")
            return
        print(f"History for run {run_id} (oldest first):\n")
        for audit in rows:
            print(_fmt(audit))
            print()


def cmd_show(audit_id: str) -> None:
    from app.models.deletion_audit import DeletionAudit

    with closing(create_session()) as db:
        audit = db.get(DeletionAudit, UUID(audit_id))
        if not audit:
            print(f"No audit row {audit_id}.")
            return
        print(
            json.dumps(
                {
                    "id": str(audit.id),
                    "target_type": audit.target_type,
                    "target_id": str(audit.target_id),
                    "run_id": str(audit.run_id),
                    "actor_email": audit.actor_email,
                    "actor_user_id": str(audit.actor_user_id)
                    if audit.actor_user_id
                    else None,
                    "created_at": audit.created_at.isoformat(),
                    "details": audit.details,
                },
                indent=2,
            )
        )


def main() -> None:
    args = sys.argv[1:]
    command = args[0] if args else "list"

    if command == "list":
        cmd_list(int(args[1]) if len(args) > 1 else 50)
    elif command == "run" and len(args) > 1:
        cmd_run(args[1])
    elif command == "show" and len(args) > 1:
        cmd_show(args[1])
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
