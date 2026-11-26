# Voice transcription — design and foundation (phase ص)

**Status:** foundation implemented 2026-11-26 (branch
`aiba/voice-foundation`). **No live provider is implemented or
enabled by this slice.** Voice cannot activate in this build: no
real STT client exists, no media download exists, and the provider
factory fails closed for any configured name it does not implement.
Source plan: `FULL-PLAN-complete-assistant.md` §١٠ (voice design)
and §١٢ (phase ص) in the design workspace.

## Why voice, and why it is dangerous if done casually

Voice is the fastest input for حسو's audience — business owners who
work with their hands. It is also the easiest input to get wrong:
a mis-heard customer name or amount, silently turned into a
financial proposal, is worse than no voice at all. The design
therefore treats a transcript as *untrusted text that must be
shown*, never as a command channel with privileges of its own.

## The unified transcription contract

One contract serves both voice surfaces:

| Surface | Audio source | Transcription |
|---|---|---|
| WhatsApp voice note | Media attached to the inbound webhook message (bytes resolved by the transport) | Server-side STT provider (this design) |
| In-app mic (Slice 2) | Browser microphone | Web Speech API today (browser-side, free); the same display/correction rules apply to its text |

Both surfaces converge on the same rule set before any text reaches
the chat pipeline:

1. **Transcript-display rule.** The user ALWAYS sees what was
   understood, before anything derived from it happens. On
   WhatsApp the reply is prefixed `فهمت: «النص»` (the transcript in
   quotes) ahead of the answer or proposal card text. In the app,
   the Slice 2 mic already places the transcript in the composer
   where the user can correct it before sending — the same rule in
   the surface's own idiom.
2. **No voice shortcut for confirmations.** A voice-originated
   action passes through the exact Slice 1/3 machinery as typed
   text: proposal draft → (second owner confirmation where the
   policy requires it) → execution. Voice changes *how text
   arrives*, never *what the text may do*. There is no "confirm by
   voice" path and none may be added without a governance
   amendment.
3. **No guessing at names and numbers.** Name resolution and
   amount parsing are the deterministic matcher's job (Slice 3),
   with its clarification questions for ambiguity — identical for
   voice and text, because by then both are just text. Financial
   figures in a transcript are always visible in the proposal
   payload before execution.
4. **Graceful fallback, always.** Any transcription failure —
   provider error, empty transcript, or confidence below the floor
   — produces one polite ask-to-type reply
   (`مسمعتش الصوت كويس — ممكن تكتبهولي؟` on WhatsApp) and nothing
   else. A fallback is a normal outcome, not an error state, and
   never a silent drop.

## The confidence floor

`MIN_CONFIDENCE = 0.75` in `backend/app/voice_transcription.py`.
Provider confidences are self-reported and optimistic; the floor is
deliberately conservative because the failure it prevents (a wrong
name/amount entering a proposal) costs far more than one extra
typed message. The floor is a named constant so the activation
review can revisit it with real accuracy data in hand.

## Provider selection — accuracy first, decided by the owner

Choosing an STT provider is a **cost-bearing owner decision** and
is deliberately NOT made by this slice. The selection criteria, in
order:

1. **Egyptian-dialect accuracy, measured — not marketed.** General
   STT models are measurably weaker on Egyptian Arabic. A provider
   is eligible only after passing the accuracy gate below on the
   Egyptian test set. Vendor claims and demo clips are not
   evidence.
2. **Per-minute cost, recorded and reported.** Transcription is
   billed per audio minute. The activation package presented to
   the owner must state each candidate's per-minute price and a
   realistic monthly estimate at expected voice volume. Cost is
   never incurred silently: no provider may be enabled before the
   owner sees the number.
3. **The contract fit.** The provider must implement the
   `STTProvider` protocol (`transcribe(audio, mime_type,
   language_hint) -> TranscriptResult{text, confidence}`) and
   return an honest confidence; a provider that cannot report
   confidence cannot enforce the floor and is ineligible.
4. **Data handling.** Audio contains business speech; the
   provider's retention/training terms are part of the activation
   package, consistent with the channel's privacy analysis
   (FULL-PLAN §٥.٢).

### The accuracy gate (the Egyptian test set)

