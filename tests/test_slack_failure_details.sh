#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/../scripts/ci/prepare_slack_failure.sh"

command -v jq >/dev/null 2>&1 || { echo 'jq is required for CI diagnostic helper tests'; exit 1; }

sample_job='{"steps":[{"name":"Install dependencies","actions":[{"status":"success"}]},{"name":"Run tests","actions":[{"status":"failed","output_url":[{"type":"stdout","url":"https://circleci.example/stdout"},{"type":"stderr","url":"https://circleci.example/stderr"}]}]}]}'
parsed=$(failed_steps_json "$sample_job")
[[ "$(jq -r '.[0].step' <<< "$parsed")" == 'Run tests' ]]
[[ "$(jq -r '.[0].output_url | length' <<< "$parsed")" == '2' ]]

sample_output='[{"message":"AssertionError: expected 2 but got 1"},{"message":"FAILED tests/test_api.py::test_invoice"}]'
extracted=$(extract_output_text "$sample_output")
[[ "$extracted" == *'AssertionError: expected 2 but got 1'* ]]
[[ "$extracted" == *'FAILED tests/test_api.py::test_invoice'* ]]

# Isolate pattern-based redaction tests from environment-backed secret replacement.
while IFS= read -r key; do
  unset "$key"
done < <(compgen -e | grep -Ei '(TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL|CREDENTIAL)' || true)

assert_redacted() {
  local input="$1"
  local secret="$2"
  local marker="$3"
  local result
  result=$(redact_text "$input")
  if [[ "$result" == *"$secret"* || "$result" != *"$marker"* ]]; then
    printf 'A redaction regression assertion failed.\n' >&2
    return 1
  fi
}

# Each pattern gets an independent input, so another rule cannot hide a broken one.
assert_redacted $'Authorization: Bearer abcdef123456' 'abcdef123456' 'Authorization: [REDACTED]'
assert_redacted 'Bearer bearer-secret-value-123456' 'bearer-secret-value-123456' 'Bearer [REDACTED]'
assert_redacted 'Authorization: Basic dXNlcjpwYXNz' 'dXNlcjpwYXNz' 'Authorization: [REDACTED]'
assert_redacted 'password=hunter2' 'hunter2' '[REDACTED]'
assert_redacted 'token=xyz' 'xyz' '[REDACTED]'
assert_redacted 'postgres://dbuser:dbpass@localhost/db' 'dbpass' '[REDACTED URL CREDENTIALS]'
assert_redacted 'postgresql+psycopg://dbuser:dbpass@localhost/db' 'dbpass' '[REDACTED URL CREDENTIALS]'
assert_redacted 'AWS_SECRET_ACCESS_KEY=SyntheticAWSSecretForTestsValue' 'SyntheticAWSSecretForTestsValue' 'AWS_SECRET_ACCESS_KEY=[REDACTED]'
assert_redacted 'xoxb-fake-slack-token-1234567890' 'xoxb-fake-slack-token-1234567890' '[REDACTED]'
assert_redacted 'ghp_123456789012345678901234567890123456' 'ghp_123456789012345678901234567890123456' '[REDACTED]'
assert_redacted 'github_pat_123456789012345678901234567890123456' 'github_pat_123456789012345678901234567890123456' '[REDACTED]'
assert_redacted 'AKIA1234567890ABCDEF' 'AKIA1234567890ABCDEF' '[REDACTED]'
assert_redacted 'ASIA1234567890ABCDEF' 'ASIA1234567890ABCDEF' '[REDACTED]'
assert_redacted '{"password":"generated-password-value"}' 'generated-password-value' '[REDACTED JSON CREDENTIAL]'
assert_redacted '{"access_token":"generated-access-value"}' 'generated-access-value' '[REDACTED JSON CREDENTIAL]'
assert_redacted '{"client_secret":"value with spaces"}' 'value with spaces' '[REDACTED JSON CREDENTIAL]'
assert_redacted '{"refresh_token":"generated-refresh-value"}' 'generated-refresh-value' '[REDACTED JSON CREDENTIAL]'
assert_redacted "'password': 'quoted secret value'" 'quoted secret value' '[REDACTED YAML CREDENTIAL]'
assert_redacted 'password="quoted value with spaces"' 'quoted value with spaces' '[REDACTED]'
assert_redacted 'password: unquoted value with spaces' 'unquoted value with spaces' '[REDACTED]'
assert_redacted 'GET https://storage.example/log?X-Amz-Signature=abc123&X-Amz-Security-Token=def456' 'abc123' '[REDACTED SIGNED URL]'

