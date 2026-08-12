"""
One-time bootstrap: seed an env file into AWS SSM Parameter Store.

Reads a `.env`-style file and writes each `KEY=value` as a parameter under a
path prefix (default `/recruit-ai/prod/`), so `deploy/deploy.sh` can render
`.env.prod` from Parameter Store on every deploy instead of it being hand-edited
over SSH. See backend/deploy/README.md.

Run from a machine with `ssm:PutParameter` rights (NOT the read-only instance
role); `--prune` additionally needs `ssm:DeleteParameters`, likewise on the
operator credentials only. Uses the free default `alias/aws/ssm` KMS key for
SecureStrings.

Seeding is safe to re-run. `--prune` is the one destructive option: it deletes
parameters under the prefix that the env file no longer mentions, which is how
a var retired from the code stops reappearing in every rendered `.env.prod`.
It always prompts, and there is deliberately no flag to skip the prompt.

Usage:
    uv run -m scripts.seed_ssm_params --file .env.prod                 # seed for real
    uv run -m scripts.seed_ssm_params --file .env.prod --dry-run       # print, don't write
    uv run -m scripts.seed_ssm_params --file .env.prod --prefix /recruit-ai/staging/
    uv run -m scripts.seed_ssm_params --file .env.prod --dry-run --prune  # list orphans only
    uv run -m scripts.seed_ssm_params --file .env.prod --prune         # seed, then delete orphans
"""

import argparse
import sys

import boto3
from botocore.exceptions import BotoCoreError, ClientError

# Keys stored as SecureString (encrypted). Everything else goes in as String.
# Matches the sensitive vars in .env.prod / .env.example.
SECRET_KEYS = {
    "DATABASE_URL",
    "REDIS_URL",
    "GOOGLE_API_KEY",
    "GOOGLE_API_KEYS",
    "LANGSMITH_API_KEY",
    "MAIL_PASSWORD",
    "RESEND_API_KEY",
    "GOOGLE_CLIENT_SECRET",
    "SECRET_KEY",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
}


def parse_env_file(path: str) -> dict[str, str]:
    """Parse a .env-style file into an ordered dict of KEY -> value.

    Skips blank lines and comments, tolerates a leading `export`, splits on the
    first `=` only (so values may contain `=`), and strips one layer of matching
    surrounding quotes.
    """
    result: dict[str, str] = {}
    with open(path, encoding="utf-8") as f:
        for lineno, raw in enumerate(f, start=1):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("export "):
                line = line[len("export ") :].lstrip()
            if "=" not in line:
                print(f"  skipping line {lineno} (no '='): {line}", file=sys.stderr)
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            # Strip one layer of matching surrounding quotes.
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            if not key:
                print(f"  skipping line {lineno} (empty key)", file=sys.stderr)
                continue
            result[key] = value
    return result


def seed(
    env: dict[str, str],
    prefix: str,
    region: str,
    dry_run: bool,
) -> int:
    """Write each env var to SSM under `prefix`. Returns the number written."""
    if not prefix.endswith("/"):
        prefix += "/"

    client = boto3.client("ssm", region_name=region) if not dry_run else None
    written = 0

    for key, value in env.items():
        # SSM rejects empty values (min length 1). So, skip it.
        if value == "":
            print(f"  skipping {key} (empty value)", file=sys.stderr)
            continue

        param_type = "SecureString" if key in SECRET_KEYS else "String"
        name = f"{prefix}{key}"

        if client is None:  # dry run
            shown = "***" if param_type == "SecureString" else value
            print(f"  {name} ({param_type}) = {shown}")
            written += 1
            continue

        try:
            client.put_parameter(
                Name=name,
                Value=value,
                Type=param_type,
                Overwrite=True,
            )
        except (ClientError, BotoCoreError) as exc:
            print(f"  ERROR writing {name}: {exc}", file=sys.stderr)
            raise
        print(f"  seeded {name} ({param_type})")
        written += 1

    return written


# SSM caps DeleteParameters at 10 names per call.
DELETE_BATCH_SIZE = 10


