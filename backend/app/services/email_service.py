import smtplib
from abc import ABC, abstractmethod
from dataclasses import dataclass
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import resend
from jinja2 import Environment, FileSystemLoader

from app.config import Config
from app.core.logger import init_logger

logger = init_logger(__name__)

_template_env = Environment(loader=FileSystemLoader(Path("app/templates/emails")))


@dataclass(frozen=True, slots=True)
class GmailCredentials:
    email: str
    password: str
    from_name: str = "Recruit AI"
    server: str = "smtp.gmail.com"
    port: int = 587


@dataclass(frozen=True, slots=True)
class ResendCredentials:
    api_key: str
    from_email: str


class EmailProvider(ABC):
    """Abstract base class for email providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @abstractmethod
    def send(self, to: str, subject: str, html: str) -> None:
        pass


class ConsoleProvider(EmailProvider):
    """No-op email provider for local development; logs instead of sending."""

    @property
    def name(self) -> str:
        return "console"

    def send(self, to: str, subject: str, html: str) -> None:
        logger.info(
            f"[console email] to={to} subject={subject!r} html_length={len(html)}"
        )


class GmailProvider(EmailProvider):
    """Gmail SMTP email provider."""

    def __init__(self, credentials: GmailCredentials):
        self._cred = credentials

    @property
    def name(self) -> str:
        return "gmail"

    def send(self, to: str, subject: str, html: str) -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{self._cred.from_name} <{self._cred.email}>"
        msg["To"] = to
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(self._cred.server, self._cred.port) as server:
            server.starttls()
            server.login(self._cred.email, self._cred.password)
            server.sendmail(self._cred.email, to, msg.as_string())


class ResendProvider(EmailProvider):
    """Resend API email provider."""

    def __init__(self, credentials: ResendCredentials):
        self._cred = credentials

    @property
    def name(self) -> str:
        return "resend"

    def send(self, to: str, subject: str, html: str) -> None:
        resend.api_key = self._cred.api_key
        resend.Emails.send(
            {
                "from": self._cred.from_email,
                "to": [to],
                "subject": subject,
                "html": html,
            }
        )


class EmailService:
    """Email service that delegates to a provider."""

    def __init__(self, provider: EmailProvider, frontend_url: str):
        self._provider = provider
        self._frontend_url = frontend_url

    def _render(self, template_name: str, **kwargs: Any) -> str:
        return _template_env.get_template(template_name).render(**kwargs)

    def _send(self, to: str, subject: str, template: str, **context: Any) -> None:
        try:
            html = self._render(template, **context)
            self._provider.send(to, subject, html)
            logger.info(f"Sent email to {to} via {self._provider.name}")
        except Exception as e:
            logger.error(f"Failed to send email to {to}: {e}")

    def send_batch_completed(self, email: str, token: str) -> None:
        results_url = f"{self._frontend_url}/evaluation?token={token}"
        base_url = f"{self._frontend_url}/evaluation"
        self._send(
            to=email,
            subject="Your Candidate Evaluations Are Ready",
            template="batch_completed.html",
            results_url=results_url,
            token=token,
            base_url=base_url,
        )

    def send_batch_failed(self, email: str, token: str) -> None:
        results_url = f"{self._frontend_url}/evaluation?token={token}"
        base_url = f"{self._frontend_url}/evaluation"
        self._send(
            to=email,
            subject="Your candidate evaluations encountered an error",
            template="batch_failed.html",
            results_url=results_url,
            token=token,
            base_url=base_url,
        )


def _create_provider() -> EmailProvider:
    provider = Config.EMAIL_PROVIDER.lower()
    if provider == "gmail":
        return GmailProvider(
            GmailCredentials(
                email=Config.MAIL_FROM,
                password=Config.MAIL_PASSWORD,
                from_name=Config.MAIL_FROM_NAME,
                server=Config.MAIL_SERVER,
                port=Config.MAIL_PORT,
            )
        )
    if provider == "resend":
        return ResendProvider(
            ResendCredentials(
                api_key=Config.RESEND_API_KEY,
                from_email=Config.RESEND_FROM_EMAIL,
            )
        )
    return ConsoleProvider()


_service: EmailService | None = None


def get_email_service() -> EmailService:
    """Get the singleton email service instance."""
    global _service
    if _service is None:
        _service = EmailService(_create_provider(), Config.FRONTEND_URL)
    return _service


def send_batch_completed(email: str, token: str) -> None:
    get_email_service().send_batch_completed(email, token)


def send_batch_failed(email: str, token: str) -> None:
    get_email_service().send_batch_failed(email, token)
