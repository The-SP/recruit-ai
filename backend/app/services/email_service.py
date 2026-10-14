import base64
import logging
import smtplib
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import resend
from jinja2 import Environment, FileSystemLoader

from app.config import Config
from app.core.logger import mask_email

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path("app/templates/emails")
SMTP_TIMEOUT_SECONDS = 15
_template_env = Environment(loader=FileSystemLoader(_TEMPLATE_DIR))


@dataclass(frozen=True, slots=True)
class InlineImage:
    """An image attached to the message and referenced from the HTML as
    `cid:<cid>`. Attached rather than linked so it renders without the client
    fetching anything: no dependency on a public URL, and no "load images?"
    prompt in clients that block remote content."""

    cid: str
    filename: str
    content: bytes

    @classmethod
    def from_asset(cls, filename: str) -> "InlineImage":
        return cls(
            cid=Path(filename).stem,
            filename=filename,
            content=(_TEMPLATE_DIR / "assets" / filename).read_bytes(),
        )


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
    def send(
        self,
        to: str,
        subject: str,
        html: str,
        images: list[InlineImage],
        reply_to: str | None = None,
    ) -> None:
        pass


class ConsoleProvider(EmailProvider):
    """No-op email provider for local development; logs instead of sending."""

    @property
    def name(self) -> str:
        return "console"

    def send(
        self,
        to: str,
        subject: str,
        html: str,
        images: list[InlineImage],
        reply_to: str | None = None,
    ) -> None:
        logger.info(
            "Console email: to=%s subject=%r html_length=%d images=%s reply_to=%s",
            mask_email(to),
            subject,
            len(html),
            [i.filename for i in images],
            mask_email(reply_to) if reply_to else None,
        )


class GmailProvider(EmailProvider):
    """Gmail SMTP email provider."""

    def __init__(self, credentials: GmailCredentials):
        self._cred = credentials

    @property
    def name(self) -> str:
        return "gmail"

    def send(
        self,
        to: str,
        subject: str,
        html: str,
        images: list[InlineImage],
        reply_to: str | None = None,
    ) -> None:
        # multipart/related is what lets the HTML part resolve `cid:` references
        # to the image parts sent alongside it.
        msg = MIMEMultipart("related")
        msg["Subject"] = subject
        msg["From"] = f"{self._cred.from_name} <{self._cred.email}>"
        msg["To"] = to
        if reply_to:
            msg["Reply-To"] = reply_to
        msg.attach(MIMEText(html, "html"))
        for image in images:
            part = MIMEImage(image.content, _subtype="png")
            part.add_header("Content-ID", f"<{image.cid}>")
            part.add_header("Content-Disposition", "inline", filename=image.filename)
            msg.attach(part)

        # A timeout because the interview invite is sent inside a request: a
        # hung SMTP server must fail the request, not hold it open.
        with smtplib.SMTP(
            self._cred.server, self._cred.port, timeout=SMTP_TIMEOUT_SECONDS
        ) as server:
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

    def send(
        self,
        to: str,
        subject: str,
        html: str,
        images: list[InlineImage],
        reply_to: str | None = None,
    ) -> None:
        resend.api_key = self._cred.api_key
        params: resend.Emails.SendParams = {
            "from": self._cred.from_email,
            "to": [to],
            "subject": subject,
            "html": html,
            "attachments": [
                {
                    "filename": image.filename,
                    "content": base64.b64encode(image.content).decode(),
                    "content_id": image.cid,
                }
                for image in images
            ],
        }
        if reply_to:
            params["reply_to"] = reply_to
        resend.Emails.send(params)


class EmailService:
    """Email service that delegates to a provider."""

    def __init__(self, provider: EmailProvider, frontend_url: str):
        self._provider = provider
        self._frontend_url = frontend_url

    def _render(self, template_name: str, **kwargs: Any) -> str:
        return _template_env.get_template(template_name).render(**kwargs)

    def _send(
        self,
        to: str,
        subject: str,
        template: str,
        hero_image: str | None = None,
        **context: Any,
    ) -> None:
        """Send and swallow failures. For notifications nobody is waiting on."""
        try:
            self._deliver(to, subject, template, hero_image, **context)
        except Exception:
            logger.exception(
                "Email not sent: to=%s subject=%r", mask_email(to), subject
            )

    def _deliver(
        self,
        to: str,
        subject: str,
        template: str,
        hero_image: str | None = None,
        reply_to: str | None = None,
        **context: Any,
    ) -> None:
        """Send and raise on failure, for callers that must report it."""
        images = [InlineImage.from_asset(hero_image)] if hero_image else []
        html = self._render(
            template,
            hero_cid=images[0].cid if images else None,
            **context,
        )
        self._provider.send(to, subject, html, images, reply_to=reply_to)
        logger.info(
            "Email sent: to=%s subject=%r provider=%s",
            mask_email(to),
            subject,
            self._provider.name,
        )

    def send_batch_completed(self, email: str, token: str) -> None:
        self._send(
            to=email,
            subject="Your candidate evaluation is ready",
            template="batch_completed.html",
            hero_image="evaluation-ready.png",
            results_url=self._results_url(token),
        )

    def send_batch_failed(self, email: str, token: str) -> None:
        self._send(
            to=email,
            subject="We couldn't finish your candidate evaluation",
            template="batch_failed.html",
            hero_image="evaluation-failed.png",
            results_url=self._results_url(token),
        )

    def send_interview_invite(
        self,
        email: str,
        *,
        invite_url: str,
        inviter: str,
        candidate_name: str | None,
        job_title: str | None,
        expires_at: datetime,
        time_limit_seconds: int,
        reply_to: str | None = None,
    ) -> None:
        """Email a candidate their interview link.

        Raises on failure, unlike the batch emails: a recruiter is waiting on
        this one and needs to know the invite never went out. Never pass
        anything from the question script or grounding -- this goes to the
        candidate, and those are the rubric.
        """
        subject = (
            f"Interview invitation: {job_title}"
            if job_title
            else "You're invited to an interview"
        )
        self._deliver(
            to=email,
            subject=subject,
            template="interview_invite.html",
            hero_image="interview-invite.png",
            reply_to=reply_to,
            invite_url=invite_url,
            inviter=inviter,
            candidate_name=candidate_name,
            job_title=job_title,
            expires_on=f"{expires_at:%B} {expires_at.day}, {expires_at.year}",
            time_limit_minutes=time_limit_seconds // 60,
        )

    def _results_url(self, token: str) -> str:
        return f"{self._frontend_url}/evaluation?token={token}"


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
