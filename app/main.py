import argparse
import sys
from pprint import pprint

from .parser import parse_resume


def main():
    parser = argparse.ArgumentParser(description="Parse a resume PDF using Gemini.")
    parser.add_argument("pdf_path", help="Path to the PDF file to parse")
    args = parser.parse_args()

    try:
        print(f"Analyzing '{args.pdf_path}'...")
        result = parse_resume(args.pdf_path)

        print("-" * 50)
        print(f"Is Resume: {result.is_resume}")
        print(
            f"Name: {result.personal_information.name if result.personal_information else 'N/A'}"
        )
        print("-" * 50)
        print("Full structured response:")
        pprint(result)

    except FileNotFoundError:
        print(f"Error: File '{args.pdf_path}' not found.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
