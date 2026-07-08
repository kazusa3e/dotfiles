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

# vim mode
bindkey -v

# completions
autoload -Uz compinit
compinit

# starship
try_eval starship init zsh

if is_linux; then
    try_source /usr/share/zsh/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
    try_source /usr/share/zsh/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
elif is_darwin; then
    try_source /usr/local/share/zsh-autosuggestions/zsh-autosuggestions.zsh
    try_source /usr/local/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
fi

# local bin
export PATH="$HOME/.local/bin:$PATH"

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
export PATH="$HOME/.local/share/npm-global/bin:$PATH"

# <c-g> to edit this command here
autoload -z edit-command-line
zle -N edit-command-line
bindkey "^G" edit-command-line

# aliases
try_source ~/.aliases

# local config
try_source ~/.zshrc.local
