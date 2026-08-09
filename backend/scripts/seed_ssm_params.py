"""
One-time bootstrap: seed an env file into AWS SSM Parameter Store.

Reads a `.env`-style file and writes each `KEY=value` as a parameter under a
path prefix (default `/recruit-ai/prod/`), so `deploy/deploy.sh` can render
`.env.prod` from Parameter Store on every deploy instead of it being hand-edited
over SSH. See backend/deploy/README.md.

Run from a machine with `ssm:PutParameter` rights (NOT the read-only instance
role). Uses the free default `alias/aws/ssm` KMS key for SecureStrings.

Usage:
    uv run -m scripts.seed_ssm_params --file .env.prod                 # seed for real
    uv run -m scripts.seed_ssm_params --file .env.prod --dry-run       # print, don't write
    uv run -m scripts.seed_ssm_params --file .env.prod --prefix /recruit-ai/staging/
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
    "API_KEY",
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

    verb = "would seed" if args.dry_run else "seeded"
    print(f"==> Done: {verb} {count} parameters.")
    if not args.dry_run:
        print(
            "    Verify: aws ssm get-parameters-by-path --region "
            f"{args.region} --path {args.prefix} --recursive "
            "--with-decryption --query 'length(Parameters)'"
        )


if __name__ == "__main__":
    main()
