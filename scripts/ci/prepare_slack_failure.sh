#!/usr/bin/env bash
# Collect a small, redacted excerpt from CircleCI's failed step output.
# This helper is deliberately best-effort: it must never mask the original CI failure.


failed_steps_json() {
  local payload="$1"
  jq -c '
    [
      .steps[]? as $step
      | if ([($step.actions // [])[]? | select(.status == "failed")] | length) > 0 then
          ($step.actions // [])[]?
          | select(.status == "failed")
          | {step: ($step.name // "Unknown step"), output_url: (.output_url // [])}
        elif $step.status == "failed" then
          {step: ($step.name // "Unknown step"), output_url: []}
        else empty end
    ]
  ' <<< "$payload" 2>/dev/null || printf '[]'
}

extract_output_text() {
  local payload="$1"
  if jq -e 'type == "array" or type == "object"' >/dev/null 2>&1 <<< "$payload"; then
    jq -r '[.. | objects | (.message? // .content? // .text? // .output? // empty) | select(type == "string")] | join("\n")' <<< "$payload" 2>/dev/null
  else
    printf '%s' "$payload"
  fi
}

redact_text() {
  local raw="$1"
  local secrets='[]'
  local key value
  while IFS= read -r key; do
    value="${!key}"
    if [[ -n "$value" ]]; then
      secrets=$(jq --arg secret "$value" '. + [$secret]' <<< "$secrets" 2>/dev/null) || secrets='[]'
    fi
  done < <(compgen -e | grep -Ei '(TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL|CREDENTIAL)' || true)

  printf '%s' "$raw" | jq -Rsr --argjson secrets "$secrets" '
    reduce $secrets[] as $secret (. ; split($secret) | join("[REDACTED]"))
    | gsub("(?im)(authorization[[:space:]]*:[[:space:]]*)[^\\r\\n]+"; "Authorization: [REDACTED]")
    | gsub("(?i)bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*"; "Bearer [REDACTED]")
    | gsub("xox[baprs]-[A-Za-z0-9-]{10,}"; "[REDACTED]")
    | gsub("gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}"; "[REDACTED]")
    | gsub("AKIA[0-9A-Z]{16}"; "[REDACTED]")
    | gsub("(?i)aws_secret_access_key[[:space:]]*[:=][[:space:]]*[A-Za-z0-9/+=]{20,}"; "AWS_SECRET_ACCESS_KEY=[REDACTED]")
    | gsub("eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}"; "[REDACTED JWT]")
    | gsub("(?i)\"(password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)\"[[:space:]]*:[[:space:]]*\"([^\"\\\\]|\\\\.)*\""; "[REDACTED JSON CREDENTIAL]")
    | gsub("(?i)'(password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)'[[:space:]]*:[[:space:]]*'[^']*'"; "[REDACTED YAML CREDENTIAL]")
    | gsub("(?i)(password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)[[:space:]]*[:=][[:space:]]*\"([^\"\\\\]|\\\\.)*\""; "[REDACTED]")
    | gsub("(?i)(password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)[[:space:]]*[:=][[:space:]]*'[^']*'"; "[REDACTED]")
    | gsub("(?im)(password|passwd|token|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)[[:space:]]*[:=][[:space:]]*[^\\r\\n,;}]+")
    | gsub("(?i)[a-z][a-z0-9+.-]*://[^:/@[:space:]]+:[^@[:space:]]+@"; "[REDACTED URL CREDENTIALS]@")
    | gsub("(?i)https?://[^[:space:]]*[?&](token|access_token|signature|sig|x-amz-signature|x-amz-security-token|awsaccesskeyid|x-goog-signature)=[^[:space:]]+"; "[REDACTED SIGNED URL]")
    | gsub("-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----"; "[REDACTED PRIVATE KEY]")
  ' 2>/dev/null || printf '%s' '[Failure output redaction unavailable; open the CircleCI job logs directly.]'
}

format_excerpt() {
  local raw="$1"
  local cleaned
  cleaned=$(printf '%s' "$raw" \
    | sed -E 's/\x1B\[[0-9;]*[[:alpha:]]//g' \
    | tr '\140' "'" \
    | awk 'NF { if (length($0) > 220) print substr($0, 1, 220) "…"; else print $0 }' \
    | tail -n 12)
  if [[ -z "$cleaned" ]]; then
    printf '%s' 'No step output was returned by CircleCI.'
  else
    printf '%s' "$cleaned" | tail -c 1400
  fi
}

write_bash_env() {
  local step="$1"
  local excerpt="$2"
  if [[ -n "${BASH_ENV:-}" ]]; then
    printf 'export ABA_FAILURE_STEP=%q\n' "$step" >> "$BASH_ENV"
    printf 'export ABA_FAILURE_EXCERPT=%q\n' "$excerpt" >> "$BASH_ENV"
  fi
}

curl_config_quote() {
  jq -rn --arg value "$1" '$value | @json'
}

collect_failure_details() {
  local step='Failed step details unavailable'
  local excerpt='Open the CircleCI job link for the full output.'
  local api_url api_config job_payload failed_steps temp_dir item name urls url output log_text combined redacted

  if ! command -v curl >/dev/null 2>&1 || ! command -v jq >/dev/null 2>&1; then
    step='Diagnostic tooling unavailable in this job image'
    excerpt='curl and jq are required to retrieve the failed-step excerpt. Open the CircleCI job link for full logs.'
    write_bash_env "$step" "$excerpt"
    return 0
  fi

  if [[ -z "${CIRCLE_API_TOKEN:-}" ]]; then
    step='Failed step lookup unavailable — CIRCLE_API_TOKEN is not configured'
    excerpt='Add CIRCLE_API_TOKEN to the CircleCI slack-secrets context to enable redacted failed-step excerpts. The job link is still available.'
    write_bash_env "$step" "$excerpt"
    return 0
  fi

  if [[ -z "${CIRCLE_BUILD_NUM:-}" ]]; then
    step='Failed step lookup unavailable — CIRCLE_BUILD_NUM is missing'
    excerpt='CircleCI did not expose a build number to the diagnostic helper. Open the job link for full logs.'
    write_bash_env "$step" "$excerpt"
    return 0
  fi

  api_url="https://circleci.com/api/v1.1/project/gh/${CIRCLE_PROJECT_USERNAME:-AbdullahOmaar}/${CIRCLE_PROJECT_REPONAME:-ai-business-assistant}/${CIRCLE_BUILD_NUM}"
  api_config=$(printf 'header = %s\nheader = %s\nurl = %s\n' \
    "$(curl_config_quote "Circle-Token: $CIRCLE_API_TOKEN")" \
    "$(curl_config_quote "Accept: application/json")" \
    "$(curl_config_quote "$api_url")")
  job_payload=$(printf '%s' "$api_config" \
    | curl --silent --show-error --fail --location --max-time 12 --config - 2>/dev/null)
  if [[ -z "$job_payload" ]] || ! jq -e '.steps | type == "array"' >/dev/null 2>&1 <<< "$job_payload"; then
    step='Failed step lookup unavailable — CircleCI API request failed'
    excerpt='Check that CIRCLE_API_TOKEN is valid and can read project job details. Open the CircleCI job link for full logs.'
    write_bash_env "$step" "$excerpt"
    return 0
  fi

  failed_steps=$(failed_steps_json "$job_payload")
  if [[ "$(jq 'length' <<< "$failed_steps" 2>/dev/null)" == '0' ]]; then
    step='CircleCI did not expose a failed step'
    excerpt='The job may have failed before a command step ran, or CircleCI did not return step-level status. Open the job link for full logs.'
    write_bash_env "$step" "$excerpt"
    return 0
  fi

  temp_dir=$(mktemp -d 2>/dev/null)
  if [[ -z "$temp_dir" || ! -d "$temp_dir" ]]; then
    step='Failed steps detected; temporary log processing unavailable'
    excerpt='Open the CircleCI job link for full logs.'
    write_bash_env "$step" "$excerpt"
    return 0
  fi
  chmod 700 "$temp_dir" 2>/dev/null
  combined="$temp_dir/combined.log"
  : > "$combined"
  local count=0
  local step_names=''
  while IFS= read -r item; do
    [[ -n "$item" ]] || continue
    name=$(jq -r '.step // "Unknown step"' <<< "$item")
    if [[ -z "$step_names" ]]; then step_names="$name"; else step_names+="; $name"; fi
    printf 'Step: %s\n' "$name" >> "$combined"
    urls=$(jq -r '
      .output_url
      | if type == "array" then .[] else . end
      | if type == "object" then .url else . end
      | select(type == "string")
    ' <<< "$item" 2>/dev/null)
    while IFS= read -r url; do
      [[ "$url" == https://* ]] || continue
      output=$(printf 'url = %s\n' "$(curl_config_quote "$url")" \
        | curl --silent --show-error --fail --location --max-time 8 --range -262144 --max-filesize 262144 --config - 2>/dev/null)
      [[ -n "$output" ]] || continue
      log_text=$(extract_output_text "$output")
      [[ -n "$log_text" ]] && printf '%s\n' "$log_text" >> "$combined"
    done <<< "$urls"
    count=$((count + 1))
    [[ "$count" -ge 2 ]] && break
  done < <(jq -c '.[]' <<< "$failed_steps")

  step="${step_names:-Failed step detected}"
  if ! grep -qv '^Step: ' "$combined" 2>/dev/null; then
    excerpt='CircleCI identified the failed step but returned no step output. Open the CircleCI job link for full logs.'
  else
    redacted=$(redact_text "$(cat "$combined" 2>/dev/null)")
    excerpt=$(format_excerpt "$redacted")
  fi
  rm -rf "$temp_dir" 2>/dev/null
  write_bash_env "$step" "$excerpt"
  return 0
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  set +e
  set +x
  collect_failure_details "$@" || true
fi
