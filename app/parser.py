import base64
from typing import Any

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain.agents.structured_output import ToolStrategy

from .schemas import ResumeResponse

load_dotenv()

MODEL_NAME = "google_genai:gemini-2.5-flash-lite"

PROMPT = """You are a precise resume parser. Analyze the provided PDF document.

FIRST: Determine if this is a resume/CV document.
- A resume/CV typically contains: personal information, work experience, education, skills, and contact details
- If this is NOT a resume/CV, set is_resume to false and provide a brief description in document_type (max 15 words)

IF THIS IS A RESUME/CV: Extract all information from the document.

CRITICAL RULES:
1. Extract ONLY information that is explicitly present in the PDF
2. Do NOT infer, assume, or add any information that is not directly stated
3. Do NOT rephrase or paraphrase - use the EXACT wording from the PDF
4. If a section is not present, set it as null or empty array
5. Preserve all dates, numbers, and formatting exactly as shown
6. Do not add placeholder text or examples
7. If you cannot find specific information, leave that field as null
8. Maintain the exact order of items as they appear in the resume
9. Do not correct grammar, spelling, or formatting from the original
10. Do not expand abbreviations unless they are expanded in the PDF
11. Preserve all special characters, punctuation, and capitalization

YOU MUST respond with valid JSON matching the ResumeResponse schema."""


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
    """Parse a resume PDF and return structured data"""
    pdf_base64 = encode_pdf_to_base64(pdf_path)

    agent = create_agent(
        model=MODEL_NAME,
        system_prompt="You are a helpful assistant that analyzes documents and returns structured JSON data.",
        response_format=ToolStrategy(ResumeResponse),
    )

    messages: Any = [
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": PROMPT,
                },
                {"type": "media", "mime_type": "application/pdf", "data": pdf_base64},
            ],
        }
    ]

    result = agent.invoke({"messages": messages})
    return result["structured_response"]
