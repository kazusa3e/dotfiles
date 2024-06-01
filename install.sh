#!/usr/bin/env sh

M_USER=kazusa
M_UID=1000
# M_GID=1000
DOTFILES_REPO="https://github.com/kazusa3e/dotfiles"

# arguments:
#   none
# returns:
#   "macos" | "alpine" | "archlinux" | "ubuntu" | "unknown"
detect_os() {
    OS=$(uname -s)
    case "$OS" in
        Darwin)
            echo "macos"
            ;;
        Linux)
            if [ -f /etc/alpine-release ]; then
                echo "alpine"
            elif [ -f /etc/arch-release ]; then
                echo "archlinux"
            elif [ -f /etc/lsb-release ]; then
                echo "ubuntu"
            else
                echo "unknown"
            fi
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# arguments:
#   none
# returns:
# 1 if current user is root, 0 otherwise.
is_root() {
    if [ "$(id -u)" -eq 0 ]; then
        echo 1
    else
        echo 0
    fi
}

# arguments:
#   $1 - uid
# returns:
#   "username", with correspond uid | "", if uid not exists
detect_user() {
    user=$(getent passwd "$1" | cut -d: -f1)
    echo "$user"
}

create_user() {
    is_root=$(is_root)
    old_user=$(detect_user "$M_UID")
    os=$(detect_os)

    if [ "$os" = "macos" ]; then
        return
    fi

    if [ "$is_root" -eq 0 ]; then
        return
    fi

    case "$os" in
        "archlinux" | "ubuntu")
            if [ -n "$old_user" ]; then
                usermod -d /home/"$M_USER" -m -l "$M_USER" "$old_user"
            else
                useradd -m -u "$M_UID" "$M_USER"
            fi
            ;;
        "alpine")
            if [ -n "$old_user" ]; then
                deluser --remove-home "$old_user"
                adduser -S -s /bin/sh -u "$M_UID" "$M_USER"
            else
                adduser -S -s /bin/sh -u "$M_UID" "$M_USER"
            fi
            ;;
        *)
            echo "Unsupported OS: $os"
            exit 1
            ;;
    esac
}


install_macos_deps() {
    echo "TODO: Install macOS dependencies"
}

install_archlinux_deps() {

    script=$(cat <<EOF
    git clone $DOTFILES_REPO /home/$M_USER/dotfiles
    git clone https://github.com/zplug/zplug /home/$M_USER/.zplug
    git clone https://github.com/tmux-plugins/tpm /home/$M_USER/.tmux/plugins/tpm
    make -C /home/$M_USER/dotfiles install
EOF
)

    if [ "$(id -u)" -eq 0 ]; then
        sed -i /etc/locale.gen -e 's/#en_US.UTF-8 UTF-8/en_US.UTF-8 UTF-8/'
        locale-gen
        pacman -Syu --noconfirm
        pacman -S --noconfirm zsh vim tmux starship git stow make vivid zoxide eza fzf
        su - $M_USER -c "$script"
        chsh -s /bin/zsh $M_USER
    else
        sudo pacman -Syu --noconfirm
        sudo pacman -S --noconfirm zsh vim tmux starship git stow make vivid zoxide eza fzf
        sh -c "$script"
        sudo chsh -s /bin/zsh $M_USER
    fi
}


install_alpine_deps() {

    script=$(cat <<EOF
    git clone $DOTFILES_REPO /home/$M_USER/dotfiles
    git clone https://github.com/zplug/zplug /home/$M_USER/.zplug
    git clone https://github.com/tmux-plugins/tpm /home/$M_USER/.tmux/plugins/tpm
    make -C /home/$M_USER/dotfiles install
EOF
)

    if [ "$(id -u)" -eq 0 ]; then
        apk update
        # TODO: vivid
        apk add --no-cache tzdata zsh vim tmux starship git stow make zoxide fzf shadow wget

        wget -c https://github.com/eza-community/eza/releases/latest/download/eza_x86_64-unknown-linux-gnu.tar.gz -O - | tar xz
        chmod +x eza
        chown root:root eza
        mv eza /usr/local/bin/eza

        su - $M_USER -c "$script"
        usermod -s /bin/zsh $M_USER
    else
        sudo apk update
        # TODO: vivid
        sudo apk add --no-cache tzdata zsh vim tmux starship git stow make zoxide fzf shadow wget

        wget -c https://github.com/eza-community/eza/releases/latest/download/eza_x86_64-unknown-linux-gnu.tar.gz -O - | tar xz
        sudo chmod +x eza
        sudo chown root:root eza
        sudo mv eza /usr/local/bin/eza

        sh -c "$script"
        sudo usermod -s /bin/zsh $M_USER
    fi
}

install_ubuntu_deps() {

    script=$(cat <<EOF
    git clone $DOTFILES_REPO /home/$M_USER/dotfiles
    git clone https://github.com/zplug/zplug /home/$M_USER/.zplug
    git clone https://github.com/tmux-plugins/tpm /home/$M_USER/.tmux/plugins/tpm
    make -C /home/$M_USER/dotfiles install
EOF
)

    if [ "$(id -u)" -eq 0 ]; then
        apt update
        # TODO: eza
        DEBIAN_FRONTEND=noninteractive TZ=Asia/Taipei apt-get -y install tzdata
        apt install -y zsh vim tmux git stow make vivid zoxide fzf curl gpg
        curl -sS https://starship.rs/install.sh | sh -s -- -y
        su - $M_USER -c "$script"
        chsh -s /bin/zsh $M_USER
    else
        sudo apt update
        # TODO: eza
        DEBIAN_FRONTEND=noninteractive TZ=Asia/Taipei sudo apt-get -y install tzdata
        sudo apt install -y zsh vim tmux git stow make vivid zoxide fzf curl gpg
        curl -sS https://starship.rs/install.sh | sudo sh -s -- -y
        sh -c "$script"
        sudo chsh -s /bin/zsh $M_USER
    fi
}

install_deps() {
    os=$(detect_os)
    case "$os" in
        "archlinux")
            install_archlinux_deps
            ;;
        "alpine")
            install_alpine_deps
            ;;
        "ubuntu")
            install_ubuntu_deps
            ;;
        "macos")
            install_macos_deps
            ;;
        *)
            echo "Unsupported OS: $os"
            exit 1
            ;;
    esac
}

create_user
install_deps
