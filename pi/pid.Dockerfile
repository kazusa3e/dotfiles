FROM archlinux:base-devel

ARG USER_NAME=kazusa
ARG USER_UID=1000

ENV TERM=xterm-256color
ENV COLORTERM=truecolor

ENV EDITOR=vim
ENV VISUAL=vim

RUN sed -i '1iServer = https://mirrors.ustc.edu.cn/archlinux/$repo/os/$arch' \
    /etc/pacman.d/mirrorlist

RUN groupadd -g ${USER_UID} ${USER_NAME} \
    && useradd -m -u ${USER_UID} -g ${USER_UID} -s /bin/bash ${USER_NAME} \
    && mkdir -p /workspace && chown ${USER_UID}:${USER_UID} /workspace \
    && chmod 700 /workspace

RUN pacman -Syu --noconfirm --needed \
    sudo nodejs npm ripgrep fd git lynx ca-certificates vim \
    clang rust-analyzer gopls ty bash-language-server \
    && pacman -Scc --noconfirm

RUN echo 'ALL ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/nopasswd \
    && chmod 0440 /etc/sudoers.d/nopasswd

USER ${USER_NAME}

# RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

WORKDIR /tmp

RUN git clone https://aur.archlinux.org/pi-coding-agent.git \
    && ( cd pi-coding-agent && makepkg -si --noconfirm --needed ) \
    && rm -rf /tmp/pi-coding-agent

WORKDIR /workspace

ENTRYPOINT ["pi"]