private_key=$'-----BEGIN PRIVATE KEY-----\nprivate-key-body-must-not-leak\n-----END PRIVATE KEY-----'
assert_redacted "$private_key" 'private-key-body-must-not-leak' '[REDACTED PRIVATE KEY]'

# Exact environment-backed secret values, including short values, are redacted independently.
export CIRCLE_API_TOKEN='circleci-fake-api-token-1234567890'
env_redacted=$(redact_text "prefix:${CIRCLE_API_TOKEN}:suffix")
[[ "$env_redacted" == 'prefix:[REDACTED]:suffix' ]]
export SHORT_TOKEN='abc'
short_redacted=$(redact_text 'prefix:abc:suffix')
[[ "$short_redacted" == 'prefix:[REDACTED]:suffix' ]]
unset CIRCLE_API_TOKEN SHORT_TOKEN

jwt_header=$(printf '%s' '{"alg":"HS256"}' | base64 | tr -d '=\n')
jwt_payload=$(printf '%s' '{"sub":"synthetic-test-user"}' | base64 | tr -d '=\n')
jwt_signature='SyntheticSignatureForTestsValue'
jwt_value="${jwt_header}.${jwt_payload}.${jwt_signature}"
jwt_redacted=$(redact_text "${jwt_value}")
[[ "$jwt_redacted" != *"$jwt_header"* ]]
[[ "$jwt_redacted" == *'[REDACTED JWT]'* ]]
config_quoted=$(curl_config_quote 'line "quoted" \\ value')
[[ "$(jq -r . <<< "$config_quoted")" == 'line "quoted" \\ value' ]]
[[ "$redacted" != '"'* ]]

multiline_redacted=$(redact_text $'line one\npassword=hunter2\nline three')
[[ "$multiline_redacted" == $'line one\n[REDACTED]\nline three' ]]
signed_url_redacted=$(redact_text 'GET https://storage.example/log?X-Amz-Signature=abc123&X-Amz-Security-Token=def456')
[[ "$signed_url_redacted" == *'[REDACTED SIGNED URL]'* ]]
[[ "$signed_url_redacted" != *'abc123'* ]]
[[ "$signed_url_redacted" != *'def456'* ]]

private_key=$'-----BEGIN PRIVATE KEY-----\nprivate-key-body-must-not-leak\n-----END PRIVATE KEY-----'
redacted_key=$(redact_text "$private_key")
[[ "$redacted_key" != *'private-key-body-must-not-leak'* ]]
[[ "$redacted_key" == *'[REDACTED PRIVATE KEY]'* ]]

long_log=$(for i in $(seq 1 12); do printf 'diagnostic line %02d %0200d\n' "$i" "$i"; done)
excerpt=$(format_excerpt "$long_log")
[[ "$excerpt" == *'diagnostic line 12'* ]]
[[ "$excerpt" != *'```'* ]]
[[ "$excerpt" != *'diagnostic line 01'* ]]
[[ "$(printf '%s' "$excerpt" | wc -c)" -le 1400 ]]

