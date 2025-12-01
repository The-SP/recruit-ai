from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.models.job_description import JobDescriptionResponse

logger = init_logger(__name__)

PROMPT = """You are a precise job description parser. Analyze the provided text.

FIRST: Determine if this is a job description/posting.
- A job description typically contains: job title, responsibilities, requirements, qualifications
- If this is NOT a job description, set is_job_description to false and provide a brief description in document_type (max 15 words)

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

KEYWORD EXTRACTION:
- Extract 10-20 key terms that best represent the role for matching purposes
- Include: role-specific terminology, tools, methodologies, domain terms, certifications
- Exclude: generic soft skills unless specifically emphasized for this role

---

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
