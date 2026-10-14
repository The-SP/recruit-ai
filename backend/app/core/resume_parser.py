import base64
import logging
from typing import Any

from app.core.file_storage import get_file_content
from app.core.model_factory import invoke_structured
from app.schemas.resume import ResumeResponse

logger = logging.getLogger(__name__)

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


def encode_pdf_to_base64(file_path: str) -> str:
    """Encode PDF file to base64 using storage backend"""
    try:
        content = get_file_content(file_path)
        return base64.b64encode(content).decode("utf-8")
    except Exception as e:
        raise IOError(f"Failed to read PDF file from storage: {e}")


def parse_resume(file_path: str) -> ResumeResponse:
    """Parse a resume PDF and return markdown content for scoring"""
    pdf_base64 = encode_pdf_to_base64(file_path)

    messages: list[Any] = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                # LangChain's standard file block, so the PDF reaches either
                # provider; Gemini's own "media" block does not translate.
                {
                    "type": "file",
                    "base64": pdf_base64,
                    "mime_type": "application/pdf",
                    "filename": "resume.pdf",
                },
            ],
        }
    ]

    response = invoke_structured(
        ResumeResponse,
        "You are a helpful assistant that analyzes documents and returns structured JSON data.",
        messages,
    )

    if response.is_resume:
        markdown_chars = (
            len(response.markdown_content) if response.markdown_content else 0
        )
        logger.debug("Parsed resume: markdown_chars=%d", markdown_chars)
    else:
        logger.warning("Document is not a resume: type=%s", response.document_type)

    return response
