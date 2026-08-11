# Recruit AI

Rank candidates, not résumés.

Upload a job description and a batch of resumes and get a ranked shortlist in minutes, scored across skills, experience, and education with evidence and reasoning for every candidate. Then invite your top candidates to an AI-run interview and read the transcript alongside a hiring recommendation.

## Features

- **Ranked shortlist in minutes** — resumes and the JD are parsed into structured data, then scored with a per-component breakdown (skills, experience, education) and a hire signal
- **Consistent, unbiased scoring** — the same weighted criteria applied to every candidate, evaluated in parallel with live progress and email notification
- **AI interviewer** — shortlisted candidates get an adaptive interview built from their resume and the JD, with follow-ups and gap probes; the recruiter gets back a transcript and a hiring recommendation
- **Spoken interviews** — candidates can answer by voice; answers are transcribed and scored like any other, with the original audio kept for the recruiter to replay
- **Try it without an account** — submit a batch anonymously and get results via a shareable link; sign in for saved history, comparison, CSV export, and interviews
- **Per-call cost accounting** — every LLM call is priced and metered against a global daily budget, so spend stays bounded and visible
- **Admin dashboard** — spend, run volume, and interview activity across the whole system in one view

## Tech Stack

| | |
|---|---|
| **Backend** | Python 3.13, FastAPI, SQLAlchemy, Alembic, Celery, LangChain |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| **Data** | PostgreSQL 16, Redis 7 |
| **Infrastructure** | Docker, AWS (EC2, RDS, S3), GitHub Actions |

## Getting Started

Setup instructions live in the subproject READMEs:

- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)
