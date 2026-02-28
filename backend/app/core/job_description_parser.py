from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
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

IF THIS IS A JOB DESCRIPTION: Extract all information from the text.

---

GENERAL EXTRACTION RULES:

1. Extract ONLY information explicitly present in the text
2. Use EXACT wording from the text - do not rephrase or paraphrase
3. If a section is not present, set it as null or empty array
4. Preserve all dates, numbers, and formatting exactly as shown
5. Do not add placeholder text, examples, or inferred information
6. Do not correct grammar, spelling, or formatting from the original
7. Do not expand abbreviations unless expanded in the text

---

SKILL EXTRACTION GUIDELINES:

## 1. THREE-TIER CLASSIFICATION

Classify each skill into exactly one tier. Apply rules IN ORDER - first match wins.

CRITICAL (apply these checks FIRST):
A skill is CRITICAL if ANY of these are true:
- TITLE TEST: The skill (or its direct variant) appears in the job title
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

When multiple skills can satisfy the SAME requirement, group them as alternatives with an options array. The candidate needs ANY ONE, not all.

DETECT ALTERNATIVES BY:
- Explicit "or": "X, Y, or Z" → options: [X, Y, Z]
- Slash notation: "X/Y" → options: [X, Y]
- Parenthetical lists: "X (such as Y, Z)" → options: [Y, Z]
- "such as", "like", "e.g.": "X such as Y or Z" → options: [Y, Z]
- Semicolon-separated alternatives: "X; Y; or Z" → options: [X, Y, Z]

WHEN NOT TO GROUP:
- Skills listed with "and" → separate requirements, not alternatives
- Skills in different sentences → likely separate requirements
- Skills with different proficiency levels → separate requirements

## 3. ELIMINATE REDUNDANT SKILLS

Apply the SPECIFICITY RULE: If a specific skill implies a general category, keep ONLY the specific skill.

DETECT REDUNDANCY BY:
- Parent-child relationships (specific tool vs general category)
- Skill that is a prerequisite of another listed skill
- Category name alongside specific instances of that category

DO NOT list both the general category AND specific instances.

## 4. INFER PROFICIENCY FROM LANGUAGE

Map qualifying language to proficiency levels:

EXPERT: "expert", "mastery", "deep expertise", "authority in", "extensive and deep"
ADVANCED: "strong", "advanced", "extensive experience", "highly proficient", "senior-level"
INTERMEDIATE: "proficient", "solid", "good knowledge", "working knowledge", "competent"
BEGINNER: "familiar", "basic", "exposure to", "awareness of", "foundational"
NULL: No qualifier present, or just "experience with" - do not guess

WHEN IN DOUBT: Leave proficiency as null. Only set it when the language CLEARLY maps to a level.

## 5. EXTRACT EXPERIENCE REQUIREMENTS

SKILL-SPECIFIC YEARS: Only when years are explicitly tied to a skill
- "5+ years of X" → attach years_of_experience: 5 to that skill
- "X with 3 years experience" → attach years_of_experience: 3 to that skill

GENERAL YEARS: Overall experience requirements go in the experience section, not on skills

## 6. HANDLE AMBIGUOUS SECTIONS

TECH STACK / TOOLS / TECHNOLOGIES sections without context:
- If skill also appears in Requirements → do not duplicate
- If skill only in Tech Stack → classify as required (assumed expected)

RESPONSIBILITIES section mentioning skills:
- Extract skills mentioned but classify based on context
- "You will use X" suggests required
- "Opportunity to learn X" suggests preferred

---

EXPERIENCE REQUIREMENT EXTRACTION:

## Extract experience requirements:

1. **min_years**: Minimum years of experience required
   - "3+ years" → min_years: 3
   - "3-5 years" → min_years: 3
   - "at least 2 years" → min_years: 2
   - If not specified, set to null

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
   - Example: ["Python", "FastAPI", "PostgreSQL", "Docker"]

5. **key_responsibilities**: Most essential job responsibilities (max 5)
   - Focus on core duties that define the role
   - Skip generic responsibilities like "attend meetings" or "collaborate with team"
   - Example: ["Design and build scalable APIs", "Optimize database performance", "Lead code reviews"]

---

EDUCATION REQUIREMENT EXTRACTION:

1. **min_degree**: Minimum degree level
   - Normalize to: "associates", "bachelors", "masters", "phd"
   - "BS/BA/Bachelor's" → "bachelors"
   - "MS/MA/Master's" → "masters"
   - If not specified, set to null

2. **preferred_fields**: Fields of study mentioned
   - Extract from phrases like "degree in X, Y, or related field"
   - Example: "Bachelor's in Computer Science, Engineering or related" → ["Computer Science", "Engineering"]
   - If not specified, set to null

3. **required**: Is education a hard requirement?

---

YOU MUST respond with valid JSON matching the JobDescriptionResponse schema."""


def parse_job_description(text: str) -> JobDescriptionResponse:
    """Parse a job description from plain text and return structured data"""
    logger.info(f"Parsing job description ({len(text)} chars)")
    agent = create_agent(
        model=Config.MODEL_NAME,
        system_prompt="You are a helpful assistant that analyzes job descriptions and returns structured JSON data.",
        response_format=ToolStrategy(JobDescriptionResponse),
    )

    messages: Any = [
        {
            "role": "user",
            "content": f"{PROMPT}\n\n---\n\nJOB DESCRIPTION:\n{text}",
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

    return response
