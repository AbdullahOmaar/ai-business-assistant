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
export SHORT_TOKEN='abcd'
redacted=$(redact_text 'Authorization: Bearer abcdef123456 password=hunter2 token=xyz postgres://dbuser:dbpass@localhost/db xoxb-fake-slack-token-1234567890 circleci-fake-api-token-1234567890 abcd')
[[ "$redacted" != *'abcdef123456'* ]]
[[ "$redacted" != *'hunter2'* ]]
[[ "$redacted" != *'dbpass'* ]]
[[ "$redacted" != *'ci_password'* ]]
[[ "$redacted" != *'xoxb-fake-slack-token-1234567890'* ]]
[[ "$redacted" != *'circleci-fake-api-token-1234567890'* ]]
[[ "$redacted" != *'abcd'* ]]
[[ "$redacted" == *'[REDACTED]'* ]]
[[ "$redacted" != '"'* ]]
multiline_redacted=$(redact_text 
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

# JSON-safe Slack block text preserves quotes, backslashes, and newlines.
block_json=$(slack_text_json '*Failed step:*' 'Step "compile" failed\with detail')
[[ "$(jq -r . <<< "$block_json")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Failed step:*\nStep "compile" failed\with detail' ]]
step_block=$(slack_text_json '*Failed step:*' 'Step "compile" failed\with detail')
excerpt_block=$(slack_text_json 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Redacted error excerpt:*\n```' 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'line one\nline two\n```')
payload=$(jq -n --argjson step "$step_block" --argjson excerpt "$excerpt_block" \
  '{blocks:[{type:"section",text:{type:"mrkdwn",text:$step}},{type:"section",text:{type:"mrkdwn",text:$excerpt}}]}')
[[ "$(jq -r '.blocks[0].text.text' <<< "$payload")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Failed step:*\nStep "compile" failed\with detail' ]]
[[ "$(jq -r '.blocks[1].text.text' <<< "$payload")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Redacted error excerpt:*\n```\nline one\nline two\n```' ]]

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'line one\npassword=hunter2\nline three')
[[ "$multiline_redacted" == 
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

# JSON-safe Slack block text preserves quotes, backslashes, and newlines.
block_json=$(slack_text_json '*Failed step:*' 'Step "compile" failed\with detail')
[[ "$(jq -r . <<< "$block_json")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Failed step:*\nStep "compile" failed\with detail' ]]
step_block=$(slack_text_json '*Failed step:*' 'Step "compile" failed\with detail')
excerpt_block=$(slack_text_json 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Redacted error excerpt:*\n```' 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'line one\nline two\n```')
payload=$(jq -n --argjson step "$step_block" --argjson excerpt "$excerpt_block" \
  '{blocks:[{type:"section",text:{type:"mrkdwn",text:$step}},{type:"section",text:{type:"mrkdwn",text:$excerpt}}]}')
[[ "$(jq -r '.blocks[0].text.text' <<< "$payload")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Failed step:*\nStep "compile" failed\with detail' ]]
[[ "$(jq -r '.blocks[1].text.text' <<< "$payload")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Redacted error excerpt:*\n```\nline one\nline two\n```' ]]

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'line one\n[REDACTED]\nline three' ]]
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

# JSON-safe Slack block text preserves quotes, backslashes, and newlines.
block_json=$(slack_text_json '*Failed step:*' 'Step "compile" failed\with detail')
[[ "$(jq -r . <<< "$block_json")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Failed step:*\nStep "compile" failed\with detail' ]]
step_block=$(slack_text_json '*Failed step:*' 'Step "compile" failed\with detail')
excerpt_block=$(slack_text_json 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Redacted error excerpt:*\n```' 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'line one\nline two\n```')
payload=$(jq -n --argjson step "$step_block" --argjson excerpt "$excerpt_block" \
  '{blocks:[{type:"section",text:{type:"mrkdwn",text:$step}},{type:"section",text:{type:"mrkdwn",text:$excerpt}}]}')
[[ "$(jq -r '.blocks[0].text.text' <<< "$payload")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Failed step:*\nStep "compile" failed\with detail' ]]
[[ "$(jq -r '.blocks[1].text.text' <<< "$payload")" == 

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'*Redacted error excerpt:*\n```\nline one\nline two\n```' ]]

# Missing API token must produce a safe fallback and never call the network.
tmp_env=$(mktemp)
BASH_ENV="$tmp_env"
unset CIRCLE_API_TOKEN || true
CIRCLE_BUILD_NUM=12345
collect_failure_details
# shellcheck disable=SC1090
source "$tmp_env"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == *'CIRCLE_API_TOKEN is not configured'* ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == *'Add CIRCLE_API_TOKEN'* ]]

# Environment export preserves quotes and multiline excerpts.
tmp_env2=$(mktemp)
BASH_ENV="$tmp_env2"
write_bash_env 'Step with spaces and "quotes"' $'first line\nsecond line'
# shellcheck disable=SC1090
source "$tmp_env2"
[[ "$(jq -r . <<< "$ABA_FAILURE_STEP_BLOCK_JSON")" == $'*Failed step:*\nStep with spaces and "quotes"' ]]
[[ "$(jq -r . <<< "$ABA_FAILURE_EXCERPT_BLOCK_JSON")" == $'*Redacted error excerpt:*\n```\nfirst line\nsecond line\n```' ]]
rm -f "$tmp_env" "$tmp_env2"

echo 'Slack failure diagnostic helper tests passed.'