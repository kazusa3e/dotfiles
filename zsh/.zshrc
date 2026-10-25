function try_source() {
    [ -f "$1" ] && source "$1"
}

function try_eval() {
    command -v "$1" >/dev/null && eval "$($@)"
}

function is_darwin() {
    [[ $(uname -s) = "Darwin" ]]
}

function is_linux() {
    [[ $(uname -s) = "Linux" ]]
}

# editor
export EDITOR=nvim
export VISUAL=nvim

# force true color
export COLORTERM=truecolor

# vim mode
bindkey -v

# Nix profiles
typeset -U path fpath
plugin_dirs=(/usr/share/zsh/plugins /usr/share)
for profile in ${=NIX_PROFILES} "$HOME/.nix-profile"; do
    [[ -d "$profile/share/zsh/site-functions" ]] && fpath=("$profile/share/zsh/site-functions" $fpath)
    plugin_dirs=("$profile/share" $plugin_dirs)
done
unset profile

# completions
autoload -Uz compinit
compinit

# starship
try_eval starship init zsh

# local bin
path=($HOME/.local/bin $path)

# pipenv
export PIP_REQUIRE_VIRTUALENV=true

# fzf
try_eval fzf --zsh

# zoxide
try_eval zoxide init zsh --cmd j

# history
export HISTFILE="$HOME/.zsh_history"
export HISTSIZE=10000
export SAVEHIST=$HISTSIZE
setopt EXTENDED_HISTORY                 # save timestamp of command in history
setopt HIST_IGNORE_ALL_DUPS             # overwrite older history when dups occur
setopt HIST_IGNORE_SPACE                # ignore commands that start with space
setopt HIST_REDUCE_BLANKS               # remove superfluous blanks before recording entry
setopt SHARE_HISTORY                    # share history across all sessions
setopt INC_APPEND_HISTORY_TIME          # append history with timestamp

# npm
path=($HOME/.local/share/npm-global/bin $path)

# podman
if is_linux && [[ -z ${DOCKER_HOST:-} && -S ${XDG_RUNTIME_DIR:-/run/user/$UID}/podman/podman.sock ]]; then
    export DOCKER_HOST="unix://${XDG_RUNTIME_DIR:-/run/user/$UID}/podman/podman.sock"
fi

# <c-g> to edit this command here
autoload -z edit-command-line
zle -N edit-command-line
bindkey "^G" edit-command-line

# mandoc
export MANPAGER='nvim +Man!'

# aliases
try_source ~/.aliases

# local config
try_source ~/.zshrc.local

# envrc
try_eval direnv hook zsh

# Load plugins after widgets and hooks have been configured.
for share in $plugin_dirs; do
    (( $+functions[_zsh_autosuggest_start] )) || try_source "$share/zsh-autosuggestions/zsh-autosuggestions.zsh"
    (( $+functions[_zsh_highlight] )) || try_source "$share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
done
unset share plugin_dirs
