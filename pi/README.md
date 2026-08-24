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

The image contains the Nix runtime, stable and unstable channel definitions,
and bootstrap files. The first container start realizes `pid-shell.nix` into a
container-local named Nix volume; later containers reuse it. It is not the host Nix store and is safe to
discard when needed:

```sh
podman volume rm pid-nix
```

The volume name can be changed with `PID_NIX_VOLUME`; setting it to an empty
value disables the automatic Nix volume mount. Podman uses `:U` on this volume
to align its ownership with the runtime UID. Do not share the volume between
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

Build directories should remain container-specific, such as
`build-container/`, so CMake does not reuse host-specific absolute paths.
