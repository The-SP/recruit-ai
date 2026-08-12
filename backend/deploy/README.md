# Deploy

Production deploy infrastructure for the recruit-ai backend. The app runs as
Docker Compose services on a single EC2 host, behind nginx, with PostgreSQL on
RDS and config in AWS SSM Parameter Store.

## Files

| File | Purpose |
| --- | --- |
| `deploy.sh` | The deploy itself: render config, build, migrate, swap containers. Runs on the EC2 host. |
| `render-env.sh` | Renders `.env.prod` from SSM Parameter Store. Called by `deploy.sh`; also runnable standalone for a config-only refresh. |
| `nginx/recruitai.conf` | Reference copy of the nginx reverse-proxy vhost for `api.recruitai.qzz.io`. |

Related, outside this directory:

- `../docker-compose.prod.yml` — the production stack (`api`, `worker`, `redis`, plus a one-shot `migrate` service).
- `../scripts/seed_ssm_params.py` — one-time bootstrap that pushes an env file into Parameter Store.
- `../../.github/workflows/deploy.yml` — the **Deploy to EC2** workflow that invokes `deploy.sh` remotely.

## How a deploy runs

1. The **Deploy to EC2** GitHub Actions workflow is triggered manually
   (Actions tab, or `gh workflow run deploy.yml -f ref=main`).
2. It assumes an AWS role via OIDC and sends an SSM `AWS-RunShellScript`
   command to the instance. Nothing opens an SSH port.
3. On the host, the command updates the git checkout to the requested ref and
   then executes `deploy/deploy.sh <ref>`. The git update happens in the
   workflow rather than in the script, so a change to `deploy.sh` takes effect
   on the same deploy that ships it.
4. `deploy.sh` renders `.env.prod` from SSM, builds images, runs
   `alembic upgrade head` via the one-shot `migrate` service, then brings the
   stack up with `--wait` so it returns only once healthchecks pass. A build or
   migration failure aborts before the swap, leaving the old stack serving.
5. The workflow polls the SSM invocation to completion, echoes the remote
   stdout/stderr into the job log, and finally probes
   `https://api.recruitai.qzz.io/health`.

## Configuration

There is no `.env.prod` in git. It is regenerated on every deploy from the SSM
parameters under `/recruit-ai/prod/` (region `ap-south-1`), one parameter per
env var, secrets stored as `SecureString`. Changing production config means
updating the parameter, not editing a file on the host:

```bash
aws ssm put-parameter --region ap-south-1 \
  --name /recruit-ai/prod/GOOGLE_API_KEY --type SecureString \
  --value '<new-value>' --overwrite
```

Then either run a deploy, or refresh config only on the host:

```bash
cd ~/recruit-ai/backend
./deploy/render-env.sh
docker compose -f docker-compose.prod.yml up -d
```

`render-env.sh` writes atomically and refuses to overwrite a working
`.env.prod` with an empty render, which is what a wrong prefix or a broken IAM
policy looks like.

### Retiring a variable

`render-env.sh` renders whatever is under the prefix, with no allowlist, so
removing a var from the code does **not** remove it from Parameter Store: it
keeps landing in every rendered `.env.prod`. `make seed-ssm-prune` lists the
leftovers; `seed_ssm_params.py --prune` deletes them, interactively.

## Manual deploy on the host

`deploy.sh` does not update the checkout, so check out the ref yourself:

```bash
cd ~/recruit-ai/backend
git fetch --all --prune && git checkout main && git pull --ff-only origin main
./deploy/deploy.sh main
```

## TLS and nginx

nginx runs on the host (not in Compose) and proxies `:443` to the API on
`127.0.0.1:8000`. `nginx/recruitai.conf` is the pre-TLS HTTP version of that
vhost; certbot rewrites the live file in place to add the HTTPS server block
and the HTTP -> HTTPS redirect. Copying this file over the live config after
certbot has run will drop the TLS config; re-run certbot if that happens.

**No script ever copies this file to the host.** `deploy.sh` does not touch
nginx and neither does the GitHub Actions workflow, so a change here does not
ship with a deploy — it is applied by hand:

```bash
sudo $EDITOR /etc/nginx/sites-available/recruitai.conf   # confirm the path first
# make the same change inside the 443 server block certbot added
sudo nginx -t && sudo systemctl reload nginx
```

The live file has two server blocks after certbot; per-location settings
(`proxy_buffering off`, `client_max_body_size`) belong in the **443** one.

## Notes

- Deploys are serialized by a `deploy-production` concurrency group, so two
  production deploys never overlap.
- The API publishes only to `127.0.0.1:8000`, so it is reachable exclusively
  through nginx.
- The host's instance role only needs read access to the SSM parameters.
  Seeding them requires `ssm:PutParameter` (and `ssm:DeleteParameters` to
  prune) and is done from a separate machine via `scripts/seed_ssm_params.py`.
- Uploaded resumes live in the `uploads_data` Docker volume, shared by `api`
  and `worker`; it survives container replacement.
