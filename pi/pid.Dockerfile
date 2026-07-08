FROM archlinux:base-devel

ENV TERM=xterm-256color
ENV COLORTERM=truecolor

RUN sed -i '1iServer = https://mirrors.ustc.edu.cn/archlinux/$repo/os/$arch' \
    /etc/pacman.d/mirrorlist

RUN mkdir -p /workspace && chmod 1777 /workspace

RUN pacman -Syu --noconfirm --needed \
    nodejs npm ripgrep fd git lynx ca-certificates \
    && pacman -Scc --noconfirm

RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

ENTRYPOINT ["pi"]
