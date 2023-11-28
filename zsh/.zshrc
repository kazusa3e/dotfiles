# editor
export EDITOR=lvim
export LANGUAGE="en_US.UTF-8"
export LC_ALL="en_US.UTF-8"

# vim mode
bindkey -v

# python
alias python="python3 $*"

# zplug
export ZPLUG_HOME=$HOME/.zplug
[ $(uname -s) = "Darwin" ] && export ZPLUG_HOME=/usr/local/opt/zplug
source $ZPLUG_HOME/init.zsh
zplug "zsh-users/zsh-completions"
zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-syntax-highlighting"
zplug "lib/completion", from:oh-my-zsh
zplug "MichaelAquilina/zsh-autoswitch-virtualenv"
if zplug check || zplug install; then
      zplug load
fi

# starship
eval "$(starship init zsh)"

# theme
export LS_COLORS="$(vivid generate ayu)"

# java home
# export JAVA_HOME=$(/usr/libexec/java_home)


# local bin
export PATH="/usr/local/bin:/usr/local/sbin:$PATH"
export PATH="$HOME/.local/bin:$PATH"
if [ $(uname -s) = "Darwin" ]; then
    export PATH="/usr/local/opt/coreutils/libexec/gnubin:$PATH"
fi

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
    [ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
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

# autojump
# if [ $(uname -s) = "Darwin" ]; then
#     [ -f /usr/local/etc/profile.d/autojump.sh ] && . /usr/local/etc/profile.d/autojump.sh
# fi
# if [ $(uname -s) = "Linux" ]; then
#     [[ -s $HOME/.autojump/etc/profile.d/autojump.sh ]] && source $HOME/.autojump/etc/profile.d/autojump.sh
#     autoload -U compinit && compinit -u
# fi

# zoxide
eval "$(zoxide init zsh --cmd j)"

# gpg
export GPG_TTY=$TTY

# history
export HISTFILE="$HOME/.zsh_history"
export HISTSIZE=10000
export SAVEHIST=$HISTSIZE
setopt HIST_IGNORE_ALL_DUPS     # overwrite older history when dups occur

# fix lost of last line without line break
unsetopt PROMPT_SP
precmd() { print "" }

# wiki notebook
[ $(uname -s) = "Darwin" ] && export ZK_NOTEBOOK_DIR="$HOME/wiki/"

# man pager
export MANPAGER='lvim +Man!'

# java
if [ $(uname -s) = "Darwin" ]; then
    export PATH="$(brew --prefix openjdk)/bin:$PATH"
    export JAVA_HOME="$(brew --prefix openjdk)/libexec"
fi
