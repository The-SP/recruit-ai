from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.models.job_description import JobDescriptionResponse

PROMPT = """You are a precise job description parser. Analyze the provided text.

FIRST: Determine if this is a job description/posting.
- A job description typically contains: job title, responsibilities, requirements, qualifications
- If this is NOT a job description, set is_job_description to false and provide a brief description in document_type (max 15 words)

IF THIS IS A JOB DESCRIPTION: Extract all information from the text.

CRITICAL RULES:
1. Extract ONLY information that is explicitly present in the text
2. Do NOT infer, assume, or add any information that is not directly stated
3. Do NOT rephrase or paraphrase - use the EXACT wording from the text
4. If a section is not present, set it as null or empty array
5. Preserve all dates, numbers, and formatting exactly as shown
6. Do not add placeholder text or examples
7. If you cannot find specific information, leave that field as null
8. Do not correct grammar, spelling, or formatting from the original
9. Do not expand abbreviations unless they are expanded in the text

SKILL EXTRACTION GUIDELINES:
- Mark skills as required (is_required=true) if they appear in "Required", "Must have", or "Requirements" sections
- Mark skills as preferred (is_required=false) if they appear in "Nice to have", "Preferred", or "Bonus" sections
- Extract proficiency levels if explicitly mentioned (e.g., "Expert in Python", "Intermediate SQL")
- Extract years of experience per skill if specified (e.g., "5+ years of Java")

KEYWORD EXTRACTION:
- Extract 10-20 key terms that best represent the role for matching purposes
- Include: job-specific terms, technologies, methodologies, domain expertise areas

YOU MUST respond with valid JSON matching the JobDescriptionResponse schema."""


def parse_job_description(text: str) -> JobDescriptionResponse:
    """Parse a job description from plain text and return structured data"""
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
    return result["structured_response"]
