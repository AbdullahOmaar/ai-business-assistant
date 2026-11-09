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

export SLACK_ACCESS_TOKEN='xoxb-fake-slack-token-1234567890'
export CIRCLE_API_TOKEN='circleci-fake-api-token-1234567890'
export DATABASE_URL='postgresql://ci_user:ci_password@localhost/test_db'
export SHORT_TOKEN='abc'
aws_secret='SyntheticAWSSecretForTestsValue'
redacted=$(redact_text $'Authorization: Bearer abcdef123456\nAuthorization: Basic dXNlcjpwYXNz\npassword=hunter2 token=xyz postgres://dbuser:dbpass@localhost/db postgresql+psycopg://dbuser:dbpass@localhost/db AWS_SECRET_ACCESS_KEY='"$aws_secret"' xoxb-fake-slack-token-1234567890 circleci-fake-api-token-1234567890 abc')
[[ "$redacted" != *'abcdef123456'* ]]
[[ "$redacted" != *'hunter2'* ]]
[[ "$redacted" != *'dbpass'* ]]
[[ "$redacted" != *'dXNlcjpwYXNz'* ]]
[[ "$redacted" != *"$aws_secret"* ]]
[[ "$redacted" != *'Authorization: Basic'* ]]
[[ "$redacted" != *'ci_password'* ]]
[[ "$redacted" != *'xoxb-fake-slack-token-1234567890'* ]]
[[ "$redacted" != *'circleci-fake-api-token-1234567890'* ]]
[[ "$redacted" != *'abc'* ]]
[[ "$redacted" != *'postgresql+psycopg://dbuser'* ]]
[[ "$redacted" == *'[REDACTED]'* ]]
jwt_header=$(printf '%s' '{"alg":"HS256"}' | base64 | tr -d '=\n')
jwt_payload=$(printf '%s' '{"sub":"synthetic-test-user"}' | base64 | tr -d '=\n')
jwt_signature='SyntheticSignatureForTestsValue'
jwt_value="${jwt_header}.${jwt_payload}.${jwt_signature}"
jwt_redacted=$(redact_text "token=none ${jwt_value}")
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

long_log=$(for i in $(seq 1 30); do printf 'diagnostic line %02d with a moderately long error detail\n' "$i"; done)
excerpt=$(format_excerpt "$long_log")
[[ "$excerpt" == *'diagnostic line 30'* ]]
[[ "$excerpt" != *'```'* ]]
[[ "$excerpt" != *'diagnostic line 01'* ]]
[[ "$(printf '%s' "$excerpt" | wc -c)" -le 1400 ]]

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
grep -Fq '"text": "*Failed step:*\n${ABA_FAILURE_STEP}"' "$config_file"
grep -Fq '"text": "*Redacted error excerpt:*\n```\n${ABA_FAILURE_EXCERPT}\n```"' "$config_file"

echo 'Slack failure diagnostic helper tests passed.'
