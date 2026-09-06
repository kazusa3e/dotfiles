# `pid`

`pid` runs `pi` in a Nix-based container. Arguments before `--` are passed to
the container engine; arguments after `--` are passed to `pi`.

```sh
# Use the image workdir (/workspace)
pid -- --model gpt-5.6-luna

# Mount the current project at its original absolute path
pid --cwd -- --no-session

# Add arbitrary Podman/Docker runtime options
pid --cwd \
    --volume "$HOME/.cache:/tmp/host-cache:ro" \
    --mount "type=bind,src=$HOME/.ssh,dst=/tmp/ssh,ro" \
    -- --no-session
```

The project directory is not mounted unless `--cwd` is supplied. The host
`.pi`, `.agents`, and `.gitconfig` files are mounted when present.

The container includes `nix-shell`, and its base tools are declared in
`pid-shell.nix`. The toolchain uses stable Nixpkgs 26.05, while `pi` is provided
by the `unstable` channel to match the host Pi installation. If the mounted
project contains a `shell.nix`, the entrypoint starts `pi` inside
both environments automatically. Thus commands such as `nix-shell -p git cmake`
run inside the container.

The image contains the Nix runtime, stable and unstable channel snapshots,
and bootstrap files. The first container start realizes `pid-shell.nix` into a
container-local named Nix volume; later containers reuse it. Channel subscriptions
and generations are persisted under `/nix/var/pid`, and `NIX_PATH` points to that
shared profile. Normal startup does not refresh channels. This is not the host
Nix store; use a fresh volume to reset the environment.

The volume name can be changed with `PID_NIX_VOLUME`; setting it to an empty
value disables the automatic Nix volume mount. Use the image's non-root UID/GID
for both normal startup and maintenance. Podman uses `--userns=keep-id`; volume
ownership must already match that identity. Do not share the volume between
incompatible architectures or unrelated Nix image versions. Nix sandboxing is
disabled inside the image for unprivileged container compatibility; the Nix
store remains isolated from the host.

`make -C pi install` builds the image with the host UID/GID, a pinned Nix
image version, stable NixOS 26.05 tools, and the `unstable` Pi channel. These
values can be overridden for a remote or shared build:

```sh
make -C pi install USER_UID=1000 USER_GID=1000 \
    NIX_VERSION=2.34.8 NIXPKGS_CHANNEL=26.05 \
    NIXPKGS_UNSTABLE_CHANNEL=unstable
```

## Updating channels and packages

Run these commands from the repository root:

```sh
make -C pi update                       # Refresh both channels and validate the base shell
make -C pi update CHANNEL=unstable      # Refresh Pi's channel only
make -C pi update CHANNEL=nixpkgs       # Refresh the stable tools channel only
make -C pi rollback                     # Restore the previous channel generation
make -C pi rollback GENERATION=1        # Restore a specific channel generation
```

Maintenance starts a non-interactive, disposable container with the specified
Nix volume. It bypasses Pi and does not mount the project or host configuration.
The image must already exist and contain the maintenance helper; rebuild older
images with `make -C pi install` first. `update` does not build images or change
channel URLs. Changing build arguments does not reconfigure an initialized volume.

Use the same engine, image, UID/GID, and volume as normal startup:

```sh
make -C pi update DOCKER=podman IMAGE=pid PID_NIX_VOLUME=pid-nix
```

An empty maintenance volume name is rejected. A missing named volume is created
and seeded from the image. Channel commands use a dedicated HOME and state
directory; use these Makefile targets rather than a bare `nix-channel --update`
inside a Pi session, which would modify a separate user profile.

After updating or rolling back, maintenance realizes the image's base shell.
Restart existing sessions to use the selected packages. The project shell is not
validated. A running session that invokes `nix-shell` again can see the changed
channel profile. Updating `unstable` affects every consumer of that channel,
not just Pi. Rollback restores the whole channel generation, not an individual
channel, and does not revert channel URLs or the image's package list.

If validation fails, make exits with an error, but the channel profile has already
changed. Use `rollback` to recover. No garbage collection or automatic rollback
is performed; old generations and downloaded packages are retained.

Initialization and maintenance share a fail-fast lock at
`/nix/var/pid/maintenance.lock`. A second maintenance task fails instead of racing.
Abrupt termination such as SIGKILL can leave the lock behind. After verifying
that no initialization or maintenance task is running, remove the empty lock
directory from a container mounting the same volume, then retry.

### Existing volumes and runtime upgrades

A compatible legacy volume with both root channel snapshots is adopted without
downloading new channels. The new profile starts at generation 1, using the image's
configured subscription URLs; legacy generation history is not migrated. Verify
that the image's channel URLs match the legacy setup before the first update.
Already initialized volumes keep their subscriptions and selected generations.

An existing `/nix` volume hides the image's `/nix`, including its Nix runtime.
Rebuilding alone therefore does not upgrade that volume. For a Nix runtime or
architecture change, incompatible bootstrap paths, or a deliberate channel URL
change, build the desired image and select a fresh volume:

```sh
make -C pi install
make -C pi update PID_NIX_VOLUME=pid-nix-v2
PID_NIX_VOLUME=pid-nix-v2 pid --cwd
```

Keep the old volume until the new environment works; remove it only after stopping
all containers that use it.

Build directories should remain container-specific, such as
`build-container/`, so CMake does not reuse host-specific absolute paths.

## Tests

Run `bash pi/tests/channel-maintenance.sh` from the repository root. These tests
use a mock container engine and Nix commands; they do not access real images,
volumes, channels, or the network.
