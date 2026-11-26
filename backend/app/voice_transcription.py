"""Speech-to-text foundation (voice phase ص, FULL-PLAN §10/§12).

Voice is a core input for حسو, not a garnish: owners dictate with
their hands busy. But a transcript is only ever an *input* — this
module defines the transcription contract and ships exactly one
implementation, the fixture-driven Fake used by tests and local
development. Which real STT provider carries the traffic is a
cost-bearing OWNER decision (per-minute pricing, and Egyptian
dialect accuracy varies wildly between providers), so the factory
FAILS CLOSED for any other configured provider name — a deployment
that names a provider this build does not implement gets a clear
error, never a silent fallback and never a surprise bill.

The contract (docs/VOICE_TRANSCRIPTION.md):

- A transcript is ALWAYS shown to the user («فهمت: «النص»») before
  anything derived from it is answered or proposed.
- Voice never shortens a confirmation: a voice-originated action
  flows through the same Slice 1/3 proposal + second-confirmation
  path as typed text. This module produces text, nothing more.
- No guessing: an empty transcript or a confidence below
  ``MIN_CONFIDENCE`` yields the typed fallback outcome (the caller
  asks the user to type) — a mis-heard customer name or amount must
  never become a proposal.
"""
from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from typing import Protocol

PROVIDER_ENV = "VOICE_STT_PROVIDER"

# The confidence floor for accepting a transcript. Below it the
# honest outcome is "ask the user to type": STT confidences are
# provider-reported and optimistic, and the cost of a wrong name or
# amount reaching a proposal is far higher than one extra message.
MIN_CONFIDENCE = 0.75

DEFAULT_LANGUAGE_HINT = "ar-EG"


class VoiceProviderUnavailable(RuntimeError):
    """The configured STT provider cannot serve in this build.

    Raised for an unimplemented provider name (fail closed) — the
    channel catches it and keeps the pre-voice text-only behavior,
    so naming an unimplemented provider can never break the webhook
    or silently activate a paid service.
    """


@dataclass(frozen=True)
class TranscriptResult:
    """One provider transcription result."""

    text: str
    confidence: float  # 0.0 (heard nothing) .. 1.0 (certain)


class STTProvider(Protocol):
    """The transcription contract every STT implementation meets."""

    name: str

    def transcribe(
        self, *, audio: bytes, mime_type: str, language_hint: str
    ) -> TranscriptResult:
        """Transcribe one audio clip. Implementations return an
        empty text with 0 confidence when nothing was understood —
        they never invent a transcript."""
        ...


def audio_content_hash(audio: bytes) -> str:
    """The registry key the Fake matches audio by (sha256 hex)."""
    return hashlib.sha256(audio).hexdigest()


class FakeSTTProvider:
    """Fixture-driven STT provider for tests and local development.

    The registry maps ``audio_content_hash(audio)`` -> the canned
    result for that exact clip; unknown audio returns an empty
    transcript with 0 confidence (the honest "heard nothing"), so
    the fallback path is exercised by default, never bypassed.
    Nothing leaves the process and nothing is billed.
    """

    name = "fake"

    def __init__(self, registry: dict[str, TranscriptResult] | None = None) -> None:
        self.registry: dict[str, TranscriptResult] = dict(registry or {})

    def register(self, audio: bytes, *, text: str, confidence: float = 0.99) -> str:
        """Register one fixture clip; returns its content hash."""
        digest = audio_content_hash(audio)
        self.registry[digest] = TranscriptResult(text=text, confidence=confidence)
        return digest

    def transcribe(
        self, *, audio: bytes, mime_type: str, language_hint: str
    ) -> TranscriptResult:
        return self.registry.get(
            audio_content_hash(audio), TranscriptResult(text="", confidence=0.0)
        )


@dataclass(frozen=True)
class VoiceTranscript:
    """The pipeline outcome: either an understood transcript the
    caller may display and feed to the chat pipeline, or the typed
    fallback (``understood=False``) — never a partial guess."""

    understood: bool
    text: str | None
    confidence: float


def transcribe_voice(
    *,
    provider: STTProvider,
    audio: bytes,
    mime_type: str,
    language_hint: str = DEFAULT_LANGUAGE_HINT,
) -> VoiceTranscript:
    """Run one clip through a provider and enforce the contract.

    Empty audio, a provider failure, an empty transcript, or a
    confidence below ``MIN_CONFIDENCE`` all yield the fallback
    outcome — the caller asks the user to type. This helper never
    raises for a transcription failure and never returns text the
    provider did not actually produce.
    """
    if not audio:
        return VoiceTranscript(understood=False, text=None, confidence=0.0)
    try:
        result = provider.transcribe(
            audio=audio, mime_type=mime_type, language_hint=language_hint
        )
    except Exception:  # noqa: BLE001 - a transcription failure is a fallback, not a crash
        return VoiceTranscript(understood=False, text=None, confidence=0.0)
    text = (result.text or "").strip()
    if not text or result.confidence < MIN_CONFIDENCE:
        return VoiceTranscript(
            understood=False, text=None, confidence=result.confidence
        )
    return VoiceTranscript(understood=True, text=text, confidence=result.confidence)


def create_stt_provider(name: str | None = None) -> STTProvider:
    """Build the configured STT provider.

    ``VOICE_STT_PROVIDER`` names the provider (default ``fake``).
    Any name other than ``fake`` raises VoiceProviderUnavailable:
    real STT providers are a cost-bearing owner decision gated on
    the Egyptian test-set accuracy report
    (docs/VOICE_TRANSCRIPTION.md) and are deliberately NOT
    implemented in the foundation — naming one must fail closed,
    not fall back and not start billing.
    """
    resolved = (name or os.getenv(PROVIDER_ENV) or "fake").strip().lower()
    if resolved == "fake":
        return FakeSTTProvider()
    raise VoiceProviderUnavailable(
        f"STT provider {resolved!r} is not implemented in this build; "
        "voice fails closed until the owner's provider decision "
        "(docs/VOICE_TRANSCRIPTION.md) is implemented."
    )


def configured_stt_provider() -> STTProvider | None:
    """The provider ONLY when one is explicitly configured.

    Returns None when ``VOICE_STT_PROVIDER`` is unset or blank —
    voice is simply not activated, which is the shipped default:
    callers keep the pre-voice behavior exactly. Raises
    VoiceProviderUnavailable for an explicitly configured but
    unimplemented name (fail closed, loudly, in the logs).
    """
    raw = os.getenv(PROVIDER_ENV)
    if raw is None or not raw.strip():
        return None
    return create_stt_provider(raw)