# Large CircleCI step-output JSON must be downloaded as a complete document so its final error survives.
large_output=$(jq -cn '[range(0; 10000) | {message:("diagnostic line " + tostring)}] + [{message:"FINAL_ERROR_MARKER"}]')
[[ "${#large_output}" -gt 262144 && "${#large_output}" -lt 1048576 ]]
output_file=$(mktemp)
CURL_ARGS_FILE=$(mktemp)
MOCK_CIRCLECI_OUTPUT="$large_output"
curl() {
  printf '%s\n' "$@" > "$CURL_ARGS_FILE"
  local destination=''
  while (($#)); do
    if [[ "$1" == '--output' ]]; then destination="$2"; shift 2; else shift; fi
  done
  [[ -n "$destination" ]] || return 1
  printf '%s' "$MOCK_CIRCLECI_OUTPUT" > "$destination"
}
download_output_json 'https://circleci.example/large-output' "$output_file"
! grep -Fq -- '--range' "$CURL_ARGS_FILE"
grep -Fq -- '--max-filesize' "$CURL_ARGS_FILE"
downloaded_output=$(cat "$output_file")
large_text=$(extract_output_text "$downloaded_output")
[[ "$large_text" == *'FINAL_ERROR_MARKER'* ]]
large_excerpt=$(format_excerpt "$large_text")
[[ "$large_excerpt" == *'FINAL_ERROR_MARKER'* ]]
rm -f "$output_file" "$CURL_ARGS_FILE"
unset -f curl
unset MOCK_CIRCLECI_OUTPUT CURL_ARGS_FILE

# Match the Slack Orb 6.1.3 variable sanitization used by its custom template.
slack_orb_sanitize_value() {
  local value="$1"
  value=$(printf '%s' "$value" | awk '{gsub(/\\/, "&\\"); print $0}')
  value=$(printf '%s' "$value" | tr -d '\r' | awk 'NR > 1 { printf("\\n") } { printf("%s", $0) }')
  value=$(printf '%s' "$value" | awk '{gsub(/"/, "\\\""); print $0}')
  printf '%s' "$value"
}

export ABA_FAILURE_STEP='Step "compile" failed\with detail'
export ABA_FAILURE_EXCERPT=$'line one\nline two'
custom_template='{"blocks":[{"type":"section","text":{"type":"mrkdwn","text":"*Failed step:*\n${ABA_FAILURE_STEP}"}},{"type":"section","text":{"type":"mrkdwn","text":"*Redacted error excerpt:*\n${ABA_FAILURE_EXCERPT}"}}]}'
# The Slack Orb parses custom JSON before it substitutes environment variables.
jq -e . <<< "$custom_template" >/dev/null
ABA_FAILURE_STEP=$(slack_orb_sanitize_value "$ABA_FAILURE_STEP")
ABA_FAILURE_EXCERPT=$(slack_orb_sanitize_value "$ABA_FAILURE_EXCERPT")
CUSTOM_BODY_MODIFIED=$(printf '%s' "$custom_template" | jq '.')
CUSTOM_BODY_MODIFIED=$(printf '%s' "$CUSTOM_BODY_MODIFIED" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/`/\\`/g')
payload="$(eval printf '%s' \"$CUSTOM_BODY_MODIFIED\")"
jq -e . <<< "$payload" >/dev/null
[[ "$(jq -r '.blocks[0].text.text' <<< "$payload")" == $'*Failed step:*\nStep "compile" failed\with detail' ]]
[[ "$(jq -r '.blocks[1].text.text' <<< "$payload")" == $'*Redacted error excerpt:*\nline one\nline two' ]]

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$ABA_FAILURE_STEP" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$ABA_FAILURE_EXCERPT" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$ABA_FAILURE_STEP" == 'Step with spaces and "quotes"' ]]
[[ "$ABA_FAILURE_EXCERPT" == $'first line\nsecond line' ]]
rm -f "$tmp_env" "$tmp_env2"

# Assert the actual CircleCI config covers every workflow and uses the Slack Orb-safe template.
config_file="${CIRCLECI_CONFIG_FILE:-$SCRIPT_DIR/../.circleci/config.yml}"
[[ "$(grep -c -- '- notify-on-failure' "$config_file")" -eq 8 ]]
[[ "$(grep -c 'context: slack-secrets' "$config_file")" -eq 14 ]]
grep -Fq 'event: fail' "$config_file"
! grep -Fq 'event: pass' "$config_file"
grep -Fq 'ignore_errors: true' "$config_file"
grep -Fq 'CIRCLE_WORKFLOW_ID' "$config_file"
grep -Fq 'CIRCLE_JOB' "$config_file"
grep -Fq 'CIRCLE_BRANCH' "$config_file"
grep -Fq 'CIRCLE_SHA1' "$config_file"
grep -Fq 'CIRCLE_BUILD_URL' "$config_file"
grep -Fq -- '- image: mcr.microsoft.com/playwright:v1.55.0-noble' "$config_file"
grep -Fq 'name: Install Slack failure diagnostic tooling' "$config_file"
grep -Fq 'apt-get install -y --no-install-recommends jq' "$config_file"
diagnostic_install_line=$(grep -nF 'name: Install Slack failure diagnostic tooling' "$config_file" | cut -d: -f1)
browser_smoke_line=$(grep -nF 'name: Install frontend dependencies and run Chromium E2E' "$config_file" | cut -d: -f1)
[[ "$diagnostic_install_line" -lt "$browser_smoke_line" ]]
grep -Fq '"text": "*Failed step:*\n${ABA_FAILURE_STEP}"' "$config_file"
grep -Fq '"text": "*Redacted error excerpt:*\n```\n${ABA_FAILURE_EXCERPT}\n```"' "$config_file"

echo 'Slack failure diagnostic helper tests passed.'
