os := $(shell uname -s)

ifeq ($(os),Darwin)
	app := zsh vim tmux starship git clang karabiner idea hammerspoon brew
endif

ifeq ($(os),Linux)
	app := zsh vim tmux starship git clang
endif

.PHONY: install
install:
	stow -t ~ $(app)
	if [ "$(os)" = "Darwin" ]; then \
		goku; \
	fi

.PHONY: uninstall
uninstall:
	stow -t ~ --delete $(app)
