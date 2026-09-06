ARG NIX_VERSION=2.34.8
FROM nixos/nix:${NIX_VERSION}

ARG NIXPKGS_CHANNEL=26.05
ARG NIXPKGS_UNSTABLE_CHANNEL=unstable
ARG USER_NAME=kazusa
ARG USER_UID=1000
ARG USER_GID=1000

ENV TERM=xterm-256color
ENV COLORTERM=truecolor
ENV EDITOR=vim
ENV VISUAL=vim
ENV NIX_REMOTE=local
ENV PATH=/usr/local/bin:/nix/var/nix/profiles/default/bin:/nix/var/nix/profiles/default/sbin:/usr/bin:/bin
ENV NIX_PATH=/nix/var/pid/state/nix/profiles/channels
ENV HOME=/home/${USER_NAME}
ENV USER=${USER_NAME}

RUN printf '%s\n' \
    'experimental-features = nix-command' \
    'sandbox = false' \
    > /etc/nix/nix.conf

RUN mkdir -p /etc/pid \
    && printf '%s\n' \
        "https://nixos.org/channels/nixos-${NIXPKGS_CHANNEL} nixpkgs" \
        "https://nixos.org/channels/nixpkgs-${NIXPKGS_UNSTABLE_CHANNEL} unstable" \
        > /etc/pid/channels

# The official image links these files into /nix/store. Use regular files so
# the runtime user can be declared without relying on shadow during the build.
RUN for file in /etc/passwd /etc/group /etc/shadow /etc/gshadow; do \
        if [ -L "$file" ]; then \
            cp -L "$file" "$file.tmp" \
            && rm "$file" \
            && mv "$file.tmp" "$file"; \
        fi; \
    done

COPY pid-shell.nix /etc/pid/pid-shell.nix

# The base image's /bin/sh is enough for initialization and maintenance.
RUN printf '%s:x:%s:%s::/home/%s:/bin/sh\n' \
        "${USER_NAME}" "${USER_UID}" "${USER_GID}" "${USER_NAME}" >> /etc/passwd \
    && printf '%s:x:%s:\n' "${USER_NAME}" "${USER_GID}" >> /etc/group \
    && printf '%s:!:19000:0:99999:7:::\n' "${USER_NAME}" >> /etc/shadow \
    && printf '%s:!::\n' "${USER_NAME}" >> /etc/gshadow \
    && mkdir -p /home/${USER_NAME} /workspace /etc/sudoers.d \
    && chown ${USER_UID}:${USER_GID} /home/${USER_NAME} /workspace \
    && printf '%s ALL=(ALL) NOPASSWD: ALL\n' "${USER_NAME}" > /etc/sudoers.d/${USER_NAME} \
    && chmod 0440 /etc/sudoers.d/${USER_NAME}

COPY pid-entrypoint /usr/local/bin/pid-entrypoint
COPY pid-nix-state.sh /etc/pid/nix-state.sh
RUN chmod 0755 /usr/local/bin/pid-entrypoint

RUN chown -R ${USER_UID}:${USER_GID} /nix
USER ${USER_NAME}

RUN set -eu; \
    . /etc/pid/nix-state.sh; \
    pid_nix_lock; \
    pid_nix_init build

WORKDIR /workspace

VOLUME ["/nix"]
ENTRYPOINT ["/usr/local/bin/pid-entrypoint"]
