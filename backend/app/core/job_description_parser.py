from typing import Any, cast

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.core.logger import init_logger
from app.core.model_factory import build_model
from app.schemas.job_description import JobDescriptionResponse

logger = init_logger(__name__)

PROMPT = """You are a structured data extractor for job postings.

FIRST: Determine whether this document is a job description — an open role being advertised to candidates.

A document IS a job description if it:
- Describes an open position a company is hiring for
- Uses applicant-directed language: "you will", "we're looking for", "the ideal candidate"
- Lists requirements or qualifications a candidate must or should have

If NOT a job description, set is_job_description to false and set document_type to
a short label describing what the document is (e.g., "resume", "cover letter", "news article").

IF THIS IS A JOB DESCRIPTION: Extract all information from the text. You MUST populate the `requirements` field — it is never null. Populate `requirements.skills`, `requirements.experience`, and `requirements.education` from the text, using null/empty only for sub-fields not mentioned.

---

GENERAL EXTRACTION RULES:

1. Extract ONLY information explicitly present in the text
2. Use EXACT wording from the text for extracted names, requirements, and responsibilities - do not rephrase or paraphrase. Use the schema's stated normalized values only where normalization is required.
3. If a section is not present, set it as null or empty array
4. Preserve all dates, numbers, and formatting exactly as shown
5. Do not add placeholder text, examples, or inferred information
6. Do not correct grammar, spelling, or formatting from the original
7. Do not expand abbreviations unless expanded in the text
8. Prefer an empty/null field over a plausible inference. Do not infer requirements from the job title, seniority, industry, common technology stacks, or what similar roles usually require.
9. A fact must be explicitly stated before it can affect a candidate's score. This applies especially to education, certifications, years, proficiency, and whether a skill is mandatory.

---

SKILL EXTRACTION GUIDELINES:

## 1. THREE-TIER CLASSIFICATION

Classify each skill into exactly one tier. Apply rules IN ORDER - first match wins.

CRITICAL (apply these checks FIRST):
A skill is CRITICAL if ANY of these are true:
- TITLE TEST: The exact skill (or an unambiguous direct variant) appears in the job title
  → "Python Developer" → Python is critical
  → "Data Analyst" → Data Analysis is critical
  → "AWS Cloud Engineer" → AWS is critical
- YEARS TEST: The skill has explicit year requirements attached to it
  → "3+ years of X" → X is critical
  → "X with 5 years experience" → X is critical
- LANGUAGE TEST: The skill has dealbreaker language directly attached
  → "must have X", "X is required", "X is essential", "X is mandatory"
  → "cannot be considered without X"

DEFAULT BIAS: When in doubt between critical and required, check the job title again. The primary skill of the role should almost always be critical.

REQUIRED (check these SECOND):
- Skills in requirements/qualifications sections without critical signals
- Skills stated as expectations
- Tech stack items cross-referenced in requirements

PREFERRED (check these LAST):
- Explicitly marked: "nice to have", "preferred", "bonus", "plus", "ideal"
- Softening language: "would be beneficial", "is an advantage"

## 2. GROUP ALTERNATIVE SKILLS

When multiple skills satisfy the SAME requirement (joined by "or", "/", "such as", "e.g."), group them into a single SkillGroup with all options listed. The candidate needs ANY ONE.
Separate skills joined by "and" or listed as independent requirements stay as separate groups.

## 3. INFER PROFICIENCY FROM LANGUAGE

Map qualifying language to proficiency levels:

EXPERT: "expert", "mastery", "deep expertise", "authority in", "extensive and deep"
ADVANCED: "strong", "advanced", "extensive experience", "highly proficient", "senior-level"
INTERMEDIATE: "proficient", "solid", "good knowledge", "working knowledge", "competent"
BEGINNER: "familiar", "basic", "exposure to", "awareness of", "foundational"
NULL: No qualifier is directly attached to that skill, or the text only says "experience with" - do not guess

Attach a proficiency only to the exact skill or explicitly shared alternative group qualified by the wording. Never spread a qualifier from one skill, sentence, or bullet to nearby skills. For example, "strong Python and experience with Django" gives Python advanced and Django null.

WHEN IN DOUBT: Leave proficiency as null. Only set it when the language CLEARLY and directly maps to a level.

---

EXPERIENCE REQUIREMENT EXTRACTION:

## Extract experience requirements:

1. **min_years**: Minimum years of experience required
   - "3+ years" → min_years: 3
   - "3-5 years" → min_years: 3
   - "at least 2 years" → min_years: 2
   - If not specified, set to null
   - Do not attach a role-wide years range to individual skills unless the text explicitly connects that range to those skills

2. **max_years**: Maximum years (if specified, often indicates seniority cap)
   - "3-5 years" → max_years: 5
   - Usually null unless explicitly stated

3. **level**: Seniority level of the role
   - Look for: Entry, Junior, Mid, Mid-Level, Senior, Lead, Principal, Staff
   - Can infer from title: "Senior Developer" → level: "Senior"
   - If ambiguous, set to null

4. **key_skills**: List of critical and required skill names only
   - Extract skill names from critical and required tiers
   - Just the names, no proficiency or years
   - Include only skills explicitly placed in critical or required; do not add inferred role skills
   - Example: ["Python", "FastAPI", "PostgreSQL", "Docker"]

5. **key_responsibilities**: Most essential job responsibilities (max 5)
   - Focus on core duties that define the role
   - Skip generic responsibilities like "attend meetings" or "collaborate with team" when the text contains more role-defining duties
   - Use only responsibilities stated in the document
   - Example: ["Design and build scalable APIs", "Optimize database performance", "Lead code reviews"]

---

EDUCATION REQUIREMENT EXTRACTION:

Only populate education fields when the document explicitly mentions a degree, education level, or field of study. If education is absent, set min_degree and preferred_fields to null and required to false. Never infer a degree from the role, seniority, company, or field.

1. **min_degree**: Minimum degree level
   - Normalize to: "bachelors", "masters", "phd"
   - "BS/BA/Bachelor's" → "bachelors"
   - "MS/MA/Master's" → "masters"
   - If not specified, set to null

2. **preferred_fields**: Fields of study mentioned
   - Extract from phrases like "degree in X, Y, or related field"
   - Example: "Bachelor's in Computer Science, Engineering or related" → ["Computer Science", "Engineering"]
   - If not specified, set to null

3. **required**: Is education a hard requirement?
   - true if the JD uses hard language: "must have a degree", "requires a degree", "minimum education", "BS/MS required"
   - false if it says "preferred", "a plus", "nice to have", or is silent on education
   - Default to false when ambiguous

---

FINAL SOURCE-GROUNDING AUDIT (complete this silently before responding):

- Remove any company, education, certification, skill, years, proficiency, responsibility, or requirement that is not supported by the source text.
- Set education to null when the source contains no education requirement. Do not return a default degree or empty education object.
- Set proficiency to null unless a qualifier directly modifies that exact skill or an explicitly shared alternative group.
- Treat location, work arrangement, employment type, and benefits as neither company names nor candidate requirements unless the source explicitly says so.

---
"""


def parse_job_description(text: str) -> JobDescriptionResponse:
    """Parse a job description from plain text and return structured data"""
    logger.info(f"Parsing job description ({len(text)} chars)")
    agent = create_agent(
        model=build_model(),
        system_prompt=PROMPT,
        response_format=ToolStrategy(JobDescriptionResponse),
    )

    messages: Any = [
        {
            "role": "user",
            "content": f"JOB DESCRIPTION:\n{text}",
        }
    ]

    result = agent.invoke({"messages": messages})
    response = result["structured_response"]

    if response.is_job_description:
        logger.info(f"Parsed job description - Title: {response.job_title}")
    else:
        logger.warning(
            f"Document is not a job description - Type: {response.document_type}"
        )

    return cast(JobDescriptionResponse, response)
