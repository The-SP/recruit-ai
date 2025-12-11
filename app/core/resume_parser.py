import base64
from typing import Any

from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from app.config import Config
from app.core.logger import init_logger
from app.models.resume import ResumeResponse

logger = init_logger(__name__)

PROMPT = """You are a precise resume parser. Analyze the provided PDF document.

## Step 1: Document Classification

Determine if this is a resume/CV document.
- A resume/CV typically contains: personal information, work experience, education, skills, and contact details
- If this is NOT a resume/CV, set is_resume to false and provide a brief description in document_type (max 15 words)

## Step 2: If This IS a Resume

Extract the following:

### 1. Basic Metadata
- candidate_name: Full name of the candidate
- candidate_email: Email address if present

### 2. Markdown Content (Critical for Scoring)

Convert the ENTIRE resume to clean markdown format in the `markdown_content` field.

**Rules:**
- Preserve ALL text content - do not summarize or omit anything
- Use markdown formatting: ## for section headers, **bold** for emphasis, - for bullets
- Maintain the original section order as it appears in the resume
- Keep exact wording, dates, numbers, company names, titles
- Include all bullet points, descriptions, and details
- Preserve any metrics, achievements, or quantified results
- This should be a complete, readable representation of the resume

MARKDOWN CONTENT FORMAT:
```
# [Candidate Name]
[Contact details on one line]

## Summary/Objective
[If present]

## Experience
### [Job Title] | [Company] | [Dates]
- [Responsibility/achievement]
- [Responsibility/achievement]

## Education
### [Degree] | [Institution] | [Date]

## Skills
[Skills as listed]

## Projects
[If present]

[Continue for all sections present...]
```

Respond with valid JSON matching the ResumeResponse schema."""


def encode_pdf_to_base64(pdf_path: str) -> str:
    """Encode PDF file to base64"""
    try:
        with open(pdf_path, "rb") as pdf_file:
            return base64.b64encode(pdf_file.read()).decode("utf-8")
    except FileNotFoundError:
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")
    except Exception as e:
        raise IOError(f"Failed to read PDF file: {e}")


def parse_resume(pdf_path: str) -> ResumeResponse:
    """Parse a resume PDF and return markdown content for scoring"""
    pdf_base64 = encode_pdf_to_base64(pdf_path)

    agent = create_agent(
        model=Config.MODEL_NAME,
        system_prompt="You are a helpful assistant that analyzes documents and returns structured JSON data.",
        response_format=ToolStrategy(ResumeResponse),
    )

    messages: Any = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "media", "mime_type": "application/pdf", "data": pdf_base64},
            ],
        }
    ]

    result = agent.invoke({"messages": messages})
    response = result["structured_response"]

    if response.is_resume:
        name = (
            response.personal_information.name
            if response.personal_information
            else "Unknown"
        )
        markdown_chars = (
            len(response.markdown_content) if response.markdown_content else 0
        )
        logger.info(f"Parsed resume: name='{name}' | markdown={markdown_chars} chars")
    else:
        logger.warning(f"Document is not a resume - Type: {response.document_type}")

    return response
