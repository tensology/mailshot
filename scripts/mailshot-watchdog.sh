#!/usr/bin/env bash

set -euo pipefail

MAILSHOT_APP_DIR="${MAILSHOT_APP_DIR:-/root/repos/mailshot-app}"
MAILCOW_DIR="${MAILCOW_DIR:-/opt/mailshot}"
MAILSHOT_MIN_FREE_MB="${MAILSHOT_MIN_FREE_MB:-512}"
MAILSHOT_JOURNAL_VACUUM_SIZE="${MAILSHOT_JOURNAL_VACUUM_SIZE:-100M}"
MAILSHOT_DOCKER_LOG_MAX_MB="${MAILSHOT_DOCKER_LOG_MAX_MB:-20}"

log() {
    printf '[mailshot-watchdog] %s\n' "$*"
}

available_mb() {
    df -Pm / | awk 'NR==2 { print $4 }'
}

vacuum_if_low_space() {
    local free_mb
    free_mb="$(available_mb)"

    if [ "${free_mb}" -ge "${MAILSHOT_MIN_FREE_MB}" ]; then
        return 0
    fi

    log "Low disk space detected (${free_mb}MB free). Starting cleanup."

    truncate -s 0 /var/log/mailshot-ui.log /var/log/mailshot-ui-error.log 2>/dev/null || true
    journalctl --vacuum-size="${MAILSHOT_JOURNAL_VACUUM_SIZE}" >/dev/null 2>&1 || true

    find /var/lib/docker/containers -name '*-json.log' -size +"${MAILSHOT_DOCKER_LOG_MAX_MB}"M \
        -exec truncate -s 0 {} \; 2>/dev/null || true

    find /var/log -maxdepth 1 -type f \( -name 'syslog*' -o -name 'auth.log*' -o -name 'mailshot-ui*.log*' \) \
        -size +"${MAILSHOT_DOCKER_LOG_MAX_MB}"M -exec truncate -s 0 {} \; 2>/dev/null || true

    log "Cleanup finished; $(available_mb)MB free now."
}

ensure_mailcow_services() {
    if [ ! -f "${MAILCOW_DIR}/docker-compose.yml" ]; then
        return 0
    fi

    local recreate=()
    local running_services

    running_services="$(docker compose -f "${MAILCOW_DIR}/docker-compose.yml" ps --status running --services 2>/dev/null || true)"

    for service in unbound-mailcow redis-mailcow postfix-mailcow sogo-mailcow; do
        if ! printf '%s\n' "${running_services}" | grep -qx "${service}"; then
            recreate+=("${service}")
        fi
    done

    if [ "${#recreate[@]}" -gt 0 ]; then
        log "Recreating mailcow services: ${recreate[*]}"
        if ! docker compose -f "${MAILCOW_DIR}/docker-compose.yml" up -d --force-recreate "${recreate[@]}" >/dev/null; then
            log "Mailcow recovery did not complete cleanly."
        fi
    fi
}

ensure_mailshot_service() {
    if systemctl is-active --quiet mailshot-ui; then
        return 0
    fi

    log "Restarting mailshot-ui."
    systemctl restart mailshot-ui
}

main() {
    vacuum_if_low_space
    ensure_mailcow_services
    ensure_mailshot_service
}

main "$@"
