ARG NIX_VERSION=2.34.8
FROM nixos/nix:${NIX_VERSION}

ARG NIXPKGS_CHANNEL=26.05
ARG NIXPKGS_UNSTABLE_CHANNEL=unstable
ARG USER_NAME=kazusa
ARG USER_UID=1000
ARG USER_GID=1000

ENV TERM=xterm-256color \
    COLORTERM=truecolor \
    EDITOR=vim \
    VISUAL=vim \
    NIX_REMOTE=local \
    PATH=/usr/local/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/usr/bin:/bin \
    NIX_PATH=/nix/var/nix/profiles/per-user/${USER_NAME}/channels \
    HOME=/home/${USER_NAME} \
    USER=${USER_NAME}

# The official image links account files into /nix/store. Materialize them
# before declaring the runtime user, then grant it access to Nix's mutable
# directories. Store paths remain root-owned: they are immutable and only the
# store directory itself must be writable for new realizations.
RUN set -eu; \
    printf '%s\n' 'experimental-features = nix-command' 'sandbox = false' > /etc/nix/nix.conf; \
    mkdir -p /etc/pid /etc/sudoers.d /home/${USER_NAME} /workspace; \
    for file in /etc/passwd /etc/group /etc/shadow /etc/gshadow; do \
        if [ -L "$file" ]; then \
            cp -L "$file" "$file.tmp"; \
            rm "$file"; \
            mv "$file.tmp" "$file"; \
        fi; \
    done; \
    printf '%s:x:%s:%s::/home/%s:/bin/sh\n' \
        "${USER_NAME}" "${USER_UID}" "${USER_GID}" "${USER_NAME}" >> /etc/passwd; \
    printf '%s:x:%s:\n' "${USER_NAME}" "${USER_GID}" >> /etc/group; \
    printf '%s:!:19000:0:99999:7:::\n' "${USER_NAME}" >> /etc/shadow; \
    printf '%s:!::\n' "${USER_NAME}" >> /etc/gshadow; \
    chown ${USER_UID}:${USER_GID} /home/${USER_NAME} /workspace; \
    printf '%s ALL=(ALL) NOPASSWD: ALL\n' "${USER_NAME}" > /etc/sudoers.d/${USER_NAME}; \
    chmod 0440 /etc/sudoers.d/${USER_NAME}; \
    chown ${USER_UID}:${USER_GID} /nix /nix/store /nix/var; \
    chown -R ${USER_UID}:${USER_GID} /nix/var/nix

COPY pid-shell.nix /etc/pid/pid-shell.nix
COPY --chmod=0755 pid-entrypoint /usr/local/bin/pid-entrypoint
USER ${USER_NAME}

RUN nix-channel --add "https://nixos.org/channels/nixos-${NIXPKGS_CHANNEL}" nixpkgs \
    && nix-channel --add "https://nixos.org/channels/nixpkgs-${NIXPKGS_UNSTABLE_CHANNEL}" unstable \
    && nix-channel --update

WORKDIR /workspace

VOLUME ["/nix"]
ENTRYPOINT ["/usr/local/bin/pid-entrypoint"]
