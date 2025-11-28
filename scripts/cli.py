#!/usr/bin/env python3
"""
Interactive CLI for testing resume parsing and job description parsing locally.
"""

import sys
from pathlib import Path
from pprint import pprint

from app.core.job_description_parser import parse_job_description
from app.core.resume_parser import parse_resume


def print_header():
    """Print CLI header"""
    print("\n" + "=" * 60)
    print("  LLM-Enhanced Resume Screening System - CLI")
    print("=" * 60)


def print_menu():
    """Print main menu"""
    print("\nMain Menu:")
    print("  1. Parse Resume (PDF)")
    print("  2. Parse Job Description (Text)")
    print("  3. Exit")
    print("-" * 60)


def parse_resume_interactive():
    """Interactive resume parsing"""
    print("\n" + "=" * 60)
    print("  RESUME PARSING")
    print("=" * 60)

    pdf_path = input("\nEnter the path to the resume PDF file: ").strip()

    # Remove quotes if user copied path with quotes
    pdf_path = pdf_path.strip("'\"")

    if not pdf_path:
        print("❌ Error: No file path provided.")
        return

    pdf_file = Path(pdf_path)

    if not pdf_file.exists():
        print(f"❌ Error: File '{pdf_path}' not found.")
        return

    if not pdf_file.suffix.lower() == ".pdf":
        print(f"❌ Error: File must be a PDF. Got: {pdf_file.suffix}")
        return

    try:
        print(f"\n🔄 Analyzing '{pdf_file.name}'...")
        result = parse_resume(str(pdf_file))

        print("\n" + "=" * 60)
        print("  PARSING RESULTS")
        print("=" * 60)

        print(f"\n✓ Is Resume: {result.is_resume}")

        if result.is_resume:
            if result.personal_information:
                print(f"✓ Name: {result.personal_information.name or 'N/A'}")
                print(f"✓ Email: {result.personal_information.email or 'N/A'}")
                print(f"✓ Phone: {result.personal_information.phone or 'N/A'}")
            else:
                print("✓ Name: N/A")

            if result.work_experience:
                print(f"✓ Work Experience Entries: {len(result.work_experience)}")

            if result.education:
                print(f"✓ Education Entries: {len(result.education)}")

            if result.skills:
                if result.skills.technical_skills:
                    print(
                        f"✓ Technical Skills: {len(result.skills.technical_skills)} found"
                    )

            print("\n" + "-" * 60)
            print("Full structured response:")
            print("-" * 60)
            pprint(result.markdown_content, width=80, compact=False)
        else:
            print(f"✓ Document Type: {result.document_type or 'Unknown'}")
            print("\n⚠️  This document is not a resume/CV.")

        print("\n" + "=" * 60)

    except FileNotFoundError:
        print(f"❌ Error: File '{pdf_path}' not found.")
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()


def parse_jd_interactive():
    """Interactive job description parsing"""
    print("\n" + "=" * 60)
    print("  JOB DESCRIPTION PARSING")
    print("=" * 60)

    print("\nOptions:")
    print("  1. Enter job description text directly")
    print("  2. Load from a text file")

    choice = input("\nSelect option (1 or 2): ").strip()

    jd_text = ""

    if choice == "1":
        print("\nEnter the job description (press Ctrl+D or Ctrl+Z when done):")
        print("-" * 60)
        try:
            lines = []
            while True:
                try:
                    line = input()
                    lines.append(line)
                except EOFError:
                    break
            jd_text = "\n".join(lines)
        except KeyboardInterrupt:
            print("\n\n❌ Input cancelled.")
            return

    elif choice == "2":
        file_path = input("\nEnter the path to the text file: ").strip()
        file_path = file_path.strip("'\"")

        if not file_path:
            print("❌ Error: No file path provided.")
            return

        text_file = Path(file_path)

        if not text_file.exists():
            print(f"❌ Error: File '{file_path}' not found.")
            return

        try:
            jd_text = text_file.read_text(encoding="utf-8")
        except Exception as e:
            print(f"❌ Error reading file: {e}")
            return
    else:
        print("❌ Invalid option selected.")
        return

    if not jd_text.strip():
        print("❌ Error: No job description text provided.")
        return

    try:
        print("\n🔄 Analyzing job description...")
        result = parse_job_description(jd_text)

        print("\n" + "=" * 60)
        print("  PARSING RESULTS")
        print("=" * 60)

        print(f"\n✓ Is Job Description: {result.is_job_description}")

        if result.is_job_description:
            print(f"✓ Job Title: {result.job_title or 'N/A'}")
            print(f"✓ Company: {result.company_name or 'N/A'}")
            print(f"✓ Location: {result.location or 'N/A'}")
            print(f"✓ Employment Type: {result.employment_type or 'N/A'}")

            if result.requirements:
                if result.requirements.skills:
                    print("✓ Skills: found")

            if result.keywords:
                print(f"✓ Keywords Extracted: {len(result.keywords)}")

            print("\n" + "-" * 60)
            print("Full structured response:")
            print("-" * 60)
            pprint(result.model_dump(), width=80, compact=False)
        else:
            print(f"✓ Document Type: {result.document_type or 'Unknown'}")
            print("\n⚠️  This document is not a job description.")

        print("\n" + "=" * 60)

    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback

        traceback.print_exc()


def main():
    """Main CLI loop"""
    print_header()

    while True:
        print_menu()
        choice = input("Select an option (1-3): ").strip()

        if choice == "1":
            parse_resume_interactive()
        elif choice == "2":
            parse_jd_interactive()
        elif choice == "3":
            print("\n👋 Goodbye!\n")
            sys.exit(0)
        else:
            print("\n❌ Invalid option. Please select 1, 2, or 3.")

        input("\n⏎ Press Enter to continue...")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n👋 Goodbye!\n")
        sys.exit(0)