`backend/tests/fixtures/voice_ar_eg.json` holds the Egyptian
dictation test set: phrases a business owner would actually say
(create customer/supplier/product, draft invoice, payment, expense,
stock commands, read questions, small talk), each with
`expected_transcript` and `expected_intent` (the Slice 3 action the
transcript must produce, or `read`/`none`).

`test_voice_transcription.py::test_egyptian_test_set_intent_harness`
runs every fixture through the Fake + the deterministic intent
matcher and asserts the expected intent. With the Fake the harness
proves the *pipeline* end-to-end (audio bytes → transcript →
intent). For a real provider candidate, the same harness is re-run
with the candidate wired behind the protocol and **real recorded
clips** in place of the fixture bytes: the pass bar for activation
is every command fixture producing its expected intent (a
transcription error that changes a name or amount fails the gate),
with the measured per-fixture results reported to the owner
alongside the cost estimate. A provider is fixed only after that
report exists.

## What this slice implements

- `backend/app/voice_transcription.py` — the `STTProvider`
  protocol, `TranscriptResult`, `FakeSTTProvider` (registry keyed
  by audio content hash; unknown audio → empty text, 0
  confidence), the `transcribe_voice` pipeline helper (enforces
  the floor and the fallback outcome; never raises for a
  transcription failure, never invents text), and the factory:
  `create_stt_provider()` serves only the Fake and raises
  `VoiceProviderUnavailable` for any other name;
  `configured_stt_provider()` returns a provider only when
  `VOICE_STT_PROVIDER` is explicitly set (unset = voice not
  activated = the shipped default).
- WhatsApp wiring (`backend/app/whatsapp_api.py`) — an audio
  message from a linked number is transcribed only when BOTH
  seams are satisfied: media bytes resolve via
  `media_bytes_resolver` AND a provider is available via
  `stt_provider_factory`/`configured_stt_provider()`. On success
  the transcript runs the existing pipeline with the linked
  user's identity and the reply carries the `فهمت:` prefix; the
  persisted Slice 4 turn records the transcript as the user
  message and the exact sent body as the answer. On the fallback
  outcome the ask-to-type reply is sent. With neither seam
  satisfied — the only state this build ships — the reply is
  byte-identical to the pre-voice build (the polite text-only
  reply), and a configured-but-unimplemented provider name logs a
  warning and changes nothing.
- The Egyptian test set + harness (above).

## Activation boundary — what is NOT built

- **No real STT client** (no vendor SDK, no API keys, no network
  calls). Enabling one is the owner's decision on the accuracy +
  cost report.
- **No media download.** WhatsApp media bytes require the real
  WhatsApp transport (W2 — itself gated on the owner's provider
  decision, FULL-PLAN §١٣). The bytes arrive at the pipeline
  through the resolver seam; inventing a fetch here would mean
  inventing the transport.
- **No TTS / voice replies.** Replies stay text (FULL-PLAN §١٠:
  cheaper, reviewable, auditable). A spoken-reply feature is a
  separate future decision.
- **No change to governance.** The policy gate, the confirmation
  model, and the closed action list are untouched; voice produces
  text for the existing paths only.
- **In-app mic unchanged.** Slice 2's Web Speech mic already
  satisfies the contract's display/correction rule in-app; a
  future move to server-side STT in-app would reuse this module
  unchanged.
- **Gate finding — the matcher did not fold ة (2026-11-26) —
  FIXED on this branch (coordinator review fix).** The harness
  caught a real defect in the shipped Slice 3 matcher:
  `assistant_intent._fold_light` looked its fold tables up with
  `.get()` on `str.maketrans` dicts (whose keys are ordinals), so
  NOTHING was folded — not ة->ه, not the alef forms, not
  Arabic-Indic digits — while the intent patterns are written
  with ه and Western digits. A natural transcript (or a typed
  message) spelled «فاتورة مسودة» extracted no invoice intent,
  and amounts in Arabic-Indic digits never folded. The fix
  applies the tables with `translate()` (every mapping is 1:1,
  so the index map is unchanged), adds a fold regression test in
  `test_assistant_intent.py`, and the test set now gates BOTH
  spellings: ه fixtures (v10/v12/v13) and ة fixtures (v29, plus
  v30 with Arabic-Indic digits). This is the gate working as
  intended: it prices a real provider against the pipeline that
  actually exists, not the one the comments describe.
