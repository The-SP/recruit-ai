# Recruit AI

Rank candidates, not résumés.

Upload a job description and a batch of resumes and get a ranked shortlist in minutes, scored across skills, experience, and education with evidence and reasoning for every candidate. Then invite your top candidates to an AI-run interview and read the transcript alongside a hiring recommendation.

## Features

- **Ranked shortlist in minutes:** resumes and the JD are parsed into structured data, then scored with a per-component breakdown (skills, experience, education) and a hire signal
- **Consistent, criteria-based scoring:** the same weighted rubric applied to every candidate, evaluated in parallel with live progress and email notification
- **AI interviewer:** shortlisted candidates get an adaptive interview built from their resume and the JD, with follow-ups and gap probes; the recruiter gets back a transcript and a hiring recommendation
- **Human in the loop:** generated questions are reviewed and approved by the recruiter before any invite link exists, and a per-run template can fix question count, length, and hand-written questions
- **Voice interviews:** questions can be spoken aloud (text-to-speech) and candidates can answer by voice; answers are transcribed verbatim, with the original audio kept for the recruiter to replay
- **Try it without an account:** submit a batch anonymously and get results via a shareable link; sign in for saved history, comparison, CSV export, and interviews
- **Bounded LLM spend:** every LLM call is priced in units and metered against a global daily budget, with a circuit breaker for provider rate limits
- **Swappable models:** Gemini by default, or any OpenAI-compatible API for text calls, selected by model name
- **Admin dashboard:** spend, run volume, interview activity, and LLM token usage and cost (via LangSmith) across the whole system

## Tech Stack

| | |
|---|---|
| **Backend** | Python 3.13, FastAPI, SQLAlchemy, Alembic, Celery, LangChain |
| **AI** | Google Gemini (scoring, transcription, TTS), OpenAI-compatible APIs, LangSmith tracing |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui |
| **Data** | PostgreSQL 16, Redis 7 |
| **Quality** | pytest, Ruff, mypy (strict), ESLint, TypeScript strict, GitHub Actions CI |
| **Infrastructure** | Docker, AWS (EC2, RDS, S3, SSM Parameter Store), GitHub Actions |


## Getting Started

Setup instructions live in the subproject READMEs:

- [`backend/README.md`](backend/README.md)
- [`frontend/README.md`](frontend/README.md)
