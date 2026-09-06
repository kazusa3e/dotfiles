#!/usr/bin/env bash
set -euo pipefail

project=$(cd -- "$(dirname -- "$0")/.." && pwd)
export TEST_ROOT
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT
export PID_TEST_PROJECT="$project"
mkdir -p "$TEST_ROOT/bin" "$TEST_ROOT/state/home" \
    "$TEST_ROOT/state/state/nix/profiles/channels/"{nixpkgs,unstable}
touch "$TEST_ROOT/state/initialized" "$TEST_ROOT/state/home/.nix-channels"

cat > "$TEST_ROOT/helper" <<'EOF'
. "$PID_TEST_PROJECT/pid-nix-state.sh"
PID_NIX_STATE=$TEST_ROOT/state
PID_NIX_PROFILE=$PID_NIX_STATE/state/nix/profiles/channels
EOF

cat > "$TEST_ROOT/bin/podman" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" >> "$TEST_ROOT/engine.log"
if [[ $1 == image ]]; then
    exit "${PID_TEST_IMAGE_STATUS:-0}"
fi
[[ $1 == run ]]
shift
while (($#)); do
    case $1 in
        --env) export "$2"; shift 2 ;;
        --user|--volume|--workdir|--entrypoint) shift 2 ;;
        --*) shift ;;
        *) shift; break ;;
    esac
done
[[ $1 == -eu && $2 == -c ]]
script=${3//\/etc\/pid\/nix-state.sh/$TEST_ROOT/helper}
exec /bin/sh -eu -c "$script"
EOF

cat > "$TEST_ROOT/bin/nix-channel" <<'EOF'
#!/bin/sh
printf 'channel: %s\n' "$*" >> "$TEST_ROOT/commands.log"
printf 'HOME=%s XDG_STATE_HOME=%s\n' "$HOME" "$XDG_STATE_HOME" >> "$TEST_ROOT/commands.log"
exit "${PID_TEST_CHANNEL_STATUS:-0}"
EOF

cat > "$TEST_ROOT/bin/nix-shell" <<'EOF'
#!/bin/sh
printf 'shell: %s\n' "$*" >> "$TEST_ROOT/commands.log"
exit "${PID_TEST_SHELL_STATUS:-0}"
EOF
chmod +x "$TEST_ROOT/bin/"*
ln -s podman "$TEST_ROOT/bin/docker"
export PATH="$TEST_ROOT/bin:$PATH"

run_make() {
    : > "$TEST_ROOT/engine.log"
    : > "$TEST_ROOT/commands.log"
    make --no-print-directory -s -C "$project" DOCKER="$TEST_ROOT/bin/podman" \
        IMAGE=test-image PID_NIX_VOLUME=test-volume USER_UID=1000 USER_GID=1000 \
        CHANNEL= GENERATION= "$@" > "$TEST_ROOT/output" 2>&1
}

expect_failure() {
    if run_make "$@"; then
        echo "Expected failure: $*" >&2
        exit 1
    fi
}

assert_unlocked() {
    test ! -d "$TEST_ROOT/state/maintenance.lock"
}

run_make update
grep -Fx -- '--userns=keep-id' "$TEST_ROOT/engine.log"
grep -Fx 'test-volume:/nix' "$TEST_ROOT/engine.log"
grep -Fx 'channel: --update --option tarball-ttl 0' "$TEST_ROOT/commands.log"
grep -Fx "HOME=$TEST_ROOT/state/home XDG_STATE_HOME=$TEST_ROOT/state/state" "$TEST_ROOT/commands.log"
grep -Fx 'shell: /etc/pid/pid-shell.nix --run exit 0' "$TEST_ROOT/commands.log"
assert_unlocked

for channel in nixpkgs unstable; do
    run_make update CHANNEL="$channel"
    grep -Fx "channel: --update $channel --option tarball-ttl 0" "$TEST_ROOT/commands.log"
done

run_make rollback
grep -Fx 'channel: --rollback' "$TEST_ROOT/commands.log"
run_make rollback GENERATION=12
grep -Fx 'channel: --rollback 12' "$TEST_ROOT/commands.log"
assert_unlocked

run_make update DOCKER="$TEST_ROOT/bin/docker"
if grep -q -- '--userns=keep-id' "$TEST_ROOT/engine.log"; then
    echo 'Docker must not receive Podman user namespace flags' >&2
    exit 1
fi

for invalid in 'CHANNEL=invalid' 'CHANNEL=nixpkgs unstable' 'PID_NIX_VOLUME=' 'USER_UID=0' 'GENERATION=1'; do
    expect_failure update "$invalid"
    test ! -s "$TEST_ROOT/engine.log"
done
for invalid in 'CHANNEL=unstable' 'GENERATION=bad' 'GENERATION=-1' 'GENERATION=0'; do
    expect_failure rollback "$invalid"
    test ! -s "$TEST_ROOT/engine.log"
done

export PID_TEST_IMAGE_STATUS=1
expect_failure update
test ! -s "$TEST_ROOT/commands.log"
unset PID_TEST_IMAGE_STATUS

export PID_TEST_CHANNEL_STATUS=1
expect_failure update
if grep -q '^shell:' "$TEST_ROOT/commands.log"; then
    echo 'Validation must not run after a channel command fails' >&2
    exit 1
fi
assert_unlocked
unset PID_TEST_CHANNEL_STATUS

export PID_TEST_SHELL_STATUS=1
expect_failure update
grep -F 'Use make rollback to recover' "$TEST_ROOT/output"
assert_unlocked
unset PID_TEST_SHELL_STATUS

mkdir "$TEST_ROOT/state/maintenance.lock"
expect_failure update
grep -F 'Nix state is locked' "$TEST_ROOT/output"
test -d "$TEST_ROOT/state/maintenance.lock"
test ! -s "$TEST_ROOT/commands.log"
rmdir "$TEST_ROOT/state/maintenance.lock"

rmdir "$TEST_ROOT/state/state/nix/profiles/channels/unstable"
expect_failure update
grep -F 'persisted channel state is incomplete' "$TEST_ROOT/output"
test ! -s "$TEST_ROOT/commands.log"
assert_unlocked

# Initialization failure must not leave a success marker or retain the lock.
rm "$TEST_ROOT/state/initialized"
export PID_TEST_CHANNEL_STATUS=1
if /bin/sh -eu -c '
    . "$TEST_ROOT/helper"
    pid_nix_lock
    pid_nix_init build
'; then
    echo 'Bootstrap unexpectedly succeeded' >&2
    exit 1
fi
test ! -f "$TEST_ROOT/state/initialized"
assert_unlocked
unset PID_TEST_CHANNEL_STATUS

echo 'Channel maintenance tests passed.'
