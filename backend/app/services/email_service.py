"""
Mock email service for batch notifications.

In production, replace logging with actual email sending (e.g., SendGrid, SES).
"""

from app.core.logger import init_logger

logger = init_logger(__name__)

BASE_URL = "http://localhost:8000"  # Configure via environment in production


def send_batch_started(email: str, token: str) -> None:
    """
    Send notification that batch processing has started.

    Args:
        email: Recipient email address
        token: Access token for viewing results
    """
    results_url = f"{BASE_URL}/batch/status/{token}"

    logger.info(
        f"\n{'=' * 60}\n"
        f"📧 EMAIL: Batch Started\n"
        f"{'=' * 60}\n"
        f"To: {email}\n"
        f"Subject: Your resume evaluation has started\n"
        f"\n"
        f"Your batch evaluation is now being processed.\n"
        f"View results at: {results_url}\n"
        f"{'=' * 60}\n"
    )


def send_batch_completed(email: str, token: str, processed: int, failed: int) -> None:
    """
    Send notification that batch processing has completed.

    Args:
        email: Recipient email address
        token: Access token for viewing results
        processed: Number of successfully processed resumes
        failed: Number of failed resumes
    """
    results_url = f"{BASE_URL}/batch/status/{token}"

    logger.info(
        f"\n{'=' * 60}\n"
        f"📧 EMAIL: Batch Completed\n"
        f"{'=' * 60}\n"
        f"To: {email}\n"
        f"Subject: Your resume evaluation is complete\n"
        f"\n"
        f"Your batch evaluation has finished processing.\n"
        f"Results: {processed} processed, {failed} failed\n"
        f"View results at: {results_url}\n"
        f"{'=' * 60}\n"
    )


def send_batch_failed(email: str, token: str, error: str) -> None:
    """
    Send notification that batch processing has failed.

    Args:
        email: Recipient email address
        token: Access token for viewing results
        error: Error message describing the failure
    """
    results_url = f"{BASE_URL}/batch/status/{token}"

    logger.info(
        f"\n{'=' * 60}\n"
        f"📧 EMAIL: Batch Failed\n"
        f"{'=' * 60}\n"
        f"To: {email}\n"
        f"Subject: Your resume evaluation encountered an error\n"
        f"\n"
        f"Your batch evaluation has failed.\n"
        f"Error: {error}\n"
        f"View details at: {results_url}\n"
        f"{'=' * 60}\n"
    )
