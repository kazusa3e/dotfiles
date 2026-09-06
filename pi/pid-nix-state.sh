#!/bin/sh

PID_NIX_STATE=/nix/var/pid
PID_NIX_PROFILE=$PID_NIX_STATE/state/nix/profiles/channels

pid_channel() (
    # Scope Nix's writable state without moving Pi's HOME or application state.
    export HOME="$PID_NIX_STATE/home"
    export XDG_STATE_HOME="$PID_NIX_STATE/state"
    exec nix-channel "$@"
)

pid_nix_ready() {
    [ -f "$PID_NIX_STATE/initialized" ] \
        && [ -f "$PID_NIX_STATE/home/.nix-channels" ] \
        && [ -d "$PID_NIX_PROFILE/nixpkgs" ] \
        && [ -d "$PID_NIX_PROFILE/unstable" ]
}

pid_nix_lock() {
    mkdir -p "$PID_NIX_STATE"
    if ! mkdir "$PID_NIX_STATE/maintenance.lock" 2>/dev/null; then
        echo "pid: Nix state is locked; another initialization or maintenance task may be running" >&2
        echo "pid: after checking for active tasks, remove $PID_NIX_STATE/maintenance.lock if stale" >&2
        return 1
    fi
    trap 'rmdir "$PID_NIX_STATE/maintenance.lock"' 0
    trap 'exit 129' HUP
    trap 'exit 130' INT
    trap 'exit 143' TERM
}

pid_nix_init() {
    if [ -f "$PID_NIX_STATE/initialized" ]; then
        if ! pid_nix_ready; then
            echo "pid: persisted channel state is incomplete; restore the volume or use a fresh one" >&2
            return 1
        fi
        return 0
    fi
    if [ "$(id -u)" = 0 ]; then
        echo "pid: channel state requires the image's non-root runtime UID" >&2
        return 1
    fi

    mkdir -p "$PID_NIX_STATE/home" "$PID_NIX_STATE/state/nix/profiles"
    if [ ! -f "$PID_NIX_STATE/home/.nix-channels" ]; then
        cp /etc/pid/channels "$PID_NIX_STATE/home/.nix-channels"
    fi

    if [ "${1:-}" = build ]; then
        pid_channel --update
    else
        legacy=/nix/var/nix/profiles/per-user/root/channels
        if [ ! -d "$legacy/nixpkgs" ] || [ ! -d "$legacy/unstable" ]; then
            echo "pid: no usable channel snapshot; rebuild the image and use a fresh Nix volume" >&2
            return 1
        fi
        echo "pid: adopting the legacy root channel snapshot with the image's channel URLs" >&2
        nix-env --profile "$PID_NIX_PROFILE" --set "$(readlink -f "$legacy")"
    fi
    touch "$PID_NIX_STATE/initialized"
}
