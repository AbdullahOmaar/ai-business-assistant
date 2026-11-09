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
    if [[ ${#value} -ge 4 ]]; then
      secrets=$(jq --arg secret "$value" '. + [$secret]' <<< "$secrets" 2>/dev/null) || secrets='[]'
    fi
  done < <(compgen -e | grep -Ei '(TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|DATABASE_URL|CREDENTIAL)' || true)

  printf '%s' "$raw" | jq -Rsr --argjson secrets "$secrets" '
    reduce $secrets[] as $secret (. ; split($secret) | join("[REDACTED]"))
    | gsub("(?i)authorization[[:space:]]*:[[:space:]]*bearer[[:space:]]+[^[:space:]]+"; "Authorization: Bearer [REDACTED]")
    | gsub("(?i)bearer[[:space:]]+[A-Za-z0-9._~+/-]+=*"; "Bearer [REDACTED]")
    | gsub("xox[baprs]-[A-Za-z0-9-]{10,}"; "[REDACTED]")
    | gsub("gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}"; "[REDACTED]")
    | gsub("AKIA[0-9A-Z]{16}"; "[REDACTED]")
    | gsub("(?i)(password|passwd|token|secret|api[_-]?key)[[:space:]]*[:=][[:space:]]*[^[:space:],;]+"; "[REDACTED]")
    | gsub("(?i)(postgres(ql)?|mysql)://[^:/@[:space:]]+:[^@[:space:]]+@"; "database://[REDACTED]@")
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
    printf '%s' "$cleaned" | head -c 1400
  fi
}

slack_text_json() {
  local label="$1"
  local value="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -Rn --arg label "$label" --arg value "$value" '$label + "\n" + $value'
    return
  fi

  # Minimal JSON-string fallback for images without jq.
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\r'/}
  value=${value//$'\t'/\\t}
  value=${value//$'\n'/\\n}
  label=${label//\\/\\\\}
  label=${label//\"/\\\"}
  printf '"%s\\n%s"\n' "$label" "$value"
}

write_bash_env() {
  local step="$1"
  local excerpt="$2"
  local step_json excerpt_json
  if [[ -n "${BASH_ENV:-}" ]]; then
    step_json=$(slack_text_json '*Failed step:*' "$step")
    excerpt_json=$(slack_text_json $'*Redacted error excerpt:*\n```' "$excerpt"$'\n```')
    printf 'export ABA_FAILURE_STEP_BLOCK_JSON=%q\n' "$step_json" >> "$BASH_ENV"
    printf 'export ABA_FAILURE_EXCERPT_BLOCK_JSON=%q\n' "$excerpt_json" >> "$BASH_ENV"
  fi
}

collect_failure_details() {
  local step='Failed step details unavailable'
  local excerpt='Open the CircleCI job link for the full output.'
  local api_url job_payload failed_steps temp_dir item name urls url output log_text combined redacted

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
  job_payload=$(printf 'header = "Circle-Token: %s"\nurl = "%s"\n' "$CIRCLE_API_TOKEN" "$api_url" \
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
      output=$(printf 'url = "%s"\n' "$url" \
        | curl --silent --show-error --fail --location --max-time 8 --config - 2>/dev/null)
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
