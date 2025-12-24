from pathlib import Path

import resend
from jinja2 import Environment, FileSystemLoader

from app.config import Config
from app.core.logger import init_logger

logger = init_logger(__name__)

resend.api_key = Config.RESEND_API_KEY

# Setup Jinja2 template loader
TEMPLATE_DIR = Path("app/templates/emails")
env = Environment(loader=FileSystemLoader(TEMPLATE_DIR))


def send_batch_completed(email: str, token: str) -> None:
    """Send notification that batch processing has completed."""
    base_url = f"{Config.BASE_URL}/batch/status"
    results_url = f"{base_url}/{token}"

    try:
        template = env.get_template("batch_completed.html")
        html = template.render(base_url=base_url, results_url=results_url, token=token)

        params: resend.Emails.SendParams = {
            "from": Config.FROM_EMAIL,
            "to": [email],
            "subject": "Your Candidate Evaluations Are Ready",
            "html": html,
        }

        response = resend.Emails.send(params)
        logger.info(f"Sent batch completed email to {email} (id: {response['id']})")

    except Exception as e:
        logger.error(f"Failed to send batch completed email to {email}: {e}")


def send_batch_failed(email: str, token: str) -> None:
    """Send notification that batch processing has failed."""
    base_url = f"{Config.BASE_URL}/batch/status"
    results_url = f"{base_url}/{token}"

    try:
        template = env.get_template("batch_failed.html")
        html = template.render(base_url=base_url, results_url=results_url, token=token)

        params: resend.Emails.SendParams = {
            "from": Config.FROM_EMAIL,
            "to": [email],
            "subject": "Your candidate evaluations encountered an error",
            "html": html,
        }

        response = resend.Emails.send(params)
        logger.info(f"Sent batch failed email to {email} (id: {response['id']})")

    except Exception as e:
        logger.error(f"Failed to send batch failed email to {email}: {e}")
