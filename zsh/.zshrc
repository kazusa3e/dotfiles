# editor
export EDITOR=nvim
export LANGUAGE=en_US.UTF-8
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# vim mode
bindkey -v

# zplug
export ZPLUG_HOME=$HOME/.zplug
[ $(uname -s) = "Darwin" ] && export ZPLUG_HOME=/usr/local/opt/zplug
source $ZPLUG_HOME/init.zsh
zplug "zsh-users/zsh-completions"
zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-syntax-highlighting"
zplug "lib/completion", from:oh-my-zsh
if zplug check || zplug install; then
      zplug load
fi

# starship
eval "$(starship init zsh)"

# theme
if [[ -z "$USE_THEME" ]]; then
    export USE_THEME=dark
fi

# local bin
export PATH="/usr/local/bin:/usr/local/sbin:$PATH"
export PATH="$HOME/.local/bin:$PATH"

# coreutils
if [ $(uname -s) = "Darwin" ]; then
    export PATH="/usr/local/opt/coreutils/libexec/gnubin:$PATH"
fi

# brew
if [ $(uname -s) = "Darwin" ]; then
    export HOMEBREW_NO_AUTO_UPDATE=true
fi

# pipenv
export PIP_REQUIRE_VIRTUALENV=true
if [ $(uname -s) = "Darwin" ]; then
    export PATH="$(brew --prefix python)/bin:$PATH"
fi

# fzf
if [ $(uname -s) = "Darwin" ]; then
    eval "$(fzf --zsh)"
fi
if [ $(uname -s) = "Linux" ]; then
    [ -f /usr/share/fzf/key-bindings.zsh ] && source /usr/share/fzf/key-bindings.zsh
    [ -f /usr/share/fzf/completion.zsh ] && source /usr/share/fzf/completion.zsh
    [ -f $HOME/.fzf/shell/key-bindings.zsh ] && source $HOME/.fzf/shell/key-bindings.zsh
    [ -f $HOME/.fzf/shell/completion.zsh ] && source $HOME/.fzf/shell/completion.zsh
    [ -f $HOME/.fzf/bin/fzf ] && export PATH="$HOME/.fzf/bin:$PATH"
fi

# aliases
[ -f ~/.aliases ] && source ~/.aliases

# zoxide
eval "$(zoxide init zsh --cmd j)"

# gpg
export GPG_TTY=$TTY

# history
export HISTFILE="$HOME/.zsh_history"
export HISTSIZE=10000
export SAVEHIST=$HISTSIZE
setopt HIST_IGNORE_ALL_DUPS     # overwrite older history when dups occur
setopt INC_APPEND_HISTORY       # write history file immediately

# notify when a long-running command finishes
function notify() {
    local title="$1"
    local message="${2:-$1}"

    local seq="\e]777;notify;${title};${message}\a"

    if [ -n "$TMUX" ]; then
        local escaped_seq="${seq//\\e/\\e\\e}"
        printf "\ePtmux;\e%b\e\\" "$escaped_seq"
    else
        printf "%b" "$seq"
    fi
}
export NOTIFY_THRESHOLD=60

function _notif_preexec() {
    _notif_start_time=$SECONDS
    _notif_last_command=$1
}

function _format_duration() {
    local total=$1
    local h=$((total / 3600))
    local m=$(((total % 3600) / 60))
    local s=$((total % 60))
    local res=""
    [[ $h -gt 0 ]] && res+="${h}h"
    [[ $m -gt 0 ]] && res+="${m}m"
    [[ $s -gt 0 ]] && res+="${s}s"
    [[ -z $res ]] && res="0s"
    echo "$res"
}

function _notif_precmd() {
    if [[ -n $_notif_start_time ]]; then
        local end_time=$SECONDS
        local elapsed=$(( end_time - _notif_start_time ))
        if (( elapsed >= NOTIFY_THRESHOLD )); then
            local duration=$(_format_duration $elapsed)
            notify "Task Completed in ${duration}" "Command: $_notif_last_command"
        fi
        unset _notif_start_time
    fi
}

autoload -Uz add-zsh-hook
add-zsh-hook preexec _notif_preexec
add-zsh-hook precmd _notif_precmd

# rustup
if [ $(uname -s) = "Darwin" ]; then
    export PATH="/usr/local/opt/rustup/bin:$PATH"
fi
export PATH="$HOME/.cargo/bin:$PATH"

# man pager
export MANPAGER='nvim +Man!'

# <c-e> to edit this command here
autoload -z edit-command-line
zle -N edit-command-line
bindkey "^E" edit-command-line

if [ -f ~/.zshrc.local ]; then
    source ~/.zshrc.local
fi
