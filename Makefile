os := $(shell uname -s)

ifeq ($(os),Darwin)
	app := zsh tmux git starship vim gh hammerspoon karabiner idea lunarvim clang
endif

ifeq ($(os),Linux)
	app := zsh tmux git starship vim gh idea lunarvim clang
endif

.PHONY: install
install:
	stow -t ~ $(app)

.PHONY: uninstall
uninstall:
	stow -t ~ --delete $(app)
