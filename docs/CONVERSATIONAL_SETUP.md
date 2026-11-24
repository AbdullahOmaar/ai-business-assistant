# Conversational setup — «عدّل إعداداتك بالسؤال» (B7 — 3A-725)

## The flow

1. **Ask.** The user asks the assistant to change a setting, in
   words («خلّي لغة النشاط عربي»).
2. **3 suggestions, at most.** The chat endpoint may return up to 3
   setting suggestions with the answer — each one a proposal, never
   an application: `{setting_key, current_value, proposed_value,
   is_financial, requires_confirmation, reason}`.
3. **Preview.** The user sees old → new for each suggestion before
   anything changes.
4. **Confirm and apply.** The user applies a suggestion through the
   existing owner-only `PUT /settings/{key}` — with the user's own
   token, under the user's own role. The assistant never calls it.
5. **One-tap rollback.** Every proposal carries its previous value
   (`current_value`, or null when the key did not exist). Rolling
   back is a PUT of the previous value, or — for a key the proposal
   created — `DELETE /settings/{key}` (owner-only, audited).

## The financial-numbers guard

A setting whose key names a financial number — tax, VAT, rate,
price, discount, currency, amount, fee, commission, salary,
payroll, charge, cost — is flagged `is_financial: true` and
`requires_confirmation: true`. **It never changes without an
explicit confirmation.** The guard lives in
`backend/app/assistant_settings.py` (`is_financial_setting`),
enforced on the backend — not by the model's goodwill. The model
is also told in the system prompt to say a financial suggestion
needs explicit confirmation.

## What the assistant cannot do (B6 holds)

- It cannot apply a setting, delete a setting, or change any
  setting by itself — settings writes are FORBIDDEN for the
  assistant in the B6 closed list. The endpoint validates
  suggestions and returns them; application is the user's act.
- It cannot suggest a secret-like key (password, token, API key…)
  — the same key validation the PUT endpoint uses rejects it, and
  the suggestion is dropped, never failing the answer.
- It cannot suggest more than 3 settings, duplicate a key, or
  suggest an empty value.

## The settings surface, honestly

Settings are a free-form key/value store (`BusinessSetting`: key ≤
100 chars, value ≤ 1000 chars); no code consumes setting values
today, and there is no settings screen in the app yet (the B3
deferral to Stage E stands). B7 builds the proposal + guard +
rollback contract on the backend so the screen, when it lands,
has a safe API to render: preview, confirm, rollback. The
`setting.deleted` audit event (key only, value never copied) and
its label/filter were added in this task, alongside the DELETE
endpoint.