def prune(
    env: dict[str, str],
    prefix: str,
    region: str,
    dry_run: bool,
) -> int:
    """Delete parameters under `prefix` that `env` no longer mentions.

    Returns the number deleted (or, under `dry_run`, the number that would be).
    Always prompts before deleting; a non-interactive stdin aborts rather than
    assuming yes.

    Unlike `seed()`, this builds an SSM client even under `--dry-run`: listing
    is read-only, and it is the whole point of `--dry-run --prune`. Only the
    delete call is gated on `dry_run`.
    """
    if not prefix.endswith("/"):
        prefix += "/"

    client = boto3.client("ssm", region_name=region)

    # Names only -- deliberately no WithDecryption. Computing a set difference
    # does not need the values, and decrypting would pull every secret into
    # this process for nothing.
    found: dict[str, str] = {}
    try:
        paginator = client.get_paginator("get_parameters_by_path")
        for page in paginator.paginate(Path=prefix, Recursive=True):
            for param in page["Parameters"]:
                found[param["Name"].rsplit("/", 1)[-1]] = param["Type"]
    except (ClientError, BotoCoreError) as exc:
        print(f"  ERROR listing parameters under {prefix}: {exc}", file=sys.stderr)
        raise

    # Compare against the parsed env keys, not against what seed() actually
    # wrote: seed() skips empty values, so a var that is present in the env
    # file but empty is absent from SSM yet must not count as an orphan.
    orphans = sorted(set(found) - set(env))
    if not orphans:
        print(f"==> No orphans: all {len(found)} parameters are in {prefix}")
        return 0

    print(f"==> {len(orphans)} orphan(s) under {prefix} not in the env file:")
    for key in orphans:
        # Names and types only, never values.
        print(f"  {prefix}{key} ({found[key]})")

    if dry_run:
        print("    (dry run: nothing deleted)")
        return len(orphans)

    if not sys.stdin.isatty():
        print(
            "    stdin is not a terminal; refusing to delete without confirmation.",
            file=sys.stderr,
        )
        return 0

    try:
        answer = input(
            f"Delete these {len(orphans)} parameters? Type 'yes' to confirm: "
        )
    except EOFError:
        answer = ""
    if answer.strip() != "yes":
        print("    aborted; nothing deleted.")
        return 0

    deleted = 0
    for start in range(0, len(orphans), DELETE_BATCH_SIZE):
        batch = orphans[start : start + DELETE_BATCH_SIZE]
        names = [f"{prefix}{key}" for key in batch]
        try:
            response = client.delete_parameters(Names=names)
        except (ClientError, BotoCoreError) as exc:
            print(f"  ERROR deleting {', '.join(names)}: {exc}", file=sys.stderr)
            raise
        for name in response.get("DeletedParameters", []):
            print(f"  pruned {name}")
            deleted += 1
        # Report rather than silently counting these as deleted.
        for name in response.get("InvalidParameters", []):
            print(f"  ERROR could not delete {name}", file=sys.stderr)

    return deleted


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed an env file into AWS SSM Parameter Store."
    )
    parser.add_argument(
        "--file",
        default=".env.prod",
        help="Path to the env file to read (default: .env.prod)",
    )
    parser.add_argument(
        "--prefix",
        default="/recruit-ai/prod/",
        help="SSM path prefix (default: /recruit-ai/prod/)",
    )
    parser.add_argument(
        "--region",
        default="ap-south-1",
        help="AWS region (default: ap-south-1)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would be written without calling AWS.",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help=(
            "After seeding, delete parameters under the prefix that the env "
            "file no longer mentions. Always prompts for confirmation. "
            "Combine with --dry-run to list orphans without deleting."
        ),
    )
    args = parser.parse_args()

    try:
        env = parse_env_file(args.file)
    except FileNotFoundError:
        print(f"env file not found: {args.file}", file=sys.stderr)
        sys.exit(1)

    if not env:
        print(f"No variables found in {args.file}; nothing to seed.", file=sys.stderr)
        sys.exit(1)

    mode = "DRY RUN" if args.dry_run else "writing"
    print(
        f"==> {mode}: {len(env)} vars from {args.file} -> {args.prefix} ({args.region})"
    )

    count = seed(env, args.prefix, args.region, args.dry_run)

    # Only after a clean seed -- a failed seed raises, so we never get here and
    # start deleting things based on a half-applied env file.
    pruned = 0
    if args.prune:
        pruned = prune(env, args.prefix, args.region, args.dry_run)

    verb = "would seed" if args.dry_run else "seeded"
    summary = f"{verb} {count} parameters"
    if args.prune:
        prune_verb = "would prune" if args.dry_run else "pruned"
        summary += f", {prune_verb} {pruned}"
    print(f"==> Done: {summary}.")
    if not args.dry_run:
        print(
            "    Verify: aws ssm get-parameters-by-path --region "
            f"{args.region} --path {args.prefix} --recursive "
            "--with-decryption --query 'length(Parameters)'"
        )


if __name__ == "__main__":
    main()
