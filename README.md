# Recruit AI

AI resume screening platform that evaluates batches of resumes against a job description across skills, experience, and education, and ranks candidates with a detailed score breakdown.

## Features

- Upload a batch of PDF resumes and a job description, get back a ranked shortlist
- Resumes and job descriptions parsed into structured data by an LLM
- Weighted scoring across skills, experience, and education, with a hire signal and per-component reasoning for every candidate
- Resumes evaluated in parallel by Celery workers, with live progress and email notification on completion
- Add candidates to an existing run or retry only the ones that failed
- Google OAuth sign-in, run history dashboard, candidate comparison, and CSV export

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
