FROM archlinux:base-devel

ENV TERM=xterm-256color
ENV COLORTERM=truecolor

ENV EDITOR=vim
ENV VISUAL=vim

RUN sed -i '1iServer = https://mirrors.ustc.edu.cn/archlinux/$repo/os/$arch' \
    /etc/pacman.d/mirrorlist

RUN mkdir -p /workspace && chmod 1777 /workspace

RUN pacman -Syu --noconfirm --needed \
    sudo nodejs npm ripgrep fd git lynx ca-certificates vim \
    clang rust-analyzer gopls ty bash-language-server \
    && pacman -Scc --noconfirm

RUN echo 'ALL ALL=(ALL) NOPASSWD: ALL' > /etc/sudoers.d/nopasswd \
    && chmod 0440 /etc/sudoers.d/nopasswd

RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

ENTRYPOINT ["pi"]
